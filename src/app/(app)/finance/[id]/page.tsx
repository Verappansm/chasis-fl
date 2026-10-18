import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requirePermission } from "@/lib/auth/dal";
import { can } from "@/lib/permissions";
import { getFinance } from "@/lib/repo/modules";
import { DeleteForm, RecordForm } from "@/components/record-form";
import { PageHeader, TableSkeleton } from "@/components/ui";
import { AuditFooter } from "@/components/audit-footer";
import { financeSections, financeValues } from "@/lib/forms";
import { removeFinance, saveFinance } from "../actions";

export const metadata: Metadata = { title: "Edit finance case" };

export default function EditFinancePage({ params }: PageProps<"/finance/[id]">) {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <Editor params={params} />
    </Suspense>
  );
}

async function Editor({ params }: { params: PageProps<"/finance/[id]">["params"] }) {
  const user = await requirePermission("finance:view");
  const { id } = await params;
  const found = await getFinance(id);
  if (!found) notFound();
  const { doc, vehicle } = found;
  const record = { id: doc._id.toHexString(), version: doc.version };

  return (
    <>
      <PageHeader
        title={`Finance · ${doc.chassisNumber}`}
        action={can(user, "finance:delete") ? <DeleteForm action={removeFinance} {...record} what="finance case" /> : undefined}
      />
      <RecordForm
        action={saveFinance}
        sections={financeSections}
        initial={financeValues(doc, vehicle)}
        record={record}
        cancelHref="/finance"
        submitLabel="Save changes"
        readOnly={!can(user, "finance:edit")}
      />
      <AuditFooter doc={doc} />
    </>
  );
}
