"""Privacy-preserving AI triage for ShadowGuard AI (CLAUDE.md Section 10.2 step 7).

The LLM only ever sees redacted incident fields (see build_llm_input). If Featherless is
not configured or the call fails, a deterministic rule-based analysis is returned instead,
so analyze_incident() always produces a result.
"""

import json
import os
import re
import sys

FEATHERLESS_BASE_URL = "https://api.featherless.ai/v1"
TIMEOUT_SECONDS = 20
OFFLINE_ENGINE = "offline-rules"

SYSTEM_PROMPT = (
    "You are a security analyst triaging a data-exfiltration incident detected on an "
    "employee endpoint. All evidence is already redacted; never ask for the raw values. "
    "Respond with JSON only, no prose and no code fences, exactly in this shape: "
    '{"sensitivity": "critical|high|medium|low", '
    '"summary": "two sentences explaining what happened and why it matters", '
    '"remediation": ["3 to 5 concrete, actionable steps for a security admin"]}'
)

# Offline remediation, most urgent first
_CREDENTIAL_STEPS = {
    "AWS_Access_Key": "Deactivate and rotate the exposed AWS access key in IAM, then review CloudTrail for any activity using it.",
    "AWS_Secret_Key": "Rotate the AWS secret access key in IAM and review CloudTrail for unauthorised API calls.",
    "OpenAI_API_Key": "Revoke the exposed OpenAI API key in the OpenAI dashboard and issue a new one from a secrets manager.",
    "Anthropic_API_Key": "Revoke the exposed Anthropic API key in the Anthropic console and issue a replacement.",
    "GitHub_Token": "Revoke the GitHub token in GitHub settings and review the organisation audit log for its use.",
    "HuggingFace_Token": "Revoke the Hugging Face token and check the account's repositories for unexpected changes.",
    "Private_Key": "Replace the leaked key pair and remove the old public key from every server and service that trusts it.",
    "JWT": "Invalidate the leaked session token and rotate the JWT signing secret if it may be compromised.",
}
_GENERIC_CREDENTIAL_STEP = "Rotate the exposed credential and move it into a secrets manager."
_ENTROPY_STEP = "Check whether the high-entropy string is a secret; if it is, rotate it."
_PII_STEP = ("Notify the Data Protection Officer and request deletion of the personal data from the AI "
             "provider per its retention policy (DPDP Act / GDPR obligations may apply).")
_CHAIN_STEP = "Isolate the agent session immediately: stop the process and revoke any credentials it could reach."
_SHELL_STEP = "Restrict the agent's shell permissions and require human approval before it runs commands."
_FILE_STEP = "Add .env, ~/.aws and ~/.ssh to the agent's filesystem deny list."
_FILLER_STEPS = [
    "Review the full session timeline with the user who ran the tool.",
    "Remind the team which AI tools are approved and how to share code without secrets or personal data.",
]


def _log(message: str) -> None:
    """Print without ever raising: a cp1252 Windows console can't encode "→"."""
    encoding = getattr(sys.stdout, "encoding", None) or "utf-8"
    print(message.encode(encoding, errors="backslashreplace").decode(encoding), flush=True)


def build_llm_input(incident: dict) -> dict:
    """The ONLY data that may leave the machine: redacted fields, no payloads or fingerprints."""
    return {
        "provider": incident.get("provider"),
        "sanctioned": incident.get("sanctioned"),
        "source": incident.get("source"),
        "severity": incident.get("severity"),
        "score_breakdown": [
            {"factor": b.get("factor"), "points": b.get("points")}
            for b in incident.get("score_breakdown") or []
        ],
        "agent_context": incident.get("agent_context"),
        "findings": [
            {"category": f.get("category"), "rule": f.get("rule"),
             "redacted_evidence": f.get("redacted_evidence")}
            for f in incident.get("findings") or []
        ],
    }


def offline_analysis(llm_input: dict) -> dict:
    """Deterministic rule-based analysis built from the findings and score breakdown."""
    rules = [f["rule"] for f in llm_input["findings"]]
    categories = {f["category"] for f in llm_input["findings"]}
    factors = [b["factor"] for b in llm_input["score_breakdown"]]
    has = lambda prefix: any(f.startswith(prefix) for f in factors)  # noqa: E731

    steps = []
    if has("Exfiltration chain"):
        steps.append(_CHAIN_STEP)
    for rule in rules:
        if rule in _CREDENTIAL_STEPS:
            steps.append(_CREDENTIAL_STEPS[rule])
    if "Credential" in categories and not any(r in _CREDENTIAL_STEPS for r in rules):
        steps.append(_GENERIC_CREDENTIAL_STEP)
    if "PII" in categories:
        steps.append(_PII_STEP)
    if "HighEntropy" in categories:
        steps.append(_ENTROPY_STEP)
    if has("Agent shell execution"):
        steps.append(_SHELL_STEP)
    if has("Sensitive file read"):
        steps.append(_FILE_STEP)
    if has("Unsanctioned AI provider"):
        steps.append(f"Block egress to {llm_input['provider']} or submit it for allowlist review.")
    steps = list(dict.fromkeys(steps))
    steps += [s for s in _FILLER_STEPS if s not in steps][:max(0, 3 - len(steps))]

    score = min(10, sum(b["points"] or 0 for b in llm_input["score_breakdown"]))
    severity = llm_input.get("severity") or "unknown"
    drivers = ", ".join(factors).lower() or "no scored factors"
    return {
        "sensitivity": severity,
        "summary": f"{llm_input.get('agent_context') or 'Suspicious AI activity detected.'} "
                   f"Risk {score}/10 ({severity}) driven by: {drivers}.",
        "remediation": steps[:5],
        "engine": OFFLINE_ENGINE,
    }


def _parse_llm_json(text: str) -> dict:
    """Parse the model's reply; strip ``` fences; on failure keep the raw text as summary."""
    cleaned = re.sub(r"^\s*```(?:json)?\s*|\s*```\s*$", "", text.strip(), flags=re.IGNORECASE)
    try:
        data = json.loads(cleaned)
    except ValueError:
        match = re.search(r"\{.*\}", cleaned, re.DOTALL)  # JSON wrapped in prose
        try:
            data = json.loads(match.group(0)) if match else None
        except ValueError:
            data = None
    if not isinstance(data, dict):
        return {"summary": text.strip(), "remediation": [], "sensitivity": "unknown"}
    remediation = data.get("remediation")
    return {
        "sensitivity": str(data.get("sensitivity") or "unknown"),
        "summary": str(data.get("summary") or ""),
        "remediation": [str(s) for s in remediation] if isinstance(remediation, list) else [],
    }


def _call_featherless(llm_input: dict, api_key: str, model: str) -> dict:
    from openai import OpenAI  # imported lazily so offline mode works without the package

    client = OpenAI(base_url=FEATHERLESS_BASE_URL, api_key=api_key,
                    timeout=TIMEOUT_SECONDS, max_retries=0)
    response = client.chat.completions.create(
        model=model,
        temperature=0.2,
        max_tokens=600,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": "Incident (redacted):\n" + json.dumps(llm_input, ensure_ascii=False)},
        ],
    )
    return _parse_llm_json(response.choices[0].message.content or "")


def analyze_incident(incident: dict) -> dict:
    """Return {"sensitivity", "summary", "remediation", "engine"}. Never raises."""
    llm_input = build_llm_input(incident)
    api_key = os.environ.get("FEATHERLESS_API_KEY", "").strip()
    model = os.environ.get("FEATHERLESS_MODEL", "").strip()

    if not (api_key and model):
        _log(f"[analyzer] Featherless not configured; using {OFFLINE_ENGINE}. "
             f"Redacted input (nothing sent): {json.dumps(llm_input, ensure_ascii=False)}")
        return offline_analysis(llm_input)

    _log(f"[analyzer] Sending to featherless:{model} (redacted fields only): "
         f"{json.dumps(llm_input, ensure_ascii=False)}")
    try:
        result = _call_featherless(llm_input, api_key, model)
    except Exception as exc:  # timeout, auth, network, bad model...
        _log(f"[analyzer] Featherless call failed ({type(exc).__name__}: {exc}); using {OFFLINE_ENGINE}")
        return offline_analysis(llm_input)
    return {**result, "engine": f"featherless:{model}"}
