import { ScanSearch, ShieldCheck } from "lucide-react";
import { plural } from "../../lib/format.js";
import { CategoryBadge } from "../ui/Badges.jsx";
import Card from "../ui/Card.jsx";
import { EmptyState, InlineAlert, Skeleton } from "../ui/States.jsx";

/** Masked text with each [REDACTED:Rule] token highlighted. */
function MaskedText({ text }) {
  const parts = text.split(/(\[REDACTED:[A-Za-z0-9_]+\])/g);
  return (
    <pre className="mono max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-md border border-line bg-sunken px-3 py-2 text-xs leading-5 text-fg">
      {parts.map((part, i) =>
        /^\[REDACTED:/.test(part) ? (
          <mark key={i} className="rounded bg-critical-soft px-0.5 font-semibold text-critical">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </pre>
  );
}

/** Step 1: what the local detection engine found, redacted. */
export default function ScanResultCard({ scan }) {
  const findings = scan.data?.findings || [];
  return (
    <Card
      title="1 · Local detection"
      subtitle="POST /api/scan · regex, validators and entropy · nothing stored"
      icon={ScanSearch}
      actions={scan.data && <span className="text-xs text-muted">{plural(findings.length, "finding")}</span>}
    >
      {scan.status === "idle" ? (
        <EmptyState icon={ScanSearch} title="No scan yet" hint="Pick an example or type a prompt, then press Scan & send." />
      ) : scan.status === "loading" ? (
        <div className="space-y-2 p-4">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : scan.status === "error" ? (
        <div className="p-4">
          <InlineAlert tone="error">
            <span className="font-semibold">Scan failed.</span> {scan.error}
          </InlineAlert>
        </div>
      ) : (
        <div className="space-y-3 p-4">
          {findings.length === 0 ? (
            <InlineAlert tone="info">
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck size={14} />
                No secrets or personal data found in this prompt.
              </span>
            </InlineAlert>
          ) : (
            <div className="overflow-hidden rounded-md border border-line">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="w-[120px]">Category</th>
                    <th>Rule</th>
                    <th>Redacted evidence</th>
                  </tr>
                </thead>
                <tbody>
                  {findings.map((f, i) => (
                    <tr key={`${f.rule}-${i}`}>
                      <td>
                        <CategoryBadge category={f.category} />
                      </td>
                      <td className="mono text-xs text-fg">{f.rule}</td>
                      <td>
                        <code className="mono rounded border border-line bg-sunken px-1.5 py-0.5 text-xs text-fg">{f.redacted_evidence}</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div>
            <p className="eyebrow mb-1">Masked text (what ShadowGuard keeps in memory)</p>
            <MaskedText text={scan.data.masked_text} />
          </div>
        </div>
      )}
    </Card>
  );
}
