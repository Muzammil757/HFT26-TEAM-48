import { KeyRound, MessageSquareCode, UserRound } from "lucide-react";
import { EXAMPLES } from "../../lib/consoleEvent.js";

const META = {
  aws: { icon: KeyRound, hint: "A developer pastes config with a cloud key" },
  pii: { icon: UserRound, hint: "A customer CSV row with Aadhaar, card and email" },
  harmless: { icon: MessageSquareCode, hint: "An ordinary coding question" },
};

/** Empty-state starter prompts. Clicking one sends it to the selected destination. */
export default function StarterCards({ onPick, disabled }) {
  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
      {EXAMPLES.map((example) => {
        const meta = META[example.id];
        const Icon = meta.icon;
        return (
          <button
            key={example.id}
            type="button"
            disabled={disabled}
            onClick={() => onPick(example)}
            className="group flex flex-col items-start gap-2 rounded-xl border border-line bg-card p-3.5 text-left shadow-[var(--shadow-card)] transition-colors duration-150 hover:border-accent hover:bg-accent-soft/40 disabled:opacity-60"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-md border border-line bg-sunken text-accent">
              <Icon size={15} />
            </span>
            <span className="text-[13px] font-semibold text-fg">{example.label}</span>
            <span className="text-xs leading-5 text-muted">{meta.hint}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Compact example chips above the composer once the chat has started: they fill the box. */
export function ExampleChips({ onFill }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-2xs font-medium uppercase tracking-wide text-muted">Try</span>
      {EXAMPLES.map((example) => (
        <button
          key={example.id}
          type="button"
          onClick={() => onFill(example.text)}
          className="rounded-full border border-line-strong bg-card px-2.5 py-0.5 text-xs text-fg transition-colors duration-150 hover:border-accent hover:bg-accent-soft"
        >
          {example.label}
        </button>
      ))}
    </div>
  );
}
