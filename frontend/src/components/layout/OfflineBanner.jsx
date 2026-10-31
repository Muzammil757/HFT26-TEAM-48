import { WifiOff } from "lucide-react";
import { useBackendOffline } from "../../hooks/usePolling.js";

export default function OfflineBanner() {
  const offline = useBackendOffline();
  if (!offline) return null;
  return (
    <div
      role="alert"
      className="sticky top-14 z-10 flex items-center gap-2.5 border-b border-critical-line bg-critical-soft px-6 py-2 text-[13px] text-critical"
    >
      <WifiOff size={15} className="shrink-0" />
      <span className="font-semibold">Backend offline.</span>
      <span className="text-[#912018]">
        Data on screen may be out of date. Reconnecting automatically every 3 s.
      </span>
    </div>
  );
}
