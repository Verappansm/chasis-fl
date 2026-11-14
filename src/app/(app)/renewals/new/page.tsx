import type { Metadata } from "next";
import { Suspense } from "react";
import { requirePermission } from "@/lib/auth/dal";
import { getSettings } from "@/lib/repo/settings";
import { insuranceForChassis } from "@/lib/repo/modules";
import { normalizeChassis } from "@/lib/validation/fields";
import { RecordForm } from "@/components/record-form";
import { PageHeader, TableSkeleton, one } from "@/components/ui";
import { policyValues, renewalSections } from "@/lib/forms";
import { saveRenewal } from "../actions";

export const metadata: Metadata = { title: "New renewal payout" };

export default function NewRenewalPage({ searchParams }: PageProps<"/renewals/new">) {
  return (
    <>
      <PageHeader title="New renewal payout" description="The car must already have an insurance payout with us." />
      <Suspense fallback={<TableSkeleton />}>
        <Form searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Form({ searchParams }: { searchParams: PageProps<"/renewals/new">["searchParams"] }) {
  await requirePermission("renewals:invoice");
  const sp = await searchParams;
  const start = one(sp.start);
  const chassis = normalizeChassis(one(sp.chassis)?.slice(0, 24) ?? "");
  // The provider is the car's insurer; the server sets it again on save.
  const [rates, insured] = await Promise.all([getSettings(), chassis ? insuranceForChassis(chassis) : null]);
  // Prefill from "Record renewal"; values are only defaults and are re-validated on save.
  const initial = policyValues(null, {
    chassisNumber: chassis,
    provider: insured?.provider ?? "",
    policyStartDate: /^\d{4}-\d{2}-\d{2}$/.test(start ?? "") ? start : undefined,
  });
  return (
    <RecordForm
      action={saveRenewal}
      sections={renewalSections}
      initial={initial}
      cancelHref="/renewals"
      submitLabel="Create renewal payout"
      context={rates}
      readOnlyFields={["provider"]}
    />
  );
}
