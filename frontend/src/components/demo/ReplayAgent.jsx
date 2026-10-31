import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Bot, LoaderCircle, Play, X } from "lucide-react";
import { getIncidents, replayAgentAttack } from "../../api.js";
import { refreshAll } from "../../hooks/usePolling.js";
import { errorMessage } from "../../lib/format.js";
import { severityOf } from "../../lib/theme.js";
import { SeverityBadge } from "../ui/Badges.jsx";

const POLL_MS = 1500;
const STEP_LABELS = {
  ai_request: "sends to",
  file_read: "reads",
  shell_exec: "runs",
  connection: "connects to",
};

/**
 * Replay of the scenario-05 agent attack: POST /api/demo/replay-agent, then follow the
 * incident it builds (matched by the replay's event ids) until the last step has landed.
 */
export function useReplayAgent() {
  const [state, setState] = useState({ phase: "idle" });
  const timer = useRef(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      window.clearTimeout(timer.current);
    };
  }, []);

  async function start() {
    if (state.phase === "starting" || state.phase === "running") return;
    window.clearTimeout(timer.current);
    setState({ phase: "starting" });
    let replay;
    try {
      replay = await replayAgentAttack();
    } catch (err) {
      if (!alive.current) return;
      const retry = err.status === 429 ? Number(String(err.message).match(/(\d+) s/)?.[1]) || null : null;
      setState({ phase: "error", message: errorMessage(err) || err.message, retry });
      return;
    }
    const ids = new Set(replay.event_ids || []);
    const steps = replay.steps || [];
    const startedAt = Date.now();
    const doneAt = startedAt + Math.max(steps.length - 1, 0) * (replay.interval_seconds || 3) * 1000 + 3000;
    const base = { phase: "running", steps, startedAt, interval: replay.interval_seconds || 3, incident: null, now: startedAt };
    setState(base);

    const poll = async () => {
      if (!alive.current) return;
      let incident = null;
      try {
        const list = await getIncidents();
        incident = list.find((i) => (i.trigger_events || []).some((id) => ids.has(id))) || null;
      } catch {
        // Keep polling until the replay window is over.
      }
      if (!alive.current) return;
      const finished = Date.now() > doneAt;
      setState({ ...base, phase: finished ? "done" : "running", incident, now: Date.now() });
      if (incident) refreshAll();
      if (!finished) timer.current = window.setTimeout(poll, POLL_MS);
    };
    timer.current = window.setTimeout(poll, 800);
  }

  return { state, start, dismiss: () => setState({ phase: "idle" }) };
}

export function ReplayButton({ replay }) {
  const busy = replay.state.phase === "starting" || replay.state.phase === "running";
  return (
    <button
      type="button"
      onClick={replay.start}
      disabled={busy}
      title="Replays a fake agent attack (.env read → shell → AWS key sent to OpenAI) as a new session"
      className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-[13px] font-semibold text-white transition-colors duration-150 hover:bg-accent-strong disabled:opacity-70"
    >
      {busy ? <LoaderCircle size={14} className="spin" /> : <Play size={14} />}
      Replay agent attack
    </button>
  );
}

function StepTrail({ steps, reached }) {
  return (
    <ol className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
      {steps.map((step, i) => (
        <li key={i} className="flex items-center gap-1.5">
          {i > 0 && <ArrowRight size={11} className="text-subtle" aria-hidden="true" />}
          <span className={i < reached ? "text-fg" : "text-subtle"}>
            {STEP_LABELS[step.event_type] || step.event_type}{" "}
            <span className="mono">{step.destination}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

export function ReplayBanner({ replay }) {
  const { state, dismiss } = replay;
  if (state.phase === "idle" || state.phase === "starting") return null;

  if (state.phase === "error") {
    return (
      <div role="alert" className="flex items-center gap-2 rounded-lg border border-medium-line bg-medium-soft px-3 py-2 text-[13px] text-medium">
        <span className="flex-1">
          {state.retry ? `One replay at a time on this demo: try again in ${state.retry} s.` : `Replay failed: ${state.message}`}
        </span>
        <button type="button" onClick={dismiss} aria-label="Dismiss" className="rounded p-0.5 hover:bg-card">
          <X size={14} />
        </button>
      </div>
    );
  }

  const { steps, startedAt, interval, incident, now } = state;
  const reached = Math.min(steps.length, Math.floor((now - startedAt) / (interval * 1000)) + 1);
  const running = state.phase === "running";
  const s = incident ? severityOf(incident.severity) : null;
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-3 rounded-lg border border-[#c9d7ea] bg-accent-soft px-3 py-2"
      style={s ? { boxShadow: `inset 3px 0 0 ${s.hex}` } : undefined}
    >
      <Bot size={16} className="shrink-0 text-accent" />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-fg">
          {running ? `Replaying agent attack · step ${reached} of ${steps.length}` : "Agent attack replayed"}
          <span className="font-normal text-muted"> · synthetic autogpt session, fake AWS key</span>
        </p>
        <StepTrail steps={steps} reached={running ? reached : steps.length} />
      </div>
      {incident ? (
        <span className="flex items-center gap-2">
          <SeverityBadge severity={incident.severity} />
          <span className="mono text-sm font-semibold">
            <span className={s.text}>{incident.risk_score}</span>
            <span className="text-xs font-normal text-subtle">/10</span>
          </span>
          <Link
            to={`/incidents/${encodeURIComponent(incident.incident_id)}`}
            className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:text-accent-strong"
          >
            View incident <ArrowRight size={12} />
          </Link>
        </span>
      ) : (
        <span className="text-xs text-muted">Waiting for the incident…</span>
      )}
      {!running && (
        <button type="button" onClick={dismiss} aria-label="Dismiss" className="rounded p-0.5 text-muted hover:bg-card hover:text-fg">
          <X size={14} />
        </button>
      )}
    </div>
  );
}
