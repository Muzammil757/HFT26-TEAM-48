import { Globe } from "lucide-react";
import { getHealth } from "../../api.js";
import usePolling from "../../hooks/usePolling.js";

/** Shown only on the public demo deployment (GET /api/health reports mode "deploy"). */
export default function DemoBanner() {
  const { data: health } = usePolling(getHealth, 3000, "health");
  if (health?.mode !== "deploy") return null;
  return (
    <div role="note" className="flex items-center justify-center gap-2 bg-fg px-6 py-1.5 text-center text-xs text-white">
      <Globe size={13} className="shrink-0" />
      <span>
        <span className="font-semibold">Public demo instance</span> · synthetic data only · production runs locally on the
        endpoint
      </span>
    </div>
  );
}
