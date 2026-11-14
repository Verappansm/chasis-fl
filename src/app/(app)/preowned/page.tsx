import type { Metadata } from "next";
import { AccessNote } from "@/components/access-note";
import Link from "next/link";
import { Suspense } from "react";
import { requirePermission } from "@/lib/auth/dal";
import { IfCan } from "@/components/if-can";
import { listPreowned, type PreownedFilter } from "@/lib/repo/modules";
import { parsePeriod } from "@/lib/periods";
import { parsePageSize } from "@/lib/paging";
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
  Sub,
  TableSkeleton,
  Td,
  Th,
  one,
  rowClass,
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
  const size = parsePageSize(one(sp.size));
  const result = await listPreowned({ size: size.size, q, status, period, page });

  return (
    <>
      <Flash saved={one(sp.saved) === "1"} deleted={one(sp.deleted) === "1"} />
      <Card tour="preowned-list">
        <ListToolbar
          basePath="/preowned"
          q={q}
          pageSize={size.value}
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
            stack="xl"
            head={
              <>
                <Th>Stock no</Th>
                <Th>Car</Th>
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
                <tr key={doc._id.toHexString()} className={rowClass}>
                  <Td primary>
                    <Link href={`/preowned/${doc._id.toHexString()}`} className="font-mono text-[13px] font-medium text-indigo-700 hover:underline">
                      {doc.stockNo}
                    </Link>
                    <Sub mono>{doc.chassisNumber}</Sub>
                  </Td>
                  <Td label="Car">
                    {doc.make} {doc.model}
                    <Sub>
                      {PREOWNED_USE_LABELS[doc.intendedUse]}
                      {doc.registrationNo && <span className="font-mono"> · {doc.registrationNo}</span>}
                    </Sub>
                  </Td>
                  <Td label="Bought">
                    <DateText iso={dateToInput(doc.purchaseDate)} />
                  </Td>
                  <Td label="Purchase" right>{formatMoney(doc.purchasePrice)}</Td>
                  <Td label="Sold">{doc.saleDate ? <DateText iso={dateToInput(doc.saleDate)} /> : <Badge tone="slate">In stock</Badge>}</Td>
                  <Td label="Sale" right>{formatMoney(doc.salePrice)}</Td>
                  <Td label="Margin" right>
                    {margin === undefined ? "—" : <span className={margin < 0 ? "text-red-700" : "text-emerald-700"}>{formatMoney(margin)}</span>}
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
          params={{ size: size.value === "50" ? undefined : size.value, q, status: status === "all" ? undefined : status, period: period === "all" ? undefined : period }}
        />
      </Card>
    </>
  );
}
