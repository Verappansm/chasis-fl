import "server-only";
import { cache } from "react";
import { collections } from "@/lib/db/collections";
import type { CurrentUser } from "@/lib/auth/dal";
import {
  OPTION_LISTS,
  OPTION_LIST_KEYS,
  cleanOptions,
  defaultOptionList,
  type OptionListKey,
  type OptionLists,
  type OptionMode,
} from "@/lib/options";
import { PURCHASE_TYPES, PURCHASE_TYPE_LABELS, normalizePurchaseType } from "@/lib/types";
import { writeAudit } from "./base";
import { ConflictError, ValidationError } from "./errors";

/** Every option list (defaults where an admin has not saved one). Memoised per request. */
export const getOptionLists = cache(async (): Promise<OptionLists> => {
  const { optionLists } = await collections();
  const docs = await optionLists.find({ _id: { $in: OPTION_LIST_KEYS } }).toArray();
  const out = Object.fromEntries(OPTION_LIST_KEYS.map((k) => [k, defaultOptionList(k)])) as OptionLists;
  for (const d of docs) out[d._id as OptionListKey] = { mode: d.mode, options: d.options, version: d.version };
  return out;
});

export async function updateOptionList(
  key: OptionListKey,
  expectedVersion: number,
  input: { mode: OptionMode; options: string[] },
  user: CurrentUser,
) {
  const { optionLists } = await collections();
  let options = cleanOptions(input.options);
  // Built-in types are always available; never store them as extras.
  if (key === "purchaseType") {
    const builtin = new Set<string>([...PURCHASE_TYPES, ...PURCHASE_TYPES.map((t) => PURCHASE_TYPE_LABELS[t].toLowerCase())]);
    options = options.filter((o) => !builtin.has(o.toLowerCase()));
  }
  if (input.mode === "dropdown" && key !== "purchaseType" && options.length === 0) {
    throw new ValidationError("options", "Add at least one option before switching to a drop-down.");
  }
  const before = await optionLists.findOne({ _id: key });
  if ((before?.version ?? 0) !== expectedVersion) {
    throw new ConflictError("Someone else changed this list after you opened it. Reload and try again.");
  }
  const now = new Date();
  let written = false;
  try {
    const r = await optionLists.updateOne(
      { _id: key, ...(expectedVersion === 0 ? { version: { $exists: false } } : { version: expectedVersion }) },
      { $set: { mode: input.mode, options, updatedAt: now, updatedBy: user.username, version: expectedVersion + 1 } },
      { upsert: expectedVersion === 0 },
    );
    written = r.matchedCount > 0 || r.upsertedCount > 0;
  } catch {
    // First save raced with another admin's.
  }
  if (!written) throw new ConflictError("Someone else changed this list after you opened it. Reload and try again.");
  const label = OPTION_LISTS.find((l) => l.key === key)!.label;
  await writeAudit({
    user,
    action: "update",
    entity: "options",
    entityId: key,
    ref: label,
    before: before ? { mode: before.mode, options: before.options } : undefined,
    after: { mode: input.mode, options },
  });
}

/** Values already used in the records, to help an admin build a list. */
export async function usedValues(): Promise<Record<OptionListKey, string[]>> {
  const c = await collections();
  const [types, locations, classes, models, fin, ins, ren, makes] = await Promise.all([
    c.purchases.distinct("type"),
    c.purchases.distinct("location"),
    c.purchases.distinct("carClass"),
    c.purchases.distinct("model"),
    c.finance.distinct("provider"),
    c.insurance.distinct("provider"),
    c.renewals.distinct("provider"),
    c.preowned.distinct("make"),
  ]);
  const sorted = (xs: unknown[]) => [...new Set(xs.filter((x): x is string => typeof x === "string" && x.length > 0))].sort();
  return {
    purchaseType: sorted(types).filter((t) => !(PURCHASE_TYPES as readonly string[]).includes(t)),
    location: sorted(locations),
    carClass: sorted(classes),
    model: sorted(models),
    financeProvider: sorted(fin),
    insuranceProvider: sorted([...ins, ...ren]),
    preownedMake: sorted(makes),
  };
}

/**
 * Applies a list to a submitted value. In drop-down mode the value must be
 * one of the options, unless it is what the record already had (so records
 * created before the list existed can still be edited). In either mode a
 * case-insensitive match is stored with the list's spelling.
 */
export function applyOption(
  lists: OptionLists,
  key: OptionListKey,
  value: string,
  field: string,
  label: string,
  existingValue?: string,
): string {
  const list = lists[key];
  const match = list.options.find((o) => o.toLowerCase() === value.toLowerCase());
  if (match) return match;
  if (list.mode === "dropdown" && value !== existingValue) {
    throw new ValidationError(field, `Choose a ${label.toLowerCase()} from the list. An admin can add options under Constants.`);
  }
  return value;
}

/** Purchase type: built-ins always allowed; extra types follow the list. */
export function applyPurchaseType(lists: OptionLists, raw: string, existingValue?: string): string {
  const t = normalizePurchaseType(raw);
  if ((PURCHASE_TYPES as readonly string[]).includes(t)) return t;
  return applyOption(lists, "purchaseType", t, "type", "Type", existingValue);
}
