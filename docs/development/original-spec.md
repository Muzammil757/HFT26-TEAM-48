Original hackathon build plan; README.md and the code are authoritative where they differ.

# ShadowGuard AI — Master Project Prompt (single source of truth)

> **How to use this prompt:** Paste this entire document into your AI coding tool, then add one line at the end:
> **"I am Member N (role). Do only my part, following this spec exactly."**
> The AI must read the whole document first, then work only on that member's files.

---

## 0. Instructions to the AI assistant reading this

You are joining a 5-person team in the middle of a **24-hour hackathon**. You are a senior engineer helping **one** team member build **their part** of a shared project.

Rules you must follow:

1. **Read this entire document before writing any code.** The data contracts in Section 6 are frozen. Do not rename, remove, or retype any field. Do not invent new endpoints or fields unless the user explicitly asks.
2. **Only create or edit the files owned by the member you are helping** (see Section 10). If a change is needed in someone else's file, tell the user what to ask that teammate for instead of editing it.
3. **Prefer simple, working code over clever code.** No Kafka, no Docker, no live PCAP, no message queues, no ORMs, no auth system, no ML training. Python standard library + the listed packages only.
4. **Use only fake secrets and fake personal data.** Never put a real API key or a real person's data in code or test files.
5. When you finish, give the user: the full file contents, the exact commands to run/test it, and a short checklist of what is done vs. not done.
6. If something in this spec is ambiguous, pick the simplest interpretation that is consistent with the contracts, and state your assumption in one line.

---

## 1. The problem statement (verbatim summary)

**AI Shadow IT & Agentic Data Exfiltration Scanner.**

Employees and developers are rapidly adopting local LLMs, browser AI extensions, and autonomous coding agents (Cursor, AutoGPT, custom LangChain scripts). They paste proprietary code, credentials, and customer PII into unmonitored AI tools, or connect agents to internal systems without governance. A single prompt guardrail cannot fix this, because AI traffic happens across local network traffic, browser extensions, desktop apps and encrypted API calls.

Build a **non-invasive endpoint and network auditing engine** that:

1. Passively inspects local process network connections **or** accepts sample PCAP / HTTP request log uploads (mock logs allowed, no external dataset needed).
2. Identifies requests to known AI providers or local LLM servers (hostnames, endpoints, ports such as **11434 for Ollama**).
3. Analyses outgoing text payloads in real time with **local entropy checks and regex patterns** to detect leaked secrets (API keys, JWTs) and PII.
4. Flags risky **autonomous agent behaviour**, such as agents executing shell commands or reading files without verification.
5. Provides a **local, privacy-focused web dashboard** with AI usage statistics, data-leak alerts, and compliance risk scores.

Constraint: **without invasive SSL decryption or complex enterprise agent deployment.**

Suggested sponsor usage (**Featherless**): an LLM inspects flagged, suspicious payload snippets, assesses sensitivity in context, and generates remediation suggestions for security admins.

---

## 2. Our product: ShadowGuard AI

**One-line pitch:** *"ShadowGuard AI shows which processes on a machine are talking to which AI providers — without decrypting anything — inspects payloads only where plaintext legitimately exists, and catches AI agents that read your secrets and send them out."*

### 2.1 Three standout features (the story we tell judges)

1. **Zero-decryption Shadow AI Inventory** — a live table of *process → AI provider → approved or SHADOW*, built from connection metadata (process name, PID, destination host/port). No TLS interception.
2. **Agentic exfiltration chain detection** — when an agent reads a sensitive file (e.g. `.env`, `~/.aws/credentials`), runs a shell command, and then sends a credential to an LLM within 60 seconds, we raise **one** correlated, critical incident and show it as a timeline.
3. **Privacy-preserving AI triage** — the Featherless LLM analyses incidents and suggests remediation, but **only ever receives redacted evidence and fingerprints, never the raw secret or payload.**

Supporting differentiators:
- **Explainable risk scores** (1–10) with a visible point-by-point breakdown — no black-box ML.
- **Low false positives**: validators (Luhn, Verhoeff, JWT header decoding) and entropy exclusions. We demo a "false-positive bait" file that produces **zero** alerts.
- **India-aware PII**: Aadhaar (Verhoeff-validated), PAN, +91 phone numbers.
- **Secrets are never stored**: payloads are redacted in memory before anything touches the database; we keep only a SHA-256 fingerprint so we can say "this same key leaked 4 times" without holding it.

### 2.2 How we satisfy the "no SSL decryption" constraint (important framing)

We **never** say "decrypted proxy". We have two input tiers:

- **Tier 1 — Metadata (always on, no decryption):** `psutil` maps live network connections to process name + PID + remote IP/port. Matching against known AI hosts/ports gives Shadow AI detection without reading any payload.
- **Tier 2 — Payload inspection (only where plaintext legitimately exists):**
  - Local LLM servers such as Ollama on `localhost:11434` speak **plain HTTP** — no decryption involved.
  - **HTTP request log uploads** (JSONL), which the problem statement explicitly allows (e.g. exported from an API gateway, SDK logging hook, or an organisation's existing egress logs).

### 2.3 Requirement → feature mapping

| PS requirement | Our feature |
|---|---|
| 1. Passive inspection / log upload | `collector.py` (psutil, metadata) + JSONL log ingest via `load_demo.py` / `demo_agent.py` |
| 2. Identify AI providers | `providers.py` registry (hosts, ports, paths) + `APPROVED` allowlist → sanctioned vs SHADOW |
| 3. Entropy + regex detection | `detectors.py`: regex + validators + Shannon entropy |
| 4. Risky agent behaviour | `shell_exec` / `file_read` events + `tool_calls` parsing + chain detection in `correlator.py` |
| 5. Dashboard with stats, alerts, risk scores | React dashboard: Overview, Shadow AI Inventory, Incidents (score breakdown, chain timeline) |
| Featherless suggestion | `analyzer.py` + "Analyze with AI" button (redacted data only) |

---

## 3. Final locked architecture

```
 INPUT A: Live Collector (collector.py, psutil, every 3s)     INPUT B: HTTP request logs (JSONL)
 metadata only, NO decryption                                 load_demo.py (batch) / demo_agent.py (live replay)
                 │                                                          │
                 └───────────────────────────┬──────────────────────────────┘
                                             ▼
                         FastAPI  POST /api/ingest   (list[RawEvent])
                                             │
   1. classify(destination, dst_port, path)  → event.provider, event.sanctioned      [providers.py]
   2. scan_payload(payload)                  → findings with offsets + fingerprints  [detectors.py]
   3. mask_secrets(payload, findings)        → payload redacted IN MEMORY            [detectors.py]
   4. save every event's metadata            → SQLite `events` table (no payload)    [models.py]
   5. correlate_events(events, findings)     → scored Incidents with breakdown       [correlator.py]
   6. insert_incident()                      → SQLite `incidents` + `findings`       [models.py]
                                             │
                                             ▼
   GET /api/stats · GET /api/incidents · GET /api/incidents/{id} · POST /api/incidents/{id}/analyze
                                             │                         │
                                             ▼                         ▼
                 React + Vite + Tailwind dashboard          analyzer.py → Featherless API
                 (polls every 3 seconds)                    (redacted evidence only)
```

### 3.1 Tech stack

- **Backend:** Python 3.11+, FastAPI, Uvicorn, Pydantic v2, SQLite (`sqlite3` from the standard library), `psutil` (collector), `openai` Python package (used against Featherless's OpenAI-compatible API), `requests` (scripts).
- **Frontend:** React + Vite + Tailwind CSS, `recharts` (charts), `lucide-react` (icons). Plain `fetch` — no Redux, no React Query needed.
- **Connection between frontend and backend:** plain **REST/JSON over HTTP** at `http://127.0.0.1:8000`. CORS is already enabled in FastAPI. The frontend **polls every 3 seconds** (no WebSockets/SSE).
- **Storage:** single SQLite file `backend/shadowguard.db` (git-ignored).
- **Server binding:** `127.0.0.1` only (privacy-focused, local). Never `0.0.0.0`.

---

## 4. Current repository status (as of now)

Repo: `https://github.com/Muzammil757/shadowguard-ai` (branch `main`)

```
shadowguard-ai/
├── README.md                  # currently saved as UTF-16 (shows garbage on GitHub) → must be re-saved as UTF-8
├── .gitignore                 # venv/, __pycache__/, *.db
├── backend/
│   ├── main.py                # FastAPI app: lifespan(init_db + seed mock), CORS, GET /api/incidents, POST /api/ingest
│   ├── models.py              # Pydantic: Finding, RawEvent, Incident; SQLite: init_db, insert_incident, fetch_incidents, seed_from_file
│   ├── detectors.py           # STUB: scan_payload() returns [], mask_secrets() returns payload unchanged
│   ├── correlator.py          # STUB: correlate_events() returns []
│   ├── load_demo.py           # reads a .jsonl file and POSTs all events to /api/ingest in one batch
│   └── requirements.txt       # fastapi, uvicorn[standard], pydantic, requests
└── frontend/
    └── mock_incidents.json    # one sample incident in the OLD contract (needs the new fields)
```

### 4.1 What works
- FastAPI app with lifespan DB init, CORS, `GET /api/incidents`, `POST /api/ingest` that loops events → `scan_payload` → `mask_secrets` → `correlate_events` → `insert_incident`.
- SQLite with `incidents` and `findings` tables, cascade delete, connection context manager.
- `load_demo.py` batch loader.

### 4.2 Known problems the Lead is fixing (do not work around them in your own files)
1. `seed_from_file()` loads the mock incident into the real DB on every fresh start → will be gated behind env var `SEED_MOCK=1`.
2. `insert_incident()` deletes any existing row with the same ID → correlator must use `uuid4()` IDs so batches never overwrite each other.
3. Raw events are never stored → a new `events` table (metadata only) is being added for statistics.
4. `scan_payload` and `mask_secrets` would detect secrets twice → new signature `mask_secrets(payload, findings)` uses offsets from `scan_payload`.
5. No provider classification → new `providers.py`.
6. Agent behaviour has no structured event types → `event_type` is now a fixed set (Section 6.1).
7. README encoding.

Until the detectors and correlator are merged, **every ingest saves zero incidents** — this is expected.

---

## 5. End-to-end data flow (what happens to one event)

1. A JSONL line (or a collector reading) becomes a `RawEvent`.
2. `main.py` calls `providers.classify(event.destination, event.dst_port, event.path)` and sets `event.provider` and `event.sanctioned`.
3. If `event.payload_visible` and `event.payload`: `findings = scan_payload(event.payload)`; each finding gets `finding["event_id"] = event.event_id`; then `event.payload = mask_secrets(event.payload, findings)`. The raw payload is **never** written anywhere.
4. The event's metadata (not the payload) is saved in the `events` table.
5. After the whole batch: `incidents = correlate_events(events, findings_by_event)`; each incident is saved.
6. The frontend polls `/api/stats` and `/api/incidents` every 3 seconds and re-renders.
7. When an admin clicks **Analyze with AI**, `POST /api/incidents/{id}/analyze` calls `analyzer.analyze_incident(incident_dict)` with **redacted fields only**, stores the result in `ai_analysis`, and returns the updated incident.

Reference implementation of the ingest loop (owned by Lead, shown so everyone understands the flow):

```python
@app.post("/api/ingest")
def ingest(events: list[RawEvent]) -> dict:
    findings_by_event: dict[str, list[dict]] = {}
    for event in events:
        event.provider, event.sanctioned = classify(event.destination, event.dst_port, event.path)
        if event.payload_visible and event.payload:
            findings = scan_payload(event.payload)
            for f in findings:
                f["event_id"] = event.event_id
            findings_by_event[event.event_id] = findings
            event.payload = mask_secrets(event.payload, findings)
        insert_event(event)                      # metadata only, payload NOT stored
    incidents = correlate_events(events, findings_by_event)
    for incident in incidents:
        insert_incident(incident)
    return {"status": "success", "processed": len(events), "incidents": len(incidents)}
```

---

## 6. FROZEN DATA CONTRACTS

Existing field names are kept; new fields are added. **Do not rename anything.**

### 6.1 RawEvent (input to `POST /api/ingest`; one per JSONL line)

```python
class RawEvent(BaseModel):
    event_id: str                    # unique across ALL files, e.g. "evt_05_004"
    timestamp: str                   # ISO 8601 UTC with "Z", e.g. "2026-10-30T10:00:05Z"
    source: str                      # process / app name: "cursor.exe", "python.exe", "autogpt"
    event_type: str                  # EXACTLY one of: "ai_request" | "connection" | "shell_exec" | "file_read"
    pid: int | None = None
    destination: str | None = None   # hostname for ai_request/connection; file path for file_read; command for shell_exec
    payload_visible: bool
    payload: str | None = None       # request body as a JSON STRING (ai_request only)
    dst_port: int | None = None
    path: str | None = None          # HTTP path, e.g. "/v1/chat/completions"
    session_id: str | None = None    # agent run / user session id; correlator falls back to f"{source}:{pid}"
    # server-filled by main.py — never sent by clients:
    provider: str | None = None
    sanctioned: bool | None = None
```

Event type rules:

| event_type | destination | dst_port | path | payload_visible | payload |
|---|---|---|---|---|---|
| `ai_request` | hostname (`api.openai.com`, `localhost`) | 443 / 11434 / … | HTTP path | `true` | JSON string body |
| `connection` | hostname or IP | port | `null` | `false` | `null` |
| `file_read` | file path (`/home/dev/project/.env`) | `null` | `null` | `false` | `null` |
| `shell_exec` | command string (`cat ~/.aws/credentials`) | `null` | `null` | `false` | `null` |

Example JSONL line:
```json
{"event_id":"evt_03_001","timestamp":"2026-10-30T10:00:05Z","source":"cursor.exe","event_type":"ai_request","pid":4412,"destination":"api.openai.com","dst_port":443,"path":"/v1/chat/completions","session_id":"sess-cursor-01","payload_visible":true,"payload":"{\"model\":\"gpt-4o\",\"messages\":[{\"role\":\"user\",\"content\":\"why does this fail? AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE\"}]}"}
```

### 6.2 Finding (dict returned by `scan_payload`, stored per incident)

```python
{
  "category": "Credential" | "PII" | "HighEntropy" | "AgentAction",
  "rule": "AWS_Access_Key",                 # rule names listed in Section 8.2
  "redacted_evidence": "AKIA************MPLE",  # NEVER the full value
  "start": 142, "end": 162,                 # offsets in the payload; None for AgentAction (not saved to DB)
  "fingerprint": "a3f9c2e81b07",            # sha256(matched_value).hexdigest()[:12]; None for AgentAction
  "event_id": "evt_03_001"                  # added by main.py, NOT by detectors
}
```

Pydantic model (Lead updates `models.py`):
```python
class Finding(BaseModel):
    category: str
    rule: str
    redacted_evidence: str
    event_id: str | None = None
    fingerprint: str | None = None
```

### 6.3 Incident

```python
class Incident(BaseModel):
    incident_id: str                 # str(uuid4())
    timestamp: datetime              # first event in the session
    risk_score: int                  # 0–10
    provider: str                    # e.g. "OpenAI", "Ollama"
    trigger_events: list[str]        # event_ids, time-ordered
    findings: list[Finding]
    agent_context: str               # ONE human-readable sentence
    source: str                      # process name of the session
    sanctioned: bool                 # False if any event in the session went to an unapproved provider
    severity: str                    # "critical" (>=8) | "high" (5–7) | "medium" (3–4) | "low" (<3)
    score_breakdown: list[dict]      # [{"factor": "Credential found", "points": 4}, ...]
    is_chain: bool = False
    ai_analysis: str | None = None   # JSON string from analyzer, or None
```

### 6.4 API endpoints

| Method | Path | Returns | Owner |
|---|---|---|---|
| POST | `/api/ingest` | `{"status","processed","incidents"}` | Lead |
| GET | `/api/incidents` | `list[Incident]`, newest first | Lead |
| GET | `/api/incidents/{id}` | `Incident` + `"events": [...]` | Lead |
| GET | `/api/stats` | stats object below | Lead |
| POST | `/api/incidents/{id}/analyze` | updated `Incident` with `ai_analysis` | Lead (calls Member 2's `analyzer.py`) |

**`GET /api/incidents/{id}`** adds:
```json
"events": [
  {"event_id":"evt_05_002","timestamp":"2026-10-30T10:00:12Z","event_type":"file_read","source":"autogpt","destination":"/home/dev/project/.env","provider":null,"sanctioned":null},
  {"event_id":"evt_05_004","timestamp":"2026-10-30T10:00:31Z","event_type":"ai_request","source":"autogpt","destination":"api.openai.com","provider":"OpenAI","sanctioned":true}
]
```

**`GET /api/stats`:**
```json
{
  "total_events": 214,
  "ai_requests": 180,
  "shadow_requests": 61,
  "providers_seen": 4,
  "incidents_total": 9,
  "incidents_by_severity": {"critical": 2, "high": 3, "medium": 4, "low": 0},
  "by_provider": [
    {"provider": "OpenAI", "sanctioned": true, "count": 120},
    {"provider": "Ollama", "sanctioned": false, "count": 33}
  ],
  "inventory": [
    {"source": "python.exe", "provider": "Ollama", "sanctioned": false, "requests": 33, "last_seen": "2026-10-30T10:04:11Z"}
  ],
  "timeline": [
    {"minute": "2026-10-30T10:00:00Z", "requests": 12, "incidents": 1}
  ]
}
```
Definitions: `ai_requests` = events with `provider != null`; `shadow_requests` = events with `sanctioned == false`; `inventory` = group by (`source`, `provider`) over events with a provider.

**`ai_analysis`** is a JSON **string** of this shape:
```json
{"sensitivity": "critical", "summary": "Two sentences.", "remediation": ["Rotate the AWS key", "Block the agent's egress", "Add .env to the agent's deny list"]}
```

### 6.5 Database (SQLite, owned by Lead)

- `incidents` — existing columns plus `source TEXT`, `sanctioned INTEGER`, `severity TEXT`, `score_breakdown TEXT` (JSON), `is_chain INTEGER`, `ai_analysis TEXT`.
- `findings` — existing columns plus `event_id TEXT`, `fingerprint TEXT`.
- `events` — `event_id PK, timestamp, source, event_type, pid, destination, dst_port, path, session_id, provider, sanctioned`. **No payload column, ever.**

---

## 7. Provider registry (`providers.py`, owned by Lead)

```python
PROVIDERS = [
  # (provider_name, host_suffixes, ports, path_prefixes)
  ("OpenAI",       ["api.openai.com"],                     [443],   ["/v1/chat/completions", "/v1/responses", "/v1/completions", "/v1/embeddings"]),
  ("Anthropic",    ["api.anthropic.com"],                  [443],   ["/v1/messages"]),
  ("Hugging Face", ["api-inference.huggingface.co", "huggingface.co"], [443], ["/models/"]),
  ("Featherless",  ["api.featherless.ai"],                 [443],   ["/v1/"]),
  ("Google Gemini",["generativelanguage.googleapis.com"],  [443],   ["/v1beta/"]),
  ("Ollama",       ["localhost", "127.0.0.1"],             [11434], ["/api/generate", "/api/chat"]),
  ("LM Studio",    ["localhost", "127.0.0.1"],             [1234],  ["/v1/"]),
]
APPROVED = {"OpenAI"}   # the org's sanctioned AI provider for the demo; everything else is SHADOW

def classify(destination: str | None, dst_port: int | None, path: str | None) -> tuple[str | None, bool | None]:
    """Return (provider, sanctioned). (None, None) if not an AI provider.
    Match order: host suffix (+ port if local), then port alone (11434, 1234), then
    OpenAI-compatible path on an unknown host → ("Unknown OpenAI-compatible", False)."""
```

---

## 8. Detection engine (`detectors.py`, owned by Lead; tested by Member 3)

### 8.1 Public API
```python
SENSITIVE_PATHS = [".env", ".ssh/", "id_rsa", ".aws/credentials", ".aws/config",
                   "/etc/passwd", "/etc/shadow", ".npmrc", ".pypirc", ".git-credentials", ".kube/config"]

def scan_payload(payload: str) -> list[dict]: ...
def mask_secrets(payload: str, findings: list[dict]) -> str: ...
def luhn_valid(digits: str) -> bool: ...
def verhoeff_valid(digits: str) -> bool: ...
def shannon_entropy(s: str) -> float: ...
```

### 8.2 Rules

| Category | Rule | Pattern / validation |
|---|---|---|
| Credential | `AWS_Access_Key` | `\b(AKIA\|ASIA)[0-9A-Z]{16}\b` |
| Credential | `AWS_Secret_Key` | `(?i)aws_secret_access_key\s*[:=]\s*["']?([A-Za-z0-9/+=]{40})` (offsets of group 1) |
| Credential | `OpenAI_API_Key` | `\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}` — must NOT match `sk-ant-` |
| Credential | `Anthropic_API_Key` | `\bsk-ant-[A-Za-z0-9_-]{20,}` |
| Credential | `GitHub_Token` | `\bgh[pousr]_[A-Za-z0-9]{36}\b` |
| Credential | `HuggingFace_Token` | `\bhf_[A-Za-z0-9]{30,}\b` |
| Credential | `Private_Key` | `-----BEGIN (?:RSA \|EC \|OPENSSH \|DSA )?PRIVATE KEY-----` |
| Credential | `JWT` | `\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+` **and** base64url-decoded header (pad with `=`) is JSON containing `"alg"` |
| PII | `Email` | standard email regex |
| PII | `Phone_IN` | `(?:\+91[\s-]?)?\b[6-9]\d{9}\b` |
| PII | `PAN` | `\b[A-Z]{5}[0-9]{4}[A-Z]\b` |
| PII | `Aadhaar` | `\b[2-9]\d{3}\s?\d{4}\s?\d{4}\b` **and** `verhoeff_valid(digits)` |
| PII | `Credit_Card` | `\b(?:\d[ -]?){13,19}\b` **and** `luhn_valid(stripped digits)` |
| HighEntropy | `High_Entropy_String` | see 8.3 |
| AgentAction | `Agent_Shell_Exec` | see 8.4 |
| AgentAction | `Agent_Sensitive_File_Read` | see 8.4 |

### 8.3 Entropy (run last)
- Candidates: `[A-Za-z0-9+/=_\-]{20,}`.
- Skip if: overlaps an existing finding; matches a UUID; is pure hex (`^[0-9a-fA-F]+$`, covers git SHAs/MD5); length > 200; appears within 30 chars after `data:image/` or `base64,`.
- Flag if `shannon_entropy(token) > 4.0`.

### 8.4 Agent tool-call parsing
- `json.loads(payload)`; on failure skip.
- OpenAI format: `messages[*].tool_calls[*].function.{name, arguments}` — `arguments` is itself a JSON string; parse it too.
- Anthropic format: `messages[*].content[*]` where `type == "tool_use"` → `name`, `input`.
- `Agent_Shell_Exec` if tool name matches `(?i)bash|shell|exec|run_command|terminal|subprocess|run_shell`, **or** arguments contain `rm -rf`, `curl `, `wget `, `| sh`, `| bash`, `chmod +x`, `nc `, `base64 -d`.
- `Agent_Sensitive_File_Read` if arguments contain any `SENSITIVE_PATHS` entry.
- `redacted_evidence` = tool name + up to 40 chars of argument (e.g. `"run_shell: cat ~/.aws/cred…"`); `start`, `end`, `fingerprint` = `None`.

### 8.5 Overlap, redaction, masking
- Overlap priority: **Credential > PII > HighEntropy** (keep the higher one).
- `redacted_evidence`: Credentials → first 4 + `*` + last 4. PII → mask all but last 4 (`XXXX XXXX 1234`, `j***@gmail.com`). Never the full value.
- `mask_secrets`: findings with offsets, sorted by `start` descending, replace `payload[start:end]` with `[REDACTED:<rule>]`. No second regex pass.
- Scan at most the first 100 KB of a payload.

---

## 9. Correlation & risk scoring (`correlator.py`, owned by Lead; tested by Member 3)

```python
from detectors import SENSITIVE_PATHS
def correlate_events(events: list[RawEvent], findings_by_event: dict[str, list[dict]]) -> list[Incident]: ...
```

1. **Group** into sessions by `event.session_id` or `f"{event.source}:{event.pid}"`; sort by parsed timestamp (`datetime.fromisoformat(ts.replace("Z", "+00:00"))`).
2. **Skip** sessions with no event where `provider is not None` (no AI egress → not our incident).
3. **Score** — each factor at most once per incident; use these exact labels:

| Factor label | Points | Condition |
|---|---|---|
| `Unsanctioned AI provider` | +2 | any event `sanctioned is False` |
| `Credential found` | +4 | any `Credential` finding |
| `High-entropy secret-like string` | +2 | any `HighEntropy` finding |
| `PII detected` | +2 | 1–2 PII findings |
| `PII detected (3+ items)` | +3 | ≥3 PII findings (instead of +2) |
| `Agent shell execution` | +3 | any `shell_exec` event or `Agent_Shell_Exec` finding |
| `Sensitive file read` | +3 | `file_read` event whose destination contains a `SENSITIVE_PATHS` entry, or `Agent_Sensitive_File_Read` finding |
| `Exfiltration chain (sensitive read → credential sent within 60s)` | +3 | sensitive read at T, then a Credential finding on an event in [T, T+60s], same session |

`risk_score = min(10, total)`.

4. **Create an incident only if `risk_score >= 3`.** (Shadow traffic with no leak scores 2 → appears in the inventory, not as an incident.)
5. **Fill fields:** `incident_id=str(uuid4())`; `timestamp`=first event; `provider`=provider of the event carrying a Credential/PII finding, else the most common provider in the session; `source`=first event's source; `sanctioned`=False if any unsanctioned event; `severity` by score; `is_chain`; `trigger_events`=events with findings + all `file_read`/`shell_exec` events, time-ordered; `findings`=all session findings as `Finding(**f)` without `start`/`end`; `ai_analysis=None`.
6. **`agent_context`** — one readable sentence built from facts, e.g.
   - *"autogpt read .env, ran a shell command, then sent an AWS key to OpenAI within 25s."*
   - *"python.exe sent 4 PII items (Aadhaar, card) to unapproved provider Ollama."*

---

## 10. Team, file ownership, and tasks

### 10.1 Ownership (only edit your own files)

The Lead has a paid AI plan and builds all backend logic. Other members use free AI tools, so their tasks are small, self-contained, and do not block the Lead.

| Member | Role | Files |
|---|---|---|
| Member 1 (Lead) | All backend logic, integration, merges, final UI polish | `backend/main.py`, `backend/models.py`, `backend/providers.py`, `backend/detectors.py`, `backend/correlator.py`, `backend/analyzer.py`, `backend/collector.py`, `requirements.txt`, `AGENTS.md` / `CLAUDE.md` |
| Member 2 | Demo data + live demo script | `backend/generate_data.py`, `demo_data/*.jsonl`, `backend/demo_agent.py` |
| Member 3 | Independent testing + README | `backend/test_detectors.py`, `backend/test_correlator.py`, `backend/test_acceptance.py`, `README.md` |
| Member 4 | Frontend | `frontend/**` |
| Member 5 | Featherless setup, pitch deck, backup demo video | `docs/pitch/**`, Featherless account + model choice (no repo code) |

Git workflow: each member works on their own branch (`feat/data`, `feat/tests`, `feat/frontend`, `docs/pitch`), never pushes to `main`, and pushes a first working version within 90 minutes. The Lead merges.

### 10.2 Member 1 — Lead (all backend logic)
Build in this order, committing after each phase:
1. **Core:** update models per Section 6 (RawEvent new + server-filled fields, Finding, Incident; JSON-text columns for `score_breakdown` and `ai_analysis`); gate mock seeding behind `SEED_MOCK=1`; switch ingest to `mask_secrets(payload, findings)` and attach `event_id` to findings; delete the UTF-16 README (Member 3 rewrites it); add `psutil` and `openai` to `requirements.txt`.
2. **`providers.py`** per Section 7.
3. **`events` table** + `insert_event()`; endpoints `GET /api/stats`, `GET /api/incidents/{id}`.
4. **`detectors.py`** per Section 8.
5. **`correlator.py`** per Section 9.
6. Run all six demo files; make Section 11 pass (with Member 3's tests).
7. **`analyzer.py`** + `POST /api/incidents/{id}/analyze` (returns cached `ai_analysis` if present; HTTP 503 with a clear message on failure). Analyzer spec: `analyze_incident(incident: dict) -> dict`; `openai` package with `base_url="https://api.featherless.ai/v1"`, key from env `FEATHERLESS_API_KEY`, model from env `FEATHERLESS_MODEL`; send ONLY `provider`, `sanctioned`, `source`, `severity`, `score_breakdown`, `agent_context`, and each finding's `category`/`rule`/`redacted_evidence` — never payloads; system prompt demands JSON only `{"sensitivity","summary","remediation":[...]}`; 20 s timeout; invalid JSON → `{"summary": raw_text, "remediation": [], "sensitivity": "unknown"}`.
8. **`collector.py`** (first thing cut if time runs out): background thread started in FastAPI lifespan; every 3 s read `psutil.net_connections(kind="inet")`; keep connections whose remote port/host matches an AI provider (cached reverse DNS + port matches for 11434/1234); de-duplicate by (pid, raddr); send new ones through the same pipeline as `event_type="connection"`, `payload_visible=false`; catch `psutil.AccessDenied` / `NoSuchProcess`.
9. Merge the frontend, switch it from mocks to the real API, and polish the UI.

### 10.3 Member 2 — Demo data + live demo script

**A. `generate_data.py`** (Python standard library only) writes six files into `demo_data/` (base time = now − 10 min, events a few seconds apart, `event_id` = `evt_<file#>_<seq>`). It contains its own `verhoeff_checksum()` and `luhn_valid()` helpers to generate valid/invalid numbers. Request body formats:
- OpenAI `/v1/chat/completions`: `{"model":"gpt-4o","messages":[{"role":"user","content":"..."}]}`
- Anthropic `/v1/messages`: `{"model":"claude-x","max_tokens":1024,"messages":[...]}`
- Ollama `localhost:11434` `/api/chat` `{"model":"llama3","messages":[...]}` or `/api/generate` `{"model":"llama3","prompt":"..."}`
- Hugging Face `api-inference.huggingface.co` `/models/<name>`: `{"inputs":"..."}`

Files:
1. `01_benign_openai.jsonl` (~15): normal coding questions to OpenAI from `Code.exe`/`chrome.exe`. No secrets/PII.
2. `02_shadow_traffic.jsonl` (~15): `python.exe` → Ollama 11434, `node.exe` → Hugging Face, a few `connection` events to `api.anthropic.com:443`. Clean prompts.
3. `03_key_leak.jsonl` (~8): fake `AKIAIOSFODNN7EXAMPLE`, `aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY`, an `sk-proj-` + 40 chars key, a `ghp_` + 36 chars token, a programmatically built real-format JWT (`{"alg":"HS256","typ":"JWT"}`), a `-----BEGIN RSA PRIVATE KEY-----` block.
4. `04_pii_leak.jsonl` (~8): "debug this CSV" prompts with emails, `+91 98xxxxxxxx` phones, PAN (`ABCDE1234F` format), **Verhoeff-valid** Aadhaar numbers (first digit 2–9 + 10 random digits + checksum digit), **Luhn-valid** cards (`4111 1111 1111 1111`, `5555 5555 5555 4444`). At least one prompt with ≥3 PII items.
5. `05_agent_chain.jsonl` (hero demo): all events `session_id:"agent-7f2a"`, `source:"autogpt"`, same `pid`, 5–15 s apart, all within 60 s:
   (a) `ai_request` to OpenAI asking to "fix the deployment script";
   (b) `file_read` `/home/dev/project/.env`;
   (c) `shell_exec` `cat ~/.aws/credentials`;
   (d) `ai_request` to OpenAI whose payload contains `AKIAIOSFODNN7EXAMPLE` **and** an assistant message with
   `{"role":"assistant","tool_calls":[{"id":"call_1","type":"function","function":{"name":"run_shell","arguments":"{\"cmd\":\"cat ~/.aws/credentials\"}"}}]}`.
6. `06_false_positive_bait.jsonl` (~10): UUIDs, 40-char git SHAs, 32-char MD5s, a 300+ char `data:image/png;base64,...` string, a 12-digit number that **fails** Verhoeff, a 16-digit number that **fails** Luhn. Must produce **zero** findings.

Validate every line with `json.loads` before writing, and print a per-file count at the end.

**B. `demo_agent.py`**: replays `05_agent_chain.jsonl` one event every 3 s via `POST http://127.0.0.1:8000/api/ingest` (body = a JSON list with one event), rewriting each timestamp to the current UTC time, printing each step, so the incident builds live on stage.

### 10.4 Member 3 — Independent testing + README
Tests are written **from this spec, not from the Lead's code**, so they catch mistakes. Plain `assert` scripts runnable with `python test_x.py` (no pytest required).
- `test_detectors.py`: imports `scan_payload`, `mask_secrets`, `luhn_valid`, `verhoeff_valid` from `detectors`. Checks: every key planted in file 03 is found with the right `rule`; valid Aadhaar/cards in file 04 found, invalid ones ignored; file 05 yields `Agent_Shell_Exec`; file 06 yields **zero** findings; no `redacted_evidence` contains a full secret; after `mask_secrets` no original secret remains.
- `test_correlator.py`: builds `RawEvent` objects by hand (set `provider`/`sanctioned` yourself) and asserts the five cases in Section 9's expectations: scenario 5 → 1 incident, score 10, `is_chain`; shadow-only → 0 incidents; credential to approved provider → score 4 `medium`; credential to unapproved → 6 `high`; read and credential 90 s apart → no chain factor.
- `test_acceptance.py`: with the server running, deletes nothing; POSTs each demo file to `/api/ingest`, then checks `GET /api/incidents` and `GET /api/stats` against Section 11.
- `README.md` (UTF-8): one-paragraph pitch, the three standout features, architecture diagram (Section 3), setup/run commands (Section 12), screenshots placeholder, team credits.
- Until the Lead pushes `detectors.py`/`correlator.py`, the tests will fail — that is expected. Run them after each Lead push and report failures with the exact output.

### 10.5 Member 4 — Frontend
React + Vite + Tailwind in `frontend/`. One `src/api.js` with base URL `http://127.0.0.1:8000` and a `USE_MOCKS` flag. Until the backend is merged, use mock JSON files that match Section 6 **exactly** (update `mock_incidents.json` to the new Incident fields; add `mock_stats.json` and `mock_incident_detail.json` with `events`).

Pages (sidebar nav, app name **"ShadowGuard AI"** with a shield icon):
1. **Overview** — 4 stat cards (AI Requests, Shadow AI Requests in red/amber, Open Incidents, Providers Detected); bar chart requests by provider coloured sanctioned vs shadow; line/area chart of requests + incidents over `timeline`; "Latest critical incidents" (top 5).
2. **Shadow AI Inventory** — table: Process | Provider | Status badge (`Approved` green / `SHADOW` red) | Requests | Last seen; shadow rows first; "Show shadow only" toggle.
3. **Incidents** — list with severity badge, score, source → provider, time, ⛓ icon if `is_chain`; severity filter. Detail view (route or side panel) with:
   - **Score breakdown** (factor + `+points`, total at bottom) — the most important UI element for judges.
   - **Chain timeline** — vertical timeline of `events` with an icon per `event_type` (file, terminal, cloud/network).
   - **Findings table** — category, rule, redacted evidence (monospace), fingerprint.
   - `agent_context` as a summary line.
   - **Analyze with AI** button → `POST /api/incidents/{id}/analyze` (5–20 s: spinner + disabled button); render `JSON.parse(ai_analysis)` inside `try` as a summary + remediation checklist with the note *"Analysed using redacted data only."*

Behaviour: poll `/api/stats` and `/api/incidents` every 3 s (`setInterval`, cleared on unmount); new incidents highlight/slide in for 2 s; loading, empty and error states everywhere ("Backend offline" banner if the API is down).

Design: modern, professional dark security-console look (slate/zinc background), one accent colour, fixed severity colours (critical red, high orange, medium amber, low slate), monospace for evidence/IDs/fingerprints, consistent spacing, must look right on a 1366×768 projector. Libraries: `react-router-dom`, `recharts`, `lucide-react`.

### 10.6 Member 5 — Featherless setup, pitch deck, backup video
1. **Featherless (first, within 45 min):** create an account, get an API key, pick an instruct model that responds in under ~10 s, and confirm it with one test call (curl or a 10-line Python script using the `openai` package with `base_url="https://api.featherless.ai/v1"`). Send the Lead privately: the key, the exact model name, and the test output. **Never commit the key.**
2. **Pitch deck (6–8 slides):** problem (AI Shadow IT + agentic exfiltration), why guardrails fail, our solution + three standout features, architecture (Section 3), how we meet the no-SSL-decryption constraint (Section 2.2), live demo placeholder, requirement→feature table (Section 2.3), impact/future scope (enforcement mode, browser extension, SIEM export), team.
3. **Backup demo video:** once the integrated app runs, screen-record the demo script in Section 13 (≈3 min). If live demo fails on stage, play this.
4. **Demo rehearsal:** run the Section 13 script twice with the team and time it.

## 11. Acceptance criteria — expected results (everyone tests against this)

| Scenario file | Expected result |
|---|---|
| `01_benign_openai.jsonl` | 0 findings, 0 incidents |
| `02_shadow_traffic.jsonl` | 0 findings, 0 incidents; Ollama/Hugging Face/Anthropic appear as SHADOW in inventory |
| `03_key_leak.jsonl` | Credential findings → incident(s), score ≥ 4 |
| `04_pii_leak.jsonl` | PII findings → incident(s), score ≥ 3 |
| `05_agent_chain.jsonl` | 1 incident, `is_chain = true`, score 10, severity critical |
| `06_false_positive_bait.jsonl` | **0 findings**, 0 incidents |

Global checks:
- No raw secret appears anywhere in `shadowguard.db` (`sqlite3 shadowguard.db .dump | grep AKIAIOSFODNN7EXAMPLE` returns nothing).
- Server listens only on `127.0.0.1:8000`.
- Dashboard updates within ~3 s of an ingest.

---

## 12. How to run the full prototype

```bash
# Backend
cd backend
python -m venv venv && source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt                       # fastapi, uvicorn, pydantic, requests, psutil, openai
export FEATHERLESS_API_KEY=... FEATHERLESS_MODEL=...  # Windows: set ...
python main.py                                        # http://127.0.0.1:8000 (docs at /docs)

# Load demo data (new terminal)
python generate_data.py
for f in ../demo_data/0*.jsonl; do python load_demo.py "$f"; done

# Frontend (new terminal)
cd frontend && npm install && npm run dev             # http://localhost:5173
```

Reset between rehearsals: stop the server and delete `backend/shadowguard.db`.

---

## 13. The 3-minute demo script

1. **Overview** — "Here's AI usage on this machine. 61 requests went to providers the company never approved."
2. **Shadow AI Inventory** — "We know `python.exe` is using a local Ollama model — learned from connection metadata alone, zero decryption."
3. Run `demo_agent.py` live — the agent-chain incident appears on screen step by step.
4. **Incident detail** — score 10/10 with breakdown; chain timeline: `.env` read → shell command → AWS key sent to OpenAI within 25 s.
5. Click **Analyze with AI** — Featherless returns remediation steps. "It never saw the key; only the redacted evidence."
6. Load the false-positive bait file — "UUIDs, git hashes, images: zero false alerts."

---

## 14. Out of scope (do NOT build)

Live PCAP capture, TLS/SSL interception, Kafka/queues, Docker, user login/auth, multi-tenant support, ML model training, browser extensions, blocking/enforcement of traffic, cloud deployment. If time remains after everything in Section 11 passes, polish the UI and rehearse the demo instead of adding features.

**Cut order if time runs short:** collector → Featherless → Verhoeff → timeline chart. **Never cut:** provider classification, agent rules, chain detection, score breakdown.