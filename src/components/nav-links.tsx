"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface NavItem {
  href: string;
  label: string;
}

const ICONS: Record<string, string> = {
  "/overview": "M3 13h8V3H3v10Zm0 8h8v-6H3v6Zm10 0h8V11h-8v10Zm0-18v6h8V3h-8Z",
  "/finance": "M3 21h18M5 21V10m4 11V10m6 11V10m4 11V10M12 3 2 8h20L12 3Z",
  "/insurance": "M12 3 4 6v6c0 5 3.4 8.3 8 9 4.6-.7 8-4 8-9V6l-8-3Z",
  "/renewals": "M4 4v6h6M20 20v-6h-6M5.6 15a7 7 0 0 0 12.3 2M18.4 9A7 7 0 0 0 6.1 7",
  "/incentives": "M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
  "/admin/users": "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
};

/** Items are already filtered to what the user may see (server side). */
export function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto px-3 lg:flex-col lg:overflow-visible" aria-label="Main">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            data-tour={`nav-${item.href.slice(1).replaceAll("/", "-")}`}
            aria-current={active ? "page" : undefined}
            className={`flex shrink-0 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
              active ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/5 hover:text-white"
            }`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden>
              <path d={ICONS[item.href]} />
            </svg>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function NavSkeleton() {
  return (
    <div className="flex gap-1 px-3 lg:flex-col" aria-hidden>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-9 w-28 shrink-0 animate-pulse rounded-lg bg-white/5 lg:w-auto" />
      ))}
    </div>
  );
}
