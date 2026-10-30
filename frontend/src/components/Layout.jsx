
import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  LayoutDashboard,
  Shield,
  ShieldAlert,
  WifiOff,
} from "lucide-react";
import { getPollingOfflineStatus } from "../hooks/usePolling";

const navigation = [
  {
    label: "Overview",
    to: "/",
    icon: LayoutDashboard,
    end: true,
  },
  {
    label: "Shadow AI Inventory",
    to: "/inventory",
    icon: Activity,
    end: false,
  },
  {
    label: "Incidents",
    to: "/incidents",
    icon: AlertTriangle,
    end: false,
  },
];

export default function Layout() {
  const [backendOffline, setBackendOffline] = useState(
    getPollingOfflineStatus,
  );

  useEffect(() => {
    const handleBackendStatus = (event) => {
      setBackendOffline(Boolean(event.detail?.offline));
    };

    window.addEventListener(
      "shadowguard:backend-status",
      handleBackendStatus,
    );

    // Recheck after subscribing in case polling status changed during mount.
    setBackendOffline(getPollingOfflineStatus());

    return () => {
      window.removeEventListener(
        "shadowguard:backend-status",
        handleBackendStatus,
      );
    };
  }, []);

  return (
    <div className="flex min-h-screen bg-zinc-950 text-zinc-100">
      <aside className="fixed inset-y-0 left-0 z-30 flex w-64 flex-col border-r border-zinc-800 bg-zinc-950">
        <div className="flex h-16 shrink-0 items-center gap-3 border-b border-zinc-800 px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-400">
            <Shield size={21} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-tight">
              ShadowGuard AI
            </p>
            <p className="mt-0.5 text-[10px] uppercase tracking-[0.16em] text-zinc-500">
              Security Console
            </p>
          </div>
        </div>

        <div className="px-4 pt-6">
          <p className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-600">
            Workspace
          </p>

          <nav aria-label="Main navigation" className="space-y-1">
            {navigation.map(({ label, to, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  [
                    "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                    isActive
                      ? "border border-cyan-400/15 bg-cyan-400/10 font-medium text-cyan-300"
                      : "border border-transparent text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100",
                  ].join(" ")
                }
              >
                <Icon size={17} className="shrink-0" />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="mt-auto border-t border-zinc-800 p-4">
          <div className="flex items-center gap-2 rounded-lg bg-zinc-900/70 px-3 py-2.5">
            {backendOffline ? (
              <WifiOff size={15} className="shrink-0 text-red-400" />
            ) : (
              <ShieldAlert
                size={15}
                className="shrink-0 text-emerald-400"
              />
            )}
            <div className="min-w-0">
              <p className="text-xs font-medium text-zinc-300">
                {backendOffline ? "Backend offline" : "Monitoring active"}
              </p>
              <p className="mt-0.5 text-[10px] text-zinc-600">
                {backendOffline
                  ? "Waiting for API recovery"
                  : "Local telemetry"}
              </p>
            </div>
            <span
              className={`ml-auto h-2 w-2 shrink-0 rounded-full ${
                backendOffline ? "bg-red-400" : "bg-emerald-400"
              }`}
            />
          </div>

          <p className="mt-3 text-[10px] leading-relaxed text-zinc-600">
            ShadowGuard AI · Local security monitoring
          </p>
        </div>
      </aside>

      <div className="ml-64 flex min-h-screen min-w-0 flex-1 flex-col">
        {backendOffline && (
          <div
            role="alert"
            aria-live="assertive"
            className="sticky top-0 z-20 flex items-center gap-3 border-b border-red-500/30 bg-red-950/95 px-5 py-3 text-sm text-red-200 shadow-lg backdrop-blur"
          >
            <WifiOff size={18} className="shrink-0 text-red-400" />

            <div className="min-w-0">
              <p className="font-semibold">Backend offline</p>
              <p className="mt-0.5 text-xs text-red-200/70">
                One or more polling requests failed. Previously loaded data may
                be stale while the connection is unavailable.
              </p>
            </div>
          </div>
        )}

        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
