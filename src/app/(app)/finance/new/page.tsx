import type { Metadata } from "next";
import { Suspense } from "react";
import { requirePermission } from "@/lib/auth/dal";
import { RecordForm } from "@/components/record-form";
import { PageHeader, TableSkeleton } from "@/components/ui";
import { financeSections, financeValues } from "@/lib/forms";
import { saveFinance } from "../actions";

export const metadata: Metadata = { title: "New finance case" };

export default function NewFinancePage() {
  return (
    <>
      <PageHeader title="New finance case" description="One finance case per chassis." />
      <Suspense fallback={<TableSkeleton />}>
        <Form />
      </Suspense>
    </>
  );
}

async function Form() {
  await requirePermission("finance:edit");
  return (
    <RecordForm
      action={saveFinance}
      sections={financeSections}
      initial={financeValues()}
      cancelHref="/finance"
      submitLabel="Create finance case"
    />
  );
}
