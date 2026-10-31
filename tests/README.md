# Verification scripts

Plain Python scripts (no pytest needed) used during development to verify ShadowGuard AI. They use fake data only: documented example values such as `AKIAIOSFODNN7EXAMPLE` and the `4111 1111 1111 1111` test card, or values built in code.

Install the backend requirements first (`pip install -r backend/requirements.txt`), then run from the repository root:

```bash
python tests/run_all.py            # detectors, correlator, offline acceptance (no server needed)
python tests/run_all.py --live     # plus live acceptance and the privacy DB scan (servers running)
```

| Script | What it checks | Needs the server? |
|---|---|---|
| `test_detectors.py` | Every detection rule, the Luhn / Verhoeff / JWT validators, false-positive bait (UUIDs, git SHAs, MD5s, base64 images), redacted evidence and `mask_secrets`, and the findings in each demo file | No |
| `test_correlator.py` | Session grouping, every scoring factor, the 60 s exfiltration chain, the incident threshold (score ≥ 3) and severity bands | No |
| `test_acceptance.py` | Section 11 expectations for demo scenarios 01–07 through the full pipeline (classify → scan → mask → correlate). `--live` also reads the running server (GET only) | Only with `--live` |
| `test_privacy_db.py` | No raw secret or PII from any demo file or demo script in `backend/shadowguard.db`, no payload column, servers bound to `127.0.0.1` | Yes: run after `start_demo.ps1` / `start_demo.sh` |

For the live checks, start the demo first:

```powershell
powershell -ExecutionPolicy Bypass -File .\start_demo.ps1
cd backend; python demo_agent.py; python relay_demo.py; cd ..
python tests/run_all.py --live
```

Each script prints one PASS/FAIL line per check and exits non-zero if any check fails.
