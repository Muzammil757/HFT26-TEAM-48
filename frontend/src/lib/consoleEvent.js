/*
 * Live Test Console: simulated destinations, example prompts, and the RawEvent
 * builder. Events go to ShadowGuard's local /api/ingest only — never to a provider.
 */

export const MAX_PROMPT_CHARS = 5000;

// Host / port / path must match providers.py so the backend classifies them.
export const DESTINATIONS = [
  {
    id: "openai",
    provider: "OpenAI",
    sanctioned: true,
    host: "api.openai.com",
    port: 443,
    path: "/v1/chat/completions",
    model: "gpt-4o",
  },
  {
    id: "ollama",
    provider: "Ollama",
    sanctioned: false,
    host: "localhost",
    port: 11434,
    path: "/api/chat",
    model: "llama3",
  },
  {
    id: "huggingface",
    provider: "Hugging Face",
    sanctioned: false,
    host: "api-inference.huggingface.co",
    port: 443,
    path: "/models/mistralai/Mistral-7B-Instruct-v0.2",
    model: "mistralai/Mistral-7B-Instruct-v0.2",
  },
  {
    id: "anthropic",
    provider: "Anthropic",
    sanctioned: false,
    host: "api.anthropic.com",
    port: 443,
    path: "/v1/messages",
    model: "claude-x",
  },
];

export const destinationById = (id) => DESTINATIONS.find((d) => d.id === id) || DESTINATIONS[0];

// Fake data only. AKIAIOSFODNN7EXAMPLE is AWS's documented example key; the
// Aadhaar number passes Verhoeff validation (generated with detectors.verhoeff_valid);
// 4111 1111 1111 1111 is the standard Luhn-valid test card.
export const EXAMPLES = [
  {
    id: "aws",
    label: "AWS key",
    text: "Why does my deploy script fail with AccessDenied? Here is my config:\nAWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE\nregion = ap-south-1",
  },
  {
    id: "pii",
    label: "Aadhaar + card + email row",
    text:
      "Debug this CSV row, the import job rejects it:\n" +
      "name,email,aadhaar,card\n" +
      "Priya Sharma,priya.sharma@example.com,3043 3218 1964,4111 1111 1111 1111",
  },
  {
    id: "harmless",
    label: "Harmless coding question",
    text: "How do I reverse a list in Python without modifying the original list?",
  },
];

export function newSessionId(now = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `console-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(
    now.getMinutes(),
  )}${pad(now.getSeconds())}-${Math.random().toString(36).slice(2, 6)}`;
}

/** One valid ai_request RawEvent (Section 6.1) for the chosen destination. */
export function buildAiRequestEvent({ source, destinationId, sessionId, prompt }) {
  const d = destinationById(destinationId);
  const now = new Date();
  return {
    event_id: `evt_console_${now.getTime()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: now.toISOString().replace(/\.\d{3}Z$/, "Z"),
    source,
    event_type: "ai_request",
    pid: null,
    destination: d.host,
    dst_port: d.port,
    path: d.path,
    session_id: sessionId,
    payload_visible: true,
    // OpenAI-style chat body as a JSON string.
    payload: JSON.stringify({ model: d.model, messages: [{ role: "user", content: prompt }] }),
  };
}
