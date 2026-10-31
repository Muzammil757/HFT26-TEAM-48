"""Send two prompts through the Local LLM Guard relay (llm_relay.py) to /api/generate.

Usage:
    python relay_demo.py                    # relay at 127.0.0.1:11435, model llama3.2:1b
    set OLLAMA_MODEL=llama3:8b              # (Windows) any model you have pulled

1. A clean coding question.
2. A prompt with a fake AWS key (AKIAIOSFODNN7EXAMPLE) and a fake, Verhoeff-valid
   Aadhaar number.

Both reach ShadowGuard as real plaintext ai_request events from this python process.
Ollama does not need to be installed: without it the relay answers 502, but the
prompt has already been scanned, so the leak prompt still raises an incident.
All values are fake.
"""

import json
import os
import sys
import time

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

import requests  # noqa: E402

RELAY_URL = os.environ.get("RELAY_URL", "http://127.0.0.1:11435")
MODEL = os.environ.get("OLLAMA_MODEL", "llama3.2:1b")

PROMPTS = [
    ("clean", "Write a Python function that reverses a string."),
    ("leak", "Why does my deploy fail? AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE "
             "and the customer's Aadhaar is 3043 3218 1964."),
]


def main() -> None:
    """Send the clean and the leaking prompt through the relay and print the responses."""
    print(f"Sending {len(PROMPTS)} prompts through {RELAY_URL}/api/generate (model {MODEL})\n")
    for label, prompt in PROMPTS:
        try:
            resp = requests.post(f"{RELAY_URL}/api/generate",
                                 json={"model": MODEL, "prompt": prompt, "stream": True},
                                 stream=True, timeout=(5, 300))
        except requests.ConnectionError:
            sys.exit(f"Relay not reachable at {RELAY_URL}. Start it with: python llm_relay.py")
        print(f"[{label}] relay status {resp.status_code}")
        if resp.status_code == 200:
            answer, lines = [], 0
            for line in resp.iter_lines():
                if line:
                    lines += 1
                    answer.append(json.loads(line).get("response", ""))
            print(f"    {lines} streamed lines; answer starts: {''.join(answer)[:80]!r}")
        else:
            print(f"    {resp.text.strip()[:200]}")
        time.sleep(1)
    print("\nCheck the dashboard: the leak prompt appears as an incident from this python process to Ollama.")


if __name__ == "__main__":
    main()
