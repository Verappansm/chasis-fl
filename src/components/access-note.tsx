import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth/dal";
import { MODULES, can, type ModuleKey } from "@/lib/permissions";

const ACTION_TEXT: Record<string, string> = {
  view: "view",
  invoice: "create and raise invoices",
  receipt: "record receipts",
  edit: "create and edit",
  delete: "delete",
};

/** Tells the user, on each tab, exactly what their access lets them do here. */
export function AccessNote({ module }: { module: ModuleKey }) {
  return (
    <Suspense fallback={null}>
      <Note module={module} />
    </Suspense>
  );
}

async function Note({ module }: { module: ModuleKey }) {
  const user = await getCurrentUser();
  if (!user || user.role === "admin") return null;
  const mod = MODULES.find((m) => m.key === module)!;
  const actions = mod.actions as readonly string[];
  const allowed = actions.filter((a) => can(user, `${module}:${a}` as never));
  const missing = actions.filter((a) => !allowed.includes(a));
  if (!missing.length) return null;
  const list = (xs: string[]) => xs.map((a) => ACTION_TEXT[a]).join(", ");
  return (
    <p className="mb-4 flex flex-wrap items-center gap-x-2 rounded-lg border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm text-sky-900" role="note">
      <span className="font-medium">Your access on {mod.label}:</span>
      <span>you can {list(allowed)}.</span>
      <span className="text-sky-700">To {list(missing)}, ask an admin.</span>
    </p>
  );
}
