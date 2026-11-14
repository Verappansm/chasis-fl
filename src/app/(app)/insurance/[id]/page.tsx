import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requirePermission } from "@/lib/auth/dal";
import { can } from "@/lib/permissions";
import { findDeal, getInsurance } from "@/lib/repo/modules";
import { getSettings } from "@/lib/repo/settings";
import { getOptionLists } from "@/lib/repo/options";
import { AccessNote } from "@/components/access-note";
import { DeleteForm, RecordForm } from "@/components/record-form";
import { ReceiptForm } from "@/components/receipt-form";
import { DealCard, receiptProps } from "@/components/claims";
import { Flash, PageHeader, TableSkeleton, one } from "@/components/ui";
import { AuditFooter } from "@/components/audit-footer";
import { insuranceSections, policyValues } from "@/lib/forms";
import { removeInsurance, removeInsuranceReceiptAction, saveInsurance, saveInsuranceReceiptAction } from "../actions";

export const metadata: Metadata = { title: "Insurance payout" };

export default function InsurancePayoutPage({ params, searchParams }: PageProps<"/insurance/[id]">) {
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
  params: PageProps<"/insurance/[id]">["params"];
  searchParams: PageProps<"/insurance/[id]">["searchParams"];
}) {
  const user = await requirePermission("insurance:view");
  const { id } = await params;
  const doc = await getInsurance(id);
  if (!doc) notFound();
  const [deal, settings, lists, sp] = await Promise.all([findDeal(doc.dealRef), getSettings(), getOptionLists(), searchParams]);
  const record = { id: doc._id.toHexString(), version: doc.version };

  return (
    <>
      <PageHeader
        title={`Insurance payout · ${doc.dealRef}`}
        action={can(user, "insurance:delete") ? <DeleteForm action={removeInsurance} {...record} what="insurance payout" /> : undefined}
      />
      <AccessNote module="insurance" />
      <Flash saved={one(sp.saved) === "1"} />
      {deal && <DealCard deal={deal} />}
      <div className="space-y-6">
        <RecordForm
          action={saveInsurance}
          sections={insuranceSections}
          initial={policyValues(doc)}
          record={record}
          cancelHref="/insurance"
          submitLabel="Save changes"
          readOnly={!can(user, "insurance:invoice")}
          readOnlyNote="You can view this payout but not change it (that needs Invoice access)."
          context={{ ...settings, serviceGstRateBp: doc.serviceGstRateBp }}
          lists={lists}
          readOnlyFields={[]}
          hidden={{ returnTo: `/insurance/${record.id}` }}
        />
        <ReceiptForm
          action={saveInsuranceReceiptAction}
          record={record}
          removeAction={removeInsuranceReceiptAction}
          {...receiptProps(doc)}
          canEdit={can(user, "insurance:receipt")}
        />
      </div>
      <AuditFooter doc={doc} />
    </>
  );
}
