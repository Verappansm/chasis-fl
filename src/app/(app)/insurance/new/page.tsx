import type { Metadata } from "next";
import { Suspense } from "react";
import { requirePermission } from "@/lib/auth/dal";
import { findDeal } from "@/lib/repo/modules";
import { getSettings } from "@/lib/repo/settings";
import { getOptionLists } from "@/lib/repo/options";
import { RecordForm } from "@/components/record-form";
import { DealCard, DealPicker } from "@/components/claims";
import { PageHeader, TableSkeleton, one } from "@/components/ui";
import { dateToInput } from "@/lib/format";
import { insuranceSections, policyValues } from "@/lib/forms";
import { saveInsurance } from "../actions";

export const metadata: Metadata = { title: "New insurance payout" };

export default function NewInsurancePage({ searchParams }: PageProps<"/insurance/new">) {
  return (
    <>
      <PageHeader title="New insurance payout" description="The first policy sold with the car. Later years go under Renewal payout." />
      <Suspense fallback={<TableSkeleton />}>
        <Form searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Form({ searchParams }: { searchParams: PageProps<"/insurance/new">["searchParams"] }) {
  await requirePermission("insurance:invoice");
  const ref = one((await searchParams).deal)?.slice(0, 40);
  if (!ref) return <DealPicker basePath="/insurance/new" />;
  const deal = await findDeal(ref);
  if (!deal) return <DealPicker basePath="/insurance/new" value={ref} error="No purchase or pre-owned car with this number." />;
  if (!deal.sold) return <DealPicker basePath="/insurance/new" value={ref} error="This car has not been sold yet. Record the sale first." />;
  const [rates, lists] = await Promise.all([getSettings(), getOptionLists()]);
  return (
    <>
      <DealCard deal={deal} />
      <RecordForm
        action={saveInsurance}
        sections={insuranceSections}
        initial={policyValues(null, { dealRef: deal.ref, policyStartDate: dateToInput(deal.saleDate) })}
        readOnlyFields={["dealRef"]}
        cancelHref="/insurance"
        submitLabel="Create insurance payout"
        context={rates}
        lists={lists}
      />
    </>
  );
}
