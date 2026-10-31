import { ChevronDown, LoaderCircle, RefreshCw, Send } from "lucide-react";
import { DESTINATIONS, EXAMPLES, MAX_PROMPT_CHARS, destinationById } from "../../lib/consoleEvent.js";
import { ApprovalLabel } from "../ui/Badges.jsx";
import Card from "../ui/Card.jsx";

const input =
  "h-9 w-full rounded-md border border-line-strong bg-card px-3 text-[13px] text-fg outline-none transition-colors duration-150 placeholder:text-subtle hover:border-[#bcc7d6] focus:border-accent";

function Field({ label, hint, htmlFor, children }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-xs font-medium text-fg">
        {label}
      </label>
      {children}
      {hint && (
        <p className="mono mt-1 truncate text-2xs text-muted" title={hint}>
          {hint}
        </p>
      )}
    </div>
  );
}

/** The simulated request: who sends it, where it would go, and what it says. */
export default function ConsoleForm({ form, setForm, onSubmit, onNewSession, busy, offline }) {
  const destination = destinationById(form.destinationId);
  const update = (key) => (event) =>
    setForm((f) => ({ ...f, [key]: event.target.type === "checkbox" ? event.target.checked : event.target.value }));
  const ready = form.source.trim() && form.sessionId.trim() && form.prompt.trim();

  return (
    <Card title="Simulated AI request" subtitle="Compose a prompt as if a local process sent it to an AI provider" icon={Send}>
      <form
        className="space-y-4 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (ready && !busy && !offline) onSubmit();
        }}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Process name" htmlFor="tc-source" hint="source of the ai_request event">
            <input id="tc-source" className={`${input} mono`} value={form.source} onChange={update("source")} maxLength={120} />
          </Field>
          <Field label="Simulated destination" htmlFor="tc-dest" hint={`${destination.host}:${destination.port}${destination.path}`}>
            <div className="relative">
              <select id="tc-dest" className={`${input} cursor-pointer appearance-none pr-8`} value={form.destinationId} onChange={update("destinationId")}>
                {DESTINATIONS.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.provider} — {d.sanctioned ? "approved" : "shadow"}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted" />
            </div>
          </Field>
        </div>

        <Field label="Session ID" htmlFor="tc-session">
          <div className="flex items-center gap-2">
            <input id="tc-session" className={`${input} mono`} value={form.sessionId} onChange={update("sessionId")} maxLength={120} />
            <button
              type="button"
              onClick={onNewSession}
              title="Generate a new session ID"
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-line-strong bg-card px-2.5 text-xs font-medium text-fg transition-colors duration-150 hover:bg-hover"
            >
              <RefreshCw size={13} />
              New
            </button>
          </div>
          <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-fg">
            <input type="checkbox" checked={form.keepSession} onChange={update("keepSession")} className="h-3.5 w-3.5 accent-[var(--color-accent)]" />
            Keep same session
          </label>
          <p className="mt-0.5 pl-[22px] text-2xs text-muted">Off: each send starts a new session, so scores don&apos;t pile up.</p>
        </Field>

        <Field label="Prompt" htmlFor="tc-prompt">
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <span className="text-2xs font-medium uppercase tracking-wide text-muted">Examples</span>
            {EXAMPLES.map((example) => (
              <button
                key={example.id}
                type="button"
                onClick={() => setForm((f) => ({ ...f, prompt: example.text }))}
                className="rounded-full border border-line-strong bg-sunken px-2.5 py-0.5 text-xs text-fg transition-colors duration-150 hover:border-accent hover:bg-accent-soft"
              >
                {example.label}
              </button>
            ))}
          </div>
          <textarea
            id="tc-prompt"
            rows={7}
            value={form.prompt}
            onChange={update("prompt")}
            maxLength={MAX_PROMPT_CHARS}
            placeholder="Type a prompt, or pick an example above. Use fake data only."
            className="mono block w-full resize-y rounded-md border border-line-strong bg-card px-3 py-2 text-xs leading-5 text-fg outline-none transition-colors duration-150 placeholder:font-sans placeholder:text-subtle hover:border-[#bcc7d6] focus:border-accent"
          />
          <p className="mt-1 text-right text-2xs text-muted">
            <span className="mono">{form.prompt.length.toLocaleString()}</span> / {MAX_PROMPT_CHARS.toLocaleString()} characters
          </p>
        </Field>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <p className="flex items-center gap-2 text-xs text-muted">
            Will be classified as <span className="font-medium text-fg">{destination.provider}</span>
            <ApprovalLabel sanctioned={destination.sanctioned} noun="provider" />
          </p>
          <button
            type="submit"
            disabled={!ready || busy || offline}
            title={offline ? "Unavailable while the backend is offline" : undefined}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-accent px-4 text-[13px] font-semibold text-white shadow-[0_1px_2px_rgb(23_36_58/0.12)] transition-colors duration-150 hover:bg-accent-strong disabled:bg-[#9fb2cc]"
          >
            {busy ? <LoaderCircle size={14} className="spin" /> : <Send size={14} />}
            {busy ? "Scanning…" : "Scan & send"}
          </button>
        </div>
      </form>
    </Card>
  );
}
