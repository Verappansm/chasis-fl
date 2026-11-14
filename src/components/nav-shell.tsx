"use client";

import { useEffect, useState, type ReactNode } from "react";

/** Sidebar on large screens; a top bar with a menu button below that. Closes when a link in it is followed. */
export function NavShell({ brand, children }: { brand: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  // The guided tour opens the menu when a step points at a menu item.
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener("chasis:open-nav", show);
    return () => window.removeEventListener("chasis:open-nav", show);
  }, []);
  return (
    <>
      <div className="flex items-center justify-between gap-3 px-4 py-3 lg:px-5 lg:pb-6 lg:pt-6">
        {brand}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="app-nav"
          className="grid size-9 place-items-center rounded-lg text-slate-300 hover:bg-white/10 hover:text-white lg:hidden"
        >
          <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" className="size-5" aria-hidden>
            {open ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </div>
      <div
        id="app-nav"
        onClickCapture={(e) => {
          if ((e.target as HTMLElement).closest("a")) setOpen(false);
        }}
        className={`${open ? "flex" : "hidden"} max-h-[calc(100dvh-3.75rem)] min-h-0 flex-1 flex-col overflow-y-auto border-t border-white/5 lg:flex lg:max-h-none lg:overflow-visible lg:border-0`}
      >
        {children}
      </div>
    </>
  );
}
