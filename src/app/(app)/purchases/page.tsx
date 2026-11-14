import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requirePermission } from "@/lib/auth/dal";
import { IfCan } from "@/components/if-can";
import { listPurchases, parsePurchaseType, parseStage, todayUtc } from "@/lib/repo/modules";
import { parsePeriod } from "@/lib/periods";
import { dateToInput, formatMoney } from "@/lib/format";
import { PURCHASE_TYPES, PURCHASE_TYPE_LABELS, purchaseTypeLabel, type PurchaseDoc } from "@/lib/types";
import { getOptionLists } from "@/lib/repo/options";
import { AccessNote } from "@/components/access-note";
import { DateText } from "@/components/date-text";
import { LIST_PERIOD_OPTIONS, STAGE_OPTIONS, StageBadge } from "@/components/claims";
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

export const metadata: Metadata = { title: "Purchase" };


export default function PurchasesPage({ searchParams }: PageProps<"/purchases">) {
  return (
    <>
      <PageHeader
        title="Purchase"
        description="Cars bought from Mercedes-Benz, one row per commission no. New cars carry the fixed compensation through invoice and receipt."
        action={
          <IfCan permission="purchases:invoice">
            <LinkButton href="/purchases/new" tour="new-record">New purchase</LinkButton>
          </IfCan>
        }
      />
      <AccessNote module="purchases" />
      <Suspense fallback={<TableSkeleton />}>
        <PurchaseList searchParams={searchParams} />
      </Suspense>
    </>
  );
}

/** New: invoice stage. Others: lock-in / stock / sold. */
function Status({ doc, today }: { doc: PurchaseDoc; today: Date }) {
  if (doc.type === "new") return <StageBadge claim={doc} />;
  if (doc.saleDate) return <Badge tone="green">Sold</Badge>;
  if (doc.type === "demo" && doc.deflectDate && doc.deflectDate > today) {
    const left = Math.ceil((doc.deflectDate.getTime() - today.getTime()) / 86_400_000);
    return <Badge tone="amber">Locked · {left}d left</Badge>;
  }
  if (doc.type === "demo") return <Badge tone="indigo">Deflected · can sell</Badge>;
  return <Badge tone="slate">In stock</Badge>;
}

async function PurchaseList({ searchParams }: { searchParams: PageProps<"/purchases">["searchParams"] }) {
  await requirePermission("purchases:view");
  const sp = await searchParams;
  const q = one(sp.q);
  const lists = await getOptionLists();
  const extraTypes = lists.purchaseType.options;
  const type = parsePurchaseType(one(sp.type), extraTypes);
  const TYPE_OPTIONS = [
    { value: "all", label: "All" },
    ...PURCHASE_TYPES.map((t) => ({ value: t, label: PURCHASE_TYPE_LABELS[t] })),
    ...extraTypes.map((t) => ({ value: t, label: t })),
  ];
  const stage = parseStage(one(sp.stage));
  const period = parsePeriod(one(sp.period));
  const page = Number(one(sp.page) ?? 1);
  const result = await listPurchases({ q, type, stage, period, page });
  const today = todayUtc();

  return (
    <>
      <Flash saved={one(sp.saved) === "1"} deleted={one(sp.deleted) === "1"} />
      <Card tour="purchases-list">
        <ListToolbar
          basePath="/purchases"
          q={q}
          placeholder="Search commission, chassis, customer, model, invoice"
          filters={[
            { param: "type", label: "Type", value: type, options: TYPE_OPTIONS },
            { param: "stage", label: "FC", value: stage, options: STAGE_OPTIONS },
            { param: "period", label: "Period", value: period, options: LIST_PERIOD_OPTIONS },
          ]}
        />
        {result.items.length === 0 ? (
          <EmptyState title="No purchases found">{q ? "Try a different search." : "Record the first purchase."}</EmptyState>
        ) : (
          <DataTable
            head={
              <>
                <Th>Commission no</Th>
                <Th>Chassis</Th>
                <Th>Purchased</Th>
                <Th>Type</Th>
                <Th>Model</Th>
                <Th>Customer</Th>
                <Th right>Final price</Th>
                <Th right>FC receivable</Th>
                <Th>Status</Th>
              </>
            }
          >
            {result.items.map((doc) => (
              <tr key={doc._id.toHexString()} className="hover:bg-slate-50">
                <Td mono>
                  <Link href={`/purchases/${doc._id.toHexString()}`} className="font-medium text-indigo-700 hover:underline">
                    {doc.commissionNo}
                  </Link>
                </Td>
                <Td mono>{doc.chassisNumber}</Td>
                <Td>
                  <DateText iso={dateToInput(doc.purchaseDate)} />
                </Td>
                <Td>{purchaseTypeLabel(doc.type)}</Td>
                <Td>
                  {doc.model}
                  <span className="block text-xs text-slate-400">{doc.carClass}</span>
                </Td>
                <Td>{(doc.type === "new" ? doc.customerName : doc.soldTo) ?? "—"}</Td>
                <Td right>{formatMoney(doc.finalPrice)}</Td>
                <Td right>{formatMoney(doc.claimTotal)}</Td>
                <Td>
                  <Status doc={doc} today={today} />
                </Td>
              </tr>
            ))}
          </DataTable>
        )}
        <Pagination
          basePath="/purchases"
          page={result.page}
          pageCount={result.pageCount}
          total={result.total}
          params={{ q, type: type === "all" ? undefined : type, stage: stage === "all" ? undefined : stage, period: period === "all" ? undefined : period }}
        />
      </Card>
    </>
  );
}
