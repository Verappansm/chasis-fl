import "server-only";
import type { Document, Filter } from "mongodb";
import { collections } from "@/lib/db/collections";
import type { CurrentUser } from "@/lib/auth/dal";
import type {
  FinanceDoc,
  IncentiveDoc,
  InsuranceDoc,
  RenewalDoc,
  RenewalStatus,
  VehicleDoc,
} from "@/lib/types";
import { RENEWAL_STATUSES } from "@/lib/types";
import type { FinanceInput, IncentiveInput, InsuranceInput, RenewalInput } from "@/lib/validation/schemas";
import { todayIso } from "@/lib/validation/fields";
import {
  deleteRecord,
  findRecord,
  insertRecord,
  listRecords,
  PAGE_SIZE,
  searchFilter,
  updateRecord,
  writeAudit,
  type Payload,
} from "./base";
import { isDuplicateKey, ValidationError } from "./errors";

export type ReceivedFilter = "all" | "pending" | "received";

function receivedFilter(status: ReceivedFilter): Document {
  if (status === "pending") return { incentiveReceived: false };
  if (status === "received") return { incentiveReceived: true };
  return {};
}

function todayUtc(): Date {
  return new Date(`${todayIso()}T00:00:00.000Z`);
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}

/* ------------------------------------------------------------------ vehicles */

type VehicleDetails = Pick<VehicleDoc, "purchasePrice" | "sellingPrice" | "model" | "customerName">;

async function setVehicleDetails(chassisNumber: string, details: VehicleDetails, user: CurrentUser) {
  const { vehicles } = await collections();
  const before = await vehicles.findOne({ chassisNumber });
  const $set: Record<string, unknown> = { updatedAt: new Date(), updatedBy: user.username };
  const $unset: Record<string, ""> = {};
  let changed = false;
  for (const [k, v] of Object.entries(details) as [keyof VehicleDetails, unknown][]) {
    if (before?.[k] === v) continue;
    changed = true;
    if (v === undefined) $unset[k] = "";
    else $set[k] = v;
  }
  if (!changed) return;
  const after = await vehicles.findOneAndUpdate(
    { chassisNumber },
    { $set, $inc: { version: 1 }, ...(Object.keys($unset).length ? { $unset } : {}) },
    { returnDocument: "after" },
  );
  await writeAudit({ user, action: "update", entity: "vehicle", entityId: after?._id.toHexString(), chassisNumber, before, after });
}

export async function getVehicle(chassisNumber: string) {
  const { vehicles } = await collections();
  return vehicles.findOne({ chassisNumber });
}

/* ------------------------------------------------------------------- finance */

function splitFinance(input: FinanceInput): { finance: Payload<FinanceDoc>; vehicle: VehicleDetails } {
  const { purchasePrice, sellingPrice, model, customerName, ...finance } = input;
  return { finance, vehicle: { purchasePrice, sellingPrice, model, customerName } };
}

export async function createFinance(input: FinanceInput, user: CurrentUser) {
  const { finance } = await collections();
  const split = splitFinance(input);
  try {
    const id = await insertRecord(finance, "finance", split.finance, user);
    await setVehicleDetails(input.chassisNumber, split.vehicle, user);
    return id;
  } catch (err) {
    if (isDuplicateKey(err)) {
      throw new ValidationError("chassisNumber", "A finance case already exists for this chassis. Open it from the list to edit.");
    }
    throw err;
  }
}

export async function updateFinance(id: string, version: number, input: FinanceInput, user: CurrentUser) {
  const { finance } = await collections();
  const split = splitFinance(input);
  await updateRecord(finance, "finance", id, version, split.finance, user);
  await setVehicleDetails(input.chassisNumber, split.vehicle, user);
}

export async function deleteFinance(id: string, version: number, user: CurrentUser) {
  const { finance } = await collections();
  await deleteRecord(finance, "finance", id, version, user);
}

export async function getFinance(id: string) {
  const { finance } = await collections();
  const doc = await findRecord(finance, id);
  if (!doc) return null;
  return { doc, vehicle: await getVehicle(doc.chassisNumber) };
}

export async function listFinance(opts: { q?: string; status: ReceivedFilter; page: number }) {
  const { finance, vehicles } = await collections();
  const filter = { ...searchFilter(opts.q, ["provider"]), ...receivedFilter(opts.status) } as Filter<FinanceDoc>;
  const page = Number.isInteger(opts.page) && opts.page > 0 ? opts.page : 1;
  // One round trip: page of cases joined to their vehicle, plus the total.
  const [row] = await finance
    .aggregate<{ items: (FinanceDoc & { vehicle: VehicleDoc[] })[]; total: { n: number }[] }>([
      { $match: filter },
      {
        $facet: {
          items: [
            { $sort: { initiatedDate: -1, _id: -1 } },
            { $skip: (page - 1) * PAGE_SIZE },
            { $limit: PAGE_SIZE },
            { $lookup: { from: vehicles.collectionName, localField: "chassisNumber", foreignField: "chassisNumber", as: "vehicle" } },
          ],
          total: [{ $count: "n" }],
        },
      },
    ])
    .toArray();
  const total = row?.total[0]?.n ?? 0;
  return {
    items: (row?.items ?? []).map(({ vehicle, ...doc }) => ({ doc: doc as FinanceDoc, vehicle: vehicle[0] as VehicleDoc | undefined })),
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

/* ----------------------------------------------------------------- insurance */

export async function createInsurance(input: InsuranceInput, user: CurrentUser) {
  const { insurance } = await collections();
  try {
    return await insertRecord(insurance, "insurance", input, user);
  } catch (err) {
    if (isDuplicateKey(err)) throw new ValidationError("policyNumber", "This policy number is already recorded for this provider.");
    throw err;
  }
}

export async function updateInsurance(id: string, version: number, input: InsuranceInput, user: CurrentUser) {
  const { insurance } = await collections();
  try {
    await updateRecord(insurance, "insurance", id, version, input, user);
  } catch (err) {
    if (isDuplicateKey(err)) throw new ValidationError("policyNumber", "This policy number is already recorded for this provider.");
    throw err;
  }
}

export async function deleteInsurance(id: string, version: number, user: CurrentUser) {
  const { insurance } = await collections();
  await deleteRecord(insurance, "insurance", id, version, user);
}

export async function getInsurance(id: string) {
  const { insurance } = await collections();
  return findRecord(insurance, id);
}

export async function listInsurance(opts: { q?: string; status: ReceivedFilter; page: number }) {
  const { insurance } = await collections();
  const filter = {
    ...searchFilter(opts.q, ["provider", "policyNumber"]),
    ...receivedFilter(opts.status),
  } as Filter<InsuranceDoc>;
  return listRecords(insurance, filter, { initiatedDate: -1, _id: -1 }, opts.page);
}

/* ---------------------------------------------------------------- incentives */

export async function createIncentive(input: IncentiveInput, user: CurrentUser) {
  const { incentives } = await collections();
  return insertRecord(incentives, "incentive", input, user);
}

export async function updateIncentive(id: string, version: number, input: IncentiveInput, user: CurrentUser) {
  const { incentives } = await collections();
  await updateRecord(incentives, "incentive", id, version, input, user);
}

export async function deleteIncentive(id: string, version: number, user: CurrentUser) {
  const { incentives } = await collections();
  await deleteRecord(incentives, "incentive", id, version, user);
}

export async function getIncentive(id: string) {
  const { incentives } = await collections();
  return findRecord(incentives, id);
}

export async function listIncentives(opts: { q?: string; page: number }) {
  const { incentives } = await collections();
  const filter = searchFilter(opts.q, ["paidTo", "reference"]) as Filter<IncentiveDoc>;
  return listRecords(incentives, filter, { paidDate: -1, _id: -1 }, opts.page);
}

/* ------------------------------------------------------------------ renewals */

export async function createRenewal(input: RenewalInput, user: CurrentUser) {
  const { renewals } = await collections();
  return insertRecord(renewals, "renewal", input, user);
}

export async function updateRenewal(id: string, version: number, input: RenewalInput, user: CurrentUser) {
  const { renewals } = await collections();
  await updateRecord(renewals, "renewal", id, version, input, user);
}

export async function deleteRenewal(id: string, version: number, user: CurrentUser) {
  const { renewals } = await collections();
  await deleteRecord(renewals, "renewal", id, version, user);
}

export async function getRenewal(id: string) {
  const { renewals } = await collections();
  return findRecord(renewals, id);
}

export type RenewalFilter = "open" | RenewalStatus | "all";

export async function listRenewals(opts: { q?: string; status: RenewalFilter; page: number }) {
  const { renewals } = await collections();
  const statusFilter: Document =
    opts.status === "open"
      ? { status: { $in: ["due", "contacted"] } }
      : (RENEWAL_STATUSES as readonly string[]).includes(opts.status)
        ? { status: opts.status }
        : {};
  const filter = { ...searchFilter(opts.q, ["notes"]), ...statusFilter } as Filter<RenewalDoc>;
  return listRecords(renewals, filter, { dueDate: 1, _id: 1 }, opts.page);
}

/**
 * Policies expiring soon that nobody has opened a renewal case for yet and
 * that have not already been superseded by a newer policy on the same chassis.
 */
export async function upcomingExpiries(windowDays = 45) {
  const { insurance, renewals } = await collections();
  const today = todayUtc();
  const expiring = await insurance
    .find({ policyEndDate: { $gte: addDays(today, -15), $lte: addDays(today, windowDays) } })
    .sort({ policyEndDate: 1 })
    .limit(200)
    .toArray();
  if (!expiring.length) return [];

  const chassis = [...new Set(expiring.map((p) => p.chassisNumber))];
  const [cases, newer] = await Promise.all([
    renewals.find({ chassisNumber: { $in: chassis } }, { projection: { chassisNumber: 1, dueDate: 1 } }).toArray(),
    insurance
      .find({ chassisNumber: { $in: chassis } }, { projection: { chassisNumber: 1, policyStartDate: 1, initiatedDate: 1 } })
      .toArray(),
  ]);

  return expiring.filter((p) => {
    const end = p.policyEndDate!;
    const windowStart = addDays(end, -60);
    const hasCase = cases.some((r) => r.chassisNumber === p.chassisNumber && r.dueDate >= windowStart);
    const superseded = newer.some(
      (n) =>
        n.chassisNumber === p.chassisNumber &&
        !n._id.equals(p._id) &&
        (n.policyStartDate ?? n.initiatedDate) >= windowStart,
    );
    return !hasCase && !superseded;
  });
}

/* ------------------------------------------------------------------ overview */

interface ReceivableSummary {
  receivedAmount: number;
  receivedCount: number;
  pendingAmount: number;
  pendingCount: number;
  agedAmount: number;
  agedCount: number;
}

async function receivables(col: "finance" | "insurance", agedBefore: Date): Promise<ReceivableSummary> {
  const c = await collections();
  const coll = c[col] as unknown as import("mongodb").Collection<Document>;
  const [row] = await coll
    .aggregate<ReceivableSummary>([
      {
        $group: {
          _id: null,
          receivedAmount: { $sum: { $cond: ["$incentiveReceived", "$incentiveAmount", 0] } },
          receivedCount: { $sum: { $cond: ["$incentiveReceived", 1, 0] } },
          pendingAmount: { $sum: { $cond: ["$incentiveReceived", 0, "$incentiveAmount"] } },
          pendingCount: { $sum: { $cond: ["$incentiveReceived", 0, 1] } },
          agedAmount: {
            $sum: {
              $cond: [{ $and: [{ $not: ["$incentiveReceived"] }, { $lt: ["$initiatedDate", agedBefore] }] }, "$incentiveAmount", 0],
            },
          },
          agedCount: {
            $sum: { $cond: [{ $and: [{ $not: ["$incentiveReceived"] }, { $lt: ["$initiatedDate", agedBefore] }] }, 1, 0] },
          },
        },
      },
    ])
    .toArray();
  return row ?? { receivedAmount: 0, receivedCount: 0, pendingAmount: 0, pendingCount: 0, agedAmount: 0, agedCount: 0 };
}

export const AGEING_DAYS = 60;

export async function overviewStats() {
  const c = await collections();
  const today = todayUtc();
  const agedBefore = addDays(today, -AGEING_DAYS);
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));

  const [vehicleRow, finance, insurance, premiumRow, payoutRow, renewalRow, pendingByProvider, recent, expiring] =
    await Promise.all([
      c.vehicles
        .aggregate<{ count: number; purchase: number; selling: number; margin: number; priced: number }>([
          {
            $group: {
              _id: null,
              count: { $sum: 1 },
              purchase: { $sum: { $ifNull: ["$purchasePrice", 0] } },
              selling: { $sum: { $ifNull: ["$sellingPrice", 0] } },
              margin: {
                $sum: {
                  $cond: [
                    { $and: [{ $isNumber: "$purchasePrice" }, { $isNumber: "$sellingPrice" }] },
                    { $subtract: ["$sellingPrice", "$purchasePrice"] },
                    0,
                  ],
                },
              },
              priced: {
                $sum: { $cond: [{ $and: [{ $isNumber: "$purchasePrice" }, { $isNumber: "$sellingPrice" }] }, 1, 0] },
              },
            },
          },
        ])
        .toArray(),
      receivables("finance", agedBefore),
      receivables("insurance", agedBefore),
      c.insurance.aggregate<{ premium: number; count: number }>([
        { $group: { _id: null, premium: { $sum: "$premiumAmount" }, count: { $sum: 1 } } },
      ]).toArray(),
      c.incentives
        .aggregate<{ total: number; count: number; thisMonth: number }>([
          {
            $group: {
              _id: null,
              total: { $sum: "$amount" },
              count: { $sum: 1 },
              thisMonth: { $sum: { $cond: [{ $gte: ["$paidDate", monthStart] }, "$amount", 0] } },
            },
          },
        ])
        .toArray(),
      c.renewals
        .aggregate<{ dueSoon: number; overdue: number }>([
          { $match: { status: { $in: ["due", "contacted"] } } },
          {
            $group: {
              _id: null,
              dueSoon: { $sum: { $cond: [{ $and: [{ $gte: ["$dueDate", today] }, { $lte: ["$dueDate", addDays(today, 30)] }] }, 1, 0] } },
              overdue: { $sum: { $cond: [{ $lt: ["$dueDate", today] }, 1, 0] } },
            },
          },
        ])
        .toArray(),
      c.finance
        .aggregate<{ _id: { source: string; provider: string }; amount: number; count: number }>([
          { $match: { incentiveReceived: false } },
          { $project: { provider: 1, incentiveAmount: 1, source: { $literal: "Finance" } } },
          {
            $unionWith: {
              coll: "insurance",
              pipeline: [
                { $match: { incentiveReceived: false } },
                { $project: { provider: 1, incentiveAmount: 1, source: { $literal: "Insurance" } } },
              ],
            },
          },
          { $group: { _id: { source: "$source", provider: "$provider" }, amount: { $sum: "$incentiveAmount" }, count: { $sum: 1 } } },
          { $sort: { amount: -1 } },
          { $limit: 8 },
        ])
        .toArray(),
      c.auditLogs
        .find({ entity: { $ne: "auth" } }, { projection: { before: 0, after: 0 } })
        .sort({ at: -1 })
        .limit(8)
        .toArray(),
      upcomingExpiries(30),
    ]);

  const v = vehicleRow[0] ?? { count: 0, purchase: 0, selling: 0, margin: 0, priced: 0 };
  const payouts = payoutRow[0] ?? { total: 0, count: 0, thisMonth: 0 };
  const renewals = renewalRow[0] ?? { dueSoon: 0, overdue: 0 };

  return {
    vehicles: v,
    finance,
    insurance: { ...insurance, premium: premiumRow[0]?.premium ?? 0, policies: premiumRow[0]?.count ?? 0 },
    payouts,
    netIncentive: finance.receivedAmount + insurance.receivedAmount - payouts.total,
    renewals: { ...renewals, unopenedExpiries: expiring.length },
    pendingByProvider,
    recent,
  };
}
