import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import type { ReactNode } from "react";
import { requirePermission } from "@/lib/auth/dal";
import { AGEING_DAYS, overviewStats } from "@/lib/repo/modules";
import { formatDateTime, formatMoney } from "@/lib/format";
import { Badge, Card, DataTable, EmptyState, PageHeader, Td, Th } from "@/components/ui";

export const metadata: Metadata = { title: "Overview" };

export default function OverviewPage() {
  return (
    <>
      <PageHeader title="Overview" description="What the desk has earned, what is still owed, and what needs attention." />
      <Suspense fallback={<OverviewSkeleton />}>
        <Overview />
      </Suspense>
    </>
  );
}

function Tile({
  label,
  value,
  detail,
  href,
  alert,
}: {
  label: string;
  value: string;
  detail?: ReactNode;
  href?: string;
  alert?: ReactNode;
}) {
  const body = (
    <Card className={`h-full p-5 ${href ? "transition hover:border-indigo-300 hover:shadow" : ""}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">{value}</p>
      {detail && <p className="mt-1 text-sm text-slate-500">{detail}</p>}
      {alert && <div className="mt-3">{alert}</div>}
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

const ACTION_LABEL = { create: "created", update: "updated", delete: "deleted", login: "signed in" } as const;
const ENTITY_LABEL = {
  finance: "finance case",
  insurance: "insurance policy",
  incentive: "incentive payout",
  renewal: "renewal case",
  vehicle: "vehicle",
  auth: "session",
  user: "user account",
} as const;

async function Overview() {
  await requirePermission("overview:view");
  const s = await overviewStats();
  const totalPending = s.finance.pendingAmount + s.insurance.pendingAmount;
  const totalAged = s.finance.agedCount + s.insurance.agedCount;

  return (
    <div className="space-y-8">
      <section aria-labelledby="h-income" data-tour="ov-income">
        <h2 id="h-income" className="mb-3 text-sm font-semibold text-slate-700">
          Incentive income
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Tile
            label="Finance incentive received"
            value={formatMoney(s.finance.receivedAmount)}
            detail={`${s.finance.receivedCount} cases`}
            href="/finance?status=received"
          />
          <Tile
            label="Insurance incentive received"
            value={formatMoney(s.insurance.receivedAmount)}
            detail={`${s.insurance.receivedCount} policies`}
            href="/insurance?status=received"
          />
          <Tile
            label="Incentives paid out"
            value={formatMoney(s.payouts.total)}
            detail={`${formatMoney(s.payouts.thisMonth)} this month`}
            href="/incentives"
          />
          <Tile
            label="Net incentive"
            value={formatMoney(s.netIncentive)}
            detail="Received (finance + insurance) minus paid out"
          />
        </div>
      </section>

      <section aria-labelledby="h-owed" data-tour="ov-owed">
        <h2 id="h-owed" className="mb-3 text-sm font-semibold text-slate-700">
          Still owed to us
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Tile
            label="Finance incentive pending"
            value={formatMoney(s.finance.pendingAmount)}
            detail={`${s.finance.pendingCount} cases`}
            href="/finance?status=pending"
            alert={
              s.finance.agedCount > 0 && (
                <Badge tone="red">
                  {s.finance.agedCount} older than {AGEING_DAYS} days · {formatMoney(s.finance.agedAmount)}
                </Badge>
              )
            }
          />
          <Tile
            label="Insurance incentive pending"
            value={formatMoney(s.insurance.pendingAmount)}
            detail={`${s.insurance.pendingCount} policies`}
            href="/insurance?status=pending"
            alert={
              s.insurance.agedCount > 0 && (
                <Badge tone="red">
                  {s.insurance.agedCount} older than {AGEING_DAYS} days · {formatMoney(s.insurance.agedAmount)}
                </Badge>
              )
            }
          />
          <Tile
            label="Renewals due (30 days)"
            value={String(s.renewals.dueSoon)}
            detail={`${s.renewals.unopenedExpiries} expiring policies not yet followed up`}
            href="/renewals"
            alert={s.renewals.overdue > 0 && <Badge tone="red">{s.renewals.overdue} overdue</Badge>}
          />
          <Tile
            label="Vehicle gross margin"
            value={formatMoney(s.vehicles.margin)}
            detail={`${s.vehicles.priced} of ${s.vehicles.count} vehicles priced`}
          />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card tour="ov-chase">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">Pending incentive by provider</h2>
            <p className="text-xs text-slate-500">Who to chase first. Total pending: {formatMoney(totalPending)}{totalAged ? `, ${totalAged} aged` : ""}.</p>
          </div>
          {s.pendingByProvider.length === 0 ? (
            <EmptyState title="Nothing pending" />
          ) : (
            <DataTable
              head={
                <>
                  <Th>Provider</Th>
                  <Th>Type</Th>
                  <Th right>Cases</Th>
                  <Th right>Pending</Th>
                </>
              }
            >
              {s.pendingByProvider.map((row) => (
                <tr key={`${row._id.source}-${row._id.provider}`}>
                  <Td>{row._id.provider}</Td>
                  <Td>{row._id.source}</Td>
                  <Td right>{row.count}</Td>
                  <Td right>{formatMoney(row.amount)}</Td>
                </tr>
              ))}
            </DataTable>
          )}
        </Card>

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
                    <span className="font-medium text-slate-900">{a.username}</span> {ACTION_LABEL[a.action]}{" "}
                    {ENTITY_LABEL[a.entity]}
                    {a.chassisNumber && <span className="ml-1 font-mono text-[13px] text-slate-500">{a.chassisNumber}</span>}
                  </span>
                  <span className="shrink-0 text-xs text-slate-400">{formatDateTime(a.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-busy="true" aria-label="Loading">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-28 animate-pulse rounded-xl bg-slate-200/60" />
      ))}
    </div>
  );
}
