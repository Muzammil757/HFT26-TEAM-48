"""Send JSONL files of raw events to the ShadowGuard AI ingest endpoint.

Usage:
    python load_demo.py ../demo_data/03_key_leak.jsonl [more.jsonl ...]
    python load_demo.py ../demo_data            # every *.jsonl in the folder, sorted

Each line is validated locally first (JSON + RawEvent rules); bad lines are reported as
file:line and skipped so they cannot fail the rest of the batch. One POST per file.
"""

import json
import sys
from pathlib import Path

# UTF-8 console output so file names / reasons can't crash a cp1252 Windows console.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

import requests  # noqa: E402
from models import validate_event  # noqa: E402

INGEST_URL = "http://127.0.0.1:8000/api/ingest"


class ServerDown(Exception):
    """Raised when the ShadowGuard API cannot be reached."""
    pass


def expand_paths(args: list[str]) -> list[Path]:
    """Files as given; folders expand to their *.jsonl files in name order."""
    paths: list[Path] = []
    for arg in args:
        p = Path(arg)
        if p.is_dir():
            found = sorted(p.glob("*.jsonl"))
            if not found:
                print(f"{p}: no .jsonl files in folder")
            paths.extend(found)
        elif p.is_file():
            paths.append(p)
        else:
            print(f"{p}: not found")
    return paths


def read_events(path: Path) -> tuple[list[dict], list[str]]:
    """Return (valid events, bad-line messages) for one JSONL file."""
    events, bad = [], []
    with open(path, encoding="utf-8") as f:
        for lineno, line in enumerate(f, 1):
            if not line.strip():
                continue
            try:
                raw = json.loads(line)
            except json.JSONDecodeError as exc:
                bad.append(f"{path.name}:{lineno}: invalid JSON ({exc.msg} at column {exc.colno})")
                continue
            event, reason = validate_event(raw)
            if event is None:
                bad.append(f"{path.name}:{lineno}: {reason}")
                continue
            events.append(raw)
    return events, bad


def load_file(path: Path) -> bool:
    """Validate and POST one file. Returns True if the server accepted it."""
    try:
        events, bad = read_events(path)
    except (OSError, UnicodeDecodeError) as exc:
        print(f"{path.name}: cannot read file ({exc})")
        return False
    for message in bad:
        print(f"  bad line  {message}")
    if not events:
        print(f"{path.name}: no valid events to send ({len(bad)} bad lines)")
        return not bad

    try:
        response = requests.post(INGEST_URL, json=events, timeout=60)
    except requests.ConnectionError:
        raise ServerDown from None
    if response.status_code != 200:
        print(f"{path.name}: server returned HTTP {response.status_code}: {response.text[:300]}")
        return False
    result = response.json()
    print(f"{path.name}: sent {len(events)}, processed {result.get('processed')}, "
          f"incidents {result.get('incidents')}, skipped locally {len(bad)}, "
          f"skipped by server {result.get('skipped', 0)}")
    return True


def load_paths(args: list[str]) -> bool:
    """Load every file; returns True only if all succeeded. Exits clearly if the server is down."""
    paths = expand_paths(args)
    if not paths:
        return False
    ok = True
    for path in paths:
        try:
            ok = load_file(path) and ok
        except ServerDown:
            print(f"\nCannot reach the ShadowGuard API at {INGEST_URL}.\n"
                  "Start it first:  cd backend && python main.py")
            sys.exit(2)
    return ok


def main() -> None:
    """Load the given JSONL files (or folders) into the local API."""
    if len(sys.argv) < 2:
        sys.exit("Usage: python load_demo.py <file.jsonl | folder> [more ...]")
    sys.exit(0 if load_paths(sys.argv[1:]) else 1)


if __name__ == "__main__":
    main()
