import Link from "next/link";
import type { ReactNode } from "react";

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
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60";
export const buttonStyles = {
  primary: `${buttonBase} bg-indigo-600 text-white hover:bg-indigo-700 focus-visible:outline-indigo-600`,
  secondary: `${buttonBase} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 focus-visible:outline-slate-400`,
  danger: `${buttonBase} border border-red-200 bg-white text-red-700 hover:bg-red-50 focus-visible:outline-red-600`,
};

export function LinkButton({
  href,
  children,
  variant = "primary",
}: {
  href: string;
  children: ReactNode;
  variant?: keyof typeof buttonStyles;
}) {
  return (
    <Link href={href} className={buttonStyles[variant]}>
      {children}
    </Link>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>{children}</div>;
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
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${badgeTones[tone]}`}>
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

/** Table shell with horizontal scroll on small screens. */
export function DataTable({ head, children }: { head: ReactNode; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>{head}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  );
}

export function Th({ children, right }: { children?: ReactNode; right?: boolean }) {
  return <th className={`whitespace-nowrap px-4 py-3 ${right ? "text-right" : ""}`}>{children}</th>;
}

export function Td({ children, right, mono }: { children?: ReactNode; right?: boolean; mono?: boolean }) {
  return (
    <td className={`whitespace-nowrap px-4 py-3 text-slate-700 ${right ? "text-right tabular-nums" : ""} ${mono ? "font-mono text-[13px]" : ""}`}>
      {children}
    </td>
  );
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
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
    if (p > 1) sp.set("page", String(p));
    const qs = sp.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };
  return (
    <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm text-slate-500">
      <span>
        {total} record{total === 1 ? "" : "s"}
      </span>
      {pageCount > 1 && (
        <div className="flex items-center gap-2">
          {page > 1 && (
            <Link className={buttonStyles.secondary} href={href(page - 1)}>
              Previous
            </Link>
          )}
          <span>
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

/** GET search form + status filter pills; works without JavaScript. */
export function ListToolbar({
  basePath,
  q,
  placeholder,
  status,
  statuses,
}: {
  basePath: string;
  q?: string;
  placeholder: string;
  status?: string;
  statuses?: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-slate-200 p-4 lg:flex-row lg:items-center lg:justify-between">
      <form action={basePath} method="get" className="flex w-full max-w-md gap-2">
        {status && <input type="hidden" name="status" value={status} />}
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder={placeholder}
          maxLength={60}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
        />
        <button type="submit" className={buttonStyles.secondary}>
          Search
        </button>
      </form>
      {statuses && (
        <nav className="flex flex-wrap gap-1" aria-label="Filter by status">
          {statuses.map((s) => {
            const sp = new URLSearchParams();
            if (q) sp.set("q", q);
            sp.set("status", s.value);
            const active = s.value === status;
            return (
              <Link
                key={s.value}
                href={`${basePath}?${sp.toString()}`}
                aria-current={active ? "page" : undefined}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  active ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {s.label}
              </Link>
            );
          })}
        </nav>
      )}
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
