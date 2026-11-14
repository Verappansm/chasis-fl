import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requirePermission } from "@/lib/auth/dal";
import { can } from "@/lib/permissions";
import { getPurchase, isPurchaseSold, payoutsForDeal } from "@/lib/repo/modules";
import { getSettings } from "@/lib/repo/settings";
import { getOptionLists } from "@/lib/repo/options";
import { DeleteForm, RecordForm } from "@/components/record-form";
import { ReceiptForm } from "@/components/receipt-form";
import { DealPayouts, StageBadge, receiptProps } from "@/components/claims";
import { AccessNote } from "@/components/access-note";
import { Flash, PageHeader, TableSkeleton, one } from "@/components/ui";
import { AuditFooter } from "@/components/audit-footer";
import { purchaseSections, purchaseValues } from "@/lib/forms";
import { removePurchase, removePurchaseReceiptAction, savePurchase, savePurchaseReceiptAction } from "../actions";

export const metadata: Metadata = { title: "Purchase" };

export default function PurchasePage({ params, searchParams }: PageProps<"/purchases/[id]">) {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <Editor params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Editor({
  params,
  searchParams,
}: {
  params: PageProps<"/purchases/[id]">["params"];
  searchParams: PageProps<"/purchases/[id]">["searchParams"];
}) {
  const user = await requirePermission("purchases:view");
  const { id } = await params;
  const doc = await getPurchase(id);
  if (!doc) notFound();
  const [settings, lists, payouts, sp] = await Promise.all([getSettings(), getOptionLists(), payoutsForDeal(doc.commissionNo), searchParams]);
  const record = { id: doc._id.toHexString(), version: doc.version };
  // Recalculate with the rates this record was created with.
  const ev = doc.grade === "ev";
  const context = {
    ...settings,
    purchaseGstRateBp: ev ? settings.purchaseGstRateBp : doc.purchaseGstRateBp,
    evPurchaseGstRateBp: ev ? doc.purchaseGstRateBp : settings.evPurchaseGstRateBp,
    saleGstRateBp: doc.saleGstRateBp ?? settings.saleGstRateBp,
    fcRateBp: doc.fcRateBp ?? settings.fcRateBp,
    serviceGstRateBp: doc.serviceGstRateBp ?? settings.serviceGstRateBp,
    demoLockInDays: doc.lockInDays ?? settings.demoLockInDays,
  };
  const sold = isPurchaseSold(doc);

  return (
    <>
      <PageHeader
        title={`Purchase · ${doc.commissionNo}`}
        description={`${doc.model} · chassis ${doc.chassisNumber}`}
        action={can(user, "purchases:delete") ? <DeleteForm action={removePurchase} {...record} what="purchase" /> : undefined}
      />
      <AccessNote module="purchases" />
      <Flash saved={one(sp.saved) === "1"} />
      <div className="space-y-6">
        <RecordForm
          action={savePurchase}
          sections={purchaseSections}
          initial={purchaseValues(doc)}
          record={record}
          cancelHref={doc.type === "demo" ? "/demo" : "/purchases"}
          submitLabel="Save purchase"
          readOnly={!can(user, "purchases:invoice")}
          readOnlyNote="You can view this purchase but not change it (that needs Invoice access on Purchase)."
          context={context}
          lists={lists}
          hidden={{ returnTo: `/purchases/${record.id}` }}
        />

        {doc.type === "new" && doc.claimTotal !== undefined && (
          <>
            <div className="flex items-center gap-2 text-sm text-slate-600">
              Fixed compensation: <StageBadge claim={doc} />
            </div>
            <ReceiptForm
              action={savePurchaseReceiptAction}
              removeAction={removePurchaseReceiptAction}
              record={record}
              {...receiptProps(doc)}
              canEdit={can(user, "purchases:receipt")}
            />
          </>
        )}

        <DealPayouts
          payouts={payouts}
          dealRef={doc.commissionNo}
          sold={sold}
          canAddFinance={can(user, "finance:invoice")}
          canAddInsurance={can(user, "insurance:invoice")}
        />
      </div>
      <AuditFooter doc={doc} />
    </>
  );
}
