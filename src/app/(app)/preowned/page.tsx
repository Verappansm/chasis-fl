import type { Metadata } from "next";
import { AccessNote } from "@/components/access-note";
import Link from "next/link";
import { Suspense } from "react";
import { requirePermission } from "@/lib/auth/dal";
import { IfCan } from "@/components/if-can";
import { listPreowned, type PreownedFilter } from "@/lib/repo/modules";
import { parsePeriod } from "@/lib/periods";
import { dateToInput, formatMoney } from "@/lib/format";
import { PREOWNED_USE_LABELS } from "@/lib/types";
import { DateText } from "@/components/date-text";
import { LIST_PERIOD_OPTIONS } from "@/components/claims";
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

export const metadata: Metadata = { title: "Pre-owned" };

const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "in_stock", label: "In stock" },
  { value: "sold", label: "Sold" },
];

export default function PreownedPage({ searchParams }: PageProps<"/preowned">) {
  return (
    <>
      <PageHeader
        title="Pre-owned"
        description="Cars bought from customers, for exchange or resale. No fixed compensation; finance, insurance and renewal payouts apply once sold."
        action={
          <IfCan permission="preowned:edit">
            <LinkButton href="/preowned/new" tour="new-record">New pre-owned car</LinkButton>
          </IfCan>
        }
      />
      <AccessNote module="preowned" />
      <Suspense fallback={<TableSkeleton />}>
        <PreownedList searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function PreownedList({ searchParams }: { searchParams: PageProps<"/preowned">["searchParams"] }) {
  await requirePermission("preowned:view");
  const sp = await searchParams;
  const q = one(sp.q);
  const raw = one(sp.status);
  const status: PreownedFilter = raw === "in_stock" || raw === "sold" ? raw : "all";
  const period = parsePeriod(one(sp.period));
  const page = Number(one(sp.page) ?? 1);
  const result = await listPreowned({ q, status, period, page });

  return (
    <>
      <Flash saved={one(sp.saved) === "1"} deleted={one(sp.deleted) === "1"} />
      <Card tour="preowned-list">
        <ListToolbar
          basePath="/preowned"
          q={q}
          placeholder="Search stock no, chassis, registration, model, name"
          filters={[
            { param: "status", label: "Status", value: status, options: STATUS_OPTIONS },
            { param: "period", label: "Bought", value: period, options: LIST_PERIOD_OPTIONS },
          ]}
        />
        {result.items.length === 0 ? (
          <EmptyState title="No pre-owned cars found" />
        ) : (
          <DataTable
            head={
              <>
                <Th>Stock no</Th>
                <Th>Chassis</Th>
                <Th>Car</Th>
                <Th>Use</Th>
                <Th>Bought</Th>
                <Th right>Purchase</Th>
                <Th>Sold</Th>
                <Th right>Sale</Th>
                <Th right>Margin</Th>
              </>
            }
          >
            {result.items.map((doc) => {
              const margin = doc.salePrice !== undefined ? doc.salePrice - doc.purchasePrice : undefined;
              return (
                <tr key={doc._id.toHexString()} className="hover:bg-slate-50">
                  <Td mono>
                    <Link href={`/preowned/${doc._id.toHexString()}`} className="font-medium text-indigo-700 hover:underline">
                      {doc.stockNo}
                    </Link>
                  </Td>
                  <Td mono>{doc.chassisNumber}</Td>
                  <Td>
                    {doc.make} {doc.model}
                    {doc.registrationNo && <span className="block font-mono text-xs text-slate-400">{doc.registrationNo}</span>}
                  </Td>
                  <Td>{PREOWNED_USE_LABELS[doc.intendedUse]}</Td>
                  <Td>
                    <DateText iso={dateToInput(doc.purchaseDate)} />
                  </Td>
                  <Td right>{formatMoney(doc.purchasePrice)}</Td>
                  <Td>{doc.saleDate ? <DateText iso={dateToInput(doc.saleDate)} /> : <Badge tone="slate">In stock</Badge>}</Td>
                  <Td right>{formatMoney(doc.salePrice)}</Td>
                  <Td right>
                    {margin === undefined ? "—" : <span className={margin < 0 ? "text-red-600" : "text-emerald-700"}>{formatMoney(margin)}</span>}
                  </Td>
                </tr>
              );
            })}
          </DataTable>
        )}
        <Pagination
          basePath="/preowned"
          page={result.page}
          pageCount={result.pageCount}
          total={result.total}
          params={{ q, status: status === "all" ? undefined : status, period: period === "all" ? undefined : period }}
        />
      </Card>
    </>
  );
}
