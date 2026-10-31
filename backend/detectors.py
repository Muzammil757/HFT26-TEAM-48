"""Payload detection and redaction for ShadowGuard AI (docs/development/original-spec.md Section 8).

scan_payload() finds secrets, PII, high-entropy strings and risky agent tool calls in a
request body. mask_secrets() redacts using the offsets scan_payload() returned, so each
secret is detected exactly once.
"""

import base64
import hashlib
import hmac
import json
import math
import os
import re
import secrets
from collections import Counter
from pathlib import Path

SENSITIVE_PATHS = [".env", ".ssh/", "id_rsa", ".aws/credentials", ".aws/config",
                   "/etc/passwd", "/etc/shadow", ".npmrc", ".pypirc", ".git-credentials", ".kube/config"]

MAX_SCAN_CHARS = 100 * 1024

CREDENTIAL, PII, HIGH_ENTROPY, AGENT_ACTION = "Credential", "PII", "HighEntropy", "AgentAction"
_PRIORITY = {CREDENTIAL: 0, PII: 1, HIGH_ENTROPY: 2}  # lower wins on overlap

# JSON escape sequences (\n, \", \\, é …) are blanked to same-length spaces in a scan
# copy, so offsets still index the original payload but "\nAKIA…" has a word boundary.
_JSON_ESCAPE = re.compile(r'\\(?:u[0-9a-fA-F]{4}|.)')

_PRIVATE_KEY_HEADER = r"-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----"

# (category, rule, pattern, capture group whose span is the secret)
_REGEX_RULES = [
    (CREDENTIAL, "AWS_Access_Key", re.compile(r"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b"), 0),
    (CREDENTIAL, "AWS_Secret_Key",
     re.compile(r"(?i)aws_secret_access_key\s*[:=]\s*[\"']?([A-Za-z0-9/+=]{40})"), 1),
    (CREDENTIAL, "OpenAI_API_Key", re.compile(r"\bsk-(?!ant-)(?:proj-)?[A-Za-z0-9_-]{20,}"), 0),
    (CREDENTIAL, "Anthropic_API_Key", re.compile(r"\bsk-ant-[A-Za-z0-9_-]{20,}"), 0),
    (CREDENTIAL, "GitHub_Token", re.compile(r"\bgh[pousr]_[A-Za-z0-9]{36}\b"), 0),
    (CREDENTIAL, "HuggingFace_Token", re.compile(r"\bhf_[A-Za-z0-9]{30,}\b"), 0),
    # Header, plus the body through the END line when present, so masking removes the key.
    (CREDENTIAL, "Private_Key", re.compile(
        _PRIVATE_KEY_HEADER + r"(?:[\s\S]{0,10000}?-----END (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----)?"), 0),
    (CREDENTIAL, "JWT", re.compile(r"\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+"), 0),
    (PII, "Email", re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b"), 0),
    # 10 digits starting 6-9, optionally split 5+5 by one space or dash ("98765 43210").
    (PII, "Phone_IN", re.compile(r"(?:\+91[\s-]?)?\b[6-9]\d{4}[ -]?\d{5}\b"), 0),
    (PII, "PAN", re.compile(r"\b[A-Z]{5}[0-9]{4}[A-Z]\b"), 0),
    (PII, "Aadhaar", re.compile(r"\b[2-9]\d{3}\s?\d{4}\s?\d{4}\b"), 0),
    (PII, "Credit_Card", re.compile(r"\b(?:\d[ -]?){13,19}\b"), 0),
]

_ENTROPY_CANDIDATE = re.compile(r"[A-Za-z0-9+/=_\-]{20,}")
_UUID = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
_HEX = re.compile(r"^[0-9a-fA-F]+$")
_ENTROPY_THRESHOLD = 4.0

_SHELL_TOOL_NAME = re.compile(r"(?i)bash|shell|exec|run_command|terminal|subprocess|run_shell")
_DANGEROUS_ARGS = ["rm -rf", "curl ", "wget ", "| sh", "| bash", "chmod +x", "nc ", "base64 -d"]


# ---------------------------------------------------------------------------
# Validators
# ---------------------------------------------------------------------------

def luhn_valid(digits: str) -> bool:
    """Luhn checksum (credit cards). Non-digit characters are ignored."""
    nums = [int(c) for c in digits if c.isdigit()]
    if len(nums) < 2:
        return False
    total = 0
    for i, n in enumerate(reversed(nums)):
        if i % 2 == 1:
            n *= 2
            if n > 9:
                n -= 9
        total += n
    return total % 10 == 0


_VERHOEFF_D = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
    [2, 3, 4, 0, 1, 7, 8, 9, 5, 6], [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
    [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
    [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
    [8, 7, 6, 5, 9, 3, 2, 1, 0, 4], [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
]
_VERHOEFF_P = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
    [5, 8, 0, 3, 7, 9, 6, 1, 4, 2], [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
    [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
    [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
]


def verhoeff_valid(digits: str) -> bool:
    """Verhoeff checksum (Aadhaar). Non-digit characters are ignored."""
    nums = [int(c) for c in digits if c.isdigit()]
    if not nums:
        return False
    c = 0
    for i, n in enumerate(reversed(nums)):
        c = _VERHOEFF_D[c][_VERHOEFF_P[i % 8][n]]
    return c == 0


def shannon_entropy(s: str) -> float:
    """Shannon entropy in bits per character."""
    if not s:
        return 0.0
    n = len(s)
    return -sum((k / n) * math.log2(k / n) for k in Counter(s).values())


def _jwt_header_valid(token: str) -> bool:
    header = token.split(".", 1)[0]
    try:
        decoded = base64.urlsafe_b64decode(header + "=" * (-len(header) % 4))
        data = json.loads(decoded)
    except (ValueError, UnicodeDecodeError):
        return False
    return isinstance(data, dict) and "alg" in data


# ---------------------------------------------------------------------------
# Redaction helpers
# ---------------------------------------------------------------------------

_FINGERPRINT_KEY_FILE = Path(__file__).parent / ".fingerprint_key"
_fingerprint_key_cache: bytes | None = None


def _fingerprint_key() -> bytes:
    """Secret for keyed fingerprints: env FINGERPRINT_KEY, else a random 32-byte key
    generated on first use and kept in backend/.fingerprint_key (git-ignored).
    The key is never logged and never leaves this machine."""
    global _fingerprint_key_cache
    if _fingerprint_key_cache is None:
        env_key = os.environ.get("FINGERPRINT_KEY", "")
        if env_key:
            _fingerprint_key_cache = env_key.encode("utf-8")
        elif _FINGERPRINT_KEY_FILE.exists():
            _fingerprint_key_cache = bytes.fromhex(_FINGERPRINT_KEY_FILE.read_text().strip())
        else:
            key = secrets.token_bytes(32)
            _FINGERPRINT_KEY_FILE.write_text(key.hex())
            try:
                os.chmod(_FINGERPRINT_KEY_FILE, 0o600)
            except OSError:
                pass  # best effort on Windows
            _fingerprint_key_cache = key
    return _fingerprint_key_cache


def _fingerprint(value: str) -> str:
    """Keyed fingerprint: the same value gives the same fingerprint on this install (so
    repeat leaks are recognised), but without the key it cannot be brute-forced, even
    for short values such as phone numbers."""
    return hmac.new(_fingerprint_key(), value.encode("utf-8"), hashlib.sha256).hexdigest()[:12]


def _redact_credential(value: str) -> str:
    """First 4 + stars + last 4 (stars capped so long tokens stay readable)."""
    if len(value) <= 8:
        return "*" * len(value)
    return value[:4] + "*" * min(len(value) - 8, 16) + value[-4:]


def _redact_pii(rule: str, value: str) -> str:
    """Mask everything except the last 4 alphanumerics, keeping separators."""
    if rule == "Email":
        local, _, domain = value.partition("@")
        return f"{local[:1]}***@{domain}"
    keep = 4
    out = []
    for ch in reversed(value):
        if ch.isalnum():
            out.append(ch if keep > 0 else "X")
            keep -= 1
        else:
            out.append(ch)
    return "".join(reversed(out))


def _evidence(category: str, rule: str, value: str) -> str:
    if rule == "Private_Key":
        return re.match(_PRIVATE_KEY_HEADER, value).group(0) + " [redacted]"
    if category == PII:
        return _redact_pii(rule, value)
    return _redact_credential(value)


def _finding(category: str, rule: str, value: str, start: int, end: int) -> dict:
    return {
        "category": category,
        "rule": rule,
        "redacted_evidence": _evidence(category, rule, value),
        "start": start,
        "end": end,
        "fingerprint": _fingerprint(value),
    }


# ---------------------------------------------------------------------------
# Detection passes
# ---------------------------------------------------------------------------

def _regex_candidates(text: str, scan_text: str) -> list[dict]:
    """All Credential/PII matches that pass their validators (overlaps not resolved)."""
    found = []
    for category, rule, pattern, group in _REGEX_RULES:
        for m in pattern.finditer(scan_text):
            start, end = m.span(group)
            if rule == "Credit_Card":  # the pattern can swallow a trailing separator
                while end > start and scan_text[end - 1] in " -":
                    end -= 1
            value = text[start:end]
            if rule == "JWT" and not _jwt_header_valid(value):
                continue
            if rule == "Aadhaar" and not verhoeff_valid(value):
                continue
            if rule == "Credit_Card" and not luhn_valid(value):
                continue
            found.append(_finding(category, rule, value, start, end))
    return found


def _resolve_overlaps(candidates: list[dict]) -> list[dict]:
    """Credential > PII > HighEntropy; within a category the longer match wins."""
    ranked = sorted(
        candidates,
        key=lambda f: (_PRIORITY[f["category"]], -(f["end"] - f["start"]), f["start"]),
    )
    kept: list[dict] = []
    for f in ranked:
        if not any(f["start"] < k["end"] and k["start"] < f["end"] for k in kept):
            kept.append(f)
    return kept


def _entropy_findings(text: str, scan_text: str, existing: list[dict]) -> list[dict]:
    found = []
    for m in _ENTROPY_CANDIDATE.finditer(scan_text):
        token, start, end = m.group(0), m.start(), m.end()
        if any(start < f["end"] and f["start"] < end for f in existing):
            continue
        if len(token) > 200 or _UUID.match(token) or _HEX.match(token):
            continue
        if not (any(c.isdigit() for c in token) and any(c.isalpha() for c in token)):
            continue  # camelCase identifiers, words
        if token.count("/") > 2:
            continue  # file paths
        before = scan_text[max(0, start - 30):start]
        if "data:image/" in before or "base64," in before:
            continue
        if shannon_entropy(token) > _ENTROPY_THRESHOLD:
            found.append(_finding(HIGH_ENTROPY, "High_Entropy_String", text[start:end], start, end))
    return found


def _flatten_args(args) -> str:
    """Tool arguments as plain text: string values joined (JSON-in-JSON parsed)."""
    if isinstance(args, str):
        try:
            args = json.loads(args)
        except ValueError:
            return args
    if isinstance(args, dict):
        return " ".join(_flatten_args(v) for v in args.values())
    if isinstance(args, list):
        return " ".join(_flatten_args(v) for v in args)
    return "" if args is None else str(args)


def _tool_calls(data) -> list[tuple[str, str]]:
    """(tool name, argument text) for OpenAI tool_calls and Anthropic tool_use blocks."""
    calls = []
    messages = data.get("messages") if isinstance(data, dict) else None
    for msg in messages if isinstance(messages, list) else []:
        if not isinstance(msg, dict):
            continue
        for tc in msg.get("tool_calls") or []:  # OpenAI
            fn = tc.get("function") if isinstance(tc, dict) else None
            if isinstance(fn, dict):
                calls.append((str(fn.get("name", "")), _flatten_args(fn.get("arguments"))))
        content = msg.get("content")
        for block in content if isinstance(content, list) else []:  # Anthropic
            if isinstance(block, dict) and block.get("type") == "tool_use":
                calls.append((str(block.get("name", "")), _flatten_args(block.get("input"))))
    return calls


def _scrub(text: str) -> str:
    """Replace any secret/PII inside tool arguments before it becomes evidence."""
    scan_text = _JSON_ESCAPE.sub(lambda m: " " * len(m.group(0)), text)
    for f in sorted(_resolve_overlaps(_regex_candidates(text, scan_text)),
                    key=lambda f: f["start"], reverse=True):
        text = text[:f["start"]] + f"[REDACTED:{f['rule']}]" + text[f["end"]:]
    return text


def _sensitive_target(args: str) -> str:
    """The argument token that names a sensitive file (falls back to the matched entry)."""
    for token in re.split(r"[\s\"'`;|&<>]+", args):
        if any(p in token for p in SENSITIVE_PATHS):
            return token[:60]
    return next((p for p in SENSITIVE_PATHS if p in args), "a sensitive file")


def _agent_findings(payload: str) -> list[dict]:
    try:
        data = json.loads(payload)
    except ValueError:
        return []
    found, seen = [], set()
    for name, args in _tool_calls(data):
        rules = []
        if _SHELL_TOOL_NAME.search(name) or any(d in args for d in _DANGEROUS_ARGS):
            rules.append("Agent_Shell_Exec")
        if any(p in args for p in SENSITIVE_PATHS):
            rules.append("Agent_Sensitive_File_Read")
        if not rules:
            continue
        clean = _scrub(args)
        for rule in rules:
            if rule == "Agent_Sensitive_File_Read":
                # Name the file that was read, e.g. "run_shell → reads ~/.aws/credentials".
                evidence = f"{name} → reads {_sensitive_target(clean)}"
            else:
                evidence = f"{name}: {clean[:40]}" + ("…" if len(clean) > 40 else "")
            if (rule, evidence) not in seen:
                seen.add((rule, evidence))
                found.append({"category": AGENT_ACTION, "rule": rule, "redacted_evidence": evidence,
                              "start": None, "end": None, "fingerprint": None})
    return found


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def scan_payload(payload: str) -> list[dict]:
    """Return findings for secrets, PII, high-entropy strings and risky agent tool calls.

    Each finding: category, rule, redacted_evidence, start, end, fingerprint
    (main.py adds event_id). AgentAction findings have no offsets or fingerprint.
    Only the first 100 KB is scanned.
    """
    if not payload:
        return []
    text = payload[:MAX_SCAN_CHARS]
    scan_text = _JSON_ESCAPE.sub(lambda m: " " * len(m.group(0)), text)

    findings = _resolve_overlaps(_regex_candidates(text, scan_text))
    findings += _entropy_findings(text, scan_text, findings)
    findings.sort(key=lambda f: f["start"])
    return findings + _agent_findings(payload)


def mask_secrets(payload: str, findings: list[dict]) -> str:
    """Return the payload with each finding's [start:end] span replaced by [REDACTED:<rule>].

    Uses the offsets from scan_payload(); no second regex pass.
    """
    spans = sorted((f for f in findings if f.get("start") is not None),
                   key=lambda f: f["start"], reverse=True)
    last_start = len(payload) + 1
    for f in spans:
        if f["end"] > last_start:  # defensive: never splice overlapping spans
            continue
        payload = payload[:f["start"]] + f"[REDACTED:{f['rule']}]" + payload[f["end"]:]
        last_start = f["start"]
    return payload
