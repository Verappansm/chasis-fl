"use client";

import { useSyncExternalStore } from "react";
import { formatDay, formatMonth } from "@/lib/format";

/**
 * Dates show as dd-mm-yyyy; clicking any date switches every date on the page
 * to Mmm-yy (e.g. Apr-26) and back. The choice is remembered per browser.
 */
type Mode = "day" | "month";
const KEY = "chasis.dateMode";
const listeners = new Set<() => void>();
let mode: Mode | null = null;

function read(): Mode {
  if (mode) return mode;
  try {
    mode = localStorage.getItem(KEY) === "month" ? "month" : "day";
  } catch {
    mode = "day";
  }
  return mode;
}

function toggle() {
  mode = read() === "day" ? "month" : "day";
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    // Storage blocked: the toggle still works for this page view.
  }
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** `iso` is yyyy-mm-dd (or empty). */
export function DateText({ iso }: { iso?: string }) {
  const current = useSyncExternalStore(subscribe, read, () => "day" as Mode);
  if (!iso) return <>—</>;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle();
      }}
      title="Click to switch date format"
      className="tabular-nums decoration-dotted underline-offset-2 hover:underline"
    >
      {current === "month" ? formatMonth(iso) : formatDay(iso)}
    </button>
  );
}
