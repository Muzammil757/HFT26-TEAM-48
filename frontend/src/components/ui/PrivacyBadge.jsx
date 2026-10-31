import { LockKeyhole } from "lucide-react";

/** The privacy guarantee, worded exactly as the backend implements it. */
export default function PrivacyBadge({ className = "" }) {
  return (
    <div
      className={`inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md border border-approved-line bg-approved-soft px-2 py-1 text-xs text-approved ${className}`}
    >
      <LockKeyhole size={13} className="shrink-0" />
      <span className="font-semibold">
        Raw secrets stored: <span className="mono">0</span>
      </span>
      <span aria-hidden="true" className="opacity-50">·</span>
      <span>Evidence redacted</span>
      <span aria-hidden="true" className="opacity-50">·</span>
      <span>Keyed fingerprints</span>
    </div>
  );
}
