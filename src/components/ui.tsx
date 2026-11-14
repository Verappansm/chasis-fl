import Link from "next/link";
import type { ReactNode } from "react";
import { PAGE_SIZE_OPTIONS, type PageSizeValue } from "@/lib/paging";
import { PageSizeSelect } from "./page-size-select";

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-[22px] font-semibold leading-tight tracking-tight text-slate-900">{title}</h1>
        {description && <p className="mt-1.5 max-w-3xl text-sm leading-6 text-slate-500">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

const buttonBase =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60";
export const buttonStyles = {
  primary: `${buttonBase} bg-slate-900 text-white shadow-sm hover:bg-slate-800 focus-visible:outline-slate-900`,
  secondary: `${buttonBase} border border-slate-200 bg-white text-slate-700 shadow-xs hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-slate-400`,
  danger: `${buttonBase} border border-red-200 bg-white text-red-700 hover:bg-red-50 focus-visible:outline-red-600`,
};

export function LinkButton({
  href,
  children,
  variant = "primary",
  tour,
}: {
  href: string;
  children: ReactNode;
  variant?: keyof typeof buttonStyles;
  /** data-tour marker for the guided tour. */
  tour?: string;
}) {
  return (
    <Link href={href} className={buttonStyles[variant]} data-tour={tour}>
      {children}
    </Link>
  );
}

export function Card({ children, className = "", tour }: { children: ReactNode; className?: string; tour?: string }) {
  return (
    <div className={`rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgb(15_23_42/0.04)] ${className}`} data-tour={tour}>
      {children}
    </div>
  );
}

const badgeTones = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  amber: "bg-amber-50 text-amber-800 ring-amber-600/20",
  red: "bg-red-50 text-red-700 ring-red-600/20",
  slate: "bg-slate-100 text-slate-700 ring-slate-500/20",
  indigo: "bg-indigo-50 text-indigo-700 ring-indigo-600/20",
};

export function Badge({ tone, children }: { tone: keyof typeof badgeTones; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${badgeTones[tone]}`}>
      {children}
    </span>
  );
}

export function Flash({ saved, deleted }: { saved?: boolean; deleted?: boolean }) {
  if (!saved && !deleted) return null;
  return (
    <div role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
      {saved ? "Record saved." : "Record deleted."}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="px-6 py-14 text-center">
      <p className="text-sm font-medium text-slate-900">{title}</p>
      {children && <div className="mt-1 text-sm text-slate-500">{children}</div>}
    </div>
  );
}

const STACK = { md: "rt rt-md", lg: "rt rt-lg", xl: "rt rt-xl" } as const;

/**
 * Table that never scrolls sideways: a normal table from the `stack`
 * breakpoint up (cells wrap), a list of labelled cards below it.
 * Give each Td a `label` (shown on the cards) and mark the first cell `primary`.
 */
export function DataTable({ head, children, stack = "lg" }: { head: ReactNode; children: ReactNode; stack?: keyof typeof STACK }) {
  return (
    <table className={`${STACK[stack]} w-full text-sm`}>
      <thead className="border-b border-slate-200 bg-slate-50/70 text-left text-[11px] font-medium uppercase tracking-wider text-slate-500">
        <tr>{head}</tr>
      </thead>
      <tbody className="divide-y divide-slate-100">{children}</tbody>
    </table>
  );
}

export function Th({ children, right, className = "" }: { children?: ReactNode; right?: boolean; className?: string }) {
  return <th className={`px-4 py-2.5 align-bottom font-medium ${right ? "text-right" : ""} ${className}`}>{children}</th>;
}

export function Td({
  children,
  right,
  mono,
  label,
  primary,
  wide,
}: {
  children?: ReactNode;
  right?: boolean;
  mono?: boolean;
  /** Column name, shown above the value when rows stack as cards. */
  label?: string;
  /** Title of the card when rows stack (full width, no label). */
  primary?: boolean;
  /** Full card width when stacked. */
  wide?: boolean;
}) {
  return (
    <td
      data-label={primary ? undefined : label}
      data-primary={primary ? "" : undefined}
      data-wide={wide ? "" : undefined}
      className={`px-4 py-3 align-top text-slate-700 ${right ? "text-right tabular-nums" : ""} ${mono ? "font-mono text-[13px]" : ""}`}
    >
      {children}
    </td>
  );
}

/** Second line inside a table cell. */
export function Sub({ children, mono }: { children: ReactNode; mono?: boolean }) {
  return <span className={`mt-0.5 block text-xs text-slate-500 ${mono ? "font-mono" : ""}`}>{children}</span>;
}

/** Sticky row tint for list rows. */
export const rowClass = "transition-colors hover:bg-slate-50/80";

function listHref(basePath: string, params: Record<string, string | undefined>, page?: number) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
  if (page && page > 1) sp.set("page", String(page));
  const qs = sp.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export function Pagination({
  basePath,
  page,
  pageCount,
  total,
  params,
}: {
  basePath: string;
  page: number;
  pageCount: number;
  total: number;
  params: Record<string, string | undefined>;
}) {
  const href = (p: number) => listHref(basePath, params, p);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm text-slate-500">
      <span className="tabular-nums">
        {total.toLocaleString("en-IN")} record{total === 1 ? "" : "s"}
      </span>
      {pageCount > 1 && (
        <div className="flex items-center gap-2">
          {page > 1 && (
            <Link className={buttonStyles.secondary} href={href(page - 1)}>
              Previous
            </Link>
          )}
          <span className="tabular-nums">
            Page {page} of {pageCount}
          </span>
          {page < pageCount && (
            <Link className={buttonStyles.secondary} href={href(page + 1)}>
              Next
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

export interface FilterGroup {
  /** Query-string parameter, e.g. "stage". */
  param: string;
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
}

/** GET search form + rows of filter pills; works without JavaScript. Each pill keeps the other filters. */
export function ListToolbar({
  basePath,
  q,
  placeholder,
  filters = [],
  pageSize,
  extra = {},
}: {
  basePath: string;
  q?: string;
  placeholder: string;
  filters?: FilterGroup[];
  /** Shows the rows-per-page picker on the right. */
  pageSize?: PageSizeValue;
  /** Other params to keep when filters change (e.g. a view toggle). */
  extra?: Record<string, string | undefined>;
}) {
  const current = (): Record<string, string | undefined> => {
    const p: Record<string, string | undefined> = { q, ...extra };
    for (const f of filters) p[f.param] = f.value !== f.options[0]?.value ? f.value : undefined;
    if (pageSize && pageSize !== PAGE_SIZE_OPTIONS[0].value) p.size = pageSize;
    return p;
  };
  const hrefWith = (param: string, value: string, isDefault: boolean) => listHref(basePath, { ...current(), [param]: isDefault ? undefined : value });
  const keep = Object.entries(current()).filter(([k, v]) => k !== "q" && v);
  return (
    <div className="space-y-3 border-b border-slate-200 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <form action={basePath} method="get" className="flex w-full gap-2 sm:max-w-md" role="search">
          {keep.map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <div className="relative w-full">
            <svg viewBox="0 0 20 20" fill="currentColor" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden>
              <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 3.47 9.77l3.13 3.13a.75.75 0 1 0 1.06-1.06l-3.13-3.13A5.5 5.5 0 0 0 9 3.5ZM5 9a4 4 0 1 1 8 0 4 4 0 0 1-8 0Z" clipRule="evenodd" />
            </svg>
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder={placeholder}
              aria-label="Search"
              maxLength={60}
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm shadow-xs outline-none placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/15"
            />
          </div>
          <button type="submit" className={buttonStyles.secondary}>
            Search
          </button>
        </form>
        {pageSize && (
          <PageSizeSelect
            value={pageSize}
            options={PAGE_SIZE_OPTIONS.map((o) => ({ ...o, href: hrefWith("size", o.value, o.value === PAGE_SIZE_OPTIONS[0].value) }))}
          />
        )}
      </div>
      {filters.map((f) => (
        <nav key={f.param} className="flex flex-wrap items-center gap-1.5" aria-label={`Filter by ${f.label.toLowerCase()}`}>
          <span className="mr-1 w-full text-xs font-medium text-slate-500 sm:w-14">{f.label}</span>
          {f.options.map((o, i) => {
            const active = o.value === f.value;
            return (
              <Link
                key={o.value}
                href={hrefWith(f.param, o.value, i === 0)}
                aria-current={active ? "page" : undefined}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  active ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900"
                }`}
              >
                {o.label}
              </Link>
            );
          })}
        </nav>
      ))}
    </div>
  );
}

export function TableSkeleton() {
  return (
    <Card>
      <div className="space-y-3 p-6" aria-busy="true" aria-label="Loading">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-4 animate-pulse rounded bg-slate-100" />
        ))}
      </div>
    </Card>
  );
}

/** Normalises a searchParams value to a single string. */
export function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
