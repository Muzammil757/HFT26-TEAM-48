import { useEffect, useRef, useState } from "react";
import { SquarePen } from "lucide-react";
import { getIncidents, ingestEvents, scanText } from "../api.js";
import Composer from "../components/test-console/Composer.jsx";
import StarterCards, { ExampleChips } from "../components/test-console/StarterCards.jsx";
import UserBubble from "../components/test-console/UserBubble.jsx";
import VerdictCard from "../components/test-console/VerdictCard.jsx";
import { useBackendOffline } from "../hooks/usePolling.js";
import { buildAiRequestEvent, newSessionId } from "../lib/consoleEvent.js";
import { errorMessage } from "../lib/format.js";

const INCIDENT_WAIT_MS = 12_000;
const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
let nextId = 0;

/**
 * Live Test Console as a chat. Each message is scanned (/api/scan), logged as a
 * simulated ai_request (/api/ingest) and correlated; ShadowGuard replies with a
 * verdict, never an AI answer. One chat = one session, so its incident grows
 * across messages. Raw text stays in this page's memory only.
 */
export default function TestConsole() {
  const offline = useBackendOffline();
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [destinationId, setDestinationId] = useState("openai");
  const [source, setSource] = useState("demo-user.exe");
  const [sessionId, setSessionId] = useState(newSessionId);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  // Event ids sent in each session, to find that session's incident.
  const sentRef = useRef(new Map());

  const patch = (id, changes) => setMessages((list) => list.map((m) => (m.id === id ? { ...m, ...changes } : m)));

  useEffect(() => {
    if (messages.length) window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function send(text) {
    const prompt = text.trim() ? text : "";
    if (!prompt || busy || offline || !source.trim()) return;
    const userId = `m${nextId++}`;
    const verdictId = `m${nextId++}`;
    const session = sessionId;
    const processName = source.trim();
    setMessages((list) => [
      ...list,
      { id: userId, role: "user", raw: prompt, scan: null },
      { id: verdictId, role: "verdict", status: "scanning", destinationId },
    ]);
    setDraft("");
    setBusy(true);

    try {
      // 1. Detect and redact (nothing stored).
      let scan;
      try {
        scan = await scanText(prompt);
        patch(userId, { scan });
        patch(verdictId, { scan, status: "sending" });
      } catch (err) {
        patch(userId, { scanError: true });
        patch(verdictId, { status: "error", error: errorMessage(err) });
        return;
      }

      // 2. Log it through the real ingest pipeline as a simulated ai_request.
      const event = buildAiRequestEvent({ source: processName, destinationId, sessionId: session, prompt });
      let response;
      try {
        response = await ingestEvents([event]);
        if (!response.processed) throw new Error("The server skipped the event (validation failed).");
      } catch (err) {
        patch(verdictId, { status: "error", error: errorMessage(err) || err.message });
        return;
      }
      const sent = sentRef.current.get(session) || new Set();
      sent.add(event.event_id);
      sentRef.current.set(session, sent);

      // 3. This chat's incident, if the session now scores >= 3.
      if (!response.incidents) {
        patch(verdictId, { status: "done", incidentStatus: "none" });
        return;
      }
      patch(verdictId, { status: "correlating" });
      const deadline = Date.now() + INCIDENT_WAIT_MS;
      let found = null;
      while (!found && Date.now() < deadline) {
        try {
          const list = await getIncidents();
          found = list.find((i) => i.source === processName && (i.trigger_events || []).some((id) => sent.has(id)));
        } catch {
          // Retry until the deadline.
        }
        if (!found) await sleep(600);
      }
      patch(verdictId, found ? { status: "done", incidentStatus: "found", incident: found } : { status: "done", incidentStatus: "missing" });
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  function newChat() {
    setMessages([]);
    setSessionId(newSessionId());
    setDraft("");
    inputRef.current?.focus();
  }

  const empty = messages.length === 0;

  return (
    <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] w-full max-w-[808px] flex-col px-6">
      <header className="flex items-center justify-between gap-3 pb-2 pt-5">
        <div>
          <h1 className="text-title font-semibold tracking-tight text-fg">Live Test Console</h1>
          <p className="text-sm text-muted">See what ShadowGuard intercepts before it reaches an AI tool.</p>
        </div>
        <button
          type="button"
          onClick={newChat}
          disabled={busy}
          title="Start a new chat (new session)"
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-line-strong bg-card px-3 text-[13px] font-medium text-fg transition-colors duration-150 hover:bg-hover disabled:opacity-60"
        >
          <SquarePen size={14} />
          New chat
        </button>
      </header>

      <div className="flex-1 py-4">
        {empty ? (
          <div className="flex h-full min-h-[340px] flex-col items-center justify-center gap-6 text-center">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-fg">What would an employee paste into an AI tool?</h2>
              <p className="mt-1 text-sm text-muted">Pick a starter or type your own. ShadowGuard scans it, redacts it and logs it.</p>
            </div>
            <div className="w-full">
              <StarterCards onPick={(example) => send(example.text)} disabled={busy || offline} />
            </div>
          </div>
        ) : (
          <div className="space-y-5" aria-live="polite">
            {messages.map((m) => (m.role === "user" ? <UserBubble key={m.id} message={m} /> : <VerdictCard key={m.id} message={m} />))}
          </div>
        )}
      </div>

      <div className="sticky bottom-0 z-10 bg-gradient-to-t from-bg from-80% to-transparent pb-3 pt-4">
        {!empty && (
          <div className="mb-2">
            <ExampleChips
              onFill={(text) => {
                setDraft(text);
                inputRef.current?.focus();
              }}
            />
          </div>
        )}
        <Composer
          value={draft}
          onChange={setDraft}
          onSend={() => send(draft)}
          destinationId={destinationId}
          onDestination={setDestinationId}
          source={source}
          onSource={setSource}
          busy={busy}
          offline={offline}
          inputRef={inputRef}
        />
        <p className="mt-2 text-center text-2xs text-muted">
          Simulated · sent only to ShadowGuard&apos;s local ingest, never to an AI provider · use fake data
        </p>
      </div>
    </div>
  );
}
