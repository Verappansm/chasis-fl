import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requirePermission } from "@/lib/auth/dal";
import { can } from "@/lib/permissions";
import { getPreowned, payoutsForDeal } from "@/lib/repo/modules";
import { getOptionLists } from "@/lib/repo/options";
import { AccessNote } from "@/components/access-note";
import { DeleteForm, RecordForm } from "@/components/record-form";
import { DealPayouts } from "@/components/claims";
import { PageHeader, TableSkeleton } from "@/components/ui";
import { AuditFooter } from "@/components/audit-footer";
import { preownedSections, preownedValues } from "@/lib/forms";
import { removePreowned, savePreowned } from "../actions";

export const metadata: Metadata = { title: "Pre-owned car" };

export default function PreownedCarPage({ params }: PageProps<"/preowned/[id]">) {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <Editor params={params} />
    </Suspense>
  );
}

async function Editor({ params }: { params: PageProps<"/preowned/[id]">["params"] }) {
  const user = await requirePermission("preowned:view");
  const { id } = await params;
  const doc = await getPreowned(id);
  if (!doc) notFound();
  const [payouts, lists] = await Promise.all([payoutsForDeal(doc.stockNo), getOptionLists()]);
  const record = { id: doc._id.toHexString(), version: doc.version };
  const sold = Boolean(doc.saleDate);

  return (
    <>
      <PageHeader
        title={`Pre-owned · ${doc.stockNo}`}
        description={`${doc.make} ${doc.model} · chassis ${doc.chassisNumber}`}
        action={can(user, "preowned:delete") ? <DeleteForm action={removePreowned} {...record} what="pre-owned car" /> : undefined}
      />
      <AccessNote module="preowned" />
      <div className="space-y-6">
        <RecordForm
          action={savePreowned}
          sections={preownedSections}
          initial={preownedValues(doc)}
          record={record}
          cancelHref="/preowned"
          submitLabel="Save changes"
          readOnly={!can(user, "preowned:edit")}
          readOnlyNote="You can view this car but not change it (that needs Create & edit access on Pre-owned)."
          lists={lists}
        />
        <DealPayouts
          payouts={payouts}
          dealRef={doc.stockNo}
          sold={sold}
          canAddFinance={can(user, "finance:invoice")}
          canAddInsurance={can(user, "insurance:invoice")}
        />
      </div>
      <AuditFooter doc={doc} />
    </>
  );
}
