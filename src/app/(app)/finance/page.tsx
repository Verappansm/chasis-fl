import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requirePermission } from "@/lib/auth/dal";
import { IfCan } from "@/components/if-can";
import { AGEING_DAYS, listFinance, type ReceivedFilter } from "@/lib/repo/modules";
import { daysSince, formatDate, formatMoney } from "@/lib/format";
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
  one,
} from "@/components/ui";

export const metadata: Metadata = { title: "Finance" };

const STATUSES = [
  { value: "all", label: "All" },
  { value: "pending", label: "Incentive pending" },
  { value: "received", label: "Incentive received" },
];

export default function FinancePage({ searchParams }: PageProps<"/finance">) {
  return (
    <>
      <PageHeader
        title="Finance"
        description="Loan cases, finance incentive (payout) tracking and vehicle margin per chassis."
        action={
          <IfCan permission="finance:edit">
            <LinkButton href="/finance/new" tour="new-record">New finance case</LinkButton>
          </IfCan>
        }
      />
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
  const statusRaw = one(sp.status);
  const status: ReceivedFilter = statusRaw === "pending" || statusRaw === "received" ? statusRaw : "all";
  const page = Number(one(sp.page) ?? 1);
  const result = await listFinance({ q, status, page });

  return (
    <>
      <Flash saved={one(sp.saved) === "1"} deleted={one(sp.deleted) === "1"} />
      <Card tour="finance-list">
        <ListToolbar basePath="/finance" q={q} status={status} statuses={STATUSES} placeholder="Search chassis or provider" />
        {result.items.length === 0 ? (
          <EmptyState title="No finance cases found">{q ? "Try a different search." : "Create the first finance case."}</EmptyState>
        ) : (
          <DataTable
            head={
              <>
                <Th>Chassis</Th>
                <Th>Provider</Th>
                <Th right>Loan</Th>
                <Th right>Incentive</Th>
                <Th>Initiated</Th>
                <Th>Status</Th>
                <Th right>Purchase</Th>
                <Th right>Selling</Th>
                <Th right>Margin</Th>
              </>
            }
          >
            {result.items.map(({ doc, vehicle }) => {
              const margin =
                vehicle?.purchasePrice !== undefined && vehicle?.sellingPrice !== undefined
                  ? vehicle.sellingPrice - vehicle.purchasePrice
                  : undefined;
              const age = daysSince(doc.initiatedDate);
              return (
                <tr key={doc._id.toHexString()} className="hover:bg-slate-50">
                  <Td mono>
                    <Link href={`/finance/${doc._id.toHexString()}`} className="font-medium text-indigo-700 hover:underline">
                      {doc.chassisNumber}
                    </Link>
                  </Td>
                  <Td>{doc.provider}</Td>
                  <Td right>{formatMoney(doc.loanAmount)}</Td>
                  <Td right>{formatMoney(doc.incentiveAmount)}</Td>
                  <Td>{formatDate(doc.initiatedDate)}</Td>
                  <Td>
                    {doc.incentiveReceived ? (
                      <Badge tone="green">Received {formatDate(doc.receivedDate)}</Badge>
                    ) : (
                      <Badge tone={age > AGEING_DAYS ? "red" : "amber"}>Pending · {age}d</Badge>
                    )}
                  </Td>
                  <Td right>{formatMoney(vehicle?.purchasePrice)}</Td>
                  <Td right>{formatMoney(vehicle?.sellingPrice)}</Td>
                  <Td right>
                    {margin === undefined ? (
                      "—"
                    ) : (
                      <span className={margin < 0 ? "text-red-600" : "text-emerald-700"}>{formatMoney(margin)}</span>
                    )}
                  </Td>
                </tr>
              );
            })}
          </DataTable>
        )}
        <Pagination basePath="/finance" page={result.page} pageCount={result.pageCount} total={result.total} params={{ q, status }} />
      </Card>
    </>
  );
}
