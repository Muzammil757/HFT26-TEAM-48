"""ShadowGuard AI - Non-invasive Live Network Connection Collector.

Passively monitors active network connections using psutil to detect processes
connecting to known AI providers or local LLM instances (Ollama on 11434, LM Studio on 1234).
No SSL decryption, no packet inspection: inspects connection metadata only.
"""

import socket
import threading
import time
from datetime import datetime, timezone
from typing import Any, Callable

try:
    import psutil
except ImportError:
    psutil = None

# Section 7: Known AI provider hosts and ports
KNOWN_AI_HOSTS = [
    "api.openai.com",
    "api.anthropic.com",
    "api-inference.huggingface.co",
    "huggingface.co",
    "api.featherless.ai",
    "generativelanguage.googleapis.com",
]
LOCAL_AI_PORTS = {11434, 1234}

# Caches for fast, non-blocking resolution
_dns_cache: dict[str, str] = {}
_ip_to_known_host: dict[str, str] = {}
_last_forward_resolve = 0.0


def _refresh_known_ip_cache() -> None:
    """Resolve known hostnames to their IP addresses to identify outbound connections even without reverse DNS PTR."""
    global _last_forward_resolve
    now = time.time()
    if now - _last_forward_resolve < 300.0:  # Refresh every 5 minutes
        return
    _last_forward_resolve = now
    for host in KNOWN_AI_HOSTS:
        try:
            addr_info = socket.getaddrinfo(host, 443, family=socket.AF_INET)
            for item in addr_info:
                ip = item[4][0]
                _ip_to_known_host[ip] = host
        except Exception:
            pass


def _resolve_remote_host(ip: str) -> str:
    """Get the hostname for an IP address using cached forward/reverse resolution.
    Non-blocking: if not cached, launches a daemon worker and returns IP immediately."""
    if ip in ("127.0.0.1", "::1", "0.0.0.0"):
        return "localhost"
    if ip in _ip_to_known_host:
        return _ip_to_known_host[ip]
    if ip in _dns_cache:
        return _dns_cache[ip]

    # Initialize cache with IP and asynchronously resolve in background
    _dns_cache[ip] = ip

    def _async_resolve(target_ip: str) -> None:
        try:
            resolved = socket.gethostbyaddr(target_ip)[0]
            _dns_cache[target_ip] = resolved
        except Exception:
            pass

    threading.Thread(target=_async_resolve, args=(ip,), daemon=True).start()
    return ip


def _matches_ai_provider(r_ip: str, r_port: int) -> tuple[bool, str]:
    """Check if the connection matches any Section 7 provider by port, IP, or reverse DNS."""
    # 1. Local AI services (Ollama on 11434, LM Studio on 1234)
    if r_port in LOCAL_AI_PORTS:
        return True, "localhost"

    # Only port 443 is used for cloud AI providers in Section 7
    if r_port != 443:
        return False, r_ip

    # 2. Fast check: IP is in pre-resolved known provider IP cache
    if r_ip in _ip_to_known_host:
        return True, _ip_to_known_host[r_ip]

    # 3. Cached reverse DNS check
    host = _resolve_remote_host(r_ip)
    lower_host = host.lower()
    for known in KNOWN_AI_HOSTS:
        if lower_host == known or lower_host.endswith("." + known):
            return True, known

    return False, host


def _collector_loop(
    ingest_fn: Callable[[list[dict]], Any],
    interval: float,
    stop_event: threading.Event | None = None,
) -> None:
    """Collector loop running in a background daemon thread."""
    if psutil is None:
        print("[collector] ERROR: psutil is not installed.")
        return

    seen_connections: set[tuple[int | None, str, int]] = set()

    # Initial resolution of known AI host IPs
    _refresh_known_ip_cache()

    while stop_event is None or not stop_event.is_set():
        try:
            _refresh_known_ip_cache()
            connections = psutil.net_connections(kind="inet")
        except psutil.AccessDenied:
            # On Windows/Linux, AccessDenied may occur if unprivileged; wait and retry
            time.sleep(interval)
            continue
        except Exception as e:
            print(f"[collector] Error fetching connections: {e}")
            time.sleep(interval)
            continue

        for conn in connections:
            if not conn.raddr:
                continue

            # Skip closed sockets in TIME_WAIT or without PID on Windows
            if conn.status == "TIME_WAIT" or conn.pid == 0:
                continue

            r_ip = conn.raddr.ip
            r_port = conn.raddr.port
            pid = conn.pid

            # Check if this connection targets a Section 7 AI provider
            is_ai, destination = _matches_ai_provider(r_ip, r_port)
            if not is_ai:
                continue

            # Deduplicate by (pid, remote_ip, remote_port)
            conn_key = (pid, r_ip, r_port)
            if conn_key in seen_connections:
                continue
            seen_connections.add(conn_key)

            # Retrieve process name
            source_name = "unknown"
            if pid:
                try:
                    proc = psutil.Process(pid)
                    source_name = proc.name()
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    source_name = "unknown"
                except Exception:
                    source_name = "unknown"

            # Clean IP for event_id
            clean_ip = r_ip.replace(".", "").replace(":", "")
            event_id = f"live_{pid}_{clean_ip}_{r_port}"
            now_utc = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

            event = {
                "event_id": event_id,
                "timestamp": now_utc,
                "source": source_name,
                "event_type": "connection",
                "pid": pid,
                "destination": destination,
                "dst_port": r_port,
                "path": None,
                "session_id": None,
                "payload_visible": False,
                "payload": None,
            }

            try:
                ingest_fn([event])
            except Exception as e:
                print(f"[collector] Error invoking ingest_fn: {e}")

        if stop_event is not None:
            stop_event.wait(interval)
        else:
            time.sleep(interval)


def start_collector(
    ingest_fn: Callable[[list[dict]], Any],
    interval: float = 3.0,
    stop_event: threading.Event | None = None,
) -> threading.Thread:
    """Start the passive network connection collector daemon thread.

    Args:
        ingest_fn: Callback accepting a list of RawEvent dicts, e.g. ingest_fn([event]).
        interval: Polling frequency in seconds (default: 3.0s).
        stop_event: Optional threading.Event to cleanly terminate the loop.

    Returns:
        The started daemon Thread.
    """
    t = threading.Thread(
        target=_collector_loop,
        args=(ingest_fn, interval, stop_event),
        daemon=True,
        name="ShadowGuardCollectorThread",
    )
    t.start()
    return t


if __name__ == "__main__":
    print("=" * 70)
    print(" ShadowGuard AI - Passive Network Connection Collector (Standalone)")
    print(" Press Ctrl+C to stop.")
    print("=" * 70)

    def print_ingest(events: list[dict]) -> None:
        for ev in events:
            print(f"[EVENT] ID: {ev['event_id']}")
            print(f"        Time:        {ev['timestamp']}")
            print(f"        Process:     {ev['source']} (PID: {ev['pid']})")
            print(f"        Type:        {ev['event_type']}")
            print(f"        Destination: {ev['destination']}:{ev['dst_port']}")
            print("-" * 50)

    stop_evt = threading.Event()
    collector_thread = start_collector(ingest_fn=print_ingest, interval=3.0, stop_event=stop_evt)

    try:
        while True:
            time.sleep(1.0)
    except KeyboardInterrupt:
        print("\nStopping collector...")
        stop_evt.set()
        collector_thread.join(timeout=2.0)
        print("Collector stopped.")
