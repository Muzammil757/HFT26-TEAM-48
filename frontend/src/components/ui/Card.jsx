/** Card with the one consistent header used across the app. */
export default function Card({ title, subtitle, icon: Icon, actions, children, className = "", bodyClassName = "" }) {
  return (
    <section className={`card flex min-w-0 flex-col overflow-hidden ${className}`}>
      {title && (
        <header className="flex min-h-12 shrink-0 items-center justify-between gap-3 border-b border-line px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2.5">
            {Icon && (
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-line bg-sunken text-accent">
                <Icon size={15} />
              </span>
            )}
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold text-fg">{title}</h2>
              {subtitle && <p className="truncate text-xs text-muted">{subtitle}</p>}
            </div>
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={`min-w-0 flex-1 ${bodyClassName}`}>{children}</div>
    </section>
  );
}
