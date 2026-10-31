"""Public-demo deployment mode (DEPLOY_MODE=1) and the single-URL frontend.

Local mode (the default) is unchanged: 127.0.0.1:8000, collector on, no limits.
With DEPLOY_MODE=1 (e.g. on Render):
  - bind 0.0.0.0 on $PORT, collector off, the Local LLM Guard relay is not started;
  - a fresh SQLite database is filled at startup with demo scenarios 01-04, 06 and 07
    (generated in memory with recent timestamps; 05 is played by the Replay button);
  - /api/ingest and /api/scan bodies are capped at 100 KB and every client IP is
    rate limited. Request bodies are never logged.
In both modes, if backend/static/index.html exists (the committed frontend build),
FastAPI serves the dashboard at "/" with an SPA fallback, next to /api/*.
"""

import logging
import os
import threading
import time
from collections import defaultdict, deque
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

DEPLOY_MODE = os.environ.get("DEPLOY_MODE", "").strip().lower() in ("1", "true", "yes", "on")
STATIC_DIR = Path(__file__).resolve().parent / "static"

MAX_BODY_BYTES = 100 * 1024
CAPPED_PATHS = ("/api/ingest", "/api/scan")
# Per client IP, sliding 60 s window. The dashboard polls ~3 endpoints every 3 s
# (about 60 GETs a minute per open tab), so reads get room for a few tabs.
READ_LIMIT_PER_MIN = 300
WRITE_LIMIT_PER_MIN = 40

log = logging.getLogger("shadowguard.deploy")


def load_demo_scenarios(ingest: Callable[[list[Any]], dict]) -> None:
    """Fill the empty demo database with scenarios 01-04, 06 and 07 (fake data only)."""
    import generate_data as gen

    base = datetime.now(UTC) - timedelta(minutes=10)
    scenarios = [("01", gen.generate_file_01), ("02", gen.generate_file_02), ("03", gen.generate_file_03),
                 ("04", gen.generate_file_04), ("06", gen.generate_file_06), ("07", gen.generate_file_07)]
    for name, build in scenarios:
        result = ingest(build(base))
        log.info("scenario %s: processed %s, incidents %s", name, result["processed"], result["incidents"])


def reset_database(db_path: Path) -> None:
    """Delete the demo database (and journal) so the public demo starts fresh."""
    for path in (db_path, db_path.with_name(db_path.name + "-journal")):
        path.unlink(missing_ok=True)


class _RateLimiter:
    def __init__(self) -> None:
        self._hits: dict[tuple[str, str], deque] = defaultdict(deque)
        self._lock = threading.Lock()

    def allow(self, ip: str, kind: str, limit: int) -> int:
        """0 if allowed, else seconds until the oldest hit leaves the window."""
        now = time.monotonic()
        with self._lock:
            hits = self._hits[(ip, kind)]
            while hits and now - hits[0] > 60:
                hits.popleft()
            if len(hits) >= limit:
                return int(60 - (now - hits[0])) + 1
            hits.append(now)
            if len(self._hits) > 10_000:  # forget idle clients
                for key in [k for k, v in self._hits.items() if not v or now - v[-1] > 60]:
                    del self._hits[key]
            return 0


def _client_ip(request: Request) -> str:
    # Behind the host's proxy the client is the first X-Forwarded-For entry.
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def install_public_safety(app: FastAPI) -> None:
    """Body-size cap and per-IP rate limit for the public demo. Never reads or logs bodies."""
    limiter = _RateLimiter()

    @app.middleware("http")
    async def public_demo_guard(request: Request, call_next):
        """Reject over-limit clients and oversized bodies before the route runs."""
        path = request.url.path
        if path.startswith("/api/"):
            write = request.method not in ("GET", "HEAD", "OPTIONS")
            retry = limiter.allow(_client_ip(request), "write" if write else "read",
                                  WRITE_LIMIT_PER_MIN if write else READ_LIMIT_PER_MIN)
            if retry:
                return JSONResponse({"detail": "Too many requests on the public demo; slow down a little."},
                                    status_code=429, headers={"Retry-After": str(retry)})
            if write and path in CAPPED_PATHS:
                length = request.headers.get("content-length")
                if length is None:
                    return JSONResponse({"detail": "Content-Length required"}, status_code=411)
                if not length.isdigit() or int(length) > MAX_BODY_BYTES:
                    return JSONResponse({"detail": f"Request body over the {MAX_BODY_BYTES // 1024} KB demo limit"},
                                        status_code=413)
        return await call_next(request)


def mount_frontend(app: FastAPI) -> bool:
    """Serve the built dashboard from backend/static with an SPA fallback. Call after the API routes."""
    index = STATIC_DIR / "index.html"
    if not index.exists():
        return False
    assets = STATIC_DIR / "assets"
    if assets.is_dir():
        app.mount("/assets", StaticFiles(directory=assets), name="assets")
    root = STATIC_DIR.resolve()

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str):
        """Serve a built file if it exists, else index.html for client-side routes."""
        if full_path == "api" or full_path.startswith("api/"):
            return JSONResponse({"detail": "Not Found"}, status_code=404)
        candidate = (root / full_path).resolve()
        if full_path and candidate.is_file() and candidate.is_relative_to(root):
            return FileResponse(candidate)
        # Client-side routes (/incidents/<id>, /how-it-works, ...) get the app shell.
        return FileResponse(index, headers={"Cache-Control": "no-cache"})

    return True
