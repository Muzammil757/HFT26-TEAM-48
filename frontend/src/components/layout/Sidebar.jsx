import { NavLink, useLocation } from "react-router-dom";
import { Boxes, FlaskConical, LayoutDashboard, Siren, Workflow } from "lucide-react";
import { getIncidents } from "../../api.js";
import usePolling from "../../hooks/usePolling.js";
import BrandMark from "./BrandMark.jsx";
import SystemStatus from "./SystemStatus.jsx";

const navigation = [
  { label: "Security Overview", to: "/", icon: LayoutDashboard, end: true },
  { label: "AI Inventory", to: "/inventory", icon: Boxes, end: false },
  { label: "Incidents", to: "/incidents", icon: Siren, end: false, count: true },
  { label: "Live Test Console", to: "/test-console", icon: FlaskConical, end: false },
  { label: "How it works", to: "/how-it-works", icon: Workflow, end: false },
];

// The Incidents link returns to the filters last used there (kept by the Incidents page).
function savedIncidentsSearch() {
  try {
    return sessionStorage.getItem("sg.incidentsSearch") || "";
  } catch {
    return "";
  }
}

export default function Sidebar() {
  // Shared "incidents" poll: no extra request.
  const { data: incidents } = usePolling(getIncidents, 3000, "incidents");
  const incidentCount = Array.isArray(incidents) ? incidents.length : null;
  // Re-render on navigation so the Incidents link picks up the latest saved filters.
  useLocation();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-[240px] flex-col border-r border-line bg-card">
      <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-line px-4">
        <BrandMark size={28} />
        <div className="min-w-0 leading-tight">
          <p className="truncate text-[15px] font-semibold tracking-tight text-fg">ShadowGuard AI</p>
          <p className="truncate text-2xs text-muted">Shadow AI &amp; agent exfiltration</p>
        </div>
      </div>

      <nav aria-label="Main navigation" className="space-y-0.5 px-3 pt-4">
        <p className="eyebrow mb-1.5 px-2.5">Monitor</p>
        {navigation.map(({ label, to, icon: Icon, end, count }) => (
          <NavLink
            key={to}
            to={count ? `${to}${savedIncidentsSearch()}` : to}
            end={end}
            className={({ isActive }) =>
              [
                "relative flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-colors duration-150",
                isActive ? "bg-accent-soft font-semibold text-accent-strong" : "text-muted hover:bg-hover hover:text-fg",
              ].join(" ")
            }
          >
            {({ isActive }) => (
              <>
                {isActive && <span className="absolute inset-y-2 left-0 w-[3px] rounded-r bg-accent" aria-hidden="true" />}
                <Icon size={16} className={isActive ? "text-accent" : ""} />
                <span className="flex-1 truncate">{label}</span>
                {count && incidentCount != null && (
                  <span
                    className={`mono rounded px-1.5 text-2xs font-medium ${
                      isActive ? "bg-card text-accent-strong" : "bg-sunken text-muted"
                    }`}
                  >
                    {incidentCount}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto">
        <SystemStatus />
      </div>
    </aside>
  );
}
