import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth/dal";
import { MODULES, can, isPermission } from "@/lib/permissions";
import { Card, one } from "@/components/ui";

export const metadata: Metadata = { title: "No access" };

const ACTION_TEXT: Record<string, string> = {
  view: "View",
  invoice: "Invoice (create and raise invoices)",
  receipt: "Receipt (record receipts)",
  edit: "Create & edit",
  delete: "Delete",
};

/** "purchases:invoice" → "Invoice (…) access on Purchase". */
function describe(need: string | undefined): string | null {
  if (need === "admin") return "an admin account";
  if (!need || !isPermission(need)) return null;
  if (need === "overview:view") return "access to the Overview";
  const [mod, action] = need.split(":");
  const m = MODULES.find((x) => x.key === mod);
  return m ? `${ACTION_TEXT[action] ?? action} access on ${m.label}` : null;
}

export default function NoAccessPage({ searchParams }: PageProps<"/no-access">) {
  return (
    <Suspense fallback={null}>
      <NoAccess searchParams={searchParams} />
    </Suspense>
  );
}

async function NoAccess({ searchParams }: { searchParams: PageProps<"/no-access">["searchParams"] }) {
  const user = await requireUser();
  const need = describe(one((await searchParams).need));
  const allowed = [
    ...(can(user, "overview:view") ? [{ href: "/overview", label: "Overview" }] : []),
    ...MODULES.filter((m) => can(user, `${m.key}:view`)),
  ];
  return (
    <Card className="mx-auto mt-10 max-w-xl p-8">
      <div className="mx-auto grid size-11 place-items-center rounded-full bg-red-50 text-red-600" aria-hidden>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="size-6">
          <rect x="5" y="11" width="14" height="10" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
      </div>
      <h1 className="mt-4 text-center text-lg font-semibold text-slate-900">You don&apos;t have access to that</h1>
      <p className="mt-2 text-center text-sm text-slate-600">
        {need ? (
          <>
            It needs <span className="font-medium text-slate-900">{need}</span>. Ask an admin to add it to your account.
          </>
        ) : (
          "Ask an admin if you need it."
        )}
      </p>
      <p className="mt-1 text-center text-xs text-slate-400">The attempt has been recorded in the activity log.</p>

      <h2 className="mt-8 text-sm font-semibold text-slate-700">What you can do</h2>
      {allowed.length > 0 || user.role === "admin" ? (
        <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm">
          {can(user, "overview:view") && (
            <li className="flex items-center justify-between px-3 py-2">
              <Link href="/overview" className="font-medium text-indigo-700 hover:underline">
                Overview
              </Link>
              <span className="text-slate-500">View</span>
            </li>
          )}
          {MODULES.filter((m) => can(user, `${m.key}:view`)).map((m) => (
            <li key={m.key} className="flex items-center justify-between gap-3 px-3 py-2">
              <Link href={m.href} className="font-medium text-indigo-700 hover:underline">
                {m.label}
              </Link>
              <span className="text-right text-slate-500">
                {(m.actions as readonly string[])
                  .filter((a) => can(user, `${m.key}:${a}` as never))
                  .map((a) => ACTION_TEXT[a].split(" (")[0])
                  .join(" · ")}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-slate-500">Your account has no permissions yet.</p>
      )}
      <p className="mt-4 text-center text-xs text-slate-500">
        See all your access under{" "}
        <Link href="/account" className="font-medium text-indigo-700 hover:underline">
          My account
        </Link>
        .
      </p>
    </Card>
  );
}
