"""Send a JSONL file of raw events to the ShadowGuard AI ingest endpoint.

Usage: python load_demo.py ../demo_data/scenario_a.jsonl
"""

import json
import sys

import requests

INGEST_URL = "http://127.0.0.1:8000/api/ingest"


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit("Usage: python load_demo.py <file.jsonl>")

    events = []
    with open(sys.argv[1], encoding="utf-8") as f:
        for line in f:
            if line.strip():
                events.append(json.loads(line))

    response = requests.post(INGEST_URL, json=events, timeout=30)
    print(f"Status: {response.status_code}")
    print(response.text)


if __name__ == "__main__":
    main()
