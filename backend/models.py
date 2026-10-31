"""Pydantic schemas and SQLite persistence for ShadowGuard AI (contracts: docs/development/original-spec.md Section 6)."""

import json
import logging
import os
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import datetime, timedelta
from pathlib import Path

from pydantic import BaseModel, Field, ValidationError

# The public demo (DEPLOY_MODE=1) recreates its database on every start, so it uses its
# own file and can never touch a local install's data.
_DEPLOY = os.environ.get("DEPLOY_MODE", "").strip().lower() in ("1", "true", "yes", "on")
DB_PATH = Path(__file__).parent / ("shadowguard_demo.db" if _DEPLOY else "shadowguard.db")

log = logging.getLogger("shadowguard.models")


# ---------------------------------------------------------------------------
# Pydantic schemas (frozen contracts, docs/development/original-spec.md Section 6)
# ---------------------------------------------------------------------------

class RawEvent(BaseModel):
    """A single event as received by POST /api/ingest (one per JSONL line)."""

    event_id: str
    timestamp: str
    source: str
    event_type: str  # "ai_request" | "connection" | "shell_exec" | "file_read"
    pid: int | None = None
    destination: str | None = None
    payload_visible: bool
    payload: str | None = None
    dst_port: int | None = None
    path: str | None = None
    session_id: str | None = None
    # server-filled by main.py — never sent by clients:
    provider: str | None = None
    sanctioned: bool | None = None


EVENT_TYPES = {"ai_request", "connection", "shell_exec", "file_read"}


def validate_event(raw: object) -> tuple[RawEvent | None, str | None]:
    """Validate one incoming event. Returns (event, None) or (None, reason).

    Beyond the schema: event_type must be one of EVENT_TYPES and timestamp must be
    ISO 8601, since the correlator sorts by it. Shared by main.py and load_demo.py.
    """
    if not isinstance(raw, dict):
        return None, f"expected a JSON object, got {type(raw).__name__}"
    try:
        event = RawEvent.model_validate(raw)
    except ValidationError as exc:
        return None, "; ".join(
            f"{'.'.join(str(p) for p in e['loc']) or 'event'}: {e['msg']}" for e in exc.errors()
        )
    if event.event_type not in EVENT_TYPES:
        return None, f"event_type {event.event_type!r} is not one of {sorted(EVENT_TYPES)}"
    try:
        datetime.fromisoformat(event.timestamp.replace("Z", "+00:00"))
    except ValueError:
        return None, f"timestamp {event.timestamp!r} is not ISO 8601"
    return event, None


class Finding(BaseModel):
    """A redacted finding as stored with an incident (no raw value, no offsets)."""
    category: str
    rule: str
    redacted_evidence: str
    event_id: str | None = None
    fingerprint: str | None = None


class Incident(BaseModel):
    """A correlated, scored session (Section 6.3 contract)."""
    incident_id: str
    timestamp: datetime
    risk_score: int = Field(ge=0, le=10)
    provider: str
    trigger_events: list[str]
    findings: list[Finding]
    agent_context: str
    source: str
    sanctioned: bool
    severity: str  # "critical" | "high" | "medium" | "low"
    score_breakdown: list[dict]
    is_chain: bool = False
    ai_analysis: str | None = None


class EventSummary(BaseModel):
    """Event metadata as returned inside GET /api/incidents/{id}."""

    event_id: str
    timestamp: str
    event_type: str
    source: str
    destination: str | None = None
    provider: str | None = None
    sanctioned: bool | None = None


class IncidentDetail(Incident):
    """An incident plus the metadata of its trigger events."""
    events: list[EventSummary]


# ---------------------------------------------------------------------------
# SQLite setup
# ---------------------------------------------------------------------------

@contextmanager
def get_connection(db_path: Path = DB_PATH) -> Iterator[sqlite3.Connection]:
    """Open a connection that commits on success, rolls back on error, and always closes."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        with conn:
            yield conn
    finally:
        conn.close()


def init_db(db_path: Path = DB_PATH) -> None:
    """Create the incidents, findings and events tables if they don't exist."""
    with get_connection(db_path) as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS incidents (
                incident_id     TEXT PRIMARY KEY,
                timestamp       TEXT NOT NULL,
                risk_score      INTEGER NOT NULL CHECK (risk_score BETWEEN 0 AND 10),
                provider        TEXT NOT NULL,
                trigger_events  TEXT NOT NULL DEFAULT '[]',  -- JSON array of event IDs
                agent_context   TEXT NOT NULL DEFAULT '',
                source          TEXT NOT NULL,
                sanctioned      INTEGER NOT NULL,
                severity        TEXT NOT NULL,
                score_breakdown TEXT NOT NULL DEFAULT '[]',  -- JSON array of {factor, points}
                is_chain        INTEGER NOT NULL DEFAULT 0,
                ai_analysis     TEXT,                         -- JSON string from analyzer, or NULL
                session_key     TEXT                          -- internal: one incident per session
            );

            CREATE TABLE IF NOT EXISTS findings (
                id                INTEGER PRIMARY KEY AUTOINCREMENT,
                incident_id       TEXT NOT NULL REFERENCES incidents(incident_id) ON DELETE CASCADE,
                category          TEXT NOT NULL,
                rule              TEXT NOT NULL,
                redacted_evidence TEXT NOT NULL,
                event_id          TEXT,
                fingerprint       TEXT
            );

            -- Event metadata only. No payload column, ever.
            CREATE TABLE IF NOT EXISTS events (
                event_id    TEXT PRIMARY KEY,
                timestamp   TEXT NOT NULL,
                source      TEXT NOT NULL,
                event_type  TEXT NOT NULL,
                pid         INTEGER,
                destination TEXT,
                dst_port    INTEGER,
                path        TEXT,
                session_id  TEXT,
                provider    TEXT,
                sanctioned  INTEGER,
                session_key TEXT NOT NULL  -- session_id or "source:pid"
            );

            -- Per-event findings so sessions can be re-correlated across batches.
            -- Redacted evidence and fingerprints only: no offsets, no raw values.
            CREATE TABLE IF NOT EXISTS event_findings (
                id                INTEGER PRIMARY KEY AUTOINCREMENT,
                event_id          TEXT NOT NULL REFERENCES events(event_id) ON DELETE CASCADE,
                category          TEXT NOT NULL,
                rule              TEXT NOT NULL,
                redacted_evidence TEXT NOT NULL,
                fingerprint       TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_findings_incident ON findings(incident_id);
            CREATE INDEX IF NOT EXISTS idx_incidents_timestamp ON incidents(timestamp);
            CREATE INDEX IF NOT EXISTS idx_incidents_session ON incidents(session_key);
            CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
            CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_key);
            CREATE INDEX IF NOT EXISTS idx_event_findings_event ON event_findings(event_id);
            """
        )


def _bool_or_none(value: int | None) -> bool | None:
    return None if value is None else bool(value)


def session_key_for(event: RawEvent) -> str:
    """Correlation key: the explicit session_id, else "source:pid"."""
    return event.session_id or f"{event.source}:{event.pid}"


def _parse_ts(ts: str) -> datetime:
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))


def insert_event(
    event: RawEvent, findings: list[dict] | None = None, db_path: Path = DB_PATH
) -> None:
    """Save an event's metadata and its findings. The payload is never stored.

    Re-ingesting the same event_id (e.g. demo_agent.py replaying a file) replaces the
    row and its findings.
    """
    with get_connection(db_path) as conn:
        conn.execute("DELETE FROM event_findings WHERE event_id = ?", (event.event_id,))
        conn.execute(
            """
            INSERT OR REPLACE INTO events
                (event_id, timestamp, source, event_type, pid, destination,
                 dst_port, path, session_id, provider, sanctioned, session_key)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                event.event_id,
                event.timestamp,
                event.source,
                event.event_type,
                event.pid,
                event.destination,
                event.dst_port,
                event.path,
                event.session_id,
                event.provider,
                None if event.sanctioned is None else int(event.sanctioned),
                session_key_for(event),
            ),
        )
        conn.executemany(
            """
            INSERT INTO event_findings (event_id, category, rule, redacted_evidence, fingerprint)
            VALUES (?, ?, ?, ?, ?)
            """,
            [
                (event.event_id, f["category"], f["rule"], f["redacted_evidence"],
                 f.get("fingerprint"))
                for f in findings or []
            ],
        )


def fetch_session(
    session_key: str, window: timedelta = timedelta(minutes=10), db_path: Path = DB_PATH
) -> tuple[list[RawEvent], dict[str, list[dict]]]:
    """Rebuild a session for correlate_events from the DB.

    Returns the session's events within `window` of its newest event (time-ordered,
    payload None) and findings_by_event in the scan_payload dict shape (no offsets).
    """
    with get_connection(db_path) as conn:
        event_rows = conn.execute(
            "SELECT * FROM events WHERE session_key = ?", (session_key,)
        ).fetchall()
        finding_rows = conn.execute(
            """
            SELECT f.* FROM event_findings f JOIN events e ON e.event_id = f.event_id
            WHERE e.session_key = ? ORDER BY f.id
            """,
            (session_key,),
        ).fetchall()
    if not event_rows:
        return [], {}

    event_rows = sorted(event_rows, key=lambda r: _parse_ts(r["timestamp"]))
    cutoff = _parse_ts(event_rows[-1]["timestamp"]) - window
    events = [
        RawEvent(
            event_id=r["event_id"],
            timestamp=r["timestamp"],
            source=r["source"],
            event_type=r["event_type"],
            pid=r["pid"],
            destination=r["destination"],
            payload_visible=False,  # payloads are never stored
            payload=None,
            dst_port=r["dst_port"],
            path=r["path"],
            session_id=r["session_id"],
            provider=r["provider"],
            sanctioned=_bool_or_none(r["sanctioned"]),
        )
        for r in event_rows
        if _parse_ts(r["timestamp"]) >= cutoff
    ]

    kept = {e.event_id for e in events}
    findings_by_event: dict[str, list[dict]] = {}
    for r in finding_rows:
        if r["event_id"] in kept:
            findings_by_event.setdefault(r["event_id"], []).append(
                {
                    "category": r["category"],
                    "rule": r["rule"],
                    "redacted_evidence": r["redacted_evidence"],
                    "start": None,
                    "end": None,
                    "fingerprint": r["fingerprint"],
                    "event_id": r["event_id"],
                }
            )
    return events, findings_by_event


def _incident_columns(incident: Incident) -> dict:
    """Column values derived by the correlator (everything except id and ai_analysis)."""
    return {
        "timestamp": incident.timestamp.isoformat().replace("+00:00", "Z"),
        "risk_score": incident.risk_score,
        "provider": incident.provider,
        "trigger_events": json.dumps(incident.trigger_events),
        "agent_context": incident.agent_context,
        "source": incident.source,
        "sanctioned": int(incident.sanctioned),
        "severity": incident.severity,
        "score_breakdown": json.dumps(incident.score_breakdown),
        "is_chain": int(incident.is_chain),
    }


def _insert_findings(conn: sqlite3.Connection, incident_id: str, findings: list[Finding]) -> None:
    conn.executemany(
        """
        INSERT INTO findings
            (incident_id, category, rule, redacted_evidence, event_id, fingerprint)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        [
            (incident_id, f.category, f.rule, f.redacted_evidence, f.event_id, f.fingerprint)
            for f in findings
        ],
    )


def insert_incident(
    incident: Incident, session_key: str | None = None, db_path: Path = DB_PATH
) -> None:
    """Insert an incident and its findings. IDs must be unique (correlator uses uuid4)."""
    cols = _incident_columns(incident) | {
        "incident_id": incident.incident_id,
        "ai_analysis": incident.ai_analysis,
        "session_key": session_key,
    }
    with get_connection(db_path) as conn:
        conn.execute(
            f"INSERT INTO incidents ({', '.join(cols)}) VALUES ({', '.join('?' * len(cols))})",
            list(cols.values()),
        )
        _insert_findings(conn, incident.incident_id, incident.findings)


def upsert_incident(incident: Incident, session_key: str, db_path: Path = DB_PATH) -> str:
    """Insert the session's incident, or update the existing one in place.

    An existing incident keeps its incident_id; every correlator-derived field and its
    findings are replaced. Its ai_analysis is kept unless the risk_score or the set of
    findings changed, in which case it is cleared (the cached analysis is stale).
    Returns the stored incident_id.
    """
    with get_connection(db_path) as conn:
        row = conn.execute(
            """
            SELECT incident_id, risk_score FROM incidents
            WHERE session_key = ? ORDER BY timestamp LIMIT 1
            """,
            (session_key,),
        ).fetchone()
        if row is not None:
            incident_id = row["incident_id"]
            old_findings = {
                tuple(r) for r in conn.execute(
                    """
                    SELECT category, rule, redacted_evidence, event_id, fingerprint
                    FROM findings WHERE incident_id = ?
                    """,
                    (incident_id,),
                )
            }
            new_findings = {
                (f.category, f.rule, f.redacted_evidence, f.event_id, f.fingerprint)
                for f in incident.findings
            }
            cols = _incident_columns(incident)
            if row["risk_score"] != incident.risk_score or old_findings != new_findings:
                cols["ai_analysis"] = None
            conn.execute(
                f"UPDATE incidents SET {', '.join(f'{c} = ?' for c in cols)} WHERE incident_id = ?",
                [*cols.values(), incident_id],
            )
            conn.execute("DELETE FROM findings WHERE incident_id = ?", (incident_id,))
            _insert_findings(conn, incident_id, incident.findings)
            return incident_id

    insert_incident(incident, session_key, db_path)
    return incident.incident_id


def set_ai_analysis(incident_id: str, ai_analysis: str, db_path: Path = DB_PATH) -> None:
    """Store the analyzer's JSON string on an incident."""
    with get_connection(db_path) as conn:
        conn.execute(
            "UPDATE incidents SET ai_analysis = ? WHERE incident_id = ?", (ai_analysis, incident_id)
        )


def _row_to_incident(row: sqlite3.Row, findings: list[Finding]) -> Incident:
    return Incident(
        incident_id=row["incident_id"],
        timestamp=row["timestamp"],
        risk_score=row["risk_score"],
        provider=row["provider"],
        trigger_events=json.loads(row["trigger_events"]),
        findings=findings,
        agent_context=row["agent_context"],
        source=row["source"],
        sanctioned=bool(row["sanctioned"]),
        severity=row["severity"],
        score_breakdown=json.loads(row["score_breakdown"]),
        is_chain=bool(row["is_chain"]),
        ai_analysis=row["ai_analysis"],
    )


def _row_to_finding(row: sqlite3.Row) -> Finding:
    return Finding(
        category=row["category"],
        rule=row["rule"],
        redacted_evidence=row["redacted_evidence"],
        event_id=row["event_id"],
        fingerprint=row["fingerprint"],
    )


def fetch_incidents(db_path: Path = DB_PATH) -> list[Incident]:
    """Return all incidents (newest first) with their findings attached."""
    with get_connection(db_path) as conn:
        incident_rows = conn.execute(
            "SELECT * FROM incidents ORDER BY timestamp DESC"
        ).fetchall()
        finding_rows = conn.execute("SELECT * FROM findings ORDER BY id").fetchall()

    findings_by_incident: dict[str, list[Finding]] = {}
    for row in finding_rows:
        findings_by_incident.setdefault(row["incident_id"], []).append(_row_to_finding(row))

    return [
        _row_to_incident(row, findings_by_incident.get(row["incident_id"], []))
        for row in incident_rows
    ]


def fetch_incident(incident_id: str, db_path: Path = DB_PATH) -> IncidentDetail | None:
    """Return one incident plus the metadata of its trigger events (time-ordered)."""
    with get_connection(db_path) as conn:
        row = conn.execute(
            "SELECT * FROM incidents WHERE incident_id = ?", (incident_id,)
        ).fetchone()
        if row is None:
            return None
        finding_rows = conn.execute(
            "SELECT * FROM findings WHERE incident_id = ? ORDER BY id", (incident_id,)
        ).fetchall()
        event_ids = json.loads(row["trigger_events"])
        placeholders = ",".join("?" * len(event_ids))
        event_rows = conn.execute(
            f"SELECT * FROM events WHERE event_id IN ({placeholders}) ORDER BY timestamp",
            event_ids,
        ).fetchall() if event_ids else []

    incident = _row_to_incident(row, [_row_to_finding(r) for r in finding_rows])
    events = [
        EventSummary(
            event_id=r["event_id"],
            timestamp=r["timestamp"],
            event_type=r["event_type"],
            source=r["source"],
            destination=r["destination"],
            provider=r["provider"],
            sanctioned=_bool_or_none(r["sanctioned"]),
        )
        for r in event_rows
    ]
    return IncidentDetail(**incident.model_dump(), events=events)


def fetch_stats(db_path: Path = DB_PATH) -> dict:
    """Aggregate dashboard statistics (docs/development/original-spec.md Section 6.4, GET /api/stats)."""
    with get_connection(db_path) as conn:
        totals = conn.execute(
            """
            SELECT
                COUNT(*)                                            AS total_events,
                COUNT(provider)                                     AS ai_requests,
                COALESCE(SUM(CASE WHEN sanctioned = 0 THEN 1 END), 0) AS shadow_requests,
                COUNT(DISTINCT provider)                            AS providers_seen
            FROM events
            """
        ).fetchone()
        severity_rows = conn.execute(
            "SELECT severity, COUNT(*) AS n FROM incidents GROUP BY severity"
        ).fetchall()
        by_provider_rows = conn.execute(
            """
            SELECT provider, MAX(sanctioned) AS sanctioned, COUNT(*) AS count
            FROM events WHERE provider IS NOT NULL
            GROUP BY provider ORDER BY count DESC
            """
        ).fetchall()
        inventory_rows = conn.execute(
            """
            SELECT source, provider, MAX(sanctioned) AS sanctioned,
                   COUNT(*) AS requests, MAX(timestamp) AS last_seen
            FROM events WHERE provider IS NOT NULL
            GROUP BY source, provider
            ORDER BY sanctioned ASC, requests DESC
            """
        ).fetchall()
        # Bucket by minute: "2026-10-30T10:04:11Z" -> "2026-10-30T10:04:00Z"
        request_minutes = conn.execute(
            """
            SELECT substr(timestamp, 1, 16) || ':00Z' AS minute, COUNT(*) AS n
            FROM events WHERE provider IS NOT NULL GROUP BY minute
            """
        ).fetchall()
        incident_minutes = conn.execute(
            """
            SELECT substr(timestamp, 1, 16) || ':00Z' AS minute, COUNT(*) AS n
            FROM incidents GROUP BY minute
            """
        ).fetchall()

    incidents_by_severity = {"critical": 0, "high": 0, "medium": 0, "low": 0}
    for row in severity_rows:
        incidents_by_severity[row["severity"]] = row["n"]

    timeline: dict[str, dict] = {}
    for row in request_minutes:
        timeline.setdefault(row["minute"], {"minute": row["minute"], "requests": 0, "incidents": 0})
        timeline[row["minute"]]["requests"] = row["n"]
    for row in incident_minutes:
        timeline.setdefault(row["minute"], {"minute": row["minute"], "requests": 0, "incidents": 0})
        timeline[row["minute"]]["incidents"] = row["n"]

    return {
        "total_events": totals["total_events"],
        "ai_requests": totals["ai_requests"],
        "shadow_requests": totals["shadow_requests"],
        "providers_seen": totals["providers_seen"],
        "incidents_total": sum(incidents_by_severity.values()),
        "incidents_by_severity": incidents_by_severity,
        "by_provider": [
            {"provider": r["provider"], "sanctioned": bool(r["sanctioned"]), "count": r["count"]}
            for r in by_provider_rows
        ],
        "inventory": [
            {
                "source": r["source"],
                "provider": r["provider"],
                "sanctioned": bool(r["sanctioned"]),
                "requests": r["requests"],
                "last_seen": r["last_seen"],
            }
            for r in inventory_rows
        ],
        "timeline": [timeline[m] for m in sorted(timeline)],
    }


def seed_from_file(json_path: Path, db_path: Path = DB_PATH) -> int:
    """Load mock incidents from a JSON file if the database is empty. Returns rows inserted.

    Only called when SEED_MOCK=1. Entries that don't match the Incident contract are skipped.
    """
    with get_connection(db_path) as conn:
        if conn.execute("SELECT COUNT(*) FROM incidents").fetchone()[0] > 0:
            return 0
    if not json_path.exists():
        return 0

    inserted = 0
    for item in json.loads(json_path.read_text(encoding="utf-8")):
        try:
            insert_incident(Incident.model_validate(item), db_path=db_path)
            inserted += 1
        except ValidationError as exc:
            log.warning("seed: skipping %s: %d contract errors", item.get("incident_id"), exc.error_count())
    return inserted
