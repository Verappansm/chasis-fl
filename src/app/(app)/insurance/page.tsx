import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requirePermission } from "@/lib/auth/dal";
import { IfCan } from "@/components/if-can";
import { AGEING_DAYS, listInsurance, type ReceivedFilter } from "@/lib/repo/modules";
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

export const metadata: Metadata = { title: "Insurance" };

const STATUSES = [
  { value: "all", label: "All" },
  { value: "pending", label: "Incentive pending" },
  { value: "received", label: "Incentive received" },
];

export default function InsurancePage({ searchParams }: PageProps<"/insurance">) {
  return (
    <>
      <PageHeader
        title="Insurance"
        description="Policies sold per chassis and the commission (incentive) due from insurers."
        action={
          <IfCan permission="insurance:edit">
            <LinkButton href="/insurance/new" tour="new-record">New policy</LinkButton>
          </IfCan>
        }
      />
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
  const statusRaw = one(sp.status);
  const status: ReceivedFilter = statusRaw === "pending" || statusRaw === "received" ? statusRaw : "all";
  const page = Number(one(sp.page) ?? 1);
  const result = await listInsurance({ q, status, page });

  return (
    <>
      <Flash saved={one(sp.saved) === "1"} deleted={one(sp.deleted) === "1"} />
      <Card tour="insurance-list">
        <ListToolbar
          basePath="/insurance"
          q={q}
          status={status}
          statuses={STATUSES}
          placeholder="Search chassis, provider or policy no."
        />
        {result.items.length === 0 ? (
          <EmptyState title="No policies found">{q ? "Try a different search." : "Record the first policy."}</EmptyState>
        ) : (
          <DataTable
            head={
              <>
                <Th>Chassis</Th>
                <Th>Provider</Th>
                <Th>Policy</Th>
                <Th right>Premium</Th>
                <Th right>Incentive</Th>
                <Th>Initiated</Th>
                <Th>Status</Th>
                <Th>Policy ends</Th>
              </>
            }
          >
            {result.items.map((doc) => {
              const age = daysSince(doc.initiatedDate);
              return (
                <tr key={doc._id.toHexString()} className="hover:bg-slate-50">
                  <Td mono>
                    <Link href={`/insurance/${doc._id.toHexString()}`} className="font-medium text-indigo-700 hover:underline">
                      {doc.chassisNumber}
                    </Link>
                  </Td>
                  <Td>{doc.provider}</Td>
                  <Td>
                    <span className="mr-2">{doc.policyNumber ?? "—"}</span>
                    <Badge tone={doc.policyType === "new" ? "indigo" : "slate"}>
                      {doc.policyType === "new" ? "New" : "Renewal"}
                    </Badge>
                  </Td>
                  <Td right>{formatMoney(doc.premiumAmount)}</Td>
                  <Td right>{formatMoney(doc.incentiveAmount)}</Td>
                  <Td>{formatDate(doc.initiatedDate)}</Td>
                  <Td>
                    {doc.incentiveReceived ? (
                      <Badge tone="green">Received {formatDate(doc.receivedDate)}</Badge>
                    ) : (
                      <Badge tone={age > AGEING_DAYS ? "red" : "amber"}>Pending · {age}d</Badge>
                    )}
                  </Td>
                  <Td>{formatDate(doc.policyEndDate)}</Td>
                </tr>
              );
            })}
          </DataTable>
        )}
        <Pagination basePath="/insurance" page={result.page} pageCount={result.pageCount} total={result.total} params={{ q, status }} />
      </Card>
    </>
  );
}
