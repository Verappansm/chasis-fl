import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { requirePermission } from "@/lib/auth/dal";
import { todayUtc } from "@/lib/repo/modules";
import { DEMO_AGEING_DAYS, DEMO_STATUSES, demoStats, listDemo, parseDemoStatus } from "@/lib/repo/demo";
import { parsePeriod, PERIODS } from "@/lib/periods";
import { dateToInput, formatMoney } from "@/lib/format";
import { demoPnlBeforeGst, parseGstBasis, type GstBasis } from "@/lib/calc";
import type { PurchaseDoc } from "@/lib/types";
import { DateText } from "@/components/date-text";
import { IfCan } from "@/components/if-can";
import { AccessNote } from "@/components/access-note";
import { LIST_PERIOD_OPTIONS } from "@/components/claims";
import { BarChart, HBars, Legend, shortMoney } from "@/components/charts";
import {
  Badge,
  Card,
  DataTable,
  EmptyState,
  LinkButton,
  ListToolbar,
  PageHeader,
  Pagination,
  TableSkeleton,
  Td,
  Th,
  one,
} from "@/components/ui";

export const metadata: Metadata = { title: "Demo stock" };

export default function DemoStockPage({ searchParams }: PageProps<"/demo">) {
  return (
    <>
      <PageHeader
        title="Demo stock"
        description="Demo cars only: live (in lock-in), deflected and ready to sell, and sold, with the profit or loss on each sale."
        action={
          <IfCan permission="purchases:invoice">
            <LinkButton href="/purchases/new?type=demo">New demo car</LinkButton>
          </IfCan>
        }
      />
      <AccessNote module="purchases" />
      <Suspense fallback={<TableSkeleton />}>
        <Demo searchParams={searchParams} />
      </Suspense>
    </>
  );
}

const NET_SERIES = [
  { name: "Net profit / loss", fill: "fill-indigo-500", swatch: "bg-indigo-500" },
  { name: "A · SP − purchase", fill: "fill-slate-300", swatch: "bg-slate-300" },
];

function signed(paise: number | undefined) {
  if (paise === undefined) return "—";
  return paise > 0 ? `+${formatMoney(paise)}` : formatMoney(paise);
}

function Money({ paise }: { paise?: number }) {
  if (paise === undefined) return <span className="text-slate-400">—</span>;
  return <span className={paise < 0 ? "text-red-700" : paise > 0 ? "text-emerald-700" : ""}>{signed(paise)}</span>;
}

function Stat({ label, value, detail, tone, href }: { label: string; value: string; detail?: ReactNode; tone?: "red" | "green" | "amber"; href?: string }) {
  const color = tone === "red" ? "text-red-700" : tone === "green" ? "text-emerald-700" : tone === "amber" ? "text-amber-700" : "text-slate-900";
  const body = (
    <Card className={`h-full p-4 ${href ? "transition hover:border-indigo-300" : ""}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1.5 text-xl font-semibold tabular-nums ${color}`}>{value}</p>
      {detail && <p className="mt-0.5 text-xs text-slate-500">{detail}</p>}
    </Card>
  );
  return href ? (
    <Link href={href} className="block h-full rounded-xl">
      {body}
    </Link>
  ) : (
    body
  );
}

/** A and net for one car on the chosen basis (stored figures include GST). */
function carPnl(doc: PurchaseDoc, basis: GstBasis) {
  if (!doc.saleDate) return { sp: undefined, purchase: basis === "incl" ? doc.finalPrice : doc.taxableAmount, diff: undefined, net: undefined };
  if (basis === "incl") return { sp: doc.saleTotal, purchase: doc.finalPrice, diff: doc.priceDifference, net: doc.netProfit };
  const pre = demoPnlBeforeGst({
    taxableAmount: doc.taxableAmount,
    salePrice: doc.salePrice ?? 0,
    lossClaim: doc.lossClaim ?? 0,
    saleSalesMeasure: doc.saleSalesMeasure ?? 0,
  });
  return { sp: doc.salePrice, purchase: doc.taxableAmount, diff: pre.priceDifference, net: pre.netProfit };
}

function BasisToggle({ basis, href }: { basis: GstBasis; href: (b: GstBasis) => string }) {
  const opt = (b: GstBasis, label: string) => (
    <Link
      href={href(b)}
      scroll={false}
      aria-current={basis === b ? "true" : undefined}
      className={`rounded-md px-3 py-1.5 text-xs font-medium ${basis === b ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
    >
      {label}
    </Link>
  );
  return (
    <div role="group" aria-label="Compare amounts" className="inline-flex rounded-lg bg-slate-100 p-0.5">
      {opt("incl", "Including GST")}
      {opt("pre", "Before GST")}
    </div>
  );
}

function Status({ doc, today }: { doc: PurchaseDoc; today: Date }) {
  if (doc.saleDate) return <Badge tone="green">Sold</Badge>;
  if (doc.deflectDate && doc.deflectDate > today) {
    const left = Math.ceil((doc.deflectDate.getTime() - today.getTime()) / 86_400_000);
    return <Badge tone="amber">Live · {left}d lock-in left</Badge>;
  }
  const since = doc.deflectDate ? Math.floor((today.getTime() - doc.deflectDate.getTime()) / 86_400_000) : 0;
  return <Badge tone={since > DEMO_AGEING_DAYS ? "red" : "indigo"}>Deflected · {since}d unsold</Badge>;
}

async function Demo({ searchParams }: { searchParams: PageProps<"/demo">["searchParams"] }) {
  await requirePermission("purchases:view");
  const sp = await searchParams;
  const q = one(sp.q);
  const status = parseDemoStatus(one(sp.status));
  const period = parsePeriod(one(sp.period));
  const page = Number(one(sp.page) ?? 1);
  const basis = parseGstBasis(one(sp.gst));
  const [stats, result] = await Promise.all([demoStats(period, basis), listDemo({ q, status, period, page })]);
  const today = todayUtc();
  const periodLabel = PERIODS.find((p) => p.value === period)!.label.toLowerCase();
  const { stock, sales } = stats;
  const avgNet = sales.count ? Math.round(sales.netProfit / sales.count) : 0;
  const gstParam = basis === "pre" ? "&gst=pre" : "";
  const href = (s: string) => `/demo?status=${s}${period === "all" ? "" : `&period=${period}`}${gstParam}`;
  const basisHref = (b: GstBasis) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ q, status: status === "all" ? undefined : status, period: period === "all" ? undefined : period })) if (v) p.set(k, v);
    if (b === "pre") p.set("gst", "pre");
    const s = p.toString();
    return s ? `/demo?${s}` : "/demo";
  };
  const gstWord = basis === "incl" ? "incl. GST" : "before GST";
  const otherWord = basis === "incl" ? "before GST" : "incl. GST";

  return (
    <div className="space-y-6">
      <section aria-labelledby="h-demo-stock">
        <h2 id="h-demo-stock" className="mb-3 text-sm font-semibold text-slate-700">
          Stock right now
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Stat label="Live (lock-in)" value={String(stock.live)} detail={`${stock.deflectingSoon} deflect in the next 30 days`} tone="amber" href={href("live")} />
          <Stat label="Deflected" value={String(stock.deflected)} detail="Ready to sell" href={href("deflected")} />
          <Stat
            label={`Deflected > ${DEMO_AGEING_DAYS} days`}
            value={String(stock.agedDeflected)}
            detail="Unsold well after deflecting"
            tone={stock.agedDeflected ? "red" : undefined}
            href={href("deflected")}
          />
          <Stat label="Unsold stock value" value={formatMoney(stock.stockValue)} detail={basis === "incl" ? "Total purchase incl. GST" : "Purchase total before GST"} />
          <Stat label="Sold (all time)" value={String(stock.sold)} href={href("sold")} />
          <Stat label="Total demo cars" value={String(stock.live + stock.deflected + stock.sold)} />
        </div>
      </section>

      <section aria-labelledby="h-demo-sales">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id="h-demo-sales" className="text-sm font-semibold text-slate-700">
            Sales, {periodLabel} <span className="font-normal text-slate-500">· amounts {gstWord}</span>
          </h2>
          <BasisToggle basis={basis} href={basisHref} />
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Stat label="Cars sold" value={String(sales.count)} detail={`${sales.profitable} at a profit · ${sales.count - sales.profitable} at a loss`} />
          <Stat label={`A · SP − purchase, ${gstWord}`} value={signed(sales.priceDifference)} detail={`SP ${shortMoney(sales.saleTotal)} vs purchase ${shortMoney(sales.purchaseTotal)}`} tone={sales.priceDifference < 0 ? "red" : "green"} />
          <Stat label="B · Loss claims" value={formatMoney(sales.lossClaim)} />
          <Stat label="C · Sales measure" value={formatMoney(sales.saleSalesMeasure)} />
          <Stat
            label={`Net profit / loss, ${gstWord}`}
            value={signed(sales.netProfit)}
            detail={
              sales.count ? (
                <>
                  {signed(sales.otherNetProfit)} {otherWord}
                  <span className="block">
                    {signed(avgNet)} per car · {Math.round(sales.avgDaysInStock)} days in stock on average
                  </span>
                </>
              ) : undefined
            }
            tone={sales.netProfit < 0 ? "red" : sales.count ? "green" : undefined}
          />
          <Stat
            label="Loss claim to check"
            value={String(sales.claimMissing)}
            detail="Sold with no demo discount and no loss claim entered"
            tone={sales.claimMissing ? "amber" : undefined}
          />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="p-5 xl:col-span-2">
          <h3 className="text-sm font-semibold text-slate-900">Demo sales P&amp;L by month</h3>
          <p className="mt-0.5 text-xs text-slate-500">Net profit / loss (A + B + C) and the price difference A, {gstWord}, by sale month, last 12 months.</p>
          <div className="mt-4">
            <Legend series={NET_SERIES} />
            <BarChart
              title="Demo sales profit or loss by month"
              categories={stats.monthly.map((m) => m.month)}
              series={NET_SERIES}
              values={[stats.monthly.map((m) => m.netProfit), stats.monthly.map((m) => m.priceDifference)]}
              format={signed}
              axisFormat={shortMoney}
            />
          </div>
        </Card>
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-slate-900">Net P&amp;L by class, {periodLabel}</h3>
          <p className="mt-0.5 text-xs text-slate-500">{basis === "incl" ? "Incl. GST" : "Before GST"}. Biggest losses first.</p>
          <div className="mt-4">
            <HBars
              items={stats.byClass.map((c) => ({
                label: c.carClass,
                value: c.netProfit,
                detail: `${c.sold} sold`,
                fill: c.netProfit < 0 ? "bg-red-500" : "bg-emerald-500",
              }))}
              format={signed}
              empty="No demo cars sold in this period."
            />
          </div>
        </Card>
      </section>

      <Card tour="demo-list">
        <ListToolbar
          basePath="/demo"
          q={q}
          placeholder="Search commission, chassis, model, class, buyer"
          filters={[
            { param: "status", label: "Status", value: status, options: DEMO_STATUSES },
            { param: "period", label: "Period", value: period, options: LIST_PERIOD_OPTIONS },
          ]}
        />
        {result.items.length === 0 ? (
          <EmptyState title="No demo cars found">{q ? "Try a different search." : "Add a demo car from New demo car."}</EmptyState>
        ) : (
          <DataTable
            head={
              <>
                <Th>Commission no</Th>
                <Th>Model</Th>
                <Th>Purchased</Th>
                <Th>Deflects / sold</Th>
                <Th>Status</Th>
                <Th right>{basis === "incl" ? "Total purchase" : "Purchase (pre-GST)"}</Th>
                <Th right>{basis === "incl" ? "Total SP" : "SP (pre-GST)"}</Th>
                <Th right>A</Th>
                <Th right>B + C</Th>
                <Th right>Net P&amp;L</Th>
              </>
            }
          >
            {result.items.map((doc) => {
              const pnl = carPnl(doc, basis);
              return (
              <tr key={doc._id.toHexString()} className="hover:bg-slate-50">
                <Td mono>
                  <Link href={`/purchases/${doc._id.toHexString()}`} className="font-medium text-indigo-700 hover:underline">
                    {doc.commissionNo}
                  </Link>
                  <span className="block text-xs text-slate-400">{doc.chassisNumber}</span>
                </Td>
                <Td>
                  {doc.model}
                  <span className="block text-xs text-slate-400">{doc.carClass}</span>
                </Td>
                <Td>
                  <DateText iso={dateToInput(doc.purchaseDate)} />
                </Td>
                <Td>
                  <DateText iso={dateToInput(doc.saleDate ?? doc.deflectDate)} />
                </Td>
                <Td>
                  <Status doc={doc} today={today} />
                </Td>
                <Td right>{formatMoney(pnl.purchase)}</Td>
                <Td right>{formatMoney(pnl.sp)}</Td>
                <Td right>
                  <Money paise={pnl.diff} />
                </Td>
                <Td right>{doc.saleDate ? formatMoney((doc.lossClaim ?? 0) + (doc.saleSalesMeasure ?? 0)) : "—"}</Td>
                <Td right>
                  <span className="font-semibold">
                    <Money paise={pnl.net} />
                  </span>
                </Td>
              </tr>
              );
            })}
          </DataTable>
        )}
        <Pagination
          basePath="/demo"
          page={result.page}
          pageCount={result.pageCount}
          total={result.total}
          params={{ q, status: status === "all" ? undefined : status, period: period === "all" ? undefined : period, gst: basis === "pre" ? "pre" : undefined }}
        />
      </Card>
    </div>
  );
}
