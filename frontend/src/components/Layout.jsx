import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Activity, AlertTriangle, LayoutDashboard, Lock, Shield, WifiOff } from "lucide-react";
import { useBackendOffline } from "../hooks/usePolling";
import { LiveIndicator } from "./ui.jsx";
import Toasts from "./Toasts.jsx";

const navigation = [
  { label: "Overview", to: "/", icon: LayoutDashboard, end: true },
  { label: "Shadow AI Inventory", to: "/inventory", icon: Activity, end: false },
  { label: "Incidents", to: "/incidents", icon: AlertTriangle, end: false },
];

function sectionTitle(pathname) {
  if (pathname.startsWith("/incidents/")) return ["Incidents", "Incident detail"];
  if (pathname.startsWith("/incidents")) return ["Incidents"];
  if (pathname.startsWith("/inventory")) return ["Shadow AI Inventory"];
  return ["Overview"];
}

export default function Layout() {
  const backendOffline = useBackendOffline();
  const { pathname } = useLocation();
  const crumbs = sectionTitle(pathname);

  return (
    <div className="backdrop-grid flex min-h-screen bg-bg text-fg">
      <aside className="fixed inset-y-0 left-0 z-30 flex w-60 flex-col border-r border-line bg-bg/95">
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-line px-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-accent/25 bg-accent/10 text-accent">
            <Shield size={18} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-tight">ShadowGuard AI</p>
            <p className="text-xs text-subtle">Security command center</p>
          </div>
        </div>

        <nav aria-label="Main navigation" className="space-y-1 px-3 pt-6">
          <p className="eyebrow mb-2 px-3">Workspace</p>
          {navigation.map(({ label, to, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                [
                  "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors duration-150",
                  isActive
                    ? "bg-accent/10 font-medium text-fg shadow-[inset_2px_0_0_var(--color-accent)]"
                    : "text-muted hover:bg-white/[0.03] hover:text-fg",
                ].join(" ")
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={16} className={isActive ? "text-accent" : ""} />
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto space-y-2 border-t border-line p-4">
          <div className="flex items-start gap-2 rounded-lg border border-line bg-card p-3">
            <Lock size={14} className="mt-0.5 shrink-0 text-approved" />
            <p className="text-xs leading-4 text-muted">
              Local only. No TLS decryption. Payloads are redacted in memory and never stored.
            </p>
          </div>
        </div>
      </aside>

      <div className="ml-60 flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-4 border-b border-line bg-bg/85 px-6 backdrop-blur">
          <p className="flex items-center gap-2 text-sm text-muted">
            {crumbs.map((crumb, i) => (
              <span key={crumb} className="flex items-center gap-2">
                {i > 0 && <span className="text-subtle">/</span>}
                <span className={i === crumbs.length - 1 ? "font-medium text-fg" : ""}>{crumb}</span>
              </span>
            ))}
          </p>
          <LiveIndicator />
        </header>

        {backendOffline && (
          <div
            role="alert"
            className="sticky top-14 z-10 flex items-center gap-3 border-b border-critical/30 bg-[#1a0b10]/95 px-6 py-2 text-sm text-critical backdrop-blur"
          >
            <WifiOff size={16} className="shrink-0" />
            <span className="font-semibold">Backend offline.</span>
            <span className="text-critical/80">
              Data on screen may be out of date. Reconnecting automatically.
            </span>
          </div>
        )}

        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>

      <Toasts />
    </div>
  );
}
