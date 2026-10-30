"""ShadowGuard AI backend API."""

from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from models import Incident, RawEvent, fetch_incidents, init_db, seed_from_file

MOCK_DATA = Path(__file__).parent.parent / "frontend" / "mock_incidents.json"


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
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


@app.post("/api/ingest")
def ingest(events: list[RawEvent]) -> dict:
    """Accept a batch of raw proxy log events.

    TODO: run detection rules, correlate into incidents,
    and persist via models.insert_incident().
    """
    print(f"[ingest] Received {len(events)} events")
    return {"status": "success", "processed": len(events)}


if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
