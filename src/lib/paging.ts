/** Rows per page on the list pages. "All" is capped so one request stays bounded. */
export const PAGE_SIZE_OPTIONS = [
  { value: "50", label: "50 rows" },
  { value: "100", label: "100 rows" },
  { value: "200", label: "200 rows" },
  { value: "all", label: "All rows" },
] as const;
export type PageSizeValue = (typeof PAGE_SIZE_OPTIONS)[number]["value"];

export const DEFAULT_PAGE_SIZE = 50;
export const ALL_ROWS_LIMIT = 5000;

export function parsePageSize(raw: string | undefined): { value: PageSizeValue; size: number } {
  if (raw === "all") return { value: "all", size: ALL_ROWS_LIMIT };
  const hit = PAGE_SIZE_OPTIONS.find((o) => o.value === raw);
  return hit ? { value: hit.value, size: Number(hit.value) } : { value: "50", size: DEFAULT_PAGE_SIZE };
}
