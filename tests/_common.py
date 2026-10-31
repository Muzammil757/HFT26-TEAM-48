"""Shared helpers for the verification scripts. Adds backend/ to sys.path."""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
DEMO_DATA = ROOT / "demo_data"
sys.path.insert(0, str(BACKEND))

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass


class Checks:
    """Collects PASS/FAIL lines and exits non-zero if anything failed."""

    def __init__(self, title: str):
        self.title = title
        self.results: list[tuple[str, bool, str]] = []

    def check(self, name: str, ok, detail="") -> bool:
        """Record one named check; returns whether it passed."""
        self.results.append((name, bool(ok), "" if ok else str(detail)))
        return bool(ok)

    def finish(self) -> None:
        """Print the results and exit non-zero if any check failed."""
        print(f"== {self.title}")
        width = max((len(n) for n, _, _ in self.results), default=0)
        for name, ok, detail in self.results:
            print(f"  {'PASS' if ok else 'FAIL'}  {name:{width}}" + (f"   <-- {detail}" if detail else ""))
        failed = sum(not ok for _, ok, _ in self.results)
        print(f"  {len(self.results) - failed}/{len(self.results)} passed\n")
        sys.exit(1 if failed else 0)


def demo_events(name: str) -> list[dict]:
    """Events of demo_data/<NN>_*.jsonl, e.g. demo_events("05")."""
    path = next(DEMO_DATA.glob(f"{name}_*.jsonl"))
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def run_pipeline(raw_events: list[dict]):
    """The ingest pipeline without the database: classify, scan, mask, correlate.

    Returns (incidents, findings_by_event, raw_values) where raw_values are the
    original matched strings (only for checking that they never leak).
    """
    from correlator import correlate_events
    from detectors import mask_secrets, scan_payload
    from models import RawEvent
    from providers import classify

    events, findings_by_event, raw_values = [], {}, set()
    for raw in raw_events:
        event = RawEvent(**raw)
        event.provider, event.sanctioned = classify(event.destination, event.dst_port, event.path)
        if event.payload_visible and event.payload:
            findings = scan_payload(event.payload)
            for f in findings:
                f["event_id"] = event.event_id
                if f.get("start") is not None:
                    raw_values.add(event.payload[f["start"]:f["end"]])
            findings_by_event[event.event_id] = findings
            event.payload = mask_secrets(event.payload, findings)
        events.append(event)
    return correlate_events(events, findings_by_event), findings_by_event, raw_values
