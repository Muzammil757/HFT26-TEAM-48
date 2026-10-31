import { useRef, useState } from "react";
import { getIncidents, ingestEvents, scanText } from "../api.js";
import ConsoleForm from "../components/test-console/ConsoleForm.jsx";
import PipelineCard from "../components/test-console/PipelineCard.jsx";
import ScanResultCard from "../components/test-console/ScanResultCard.jsx";
import { PageHeader, PageShell } from "../components/ui/Page.jsx";
import { InlineAlert } from "../components/ui/States.jsx";
import usePolling, { useBackendOffline } from "../hooks/usePolling.js";
import { buildAiRequestEvent, newSessionId } from "../lib/consoleEvent.js";
import { errorMessage } from "../lib/format.js";

const INCIDENT_WAIT_MS = 12_000;
const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

/**
 * Live Test Console: type a prompt, see what the detector finds, then push it
 * through the real ingest pipeline as a simulated ai_request and watch the
 * resulting incident. Nothing is sent to an AI provider.
 */
export default function TestConsole() {
  const offline = useBackendOffline();
  // Shared "incidents" poll keeps the found incident's score live.
  const { data: incidents } = usePolling(getIncidents, 3000, "incidents");

  const [form, setForm] = useState(() => ({
    source: "demo-user.exe",
    destinationId: "openai",
    sessionId: newSessionId(),
    keepSession: false,
    prompt: "",
  }));
  const [scan, setScan] = useState({ status: "idle", data: null, error: null });
  const [run, setRun] = useState(null);
  const [busy, setBusy] = useState(false);
  // Event ids sent per session, to find that session's incident among all incidents.
  const sentRef = useRef(new Map());

  async function handleRun() {
    const source = form.source.trim();
    const sessionId = form.sessionId.trim();
    const prompt = form.prompt;
    const event = buildAiRequestEvent({ source, destinationId: form.destinationId, sessionId, prompt });
    setBusy(true);

    // 1. Local detection (redacted results only).
    setScan({ status: "loading", data: null, error: null });
    setRun({ destinationId: form.destinationId, event, ingest: { status: "idle" }, incident: { status: "idle" } });
    try {
      setScan({ status: "done", data: await scanText(prompt), error: null });
    } catch (err) {
      setScan({ status: "error", data: null, error: errorMessage(err) });
    }

    // 2. Same event through the real ingest pipeline.
    setRun((r) => ({ ...r, ingest: { status: "loading" } }));
    let response;
    try {
      response = await ingestEvents([event]);
      if (!response.processed) throw new Error("The server skipped the event (validation failed).");
      setRun((r) => ({ ...r, ingest: { status: "done" }, incident: { status: "waiting" } }));
    } catch (err) {
      setRun((r) => ({ ...r, ingest: { status: "error", error: errorMessage(err) || err.message } }));
      setBusy(false);
      return;
    }

    // 3. Find this session's incident (if it scored >= 3).
    const sent = sentRef.current.get(sessionId) || new Set();
    sent.add(event.event_id);
    sentRef.current.set(sessionId, sent);
    if (!response.incidents) {
      setRun((r) => ({ ...r, incident: { status: "none" } }));
    } else {
      const deadline = Date.now() + INCIDENT_WAIT_MS;
      let found = null;
      while (!found && Date.now() < deadline) {
        try {
          const list = await getIncidents();
          found = list.find((i) => i.source === source && (i.trigger_events || []).some((id) => sent.has(id)));
        } catch {
          // Retry until the deadline.
        }
        if (!found) await sleep(700);
      }
      setRun((r) => ({
        ...r,
        incident: found
          ? { status: "found", id: found.incident_id, snapshot: found }
          : { status: "error", error: "The incident did not appear within 12 seconds. Check the Incidents page." },
      }));
    }

    if (!form.keepSession) setForm((f) => ({ ...f, sessionId: newSessionId() }));
    setBusy(false);
  }

  const liveIncident =
    run?.incident.status === "found"
      ? (Array.isArray(incidents) && incidents.find((i) => i.incident_id === run.incident.id)) || run.incident.snapshot
      : null;

  return (
    <PageShell>
      <PageHeader
        title="Live Test Console"
        subtitle="Try the detection pipeline with your own prompt and watch the incident it produces."
      />

      <InlineAlert tone="warning">
        <span className="font-semibold">Simulated request — sent to ShadowGuard&apos;s local ingest only, never to an AI provider.</span>{" "}
        Use fake data only.
      </InlineAlert>

      <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-12">
        <div className="lg:col-span-6">
          <ConsoleForm
            form={form}
            setForm={setForm}
            onSubmit={handleRun}
            onNewSession={() => setForm((f) => ({ ...f, sessionId: newSessionId() }))}
            busy={busy}
            offline={offline}
          />
        </div>
        <div className="space-y-3 lg:col-span-6">
          <ScanResultCard scan={scan} />
          <PipelineCard run={run} incident={liveIncident} />
        </div>
      </div>
    </PageShell>
  );
}
