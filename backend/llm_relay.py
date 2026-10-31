"""Local LLM Guard: an observe-only relay in front of a local Ollama server.

Usage:
    python llm_relay.py                     # listens on 127.0.0.1:11435
    set OLLAMA_HOST=127.0.0.1:11435         # (Windows) opt a client in; macOS/Linux: export ...

Local LLM traffic is plain HTTP on localhost, so the prompt is already plaintext here:
no TLS, no certificates, nothing decrypted. For POST /api/generate, /api/chat and
/v1/chat/completions the relay identifies the calling process (psutil, by the client's
source port), sends the body to ShadowGuard's /api/ingest as an ai_request event, and
then forwards the request unchanged, streaming the response back as it arrives.
Everything else is passed through untouched.

Observe only: requests are never blocked or modified, and request bodies are never
logged or written to disk (the backend redacts them before anything is stored).

Environment:
    OLLAMA_UPSTREAM   where Ollama listens (default http://127.0.0.1:11434)
    RELAY_PORT        port to listen on (default 11435)
    INGEST_URL        ShadowGuard ingest (default http://127.0.0.1:8000/api/ingest)
"""

import http.client
import itertools
import json
import logging
import os
import sys
import time
from datetime import UTC, datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

import psutil  # noqa: E402
import requests  # noqa: E402
from logging_setup import setup_logging  # noqa: E402

HOST = "127.0.0.1"  # local only, never 0.0.0.0
PORT = int(os.environ.get("RELAY_PORT", "11435"))
UPSTREAM = urlsplit(os.environ.get("OLLAMA_UPSTREAM", "http://127.0.0.1:11434"))
INGEST_URL = os.environ.get("INGEST_URL", "http://127.0.0.1:8000/api/ingest")
SCANNED_PATHS = {"/api/generate", "/api/chat", "/v1/chat/completions"}
UPSTREAM_TIMEOUT = 600  # generation can be slow on CPU; this is per socket read
HOP_BY_HOP = {"connection", "keep-alive", "proxy-connection", "transfer-encoding", "te",
              "trailer", "upgrade", "content-length", "host"}

_counter = itertools.count(1)


log = logging.getLogger("shadowguard.relay")


def identify_client(client_port: int) -> tuple[str, int | None]:
    """(process name, pid) of the local process whose socket uses client_port."""
    try:
        for conn in psutil.net_connections(kind="tcp"):
            if (conn.pid and conn.laddr and conn.raddr
                    and conn.laddr.port == client_port and conn.raddr.port == PORT):
                try:
                    return psutil.Process(conn.pid).name(), conn.pid
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    return "unknown-client", conn.pid
    except (psutil.AccessDenied, OSError):
        pass
    return "unknown-client", None


def report(path: str, body: bytes, client_port: int) -> None:
    """Send the request to ShadowGuard as an ai_request. Never raises, never logs the body."""
    source, pid = identify_client(client_port)
    now = datetime.now(UTC)
    event = {
        "event_id": f"relay_{int(time.time() * 1000)}_{next(_counter)}",
        "timestamp": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": source,
        "event_type": "ai_request",
        "pid": pid,
        "destination": "localhost",
        "dst_port": 11434,
        "path": path,
        "session_id": f"relay:{pid if pid is not None else 'unknown'}",
        "payload_visible": True,
        "payload": body.decode("utf-8", errors="replace"),
    }
    try:
        resp = requests.post(INGEST_URL, json=[event], timeout=10)
        resp.raise_for_status()
        result = resp.json()
        log.info(f"scanned {path} from {source} (pid {pid}): {len(body)} bytes, "
            f"incidents in session: {result.get('incidents', 0)}")
    except (requests.RequestException, ValueError) as exc:
        log.warning(f"could not reach ShadowGuard ingest ({type(exc).__name__}); "
            f"forwarding {path} from {source} anyway")


class RelayHandler(BaseHTTPRequestHandler):
    """Observe-only HTTP handler: report scanned requests, then forward everything."""
    protocol_version = "HTTP/1.1"
    server_version = "ShadowGuardRelay"

    def log_message(self, format, *args):  # request lines only (method, path, status)
        """Log the request line only (method, path, status), never the body."""
        log.info(f"{self.command} {self.path.split('?')[0]} -> {args[1] if len(args) > 1 else '?'}")

    def read_body(self) -> bytes:
        """Read the request body (Content-Length or chunked)."""
        if "chunked" in self.headers.get("Transfer-Encoding", "").lower():
            chunks = []
            while True:
                size = int(self.rfile.readline().split(b";")[0].strip() or b"0", 16)
                if size == 0:
                    while self.rfile.readline() not in (b"\r\n", b"\n", b""):
                        pass  # trailers
                    break
                chunks.append(self.rfile.read(size))
                self.rfile.readline()  # CRLF after each chunk
            return b"".join(chunks)
        length = int(self.headers.get("Content-Length") or 0)
        return self.rfile.read(length) if length else b""

    def send_json(self, status: int, payload: dict) -> None:
        """Send a small JSON response and close the connection."""
        data = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Connection", "close")
        self.end_headers()
        self.wfile.write(data)
        self.close_connection = True

    def handle_any(self) -> None:
        """Report scanned paths to ShadowGuard, then forward to Ollama and stream back."""
        body = self.read_body()
        path = self.path.split("?")[0]
        scanned = self.command == "POST" and path in SCANNED_PATHS
        if scanned and body:
            report(path, body, self.client_address[1])

        headers = {k: v for k, v in self.headers.items() if k.lower() not in HOP_BY_HOP}
        headers["Host"] = UPSTREAM.netloc
        if body or self.command in ("POST", "PUT", "PATCH"):
            headers["Content-Length"] = str(len(body))
        upstream = http.client.HTTPConnection(UPSTREAM.hostname, UPSTREAM.port or 80, timeout=UPSTREAM_TIMEOUT)
        try:
            upstream.request(self.command, self.path, body=body or None, headers=headers)
            resp = upstream.getresponse()
        except OSError:
            upstream.close()
            message = "Ollama not reachable; request was still scanned by ShadowGuard" if scanned \
                else f"Ollama not reachable at {UPSTREAM.netloc}"
            self.send_json(502, {"error": message})
            return

        try:
            self.send_response_only(resp.status, resp.reason)
            self.log_request(resp.status)
            for key, value in resp.getheaders():
                if key.lower() not in HOP_BY_HOP:
                    self.send_header(key, value)
            length = resp.getheader("Content-Length")
            chunked = length is None and self.command != "HEAD" and resp.status not in (204, 304)
            if length is not None:
                self.send_header("Content-Length", length)
            elif chunked:
                self.send_header("Transfer-Encoding", "chunked")
            self.send_header("Connection", "close")
            self.end_headers()
            # Stream as it arrives: Ollama sends one NDJSON line per token batch.
            while True:
                data = resp.read1(65536)
                if not data:
                    break
                if chunked:
                    self.wfile.write(b"%x\r\n%s\r\n" % (len(data), data))
                else:
                    self.wfile.write(data)
                self.wfile.flush()
            if chunked:
                self.wfile.write(b"0\r\n\r\n")
                self.wfile.flush()
        except (ConnectionError, OSError):
            pass  # client went away mid-stream
        finally:
            upstream.close()
            self.close_connection = True

    do_GET = do_POST = do_PUT = do_PATCH = do_DELETE = do_HEAD = do_OPTIONS = handle_any


def main() -> None:
    """Run the relay until Ctrl+C."""
    setup_logging()
    server = ThreadingHTTPServer((HOST, PORT), RelayHandler)
    server.daemon_threads = True
    log.info(f"Local LLM Guard listening on http://{HOST}:{PORT} -> Ollama at {UPSTREAM.geturl()}")
    log.info(f"Opt a client in with OLLAMA_HOST={HOST}:{PORT}. Observe only: nothing is blocked or modified.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log.info("stopped")


if __name__ == "__main__":
    main()
