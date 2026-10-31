"""One log format for every ShadowGuard server process (the API and the LLM relay).

Modules log through logging.getLogger("shadowguard.<area>"), e.g. shadowguard.ingest.
Never log payloads, request bodies or raw secrets: only counts, ids and redacted values.
"""

import logging
import sys

LOG_FORMAT = "%(asctime)s %(levelname)-7s %(name)s: %(message)s"
DATE_FORMAT = "%H:%M:%S"


def setup_logging(level: int = logging.INFO) -> None:
    """Send shadowguard.* logs to stdout in the shared format (safe to call more than once)."""
    logger = logging.getLogger("shadowguard")
    if logger.handlers:
        return
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter(LOG_FORMAT, DATE_FORMAT))
    logger.addHandler(handler)
    logger.setLevel(level)
    logger.propagate = False
