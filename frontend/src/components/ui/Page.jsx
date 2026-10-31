/** Same padding and max width on every page. */
export function PageShell({ children }) {
  return <div className="mx-auto w-full max-w-[1480px] space-y-4 px-6 pb-8 pt-5">{children}</div>;
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-title font-semibold tracking-tight text-fg">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
