import type { Metadata } from "next";
import { Suspense } from "react";
import { requirePermission } from "@/lib/auth/dal";
import { RecordForm } from "@/components/record-form";
import { PageHeader, TableSkeleton } from "@/components/ui";
import { getOptionLists } from "@/lib/repo/options";
import { preownedSections, preownedValues } from "@/lib/forms";
import { savePreowned } from "../actions";

export const metadata: Metadata = { title: "New pre-owned car" };

export default function NewPreownedPage() {
  return (
    <>
      <PageHeader title="New pre-owned car" description="A stock no (PO-…) is assigned automatically." />
      <Suspense fallback={<TableSkeleton />}>
        <Form />
      </Suspense>
    </>
  );
}

async function Form() {
  await requirePermission("preowned:edit");
  const lists = await getOptionLists();
  return (
    <RecordForm
      action={savePreowned}
      sections={preownedSections}
      initial={preownedValues()}
      lists={lists}
      cancelHref="/preowned"
      submitLabel="Create pre-owned car"
    />
  );
}
