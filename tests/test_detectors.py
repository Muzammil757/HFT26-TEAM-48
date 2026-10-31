"""Detector cases: every rule, validators, false-positive bait, redaction and masking.

    python tests/test_detectors.py

All secrets and personal data here are fake (documented example values or built in code).
"""

import base64
import json

from _common import Checks, demo_events
from detectors import luhn_valid, mask_secrets, scan_payload, verhoeff_valid

AWS_KEY = "AKIAIOSFODNN7EXAMPLE"
AWS_SECRET = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
OPENAI_KEY = "sk-proj-" + "Ab3dEf9hIj2LmN0pQr5tUv7xYz1aBc4dEf6gHi8j"
ANTHROPIC_KEY = "sk-ant-api03-" + "Zx9Yw8Vu7Ts6Rq5Po4Nm3Lk2Ji1Hg0FeDcBaZx9Y"
GITHUB_TOKEN = "ghp_" + "a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8"
HF_TOKEN = "hf_" + "Qw1Er2Ty3Ui4Op5As6Df7Gh8Jk9Lz0Xc1V"
PRIVATE_KEY = ("-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEAfakefakefakeFAKE0123456789abcdef\n"
               "Zm9vYmFyZmFrZWtleWRhdGExMjM0NTY3ODkw\n-----END RSA PRIVATE KEY-----")


def b64url(obj) -> str:
    """Base64url-encode JSON without padding, as in a JWT."""
    return base64.urlsafe_b64encode(json.dumps(obj).encode()).rstrip(b"=").decode()


JWT = (f'{b64url({"alg": "HS256", "typ": "JWT"})}.{b64url({"sub": "1234567890", "name": "Test User"})}'
       ".SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c")

# Independent Verhoeff check-digit generator (not the one under test)
_D = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
      [3, 4, 0, 1, 2, 8, 9, 5, 6, 7], [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
      [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3], [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
      [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]]
_P = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
      [8, 9, 1, 6, 0, 4, 3, 5, 2, 7], [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
      [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8]]
_INV = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9]


def verhoeff_check_digit(base: str) -> str:
    """Verhoeff check digit for a numeric string (independent of the code under test)."""
    c = 0
    for i, n in enumerate(reversed(base)):
        c = _D[c][_P[(i + 1) % 8][int(n)]]
    return str(_INV[c])


AADHAAR_OK = "23456789012" + verhoeff_check_digit("23456789012")
AADHAAR_BAD = "23456789012" + str((int(verhoeff_check_digit("23456789012")) + 1) % 10)
fmt = lambda a: f"{a[:4]} {a[4:8]} {a[8:]}"  # noqa: E731


def openai_body(content, extra_messages=()):
    """An OpenAI chat request body with the given user message."""
    return json.dumps({"model": "gpt-4o", "messages": [*extra_messages, {"role": "user", "content": content}]})


TOOL_CALL = {"role": "assistant", "tool_calls": [{"id": "call_1", "type": "function", "function": {
    "name": "run_shell", "arguments": json.dumps({"cmd": "cat ~/.aws/credentials"})}}]}
ANTHROPIC_TOOL = json.dumps({"model": "claude-x", "max_tokens": 1024, "messages": [
    {"role": "user", "content": "load the config"},
    {"role": "assistant", "content": [{"type": "tool_use", "id": "toolu_01", "name": "read_file",
                                       "input": {"path": "/home/dev/project/.env"}}]}]})
DATA_IMAGE = "data:image/png;base64," + base64.b64encode(bytes(range(240))).decode()

# (name, payload, expected rules, raw values that must never appear in evidence or masked text)
CASES = [
    ("AWS access key", openai_body(f"why does this fail? AWS_ACCESS_KEY_ID={AWS_KEY}"), {"AWS_Access_Key"}, [AWS_KEY]),
    ("AWS secret key", openai_body(f"aws_secret_access_key = {AWS_SECRET}"), {"AWS_Secret_Key"}, [AWS_SECRET]),
    ("AWS secret, quoted", openai_body(f'aws_secret_access_key: "{AWS_SECRET}"'), {"AWS_Secret_Key"}, [AWS_SECRET]),
    ("OpenAI key", openai_body(f"client = OpenAI(api_key='{OPENAI_KEY}')"), {"OpenAI_API_Key"}, [OPENAI_KEY]),
    ("Anthropic key (not OpenAI)", openai_body(f"ANTHROPIC_API_KEY={ANTHROPIC_KEY}"), {"Anthropic_API_Key"}, [ANTHROPIC_KEY]),
    ("GitHub token", openai_body(f"git push with token {GITHUB_TOKEN}"), {"GitHub_Token"}, [GITHUB_TOKEN]),
    ("Hugging Face token", openai_body(f"HF_TOKEN={HF_TOKEN}"), {"HuggingFace_Token"}, [HF_TOKEN]),
    ("Private key block", openai_body(f"is this key valid?\n{PRIVATE_KEY}"), {"Private_Key"}, ["MIIEowIBAAKCAQEA"]),
    ("JWT (header validated)", openai_body(f"decode Authorization: Bearer {JWT}"), {"JWT"}, [JWT]),
    ("Key after \\n escape", openai_body(f"line1\n{AWS_KEY}"), {"AWS_Access_Key"}, [AWS_KEY]),
    ("Aadhaar valid (Verhoeff)", openai_body(f"customer aadhaar {fmt(AADHAAR_OK)}"), {"Aadhaar"}, [fmt(AADHAAR_OK)]),
    ("Aadhaar invalid (Verhoeff)", openai_body(f"customer aadhaar {fmt(AADHAAR_BAD)}"), set(), []),
    ("Card valid (Luhn)", openai_body("card 4111 1111 1111 1111 declined"), {"Credit_Card"}, ["4111 1111 1111 1111"]),
    ("Card invalid (Luhn)", openai_body("card 4111 1111 1111 1112 declined"), set(), []),
    ("PAN", openai_body("PAN on file: ABCDE1234F"), {"PAN"}, ["ABCDE1234F"]),
    ("Phone +91 9876543210", openai_body("call me at +91 9876543210"), {"Phone_IN"}, ["9876543210"]),
    ("Phone +91 98765 43210", openai_body("call me at +91 98765 43210"), {"Phone_IN"}, ["98765 43210"]),
    ("Phone +91-98765-43210", openai_body("call me at +91-98765-43210"), {"Phone_IN"}, ["98765-43210"]),
    ("Phone 98765 43210", openai_body("call me at 98765 43210"), {"Phone_IN"}, ["98765 43210"]),
    ("Email", openai_body("send to priya.sharma@example.com"), {"Email"}, ["priya.sharma@example.com"]),
    ("3+ PII in one CSV row", openai_body(f"debug: priya@example.com,+91-9876543210,ABCDE1234F,{fmt(AADHAAR_OK)}"),
     {"Email", "Phone_IN", "PAN", "Aadhaar"}, ["priya@example.com", "9876543210", fmt(AADHAAR_OK)]),
    ("OpenAI tool_calls run_shell", openai_body(f"here is the output {AWS_KEY}", [TOOL_CALL]),
     {"AWS_Access_Key", "Agent_Shell_Exec", "Agent_Sensitive_File_Read"}, [AWS_KEY]),
    ("Anthropic tool_use .env", ANTHROPIC_TOOL, {"Agent_Sensitive_File_Read"}, []),
    # negatives: zero findings
    ("NEG UUID", openai_body("request id 3f2b8c1e-9a4d-4e7b-b6c2-1d5e8f9a0b3c failed"), set(), []),
    ("NEG git SHA (40 hex)", openai_body("revert commit 9fceb02d0ae598e95dc970b74767f19372d61af8"), set(), []),
    ("NEG MD5 (32 hex)", openai_body("checksum d41d8cd98f00b204e9800998ecf8427e mismatch"), set(), []),
    ("NEG data:image base64 (300+)", openai_body(f"render <img src='{DATA_IMAGE}'>"), set(), []),
    ("NEG camelCase identifier", openai_body("rename handleSubmitFormValidationLogic please"), set(), []),
    ("NEG file path", openai_body("open /home/dev/project/src/components/Dashboard and fix it"), set(), []),
    ("NEG English coding question", openai_body(
        "How do I fix this TypeError in my React useEffect hook when the component unmounts?"), set(), []),
    ("NEG 'my password is 1234'", openai_body("my password is 1234"), set(), []),
]

c = Checks("Detectors (backend/detectors.py)")

c.check("luhn_valid: 4111 1111 1111 1111 valid, ...1112 invalid",
        luhn_valid("4111111111111111") and not luhn_valid("4111111111111112"))
c.check("verhoeff_valid: generated Aadhaar valid, altered digit invalid",
        verhoeff_valid(AADHAAR_OK) and not verhoeff_valid(AADHAAR_BAD))

for name, payload, expected, secrets in CASES:
    findings = scan_payload(payload)
    got = {f["rule"] for f in findings}
    problems = []
    if got != expected:
        problems.append(f"expected {sorted(expected)} got {sorted(got)}")
    masked = mask_secrets(payload, findings)
    for s in secrets:
        if any(s in f["redacted_evidence"] for f in findings):
            problems.append("full value in redacted_evidence")
        if s in masked:
            problems.append("value survives mask_secrets")
    if any(f["start"] is not None and not f["fingerprint"] for f in findings):
        problems.append("missing fingerprint")
    c.check(name, not problems, "; ".join(problems))

# Masking every credential type at once keeps the payload valid JSON
all_creds = openai_body(f"AWS_ACCESS_KEY_ID={AWS_KEY}\naws_secret_access_key = {AWS_SECRET}\nOPENAI={OPENAI_KEY}\n"
                        f"ANTHROPIC={ANTHROPIC_KEY}\nGH={GITHUB_TOKEN}\nHF={HF_TOKEN}\nJWT={JWT}\n{PRIVATE_KEY}")
masked = mask_secrets(all_creds, scan_payload(all_creds))
raw = [AWS_KEY, AWS_SECRET, OPENAI_KEY, ANTHROPIC_KEY, GITHUB_TOKEN, HF_TOKEN, JWT, "MIIEowIBAAKCAQEA"]
c.check("mask_secrets: no credential survives, result is valid JSON",
        not [s for s in raw if s in masked] and json.loads(masked) is not None)

# Demo data files
rules_in = lambda n: [f["rule"] for e in demo_events(n) if e["payload"] for f in scan_payload(e["payload"])]  # noqa: E731
for n in ("01", "02", "06"):
    c.check(f"demo {n}: zero findings", rules_in(n) == [], rules_in(n))
expected_03 = {"AWS_Access_Key", "AWS_Secret_Key", "OpenAI_API_Key", "Anthropic_API_Key", "GitHub_Token",
               "HuggingFace_Token", "JWT", "Private_Key"}
c.check("demo 03: every planted credential found", expected_03 <= set(rules_in("03")), sorted(set(rules_in("03"))))
c.check("demo 04: Aadhaar, card, PAN, phone, email found",
        {"Aadhaar", "Credit_Card", "PAN", "Phone_IN", "Email"} <= set(rules_in("04")), sorted(set(rules_in("04"))))
c.check("demo 05: AWS key + Agent_Shell_Exec", {"AWS_Access_Key", "Agent_Shell_Exec"} <= set(rules_in("05")), rules_in("05"))
c.check("demo 07: private key + agent sensitive read", sorted(rules_in("07")) == ["Agent_Sensitive_File_Read", "Private_Key"],
        rules_in("07"))
c.finish()
