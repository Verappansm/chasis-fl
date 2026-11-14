import { todayIso } from "@/lib/validation/fields";

/** Reporting periods for the overview and list filters, in IST calendar terms. */
export const PERIODS = [
  { value: "month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "fy", label: "This FY" },
  { value: "all", label: "All time" },
] as const;
export type Period = (typeof PERIODS)[number]["value"];

export function parsePeriod(raw: string | undefined, fallback: Period = "all"): Period {
  return PERIODS.some((p) => p.value === raw) ? (raw as Period) : fallback;
}

/** Half-open range [from, to) of UTC calendar dates; undefined bounds are open. */
export function periodRange(p: Period): { from?: Date; to?: Date } {
  const [y, m] = todayIso().split("-").map(Number);
  const utc = (year: number, month0: number) => new Date(Date.UTC(year, month0, 1));
  switch (p) {
    case "month":
      return { from: utc(y, m - 1), to: utc(y, m) };
    case "last_month":
      return { from: utc(y, m - 2), to: utc(y, m - 1) };
    case "fy": {
      // Indian financial year: 1 April to 31 March.
      const start = m >= 4 ? y : y - 1;
      return { from: utc(start, 3), to: utc(start + 1, 3) };
    }
    default:
      return {};
  }
}

/** Mongo filter for `field` inside the period ({} for all time). */
export function periodFilter(field: string, p: Period): Record<string, unknown> {
  const { from, to } = periodRange(p);
  if (!from && !to) return {};
  return { [field]: { ...(from ? { $gte: from } : {}), ...(to ? { $lt: to } : {}) } };
}
