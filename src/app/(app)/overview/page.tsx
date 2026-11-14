import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import type { ReactNode } from "react";
import { requirePermission } from "@/lib/auth/dal";
import { can, type Principal } from "@/lib/permissions";
import { AGEING_DAYS } from "@/lib/repo/modules";
import { AGE_BUCKETS, overviewCharts, overviewStats, type Pipeline } from "@/lib/repo/overview";
import { PERIODS, parsePeriod, type Period } from "@/lib/periods";
import { formatDateTime, formatMoney } from "@/lib/format";
import { AUDIT_ACTION_LABELS, AUDIT_ENTITY_LABELS } from "@/lib/audit-labels";
import { BarChart, HBars, Legend, StackBar, shortMoney } from "@/components/charts";
import { Badge, Card, EmptyState, PageHeader, one } from "@/components/ui";

export const metadata: Metadata = { title: "Overview" };

export default function OverviewPage({ searchParams }: PageProps<"/overview">) {
  return (
    <>
      <PageHeader title="Overview" description="Where every receivable stands: not billed, billed and waiting, collected, or short-paid." />
      <Suspense fallback={<OverviewSkeleton />}>
        <Overview searchParams={searchParams} />
      </Suspense>
    </>
  );
}

function PeriodPills({ period }: { period: Period }) {
  return (
    <nav className="flex flex-wrap gap-1" aria-label="Period" data-tour="ov-period">
      {PERIODS.map((p) => (
        <Link
          key={p.value}
          href={p.value === "month" ? "/overview" : `/overview?period=${p.value}`}
          aria-current={p.value === period ? "page" : undefined}
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            p.value === period ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          {p.label}
        </Link>
      ))}
    </nav>
  );
}

function StageRow({ label, count, amount, href, tone, extra }: { label: string; count: number; amount: number; href: string; tone: string; extra?: ReactNode }) {
  return (
    <Link href={href} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm hover:bg-slate-50">
      <span className="flex items-center gap-2">
        <span className={`size-2 rounded-full ${tone}`} aria-hidden />
        <span className="text-slate-700">{label}</span>
        {extra}
      </span>
      <span className="text-right tabular-nums">
        <span className="font-semibold text-slate-900">{count}</span>
        <span className="ml-3 inline-block min-w-24 text-slate-600">{formatMoney(amount)}</span>
      </span>
    </Link>
  );
}

/** One receivable stream through the invoice → receipt loop. */
function PipelineCard({ title, unit, p, href, period, avgDays }: { title: string; unit: string; p: Pipeline; href: string; period: Period; avgDays: number | null }) {
  const link = (stage: string) => `${href}?stage=${stage}${period === "all" ? "" : `&period=${period}`}`;
  const billed = p.all.count - p.stages.not_billed.count;
  const paid = p.stages.collected.count + p.stages.short_paid.count;
  return (
    <Card className="flex flex-col">
      <div className="border-b border-slate-200 px-5 py-4">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{title}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{formatMoney(p.all.total)}</p>
        <p className="mt-0.5 text-sm text-slate-500">
          {p.all.count} {unit} · {billed} billed · {paid} receipt{paid === 1 ? "" : "s"}
        </p>
        <div className="mt-3">
          <StackBar
            label={`${title} by stage`}
            parts={[
              { name: "Not billed", value: p.stages.not_billed.count, swatch: "bg-amber-400" },
              { name: "Billed", value: p.stages.billed.count, swatch: "bg-indigo-500" },
              { name: "Collected", value: p.stages.collected.count, swatch: "bg-emerald-500" },
              { name: "Short-paid", value: p.stages.short_paid.count, swatch: "bg-red-500" },
            ]}
          />
        </div>
      </div>
      <div className="flex-1 divide-y divide-slate-100 py-1">
        <StageRow label="Not billed" count={p.stages.not_billed.count} amount={p.stages.not_billed.total} href={link("not_billed")} tone="bg-amber-400" />
        <StageRow
          label="Billed, not collected"
          count={p.stages.billed.count}
          amount={p.stages.billed.total}
          href={link("billed")}
          tone="bg-indigo-500"
          extra={p.aged.count > 0 && <Badge tone="red">{p.aged.count} over {AGEING_DAYS}d</Badge>}
        />
        <StageRow label="Collected" count={p.stages.collected.count} amount={p.stages.collected.received} href={link("collected")} tone="bg-emerald-500" />
        <StageRow label="Short-paid (balance due)" count={p.stages.short_paid.count} amount={p.stages.short_paid.balance} href={link("short_paid")} tone="bg-red-500" />
      </div>
      <div className="border-t border-slate-200 px-5 py-2.5 text-xs text-slate-500">
        Received {formatMoney(p.all.received)} · TDS {formatMoney(p.all.tds)}
        {avgDays !== null && <> · {avgDays} days from invoice to receipt on average</>}
      </div>
    </Card>
  );
}

function Tile({ label, value, detail, href, tone }: { label: string; value: string; detail?: ReactNode; href?: string; tone?: "red" | "green" }) {
  const body = (
    <Card className={`h-full p-5 ${href ? "transition hover:border-indigo-300 hover:shadow" : ""}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-semibold tabular-nums ${tone === "red" ? "text-red-700" : tone === "green" ? "text-emerald-700" : "text-slate-900"}`}>{value}</p>
      {detail && <p className="mt-1 text-sm text-slate-500">{detail}</p>}
    </Card>
  );
  return href ? (
    <Link href={href} className="block h-full rounded-xl focus-visible:outline-2 focus-visible:outline-indigo-600">
      {body}
    </Link>
  ) : (
    body
  );
}

function ChartCard({ title, description, children, tour }: { title: string; description?: string; children: ReactNode; tour?: string }) {
  return (
    <Card className="p-5" tour={tour}>
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
      <div className="mt-4">{children}</div>
    </Card>
  );
}

const TREND_SERIES = [
  { name: "Invoiced", fill: "fill-indigo-500", swatch: "bg-indigo-500" },
  { name: "Collected", fill: "fill-emerald-500", swatch: "bg-emerald-500" },
];
const CAR_SERIES = [
  { name: "New", fill: "fill-indigo-500", swatch: "bg-indigo-500" },
  { name: "Demo, bidding, courtesy & others", fill: "fill-sky-300", swatch: "bg-sky-300" },
];

async function Overview({ searchParams }: { searchParams: PageProps<"/overview">["searchParams"] }) {
  const user: Principal = await requirePermission("overview:view");
  const period = parsePeriod(one((await searchParams).period), "month");
  const [s, ch] = await Promise.all([overviewStats(period), overviewCharts(period)]);
  const periodLabel = PERIODS.find((p) => p.value === period)!.label.toLowerCase();
  const streams = [
    { key: "purchases", title: "Fixed compensation (new cars)", unit: "new cars", p: s.fc, href: "/purchases" },
    { key: "finance", title: "Finance payout", unit: "payouts", p: s.finance, href: "/finance" },
    { key: "insurance", title: "Insurance payout", unit: "payouts", p: s.insurance, href: "/insurance" },
    { key: "renewals", title: "Renewal payout", unit: "renewals", p: s.renewals, href: "/renewals" },
  ] as const;
  const visible = streams.filter((x) => can(user, `${x.key}:view`));
  const toCollect = visible.reduce((t, x) => t + x.p.stages.billed.total + x.p.stages.short_paid.balance, 0);
  const notBilled = visible.reduce((t, x) => t + x.p.stages.not_billed.total, 0);
  const received = visible.reduce((t, x) => t + x.p.all.received, 0);
  const aged = visible.reduce((t, x) => t + x.p.aged.count, 0);
  const canPurchases = can(user, "purchases:view");

  // Charts sum the streams this user may see.
  const visibleCharts = visible.map((x) => ch.streams[x.key]);
  const trend = [
    ch.months.map((m) => visibleCharts.reduce((t, c) => t + (c.trend.invoiced[m.key] ?? 0), 0)),
    ch.months.map((m) => visibleCharts.reduce((t, c) => t + (c.trend.collected[m.key] ?? 0), 0)),
  ];
  const ageing = AGE_BUCKETS.map((b, i) => ({
    label: b.label,
    value: visibleCharts.reduce((t, c) => t + c.ageing[i], 0),
    fill: ["bg-emerald-500", "bg-amber-400", "bg-orange-500", "bg-red-600"][i],
  }));
  const providers = [
    ...(can(user, "finance:view") ? ch.streams.finance.providers.map((p) => ({ ...p, kind: "Finance" })) : []),
    ...(can(user, "insurance:view") ? ch.streams.insurance.providers.map((p) => ({ ...p, kind: "Insurance" })) : []),
  ]
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <PeriodPills period={period} />
        <p className="text-xs text-slate-500">Counts and amounts are for records dated {periodLabel}; charts show the last 12 months.</p>
      </div>

      <section aria-label="Key figures" className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Tile label="Not billed yet" value={formatMoney(notBilled)} detail="Invoices still to raise" />
        <Tile
          label="Billed, still to collect"
          value={formatMoney(toCollect)}
          detail={aged ? `${aged} invoice${aged === 1 ? "" : "s"} over ${AGEING_DAYS} days` : "Nothing overdue"}
          tone={aged ? "red" : undefined}
        />
        <Tile label={`Received, ${periodLabel}`} value={formatMoney(received)} detail="Against invoices in the period" tone="green" />
        {canPurchases ? (
          <Tile
            label={`Demo cars net P&L, ${periodLabel}`}
            value={formatMoney(ch.demo.netProfit)}
            detail={`${ch.demo.sold} demo car${ch.demo.sold === 1 ? "" : "s"} sold · incl. GST`}
            tone={ch.demo.netProfit < 0 ? "red" : ch.demo.sold ? "green" : undefined}
            href={`/demo${period === "month" ? "" : `?period=${period}`}`}
          />
        ) : (
          <Tile label="Renewals due (30 days)" value={String(s.expiringSoon)} href={can(user, "renewals:view") ? "/renewals" : undefined} />
        )}
      </section>

      <section aria-labelledby="h-pipeline" data-tour="ov-pipeline">
        <h2 id="h-pipeline" className="mb-3 text-sm font-semibold text-slate-700">
          Receivables, {periodLabel}
        </h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {visible.map((x) => (
            <PipelineCard key={x.key} title={x.title} unit={x.unit} p={x.p} href={x.href} period={period} avgDays={ch.streams[x.key].avgDaysToCollect} />
          ))}
        </div>
      </section>

      {visible.length > 0 && (
        <section aria-labelledby="h-trends" className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <h2 id="h-trends" className="sr-only">
            Trends
          </h2>
          <div className="xl:col-span-2">
            <ChartCard title="Invoiced vs collected" description="Invoices raised and money received, by month (all receivable streams you can see)." tour="ov-trend">
              <Legend series={TREND_SERIES} />
              <BarChart title="Invoiced vs collected by month" categories={ch.months.map((m) => m.label)} series={TREND_SERIES} values={trend} format={formatMoney} axisFormat={shortMoney} />
            </ChartCard>
          </div>
          <ChartCard title="Outstanding by invoice age" description="Billed and short-paid amounts still to collect, right now.">
            <HBars items={ageing} format={formatMoney} empty="Nothing outstanding." />
          </ChartCard>
        </section>
      )}

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {canPurchases && (
          <div className="xl:col-span-2">
            <ChartCard title="Cars bought per month" description="New cars vs demo, bidding, courtesy and other types.">
              <Legend series={CAR_SERIES} />
              <BarChart
                title="Cars bought per month"
                categories={ch.cars.map((c) => c.month)}
                series={CAR_SERIES}
                values={[ch.cars.map((c) => c.newCars), ch.cars.map((c) => c.others)]}
                stacked
              />
            </ChartCard>
          </div>
        )}
        {providers.length > 0 && (
          <ChartCard title={`Top providers, ${periodLabel}`} description="Payout invoiced (incl. GST), finance and insurance.">
            <HBars items={providers.map((p) => ({ label: `${p.provider} · ${p.kind}`, value: p.total, detail: `${p.count}` }))} format={formatMoney} />
          </ChartCard>
        )}
      </section>

      <section aria-labelledby="h-stock" data-tour="ov-stock">
        <h2 id="h-stock" className="mb-3 text-sm font-semibold text-slate-700">
          Cars
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Tile
            label={`Bought, ${periodLabel}`}
            value={String(Object.values(s.purchasesByType).reduce((a, b) => a + b, 0))}
            detail={`${s.purchasesByType.new ?? 0} new · ${s.purchasesByType.demo ?? 0} demo · ${
              Object.entries(s.purchasesByType)
                .filter(([t]) => t !== "new" && t !== "demo")
                .reduce((a, [, n]) => a + n, 0)
            } other`}
            href={canPurchases ? `/purchases${period === "all" ? "" : `?period=${period}`}` : undefined}
          />
          <Tile
            label="Demo cars in lock-in"
            value={String(s.stock.locked)}
            detail={`${s.stock.deflected} deflected and ready to sell`}
            href={canPurchases ? "/demo" : undefined}
          />
          <Tile
            label="Pre-owned in stock"
            value={String(s.preowned.inStock)}
            detail={`${s.preowned.soldInPeriod} sold ${periodLabel}`}
            href={can(user, "preowned:view") ? "/preowned?status=in_stock" : undefined}
          />
          <Tile
            label="Renewals due (30 days)"
            value={String(s.expiringSoon)}
            detail="Our policies expiring, not yet renewed"
            href={can(user, "renewals:view") ? "/renewals" : undefined}
          />
        </div>
      </section>

      <Card tour="ov-activity">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Recent activity</h2>
        </div>
        {s.recent.length === 0 ? (
          <EmptyState title="No activity yet" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {s.recent.map((a) => (
              <li key={a._id.toHexString()} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                <span className="min-w-0 truncate text-slate-700">
                  <span className="font-medium text-slate-900">{a.username}</span> {AUDIT_ACTION_LABELS[a.action]} {AUDIT_ENTITY_LABELS[a.entity]}
                  {(a.ref ?? a.chassisNumber) && <span className="ml-1 font-mono text-[13px] text-slate-500">{a.ref ?? a.chassisNumber}</span>}
                </span>
                <span className="shrink-0 text-xs text-slate-400">{formatDateTime(a.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2" aria-busy="true" aria-label="Loading">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-64 animate-pulse rounded-xl bg-slate-200/60" />
      ))}
    </div>
  );
}
