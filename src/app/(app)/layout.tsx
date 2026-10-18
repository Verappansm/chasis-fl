import { Suspense } from "react";
import Link from "next/link";
import { NavLinks, NavSkeleton, type NavItem } from "@/components/nav-links";
import { getCurrentUser } from "@/lib/auth/dal";
import { MODULES, ROLE_LABELS, can } from "@/lib/permissions";
import { logout } from "@/app/login/actions";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <aside className="flex shrink-0 flex-col bg-slate-900 lg:sticky lg:top-0 lg:h-screen lg:w-60">
        <div className="flex items-center gap-2.5 px-6 py-5">
          <div className="grid size-8 place-items-center rounded-lg bg-indigo-500 text-sm font-bold text-white">C</div>
          <div>
            <p className="text-sm font-semibold text-white">Chasis ERP</p>
            <p className="text-xs text-slate-400">F&amp;I desk</p>
          </div>
        </div>
        <div className="pb-3 lg:flex-1">
          <Suspense fallback={<NavSkeleton />}>
            <SideNav />
          </Suspense>
        </div>
        <div className="border-t border-white/10 px-4 py-3 lg:p-4">
          <Suspense fallback={<div className="h-9" />}>
            <UserBox />
          </Suspense>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 lg:py-8">
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>
    </div>
  );
}

/** Only shows what the user may open; pages enforce the same rules server-side. */
async function SideNav() {
  const user = await getCurrentUser();
  if (!user) return null;
  const items: NavItem[] = [
    ...(can(user, "overview:view") ? [{ href: "/overview", label: "Overview" }] : []),
    ...MODULES.filter((m) => can(user, `${m.key}:view`)).map((m) => ({ href: m.href, label: m.label })),
    ...(user.role === "admin" ? [{ href: "/admin/users", label: "Users" }] : []),
  ];
  return <NavLinks items={items} />;
}

async function UserBox() {
  const user = await getCurrentUser();
  if (!user) return null;
  return (
    <div className="flex items-center justify-between gap-2">
      <Link href="/account" className="min-w-0 rounded-md px-1 hover:bg-white/5" title="My account">
        <p className="truncate text-sm font-medium text-white">{user.username}</p>
        <p className="text-xs text-slate-400">{ROLE_LABELS[user.role]} · My account</p>
      </Link>
      <form action={logout}>
        <button type="submit" className="rounded-md px-2 py-1 text-xs font-medium text-slate-300 hover:bg-white/10 hover:text-white">
          Sign out
        </button>
      </form>
    </div>
  );
}
