import "server-only";
import { cache } from "react";
import { collections } from "@/lib/db/collections";
import type { CurrentUser } from "@/lib/auth/dal";
import { DEFAULT_RATES, type Rates } from "@/lib/calc";
import type { SettingsInput } from "@/lib/validation/schemas";
import { writeAudit } from "./base";
import { ConflictError } from "./errors";

const STALE = "Someone else changed the constants after you opened them. Reload and try again.";

/** Current constants (defaults until an admin saves them). Memoised per request. */
export const getSettings = cache(async (): Promise<Rates & { version: number }> => {
  const { settings } = await collections();
  const doc = await settings.findOne({ _id: "rates" });
  // Before per-stream TDS there was one rate for every payer.
  const legacyTds = doc?.tdsRateBp;
  return {
    fcRateBp: doc?.fcRateBp ?? DEFAULT_RATES.fcRateBp,
    purchaseGstRateBp: doc?.purchaseGstRateBp ?? DEFAULT_RATES.purchaseGstRateBp,
    evPurchaseGstRateBp: doc?.evPurchaseGstRateBp ?? DEFAULT_RATES.evPurchaseGstRateBp,
    saleGstRateBp: doc?.saleGstRateBp ?? DEFAULT_RATES.saleGstRateBp,
    serviceGstRateBp: doc?.serviceGstRateBp ?? DEFAULT_RATES.serviceGstRateBp,
    fcTdsRateBp: doc?.fcTdsRateBp ?? legacyTds ?? DEFAULT_RATES.fcTdsRateBp,
    financeTdsRateBp: doc?.financeTdsRateBp ?? legacyTds ?? DEFAULT_RATES.financeTdsRateBp,
    insuranceTdsRateBp: doc?.insuranceTdsRateBp ?? legacyTds ?? DEFAULT_RATES.insuranceTdsRateBp,
    demoLockInDays: doc?.demoLockInDays ?? DEFAULT_RATES.demoLockInDays,
    version: doc?.version ?? 0,
  };
});

export async function updateSettings(expectedVersion: number, input: SettingsInput, user: CurrentUser) {
  const { settings } = await collections();
  const before = await settings.findOne({ _id: "rates" });
  if ((before?.version ?? 0) !== expectedVersion) throw new ConflictError(STALE);
  let written = false;
  try {
    const r = await settings.updateOne(
      { _id: "rates", ...(expectedVersion === 0 ? { version: { $exists: false } } : { version: expectedVersion }) },
      {
        $set: { ...input, version: expectedVersion + 1, updatedAt: new Date(), updatedBy: user.username },
        $unset: { tdsRateBp: "" },
      },
      { upsert: expectedVersion === 0 },
    );
    written = r.matchedCount > 0 || r.upsertedCount > 0;
  } catch {
    // Upsert raced with another admin's first save (duplicate _id).
  }
  if (!written) throw new ConflictError(STALE);
  await writeAudit({ user, action: "update", entity: "settings", entityId: "rates", ref: "Rates", before, after: input });
}
