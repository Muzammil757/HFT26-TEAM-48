/**
 * Console-style tab bar. A dot marks tabs whose content changed (live polling)
 * since they were last viewed.
 */
export default function DetailTabs({ tabs, active, onChange }) {
  return (
    <div role="tablist" aria-label="Incident sections" className="flex gap-1 overflow-x-auto border-t border-line px-3">
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={`panel-${tab.id}`}
            onClick={() => onChange(tab.id)}
            className={`relative flex h-10 shrink-0 items-center gap-1.5 px-2.5 text-[13px] transition-colors duration-150 ${
              selected ? "font-semibold text-accent-strong" : "text-muted hover:text-fg"
            }`}
          >
            {tab.label}
            {tab.count != null && (
              <span
                className={`mono rounded px-1.5 text-2xs font-medium ${selected ? "bg-accent-soft text-accent-strong" : "bg-sunken text-muted"}`}
              >
                {tab.count}
              </span>
            )}
            {tab.dot && (
              <span className="h-1.5 w-1.5 rounded-full bg-critical" title="Updated since you last viewed this tab" aria-label="updated" />
            )}
            {selected && <span className="absolute inset-x-1.5 bottom-0 h-0.5 rounded-t bg-accent" aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );
}
