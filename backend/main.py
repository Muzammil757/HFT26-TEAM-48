"""ShadowGuard AI backend API."""

import json
import logging
import os
import sys
import threading
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

# UTF-8 console output so no print (→, Hindi prompts…) can crash on a cp1252 Windows console.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

import uvicorn  # noqa: E402
from fastapi import Body, FastAPI, HTTPException  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.responses import JSONResponse  # noqa: E402


def load_env_file(path: Path) -> None:
    """Minimal .env loader: KEY=VALUE lines, # comments; never overrides real env vars."""
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip("\"'"))


load_env_file(Path(__file__).parent / ".env")

from logging_setup import setup_logging  # noqa: E402

setup_logging()
log_ingest = logging.getLogger("shadowguard.ingest")
log_collector = logging.getLogger("shadowguard.collector")
log_analyze = logging.getLogger("shadowguard.analyze")
log_deploy = logging.getLogger("shadowguard.deploy")

import replay  # noqa: E402
from analyzer import analyze_incident, build_llm_input, offline_analysis  # noqa: E402
from correlator import correlate_events  # noqa: E402
from deploy import (  # noqa: E402
    DEPLOY_MODE,
    install_public_safety,
    load_demo_scenarios,
    mount_frontend,
    reset_database,
)
from detectors import MAX_SCAN_CHARS, mask_secrets, scan_payload  # noqa: E402
from models import (  # noqa: E402
    DB_PATH,
    Incident,
    IncidentDetail,
    fetch_incident,
    fetch_incidents,
    fetch_session,
    fetch_stats,
    get_connection,
    init_db,
    insert_event,
    seed_from_file,
    session_key_for,
    set_ai_analysis,
    upsert_incident,
    validate_event,
)
from providers import classify  # noqa: E402

MOCK_DATA = Path(__file__).parent.parent / "frontend" / "src" / "mocks" / "mock_incidents.json"

# Live collector thread, if running; reported by /api/health.
_collector_thread: threading.Thread | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Start-up and shutdown: database, demo data (deploy mode) and the live collector."""
    global _collector_thread
    if DEPLOY_MODE:
        reset_database(DB_PATH)  # every start of the public demo begins from a fresh database
    init_db()
    if DEPLOY_MODE:
        log_deploy.info("DEPLOY_MODE=1: public demo, collector off, loading scenarios 01-04, 06, 07")
        load_demo_scenarios(process_events)
    if os.environ.get("SEED_MOCK") == "1":
        seed_from_file(MOCK_DATA)  # no-op once the DB has data

    collector_stop = threading.Event()
    collector_thread = None
    if DEPLOY_MODE:
        log_collector.info("Disabled in DEPLOY_MODE (a public server has no endpoint to watch)")
    elif os.environ.get("COLLECTOR_ENABLED", "1") != "0":
        try:
            from collector import start_collector

            collector_thread = start_collector(
                lambda events: process_events(events, origin="collector"),
                interval=3.0,
                stop_event=collector_stop,
            )
            _collector_thread = collector_thread
            log_collector.info("Live connection collector started (COLLECTOR_ENABLED=0 to disable)")
        except Exception as exc:  # never block startup on the collector
            log_collector.warning("Not started: %s: %s", type(exc).__name__, exc)
    else:
        log_collector.info("Disabled by COLLECTOR_ENABLED=0")

    yield

    if collector_thread is not None:
        collector_stop.set()
        collector_thread.join(timeout=5)
        if collector_thread.is_alive():
            log_collector.warning("Did not stop within 5s")
        else:
            log_collector.info("Stopped")


app = FastAPI(title="ShadowGuard AI", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
if DEPLOY_MODE:
    install_public_safety(app)


@app.get("/api/incidents", response_model=list[Incident])
def get_incidents() -> list[Incident]:
    """All incidents, newest first."""
    return fetch_incidents()


@app.get("/api/incidents/{incident_id}", response_model=IncidentDetail)
def get_incident(incident_id: str) -> IncidentDetail:
    """One incident with its trigger events (metadata only)."""
    incident = fetch_incident(incident_id)
    if incident is None:
        raise HTTPException(status_code=404, detail=f"Incident {incident_id} not found")
    return incident


@app.post("/api/incidents/{incident_id}/analyze", response_model=Incident)
def analyze(incident_id: str) -> Incident:
    """Return the incident with ai_analysis, computing and caching it if missing.

    The analyzer only receives redacted fields and falls back to offline rules,
    so this never fails once the incident exists.
    """
    incident = fetch_incident(incident_id)
    if incident is None:
        raise HTTPException(status_code=404, detail=f"Incident {incident_id} not found")
    if incident.ai_analysis:
        log_analyze.info("%s: returning cached ai_analysis", incident_id)
        return incident

    incident_dict = incident.model_dump(mode="json", exclude={"events"})
    try:
        result = analyze_incident(incident_dict)
    except Exception as exc:  # analyzer already falls back; this is a last-resort guard
        log_analyze.warning("analyzer raised %s: %s; using offline rules", type(exc).__name__, exc)
        result = offline_analysis(build_llm_input(incident_dict))
    incident.ai_analysis = json.dumps(result, ensure_ascii=False)
    set_ai_analysis(incident_id, incident.ai_analysis)
    log_analyze.info("%s: stored ai_analysis from %s", incident_id, result.get("engine"))
    return incident


@app.get("/api/stats")
def get_stats() -> dict:
    """Dashboard statistics: totals, providers, inventory and timeline."""
    return fetch_stats()


@app.post("/api/scan")
def scan(body: dict = Body(...)) -> dict:
    """Scan text with the detection engine and return redacted results only.

    Used by the Live Test Console. Nothing is stored or logged, and neither the
    raw text nor any raw matched value is returned: findings carry only
    category, rule and redacted evidence, and the text comes back masked.
    Validated by hand so an error response can never echo the input.
    """
    text = body.get("text") if isinstance(body, dict) else None
    if not isinstance(text, str):
        raise HTTPException(status_code=400, detail='Expected a JSON body {"text": "<string>"}')
    if len(text) > MAX_SCAN_CHARS:
        # Beyond this the scanner stops looking, so the tail could leak unmasked.
        raise HTTPException(status_code=413, detail=f"Text is longer than the {MAX_SCAN_CHARS // 1024} KB scan limit")
    findings = scan_payload(text)
    return {
        "findings": [
            {"category": f["category"], "rule": f["rule"], "redacted_evidence": f["redacted_evidence"]}
            for f in findings
        ],
        "masked_text": mask_secrets(text, findings),
    }


@app.get("/api/health")
def health() -> dict:
    """Readiness check for the frontend and the pre-stage routine."""
    try:
        with get_connection() as conn:
            conn.execute("SELECT COUNT(*) FROM events").fetchone()
        db_ok = True
    except Exception:
        db_ok = False
    model = os.environ.get("FEATHERLESS_MODEL", "").strip()
    configured = model and os.environ.get("FEATHERLESS_API_KEY", "").strip()
    return {
        "status": "ok" if db_ok else "degraded",
        "db": db_ok,
        "analyzer": f"featherless:{model}" if configured else "offline-rules",
        "collector": "on" if _collector_thread is not None and _collector_thread.is_alive() else "off",
        "mode": "deploy" if DEPLOY_MODE else "local",
    }


@app.post("/api/demo/replay-agent")
def replay_agent() -> JSONResponse:
    """Replay the scenario-05 agent attack live under a new session (one replay per 20 s)."""
    try:
        return JSONResponse(replay.start_replay(process_events), status_code=202)
    except replay.ReplayCooldown as exc:
        return JSONResponse({"detail": str(exc), "retry_after": exc.retry_after}, status_code=429,
                            headers={"Retry-After": str(exc.retry_after)})


@app.post("/api/ingest")
def ingest(events: list[Any] = Body(...)) -> dict:
    """Classify, scan, redact, store and correlate a batch of raw events."""
    return process_events(events)


# Serialises ingests: the collector thread and request handlers both write, and the
# session upsert is read-then-write.
_ingest_lock = threading.Lock()


def process_events(events: list[Any], origin: str = "api") -> dict:
    """Classify, scan and redact each event, save its metadata and findings, then
    re-correlate every session the batch touched using that session's stored history.

    Shared by POST /api/ingest and the live collector (in-process, no HTTP).
    Events are validated one by one (models.validate_event): a malformed event is
    skipped with a warning instead of failing the whole batch.
    Re-correlating from the DB lets a chain build up across single-event batches
    (demo_agent.py), and upserting by session keeps one incident per session.
    """
    with _ingest_lock:
        return _process_events(events, origin)


def _process_events(events: list[Any], origin: str) -> dict:
    log_ingest.info("Received %d events%s", len(events), f" from {origin}" if origin != "api" else "")

    skipped = 0
    processed = 0
    touched_sessions: list[str] = []
    for i, raw in enumerate(events):
        event, reason = validate_event(raw)
        if event is None:
            event_id = raw.get("event_id") if isinstance(raw, dict) else None
            log_ingest.warning("skipped event #%d (%s): %s", i, event_id, reason)
            skipped += 1
            continue
        try:
            event.provider, event.sanctioned = classify(event.destination, event.dst_port, event.path)
            findings: list[dict] = []
            if event.payload_visible and event.payload:
                findings = scan_payload(event.payload)
                for f in findings:
                    f["event_id"] = event.event_id
                event.payload = mask_secrets(event.payload, findings)
            insert_event(event, findings)  # metadata + redacted findings only, payload NOT stored
            if origin == "collector":
                status = "approved" if event.sanctioned else "SHADOW" if event.provider else "not AI"
                log_collector.info("%s (pid %s) -> %s:%s = %s [%s]", event.source, event.pid,
                                   event.destination, event.dst_port, event.provider or "-", status)
        except Exception as exc:
            log_ingest.warning("skipped event %s: %s: %s", event.event_id, type(exc).__name__, exc)
            skipped += 1
            continue
        processed += 1
        key = session_key_for(event)
        if key not in touched_sessions:
            touched_sessions.append(key)

    incident_ids: list[str] = []
    for key in touched_sessions:
        try:
            session_events, findings_by_event = fetch_session(key)
            for incident in correlate_events(session_events, findings_by_event):
                incident_ids.append(upsert_incident(incident, key))
        except Exception as exc:  # one bad session must not lose the rest of the batch
            log_ingest.warning("correlation failed for session %s: %s: %s", key, type(exc).__name__, exc)
    log_ingest.info("Saved %d incidents across %d sessions%s", len(incident_ids), len(touched_sessions),
                    f", skipped {skipped} events" if skipped else "")

    return {"status": "success", "processed": processed, "incidents": len(incident_ids),
            "skipped": skipped}


# Built dashboard at "/" (after every /api route, so the SPA fallback never shadows the API).
mount_frontend(app)


if __name__ == "__main__":
    # Auto-reload is off by default: on Windows a reload can leave the old worker
    # serving stale code. Opt in for development with DEV_RELOAD=1.
    # DEPLOY_MODE (public demo host): all interfaces on the host's $PORT, never reload.
    uvicorn.run(
        "main:app",
        host="0.0.0.0" if DEPLOY_MODE else "127.0.0.1",
        port=int(os.environ.get("PORT", "10000")) if DEPLOY_MODE else 8000,
        reload=os.environ.get("DEV_RELOAD") == "1" and not DEPLOY_MODE,
    )
