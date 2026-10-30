"""Pre-stage routine: wipe the database, then (optionally) preload demo scenarios.

Usage:
    python demo_reset.py                         # delete shadowguard.db only
    python demo_reset.py --load 01 02 03 04 06   # delete, wait for the server, load files

Numbers map to ../demo_data/0N_*.jsonl. File 05 is normally NOT preloaded:
demo_agent.py plays it live on stage.

The server must be stopped while the database is deleted (it creates the tables at
startup). With --load, start it again when prompted; loading begins once it answers.
"""

import argparse
import sys
import time
from pathlib import Path

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

import requests  # noqa: E402

from load_demo import load_paths  # noqa: E402
from models import DB_PATH  # noqa: E402

HEALTH_URL = "http://127.0.0.1:8000/api/health"
DEFAULT_DATA_DIR = Path(__file__).parent.parent / "demo_data"


def server_up() -> bool:
    try:
        requests.get(HEALTH_URL, timeout=2)
        return True
    except requests.RequestException:
        return False


def resolve_files(numbers: list[str], data_dir: Path) -> list[Path]:
    files = []
    for n in numbers:
        if not n.isdigit():
            sys.exit(f"--load expects scenario numbers like 01 02 03, got {n!r}")
        matches = sorted(data_dir.glob(f"{int(n):02d}_*.jsonl"))
        if not matches:
            available = ", ".join(p.name for p in sorted(data_dir.glob("*.jsonl"))) or "none"
            sys.exit(f"No {int(n):02d}_*.jsonl in {data_dir} (available: {available})")
        files.extend(matches)
    return files


def delete_db() -> None:
    removed = []
    for path in (DB_PATH, DB_PATH.with_name(DB_PATH.name + "-journal")):
        try:
            path.unlink()
            removed.append(path.name)
        except FileNotFoundError:
            pass
        except PermissionError:
            sys.exit(f"Cannot delete {path} (still in use). Stop the server (Ctrl+C) and retry.")
    print(f"Deleted {', '.join(removed)}." if removed else f"No database at {DB_PATH} (already clean).")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--load", nargs="+", metavar="NN", help="scenario numbers to load, e.g. 01 02 03 04 06")
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR, help="folder with 0N_*.jsonl files")
    parser.add_argument("--wait", type=int, default=120, help="seconds to wait for the server (default 120)")
    args = parser.parse_args()

    files = resolve_files(args.load, args.data_dir) if args.load else []
    if any(f.name.startswith("05_") for f in files):
        print("Note: 05 is normally played live by demo_agent.py, but loading it as asked.")

    if server_up():
        sys.exit("The ShadowGuard server is running. Stop it (Ctrl+C in its terminal), then rerun this.")
    delete_db()
    if not files:
        print("Done. Start the server with: python main.py")
        return

    print(f"Now start the server in another terminal:  cd backend && python main.py\n"
          f"Waiting up to {args.wait}s for it to come up...")
    deadline = time.monotonic() + args.wait
    while not server_up():
        if time.monotonic() > deadline:
            sys.exit("Server did not come up in time. Start it, then run: "
                     f"python load_demo.py {' '.join(str(f) for f in files)}")
        time.sleep(1)
    health = requests.get(HEALTH_URL, timeout=5).json()
    print(f"Server is up: {health}\n")
    ok = load_paths([str(f) for f in files])
    print("\nReady for the demo." if ok else "\nFinished with errors (see above).")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
