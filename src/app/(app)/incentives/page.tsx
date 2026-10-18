import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requirePermission } from "@/lib/auth/dal";
import { IfCan } from "@/components/if-can";
import { listIncentives } from "@/lib/repo/modules";
import { formatDate, formatMoney } from "@/lib/format";
import { PAYEE_TYPE_LABELS } from "@/lib/types";
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

export const metadata: Metadata = { title: "Incentive" };

export default function IncentivesPage({ searchParams }: PageProps<"/incentives">) {
  return (
    <>
      <PageHeader
        title="Incentive"
        description="Incentives paid out by the dealership (sales executives, brokers, DSAs) against each chassis."
        action={
          <IfCan permission="incentives:edit">
            <LinkButton href="/incentives/new">Record payout</LinkButton>
          </IfCan>
        }
      />
      <Suspense fallback={<TableSkeleton />}>
        <IncentiveList searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function IncentiveList({ searchParams }: { searchParams: PageProps<"/incentives">["searchParams"] }) {
  await requirePermission("incentives:view");
  const sp = await searchParams;
  const q = one(sp.q);
  const page = Number(one(sp.page) ?? 1);
  const result = await listIncentives({ q, page });

  return (
    <>
      <Flash saved={one(sp.saved) === "1"} deleted={one(sp.deleted) === "1"} />
      <Card>
        <ListToolbar basePath="/incentives" q={q} placeholder="Search chassis, payee or reference" />
        {result.items.length === 0 ? (
          <EmptyState title="No payouts found">{q ? "Try a different search." : "Record the first payout."}</EmptyState>
        ) : (
          <DataTable
            head={
              <>
                <Th>Chassis</Th>
                <Th right>Amount</Th>
                <Th>Paid to</Th>
                <Th>Type</Th>
                <Th>Paid date</Th>
                <Th>Reference</Th>
              </>
            }
          >
            {result.items.map((doc) => (
              <tr key={doc._id.toHexString()} className="hover:bg-slate-50">
                <Td mono>
                  <Link href={`/incentives/${doc._id.toHexString()}`} className="font-medium text-indigo-700 hover:underline">
                    {doc.chassisNumber}
                  </Link>
                </Td>
                <Td right>{formatMoney(doc.amount)}</Td>
                <Td>{doc.paidTo}</Td>
                <Td>
                  <Badge tone="slate">{PAYEE_TYPE_LABELS[doc.payeeType]}</Badge>
                </Td>
                <Td>{formatDate(doc.paidDate)}</Td>
                <Td>{doc.reference ?? "—"}</Td>
              </tr>
            ))}
          </DataTable>
        )}
        <Pagination basePath="/incentives" page={result.page} pageCount={result.pageCount} total={result.total} params={{ q }} />
      </Card>
    </>
  );
}
