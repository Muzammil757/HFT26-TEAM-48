import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowUp, Check, ChevronDown, LoaderCircle, Settings2 } from "lucide-react";
import { DESTINATIONS, MAX_PROMPT_CHARS, destinationById } from "../../lib/consoleEvent.js";

/** Small popover anchored above its trigger; closes on outside click or Escape. */
function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event) => ref.current && !ref.current.contains(event.target) && setOpen(false);
    const onKey = (event) => event.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return { open, setOpen, ref };
}

const statusDot = (sanctioned) => (sanctioned ? "bg-approved" : "bg-shadow");

function DestinationPicker({ value, onChange }) {
  const { open, setOpen, ref } = usePopover();
  const d = destinationById(value);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Simulated destination: ${d.provider} · ${d.sanctioned ? "Approved" : "Shadow"}`}
        className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line-strong bg-card px-3 text-xs font-medium text-fg transition-colors duration-150 hover:bg-hover"
      >
        <span className={`h-2 w-2 rounded-full ${statusDot(d.sanctioned)}`} aria-hidden="true" />
        {d.provider}
        <span className={d.sanctioned ? "text-approved" : "text-shadow"}>· {d.sanctioned ? "Approved" : "Shadow"}</span>
        <ChevronDown size={13} className="text-muted" />
      </button>
      {open && (
        <ul
          role="listbox"
          aria-label="Simulated destination"
          className="absolute bottom-10 left-0 z-20 w-64 rounded-lg border border-line bg-card p-1 shadow-[var(--shadow-pop)]"
        >
          <li className="px-2.5 pb-1 pt-1.5 text-2xs font-semibold uppercase tracking-wide text-muted">Simulated destination</li>
          {DESTINATIONS.map((option) => (
            <li key={option.id}>
              <button
                type="button"
                role="option"
                aria-selected={option.id === value}
                onClick={() => {
                  onChange(option.id);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] text-fg hover:bg-hover"
              >
                <span className={`h-2 w-2 rounded-full ${statusDot(option.sanctioned)}`} aria-hidden="true" />
                <span className="flex-1">
                  {option.provider} <span className={option.sanctioned ? "text-approved" : "text-shadow"}>· {option.sanctioned ? "Approved" : "Shadow"}</span>
                  <span className="mono block text-2xs text-muted">
                    {option.host}:{option.port}
                  </span>
                </span>
                {option.id === value && <Check size={14} className="text-accent" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ProcessSettings({ source, onChange }) {
  const { open, setOpen, ref } = usePopover();
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Simulation settings"
        title={`Process name: ${source}`}
        className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors duration-150 hover:bg-hover hover:text-fg"
      >
        <Settings2 size={16} />
      </button>
      {open && (
        <div className="absolute bottom-10 left-0 z-20 w-64 rounded-lg border border-line bg-card p-3 shadow-[var(--shadow-pop)]">
          <label htmlFor="tc-source" className="block text-xs font-medium text-fg">
            Process name
          </label>
          <input
            id="tc-source"
            value={source}
            onChange={(event) => onChange(event.target.value)}
            maxLength={120}
            className="mono mt-1 h-8 w-full rounded-md border border-line-strong bg-card px-2 text-xs text-fg outline-none focus:border-accent"
          />
          <p className="mt-1 text-2xs text-muted">Recorded as the request&apos;s source process.</p>
        </div>
      )}
    </div>
  );
}

/** Chat composer: auto-growing textarea, destination pill, settings, send. Enter sends. */
export default function Composer({ value, onChange, onSend, destinationId, onDestination, source, onSource, busy, offline, inputRef }) {
  const canSend = value.trim() && source.trim() && !busy && !offline;

  // Grow with the content up to ~8 lines, then scroll.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value, inputRef]);

  return (
    <div className="rounded-2xl border border-line-strong bg-card shadow-[var(--shadow-pop)] focus-within:border-accent">
      <textarea
        ref={inputRef}
        rows={1}
        value={value}
        maxLength={MAX_PROMPT_CHARS}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            if (canSend) onSend();
          }
        }}
        placeholder="Paste or type what an employee might send to an AI tool…"
        aria-label="Message"
        className="block max-h-[200px] w-full resize-none bg-transparent px-4 pb-1 pt-3.5 text-[14px] leading-6 text-fg outline-none placeholder:text-subtle"
      />
      <div className="flex items-center gap-1.5 px-2.5 pb-2.5 pt-1">
        <ProcessSettings source={source} onChange={onSource} />
        <DestinationPicker value={destinationId} onChange={onDestination} />
        {value.length > MAX_PROMPT_CHARS * 0.8 && (
          <span className="mono ml-1 text-2xs text-muted">
            {value.length.toLocaleString()} / {MAX_PROMPT_CHARS.toLocaleString()}
          </span>
        )}
        <button
          type="button"
          onClick={onSend}
          disabled={!canSend}
          aria-label="Send"
          title={offline ? "Unavailable while the backend is offline" : "Send (Enter)"}
          className="ml-auto flex h-8 w-8 items-center justify-center rounded-full bg-accent text-white transition-colors duration-150 hover:bg-accent-strong disabled:bg-[#c5d1e2]"
        >
          {busy ? <LoaderCircle size={16} className="spin" /> : <ArrowUp size={17} strokeWidth={2.5} />}
        </button>
      </div>
    </div>
  );
}
