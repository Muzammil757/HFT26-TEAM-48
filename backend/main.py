"""ShadowGuard AI backend API."""

import os
from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from correlator import correlate_events
from detectors import mask_secrets, scan_payload
from models import (
    Incident,
    IncidentDetail,
    RawEvent,
    fetch_incident,
    fetch_incidents,
    fetch_session,
    fetch_stats,
    init_db,
    insert_event,
    seed_from_file,
    session_key_for,
    upsert_incident,
)
from providers import classify

MOCK_DATA = Path(__file__).parent.parent / "frontend" / "mock_incidents.json"


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    if os.environ.get("SEED_MOCK") == "1":
        seed_from_file(MOCK_DATA)  # no-op once the DB has data
    yield


app = FastAPI(title="ShadowGuard AI", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/incidents", response_model=list[Incident])
def get_incidents() -> list[Incident]:
    return fetch_incidents()


@app.get("/api/incidents/{incident_id}", response_model=IncidentDetail)
def get_incident(incident_id: str) -> IncidentDetail:
    incident = fetch_incident(incident_id)
    if incident is None:
        raise HTTPException(status_code=404, detail=f"Incident {incident_id} not found")
    return incident


@app.get("/api/stats")
def get_stats() -> dict:
    return fetch_stats()


@app.post("/api/ingest")
def ingest(events: list[RawEvent]) -> dict:
    """Classify, scan and redact each event, save its metadata and findings, then
    re-correlate every session the batch touched using that session's stored history.

    Re-correlating from the DB lets a chain build up across single-event batches
    (demo_agent.py), and upserting by session keeps one incident per session.
    """
    print(f"[ingest] Received {len(events)} events")

    touched_sessions: list[str] = []
    for event in events:
        event.provider, event.sanctioned = classify(event.destination, event.dst_port, event.path)
        findings: list[dict] = []
        if event.payload_visible and event.payload:
            findings = scan_payload(event.payload)
            for f in findings:
                f["event_id"] = event.event_id
            event.payload = mask_secrets(event.payload, findings)
        insert_event(event, findings)  # metadata + redacted findings only, payload NOT stored
        key = session_key_for(event)
        if key not in touched_sessions:
            touched_sessions.append(key)

    incident_ids: list[str] = []
    for key in touched_sessions:
        session_events, findings_by_event = fetch_session(key)
        for incident in correlate_events(session_events, findings_by_event):
            incident_ids.append(upsert_incident(incident, key))
    print(f"[ingest] Saved {len(incident_ids)} incidents across {len(touched_sessions)} sessions")

    return {"status": "success", "processed": len(events), "incidents": len(incident_ids)}


if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
