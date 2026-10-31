import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, Search, X } from "lucide-react";

const control =
  "h-8 rounded-md border border-line-strong bg-card text-[13px] text-fg transition-colors duration-150 hover:border-[#bcc7d6] focus-within:border-accent";

/**
 * Search box that owns its text and reports it after a short pause, so fast typing
 * is never overwritten by a URL round-trip. An outside change to `value` (e.g.
 * "Clear filters") replaces the text.
 */
export function SearchInput({ value, onChange, placeholder = "Search", label, className = "w-64", delay = 200 }) {
  const [text, setText] = useState(value);
  const committedRef = useRef(value);
  const onChangeRef = useRef(onChange);
  useLayoutEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    if (value !== committedRef.current) {
      committedRef.current = value;
      setText(value);
    }
  }, [value]);

  useEffect(() => {
    if (text === committedRef.current) return undefined;
    const timer = window.setTimeout(() => {
      committedRef.current = text;
      onChangeRef.current(text);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [text, delay]);

  return (
    <label className={`relative flex items-center ${control} ${className}`}>
      <Search size={14} className="pointer-events-none absolute left-2.5 text-subtle" />
      <input
        type="search"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={placeholder}
        aria-label={label || placeholder}
        className="h-full w-full rounded-md bg-transparent pl-8 pr-2 outline-none placeholder:text-subtle"
      />
    </label>
  );
}

/** Native select styled as a compact filter: "Provider: All". */
export function SelectFilter({ label, value, onChange, options }) {
  const active = value !== options[0]?.value;
  return (
    <label
      className={`relative flex items-center gap-1 pl-2.5 pr-7 ${control} ${active ? "!border-accent bg-accent-soft" : ""}`}
    >
      <span className="text-muted">{label}:</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
        className="h-full cursor-pointer appearance-none bg-transparent pr-1 font-medium text-fg outline-none [field-sizing:content]"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown size={14} className="pointer-events-none absolute right-2 text-muted" />
    </label>
  );
}

/** Small segmented control for 2–3 mutually exclusive options. */
export function Segmented({ value, onChange, options, label }) {
  return (
    <div role="group" aria-label={label} className="flex h-8 items-center rounded-md border border-line-strong bg-sunken p-0.5">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={`flex h-full items-center gap-1.5 rounded px-2.5 text-[13px] transition-colors duration-150 ${
              selected ? "bg-card font-medium text-fg shadow-[0_1px_2px_rgb(23_36_58/0.08)]" : "text-muted hover:text-fg"
            }`}
          >
            {option.icon && <option.icon size={13} />}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function ClearFiltersButton({ onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-[13px] font-medium text-accent transition-colors duration-150 hover:bg-accent-soft disabled:text-subtle disabled:hover:bg-transparent"
    >
      <X size={14} />
      Clear filters
    </button>
  );
}

/** Sortable column header. `direction` is "asc" | "desc" | null (not sorted by this). */
export function SortHeader({ children, direction, onClick, align = "left", title }) {
  const Icon = direction === "asc" ? ArrowUp : direction === "desc" ? ArrowDown : ArrowUpDown;
  return (
    <th aria-sort={direction === "asc" ? "ascending" : direction === "desc" ? "descending" : "none"} className={align === "right" ? "text-right" : ""}>
      <button
        type="button"
        onClick={onClick}
        title={title}
        className={`inline-flex items-center gap-1 uppercase tracking-[0.05em] transition-colors duration-150 hover:text-fg ${direction ? "text-fg" : ""}`}
      >
        {children}
        <Icon size={12} className={direction ? "text-accent" : "text-subtle"} />
      </button>
    </th>
  );
}

/** Filter bar row above a table. */
export function Toolbar({ children, trailing }) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
      {children}
      {trailing && <div className="ml-auto flex items-center gap-2 text-xs text-muted">{trailing}</div>}
    </div>
  );
}
