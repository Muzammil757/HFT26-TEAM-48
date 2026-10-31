// Friendly names for detector rules (Section 8.2), used in redaction chips.
export const RULE_LABELS = {
  AWS_Access_Key: "AWS key",
  AWS_Secret_Key: "AWS secret",
  OpenAI_API_Key: "OpenAI key",
  Anthropic_API_Key: "Anthropic key",
  GitHub_Token: "GitHub token",
  HuggingFace_Token: "Hugging Face token",
  Private_Key: "private key",
  JWT: "JWT",
  Email: "email",
  Phone_IN: "phone",
  PAN: "PAN",
  Aadhaar: "Aadhaar",
  Credit_Card: "card",
  High_Entropy_String: "secret",
  Agent_Shell_Exec: "shell command",
  Agent_Sensitive_File_Read: "sensitive file read",
};

export const ruleLabel = (rule) => RULE_LABELS[rule] || rule;

/** Last 4 alphanumerics of the already-redacted evidence ("AKIA****MPLE" -> "MPLE"). */
function tailOf(finding) {
  if (!finding || finding.rule === "Private_Key") return "";
  if (finding.rule === "Email") return finding.redacted_evidence;
  const chars = String(finding.redacted_evidence || "").replace(/[^A-Za-z0-9]/g, "");
  return chars.slice(-4);
}

/**
 * Split masked text ("... [REDACTED:AWS_Access_Key] ...") into text and chip parts.
 * Tokens are matched to findings of the same rule in order (findings come back
 * sorted by position), so each chip can show its redacted tail.
 */
export function splitMasked(masked, findings = []) {
  const pool = findings.filter((f) => f.category !== "AgentAction").map((f) => ({ ...f, used: false }));
  return String(masked || "")
    .split(/(\[REDACTED:[A-Za-z0-9_]+\])/g)
    .filter((part) => part !== "")
    .map((part) => {
      const m = part.match(/^\[REDACTED:([A-Za-z0-9_]+)\]$/);
      if (!m) return { text: part };
      const finding = pool.find((f) => !f.used && f.rule === m[1]);
      if (finding) finding.used = true;
      return { chip: { rule: m[1], category: finding?.category, label: ruleLabel(m[1]), tail: tailOf(finding) } };
    });
}
