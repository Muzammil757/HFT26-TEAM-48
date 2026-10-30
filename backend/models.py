"""Pydantic schemas and SQLite persistence for ShadowGuard AI (contracts: CLAUDE.md Section 6)."""

import json
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path

from pydantic import BaseModel, Field, ValidationError

DB_PATH = Path(__file__).parent / "shadowguard.db"


# ---------------------------------------------------------------------------
# Pydantic schemas (frozen contracts, CLAUDE.md Section 6)
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


class Finding(BaseModel):
    category: str
    rule: str
    redacted_evidence: str
    event_id: str | None = None
    fingerprint: str | None = None


class Incident(BaseModel):
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
                ai_analysis     TEXT                          -- JSON string from analyzer, or NULL
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
                sanctioned  INTEGER
            );

            CREATE INDEX IF NOT EXISTS idx_findings_incident ON findings(incident_id);
            CREATE INDEX IF NOT EXISTS idx_incidents_timestamp ON incidents(timestamp);
            CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
            """
        )


def _bool_or_none(value: int | None) -> bool | None:
    return None if value is None else bool(value)


def insert_event(event: RawEvent, db_path: Path = DB_PATH) -> None:
    """Save an event's metadata. The payload is never stored.

    Re-ingesting the same event_id (e.g. demo_agent.py replaying a file) replaces the row.
    """
    with get_connection(db_path) as conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO events
                (event_id, timestamp, source, event_type, pid, destination,
                 dst_port, path, session_id, provider, sanctioned)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            ),
        )


def insert_incident(incident: Incident, db_path: Path = DB_PATH) -> None:
    """Insert an incident and its findings. IDs must be unique (correlator uses uuid4)."""
    with get_connection(db_path) as conn:
        conn.execute(
            """
            INSERT INTO incidents
                (incident_id, timestamp, risk_score, provider, trigger_events, agent_context,
                 source, sanctioned, severity, score_breakdown, is_chain, ai_analysis)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                incident.incident_id,
                incident.timestamp.isoformat().replace("+00:00", "Z"),
                incident.risk_score,
                incident.provider,
                json.dumps(incident.trigger_events),
                incident.agent_context,
                incident.source,
                int(incident.sanctioned),
                incident.severity,
                json.dumps(incident.score_breakdown),
                int(incident.is_chain),
                incident.ai_analysis,
            ),
        )
        conn.executemany(
            """
            INSERT INTO findings
                (incident_id, category, rule, redacted_evidence, event_id, fingerprint)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            [
                (incident.incident_id, f.category, f.rule, f.redacted_evidence,
                 f.event_id, f.fingerprint)
                for f in incident.findings
            ],
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
    """Aggregate dashboard statistics (CLAUDE.md Section 6.4, GET /api/stats)."""
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
            insert_incident(Incident.model_validate(item), db_path)
            inserted += 1
        except ValidationError as exc:
            print(f"[seed] Skipping {item.get('incident_id')}: {exc.error_count()} contract errors")
    return inserted
