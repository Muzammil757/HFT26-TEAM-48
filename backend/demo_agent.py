"""ShadowGuard AI - Hero Scenario Live Demo Replay Agent.

Reads ../demo_data/05_agent_chain.jsonl and POSTs one event every 3 seconds to
http://127.0.0.1:8000/api/ingest (body = JSON list containing that one event),
rewriting each timestamp to current UTC time (ISO with Z).
Uses only requests + Python standard library.
"""

import json
import sys
import time
from datetime import UTC, datetime
from pathlib import Path

import requests

INGEST_URL = "http://127.0.0.1:8000/api/ingest"
HEALTH_URL = "http://127.0.0.1:8000/api/incidents"
DEFAULT_DATA_PATH = Path(__file__).resolve().parent.parent / "demo_data" / "05_agent_chain.jsonl"


def check_backend_running() -> bool:
    """Check if the backend server is reachable on http://127.0.0.1:8000."""
    try:
        resp = requests.get(HEALTH_URL, timeout=1.5)
        return resp.status_code == 200
    except requests.exceptions.RequestException:
        return False


def load_events(filepath: Path) -> list[dict]:
    """Load JSONL events from the specified path."""
    if not filepath.exists():
        # Also check relative fallback
        alt_path = Path("../demo_data/05_agent_chain.jsonl")
        if alt_path.exists():
            filepath = alt_path
        else:
            sys.exit(f"[ERROR] Could not find scenario file: {filepath}")

    events = []
    with open(filepath, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                events.append(json.loads(line))
    return events


def format_step_label(idx: int, total: int, event: dict) -> str:
    """Format human-readable description for the step."""
    etype = event.get("event_type")
    dest = event.get("destination") or "None"
    source = event.get("source") or "unknown"

    if etype == "ai_request" and idx == 1:
        action = "User prompts autonomous agent to fix deployment script"
    elif etype == "file_read":
        action = f"Agent reads secret file: {dest}"
    elif etype == "shell_exec":
        action = f"Agent runs shell command: {dest}"
    elif etype == "ai_request" and idx == total:
        action = "Agent exfiltrates AWS key + issues tool call to OpenAI"
    else:
        action = f"Event {etype} -> {dest}"

    return f"Step {idx}/{total}: [{etype}] {source} -> {dest}\n  Action: {action}"


def replay_chain(scenario_path: Path = DEFAULT_DATA_PATH, interval: float = 3.0) -> None:
    """Replay the hero chain scenario step-by-step."""
    print("=" * 70)
    print(" SHADOWGUARD AI - AGENTIC EXFILTRATION CHAIN REPLAY")
    print(f" Target Endpoint: {INGEST_URL}")
    print("=" * 70)

    # Check server availability first
    if not check_backend_running():
        print("\n[ERROR] Server is not running at http://127.0.0.1:8000.")
        print("Please start the backend server before running demo_agent:")
        print("    cd backend")
        print("    python main.py")
        print("=" * 70)
        sys.exit(1)

    events = load_events(scenario_path)
    total = len(events)
    print(f"\n[+] Loaded {total} events from {scenario_path.name}")
    print(f"[+] Server is UP. Beginning replay (1 event every {interval}s)...\n")

    for i, event in enumerate(events, start=1):
        # Rewrite timestamp to current UTC time (ISO 8601 with Z)
        now_utc = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
        event["timestamp"] = now_utc

        # Print step description
        print("-" * 60)
        print(f"[{now_utc}] {format_step_label(i, total, event)}")
        print(f"  Event ID:    {event.get('event_id')}")

        # Send event wrapped in a JSON list
        try:
            resp = requests.post(INGEST_URL, json=[event], timeout=10.0)
            print(f"  Response [{resp.status_code}]: {resp.text.strip()}")
        except requests.exceptions.ConnectionError:
            print(f"\n[ERROR] Connection failed to {INGEST_URL}. Server went down.")
            sys.exit(1)
        except requests.exceptions.RequestException as e:
            print(f"  Request Error: {e}")

        # Wait before next event
        if i < total:
            time.sleep(interval)

    print("\n" + "=" * 70)
    print(" Replay complete! The correlated agent-chain incident should now be")
    print(" visible on the ShadowGuard AI dashboard at http://localhost:5173")
    print("=" * 70)


def main() -> None:
    """Replay the agent-chain scenario against the local API, one event every few seconds."""
    scenario = DEFAULT_DATA_PATH
    if len(sys.argv) > 1:
        scenario = Path(sys.argv[1])
    replay_chain(scenario_path=scenario, interval=3.0)


if __name__ == "__main__":
    main()
