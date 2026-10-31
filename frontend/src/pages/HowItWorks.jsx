import { Fragment } from "react";
import {
  ArrowDown,
  ArrowRight,
  Ban,
  BookOpen,
  Database,
  Eye,
  EyeOff,
  Fingerprint,
  Gauge,
  KeyRound,
  LayoutDashboard,
  Link2,
  Lock,
  Network,
  Puzzle,
  Radar,
  Route,
  ScanSearch,
  Server,
  ShieldCheck,
  Sparkles,
  Tags,
  Workflow,
} from "lucide-react";
import Card from "../components/ui/Card.jsx";
import { SeverityBadge } from "../components/ui/Badges.jsx";
import { PageHeader, PageShell } from "../components/ui/Page.jsx";

// ---------------------------------------------------------------------------
// 1. Pipeline
// ---------------------------------------------------------------------------

const SOURCES = ["Live collector (metadata)", "Request logs (JSONL)", "Local LLM Guard relay", "Live Test Console"];

const STAGES = [
  { icon: Tags, title: "Classify provider", text: "Host, port and path → provider; approved or shadow." },
  { icon: ScanSearch, title: "Detect", text: "Regex + Luhn / Verhoeff / JWT validators, entropy, agent tool-call parsing." },
  { icon: EyeOff, title: "Redact in memory", text: "Secrets replaced before storage; keyed HMAC fingerprints kept." },
  { icon: Link2, title: "Correlate sessions", text: "Events grouped per agent / process session; 60 s exfiltration chain." },
  { icon: Gauge, title: "Score 0–10", text: "Named factors add up, capped at 10; an incident from 3." },
  { icon: LayoutDashboard, title: "Dashboard", text: "Overview, AI Inventory, Incidents; refreshed every 3 s." },
  { icon: Sparkles, title: "AI triage", text: "Summary and remediation from redacted fields only.", optional: true },
];

function Stage({ step, icon: Icon, title, text, optional, children }) {
  return (
    <div
      className={`h-full rounded-lg border bg-card p-3 ${optional ? "border-dashed border-line-strong" : "border-line shadow-[var(--shadow-card)]"}`}
    >
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-line bg-sunken text-accent">
          <Icon size={13} />
        </span>
        <span className="mono text-2xs text-subtle">{step}</span>
        <span className="truncate text-[13px] font-semibold text-fg">{title}</span>
        {optional && <span className="ml-auto rounded border border-line px-1.5 text-2xs text-muted">optional</span>}
      </div>
      {text && <p className="mt-1.5 text-xs leading-5 text-muted">{text}</p>}
      {children}
    </div>
  );
}

/** Arrow to the next box: right on wide screens, down when stacked. Hidden after the last box of a row. */
function Arrow({ rowEnd }) {
  return (
    <>
      <ArrowDown size={16} className="mx-auto my-1 text-subtle lg:hidden" aria-hidden="true" />
      {!rowEnd && (
        <ArrowRight
          size={16}
          className="absolute -right-[22px] top-1/2 hidden -translate-y-1/2 text-subtle lg:block"
          aria-hidden="true"
        />
      )}
    </>
  );
}

function Pipeline() {
  const boxes = [
    <Stage key="src" step="0" icon={Network} title="Sources">
      <ul className="mt-2 space-y-1">
        {SOURCES.map((s) => (
          <li key={s} className="rounded border border-line bg-sunken px-2 py-0.5 text-xs text-fg">
            {s}
          </li>
        ))}
      </ul>
    </Stage>,
    ...STAGES.map((s, i) => <Stage key={s.title} step={String(i + 1)} {...s} />),
  ];
  const rows = [boxes.slice(0, 4), boxes.slice(4)];

  return (
    <div className="p-4" role="img" aria-label="Pipeline: sources, classify provider, detect, redact in memory, correlate sessions, score, dashboard, optional AI triage">
      {rows.map((row, r) => (
        <Fragment key={r}>
          <ol className="grid grid-cols-1 lg:grid-cols-4 lg:gap-x-8">
            {row.map((box, i) => (
              <li key={i} className="relative">
                {box}
                {(r === 0 || i < row.length - 1) && <Arrow rowEnd={i === row.length - 1} />}
              </li>
            ))}
          </ol>
          {r === 0 && (
            // Elbow from the end of row 1 back to the start of row 2 (wide screens only).
            <div className="relative hidden h-7 lg:block" aria-hidden="true">
              <div className="absolute left-[12.5%] right-[12.5%] top-0 h-3.5 rounded-b-md border-x border-b border-line-strong" />
              <ArrowDown size={14} className="absolute left-[12.5%] top-3 -translate-x-1/2 text-subtle" />
            </div>
          )}
        </Fragment>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. What we can see
// ---------------------------------------------------------------------------

const VISIBILITY = [
  {
    traffic: "Encrypted HTTPS to cloud AI",
    example: "OpenAI, Anthropic, Hugging Face, Gemini…",
    via: "Live collector (OS connection table)",
    full: false,
    sees: "Process, PID, provider, destination, time",
  },
  {
    traffic: "Local LLM via Local LLM Guard relay",
    example: "Ollama on localhost (plain HTTP, opt-in)",
    via: "llm_relay.py on 127.0.0.1:11435",
    full: true,
    sees: "Process + full prompt scanned",
  },
  {
    traffic: "HTTP request logs",
    example: "JSONL from an API gateway, SDK hook or egress log",
    via: "POST /api/ingest",
    full: true,
    sees: "Full payload scanned",
  },
  {
    traffic: "Live Test Console",
    example: "Simulated prompts typed on the page",
    via: "POST /api/scan + /api/ingest",
    full: true,
    sees: "Full payload scanned",
  },
];

function VisibilityTable() {
  return (
    <>
      <div className="overflow-x-auto">
        <table className="data-table min-w-[720px]">
          <thead>
            <tr>
              <th>Traffic</th>
              <th>Collected by</th>
              <th className="w-[150px]">Visibility</th>
              <th>What ShadowGuard sees</th>
            </tr>
          </thead>
          <tbody>
            {VISIBILITY.map((row) => (
              <tr key={row.traffic}>
                <td>
                  <p className="font-medium text-fg">{row.traffic}</p>
                  <p className="text-xs text-muted">{row.example}</p>
                </td>
                <td className="text-xs text-muted">{row.via}</td>
                <td>
                  {row.full ? (
                    <span className="inline-flex items-center gap-1 rounded-md border border-[#c9d7ea] bg-accent-soft px-1.5 py-0.5 text-xs font-medium text-accent">
                      <Eye size={12} /> Full payload
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-md border border-line-strong bg-sunken px-1.5 py-0.5 text-xs font-medium text-fg">
                      <Lock size={12} /> Metadata only
                    </span>
                  )}
                </td>
                <td className="text-xs text-fg">{row.sees}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-2 border-t border-line p-3 sm:grid-cols-2">
        <p className="flex items-start gap-2 text-xs leading-5 text-fg">
          <Lock size={14} className="mt-0.5 shrink-0 text-accent" />
          <span>
            <span className="font-semibold">No TLS decryption.</span> Encrypted traffic is never intercepted; payloads are read only
            where they already exist in plaintext.
          </span>
        </p>
        <p className="flex items-start gap-2 text-xs leading-5 text-fg">
          <Ban size={14} className="mt-0.5 shrink-0 text-accent" />
          <span>
            <span className="font-semibold">Detection only.</span> Nothing is blocked or modified; ShadowGuard observes, scores and
            alerts.
          </span>
        </p>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// 3. Scoring (mirrors backend/correlator.py)
// ---------------------------------------------------------------------------

const FACTORS = [
  { label: "Credential found", points: "+4", when: "Any credential finding (cloud keys, tokens, JWT, private key)" },
  { label: "Unsanctioned AI provider", points: "+2", when: "Any event in the session went to a provider that is not approved" },
  { label: "High-entropy secret-like string", points: "+2", when: "Random-looking token not explained by a known rule" },
  { label: "PII detected", points: "+2", when: "1–2 PII items (email, phone, PAN, Aadhaar, card)" },
  { label: "PII detected (3+ items)", points: "+3", when: "3 or more PII items (instead of +2)" },
  { label: "Agent shell execution", points: "+3", when: "A shell_exec event or a shell tool call by an agent" },
  { label: "Sensitive file read", points: "+3", when: "Read of .env, .ssh/, .aws/credentials, … (event or tool call)" },
  {
    label: "Exfiltration chain (sensitive read → credential sent within 60s)",
    points: "+3",
    when: "Same session: a sensitive read, then a credential sent within 60 s",
  },
];

const BANDS = [
  { severity: "critical", range: "8–10" },
  { severity: "high", range: "5–7" },
  { severity: "medium", range: "3–4" },
];

function Scoring() {
  return (
    <>
      <div className="overflow-x-auto">
        <table className="data-table min-w-[640px]">
          <thead>
            <tr>
              <th>Factor</th>
              <th className="w-[80px] text-right">Points</th>
              <th>When</th>
            </tr>
          </thead>
          <tbody>
            {FACTORS.map((f) => (
              <tr key={f.label}>
                <td className="font-medium text-fg">{f.label}</td>
                <td className="mono text-right font-semibold text-fg">{f.points}</td>
                <td className="text-xs text-muted">{f.when}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="space-y-3 border-t border-line p-3">
        <p className="text-xs text-muted">
          Each factor counts at most once per session. <span className="font-medium text-fg">Score = min(10, sum of points).</span>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {BANDS.map((b) => (
            <span key={b.severity} className="flex items-center gap-1.5 rounded-md border border-line bg-sunken py-1 pl-1 pr-2.5">
              <SeverityBadge severity={b.severity} />
              <span className="mono text-xs text-fg">{b.range}</span>
            </span>
          ))}
          <span className="flex items-center gap-1.5 rounded-md border border-dashed border-line-strong py-1 pl-2 pr-2.5 text-xs text-muted">
            <span className="mono text-fg">0–2</span> no incident · still listed in AI Inventory
          </span>
        </div>
        <p className="flex items-start gap-2 text-xs leading-5 text-fg">
          <BookOpen size={14} className="mt-0.5 shrink-0 text-accent" />
          <span>
            <span className="font-semibold">Points, not ML.</span> Every score is a sum of named factors shown on the incident, so an
            admin can see exactly why it fired, and the same input always gets the same score.
          </span>
        </p>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// 4. Privacy, 5. Roadmap
// ---------------------------------------------------------------------------

const PRIVACY = [
  { icon: KeyRound, title: "Raw secrets never stored", text: "Payloads are redacted in memory before anything is written." },
  { icon: Database, title: "No payload column", text: "The events table keeps metadata only; findings keep redacted evidence." },
  { icon: Fingerprint, title: "Keyed fingerprints", text: "HMAC-SHA256 with a local key: repeats are counted, values can't be recovered." },
  { icon: Sparkles, title: "LLM sees redacted fields only", text: "Provider, source, severity, score factors, redacted evidence. Never payloads." },
  { icon: ShieldCheck, title: "Everything on 127.0.0.1", text: "API, dashboard and relay bind to localhost; the database is a local file." },
];

const ROADMAP = [
  { icon: Server, title: "Endpoint agent fleet", text: "Lightweight collectors on every machine reporting to a central server." },
  { icon: Puzzle, title: "Browser extension", text: "Inspect prompts in the page before the browser encrypts them." },
  { icon: Route, title: "AI gateway log ingestion", text: "Connectors for existing AI gateways and egress proxies." },
  { icon: Radar, title: "Enforcement mode", text: "Optional block or redact-in-flight for high-severity leaks." },
];

function TileGrid({ items, cols, badge }) {
  return (
    <ul className={`grid gap-3 p-4 sm:grid-cols-2 ${cols}`}>
      {items.map(({ icon: Icon, title, text }) => (
        <li key={title} className="rounded-lg border border-line bg-sunken p-3">
          <div className="flex items-center gap-2">
            <Icon size={15} className="shrink-0 text-accent" />
            <span className="text-[13px] font-semibold text-fg">{title}</span>
            {badge && <span className="ml-auto rounded border border-line bg-card px-1.5 text-2xs text-muted">{badge}</span>}
          </div>
          <p className="mt-1 text-xs leading-5 text-muted">{text}</p>
        </li>
      ))}
    </ul>
  );
}

export default function HowItWorks() {
  return (
    <PageShell>
      <PageHeader
        title="How it works"
        subtitle="From raw AI traffic to an explainable incident, without decrypting anything."
      />
      <Card title="Pipeline" subtitle="Every event takes the same path" icon={Workflow}>
        <Pipeline />
      </Card>
      <Card title="What we can see" subtitle="Metadata everywhere, payloads only where plaintext exists" icon={Eye}>
        <VisibilityTable />
      </Card>
      <Card title="Risk scoring" subtitle="Same rules as the correlator" icon={Gauge}>
        <Scoring />
      </Card>
      <Card title="Privacy guarantees" icon={ShieldCheck}>
        <TileGrid items={PRIVACY} cols="lg:grid-cols-5" />
      </Card>
      <Card title="Roadmap" subtitle="Not built yet" icon={Route}>
        <TileGrid items={ROADMAP} cols="lg:grid-cols-4" badge="Planned" />
      </Card>
    </PageShell>
  );
}
