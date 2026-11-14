import type { Metadata } from "next";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth/dal";
import { MODULES, ROLE_LABELS, can, type Permission } from "@/lib/permissions";
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
    ...MODULES.map((m) => {
      const has = (a: string) => ((m.actions as readonly string[]).includes(a) ? can(user, `${m.key}:${a}` as Permission) : undefined);
      return { label: m.label, view: has("view"), invoice: has("invoice") ?? has("edit"), receipt: has("receipt"), del: has("delete") };
    }),
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
        <div className="mt-2 overflow-hidden rounded-lg border border-slate-200">
          <table className="rt rt-md w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50/70 text-left text-[11px] font-medium uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-2.5">Area</th>
                <th className="px-4 py-2.5">View</th>
                <th className="px-4 py-2.5">Invoice (create &amp; edit)</th>
                <th className="px-4 py-2.5">Receipt</th>
                <th className="px-4 py-2.5">Delete</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {rows.map((r) => (
                <tr key={r.label}>
                  <td data-primary="" className="px-4 py-2.5 font-medium text-slate-800">{r.label}</td>
                  <td data-label="View" className="px-4 py-2.5">{yes(r.view)}</td>
                  <td data-label="Invoice" className="px-4 py-2.5">{"invoice" in r ? yes(r.invoice) : "—"}</td>
                  <td data-label="Receipt" className="px-4 py-2.5">{"receipt" in r ? yes(r.receipt) : "—"}</td>
                  <td data-label="Delete" className="px-4 py-2.5">{"del" in r ? yes(r.del) : "—"}</td>
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
