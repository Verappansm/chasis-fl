/**
 * Admin-managed choices for form fields. Shared by server (validation) and
 * client (rendering a drop-down or a text box with suggestions).
 */
import { PURCHASE_TYPES, PURCHASE_TYPE_LABELS } from "@/lib/types";

export const OPTION_LISTS = [
  { key: "purchaseType", label: "Purchase type", usedIn: "Purchase → Type" },
  { key: "location", label: "Location", usedIn: "Purchase → Location" },
  { key: "carClass", label: "Class", usedIn: "Purchase → Class" },
  { key: "model", label: "Model", usedIn: "Purchase → Model" },
  { key: "financeProvider", label: "Finance provider", usedIn: "Finance payout → Provider" },
  { key: "insuranceProvider", label: "Insurance provider", usedIn: "Insurance payout → Provider (renewals pick it up)" },
  { key: "preownedMake", label: "Pre-owned make", usedIn: "Pre-owned → Make" },
] as const;
export type OptionListKey = (typeof OPTION_LISTS)[number]["key"];
export const OPTION_LIST_KEYS = OPTION_LISTS.map((l) => l.key) as OptionListKey[];

export type OptionMode = "text" | "dropdown";
export interface OptionList {
  mode: OptionMode;
  /** For purchaseType: extra types only (the built-ins are always available). */
  options: string[];
  version: number;
}
export type OptionLists = Record<OptionListKey, OptionList>;

export function isOptionListKey(k: string): k is OptionListKey {
  return (OPTION_LIST_KEYS as string[]).includes(k);
}

/** Before an admin saves anything: type stays a drop-down, everything else free text. */
export function defaultOptionList(key: OptionListKey): OptionList {
  return { mode: key === "purchaseType" ? "dropdown" : "text", options: [], version: 0 };
}

export interface Choice {
  value: string;
  label: string;
}

/** What a field offers. Purchase types always start with the built-ins. */
export function choicesFor(key: OptionListKey, list: OptionList): Choice[] {
  const extra = list.options.map((o) => ({ value: o, label: o }));
  if (key !== "purchaseType") return extra;
  return [...PURCHASE_TYPES.map((t) => ({ value: t, label: PURCHASE_TYPE_LABELS[t] })), ...extra];
}

/** Cleans an admin's list: trimmed, single spaces, no blanks, no case-insensitive duplicates. */
export function cleanOptions(raw: readonly string[], max = 200): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of raw) {
    const v = r.trim().replace(/\s+/g, " ").slice(0, 120);
    const k = v.toLowerCase();
    if (!v || seen.has(k)) continue;
    seen.add(k);
    out.push(v);
    if (out.length >= max) break;
  }
  return out;
}
