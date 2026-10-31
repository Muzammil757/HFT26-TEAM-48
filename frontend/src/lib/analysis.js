/** ai_analysis is a JSON string (Section 6.4); tolerate plain text. */
export function parseAnalysis(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : { summary: String(value), remediation: [] };
  } catch {
    return { sensitivity: "unknown", summary: value, remediation: [] };
  }
}

/** "featherless:Qwen/Qwen2.5-7B-Instruct" -> { name: "Featherless", detail: "Qwen2.5-7B-Instruct" } */
export function describeEngine(engine) {
  if (!engine) return null;
  if (engine === "offline-rules") return { name: "Offline rules", detail: "Deterministic, no LLM", llm: false };
  const [kind, ...rest] = String(engine).split(":");
  const model = rest.join(":");
  if (kind === "featherless") {
    return { name: "Featherless", detail: model.split("/").pop() || model, full: model, llm: true };
  }
  return { name: engine, detail: "", llm: false };
}
