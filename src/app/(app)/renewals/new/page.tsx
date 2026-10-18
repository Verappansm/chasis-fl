import type { Metadata } from "next";
import { Suspense } from "react";
import { requirePermission } from "@/lib/auth/dal";
import { RecordForm } from "@/components/record-form";
import { PageHeader, TableSkeleton, one } from "@/components/ui";
import { renewalSections, renewalValues } from "@/lib/forms";
import { saveRenewal } from "../actions";

export const metadata: Metadata = { title: "New renewal case" };

export default function NewRenewalPage({ searchParams }: PageProps<"/renewals/new">) {
  return (
    <>
      <PageHeader title="New renewal case" />
      <Suspense fallback={<TableSkeleton />}>
        <Form searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Form({ searchParams }: { searchParams: PageProps<"/renewals/new">["searchParams"] }) {
  await requirePermission("renewals:edit");
  const sp = await searchParams;
  // Prefill from "Start follow-up"; values are only defaults and are re-validated on save.
  const initial = renewalValues(undefined, {
    chassisNumber: one(sp.chassis)?.slice(0, 24),
    dueDate: /^\d{4}-\d{2}-\d{2}$/.test(one(sp.due) ?? "") ? one(sp.due) : undefined,
  });
  return (
    <RecordForm action={saveRenewal} sections={renewalSections} initial={initial} cancelHref="/renewals" submitLabel="Create renewal case" />
  );
}
