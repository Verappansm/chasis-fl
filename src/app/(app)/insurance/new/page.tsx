import type { Metadata } from "next";
import { Suspense } from "react";
import { requirePermission } from "@/lib/auth/dal";
import { RecordForm } from "@/components/record-form";
import { PageHeader, TableSkeleton } from "@/components/ui";
import { insuranceSections, insuranceValues } from "@/lib/forms";
import { saveInsurance } from "../actions";

export const metadata: Metadata = { title: "New policy" };

export default function NewInsurancePage() {
  return (
    <>
      <PageHeader title="New insurance policy" description="A chassis can have several policies over time (new + renewals)." />
      <Suspense fallback={<TableSkeleton />}>
        <Form />
      </Suspense>
    </>
  );
}

async function Form() {
  await requirePermission("insurance:edit");
  return (
    <RecordForm
      action={saveInsurance}
      sections={insuranceSections}
      initial={insuranceValues()}
      cancelHref="/insurance"
      submitLabel="Create policy"
    />
  );
}
