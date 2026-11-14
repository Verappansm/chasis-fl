import type { Metadata } from "next";
import { AccessNote } from "@/components/access-note";
import Link from "next/link";
import { Suspense } from "react";
import { requirePermission } from "@/lib/auth/dal";
import { IfCan } from "@/components/if-can";
import { listFinance, parseStage } from "@/lib/repo/modules";
import { parsePeriod } from "@/lib/periods";
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
  TableSkeleton,
  Td,
  Th,
  one,
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
  const result = await listFinance({ q, stage, period, page });

  return (
    <>
      <Flash saved={one(sp.saved) === "1"} deleted={one(sp.deleted) === "1"} />
      <Card tour="finance-list">
        <ListToolbar
          basePath="/finance"
          q={q}
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
            head={
              <>
                <Th>Commission / stock</Th>
                <Th>Chassis</Th>
                <Th>Provider</Th>
                <Th>Contract no</Th>
                <Th>Disbursed</Th>
                <Th right>Loan</Th>
                <Th right>Total</Th>
                <Th>Invoice / receipt</Th>
                <Th>Stage</Th>
              </>
            }
          >
            {result.items.map((doc) => (
              <tr key={doc._id.toHexString()} className="hover:bg-slate-50">
                <Td mono>
                  <Link href={`/finance/${doc._id.toHexString()}`} className="font-medium text-indigo-700 hover:underline">
                    {doc.dealRef}
                  </Link>
                </Td>
                <Td mono>{doc.chassisNumber}</Td>
                <Td>{doc.provider}</Td>
                <Td mono>{doc.contractNo}</Td>
                <Td>
                  <DateText iso={dateToInput(doc.disbursalDate)} />
                </Td>
                <Td right>{formatMoney(doc.loanAmount)}</Td>
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
          basePath="/finance"
          page={result.page}
          pageCount={result.pageCount}
          total={result.total}
          params={{ q, stage: stage === "all" ? undefined : stage, period: period === "all" ? undefined : period }}
        />
      </Card>
    </>
  );
}
