"""Pydantic schemas and SQLite persistence for ShadowGuard AI incidents."""

import json
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path

from pydantic import BaseModel, Field

DB_PATH = Path(__file__).parent / "shadowguard.db"


# ---------------------------------------------------------------------------
# Pydantic schemas (match the API contract in frontend/mock_incidents.json)
# ---------------------------------------------------------------------------

class Finding(BaseModel):
    category: str
    rule: str
    redacted_evidence: str


class Incident(BaseModel):
    incident_id: str
    timestamp: datetime
    risk_score: int = Field(ge=0, le=10)
    provider: str
    trigger_events: list[str]
    findings: list[Finding]
    agent_context: str


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
    """Create the incidents and findings tables if they don't exist."""
    with get_connection(db_path) as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS incidents (
                incident_id    TEXT PRIMARY KEY,
                timestamp      TEXT NOT NULL,
                risk_score     INTEGER NOT NULL CHECK (risk_score BETWEEN 0 AND 10),
                provider       TEXT NOT NULL,
                trigger_events TEXT NOT NULL DEFAULT '[]',  -- JSON array of event IDs
                agent_context  TEXT NOT NULL DEFAULT ''
            );

            CREATE TABLE IF NOT EXISTS findings (
                id                INTEGER PRIMARY KEY AUTOINCREMENT,
                incident_id       TEXT NOT NULL REFERENCES incidents(incident_id) ON DELETE CASCADE,
                category          TEXT NOT NULL,
                rule              TEXT NOT NULL,
                redacted_evidence TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_findings_incident ON findings(incident_id);
            CREATE INDEX IF NOT EXISTS idx_incidents_timestamp ON incidents(timestamp);
            """
        )


def insert_incident(incident: Incident, db_path: Path = DB_PATH) -> None:
    """Insert (or replace) an incident and its findings."""
    with get_connection(db_path) as conn:
        conn.execute("DELETE FROM incidents WHERE incident_id = ?", (incident.incident_id,))
        conn.execute(
            """
            INSERT INTO incidents
                (incident_id, timestamp, risk_score, provider, trigger_events, agent_context)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                incident.incident_id,
                incident.timestamp.isoformat().replace("+00:00", "Z"),
                incident.risk_score,
                incident.provider,
                json.dumps(incident.trigger_events),
                incident.agent_context,
            ),
        )
        conn.executemany(
            """
            INSERT INTO findings (incident_id, category, rule, redacted_evidence)
            VALUES (?, ?, ?, ?)
            """,
            [
                (incident.incident_id, f.category, f.rule, f.redacted_evidence)
                for f in incident.findings
            ],
        )


def fetch_incidents(db_path: Path = DB_PATH) -> list[Incident]:
    """Return all incidents (newest first) with their findings attached."""
    with get_connection(db_path) as conn:
        incident_rows = conn.execute(
            "SELECT * FROM incidents ORDER BY timestamp DESC"
        ).fetchall()
        finding_rows = conn.execute(
            "SELECT incident_id, category, rule, redacted_evidence FROM findings ORDER BY id"
        ).fetchall()

    findings_by_incident: dict[str, list[Finding]] = {}
    for row in finding_rows:
        findings_by_incident.setdefault(row["incident_id"], []).append(
            Finding(
                category=row["category"],
                rule=row["rule"],
                redacted_evidence=row["redacted_evidence"],
            )
        )

    return [
        Incident(
            incident_id=row["incident_id"],
            timestamp=row["timestamp"],
            risk_score=row["risk_score"],
            provider=row["provider"],
            trigger_events=json.loads(row["trigger_events"]),
            findings=findings_by_incident.get(row["incident_id"], []),
            agent_context=row["agent_context"],
        )
        for row in incident_rows
    ]


def seed_from_file(json_path: Path, db_path: Path = DB_PATH) -> int:
    """Load incidents from a JSON file if the database is empty. Returns rows inserted."""
    with get_connection(db_path) as conn:
        if conn.execute("SELECT COUNT(*) FROM incidents").fetchone()[0] > 0:
            return 0
    if not json_path.exists():
        return 0

    incidents = [Incident.model_validate(item) for item in json.loads(json_path.read_text())]
    for incident in incidents:
        insert_incident(incident, db_path)
    return len(incidents)
