import type { Metadata } from "next";
import { Suspense } from "react";
import { requirePermission } from "@/lib/auth/dal";
import { RecordForm } from "@/components/record-form";
import { PageHeader, TableSkeleton } from "@/components/ui";
import { incentiveSections, incentiveValues } from "@/lib/forms";
import { saveIncentive } from "../actions";

export const metadata: Metadata = { title: "Record payout" };

export default function NewIncentivePage() {
  return (
    <>
      <PageHeader title="Record incentive payout" />
      <Suspense fallback={<TableSkeleton />}>
        <Form />
      </Suspense>
    </>
  );
}

async function Form() {
  await requirePermission("incentives:edit");
  return (
    <RecordForm
      action={saveIncentive}
      sections={incentiveSections}
      initial={incentiveValues()}
      cancelHref="/incentives"
      submitLabel="Record payout"
    />
  );
}
