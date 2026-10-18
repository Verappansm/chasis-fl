import type { Metadata } from "next";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth/dal";
import { MODULES, ROLE_LABELS, can } from "@/lib/permissions";
import { ChangePasswordForm } from "@/components/user-forms";
import { Card, PageHeader, TableSkeleton } from "@/components/ui";
import { changePasswordAction } from "./actions";

export const metadata: Metadata = { title: "My account" };

export default function AccountPage() {
  return (
    <>
      <PageHeader title="My account" />
      <Suspense fallback={<TableSkeleton />}>
        <Account />
      </Suspense>
    </>
  );
}

async function Account() {
  const user = await requireUser();
  const rows = [
    { label: "Overview dashboard", view: can(user, "overview:view") },
    ...MODULES.map((m) => ({
      label: m.label,
      view: can(user, `${m.key}:view`),
      edit: can(user, `${m.key}:edit`),
      del: can(user, `${m.key}:delete`),
    })),
  ];
  const yes = (v?: boolean) => (v === undefined ? "" : v ? "Yes" : "No");

  return (
    <div className="space-y-8">
      <Card className="p-6">
        <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">Username</dt>
            <dd className="font-medium text-slate-900">{user.username}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Role</dt>
            <dd className="font-medium text-slate-900">{ROLE_LABELS[user.role]}</dd>
          </div>
        </dl>
        <h2 className="mt-6 text-sm font-semibold text-slate-900">Your access</h2>
        <div className="mt-2 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="py-2 pr-6">Area</th>
                <th className="py-2 pr-6">View</th>
                <th className="py-2 pr-6">Create &amp; edit</th>
                <th className="py-2">Delete</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {rows.map((r) => (
                <tr key={r.label}>
                  <td className="py-2 pr-6 font-medium text-slate-800">{r.label}</td>
                  <td className="py-2 pr-6">{yes(r.view)}</td>
                  <td className="py-2 pr-6">{"edit" in r ? yes(r.edit) : ""}</td>
                  <td className="py-2">{"del" in r ? yes(r.del) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {user.role !== "admin" && <p className="mt-3 text-xs text-slate-500">Ask an admin if you need more access.</p>}
      </Card>
      <ChangePasswordForm action={changePasswordAction} />
    </div>
  );
}
