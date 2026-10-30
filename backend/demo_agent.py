"""ShadowGuard AI - Hero Scenario Live Demo Replay Agent.

Replays demo_data/05_agent_chain.jsonl one event every 3 seconds to the ingest endpoint,
rewriting timestamps to current UTC time so the incident and chain timeline build live.
If the backend is not running on 127.0.0.1:8000, prints the requests in simulation mode.
"""

import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

try:
    import requests
except ImportError:
    requests = None

INGEST_URL = "http://127.0.0.1:8000/api/ingest"
HEALTH_CHECK_URL = "http://127.0.0.1:8000/api/incidents"
DEFAULT_SCENARIO = Path(__file__).resolve().parent.parent / "demo_data" / "05_agent_chain.jsonl"


def is_backend_online(timeout: float = 1.0) -> bool:
    """Check if the backend FastAPI service is responding on 127.0.0.1:8000."""
    if requests is None:
        return False
    try:
        resp = requests.get(HEALTH_CHECK_URL, timeout=timeout)
        return resp.status_code == 200
    except Exception:
        return False


def load_scenario(scenario_path: Path) -> list[dict]:
    """Load JSONL events from the scenario file."""
    if not scenario_path.exists():
        sys.exit(f"Error: Scenario file not found: {scenario_path}")
    events = []
    with open(scenario_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                events.append(json.loads(line))
    return events


def format_step_summary(idx: int, total: int, event: dict) -> str:
    """Format a descriptive summary for the hero chain step."""
    etype = event.get("event_type")
    source = event.get("source")
    dest = event.get("destination")
    desc = ""
    if etype == "ai_request" and idx == 1:
        desc = "User asks autonomous agent to fix deployment script"
    elif etype == "file_read":
        desc = f"Agent reads sensitive environment file: {dest}"
    elif etype == "shell_exec":
        desc = f"Agent executes shell command: {dest}"
    elif etype == "ai_request" and idx == total:
        desc = "Agent sends leaked AWS credential + run_shell tool-call to OpenAI"
    else:
        desc = f"Agent {etype} -> {dest}"

    return f"Step {idx}/{total} [{etype}] {source} -> {dest or 'None'}\n    Description: {desc}"


def run_demo(scenario_path: Path = DEFAULT_SCENARIO, interval: float = 3.0) -> None:
    events = load_scenario(scenario_path)
    backend_up = is_backend_online()

    print("=" * 70)
    print(" SHADOWGUARD AI - AGENTIC EXFILTRATION CHAIN DEMO")
    print("=" * 70)
    print(f"Scenario File: {scenario_path.name} ({len(events)} events)")
    print(f"Target URL:    {INGEST_URL}")
    print(f"Backend State: {'[ONLINE] Sending live HTTP requests' if backend_up else '[OFFLINE] Simulating requests (dry-run)'}")
    print(f"Replay Rate:   1 event every {interval}s")
    print("=" * 70 + "\n")

    for i, event in enumerate(events, start=1):
        # Rewrite timestamp to current UTC time with 'Z'
        now_utc = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        event["timestamp"] = now_utc

        summary = format_step_summary(i, len(events), event)
        print(f"[{now_utc}] {summary}")

        if backend_up:
            try:
                # Ingest endpoint expects a list of RawEvents
                resp = requests.post(INGEST_URL, json=[event], timeout=10.0)
                if resp.status_code == 200:
                    data = resp.json()
                    print(f"    --> Backend response: status={resp.status_code}, processed={data.get('processed')}, incidents={data.get('incidents', 0)}")
                else:
                    print(f"    --> Backend error: status={resp.status_code}, response={resp.text[:120]}")
            except Exception as e:
                print(f"    --> Network error during POST: {e}")
        else:
            payload_snippet = ""
            if event.get("payload_visible") and event.get("payload"):
                payload_str = event["payload"]
                if len(payload_str) > 80:
                    payload_snippet = payload_str[:77] + "..."
                else:
                    payload_snippet = payload_str
                print(f"    --> Simulated Payload: {payload_snippet}")
            print("    --> [Dry-run] Request prepared successfully.")

        if i < len(events):
            time.sleep(interval)
        print()

    print("=" * 70)
    print(" Replay complete! The correlated agent-chain incident should now appear")
    print(" on the ShadowGuard AI dashboard with Risk Score 10/10 (Critical).")
    print("=" * 70)


def main() -> None:
    scenario_path = DEFAULT_SCENARIO
    if len(sys.argv) > 1:
        scenario_path = Path(sys.argv[1])
    run_demo(scenario_path=scenario_path, interval=3.0)


if __name__ == "__main__":
    main()
