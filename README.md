# 🚀 CBIT Hacktoberfest '26 — Project Starter Repository

> **Official Public Starter Repository for CBIT Hacktoberfest '26**  
> *Chaitanya Bharathi Institute of Technology (CBIT), Hyderabad*

---

## 📋 Team Information

| Attribute | Details |
| :--- | :--- |
| **Team Name** | **Converge** |
| **Team Number** | `TEAM-48` (`HFT26-TEAM-48`) |
| **Registration ID** | `HFEST26-LT7HCVP8` |
| **Problem Track** | **AI Shadow IT & Agentic Data Exfiltration Scanner** |
| **Domain** | `General Track` |
| **Team Leader** | Chetan Varma Bethalam (bethalam2406@gmail.com) |
| **Institution** | CBIT Hyderabad |

### 👥 Team Members

| # | Name | Email | Institution |
| :--- | :--- | :--- | :--- |
| 1 | Nimmala Karthik | nimmalakarthik432@gmail.com | CBIT Hyderabad |
| 2 | Anurag Kanukuntla | anuragkanukuntla001@gmail.com | CBIT Hyderabad |
| 3 | Sai Krishna | saikrishna201005@gmail.com | CBIT Hyderabad |
| 4 | Mohammad Muzzamil | memuzammil88@gmail.com | CBIT Hyderabad |

---

## 🎯 Problem Statement

### **AI Shadow IT & Agentic Data Exfiltration Scanner**
*Domain:* **General Track**

Employees and developers are rapidly adopting local LLMs, browser AI extensions and autonomous coding agents (Cursor, AutoGPT, custom LangChain scripts). They paste proprietary code, credentials and customer PII into unmonitored AI tools, or connect agents to internal systems without governance. A single prompt guardrail cannot fix this, because AI traffic happens across local network traffic, browser extensions, desktop apps and encrypted API calls.

**Build a non-invasive endpoint and network auditing engine that:**

1. Passively inspects local process network connections, **or** accepts sample PCAP / HTTP request log uploads (mock logs allowed).
2. Identifies requests to known AI providers or local LLM servers (hostnames, endpoints, ports such as `11434` for Ollama).
3. Analyses outgoing text payloads in real time with **local entropy checks and regex patterns** to detect leaked secrets (API keys, JWTs) and PII.
4. Flags risky **autonomous agent behaviour**, such as agents executing shell commands or reading files without verification.
5. Provides a **local, privacy-focused web dashboard** with AI usage statistics, data-leak alerts and compliance risk scores.

**Constraint:** without invasive SSL decryption or complex enterprise agent deployment.

**Expected outcome:** a working local prototype that shows which AI tools are in use on a machine, detects secrets and PII leaving towards them, flags risky agent actions, and presents it all as explainable alerts and risk scores on a dashboard. Suggested sponsor usage (**Featherless**): an LLM reviews flagged, suspicious snippets in context and suggests remediation for security admins.

## ✅ Requirement → Implementation

| # | Requirement | How ShadowGuard AI implements it |
|---|---|---|
| 1 | Passive inspection of local connections, or log uploads | `backend/collector.py`: psutil connection metadata (process, PID, remote host:port) every 3 s, no payloads. JSONL request-log ingest via `POST /api/ingest` (`load_demo.py`, `demo_agent.py`). Opt-in Local LLM Guard relay (`llm_relay.py`) for real local Ollama traffic. |
| 2 | Identify AI providers and local LLM servers | `backend/providers.py`: host suffix, port (`11434` Ollama, `1234` LM Studio) and API-path registry for OpenAI, Anthropic, Hugging Face, Featherless, Gemini, Ollama, LM Studio and unknown OpenAI-compatible endpoints; approved vs **SHADOW**. |
| 3 | Real-time entropy + regex detection of secrets and PII | `backend/detectors.py`: regex rules for AWS, OpenAI, Anthropic, GitHub, Hugging Face keys, private keys and JWTs (header-validated); email, +91 phone, PAN, Aadhaar (Verhoeff), cards (Luhn); Shannon entropy with false-positive exclusions. Secrets are redacted in memory; only keyed fingerprints are stored. |
| 4 | Flag risky autonomous agent behaviour | `shell_exec` / `file_read` events plus OpenAI `tool_calls` and Anthropic `tool_use` parsing; `backend/correlator.py` links a sensitive file read → credential sent within 60 s into one critical **exfiltration chain** incident. |
| 5 | Local, privacy-focused dashboard with stats, alerts, risk scores | React + Vite dashboard on `127.0.0.1`: Security Overview, AI Inventory, Incidents with an explainable 0–10 score breakdown and chain timeline, Live Test Console, How it works. |
| — | No SSL decryption | Encrypted cloud traffic is seen as metadata only; payloads are read only where plaintext already exists (localhost HTTP to Ollama, exported request logs). |
| — | Featherless (sponsor) | `backend/analyzer.py`: *Generate AI Analysis* sends **redacted fields only** to a Featherless model and returns a summary and remediation checklist; offline rule engine as fallback. |

## 🌐 Live Demo

**Live demo: https://shadowguard-ai-wxbl.onrender.com**

Public demo instance with synthetic data; production runs locally on the endpoint; free tier may take ~50 s to wake.

- **Replay agent attack.** Click **Replay agent attack** on *Security Overview* or *Incidents*. A fake `autogpt` agent reads `.env`, runs `cat ~/.aws/credentials` and sends an AWS key to OpenAI, one step every 3 s under a new session. The banner and toasts show the score climbing 3 → 6 → 10 (critical); click **View incident** for the score breakdown and the chain timeline. One replay runs at a time (20 s cooldown).
- **Live Test Console.** Open *Live Test Console*, pick a destination in the composer (e.g. *Ollama · Shadow*) and click a starter such as **AWS key**, or type your own prompt. ShadowGuard replies with what it intercepted, shows your message masked, and links the incident (AWS key → Ollama = 6/10 high). Use fake data only.
- **Generate AI Analysis** on any incident gives a summary and a remediation checklist from redacted fields only (Featherless if configured, otherwise the offline rules).

**Pitch deck:** [ShadowGuard AI — Pitch Deck (PDF)](docs/ShadowGuard_AI_Pitch.pdf)

Hosting setup: [docs/DEPLOY.md](docs/DEPLOY.md) (Render free tier, `render.yaml` Blueprint).

---

# ShadowGuard AI

**ShadowGuard AI shows which processes on a machine are talking to which AI providers — without decrypting anything — inspects payloads only where plaintext legitimately exists, and catches AI agents that read your secrets and send them out.**

Built for the *AI Shadow IT & Agentic Data Exfiltration* problem: developers and autonomous agents (Cursor, AutoGPT, custom scripts) paste credentials and personal data into AI tools nobody approved, and a prompt guardrail can't see traffic that happens across local servers, browser tabs and agents.

![Overview](docs/screenshots/overview.png)

## Three standout features

1. **Zero-decryption Shadow AI inventory.** A live table of *process → AI provider → Approved or SHADOW*, built from connection metadata (process name, PID, remote host and port) and request logs. No TLS interception anywhere.
2. **Agentic exfiltration chain detection.** When an agent reads a sensitive file (`.env`, `~/.aws/credentials`), runs a shell command, and then sends a credential to an LLM within 60 seconds, ShadowGuard raises **one** correlated critical incident and shows it as a timeline — even when the events arrive one at a time.
3. **Privacy-preserving AI triage.** "Generate AI Analysis" sends the Featherless LLM only redacted fields (provider, scores, a one-sentence context, redacted evidence) — never a payload, a raw secret or a fingerprint. If the LLM is slow or unavailable, a deterministic rule engine answers instead.

Also: explainable 0–10 risk scores with a factor-by-factor breakdown, validators that keep false positives down (Luhn, Verhoeff, JWT header check, entropy exclusions), and India-aware PII detection (Aadhaar, PAN, +91 phone numbers).

## Screenshots

| Overview | Shadow AI inventory |
|---|---|
| ![Overview](docs/screenshots/overview.png) | ![Inventory](docs/screenshots/inventory.png) |
| **Incidents** | **Toast on a new critical incident** |
| ![Incidents](docs/screenshots/incidents.png) | ![Critical toast](docs/screenshots/toast_critical.png) |
| **Incident detail: score 10, chain timeline, AI analysis** | **Backend offline** |
| ![Incident detail](docs/screenshots/detail_score10.png) | ![Offline](docs/screenshots/offline.png) |
| **Live Test Console: scan a prompt, then see the incident it raises** | **Public demo: Replay agent attack builds a 10/10 chain** |
| ![Live Test Console](docs/screenshots/test_console.png) | ![Replay agent attack](docs/screenshots/replay_agent.png) |

## Architecture

![ShadowGuard AI system architecture](docs/architecture.jpg)

Text version (also in [docs/architecture_diagram.txt](docs/architecture_diagram.txt)):

```text
 INPUT A: live collector (collector.py)          INPUT B: HTTP request logs (JSONL)
 psutil, every 3 s, ESTABLISHED connections       load_demo.py / demo_reset.py (batch)
 metadata only: process, PID, remote host:port    demo_agent.py (live, one event every 3 s)
 NO payload, NO decryption                        payload = request body, already plaintext
                 |                                                  |
                 | in-process call                                   | POST /api/ingest
                 +------------------------+-------------------------+
                                          v
                      main.py  process_events()   (one lock, shared by both inputs)
   1. validate_event()     schema, event_type in {ai_request, connection, shell_exec, file_read}
   2. classify()           host / port / path -> provider + approved or SHADOW      [providers.py]
   3. scan_payload()       regex + validators + entropy + agent tool_calls          [detectors.py]
   4. mask_secrets()       redact by offsets IN MEMORY; payload is then dropped     [detectors.py]
   5. insert_event()       metadata + redacted findings + fingerprint (no payload)  [models.py]
   6. fetch_session()      reload each touched session (last 10 min) from SQLite    [models.py]
   7. correlate_events()   group by session, score, detect read -> leak chain       [correlator.py]
   8. upsert_incident()    one incident per session, updated in place              [models.py]
                                          |
                                          v
                     SQLite backend/shadowguard.db (git-ignored, local only)
                     events | event_findings | incidents | findings  (no payload column)
                                          |
        +---------------------------------+-----------------------------------+
        v                                                                     v
 GET /api/stats, /api/incidents, /api/incidents/{id}, /api/health   POST /api/incidents/{id}/analyze
        |                                                                     |
        v                                                                     v
 React + Vite dashboard (polls every 3 s)                analyzer.py: redacted fields only
 Overview . Inventory . Incidents . Detail               -> Featherless LLM (10 s timeout)
 toasts on new critical incidents / score jumps          -> offline rule engine on failure
```

**Stack:** Python 3.11+ · FastAPI · Uvicorn · Pydantic v2 · SQLite (`sqlite3`) · psutil · `openai` client (Featherless's OpenAI-compatible API) · React + Vite + Tailwind CSS · Recharts · lucide-react.

## How we meet "no SSL decryption"

ShadowGuard never intercepts or decrypts TLS. It has two input tiers:

- **Metadata (always on).** The collector reads `psutil.net_connections()` every 3 seconds and maps each established connection to its process name, PID and remote host/port. Matching hosts and ports (e.g. `api.openai.com:443`, `localhost:11434` for Ollama) against the provider registry tells us *who talks to which AI provider* without reading a single byte of payload.
- **Payload inspection only where plaintext already exists.** Local LLM servers such as Ollama on `localhost:11434` speak plain HTTP; the opt-in [Local LLM Guard](#local-llm-guard) relay reads those prompts live. Organisations also already export HTTP request logs from API gateways, SDK logging hooks or egress proxies, and ShadowGuard scans those (JSONL). It never decrypts anything to get them.

## Privacy guarantees (as implemented)

- **Payloads are never stored.** Each payload is scanned, then redacted in memory using the finding offsets; only event metadata is written. The `events` table has no payload column.
- **Findings keep redacted evidence only.** Credentials are shown as first 4 + `*` + last 4 (`AKIA************MPLE`), PII as all but the last 4 (`XXXX XXXX 3346`, `p***@example.com`), private keys as `-----BEGIN RSA PRIVATE KEY----- [redacted]`.
- **Fingerprints are keyed and stay local.** Each finding stores a fingerprint, the first 12 hex characters of HMAC-SHA256 of the matched value. The same value always gets the same fingerprint on this install, so "this key leaked 4 times" still works. Without the key, nobody can recover a value from its fingerprint, not even a short one like a phone number. The key comes from the `FINGERPRINT_KEY` environment variable, or a random 32-byte key generated on first run in `backend/.fingerprint_key`. That file is git-ignored, never logged, and never leaves this machine. Fingerprints are stored locally and are **not** sent to the LLM.
- **The LLM sees only redacted fields:** `provider`, `sanctioned`, `source`, `severity`, `score_breakdown`, `agent_context`, and each finding's `category` / `rule` / `redacted_evidence`. The server logs exactly what it sends, once per call, so this can be shown live.
- **Local only.** The API binds to `127.0.0.1`; the database is a single local, git-ignored file. The Featherless call is the only outbound request, and only when an admin clicks *Generate AI Analysis*.

## Setup

Requirements: Python 3.11+, Node.js 20.19+, Google Chrome (or any modern browser).

### Windows (PowerShell)

```powershell
# Backend
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env     # then edit .env: FEATHERLESS_API_KEY, FEATHERLESS_MODEL
python main.py                  # http://127.0.0.1:8000  (API docs at /docs)

# Frontend (second terminal)
cd frontend
npm install
npm run dev                     # http://127.0.0.1:5173
```

### macOS / Linux

```bash
# Backend
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env            # then edit .env: FEATHERLESS_API_KEY, FEATHERLESS_MODEL
python main.py                  # http://127.0.0.1:8000  (API docs at /docs)

# Frontend (second terminal)
cd frontend
npm install
npm run dev                     # http://127.0.0.1:5173
```

`backend/.env` is git-ignored. Never commit a real key. Without a key, *Generate AI Analysis* uses the built-in offline rules.

### Environment flags

| Variable | Default | Effect |
|---|---|---|
| `FEATHERLESS_API_KEY`, `FEATHERLESS_MODEL` | unset | Enable the Featherless LLM for *Generate AI Analysis*; otherwise offline rules are used. |
| `COLLECTOR_ENABLED` | `1` | Set to `0` to turn off the live connection collector (e.g. if the OS blocks `psutil`). |
| `SEED_MOCK` | unset | Set to `1` to seed `frontend/src/mocks/mock_incidents.json` into an empty database. |
| `FINGERPRINT_KEY` | unset | Secret for keyed fingerprints. If unset, a random key is generated once into `backend/.fingerprint_key` (git-ignored). |
| `DEV_RELOAD` | unset | Set to `1` for Uvicorn auto-reload during development. Off by default because on Windows a reload can leave an old worker serving stale code. |
| `DEPLOY_MODE` | unset | Set to `1` for the public demo: binds `0.0.0.0:$PORT`, collector off, relay not started, fresh demo database with scenarios 01–04, 06, 07, 100 KB body cap and per-IP rate limit. See [docs/DEPLOY.md](docs/DEPLOY.md). |
| `PORT` | `10000` | Listening port in `DEPLOY_MODE` (set by the host). |

PowerShell: `$env:COLLECTOR_ENABLED="0"; python main.py` · bash: `COLLECTOR_ENABLED=0 python main.py`

## Run

### One command (recommended for the demo)

From the repo root, after the one-time setup above:

```powershell
# Windows
powershell -ExecutionPolicy Bypass -File .\start_demo.ps1                 # collector on
powershell -ExecutionPolicy Bypass -File .\start_demo.ps1 -NoCollector    # collector off
powershell -ExecutionPolicy Bypass -File .\stop_demo.ps1                  # stop both servers
```

```bash
# macOS / Linux
./start_demo.sh                  # or: ./start_demo.sh --no-collector
```

The launcher:
1. Frees ports 8000, 5173 and 11435.
2. Regenerates the demo data with recent timestamps and resets the database.
3. Starts the backend in its own window and waits for `/api/health`.
4. Loads scenarios 01–04, 06 and 07, then restores `demo_data/` so the repo stays clean.
5. Starts the [Local LLM Guard](#local-llm-guard) relay on `127.0.0.1:11435` in its own window (skip with `-NoRelay` / `--no-relay`).
6. Starts the frontend in its own window.
7. Prints the URLs, the active analyzer engine and the relay address.

The windows keep running until you close them or run `stop_demo.ps1`.

- Dashboard: **http://127.0.0.1:5173**
- API: **http://127.0.0.1:8000** (interactive docs at `/docs`)

The servers bind to `127.0.0.1` on purpose. Use that address rather than `localhost`, which on some Windows machines resolves to IPv6 first.

Then play the hero scenario live: `cd backend` and `python demo_agent.py`, or click **Replay agent attack** on the Overview or Incidents page.

The backend also serves the built dashboard itself at http://127.0.0.1:8000 (from `backend/static`, the committed output of `npm run build`), so one URL works without Node. That is how the public demo runs.

## Demo routine

Manual alternative to the launcher, before going on stage (and before every rehearsal):

```bash
cd backend
# stop the server first, then:
python demo_reset.py --fresh --load 01 02 03 04 06 07
```

This regenerates the demo data with recent timestamps, deletes the database, waits for you to start `python main.py` in another terminal, and then loads scenarios 01–04, 06 and 07. Scenario 05 is not preloaded: it is played live. `--fresh` rewrites `demo_data/*.jsonl`; don't commit those changes.

### Demo scenarios

`backend/generate_data.py` writes these files to `demo_data/` (fake data only):

| File | What it contains | Expected result |
|---|---|---|
| `01_benign_openai.jsonl` | Normal coding questions to OpenAI | 0 findings, 0 incidents |
| `02_shadow_traffic.jsonl` | `python.exe` → Ollama, `node.exe` → Hugging Face, connections to Anthropic | 0 incidents; SHADOW rows in the AI Inventory |
| `03_key_leak.jsonl` | AWS keys, OpenAI, Anthropic and Hugging Face keys, GitHub token, JWT, RSA private key | Credential incidents, score ≥ 4 |
| `04_pii_leak.jsonl` | Emails, +91 phones, PAN, Verhoeff-valid Aadhaar, Luhn-valid cards | PII incidents, score ≥ 3 |
| `05_agent_chain.jsonl` | `autogpt`: `.env` read → `cat ~/.aws/credentials` → AWS key to OpenAI (played live by `demo_agent.py`) | 1 chain incident, 10/10 critical |
| `06_false_positive_bait.jsonl` | UUIDs, git SHAs, MD5s, base64 image, numbers that fail Luhn/Verhoeff | 0 findings, 0 incidents |
| `07_agent_variety.jsonl` | `claude-agent`: `~/.ssh/id_rsa` read → Anthropic-style `read_file` tool call + fake OpenSSH private key to Ollama | Chain incident, 10/10 critical |
| | `langchain-agent` (`agent-lc-02`): `curl … \| sh` shell command, then a clean prompt to OpenAI | 3/10 medium (shell only) |
| | `langchain-agent` (`agent-lc-03`): reads `config.yaml`, then a clean prompt to OpenAI | No incident |

On stage:

1. **Overview** — AI requests, shadow AI share, Incidents Detected and providers.
2. **AI Inventory** — which process uses which provider, approved vs SHADOW.
3. Run `python demo_agent.py` — the agent-chain incident builds live: score 3 → 6 → 10, with toast notifications.
4. **Incident detail** — risk gauge 10/10, the score breakdown, and the chain timeline `.env` read → shell command → AWS key sent to OpenAI within seconds.
5. **Generate AI Analysis** — Featherless returns a summary and a remediation checklist, from redacted data only.
6. The false-positive bait file (UUIDs, git SHAs, MD5s, a base64 image, numbers that fail Luhn/Verhoeff) produced zero findings.
7. **Live Test Console** — let a judge type a prompt (or click an example) and watch it get scanned, masked and scored live.
8. **Local LLM Guard** — run `python relay_demo.py`: two real prompts go through the relay to Ollama; the one with a fake AWS key and Aadhaar becomes a `python.exe` → Ollama (shadow) incident within seconds, even if Ollama isn't installed.

### Live Test Console

The **Live Test Console** page (`/test-console`) is a chat where anyone can type what an employee might paste into an AI tool and watch ShadowGuard intercept it:

- **Starter cards.** An empty chat offers three starters (AWS key, customer CSV row, harmless coding question). Once the chat has started, the same examples appear as chips above the composer and fill the box.
- **Masked bubbles.** Your message appears as a chat bubble with every finding replaced by a redaction chip. *Show what I typed* reveals the original; it is kept only in the browser's memory.
- **ShadowGuard verdicts, not AI answers.** Each reply comes from ShadowGuard, not from a model: what was intercepted (category, rule, redacted evidence), how the request was logged, and the chat's incident with its severity, score and a link to the detail page. A message with no findings says "No sensitive data found in this message"; if the chat already has an incident, it is shown as "Earlier in this chat".
- **Destination pill.** The pill in the composer picks the simulated destination: OpenAI (approved), or Ollama, Hugging Face, Anthropic (shadow). The gear button sets the process name recorded as the source.
- **One chat = one session.** All messages in a chat share a session, so the score grows as more is leaked (for example an AWS key, then a customer row, in the same chat). **New chat** starts a new session.

Under the hood, each message goes through `POST /api/scan` (detect and mask; nothing stored or logged), is posted to the local `/api/ingest` as a valid `ai_request` event, and is correlated like real traffic.

Everything is **simulated**: messages only reach ShadowGuard's local ingest, never an AI provider. Use fake data only. Detection needs realistic formats: a key or number must look like the real thing (e.g. `AKIA` + 16 characters, a Luhn-valid card, a Verhoeff-valid Aadhaar), so made-up strings like "my password is 1234" are not flagged. The starters use documented fake values (`AKIAIOSFODNN7EXAMPLE`, the `4111 1111 1111 1111` test card, a Verhoeff-valid fake Aadhaar). Expected results in a fresh chat: AWS key → Ollama scores 6 (high); the Aadhaar + card + email row → OpenAI scores 3 (medium, 3+ PII items); the harmless question raises nothing.

### Local LLM Guard

`backend/llm_relay.py` inspects **real** prompts sent to a local Ollama server, with no simulation and no TLS involved.

- **Why this is legitimate plaintext.** Ollama listens on `localhost:11434` and speaks plain HTTP. The prompt never leaves the machine encrypted, so there is nothing to decrypt: no certificates, no TLS interception.
- **Opt-in.** The relay listens on `127.0.0.1:11435` and forwards to Ollama (`OLLAMA_UPSTREAM`, default `http://127.0.0.1:11434`). Only clients that set `OLLAMA_HOST=127.0.0.1:11435` go through it; everything else talks to Ollama directly as before.
- **Observe only.** Requests and responses are passed through unchanged, streaming included (Ollama's NDJSON arrives token by token). Nothing is blocked or modified.
- **What it does.** For `POST /api/generate`, `/api/chat` and `/v1/chat/completions` it identifies the calling process from the client's source port (psutil), sends the body to `POST /api/ingest` as an `ai_request` event (`destination` `localhost`, port 11434, `session_id` `relay:<pid>`), and only then forwards the request. The backend scans, redacts and correlates it like any other event, so incidents show the real process (e.g. `python.exe`) talking to Ollama (shadow). Other paths, such as `GET /api/tags`, pass straight through.
- **Never in the way.** If ShadowGuard's ingest is down, the relay logs a warning and still forwards the request. If Ollama is down, the client gets `502 {"error": "Ollama not reachable; request was still scanned by ShadowGuard"}`.
- **No bodies in logs.** The relay logs method, path, process, size and status only. Payloads are redacted by the backend before anything is stored.

```powershell
cd backend
python llm_relay.py                      # started automatically by start_demo.ps1
$env:OLLAMA_HOST = "127.0.0.1:11435"     # opt a client in (macOS/Linux: export OLLAMA_HOST=127.0.0.1:11435)
ollama run llama3.2:1b "hello"           # or any Ollama client / SDK
python relay_demo.py                     # sends one clean and one leaking prompt (OLLAMA_MODEL, default llama3.2:1b)
```

With the demo prompts, the clean one raises nothing, and the one with `AKIAIOSFODNN7EXAMPLE` and a fake Aadhaar scores 8 (critical): unsanctioned provider +2, credential +4, PII +2.

Optional live traffic: `python ai_traffic_sim.py` opens real connections to OpenAI and Hugging Face for the collector to detect.

## API

| Method | Path | Returns |
|---|---|---|
| POST | `/api/ingest` | Body: JSON list of events. `{"status","processed","incidents","skipped"}`; malformed events are skipped, not fatal. |
| GET | `/api/incidents` | All incidents, newest first. |
| GET | `/api/incidents/{id}` | One incident plus its trigger `events` (metadata only). |
| POST | `/api/incidents/{id}/analyze` | The incident with `ai_analysis` (cached after the first call). `404` if unknown. |
| GET | `/api/stats` | Totals, incidents by severity, traffic by provider, the process→provider inventory, per-minute timeline. |
| GET | `/api/health` | `{"status","db","analyzer","collector","mode"}` with `analyzer` = `featherless:<model>` or `offline-rules`, `collector` = `on` or `off`, `mode` = `local` or `deploy`. |
| POST | `/api/demo/replay-agent` | Replays the scenario-05 agent attack (4 events, 3 s apart, new session each time) in the background. `202` with `session_id` and `event_ids`; `429` with `retry_after` within 20 s of the last replay. |
| POST | `/api/scan` | Body `{"text": "..."}` (max 100 KB). `{"findings":[{"category","rule","redacted_evidence"}],"masked_text"}`. Raw text and values are never returned, logged or stored. Used by the Live Test Console. |

Event types: `ai_request`, `connection`, `file_read`, `shell_exec`. Full contracts: Section 6 of the [original build plan](docs/development/original-spec.md).

## Detection rules

| Category | Rules | Validation |
|---|---|---|
| Credential | AWS access key, AWS secret key, OpenAI key, Anthropic key, GitHub token, Hugging Face token, private key block, JWT | OpenAI rule excludes `sk-ant-`; JWT header must decode to JSON with `alg` |
| PII | Email, Indian phone (+91), PAN, Aadhaar, credit card | Aadhaar: Verhoeff checksum; card: Luhn checksum |
| HighEntropy | Secret-like strings | Shannon entropy > 4.0; must mix letters and digits; skips UUIDs, hex hashes, base64 images, paths, tokens over 200 chars |
| AgentAction | Agent shell execution, agent sensitive-file read | Parses OpenAI `tool_calls` and Anthropic `tool_use` blocks in the request body |

Overlaps resolve Credential > PII > HighEntropy, and the longer match wins within a category. Only the first 100 KB of a payload is scanned.

## Risk scoring

Events are grouped into sessions (`session_id`, else `source:pid`) and each touched session is re-scored from its stored history, so a chain is detected even when its events arrive one per request.

| Factor | Points |
|---|---|
| Unsanctioned AI provider | +2 |
| Credential found | +4 |
| High-entropy secret-like string | +2 |
| PII detected (1–2 items) / PII detected (3+ items) | +2 / +3 |
| Agent shell execution | +3 |
| Sensitive file read | +3 |
| Exfiltration chain (sensitive read → credential sent within 60 s) | +3 |

`risk_score = min(10, sum)`; each factor counts once. An incident is created at a score of 3 or more. Severity: critical ≥ 8, high 5–7, medium 3–4. Approved providers: OpenAI and Featherless; every other provider is shadow AI.

## Tests

Plain Python verification scripts in [`tests/`](tests/README.md) (fake data only, no pytest needed):

```bash
python tests/run_all.py            # detectors, correlator, Section 11 acceptance (offline)
python tests/run_all.py --live     # plus live acceptance and the privacy DB scan, with the demo running
```

Code quality: `ruff check` (config in `pyproject.toml`) and `cd frontend && npm run lint` (ESLint flat config). GitHub Actions ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs ruff, the tests, the frontend lint and the build on every push and pull request, and checks that the committed `backend/static` matches the build.

## Limitations

- **Payload inspection only for request logs and plaintext traffic** (such as local Ollama). Live HTTPS traffic is identified by metadata only, never decrypted.
- **Live Gemini detection is off.** Google's API shares IP addresses with Drive, Docs and other Google services, so matching by IP would misreport ordinary Google traffic as Gemini. Logged Gemini requests are still classified.
- **Shared CDN addresses.** Live detection of other cloud providers matches by IP address as well, so traffic to a different site behind the same CDN address can be misattributed.
- **Fingerprints are keyed HMACs; the key never leaves this machine.** Anyone holding both the database and `backend/.fingerprint_key` could brute-force short values such as phone numbers, so keep the two separate. Deleting the key makes all existing fingerprints unmatchable. New ones won't match old ones, but nothing else breaks.
- **Detection is rule-based.** It covers the patterns listed above, not every secret format.
- **Single machine.** No authentication, no multi-user support and no blocking or enforcement, by design for this prototype.

## Team & contributions

- **Mohammad Muzzamil** — lead: backend (ingest, detection, correlation, analyzer, API, Local LLM Guard) and integration.
- **Sai Krishna** — demo data generator, live demo agent, live connection collector and traffic simulator.
- **Chetan Varma Bethalam** — frontend dashboard.
- **Anurag Kanukuntla** — documentation and QA.
- **Nimmala Karthik** — Featherless setup and pitch deck.

Licensed under the [MIT License](LICENSE).

---

## Hackathon submission workflow

### 🛠️ Contribution & Submission Workflow

All teams must follow the official fork-and-pull-request workflow:

1. **Fork this Repository**:
   - One team member should click the **Fork** button at the top right to fork this upstream repository to your personal/team GitHub account.
2. **Add Collaborators**:
   - In your forked repository, navigate to **Settings > Collaborators** and invite all your registered team members.
3. **Clone & Develop Locally**:
   ```bash
   git clone https://github.com/<your-username>/HFT26-TEAM-48.git
   cd HFT26-TEAM-48
   git checkout -b feature/prototype
   ```
4. **Commit & Push Regularly**:
   - Make atomic, descriptive commits throughout the hackathon.
   ```bash
   git add .
   git commit -m "feat: implement core solution architecture"
   git push origin feature/prototype
   ```
5. **Open Pull Request (PR) for Final Submission**:
   - When ready for evaluation, open a **Pull Request** from your fork's `main` branch back to this upstream repository's `main` branch.
   - **PR Title Format**: `[SUBMISSION] TEAM-48 - Converge - AI Shadow IT & Agentic Data Exfiltration Scanner`
   - **PR Description Checklist**:
     - 📌 Solution Overview & Approach
     - 🏗️ Architecture & Tech Stack Details
     - 🚀 Local Setup & Installation Instructions
     - 🎥 Demo Video Link / Live Deployment URL
     - 📸 Key Screenshots & Visuals

---

### 📁 Recommended Project Structure

```
.
├── src/                  # Source code (Frontend / Backend / ML)
├── docs/                 # Documentation, architecture diagrams, slides
├── tests/                # Test suites & verification scripts
├── README.md             # Your project documentation & presentation
└── LICENSE               # Open-source license (MIT recommended)
```

---

### ⚠️ Important Rules & Code of Conduct
* **Upstream Protection**: Do not push directly to this repository's main branch. All evaluation will be conducted on your submitted Pull Request.
* **Original Work**: All code submitted must be developed during the hackathon timeline. Open-source libraries and frameworks are welcomed with proper attribution.
* **Code Freeze**: Final Pull Requests must be submitted before the designated hackathon submission deadline.
