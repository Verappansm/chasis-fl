/**
 * Business arithmetic, shared by the server (what is stored) and the forms
 * (live preview while typing). All money is integer paise, rates are basis
 * points (1% = 100), and every percentage is rounded to the nearest paisa.
 */
import type { BasisPoints, ClaimStage, Paise, ReceiptLine } from "@/lib/types";

export const DEFAULT_RATES = {
  fcRateBp: 350,
  purchaseGstRateBp: 1800,
  evPurchaseGstRateBp: 500,
  saleGstRateBp: 1800,
  serviceGstRateBp: 1800,
  fcTdsRateBp: 200,
  financeTdsRateBp: 200,
  insuranceTdsRateBp: 200,
  demoLockInDays: 90,
  /** Highest loan value as a share of the car value (selling price + GST); above 100% allows on-road funding. */
  loanCapBp: 13000,
};
export type Rates = typeof DEFAULT_RATES;

/** Which payer a receivable is invoiced to; picks the TDS rate. */
export type ClaimStream = "fc" | "finance" | "insurance";
export const TDS_RATE_KEY = { fc: "fcTdsRateBp", finance: "financeTdsRateBp", insurance: "insuranceTdsRateBp" } as const;

export function percentOf(amount: Paise, rateBp: BasisPoints): Paise {
  return Math.round((amount * rateBp) / 10_000);
}

/** GST on a car purchase depends on the grade (EVs are taxed at a lower rate). */
export function purchaseGstRate(grade: string | undefined, rates: Pick<Rates, "purchaseGstRateBp" | "evPurchaseGstRateBp">): BasisPoints {
  return grade === "ev" ? rates.evPurchaseGstRateBp : rates.purchaseGstRateBp;
}

export function purchaseTotals(
  p: { basicPrice: Paise; salesMeasure: Paise; demoDiscount: Paise; lossAllowance: Paise },
  purchaseGstRateBp: BasisPoints,
) {
  const taxableAmount = p.basicPrice - p.salesMeasure - p.demoDiscount - p.lossAllowance;
  const gstAmount = percentOf(taxableAmount, purchaseGstRateBp);
  return { taxableAmount, gstAmount, finalPrice: taxableAmount + gstAmount };
}

/** Share of the basic price deducted to reach the taxable amount, in basis points. */
export function deductionBp(basicPrice: Paise, taxableAmount: Paise): BasisPoints {
  return basicPrice > 0 ? Math.round(((basicPrice - taxableAmount) * 10_000) / basicPrice) : 0;
}

export function saleTotals(salePrice: Paise, saleGstRateBp: BasisPoints) {
  const saleGst = percentOf(salePrice, saleGstRateBp);
  return { saleGst, saleTotal: salePrice + saleGst };
}

/**
 * Demo car sale P&L, as the business defines it:
 * A = total SP − total purchase (negative = loss on the car),
 * B = loss claim with Mercedes-Benz, C = sales measure on the sale,
 * net = A + B + C.
 */
export function demoPnl(p: { finalPrice: Paise; saleTotal: Paise; lossClaim: Paise; saleSalesMeasure: Paise }) {
  const priceDifference = p.saleTotal - p.finalPrice;
  return { priceDifference, netProfit: priceDifference + p.lossClaim + p.saleSalesMeasure };
}

/** The same P&L on amounts before GST (selling price vs purchase total), since purchase GST is usually reclaimed. */
export function demoPnlBeforeGst(p: { taxableAmount: Paise; salePrice: Paise; lossClaim: Paise; saleSalesMeasure: Paise }) {
  const priceDifference = p.salePrice - p.taxableAmount;
  return { priceDifference, netProfit: priceDifference + p.lossClaim + p.saleSalesMeasure };
}

/** Which amounts the demo P&L compares. */
export type GstBasis = "incl" | "pre";
export function parseGstBasis(raw: string | undefined): GstBasis {
  return raw === "pre" ? "pre" : "incl";
}

/** Highest loan value allowed on a car of this value. */
export function loanCap(carValue: Paise, loanCapBp: BasisPoints): Paise {
  return percentOf(carValue, loanCapBp);
}

/** A loss claim is normally only available when the car carried no demo discount. */
export function lossClaimEligible(demoDiscount: Paise): boolean {
  return demoDiscount === 0;
}

export function claimTotals(claimAmount: Paise, serviceGstRateBp: BasisPoints) {
  const claimGst = percentOf(claimAmount, serviceGstRateBp);
  return { claimGst, claimTotal: claimAmount + claimGst };
}

export function claimStage(c: { invoiceNo?: string; receiptNo?: string; balance?: Paise }): ClaimStage {
  if (!c.invoiceNo) return "not_billed";
  if (!c.receiptNo) return "billed";
  return (c.balance ?? 0) > 0 ? "short_paid" : "collected";
}

/** Totals over the receipts recorded against one invoice. */
export function receiptTotals(claimTotal: Paise, receipts: readonly Pick<ReceiptLine, "tdsAmount" | "receivedAmount" | "receiptNo" | "receiptDate">[]) {
  if (!receipts.length) return { tdsAmount: undefined, receivedAmount: undefined, receiptNo: undefined, receiptDate: undefined, balance: undefined };
  const tdsAmount = receipts.reduce((t, r) => t + r.tdsAmount, 0);
  const receivedAmount = receipts.reduce((t, r) => t + r.receivedAmount, 0);
  const latest = [...receipts].sort((a, b) => a.receiptDate.getTime() - b.receiptDate.getTime()).at(-1)!;
  return {
    tdsAmount,
    receivedAmount,
    receiptNo: latest.receiptNo,
    receiptDate: latest.receiptDate,
    balance: claimTotal - tdsAmount - receivedAmount,
  };
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}

/* -------------------------------------------------------------- live preview */

/** Lenient rupee parser for previews; the server re-validates strictly. */
function rupeesToPaise(raw: string | undefined): Paise {
  const n = Number((raw ?? "").replace(/[,\s₹]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
}

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2, minimumFractionDigits: 0 });
const inrPaise = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const show = (paise: Paise) => (paise % 100 === 0 ? inr : inrPaise).format(paise / 100);
const showPct = (bp: BasisPoints) => `${(bp / 100).toFixed(2)}%`;

export type FormulaContext = Rates;
type Values = Record<string, string>;

function purchaseFrom(v: Values, ctx: FormulaContext) {
  return purchaseTotals(
    {
      basicPrice: rupeesToPaise(v.basicPrice),
      salesMeasure: rupeesToPaise(v.salesMeasure),
      demoDiscount: rupeesToPaise(v.demoDiscount),
      lossAllowance: rupeesToPaise(v.lossAllowance),
    },
    purchaseGstRate(v.grade, ctx),
  );
}

function fcFrom(v: Values, ctx: FormulaContext) {
  return claimTotals(percentOf(rupeesToPaise(v.basicPrice), ctx.fcRateBp), ctx.serviceGstRateBp);
}

function saleFrom(v: Values, ctx: FormulaContext) {
  return saleTotals(rupeesToPaise(v.salePrice), ctx.saleGstRateBp);
}

function pnlFrom(v: Values, ctx: FormulaContext) {
  return demoPnl({
    finalPrice: purchaseFrom(v, ctx).finalPrice,
    saleTotal: saleFrom(v, ctx).saleTotal,
    lossClaim: rupeesToPaise(v.lossClaim),
    saleSalesMeasure: rupeesToPaise(v.saleSalesMeasure),
  });
}

function pnlPreFrom(v: Values, ctx: FormulaContext) {
  return demoPnlBeforeGst({
    taxableAmount: purchaseFrom(v, ctx).taxableAmount,
    salePrice: rupeesToPaise(v.salePrice),
    lossClaim: rupeesToPaise(v.lossClaim),
    saleSalesMeasure: rupeesToPaise(v.saleSalesMeasure),
  });
}

const signed = (paise: Paise) => (paise > 0 ? `+${show(paise)}` : show(paise));
const hasSale = (v: Values) => rupeesToPaise(v.salePrice) > 0;

/**
 * Read-only "computed" form fields refer to these by key, so the formula
 * itself never has to cross the server → client boundary.
 */
export const FORMULAS = {
  "purchase.taxable": (v: Values, c: FormulaContext) => show(purchaseFrom(v, c).taxableAmount),
  "purchase.deduction": (v: Values, c: FormulaContext) =>
    showPct(deductionBp(rupeesToPaise(v.basicPrice), purchaseFrom(v, c).taxableAmount)),
  "purchase.gst": (v: Values, c: FormulaContext) => `${show(purchaseFrom(v, c).gstAmount)}  (${showPct(purchaseGstRate(v.grade, c))})`,
  "purchase.final": (v: Values, c: FormulaContext) => show(purchaseFrom(v, c).finalPrice),
  "purchase.fc": (v: Values, c: FormulaContext) => show(percentOf(rupeesToPaise(v.basicPrice), c.fcRateBp)),
  "purchase.fcGst": (v: Values, c: FormulaContext) => show(fcFrom(v, c).claimGst),
  "purchase.fcTotal": (v: Values, c: FormulaContext) => show(fcFrom(v, c).claimTotal),
  "purchase.deflect": (v: Values, c: FormulaContext) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v.purchaseDate ?? "")) return "—";
    const days = Number(v.lockInDays) > 0 ? Math.trunc(Number(v.lockInDays)) : c.demoLockInDays;
    const d = addDays(new Date(`${v.purchaseDate}T00:00:00.000Z`), days).toISOString().slice(0, 10);
    const [y, m, day] = d.split("-");
    return `${day}-${m}-${y}`;
  },
  "sale.gst": (v: Values, c: FormulaContext) => (hasSale(v) ? `${show(saleFrom(v, c).saleGst)}  (${showPct(c.saleGstRateBp)})` : "—"),
  "sale.total": (v: Values, c: FormulaContext) => (hasSale(v) ? show(saleFrom(v, c).saleTotal) : "—"),
  "demo.diff": (v: Values, c: FormulaContext) => (hasSale(v) ? signed(pnlFrom(v, c).priceDifference) : "—"),
  "demo.claimHint": (v: Values) =>
    lossClaimEligible(rupeesToPaise(v.demoDiscount))
      ? "Eligible: no demo discount on this car"
      : "Not normally eligible: this car had a demo discount (you can still enter a claim)",
  "demo.net": (v: Values, c: FormulaContext) => (hasSale(v) ? signed(pnlFrom(v, c).netProfit) : "—"),
  "demo.diffPre": (v: Values, c: FormulaContext) => (hasSale(v) ? signed(pnlPreFrom(v, c).priceDifference) : "—"),
  "demo.netPre": (v: Values, c: FormulaContext) => (hasSale(v) ? signed(pnlPreFrom(v, c).netProfit) : "—"),
  "claim.gst": (v: Values, c: FormulaContext) => show(claimTotals(rupeesToPaise(v.claimAmount), c.serviceGstRateBp).claimGst),
  "claim.total": (v: Values, c: FormulaContext) => show(claimTotals(rupeesToPaise(v.claimAmount), c.serviceGstRateBp).claimTotal),
} satisfies Record<string, (v: Values, c: FormulaContext) => string>;
export type FormulaKey = keyof typeof FORMULAS;

export { rupeesToPaise as previewPaise };
