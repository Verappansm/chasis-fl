"use client";

import { useRouter } from "next/navigation";

/** Rows-per-page picker; each option carries its own URL (filters kept, back to page 1). */
export function PageSizeSelect({ value, options }: { value: string; options: { value: string; label: string; href: string }[] }) {
  const router = useRouter();
  return (
    <label className="flex shrink-0 items-center gap-2 self-end text-xs font-medium text-slate-500 sm:self-auto">
      Show
      <select
        value={value}
        onChange={(e) => {
          const hit = options.find((o) => o.value === e.target.value);
          if (hit) router.push(hit.href, { scroll: false });
        }}
        className="rounded-lg border border-slate-200 bg-white py-1.5 pl-2.5 pr-8 text-sm font-normal text-slate-900 shadow-xs outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/15"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
