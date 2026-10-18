import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requirePermission } from "@/lib/auth/dal";
import { can } from "@/lib/permissions";
import { getIncentive } from "@/lib/repo/modules";
import { DeleteForm, RecordForm } from "@/components/record-form";
import { PageHeader, TableSkeleton } from "@/components/ui";
import { AuditFooter } from "@/components/audit-footer";
import { incentiveSections, incentiveValues } from "@/lib/forms";
import { removeIncentive, saveIncentive } from "../actions";

export const metadata: Metadata = { title: "Edit payout" };

export default function EditIncentivePage({ params }: PageProps<"/incentives/[id]">) {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <Editor params={params} />
    </Suspense>
  );
}

async function Editor({ params }: { params: PageProps<"/incentives/[id]">["params"] }) {
  const user = await requirePermission("incentives:view");
  const { id } = await params;
  const doc = await getIncentive(id);
  if (!doc) notFound();
  const record = { id: doc._id.toHexString(), version: doc.version };

  return (
    <>
      <PageHeader
        title={`Incentive · ${doc.chassisNumber}`}
        action={can(user, "incentives:delete") ? <DeleteForm action={removeIncentive} {...record} what="payout" /> : undefined}
      />
      <RecordForm
        action={saveIncentive}
        sections={incentiveSections}
        initial={incentiveValues(doc)}
        record={record}
        cancelHref="/incentives"
        submitLabel="Save changes"
        readOnly={!can(user, "incentives:edit")}
      />
      <AuditFooter doc={doc} />
    </>
  );
}
