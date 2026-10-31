"""ShadowGuard AI - Synthetic AI Network Traffic Simulator.

Generates live AI traffic to give collector.py real connections to detect:
1. Calls http://localhost:11434/api/generate with a small prompt if Ollama is running,
   else prints "Ollama not running, skipping".
2. Opens plain TCP sockets (no HTTP, no keys) to api.openai.com:443 and
   huggingface.co:443 and holds them open for 10 seconds.
Uses only Python standard library + requests.
"""

import os
import socket
import sys
import time

import requests

OLLAMA_GENERATE_URL = "http://localhost:11434/api/generate"


def probe_ollama(timeout: float = 1.0) -> None:
    """Send a small prompt to Ollama if running, else print 'Ollama not running, skipping'."""
    payload = {
        "model": "llama3",
        "prompt": "Hello from ShadowGuard AI simulation",
    }
    try:
        resp = requests.post(OLLAMA_GENERATE_URL, json=payload, timeout=timeout)
        print(f"[+] Ollama responded: status {resp.status_code}")
    except requests.exceptions.RequestException:
        print("Ollama not running, skipping")


def open_tcp_socket(host: str, port: int = 443, fallback_host: str | None = None) -> socket.socket | None:
    """Open a plain TCP socket (no HTTP, no TLS handshakes, no API keys)."""
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(5.0)

    target = host
    try:
        s.connect((target, port))
        l_ip, l_port = s.getsockname()
        r_ip, r_port = s.getpeername()
        print(f"  [+] TCP socket connected to {target}:{port} ({r_ip}:{r_port}) from local port {l_port}")
        return s
    except Exception as e:
        print(f"  [-] Connection to {target}:{port} failed: {e}")
        if fallback_host:
            try:
                s.close()
                s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                s.settimeout(5.0)
                s.connect((fallback_host, port))
                l_ip, l_port = s.getsockname()
                r_ip, r_port = s.getpeername()
                print(f"  [+] Fallback TCP socket connected to {fallback_host}:{port} ({r_ip}:{r_port}) from local port {l_port}")
                return s
            except Exception as e2:
                print(f"  [-] Fallback to {fallback_host}:{port} failed: {e2}")
        s.close()
        return None


def run_simulation(hold_seconds: float = 10.0) -> None:
    """Run the traffic simulation holding sockets open for the specified duration."""
    pid = os.getpid()
    print("=" * 70)
    print(" SHADOWGUARD AI - TRAFFIC SIMULATOR")
    print(f" Process: python.exe (PID: {pid})")
    print("=" * 70 + "\n")

    # (1) Ollama check & prompt
    print("[1] Checking local Ollama instance...")
    probe_ollama()
    print()

    # (2) Plain TCP sockets (no HTTP, no keys) held for 10 seconds
    print("[2] Opening plain TCP sockets (no HTTP, no keys)...")
    sockets: list[socket.socket] = []

    # OpenAI socket
    s_openai = open_tcp_socket("api.openai.com", 443)
    if s_openai:
        sockets.append(s_openai)

    # Hugging Face socket (prefer huggingface.co directly)
    s_hf = open_tcp_socket(
        "huggingface.co",
        443,
        fallback_host="api-inference.huggingface.co",
    )
    if s_hf:
        sockets.append(s_hf)

    if not sockets:
        print("\n[!] No sockets could be established. Check network connection.")
        return

    print(f"\n[*] Holding {len(sockets)} TCP sockets open for {int(hold_seconds)} seconds...")
    try:
        for remaining in range(int(hold_seconds), 0, -1):
            sys.stdout.write(f"\r    --> Connections active... {remaining}s remaining")
            sys.stdout.flush()
            time.sleep(1.0)
        print("\r    --> Connections active... 10 seconds elapsed.      ")
    finally:
        print("\n[*] Closing sockets...")
        for s in sockets:
            try:
                s.close()
            except Exception:
                pass
        print("  [+] Sockets closed cleanly.")

    print("\n" + "=" * 70)
    print(" Traffic simulation completed.")
    print("=" * 70)


def main() -> None:
    """Open real connections to AI providers so the collector has traffic to detect."""
    run_simulation(hold_seconds=10.0)


if __name__ == "__main__":
    main()
