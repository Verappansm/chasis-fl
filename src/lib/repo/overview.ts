import "server-only";
import type { Collection, Document } from "mongodb";
import { collections } from "@/lib/db/collections";
import { CLAIM_STAGES, type ClaimStage } from "@/lib/types";
import { addDays } from "@/lib/calc";
import { periodFilter, type Period } from "@/lib/periods";
import { AGEING_DAYS, todayUtc, upcomingExpiries } from "./modules";
import { lastMonths } from "./demo";

export interface StageBucket {
  count: number;
  /** Sum of claimTotal (amount invoiced or to be invoiced, incl. GST). */
  total: number;
  received: number;
  tds: number;
  balance: number;
}

export interface Pipeline {
  stages: Record<Exclude<ClaimStage, "na">, StageBucket>;
  all: StageBucket;
  /** Billed, not collected, invoice older than AGEING_DAYS. */
  aged: { count: number; total: number };
}

const empty = (): StageBucket => ({ count: 0, total: 0, received: 0, tds: 0, balance: 0 });

/** Count and amounts per stage of the invoice → receipt loop, within a period. */
async function pipeline(col: Collection<Document>, dateField: string, period: Period, agedBefore: Date): Promise<Pipeline> {
  const rows = await col
    .aggregate<{ _id: ClaimStage; count: number; total: number; received: number; tds: number; balance: number; agedCount: number; agedTotal: number }>([
      { $match: { stage: { $in: [...CLAIM_STAGES] }, ...periodFilter(dateField, period) } },
      {
        $group: {
          _id: "$stage",
          count: { $sum: 1 },
          total: { $sum: "$claimTotal" },
          received: { $sum: { $ifNull: ["$receivedAmount", 0] } },
          tds: { $sum: { $ifNull: ["$tdsAmount", 0] } },
          balance: { $sum: { $ifNull: ["$balance", 0] } },
          agedCount: { $sum: { $cond: [{ $and: [{ $eq: ["$stage", "billed"] }, { $lt: ["$invoiceDate", agedBefore] }] }, 1, 0] } },
          agedTotal: {
            $sum: { $cond: [{ $and: [{ $eq: ["$stage", "billed"] }, { $lt: ["$invoiceDate", agedBefore] }] }, "$claimTotal", 0] },
          },
        },
      },
    ])
    .toArray();

  const stages = Object.fromEntries(CLAIM_STAGES.map((s) => [s, empty()])) as Pipeline["stages"];
  const all = empty();
  const aged = { count: 0, total: 0 };
  for (const r of rows) {
    if (r._id === "na") continue;
    stages[r._id] = { count: r.count, total: r.total, received: r.received, tds: r.tds, balance: r.balance };
    for (const k of ["count", "total", "received", "tds", "balance"] as const) all[k] += r[k];
    aged.count += r.agedCount;
    aged.total += r.agedTotal;
  }
  return { stages, all, aged };
}

export async function overviewStats(period: Period) {
  const c = await collections();
  const today = todayUtc();
  const agedBefore = addDays(today, -AGEING_DAYS);
  const raw = <T extends Document>(x: Collection<T>) => x as unknown as Collection<Document>;

  const [fc, finance, insurance, renewals, purchasesByType, stock, preownedStock, preownedSold, expiring, recent] = await Promise.all([
    pipeline(raw(c.purchases), "purchaseDate", period, agedBefore),
    pipeline(raw(c.finance), "disbursalDate", period, agedBefore),
    pipeline(raw(c.insurance), "policyStartDate", period, agedBefore),
    pipeline(raw(c.renewals), "policyStartDate", period, agedBefore),
    c.purchases
      .aggregate<{ _id: string; count: number }>([
        { $match: periodFilter("purchaseDate", period) },
        { $group: { _id: "$type", count: { $sum: 1 } } },
      ])
      .toArray(),
    // Stock is "right now", regardless of period.
    c.purchases
      .aggregate<{ locked: number; deflected: number; otherUnsold: number }>([
        { $match: { type: { $ne: "new" }, saleDate: { $exists: false } } },
        {
          $group: {
            _id: null,
            locked: { $sum: { $cond: [{ $and: [{ $eq: ["$type", "demo"] }, { $gt: ["$deflectDate", today] }] }, 1, 0] } },
            deflected: { $sum: { $cond: [{ $and: [{ $eq: ["$type", "demo"] }, { $lte: ["$deflectDate", today] }] }, 1, 0] } },
            otherUnsold: { $sum: { $cond: [{ $ne: ["$type", "demo"] }, 1, 0] } },
          },
        },
      ])
      .toArray(),
    c.preowned.countDocuments({ saleDate: { $exists: false } }),
    c.preowned.countDocuments({ saleDate: { $exists: true }, ...periodFilter("saleDate", period) }),
    upcomingExpiries(30),
    c.auditLogs
      .find({ entity: { $nin: ["auth", "settings", "options", "access"] } }, { projection: { before: 0, after: 0 } })
      .sort({ at: -1 })
      .limit(8)
      .toArray(),
  ]);

  return {
    fc,
    finance,
    insurance,
    renewals,
    purchasesByType: Object.fromEntries(purchasesByType.map((r) => [r._id, r.count])) as Record<string, number>,
    stock: stock[0] ?? { locked: 0, deflected: 0, otherUnsold: 0 },
    preowned: { inStock: preownedStock, soldInPeriod: preownedSold },
    expiringSoon: expiring.length,
    recent,
  };
}

/* ------------------------------------------------------------------ charts */

export type StreamKey = "purchases" | "finance" | "insurance" | "renewals";
const STREAM_DATE: Record<StreamKey, string> = {
  purchases: "purchaseDate",
  finance: "disbursalDate",
  insurance: "policyStartDate",
  renewals: "policyStartDate",
};

export interface StreamTrend {
  /** Invoiced (claimTotal) by invoice month. */
  invoiced: Record<string, number>;
  /** Received by receipt month. */
  collected: Record<string, number>;
}

/** Outstanding on raised invoices, by invoice age. */
export const AGE_BUCKETS = [
  { label: "0–30 days", max: 30 },
  { label: "31–60 days", max: 60 },
  { label: "61–90 days", max: 90 },
  { label: "Over 90 days", max: Infinity },
] as const;

export interface StreamCharts {
  trend: StreamTrend;
  ageing: number[];
  /** Average days from invoice to first receipt, for receipts in the period. */
  avgDaysToCollect: number | null;
  /** Invoiced amount by provider in the period (payouts only). */
  providers: { provider: string; total: number; count: number }[];
}

async function streamCharts(col: Collection<Document>, key: StreamKey, period: Period, since: Date, today: Date): Promise<StreamCharts> {
  const monthOf = (field: string) => ({ $dateToString: { format: "%Y-%m", date: field } });
  const [invoiced, collected, ageing, speed, providers] = await Promise.all([
    col
      .aggregate<{ _id: string; total: number }>([
        { $match: { invoiceDate: { $gte: since } } },
        { $group: { _id: monthOf("$invoiceDate"), total: { $sum: "$claimTotal" } } },
      ])
      .toArray(),
    col
      .aggregate<{ _id: string; total: number }>([
        { $match: { receiptDate: { $exists: true } } },
        {
          $project: {
            r: { $ifNull: ["$receipts", [{ receiptDate: "$receiptDate", receivedAmount: "$receivedAmount" }]] },
          },
        },
        { $unwind: "$r" },
        { $match: { "r.receiptDate": { $gte: since } } },
        { $group: { _id: monthOf("$r.receiptDate"), total: { $sum: "$r.receivedAmount" } } },
      ])
      .toArray(),
    col
      .aggregate<{ _id: number; total: number }>([
        { $match: { stage: { $in: ["billed", "short_paid"] } } },
        {
          $project: {
            age: { $divide: [{ $subtract: [today, "$invoiceDate"] }, 86_400_000] },
            due: { $cond: [{ $eq: ["$stage", "billed"] }, "$claimTotal", "$balance"] },
          },
        },
        {
          $group: {
            _id: { $switch: { branches: [{ case: { $lte: ["$age", 30] }, then: 0 }, { case: { $lte: ["$age", 60] }, then: 1 }, { case: { $lte: ["$age", 90] }, then: 2 }], default: 3 } },
            total: { $sum: "$due" },
          },
        },
      ])
      .toArray(),
    col
      .aggregate<{ avg: number }>([
        { $match: { receiptDate: { $exists: true }, invoiceDate: { $exists: true }, ...periodFilter("receiptDate", period) } },
        {
          $project: {
            first: { $ifNull: [{ $min: "$receipts.receiptDate" }, "$receiptDate"] },
            invoiceDate: 1,
          },
        },
        { $group: { _id: null, avg: { $avg: { $divide: [{ $subtract: ["$first", "$invoiceDate"] }, 86_400_000] } } } },
      ])
      .toArray(),
    key === "purchases"
      ? Promise.resolve([])
      : col
          .aggregate<{ _id: string; total: number; count: number }>([
            { $match: periodFilter(STREAM_DATE[key], period) },
            { $group: { _id: "$provider", total: { $sum: "$claimTotal" }, count: { $sum: 1 } } },
            { $sort: { total: -1 } },
            { $limit: 6 },
          ])
          .toArray(),
  ]);
  const buckets = [0, 0, 0, 0];
  for (const r of ageing) buckets[r._id] = r.total;
  return {
    trend: {
      invoiced: Object.fromEntries(invoiced.map((r) => [r._id, r.total])),
      collected: Object.fromEntries(collected.map((r) => [r._id, r.total])),
    },
    ageing: buckets,
    avgDaysToCollect: speed[0] ? Math.round(speed[0].avg) : null,
    providers: providers.map((p) => ({ provider: p._id, total: p.total, count: p.count })),
  };
}

/** Chart data for the overview; months are the last 12 calendar months. */
export async function overviewCharts(period: Period) {
  const c = await collections();
  const today = todayUtc();
  const months = lastMonths(today);
  const since = months[0].start;
  const raw = <T extends Document>(x: Collection<T>) => x as unknown as Collection<Document>;
  const [purchases, finance, insurance, renewals, carsByMonth, demo] = await Promise.all([
    streamCharts(raw(c.purchases), "purchases", period, since, today),
    streamCharts(raw(c.finance), "finance", period, since, today),
    streamCharts(raw(c.insurance), "insurance", period, since, today),
    streamCharts(raw(c.renewals), "renewals", period, since, today),
    c.purchases
      .aggregate<{ _id: { m: string; isNew: boolean }; n: number }>([
        { $match: { purchaseDate: { $gte: since } } },
        { $group: { _id: { m: { $dateToString: { format: "%Y-%m", date: "$purchaseDate" } }, isNew: { $eq: ["$type", "new"] } }, n: { $sum: 1 } } },
      ])
      .toArray(),
    c.purchases
      .aggregate<{ netProfit: number; sold: number }>([
        { $match: { type: "demo", saleDate: { $exists: true }, ...periodFilter("saleDate", period) } },
        { $group: { _id: null, netProfit: { $sum: { $ifNull: ["$netProfit", 0] } }, sold: { $sum: 1 } } },
      ])
      .toArray(),
  ]);
  const cars = months.map((m) => ({
    month: m.label,
    newCars: carsByMonth.find((r) => r._id.m === m.key && r._id.isNew)?.n ?? 0,
    others: carsByMonth.find((r) => r._id.m === m.key && !r._id.isNew)?.n ?? 0,
  }));
  return { months, streams: { purchases, finance, insurance, renewals }, cars, demo: demo[0] ?? { netProfit: 0, sold: 0 } };
}
