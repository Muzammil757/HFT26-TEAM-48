"""Run every verification script and print a summary.

    python tests/run_all.py            # detectors, correlator, offline acceptance
    python tests/run_all.py --live     # also live acceptance + privacy DB scan (servers running)
"""

import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
live = "--live" in sys.argv
scripts = [["test_detectors.py"], ["test_correlator.py"], ["test_acceptance.py"] + (["--live"] if live else [])]
if live:
    scripts.append(["test_privacy_db.py"])

summary = []
for args in scripts:
    code = subprocess.run([sys.executable, str(HERE / args[0]), *args[1:]], cwd=HERE).returncode
    summary.append((" ".join(args), code == 0))
print("== Summary")
for name, ok in summary:
    print(f"  {'PASS' if ok else 'FAIL'}  {name}")
sys.exit(0 if all(ok for _, ok in summary) else 1)
