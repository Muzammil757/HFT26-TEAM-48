"""Pre-stage routine: wipe the database, then (optionally) preload demo scenarios.

Usage:
    python demo_reset.py                         # delete shadowguard.db only
    python demo_reset.py --load 01 02 03 04 06 07   # delete, wait for the server, load files
    python demo_reset.py --fresh --load 01 02 03 04 06 07   # regenerate data first (recent timestamps)

Numbers map to ../demo_data/0N_*.jsonl. File 05 is normally NOT preloaded:
demo_agent.py plays it live on stage.

The server must be stopped while the database is deleted (it creates the tables at
startup). With --load, start it again when prompted; loading begins once it answers.
"""

import argparse
import subprocess
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
GENERATOR = Path(__file__).parent / "generate_data.py"


def server_up() -> bool:
    """True if the ShadowGuard API answers on 127.0.0.1:8000."""
    try:
        requests.get(HEALTH_URL, timeout=2)
        return True
    except requests.RequestException:
        return False


def resolve_files(numbers: list[str], data_dir: Path) -> list[Path]:
    """Map scenario numbers (01, 02, ...) to their demo_data/*.jsonl files."""
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
    """Delete the local database and its journal; exit if the server still holds it."""
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
    """Parse arguments, optionally regenerate data, reset the database and load scenarios."""
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--load", nargs="+", metavar="NN", help="scenario numbers to load, e.g. 01 02 03 04 06 07")
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR, help="folder with 0N_*.jsonl files")
    parser.add_argument("--wait", type=int, default=120, help="seconds to wait for the server (default 120)")
    parser.add_argument("--fresh", action="store_true",
                        help="run generate_data.py first so demo timestamps are recent "
                             "(rewrites demo_data/*.jsonl; don't commit them)")
    args = parser.parse_args()

    if server_up():
        sys.exit("The ShadowGuard server is running. Stop it (Ctrl+C in its terminal), then rerun this.")
    if args.fresh:
        print("Regenerating demo data with recent timestamps...", flush=True)
        result = subprocess.run([sys.executable, str(GENERATOR)], cwd=GENERATOR.parent)
        if result.returncode != 0:
            sys.exit("generate_data.py failed (see above); database left untouched.")
        print()

    files = resolve_files(args.load, args.data_dir) if args.load else []
    if any(f.name.startswith("05_") for f in files):
        print("Note: 05 is normally played live by demo_agent.py, but loading it as asked.")
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
