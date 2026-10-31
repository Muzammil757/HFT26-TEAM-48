"""Privacy scan of the local database and listening sockets.

    python tests/test_privacy_db.py

Run after the demo has been loaded (start_demo.ps1 / start_demo.sh, optionally
demo_agent.py, relay_demo.py and the Live Test Console). Checks that no raw secret or
PII value from any demo file or demo script is stored anywhere in backend/shadowguard.db,
that the events table has no payload column, and that the servers listen on 127.0.0.1 only.
"""

import sqlite3
import sys
from contextlib import closing

import psutil
from _common import BACKEND, DEMO_DATA, Checks, demo_events, run_pipeline

DB = BACKEND / "shadowguard.db"
c = Checks("Privacy scan (backend/shadowguard.db)")
if not DB.exists():
    print(f"{DB} not found: start the demo first (start_demo.ps1 / start_demo.sh).")
    sys.exit(2)

with closing(sqlite3.connect(DB)) as conn:
    dump = "\n".join(conn.iterdump())
    event_columns = [row[1] for row in conn.execute("PRAGMA table_info(events)")]
    n_events = conn.execute("SELECT COUNT(*) FROM events").fetchone()[0]

c.check(f"database has data ({n_events} events)", n_events > 0)
c.check("events table has no payload column", event_columns and not any("payload" in col for col in event_columns),
        event_columns)

# Every raw value the detectors match in any demo file
raw_values = set()
for path in sorted(DEMO_DATA.glob("0*.jsonl")):
    raw_values |= run_pipeline(demo_events(path.name[:2]))[2]
leaked = sorted(v[:12] + "…" for v in raw_values if v in dump)
c.check(f"none of the {len(raw_values)} raw values from demo_data/ is stored", not leaked, leaked)

# Fixed fake values used by demo_agent.py, relay_demo.py and the Live Test Console starters
FIXED = ["AKIAIOSFODNN7EXAMPLE", "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY", "3043 3218 1964", "304332181964",
         "4111 1111 1111 1111", "4111111111111111", "priya.sharma@example.com", "FAKE-DEMO-KEY-NOT-REAL"]
c.check("no fixed demo secret (AWS key/secret, Aadhaar, card, email, fake SSH key) is stored",
        not [v for v in FIXED if v in dump], [v[:8] for v in FIXED if v in dump])

# Servers bound to 127.0.0.1 only (skipped for ports that are not listening)
try:
    listening = {}
    for conn in psutil.net_connections(kind="inet"):
        if conn.status == psutil.CONN_LISTEN and conn.laddr.port in (8000, 5173, 11435):
            listening.setdefault(conn.laddr.port, set()).add(conn.laddr.ip)
    for port, ips in sorted(listening.items()):
        c.check(f"port {port} listens on 127.0.0.1 only", ips == {"127.0.0.1"}, sorted(ips))
    if not listening:
        print("  (no server listening on 8000/5173/11435: binding check skipped)")
except psutil.AccessDenied:
    print("  (access denied listing sockets: binding check skipped)")
c.finish()
