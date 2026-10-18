import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth/dal";
import { MODULES, can } from "@/lib/permissions";
import { Card } from "@/components/ui";

export const metadata: Metadata = { title: "No access" };

export default function NoAccessPage() {
  return (
    <Suspense fallback={null}>
      <NoAccess />
    </Suspense>
  );
}

async function NoAccess() {
  const user = await requireUser();
  const allowed = [
    ...(can(user, "overview:view") ? [{ href: "/overview", label: "Overview" }] : []),
    ...MODULES.filter((m) => can(user, `${m.key}:view`)),
  ];
  return (
    <Card className="mx-auto mt-10 max-w-lg p-8 text-center">
      <h1 className="text-lg font-semibold text-slate-900">You don&apos;t have access to that page</h1>
      <p className="mt-2 text-sm text-slate-500">Ask an admin if you need it.</p>
      {allowed.length > 0 ? (
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {allowed.map((a) => (
            <Link key={a.href} href={a.href} className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-200">
              {a.label}
            </Link>
          ))}
        </div>
      ) : (
        <p className="mt-6 text-sm text-slate-500">Your account has no permissions yet.</p>
      )}
    </Card>
  );
}
