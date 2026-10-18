import type { Metadata } from "next";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/dal";
import { CreateUserForm } from "@/components/user-forms";
import { PageHeader, TableSkeleton } from "@/components/ui";
import { createUserAction } from "../actions";

export const metadata: Metadata = { title: "New user" };

export default function NewUserPage() {
  return (
    <>
      <PageHeader title="New user" />
      <Suspense fallback={<TableSkeleton />}>
        <Form />
      </Suspense>
    </>
  );
}

async function Form() {
  await requireAdmin();
  return <CreateUserForm action={createUserAction} />;
}
