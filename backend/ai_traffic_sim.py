"""ShadowGuard AI - Synthetic AI Network Traffic Simulator.

Generates realistic network traffic to test the passive collector:
1. Calls http://localhost:11434/api/generate if Ollama is running.
2. Opens plain TCP sockets (no API keys, no HTTP payloads) to:
   - api.openai.com:443
   - api-inference.huggingface.co:443 (or huggingface.co:443 if subdomain DNS is deprecated)
   held open for ~10 seconds.
"""

import os
import socket
import sys
import time
import urllib.error
import urllib.request
import json


def probe_ollama(timeout: float = 1.0) -> None:
    """Send an Ollama test request if Ollama is running locally."""
    url = "http://localhost:11434/api/generate"
    print(f"[*] Probing Ollama at {url}...")

    # Fast TCP port probe to avoid waiting for HTTP timeout if service is down
    probe_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    probe_sock.settimeout(0.3)
    try:
        probe_sock.connect(("127.0.0.1", 11434))
        probe_sock.close()
    except Exception:
        print("    [-] Ollama is not active on localhost:11434 (port closed). Skipping local LLM call.")
        return

    req_body = json.dumps({
        "model": "llama3",
        "prompt": "ShadowGuard AI live collector traffic test.",
    }).encode("utf-8")

    req = urllib.request.Request(
        url,
        data=req_body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            print(f"    [+] Ollama is UP! Response status: {resp.status}")
    except urllib.error.URLError as e:
        print(f"    [-] Ollama request failed: {e.reason}. Skipping local LLM call.")
    except Exception as e:
        print(f"    [-] Ollama probe failed: {e}. Skipping local LLM call.")


def open_tcp_socket(host: str, port: int = 443, fallback_host: str | None = None) -> socket.socket | None:
    """Open a plain TCP socket to a remote host and port (no HTTP, no TLS handshakes)."""
    target = host
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(5.0)

    try:
        s.connect((target, port))
        l_ip, l_port = s.getsockname()
        r_ip, r_port = s.getpeername()
        print(f"    [+] Connected socket to {target}:{port} ({r_ip}:{r_port}) from local port {l_port}")
        return s
    except Exception as e:
        print(f"    [-] Direct connection to {target}:{port} failed: {e}")
        if fallback_host:
            print(f"    [*] Attempting fallback to {fallback_host}:{port}...")
            try:
                s.close()
                s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                s.settimeout(5.0)
                s.connect((fallback_host, port))
                l_ip, l_port = s.getsockname()
                r_ip, r_port = s.getpeername()
                print(f"    [+] Fallback connected socket to {fallback_host}:{port} ({r_ip}:{r_port}) from local port {l_port}")
                return s
            except Exception as e2:
                print(f"    [-] Fallback to {fallback_host}:{port} failed: {e2}")
        s.close()
        return None


def run_simulation(hold_seconds: float = 10.0) -> None:
    """Run the traffic simulation holding sockets open for the specified duration."""
    pid = os.getpid()
    print("=" * 70)
    print(" SHADOWGUARD AI - TRAFFIC SIMULATOR")
    print(f" Process: python.exe (PID: {pid})")
    print("=" * 70 + "\n")

    # 1. Local LLM test
    probe_ollama()
    print()

    # 2. Outbound AI provider plain TCP sockets
    print("[*] Opening plain TCP sockets to AI cloud endpoints...")
    sockets: list[socket.socket] = []

    # OpenAI socket
    s_openai = open_tcp_socket("api.openai.com", 443)
    if s_openai:
        sockets.append(s_openai)

    # Hugging Face socket
    s_hf = open_tcp_socket(
        "api-inference.huggingface.co",
        443,
        fallback_host="huggingface.co",
    )
    if s_hf:
        sockets.append(s_hf)

    if not sockets:
        print("[!] No sockets could be established. Please check network connectivity.")
        return

    print(f"\n[*] Holding {len(sockets)} TCP sockets open for ~{hold_seconds} seconds...")
    try:
        # Tick every second
        for remaining in range(int(hold_seconds), 0, -1):
            sys.stdout.write(f"\r    --> Holding connections active... {remaining}s remaining")
            sys.stdout.flush()
            time.sleep(1.0)
        print("\r    --> Holding connections active... Complete!       ")
    finally:
        print("\n[*] Closing all sockets...")
        for s in sockets:
            try:
                s.close()
            except Exception:
                pass
        print("    [+] All sockets closed cleanly.")

    print("\n=" * 70)
    print(" Traffic simulation completed.")
    print("=" * 70)


def main() -> None:
    run_simulation(hold_seconds=10.0)


if __name__ == "__main__":
    main()
