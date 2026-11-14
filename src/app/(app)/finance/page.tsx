import type { Metadata } from "next";
import { AccessNote } from "@/components/access-note";
import Link from "next/link";
import { Suspense } from "react";
import { requirePermission } from "@/lib/auth/dal";
import { IfCan } from "@/components/if-can";
import { listFinance, parseStage } from "@/lib/repo/modules";
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

export const metadata: Metadata = { title: "Finance payout" };

export default function FinancePage({ searchParams }: PageProps<"/finance">) {
  return (
    <>
      <PageHeader
        title="Finance payout"
        description="Payout from the bank / NBFC on a car loan, invoiced to the finance provider and tracked to receipt."
        action={
          <IfCan permission="finance:invoice">
            <LinkButton href="/finance/new" tour="new-record">New finance payout</LinkButton>
          </IfCan>
        }
      />
      <AccessNote module="finance" />
      <Suspense fallback={<TableSkeleton />}>
        <FinanceList searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function FinanceList({ searchParams }: { searchParams: PageProps<"/finance">["searchParams"] }) {
  await requirePermission("finance:view");
  const sp = await searchParams;
  const q = one(sp.q);
  const stage = parseStage(one(sp.stage));
  const period = parsePeriod(one(sp.period));
  const page = Number(one(sp.page) ?? 1);
  const size = parsePageSize(one(sp.size));
  const result = await listFinance({ size: size.size, q, stage, period, page });

  return (
    <>
      <Flash saved={one(sp.saved) === "1"} deleted={one(sp.deleted) === "1"} />
      <Card tour="finance-list">
        <ListToolbar
          basePath="/finance"
          q={q}
          pageSize={size.value}
          placeholder="Search chassis, commission, provider, contract, invoice"
          filters={[
            { param: "stage", label: "Stage", value: stage, options: STAGE_OPTIONS },
            { param: "period", label: "Period", value: period, options: LIST_PERIOD_OPTIONS },
          ]}
        />
        {result.items.length === 0 ? (
          <EmptyState title="No finance payouts found" />
        ) : (
          <DataTable
            stack="xl"
            head={
              <>
                <Th>Commission / stock</Th>
                <Th>Provider</Th>
                <Th>Disbursed</Th>
                <Th right>Loan</Th>
                <Th right>Payout total</Th>
                <Th>Invoice / receipt</Th>
                <Th>Stage</Th>
              </>
            }
          >
            {result.items.map((doc) => (
              <tr key={doc._id.toHexString()} className={rowClass}>
                <Td primary>
                  <Link href={`/finance/${doc._id.toHexString()}`} className="font-mono text-[13px] font-medium text-indigo-700 hover:underline">
                    {doc.dealRef}
                  </Link>
                  <Sub mono>{doc.chassisNumber}</Sub>
                </Td>
                <Td label="Provider">
                  {doc.provider}
                  <Sub mono>{doc.contractNo}</Sub>
                </Td>
                <Td label="Disbursed">
                  <DateText iso={dateToInput(doc.disbursalDate)} />
                </Td>
                <Td label="Loan" right>{formatMoney(doc.loanAmount)}</Td>
                <Td label="Payout total" right>{formatMoney(doc.claimTotal)}</Td>
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
          basePath="/finance"
          page={result.page}
          pageCount={result.pageCount}
          total={result.total}
          params={{ size: size.value === "50" ? undefined : size.value, q, stage: stage === "all" ? undefined : stage, period: period === "all" ? undefined : period }}
        />
      </Card>
    </>
  );
}
