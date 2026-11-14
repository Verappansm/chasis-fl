import type { Metadata } from "next";
import { Suspense } from "react";
import { requirePermission } from "@/lib/auth/dal";
import { getSettings } from "@/lib/repo/settings";
import { getOptionLists } from "@/lib/repo/options";
import { RecordForm } from "@/components/record-form";
import { PageHeader, TableSkeleton, one } from "@/components/ui";
import { purchaseSections, purchaseValues } from "@/lib/forms";
import { savePurchase } from "../actions";

export const metadata: Metadata = { title: "New purchase" };

export default function NewPurchasePage({ searchParams }: PageProps<"/purchases/new">) {
  return (
    <>
      <PageHeader title="New purchase" description="One row per commission no." />
      <Suspense fallback={<TableSkeleton />}>
        <Form searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Form({ searchParams }: { searchParams: PageProps<"/purchases/new">["searchParams"] }) {
  await requirePermission("purchases:invoice");
  const [rates, lists] = await Promise.all([getSettings(), getOptionLists()]);
  const sp = await searchParams;
  const initial = purchaseValues();
  // "New demo car" from the demo stock page.
  if (one(sp.type) === "demo") initial.type = "demo";
  return (
    <RecordForm
      action={savePurchase}
      sections={purchaseSections}
      initial={initial}
      lists={lists}
      cancelHref="/purchases"
      submitLabel="Create purchase"
      context={rates}
    />
  );
}
