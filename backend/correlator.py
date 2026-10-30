"""Event correlation for ShadowGuard AI."""

from models import Incident, RawEvent


def correlate_events(
    events: list[RawEvent], findings_by_event: dict[str, list[dict]]
) -> list[Incident]:
    """Group related raw events and their findings into incidents.

    findings_by_event maps event_id -> findings from detectors.scan_payload().
    TODO: implement correlation logic.
    """
    return []
