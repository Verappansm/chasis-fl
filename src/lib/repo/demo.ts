import "server-only";
import type { Document, Filter, Sort } from "mongodb";
import { collections } from "@/lib/db/collections";
import type { PurchaseDoc } from "@/lib/types";
import { addDays, type GstBasis } from "@/lib/calc";
import { periodFilter, type Period } from "@/lib/periods";
import { listRecords, searchFilter } from "./base";
import { todayUtc } from "./modules";

/** Demo stock status: still locked in, deflected and sellable, or sold. */
export const DEMO_STATUSES = [
  { value: "all", label: "All" },
  { value: "live", label: "Live (lock-in)" },
  { value: "deflected", label: "Deflected" },
  { value: "sold", label: "Sold" },
] as const;
export type DemoStatus = (typeof DEMO_STATUSES)[number]["value"];

export function parseDemoStatus(raw: string | undefined): DemoStatus {
  return DEMO_STATUSES.some((s) => s.value === raw) ? (raw as DemoStatus) : "all";
}

/** Deflected but unsold for longer than this is flagged. */
export const DEMO_AGEING_DAYS = 60;

function statusFilter(status: DemoStatus, today: Date): Document {
  switch (status) {
    case "live":
      return { saleDate: { $exists: false }, deflectDate: { $gt: today } };
    case "deflected":
      return { saleDate: { $exists: false }, deflectDate: { $lte: today } };
    case "sold":
      return { saleDate: { $exists: true } };
    default:
      return {};
  }
}

export async function listDemo(opts: { q?: string; status: DemoStatus; period: Period; page: number }) {
  const { purchases } = await collections();
  const today = todayUtc();
  // Sold cars are filtered by sale date, stock by purchase date.
  const dateField = opts.status === "sold" ? "saleDate" : "purchaseDate";
  const filter = {
    type: "demo",
    ...searchFilter(opts.q, ["commissionNo", "model", "carClass", "soldTo", "location"]),
    ...statusFilter(opts.status, today),
    ...periodFilter(dateField, opts.period),
  } as Filter<PurchaseDoc>;
  const sort: Sort = opts.status === "sold" ? { saleDate: -1, _id: -1 } : { purchaseDate: -1, _id: -1 };
  return listRecords(purchases, filter, sort, opts.page);
}

export interface DemoStats {
  stock: { live: number; deflected: number; sold: number; stockValue: number; agedDeflected: number; deflectingSoon: number };
  /** Sales in the period. */
  sales: {
    count: number;
    saleTotal: number;
    purchaseTotal: number;
    priceDifference: number;
    lossClaim: number;
    saleSalesMeasure: number;
    netProfit: number;
    /** Net on the other basis, for comparison. */
    otherNetProfit: number;
    profitable: number;
    avgDaysInStock: number;
    /** Sold without a demo discount and no loss claim entered: a claim may be missing. */
    claimMissing: number;
  };
  monthly: { month: string; sold: number; netProfit: number; priceDifference: number }[];
  byClass: { carClass: string; sold: number; netProfit: number }[];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Last `n` calendar months, oldest first, as yyyy-mm keys and Mmm-yy labels. */
export function lastMonths(today: Date, n = 12) {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - (n - 1 - i), 1));
    return {
      key: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
      label: `${MONTHS[d.getUTCMonth()]}-${String(d.getUTCFullYear()).slice(2)}`,
      start: d,
    };
  });
}

const ZERO = (f: string) => ({ $ifNull: [f, 0] });

/** Mongo expressions for the P&L figures, including GST (as stored) or before GST (selling price vs purchase total). */
function pnlExpr(basis: GstBasis) {
  if (basis === "incl") {
    return { sp: ZERO("$saleTotal"), purchase: "$finalPrice", diff: ZERO("$priceDifference"), net: ZERO("$netProfit") };
  }
  const diff = { $subtract: [ZERO("$salePrice"), "$taxableAmount"] };
  return { sp: ZERO("$salePrice"), purchase: "$taxableAmount", diff, net: { $add: [diff, ZERO("$lossClaim"), ZERO("$saleSalesMeasure")] } };
}

export async function demoStats(period: Period, basis: GstBasis = "incl"): Promise<DemoStats> {
  const { purchases } = await collections();
  const x = pnlExpr(basis);
  const other = pnlExpr(basis === "incl" ? "pre" : "incl");
  const today = todayUtc();
  const months = lastMonths(today);
  const sold = { type: "demo", saleDate: { $exists: true } };

  const [stockRows, salesRows, monthlyRows, classRows] = await Promise.all([
    purchases
      .aggregate<DemoStats["stock"]>([
        { $match: { type: "demo" } },
        {
          $group: {
            _id: null,
            live: { $sum: { $cond: [{ $and: [{ $not: ["$saleDate"] }, { $gt: ["$deflectDate", today] }] }, 1, 0] } },
            deflected: { $sum: { $cond: [{ $and: [{ $not: ["$saleDate"] }, { $lte: ["$deflectDate", today] }] }, 1, 0] } },
            sold: { $sum: { $cond: ["$saleDate", 1, 0] } },
            stockValue: { $sum: { $cond: ["$saleDate", 0, x.purchase] } },
            agedDeflected: {
              $sum: {
                $cond: [{ $and: [{ $not: ["$saleDate"] }, { $lt: ["$deflectDate", addDays(today, -DEMO_AGEING_DAYS)] }] }, 1, 0],
              },
            },
            deflectingSoon: {
              $sum: {
                $cond: [
                  { $and: [{ $not: ["$saleDate"] }, { $gt: ["$deflectDate", today] }, { $lte: ["$deflectDate", addDays(today, 30)] }] },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ])
      .toArray(),
    purchases
      .aggregate<DemoStats["sales"]>([
        { $match: { ...sold, ...periodFilter("saleDate", period) } },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            saleTotal: { $sum: x.sp },
            purchaseTotal: { $sum: x.purchase },
            priceDifference: { $sum: x.diff },
            lossClaim: { $sum: { $ifNull: ["$lossClaim", 0] } },
            saleSalesMeasure: { $sum: { $ifNull: ["$saleSalesMeasure", 0] } },
            netProfit: { $sum: x.net },
            otherNetProfit: { $sum: other.net },
            profitable: { $sum: { $cond: [{ $gte: [x.net, 0] }, 1, 0] } },
            avgDaysInStock: { $avg: { $divide: [{ $subtract: ["$saleDate", "$purchaseDate"] }, 86_400_000] } },
            claimMissing: {
              $sum: { $cond: [{ $and: [{ $eq: ["$demoDiscount", 0] }, { $lte: [{ $ifNull: ["$lossClaim", 0] }, 0] }] }, 1, 0] },
            },
          },
        },
      ])
      .toArray(),
    purchases
      .aggregate<{ _id: string; sold: number; netProfit: number; priceDifference: number }>([
        { $match: { ...sold, saleDate: { $gte: months[0].start } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m", date: "$saleDate" } },
            sold: { $sum: 1 },
            netProfit: { $sum: x.net },
            priceDifference: { $sum: x.diff },
          },
        },
      ])
      .toArray(),
    purchases
      .aggregate<{ _id: string; sold: number; netProfit: number }>([
        { $match: { ...sold, ...periodFilter("saleDate", period) } },
        { $group: { _id: "$carClass", sold: { $sum: 1 }, netProfit: { $sum: x.net } } },
        { $sort: { netProfit: 1 } },
        { $limit: 10 },
      ])
      .toArray(),
  ]);

  const emptySales: DemoStats["sales"] = {
    count: 0, saleTotal: 0, purchaseTotal: 0, priceDifference: 0, lossClaim: 0, saleSalesMeasure: 0,
    netProfit: 0, otherNetProfit: 0, profitable: 0, avgDaysInStock: 0, claimMissing: 0,
  };
  const byMonth = new Map(monthlyRows.map((r) => [r._id, r]));
  return {
    stock: stockRows[0] ?? { live: 0, deflected: 0, sold: 0, stockValue: 0, agedDeflected: 0, deflectingSoon: 0 },
    sales: salesRows[0] ?? emptySales,
    monthly: months.map((m) => ({
      month: m.label,
      sold: byMonth.get(m.key)?.sold ?? 0,
      netProfit: byMonth.get(m.key)?.netProfit ?? 0,
      priceDifference: byMonth.get(m.key)?.priceDifference ?? 0,
    })),
    byClass: classRows.map((r) => ({ carClass: r._id, sold: r.sold, netProfit: r.netProfit })),
  };
}
