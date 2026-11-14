import type { Metadata } from "next";
import { AccessNote } from "@/components/access-note";
import Link from "next/link";
import { Suspense } from "react";
import { requirePermission } from "@/lib/auth/dal";
import { IfCan } from "@/components/if-can";
import { listInsurance, parseStage } from "@/lib/repo/modules";
import { parsePeriod } from "@/lib/periods";
import { parsePageSize } from "@/lib/paging";
import { dateToInput, formatMoney } from "@/lib/format";
import { DateText } from "@/components/date-text";
import { ClaimRefs, LIST_PERIOD_OPTIONS, STAGE_OPTIONS, StageBadge } from "@/components/claims";
import {
  Card,
  DataTable,
  EmptyState,
  Flash,
  LinkButton,
  ListToolbar,
  PageHeader,
  Pagination,
  Sub,
  TableSkeleton,
  Td,
  Th,
  one,
  rowClass,
} from "@/components/ui";

export const metadata: Metadata = { title: "Insurance payout" };

export default function InsurancePage({ searchParams }: PageProps<"/insurance">) {
  return (
    <>
      <PageHeader
        title="Insurance payout"
        description="Payout from the insurer on the first policy sold with the car, invoiced and tracked to receipt."
        action={
          <IfCan permission="insurance:invoice">
            <LinkButton href="/insurance/new" tour="new-record">New insurance payout</LinkButton>
          </IfCan>
        }
      />
      <AccessNote module="insurance" />
      <Suspense fallback={<TableSkeleton />}>
        <InsuranceList searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function InsuranceList({ searchParams }: { searchParams: PageProps<"/insurance">["searchParams"] }) {
  await requirePermission("insurance:view");
  const sp = await searchParams;
  const q = one(sp.q);
  const stage = parseStage(one(sp.stage));
  const period = parsePeriod(one(sp.period));
  const page = Number(one(sp.page) ?? 1);
  const size = parsePageSize(one(sp.size));
  const result = await listInsurance({ size: size.size, q, stage, period, page });

  return (
    <>
      <Flash saved={one(sp.saved) === "1"} deleted={one(sp.deleted) === "1"} />
      <Card tour="insurance-list">
        <ListToolbar
          basePath="/insurance"
          q={q}
          pageSize={size.value}
          placeholder="Search chassis, commission, provider, policy, invoice"
          filters={[
            { param: "stage", label: "Stage", value: stage, options: STAGE_OPTIONS },
            { param: "period", label: "Period", value: period, options: LIST_PERIOD_OPTIONS },
          ]}
        />
        {result.items.length === 0 ? (
          <EmptyState title="No insurance payouts found" />
        ) : (
          <DataTable
            stack="xl"
            head={
              <>
                <Th>Commission / stock</Th>
                <Th>Provider</Th>
                <Th>Policy period</Th>
                <Th right>Premium / payout</Th>
                <Th>Invoice / receipt</Th>
                <Th>Stage</Th>
              </>
            }
          >
            {result.items.map((doc) => (
              <tr key={doc._id.toHexString()} className={rowClass}>
                <Td primary>
                  <Link href={`/insurance/${doc._id.toHexString()}`} className="font-mono text-[13px] font-medium text-indigo-700 hover:underline">
                    {doc.dealRef}
                  </Link>
                  <Sub mono>{doc.chassisNumber}</Sub>
                </Td>
                <Td label="Provider">
                  {doc.provider}
                  <Sub mono>{doc.policyNumber ?? "No policy no"}</Sub>
                </Td>
                <Td label="Policy period">
                  <DateText iso={dateToInput(doc.policyStartDate)} />
                  <Sub>
                    to <DateText iso={dateToInput(doc.policyEndDate)} />
                  </Sub>
                </Td>
                <Td label="Premium / payout" right>
                  {formatMoney(doc.claimTotal)}
                  <Sub>OD {formatMoney(doc.odPremium)}</Sub>
                </Td>
                <Td label="Invoice / receipt">
                  <ClaimRefs claim={doc} />
                </Td>
                <Td label="Stage">
                  <StageBadge claim={doc} />
                </Td>
              </tr>
            ))}
          </DataTable>
        )}
        <Pagination
          basePath="/insurance"
          page={result.page}
          pageCount={result.pageCount}
          total={result.total}
          params={{ size: size.value === "50" ? undefined : size.value, q, stage: stage === "all" ? undefined : stage, period: period === "all" ? undefined : period }}
        />
      </Card>
    </>
  );
}
