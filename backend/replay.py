"""Replay the scenario-05 agent attack live, on demand (POST /api/demo/replay-agent).

Each replay ingests the events of demo_data/05_agent_chain.jsonl one by one, 3 s apart,
with fresh timestamps and a NEW session id, so every replay builds its own incident
(3 -> 6 -> 10 critical chain) instead of growing an old one. One replay per 20 s.
All values in the scenario are fake.
"""

import json
import logging
import threading
import time
import uuid
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

SCENARIO = Path(__file__).resolve().parent.parent / "demo_data" / "05_agent_chain.jsonl"
INTERVAL_SECONDS = 3
COOLDOWN_SECONDS = 20

log = logging.getLogger("shadowguard.replay")

_lock = threading.Lock()
_last_start = 0.0


class ReplayCooldown(Exception):
    """Raised when a replay is requested within the cooldown window."""
    def __init__(self, retry_after: int):
        super().__init__(f"A replay was started recently; try again in {retry_after} s")
        self.retry_after = retry_after


def _scenario_events() -> list[dict]:
    return [json.loads(line) for line in SCENARIO.read_text(encoding="utf-8").splitlines() if line.strip()]


def start_replay(ingest: Callable[[list[Any]], dict]) -> dict:
    """Start a replay in a background thread and describe it; raise ReplayCooldown if too soon."""
    global _last_start
    with _lock:
        wait = COOLDOWN_SECONDS - (time.monotonic() - _last_start)
        if _last_start and wait > 0:
            raise ReplayCooldown(int(wait) + 1)
        _last_start = time.monotonic()

    run = uuid.uuid4().hex[:6]
    session_id = f"agent-replay-{run}"
    events = []
    for i, event in enumerate(_scenario_events(), start=1):
        events.append({**event, "event_id": f"replay_{run}_{i:02d}", "session_id": session_id})

    def worker() -> None:
        """Ingest the events one by one, INTERVAL_SECONDS apart, with fresh timestamps."""
        for i, event in enumerate(events):
            if i:
                time.sleep(INTERVAL_SECONDS)
            event = {**event, "timestamp": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")}
            try:
                ingest([event])
            except Exception as exc:  # keep going; the next step may still succeed
                log.warning("%s: step %d failed: %s", session_id, i + 1, type(exc).__name__)
        log.info("%s: finished (%d events)", session_id, len(events))

    threading.Thread(target=worker, name=f"replay-{run}", daemon=True).start()
    log.info("%s: started (%d events, %d s apart)", session_id, len(events), INTERVAL_SECONDS)
    return {
        "status": "started",
        "session_id": session_id,
        "event_ids": [e["event_id"] for e in events],
        "steps": [{"event_type": e["event_type"], "destination": e["destination"]} for e in events],
        "interval_seconds": INTERVAL_SECONDS,
        "cooldown_seconds": COOLDOWN_SECONDS,
    }
