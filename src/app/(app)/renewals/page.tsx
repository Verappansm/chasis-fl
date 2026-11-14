import type { Metadata } from "next";
import { AccessNote } from "@/components/access-note";
import Link from "next/link";
import { Suspense } from "react";
import { requirePermission } from "@/lib/auth/dal";
import { IfCan } from "@/components/if-can";
import { can } from "@/lib/permissions";
import { listRenewals, parseStage, upcomingExpiries } from "@/lib/repo/modules";
import { parsePeriod } from "@/lib/periods";
import { addDays } from "@/lib/calc";
import { dateToInput, formatMoney } from "@/lib/format";
import { todayIso } from "@/lib/validation/fields";
import { DateText } from "@/components/date-text";
import { ClaimRefs, LIST_PERIOD_OPTIONS, STAGE_OPTIONS, StageBadge } from "@/components/claims";
import {
  Badge,
  Card,
  DataTable,
  EmptyState,
  Flash,
  LinkButton,
  ListToolbar,
  PageHeader,
  Pagination,
  TableSkeleton,
  Td,
  Th,
  buttonStyles,
  one,
} from "@/components/ui";

export const metadata: Metadata = { title: "Renewal payout" };

export default function RenewalsPage({ searchParams }: PageProps<"/renewals">) {
  return (
    <>
      <PageHeader
        title="Renewal payout"
        description="Payout on renewing a policy we sold. Only cars insured with us can be renewed here."
        action={
          <IfCan permission="renewals:invoice">
            <LinkButton href="/renewals/new" tour="new-record">New renewal payout</LinkButton>
          </IfCan>
        }
      />
      <AccessNote module="renewals" />
      <Suspense fallback={<TableSkeleton />}>
        <Expiring />
      </Suspense>
      <Suspense fallback={<TableSkeleton />}>
        <RenewalList searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Expiring() {
  const user = await requirePermission("renewals:view");
  const canEdit = can(user, "renewals:invoice");
  const policies = await upcomingExpiries(45);
  if (!policies.length) return null;
  const today = todayIso();
  return (
    <Card className="mb-6 border-amber-200" tour="renewals-expiring">
      <div className="border-b border-amber-100 bg-amber-50/60 px-4 py-3">
        <h2 className="text-sm font-semibold text-amber-900">Our policies expiring soon, not yet renewed</h2>
        <p className="text-xs text-amber-800">Expiring within 45 days (or lapsed in the last 15). Call the customer before a competitor does.</p>
      </div>
      <DataTable
        head={
          <>
            <Th>Chassis</Th>
            <Th>Commission / stock</Th>
            <Th>Provider</Th>
            <Th>Policy</Th>
            <Th right>OD premium</Th>
            <Th>Expires</Th>
            <Th />
          </>
        }
      >
        {policies.map((p) => {
          const end = dateToInput(p.policyEndDate);
          const lapsed = end < today;
          const sp = new URLSearchParams({
            chassis: p.chassisNumber,
            provider: p.provider,
            start: dateToInput(addDays(p.policyEndDate, 1)),
          });
          return (
            <tr key={p.id}>
              <Td mono>{p.chassisNumber}</Td>
              <Td mono>{p.dealRef}</Td>
              <Td>{p.provider}</Td>
              <Td mono>{p.policyNumber ?? "—"}</Td>
              <Td right>{formatMoney(p.odPremium)}</Td>
              <Td>
                <Badge tone={lapsed ? "red" : "amber"}>
                  {lapsed ? "Lapsed" : "Due"} <DateText iso={end} />
                </Badge>
              </Td>
              <Td right>
                {canEdit && (
                  <Link href={`/renewals/new?${sp.toString()}`} className={buttonStyles.secondary}>
                    Record renewal
                  </Link>
                )}
              </Td>
            </tr>
          );
        })}
      </DataTable>
    </Card>
  );
}

async function RenewalList({ searchParams }: { searchParams: PageProps<"/renewals">["searchParams"] }) {
  await requirePermission("renewals:view");
  const sp = await searchParams;
  const q = one(sp.q);
  const stage = parseStage(one(sp.stage));
  const period = parsePeriod(one(sp.period));
  const page = Number(one(sp.page) ?? 1);
  const result = await listRenewals({ q, stage, period, page });

  return (
    <>
      <Flash saved={one(sp.saved) === "1"} deleted={one(sp.deleted) === "1"} />
      <Card tour="renewals-list">
        <ListToolbar
          basePath="/renewals"
          q={q}
          placeholder="Search chassis, commission, provider, policy, invoice"
          filters={[
            { param: "stage", label: "Stage", value: stage, options: STAGE_OPTIONS },
            { param: "period", label: "Period", value: period, options: LIST_PERIOD_OPTIONS },
          ]}
        />
        {result.items.length === 0 ? (
          <EmptyState title="No renewal payouts found" />
        ) : (
          <DataTable
            head={
              <>
                <Th>Chassis</Th>
                <Th>Commission / stock</Th>
                <Th>Provider</Th>
                <Th>Policy</Th>
                <Th>Policy period</Th>
                <Th right>OD premium</Th>
                <Th right>Total</Th>
                <Th>Invoice / receipt</Th>
                <Th>Stage</Th>
              </>
            }
          >
            {result.items.map((doc) => (
              <tr key={doc._id.toHexString()} className="hover:bg-slate-50">
                <Td mono>
                  <Link href={`/renewals/${doc._id.toHexString()}`} className="font-medium text-indigo-700 hover:underline">
                    {doc.chassisNumber}
                  </Link>
                </Td>
                <Td mono>{doc.dealRef}</Td>
                <Td>{doc.provider}</Td>
                <Td mono>{doc.policyNumber ?? "—"}</Td>
                <Td>
                  <DateText iso={dateToInput(doc.policyStartDate)} /> → <DateText iso={dateToInput(doc.policyEndDate)} />
                </Td>
                <Td right>{formatMoney(doc.odPremium)}</Td>
                <Td right>{formatMoney(doc.claimTotal)}</Td>
                <Td>
                  <ClaimRefs claim={doc} />
                </Td>
                <Td>
                  <StageBadge claim={doc} />
                </Td>
              </tr>
            ))}
          </DataTable>
        )}
        <Pagination
          basePath="/renewals"
          page={result.page}
          pageCount={result.pageCount}
          total={result.total}
          params={{ q, stage: stage === "all" ? undefined : stage, period: period === "all" ? undefined : period }}
        />
      </Card>
    </>
  );
}
