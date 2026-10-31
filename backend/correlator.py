"""Event correlation and explainable risk scoring for ShadowGuard AI (docs/development/original-spec.md Section 9)."""

from collections import Counter
from datetime import datetime, timedelta
from uuid import uuid4

from detectors import SENSITIVE_PATHS
from models import Finding, Incident, RawEvent, session_key_for
from providers import APPROVED

CHAIN_WINDOW = timedelta(seconds=60)

# Exact factor labels (Section 9) and their points
UNSANCTIONED = ("Unsanctioned AI provider", 2)
CREDENTIAL = ("Credential found", 4)
HIGH_ENTROPY = ("High-entropy secret-like string", 2)
PII_FEW = ("PII detected", 2)
PII_MANY = ("PII detected (3+ items)", 3)
SHELL = ("Agent shell execution", 3)
FILE_READ = ("Sensitive file read", 3)
CHAIN = ("Exfiltration chain (sensitive read → credential sent within 60s)", 3)

# Plain-word names for agent_context
CREDENTIAL_NAMES = {
    "AWS_Access_Key": "an AWS key",
    "AWS_Secret_Key": "an AWS secret key",
    "OpenAI_API_Key": "an OpenAI API key",
    "Anthropic_API_Key": "an Anthropic API key",
    "GitHub_Token": "a GitHub token",
    "HuggingFace_Token": "a Hugging Face token",
    "Private_Key": "a private key",
    "JWT": "a JWT",
}
PII_NAMES = {"Email": "email", "Phone_IN": "phone", "PAN": "PAN", "Aadhaar": "Aadhaar",
             "Credit_Card": "card"}


def _ts(event: RawEvent) -> datetime:
    return datetime.fromisoformat(event.timestamp.replace("Z", "+00:00"))


def _severity(score: int) -> str:
    if score >= 8:
        return "critical"
    if score >= 5:
        return "high"
    if score >= 3:
        return "medium"
    return "low"


def _sensitive_entry(path: str | None) -> str | None:
    """The SENSITIVE_PATHS entry contained in a file path, if any."""
    return next((p for p in SENSITIVE_PATHS if path and p in path), None)


def _join(items: list[str]) -> str:
    if len(items) <= 1:
        return "".join(items)
    return ", ".join(items[:-1]) + " and " + items[-1]


def _unique(items) -> list:
    return list(dict.fromkeys(items))


def _correlate_session(events: list[RawEvent], findings_by_event: dict[str, list[dict]]) -> Incident | None:
    events = sorted(events, key=_ts)
    if not any(e.provider is not None for e in events):
        return None  # no AI egress -> not our incident

    # (event, finding) pairs in time order; a finding's time is its event's time
    pairs = [(e, {**f, "event_id": f.get("event_id") or e.event_id})
             for e in events for f in findings_by_event.get(e.event_id, [])]
    by_category = lambda c: [(e, f) for e, f in pairs if f["category"] == c]  # noqa: E731
    by_rule = lambda r: [(e, f) for e, f in pairs if f["rule"] == r]  # noqa: E731
    credentials, pii = by_category("Credential"), by_category("PII")

    shell_events = [e for e in events if e.event_type == "shell_exec"] + [e for e, _ in by_rule("Agent_Shell_Exec")]
    # (time, label) of each sensitive read: file_read events and agent tool calls
    reads = sorted(
        [(_ts(e), _sensitive_entry(e.destination).rstrip("/"))
         for e in events if e.event_type == "file_read" and _sensitive_entry(e.destination)]
        + [(_ts(e), "a sensitive file") for e, _ in by_rule("Agent_Sensitive_File_Read")],
        key=lambda r: r[0],
    )
    chain = next(((t_read, _ts(e)) for t_read, _ in reads for e, _ in credentials
                  if t_read <= _ts(e) <= t_read + CHAIN_WINDOW), None)

    # --- score: each factor at most once ---
    breakdown = []
    if any(e.sanctioned is False for e in events):
        breakdown.append(UNSANCTIONED)
    if credentials:
        breakdown.append(CREDENTIAL)
    if by_category("HighEntropy"):
        breakdown.append(HIGH_ENTROPY)
    if pii:
        breakdown.append(PII_MANY if len(pii) >= 3 else PII_FEW)
    if shell_events:
        breakdown.append(SHELL)
    if reads:
        breakdown.append(FILE_READ)
    if chain:
        breakdown.append(CHAIN)
    risk_score = min(10, sum(points for _, points in breakdown))
    if risk_score < 3:
        return None

    # --- fields ---
    leak = credentials + pii
    leak_event = leak[0][0] if leak and leak[0][0].provider else None
    provider = (leak_event.provider if leak_event
                else Counter(e.provider for e in events if e.provider).most_common(1)[0][0])
    sanctioned = not any(e.sanctioned is False for e in events)
    source = events[0].source

    trigger_ids = {f["event_id"] for _, f in pairs} | {
        e.event_id for e in events if e.event_type in ("file_read", "shell_exec")}
    trigger_events = [e.event_id for e in events if e.event_id in trigger_ids]

    # --- one-sentence agent_context built from facts ---
    actions = []
    if reads:
        actions.append(f"read {reads[0][1]}")
    if shell_events:
        actions.append("ran a shell command")
    dest = provider if provider in APPROVED else f"unapproved provider {provider}"
    sent = _unique(CREDENTIAL_NAMES.get(f["rule"], "a credential") for _, f in credentials)
    if pii:
        types = _unique(PII_NAMES.get(f["rule"], f["rule"]) for _, f in pii)
        sent.append(f"{len(pii)} PII item{'s' if len(pii) != 1 else ''} ({', '.join(types)})")
    if not sent and by_category("HighEntropy"):
        sent.append("a high-entropy secret-like string")

    if sent:
        leak_clause = f"sent {_join(sent)} to {dest}"
        if chain:
            leak_clause += f" within {int((chain[1] - chain[0]).total_seconds())}s"
        agent_context = (f"{source} {', '.join(actions)}, then {leak_clause}." if actions
                         else f"{source} {leak_clause}.")
    else:
        agent_context = f"{source} {_join(actions)} while using {dest}."

    return Incident(
        incident_id=str(uuid4()),
        timestamp=events[0].timestamp,
        risk_score=risk_score,
        provider=provider,
        trigger_events=trigger_events,
        findings=[Finding(**{k: v for k, v in f.items() if k not in ("start", "end")}) for _, f in pairs],
        agent_context=agent_context,
        source=source,
        sanctioned=sanctioned,
        severity=_severity(risk_score),
        score_breakdown=[{"factor": label, "points": points} for label, points in breakdown],
        is_chain=chain is not None,
        ai_analysis=None,
    )


def correlate_events(
    events: list[RawEvent], findings_by_event: dict[str, list[dict]]
) -> list[Incident]:
    """Group events into sessions (session_id, else "source:pid") and return one scored
    incident per session that has AI egress and a risk_score of at least 3.

    findings_by_event maps event_id -> findings from detectors.scan_payload().
    """
    sessions: dict[str, list[RawEvent]] = {}
    for event in events:
        sessions.setdefault(session_key_for(event), []).append(event)

    incidents = []
    for session_events in sessions.values():
        incident = _correlate_session(session_events, findings_by_event)
        if incident is not None:
            incidents.append(incident)
    return incidents
