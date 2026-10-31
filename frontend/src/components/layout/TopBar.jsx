import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronRight, Globe, MonitorDot, RotateCw } from "lucide-react";
import { getHealth } from "../../api.js";
import usePolling, { refreshAll, useBackendOffline, useLastRefreshed } from "../../hooks/usePolling.js";
import { formatTime, shortId } from "../../lib/format.js";

/** Where this instance runs: the local endpoint (127.0.0.1) or the public demo deployment. */
function ModeChip() {
  const { data: health } = usePolling(getHealth, 3000, "health");
  const chip = "inline-flex h-7 items-center gap-1.5 rounded-md border border-line bg-sunken px-2 text-xs text-muted";
  if (health?.mode === "deploy") {
    return (
      <span title="Public demo deployment with synthetic data; production runs locally on each endpoint" className={chip}>
        <Globe size={13} />
        <span className="text-fg">Public demo</span>
      </span>
    );
  }
  return (
    <span title="ShadowGuard runs locally and only listens on 127.0.0.1" className={chip}>
      <MonitorDot size={13} />
      Local <span className="mono text-fg">127.0.0.1</span>
    </span>
  );
}

function crumbsFor(pathname) {
  if (pathname.startsWith("/incidents/")) {
    const id = decodeURIComponent(pathname.slice("/incidents/".length));
    return [{ label: "Incidents", to: "/incidents" }, { label: `Incident ${shortId(id)}`, mono: true }];
  }
  if (pathname.startsWith("/incidents")) return [{ label: "Incidents" }];
  if (pathname.startsWith("/inventory")) return [{ label: "AI Inventory" }];
  if (pathname.startsWith("/test-console")) return [{ label: "Live Test Console" }];
  if (pathname.startsWith("/how-it-works")) return [{ label: "How it works" }];
  return [{ label: "Security Overview" }];
}

function ApiStatus() {
  const offline = useBackendOffline();
  return (
    <span
      role="status"
      className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs font-medium ${
        offline ? "border-critical-line bg-critical-soft text-critical" : "border-line bg-card text-fg"
      }`}
    >
      <span className={`h-2 w-2 rounded-full ${offline ? "bg-critical" : "live-dot bg-approved"}`} aria-hidden="true" />
      {offline ? "API offline" : "API connected"}
    </span>
  );
}

export default function TopBar() {
  const { pathname } = useLocation();
  const crumbs = crumbsFor(pathname);
  const lastRefreshed = useLastRefreshed();
  const [refreshing, setRefreshing] = useState(false);

  async function handleRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await refreshAll();
    } finally {
      // Keep the spinner visible long enough to register.
      window.setTimeout(() => setRefreshing(false), 300);
    }
  }

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-4 border-b border-line bg-card/95 px-6 backdrop-blur-sm">
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
        <span className="hidden text-muted xl:inline">ShadowGuard AI</span>
        <ChevronRight size={14} className="hidden shrink-0 text-subtle xl:inline" />
        {crumbs.map((crumb, i) => (
          <span key={crumb.label} className="flex min-w-0 items-center gap-1.5">
            {i > 0 && <ChevronRight size={14} className="shrink-0 text-subtle" />}
            {crumb.to ? (
              <Link to={crumb.to} className="text-muted transition-colors duration-150 hover:text-accent">
                {crumb.label}
              </Link>
            ) : (
              <span className={`truncate font-semibold text-fg ${crumb.mono ? "mono text-[13px]" : ""}`}>{crumb.label}</span>
            )}
          </span>
        ))}
      </nav>

      <div className="flex shrink-0 items-center gap-2">
        <ModeChip />
        <ApiStatus />
        <span className="hidden whitespace-nowrap px-1 text-xs text-muted lg:inline">
          Last refreshed <span className="mono text-fg">{lastRefreshed ? formatTime(lastRefreshed) : "—"}</span>
        </span>
        <button
          type="button"
          onClick={handleRefresh}
          aria-label="Refresh now"
          title="Refresh now (auto-refreshes every 3 s)"
          className="inline-flex h-7 items-center gap-1.5 rounded-md border border-line-strong bg-card px-2 text-xs font-medium text-fg transition-colors duration-150 hover:bg-hover"
        >
          <RotateCw size={13} className={refreshing ? "spin" : ""} />
          Refresh
        </button>
      </div>
    </header>
  );
}
