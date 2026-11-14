import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requirePermission } from "@/lib/auth/dal";
import { can } from "@/lib/permissions";
import { findDeal, getRenewal } from "@/lib/repo/modules";
import { getSettings } from "@/lib/repo/settings";
import { getOptionLists } from "@/lib/repo/options";
import { AccessNote } from "@/components/access-note";
import { DeleteForm, RecordForm } from "@/components/record-form";
import { ReceiptForm } from "@/components/receipt-form";
import { DealCard, receiptProps } from "@/components/claims";
import { Flash, PageHeader, TableSkeleton, one } from "@/components/ui";
import { AuditFooter } from "@/components/audit-footer";
import { policyValues, renewalSections } from "@/lib/forms";
import { removeRenewal, removeRenewalReceiptAction, saveRenewal, saveRenewalReceiptAction } from "../actions";

export const metadata: Metadata = { title: "Renewal payout" };

export default function RenewalPayoutPage({ params, searchParams }: PageProps<"/renewals/[id]">) {
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
  params: PageProps<"/renewals/[id]">["params"];
  searchParams: PageProps<"/renewals/[id]">["searchParams"];
}) {
  const user = await requirePermission("renewals:view");
  const { id } = await params;
  const doc = await getRenewal(id);
  if (!doc) notFound();
  const [deal, settings, lists, sp] = await Promise.all([findDeal(doc.dealRef), getSettings(), getOptionLists(), searchParams]);
  const record = { id: doc._id.toHexString(), version: doc.version };

  return (
    <>
      <PageHeader
        title={`Renewal payout · ${doc.chassisNumber}`}
        action={can(user, "renewals:delete") ? <DeleteForm action={removeRenewal} {...record} what="renewal payout" /> : undefined}
      />
      <AccessNote module="renewals" />
      <Flash saved={one(sp.saved) === "1"} />
      {deal && <DealCard deal={deal} />}
      <div className="space-y-6">
        <RecordForm
          action={saveRenewal}
          sections={renewalSections}
          initial={policyValues(doc)}
          record={record}
          cancelHref="/renewals"
          submitLabel="Save changes"
          readOnly={!can(user, "renewals:invoice")}
          readOnlyNote="You can view this payout but not change it (that needs Invoice access)."
          context={{ ...settings, serviceGstRateBp: doc.serviceGstRateBp }}
          lists={lists}
          readOnlyFields={["provider"]}
          hidden={{ returnTo: `/renewals/${record.id}` }}
        />
        <ReceiptForm
          action={saveRenewalReceiptAction}
          record={record}
          removeAction={removeRenewalReceiptAction}
          {...receiptProps(doc)}
          canEdit={can(user, "renewals:receipt")}
        />
      </div>
      <AuditFooter doc={doc} />
    </>
  );
}
