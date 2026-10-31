"""AI provider registry and classification (docs/development/original-spec.md Section 7)."""

PROVIDERS = [
    # (provider_name, host_suffixes, ports, path_prefixes)
    ("OpenAI",        ["api.openai.com"],                     [443],   ["/v1/chat/completions", "/v1/responses", "/v1/completions", "/v1/embeddings"]),  # noqa: E501 (data literal)
    ("Anthropic",     ["api.anthropic.com"],                  [443],   ["/v1/messages"]),
    ("Hugging Face",  ["api-inference.huggingface.co", "huggingface.co"], [443], ["/models/"]),
    ("Featherless",   ["api.featherless.ai"],                 [443],   ["/v1/"]),
    ("Google Gemini", ["generativelanguage.googleapis.com"],  [443],   ["/v1beta/"]),
    ("Ollama",        ["localhost", "127.0.0.1"],             [11434], ["/api/generate", "/api/chat"]),
    ("LM Studio",     ["localhost", "127.0.0.1"],             [1234],  ["/v1/"]),
]
# Sanctioned providers; everything else is SHADOW. OpenAI is the org's approved AI
# provider for the demo; Featherless is our own triage provider (analyzer.py), so the
# server's own analyze calls must not show up as shadow traffic.
APPROVED = {"OpenAI", "Featherless"}

LOCAL_HOSTS = {"localhost", "127.0.0.1"}
LOCAL_LLM_PORTS = {11434: "Ollama", 1234: "LM Studio"}
OPENAI_COMPATIBLE_PATHS = ["/v1/chat/completions", "/v1/completions", "/v1/responses", "/v1/embeddings"]
UNKNOWN_OPENAI_COMPATIBLE = "Unknown OpenAI-compatible"


def _host_and_port(destination: str, dst_port: int | None) -> tuple[str, int | None]:
    """Normalise "https://Host:11434/x" -> ("host", 11434). dst_port wins if given."""
    host = destination.strip().lower()
    if "://" in host:
        host = host.split("://", 1)[1]
    host = host.split("/", 1)[0]
    if ":" in host:
        host, _, port_text = host.rpartition(":")
        if dst_port is None and port_text.isdigit():
            dst_port = int(port_text)
    return host, dst_port


def _host_matches(host: str, suffix: str) -> bool:
    return host == suffix or host.endswith("." + suffix)


def _result(provider: str) -> tuple[str, bool]:
    return provider, provider in APPROVED


def classify(
    destination: str | None, dst_port: int | None, path: str | None
) -> tuple[str | None, bool | None]:
    """Return (provider, sanctioned). (None, None) if not an AI provider.

    Match order: host suffix (+ port if local), then port alone (11434, 1234), then
    OpenAI-compatible path on an unknown host -> ("Unknown OpenAI-compatible", False).
    """
    if not destination:
        return None, None
    host, port = _host_and_port(destination, dst_port)

    # 1. Host suffix. Local hosts only count on their LLM port (localhost:8000 is not AI).
    for name, suffixes, ports, _paths in PROVIDERS:
        if any(_host_matches(host, s) for s in suffixes):
            if host in LOCAL_HOSTS and port not in ports:
                continue
            return _result(name)

    # 2. Well-known local LLM port on any host (e.g. an Ollama box on the LAN).
    if port in LOCAL_LLM_PORTS:
        return _result(LOCAL_LLM_PORTS[port])

    # 3. OpenAI-compatible API path on a host we don't recognise.
    if path and any(path.startswith(p) for p in OPENAI_COMPATIBLE_PATHS):
        return UNKNOWN_OPENAI_COMPATIBLE, False

    return None, None
