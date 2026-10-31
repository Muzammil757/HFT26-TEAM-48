import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { splitMasked } from "../../lib/redaction.js";
import { Skeleton } from "../ui/States.jsx";

const CHIP_TONE = {
  Credential: "border-critical-line bg-critical-soft text-critical",
  PII: "border-high-line bg-high-soft text-high",
  HighEntropy: "border-medium-line bg-medium-soft text-medium",
};

function RedactionChip({ chip }) {
  return (
    <span
      title={`Redacted ${chip.rule}`}
      className={`mx-0.5 inline-flex items-center gap-1 rounded-md border px-1.5 align-baseline font-sans text-xs font-medium leading-5 ${
        CHIP_TONE[chip.category] || "border-line-strong bg-sunken text-fg"
      }`}
    >
      {chip.label}
      {chip.tail && <span className="mono text-[11px] opacity-80">{chip.rule === "Email" ? chip.tail : `••••${chip.tail}`}</span>}
    </span>
  );
}

/**
 * The employee's message, right-aligned. Shows the MASKED text by default; the raw
 * text lives only in this page's memory and is shown on request.
 */
export default function UserBubble({ message }) {
  const [showRaw, setShowRaw] = useState(false);
  const scanned = Boolean(message.scan);
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="max-w-[85%] rounded-2xl rounded-br-md border border-[#d5e0ee] bg-accent-soft px-4 py-2.5 text-[13px] leading-6 text-fg">
        {showRaw ? (
          <p className="whitespace-pre-wrap break-words">{message.raw}</p>
        ) : scanned ? (
          <p className="whitespace-pre-wrap break-words">
            {splitMasked(message.scan.masked_text, message.scan.findings).map((part, i) =>
              part.chip ? <RedactionChip key={i} chip={part.chip} /> : <span key={i}>{part.text}</span>,
            )}
          </p>
        ) : message.scanError ? (
          <p className="text-muted">Message hidden: it could not be scanned, so it is not displayed.</p>
        ) : (
          <div className="w-64 space-y-1.5 py-1" aria-label="Redacting before display">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => setShowRaw((v) => !v)}
        className="inline-flex items-center gap-1 rounded px-1 text-2xs text-muted transition-colors duration-150 hover:text-fg"
        title="Your original text stays in this browser tab's memory only"
      >
        {showRaw ? <EyeOff size={12} /> : <Eye size={12} />}
        {showRaw ? "Show redacted" : "Show what I typed"}
      </button>
    </div>
  );
}
