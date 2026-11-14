import type { Metadata } from "next";
import { Suspense } from "react";
import { requirePermission } from "@/lib/auth/dal";
import { findDeal } from "@/lib/repo/modules";
import { getSettings } from "@/lib/repo/settings";
import { getOptionLists } from "@/lib/repo/options";
import { RecordForm } from "@/components/record-form";
import { DealCard, DealPicker } from "@/components/claims";
import { PageHeader, TableSkeleton, one } from "@/components/ui";
import { financeSectionsFor, financeValues } from "@/lib/forms";
import { saveFinance } from "../actions";

export const metadata: Metadata = { title: "New finance payout" };

export default function NewFinancePage({ searchParams }: PageProps<"/finance/new">) {
  return (
    <>
      <PageHeader title="New finance payout" description="One finance payout per sale." />
      <Suspense fallback={<TableSkeleton />}>
        <Form searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Form({ searchParams }: { searchParams: PageProps<"/finance/new">["searchParams"] }) {
  await requirePermission("finance:invoice");
  const ref = one((await searchParams).deal)?.slice(0, 40);
  if (!ref) return <DealPicker basePath="/finance/new" />;
  const deal = await findDeal(ref);
  if (!deal) return <DealPicker basePath="/finance/new" value={ref} error="No purchase or pre-owned car with this number." />;
  if (!deal.sold) return <DealPicker basePath="/finance/new" value={ref} error="This car has not been sold yet. Record the sale first." />;
  const [rates, lists] = await Promise.all([getSettings(), getOptionLists()]);
  return (
    <>
      <DealCard deal={deal} />
      <RecordForm
        action={saveFinance}
        sections={financeSectionsFor(deal, rates.loanCapBp)}
        initial={financeValues(null, deal.ref)}
        readOnlyFields={["dealRef"]}
        cancelHref="/finance"
        submitLabel="Create finance payout"
        context={rates}
        lists={lists}
      />
    </>
  );
}
