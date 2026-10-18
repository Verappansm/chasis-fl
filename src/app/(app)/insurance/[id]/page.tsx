import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requirePermission } from "@/lib/auth/dal";
import { can } from "@/lib/permissions";
import { getInsurance } from "@/lib/repo/modules";
import { DeleteForm, RecordForm } from "@/components/record-form";
import { PageHeader, TableSkeleton } from "@/components/ui";
import { AuditFooter } from "@/components/audit-footer";
import { insuranceSections, insuranceValues } from "@/lib/forms";
import { removeInsurance, saveInsurance } from "../actions";

export const metadata: Metadata = { title: "Edit policy" };

export default function EditInsurancePage({ params }: PageProps<"/insurance/[id]">) {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <Editor params={params} />
    </Suspense>
  );
}

async function Editor({ params }: { params: PageProps<"/insurance/[id]">["params"] }) {
  const user = await requirePermission("insurance:view");
  const { id } = await params;
  const doc = await getInsurance(id);
  if (!doc) notFound();
  const record = { id: doc._id.toHexString(), version: doc.version };

  return (
    <>
      <PageHeader
        title={`Insurance · ${doc.chassisNumber}`}
        action={can(user, "insurance:delete") ? <DeleteForm action={removeInsurance} {...record} what="policy" /> : undefined}
      />
      <RecordForm
        action={saveInsurance}
        sections={insuranceSections}
        initial={insuranceValues(doc)}
        record={record}
        cancelHref="/insurance"
        submitLabel="Save changes"
        readOnly={!can(user, "insurance:edit")}
      />
      <AuditFooter doc={doc} />
    </>
  );
}
