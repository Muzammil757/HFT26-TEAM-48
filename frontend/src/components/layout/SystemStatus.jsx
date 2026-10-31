import { Cpu, Radar, Server } from "lucide-react";
import { getHealth } from "../../api.js";
import usePolling, { useBackendOffline } from "../../hooks/usePolling.js";
import { describeEngine } from "../../lib/analysis.js";

function StatusRow({ icon: Icon, label, value, detail, tone }) {
  const dot = { ok: "bg-approved", off: "bg-subtle", bad: "bg-critical" }[tone] || "bg-subtle";
  return (
    <div className="flex items-start gap-2.5 py-1.5">
      <Icon size={14} className="mt-0.5 shrink-0 text-muted" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted">{label}</span>
          <span className="flex items-center gap-1.5 text-xs font-medium text-fg">
            <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden="true" />
            {value}
          </span>
        </div>
        {detail && (
          <p className="mono truncate text-right text-2xs text-muted" title={detail}>
            {detail}
          </p>
        )}
      </div>
    </div>
  );
}

/** Sidebar footer: API, analyzer engine and collector status from /api/health. */
export default function SystemStatus() {
  const { data: health } = usePolling(getHealth, 3000, "health");
  const offline = useBackendOffline();
  const engine = describeEngine(health?.analyzer);
  const known = Boolean(health) && !offline;

  return (
    <div className="border-t border-line px-4 pb-4 pt-3">
      <p className="eyebrow mb-1">System status</p>
      <StatusRow
        icon={Server}
        label="API"
        value={offline ? "Offline" : health ? "Connected" : "Checking"}
        tone={offline ? "bad" : health ? "ok" : "off"}
      />
      <StatusRow
        icon={Cpu}
        label="Analyzer"
        value={known && engine ? engine.name : "Unknown"}
        detail={known && engine?.llm ? engine.detail : undefined}
        tone={known ? "ok" : "off"}
      />
      <StatusRow
        icon={Radar}
        label="Live collector"
        value={known ? (health.collector === "on" ? "On" : health.collector === "off" ? "Off" : "Unknown") : "Unknown"}
        tone={known && health.collector === "on" ? "ok" : "off"}
      />
      <p className="mt-2 rounded-md border border-line bg-sunken px-2.5 py-2 text-2xs leading-4 text-muted">
        Detection only · No TLS decryption · Plaintext and log inspection
      </p>
    </div>
  );
}
