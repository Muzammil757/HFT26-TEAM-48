"""Payload detection and redaction for ShadowGuard AI."""


def scan_payload(payload: str) -> list[dict]:
    """Return findings for secrets/sensitive data in a payload.

    Each finding should match the Finding schema: category, rule, redacted_evidence.
    TODO: implement detection rules.
    """
    return []


def mask_secrets(payload: str) -> str:
    """Return the payload with any detected secrets redacted.

    TODO: implement redaction.
    """
    return payload
