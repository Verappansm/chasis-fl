import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/dal";
import { getUser } from "@/lib/repo/users";
import { formatDateTime } from "@/lib/format";
import { normalizePermissions } from "@/lib/permissions";
import { AccessForm, ResetPasswordForm } from "@/components/user-forms";
import { PageHeader, TableSkeleton } from "@/components/ui";
import { resetPasswordAction, updateAccessAction } from "../actions";

export const metadata: Metadata = { title: "Edit user" };

export default function EditUserPage({ params }: PageProps<"/admin/users/[id]">) {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <Editor params={params} />
    </Suspense>
  );
}

async function Editor({ params }: { params: PageProps<"/admin/users/[id]">["params"] }) {
  const me = await requireAdmin();
  const { id } = await params;
  const user = await getUser(id);
  if (!user) notFound();
  const isSelf = user._id.toHexString() === me.id;

  return (
    <>
      <PageHeader
        title={`User · ${user.username}`}
        description={`Created ${formatDateTime(user.createdAt)}${user.createdBy ? ` by ${user.createdBy}` : ""} · Last sign-in ${formatDateTime(user.lastLoginAt)}`}
      />
      <div className="space-y-8">
        <AccessForm
          action={updateAccessAction}
          isSelf={isSelf}
          user={{
            id: user._id.toHexString(),
            version: user.version ?? 0,
            username: user.username,
            role: user.role === "admin" ? "admin" : "user",
            active: user.active,
            permissions: normalizePermissions(user.permissions ?? []),
          }}
        />
        {isSelf ? (
          <p className="text-sm text-slate-500">
            To change your own password, use <a href="/account" className="text-indigo-700 hover:underline">My account</a>.
          </p>
        ) : (
          <ResetPasswordForm action={resetPasswordAction} id={user._id.toHexString()} />
        )}
      </div>
    </>
  );
}
