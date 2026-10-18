import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requirePermission } from "@/lib/auth/dal";
import { can } from "@/lib/permissions";
import { getRenewal } from "@/lib/repo/modules";
import { DeleteForm, RecordForm } from "@/components/record-form";
import { PageHeader, TableSkeleton } from "@/components/ui";
import { AuditFooter } from "@/components/audit-footer";
import { renewalSections, renewalValues } from "@/lib/forms";
import { removeRenewal, saveRenewal } from "../actions";

export const metadata: Metadata = { title: "Edit renewal case" };

export default function EditRenewalPage({ params }: PageProps<"/renewals/[id]">) {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <Editor params={params} />
    </Suspense>
  );
}

async function Editor({ params }: { params: PageProps<"/renewals/[id]">["params"] }) {
  const user = await requirePermission("renewals:view");
  const { id } = await params;
  const doc = await getRenewal(id);
  if (!doc) notFound();
  const record = { id: doc._id.toHexString(), version: doc.version };

  return (
    <>
      <PageHeader
        title={`Renewal · ${doc.chassisNumber}`}
        action={can(user, "renewals:delete") ? <DeleteForm action={removeRenewal} {...record} what="renewal case" /> : undefined}
      />
      <RecordForm
        action={saveRenewal}
        sections={renewalSections}
        initial={renewalValues(doc)}
        record={record}
        cancelHref="/renewals"
        submitLabel="Save changes"
        readOnly={!can(user, "renewals:edit")}
      />
      <AuditFooter doc={doc} />
    </>
  );
}
