import { Suspense } from "react";
import Link from "next/link";
import { NavLinks, NavSkeleton, type NavItem } from "@/components/nav-links";
import { getCurrentUser } from "@/lib/auth/dal";
import { MODULES, ROLE_LABELS, can } from "@/lib/permissions";
import { logout } from "@/app/login/actions";
import { TourConfig, TourLauncher, TourProvider } from "@/components/tour";
import { NavShell } from "@/components/nav-shell";
import { tourStepsFor } from "@/lib/tour-steps";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <TourProvider>
      <div className="flex min-h-screen flex-col lg:flex-row">
        <aside className="sticky top-0 z-30 flex shrink-0 flex-col bg-[#0b0f17] lg:h-screen lg:w-60">
          <NavShell brand={<Brand />}>
            <div className="min-h-0 flex-1 overflow-y-auto py-2 lg:py-0">
              <Suspense fallback={<NavSkeleton />}>
                <SideNav />
              </Suspense>
            </div>
            <div className="px-3 pb-2 pt-2">
              <TourLauncher />
            </div>
            <div className="border-t border-white/[0.07] px-4 py-3 lg:p-4">
              <Suspense fallback={<div className="h-9" />}>
                <UserBox />
              </Suspense>
            </div>
          </NavShell>
        </aside>
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-9">
          <div className="mx-auto max-w-[1400px]">{children}</div>
        </main>
      </div>
      <Suspense fallback={null}>
        <TourBoot />
      </Suspense>
    </TourProvider>
  );
}

function Brand() {
  return (
    <Link href="/overview" className="flex min-w-0 items-center gap-3 rounded-md">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-gradient-to-b from-white to-slate-300 text-[13px] font-semibold tracking-tight text-slate-900 shadow-sm">
        VT
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-sm font-semibold tracking-tight text-white">Chasis ERP</span>
        <span className="block truncate text-[11px] text-slate-400">VST Titanium Motors</span>
      </span>
    </Link>
  );
}

/** Hands the tour the steps this user may see; auto-starts on first visit. */
async function TourBoot() {
  const user = await getCurrentUser();
  if (!user) return null;
  return <TourConfig steps={tourStepsFor(user)} autoStart={!user.tourDone} />;
}

/** Only shows what the user may open; pages enforce the same rules server-side. */
async function SideNav() {
  const user = await getCurrentUser();
  if (!user) return null;
  const items: NavItem[] = [
    ...(can(user, "overview:view") ? [{ href: "/overview", label: "Overview" }] : []),
    ...MODULES.filter((m) => can(user, `${m.key}:view`)).flatMap((m) =>
      // Demo stock is a view of demo purchases, right under Purchase.
      m.key === "purchases" ? [{ href: m.href, label: m.label }, { href: "/demo", label: "Demo stock" }] : [{ href: m.href, label: m.label }],
    ),
    ...(user.role === "admin"
      ? [
          { href: "/admin/users", label: "Users" },
          { href: "/admin/activity", label: "Activity log" },
          { href: "/admin/settings", label: "Constants" },
        ]
      : []),
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
      <div className="flex items-center gap-1">
        <form action={logout}>
          <button
            type="submit"
            className="rounded-md px-2 py-1 text-xs font-medium text-slate-300 hover:bg-white/10 hover:text-white"
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
