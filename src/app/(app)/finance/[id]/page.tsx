import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requirePermission } from "@/lib/auth/dal";
import { can } from "@/lib/permissions";
import { findDeal, getFinance } from "@/lib/repo/modules";
import { getSettings } from "@/lib/repo/settings";
import { getOptionLists } from "@/lib/repo/options";
import { AccessNote } from "@/components/access-note";
import { DeleteForm, RecordForm } from "@/components/record-form";
import { ReceiptForm } from "@/components/receipt-form";
import { DealCard, receiptProps } from "@/components/claims";
import { Flash, PageHeader, TableSkeleton, one } from "@/components/ui";
import { AuditFooter } from "@/components/audit-footer";
import { financeSectionsFor, financeValues } from "@/lib/forms";
import { removeFinance, removeFinanceReceiptAction, saveFinance, saveFinanceReceiptAction } from "../actions";

export const metadata: Metadata = { title: "Finance payout" };

export default function FinancePayoutPage({ params, searchParams }: PageProps<"/finance/[id]">) {
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
  params: PageProps<"/finance/[id]">["params"];
  searchParams: PageProps<"/finance/[id]">["searchParams"];
}) {
  const user = await requirePermission("finance:view");
  const { id } = await params;
  const doc = await getFinance(id);
  if (!doc) notFound();
  const [deal, settings, lists, sp] = await Promise.all([findDeal(doc.dealRef), getSettings(), getOptionLists(), searchParams]);
  const record = { id: doc._id.toHexString(), version: doc.version };

  return (
    <>
      <PageHeader
        title={`Finance payout · ${doc.dealRef}`}
        action={can(user, "finance:delete") ? <DeleteForm action={removeFinance} {...record} what="finance payout" /> : undefined}
      />
      <AccessNote module="finance" />
      <Flash saved={one(sp.saved) === "1"} />
      {deal && <DealCard deal={deal} />}
      <div className="space-y-6">
        <RecordForm
          action={saveFinance}
          sections={financeSectionsFor(deal, settings.loanCapBp)}
          initial={financeValues(doc)}
          record={record}
          cancelHref="/finance"
          submitLabel="Save changes"
          readOnly={!can(user, "finance:invoice")}
          readOnlyNote="You can view this payout but not change it (that needs Invoice access)."
          context={{ ...settings, serviceGstRateBp: doc.serviceGstRateBp }}
          lists={lists}
          readOnlyFields={[]}
          hidden={{ returnTo: `/finance/${record.id}` }}
        />
        <ReceiptForm
          action={saveFinanceReceiptAction}
          record={record}
          removeAction={removeFinanceReceiptAction}
          {...receiptProps(doc)}
          canEdit={can(user, "finance:receipt")}
        />
      </div>
      <AuditFooter doc={doc} />
    </>
  );
}
