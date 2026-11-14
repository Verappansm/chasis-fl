import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/dal";
import { auditSummary, auditUsernames, listAudit, parseAuditFilters, type AuditFilters } from "@/lib/repo/audit";
import { AUDIT_ACTION_LABELS, AUDIT_ENTITY_LABELS, FIELD_LABELS, auditHref } from "@/lib/audit-labels";
import { formatDay, formatMoney, formatPercent } from "@/lib/format";
import type { AuditAction, AuditChange, AuditLogDoc } from "@/lib/types";
import { Badge, Card, EmptyState, PageHeader, TableSkeleton, buttonStyles, one } from "@/components/ui";

export const metadata: Metadata = { title: "Activity log" };

export default function ActivityPage({ searchParams }: PageProps<"/admin/activity">) {
  return (
    <>
      <PageHeader
        title="Activity log"
        description="Every change, sign-in and refused access, with who did it, when and from where. Entries cannot be edited or deleted from the app."
      />
      <Suspense fallback={<TableSkeleton />}>
        <Activity searchParams={searchParams} />
      </Suspense>
    </>
  );
}

const ACTION_TONE: Record<AuditAction, "green" | "amber" | "red" | "slate" | "indigo"> = {
  create: "green",
  update: "indigo",
  delete: "red",
  login: "slate",
  logout: "slate",
  login_failed: "amber",
  denied: "red",
};

const MONEY = new Set([
  "basicPrice", "salesMeasure", "demoDiscount", "lossAllowance", "taxableAmount", "gstAmount", "finalPrice", "salePrice", "saleGst",
  "saleTotal", "priceDifference", "lossClaim", "saleSalesMeasure", "netProfit", "claimAmount", "claimGst", "claimTotal", "tdsAmount",
  "receivedAmount", "balance", "loanAmount", "odPremium", "purchasePrice",
]);
const RATE = /RateBp$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T/;

function show(field: string, v: unknown): string {
  if (v === undefined || v === null || v === "") return "—";
  if (typeof v === "number") return MONEY.has(field) ? formatMoney(v) : RATE.test(field) ? formatPercent(v) : String(v);
  if (v instanceof Date) return formatDay(v);
  if (typeof v === "string") return ISO_DATE.test(v) ? formatDay(v.slice(0, 10)) : v;
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (Array.isArray(v)) {
    if (field === "receipts") return `${v.length} receipt${v.length === 1 ? "" : "s"}`;
    return v.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(", ") || "—";
  }
  return JSON.stringify(v);
}

function Changes({ changes }: { changes: AuditChange[] }) {
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-xs font-medium text-indigo-700">
        {changes.length} field{changes.length === 1 ? "" : "s"} changed
      </summary>
      <table className="mt-2 w-full text-xs">
        <tbody className="divide-y divide-slate-100">
          {changes.map((c) => (
            <tr key={c.field}>
              <th className="py-1 pr-3 text-left font-medium text-slate-600">{FIELD_LABELS[c.field] ?? c.field}</th>
              <td className="py-1 pr-2 text-slate-500 line-through decoration-slate-300">{show(c.field, c.from)}</td>
              <td className="py-1 text-slate-900">{show(c.field, c.to)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

function What({ a }: { a: AuditLogDoc }) {
  const href = a.action !== "delete" ? auditHref(a.entity, a.entityId) : undefined;
  const ref = a.ref ?? a.chassisNumber;
  if (a.action === "denied") return <span>Tried to open a page needing <span className="font-mono text-xs">{a.detail}</span></span>;
  if (a.action === "login_failed") return <span>Sign-in refused: {a.detail}</span>;
  if (a.entity === "auth") return <span className="text-slate-400">Session</span>;
  return (
    <span>
      {AUDIT_ENTITY_LABELS[a.entity]}{" "}
      {ref &&
        (href ? (
          <Link href={href} className="font-mono text-[13px] text-indigo-700 hover:underline">
            {ref}
          </Link>
        ) : (
          <span className="font-mono text-[13px]">{ref}</span>
        ))}
      {a.chassisNumber && a.ref && <span className="ml-1 font-mono text-xs text-slate-400">{a.chassisNumber}</span>}
    </span>
  );
}

const when = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Kolkata" });

function Select({ name, label, value, options }: { name: string; label: string; value?: string; options: { value: string; label: string }[] }) {
  return (
    <label className="block text-xs font-medium text-slate-600">
      {label}
      <select name={name} defaultValue={value ?? ""} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900">
        <option value="">All</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function qs(f: AuditFilters, page?: number) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v) sp.set(k, v);
  if (page && page > 1) sp.set("page", String(page));
  const s = sp.toString();
  return s ? `/admin/activity?${s}` : "/admin/activity";
}

async function Activity({ searchParams }: { searchParams: PageProps<"/admin/activity">["searchParams"] }) {
  await requireAdmin();
  const raw = await searchParams;
  const sp = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, one(v)]));
  const f = parseAuditFilters(sp);
  const page = Number(sp.page ?? 1);
  const [result, usernames, summary] = await Promise.all([listAudit(f, page), auditUsernames(), auditSummary()]);
  const anyFilter = Object.values(f).some(Boolean);

  return (
    <div className="space-y-6">
      <section aria-label="Last 24 hours" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "Changes (24h)", value: summary.changes, href: qs({ action: undefined }) },
          { label: "Sign-ins (24h)", value: summary.logins, href: qs({ action: "login" }) },
          { label: "Failed sign-ins (24h)", value: summary.failedLogins, href: qs({ action: "login_failed" }), alert: summary.failedLogins >= 5 },
          { label: "Access refused (24h)", value: summary.denied, href: qs({ action: "denied" }), alert: summary.denied > 0 },
        ].map((t) => (
          <Link key={t.label} href={t.href} className="block rounded-xl">
            <Card className="p-4 transition hover:border-indigo-300">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{t.label}</p>
              <p className={`mt-1.5 text-xl font-semibold tabular-nums ${t.alert ? "text-red-700" : "text-slate-900"}`}>{t.value}</p>
            </Card>
          </Link>
        ))}
      </section>

      <Card>
        <form action="/admin/activity" method="get" className="grid grid-cols-2 gap-3 border-b border-slate-200 p-4 md:grid-cols-3 xl:grid-cols-7">
          <Select name="user" label="User" value={f.user} options={usernames.map((u) => ({ value: u, label: u }))} />
          <Select name="entity" label="Area" value={f.entity} options={Object.entries(AUDIT_ENTITY_LABELS).map(([value, label]) => ({ value, label }))} />
          <Select name="action" label="Action" value={f.action} options={Object.entries(AUDIT_ACTION_LABELS).map(([value, label]) => ({ value, label }))} />
          <label className="block text-xs font-medium text-slate-600">
            From
            <input type="date" name="from" defaultValue={f.from} className="mt-1 block w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm" />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            To
            <input type="date" name="to" defaultValue={f.to} className="mt-1 block w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm" />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Search
            <input
              type="search"
              name="q"
              defaultValue={f.q}
              maxLength={60}
              placeholder="Ref, chassis, IP"
              className="mt-1 block w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm"
            />
          </label>
          <div className="flex items-end gap-2">
            <button type="submit" className={buttonStyles.primary}>
              Filter
            </button>
            {anyFilter && (
              <Link href="/admin/activity" className={buttonStyles.secondary}>
                Clear
              </Link>
            )}
          </div>
        </form>

        {result.items.length === 0 ? (
          <EmptyState title="No activity matches these filters" />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="whitespace-nowrap px-4 py-3">When (IST)</th>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">What</th>
                  <th className="px-4 py-3">From</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 align-top">
                {result.items.map((a) => (
                  <tr key={a._id.toHexString()}>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500 tabular-nums">{when.format(a.at)}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      <Link href={qs({ ...f, user: a.username })} className="hover:underline">
                        {a.username || "—"}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={ACTION_TONE[a.action]}>{AUDIT_ACTION_LABELS[a.action]}</Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      <What a={a} />
                      {a.changes && a.changes.length > 0 && <Changes changes={a.changes} />}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {a.ip ?? "—"}
                      {a.userAgent && <span className="block max-w-56 truncate text-slate-400" title={a.userAgent}>{a.userAgent}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm text-slate-500">
          <span>
            {result.total} entr{result.total === 1 ? "y" : "ies"}
          </span>
          {result.pageCount > 1 && (
            <div className="flex items-center gap-2">
              {result.page > 1 && (
                <Link className={buttonStyles.secondary} href={qs(f, result.page - 1)}>
                  Newer
                </Link>
              )}
              <span>
                Page {result.page} of {result.pageCount}
              </span>
              {result.page < result.pageCount && (
                <Link className={buttonStyles.secondary} href={qs(f, result.page + 1)}>
                  Older
                </Link>
              )}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
