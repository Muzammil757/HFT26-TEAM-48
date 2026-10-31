import { Cpu, Radar } from "lucide-react";
import { getHealth } from "../../api.js";
import usePolling, { useBackendOffline } from "../../hooks/usePolling.js";
import { describeEngine } from "../../lib/analysis.js";

function StatusLine({ icon: Icon, label, value, title, on }) {
  return (
    <div className="flex items-center gap-2 py-1 text-xs" title={title}>
      <Icon size={13} className="shrink-0 text-muted" />
      <span className="text-muted">{label}</span>
      <span className="ml-auto flex min-w-0 items-center gap-1.5 font-medium text-fg">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${on ? "bg-approved" : "bg-subtle"}`} aria-hidden="true" />
        <span className="truncate">{value}</span>
      </span>
    </div>
  );
}

/** Sidebar footer: analyzer engine and collector status from /api/health (API status lives in the top bar). */
export default function SystemStatus() {
  const { data: health } = usePolling(getHealth, 3000, "health");
  const offline = useBackendOffline();
  const known = Boolean(health) && !offline;
  const engine = known ? describeEngine(health.analyzer) : null;
  const collector = known ? health.collector : null;

  return (
    <div className="border-t border-line px-4 pb-3 pt-2.5">
      <StatusLine
        icon={Cpu}
        label="Analyzer"
        value={engine ? engine.name : "Unknown"}
        title={known ? health.analyzer : "Backend unreachable"}
        on={Boolean(engine)}
      />
      <StatusLine
        icon={Radar}
        label="Collector"
        value={collector === "on" ? "On" : collector === "off" ? "Off" : "Unknown"}
        title="Live connection collector (psutil metadata)"
        on={collector === "on"}
      />
      <p className="mt-1.5 text-[10px] leading-[14px] text-subtle">Detection only · No TLS decryption · Plaintext and log inspection</p>
    </div>
  );
}
