import "server-only";
import { ObjectId, type Collection, type Document, type Filter } from "mongodb";
import { collections } from "@/lib/db/collections";
import type {
  AuditEntity,
  ClaimFields,
  ClaimStage,
  DealKind,
  FinanceDoc,
  InsuranceDoc,
  PreownedDoc,
  PurchaseDoc,
  ReceiptLine,
  RenewalDoc,
} from "@/lib/types";
import { CLAIM_STAGES, PURCHASE_TYPES, purchaseTypeLabel } from "@/lib/types";
import type {
  FinanceInput,
  InsuranceInput,
  PreownedInput,
  PurchaseInput,
  ReceiptInput,
  RenewalInput,
} from "@/lib/validation/schemas";
import { todayIso } from "@/lib/validation/fields";
import {
  TDS_RATE_KEY,
  addDays,
  claimStage,
  claimTotals,
  demoPnl,
  percentOf,
  purchaseGstRate,
  purchaseTotals,
  receiptTotals,
  saleTotals,
  type ClaimStream,
} from "@/lib/calc";
import { formatDay, formatMoney } from "@/lib/format";
import { periodFilter, type Period } from "@/lib/periods";
import { getSettings } from "./settings";
import { applyOption, applyPurchaseType, getOptionLists } from "./options";
import {
  deleteRecord,
  findRecord,
  insertRecord,
  listRecords,
  searchFilter,
  toObjectId,
  updateRecord,
  writeAudit,
  type Actor,
  type Payload,
} from "./base";
import { ConflictError, NotFoundError, ValidationError, isDuplicateKey } from "./errors";

const STALE = "Someone else changed this record after you opened it. Reload and try again.";

export function todayUtc(): Date {
  return new Date(`${todayIso()}T00:00:00.000Z`);
}

/** Billed but not collected for longer than this is flagged red. */
export const AGEING_DAYS = 60;

export type StageFilter = "all" | ClaimStage;

export function parseStage(raw: string | undefined): StageFilter {
  return (CLAIM_STAGES as readonly string[]).includes(raw ?? "") ? (raw as ClaimStage) : "all";
}

function stageFilter(stage: StageFilter): Document {
  return stage === "all" ? {} : { stage };
}

/* -------------------------------------------------------------- invoice loop */

type ClaimRates = { serviceGstRateBp: number; tdsRateBp: number };
type ReceiptPart = Pick<ClaimFields, "receipts" | "tdsAmount" | "receivedAmount" | "receiptNo" | "receiptDate">;

/** Rates an existing record was created with, falling back to today's constants for this payer. */
async function claimRates(stream: ClaimStream, existing?: Partial<ClaimFields> | null): Promise<ClaimRates> {
  const s = await getSettings();
  return {
    serviceGstRateBp: existing?.serviceGstRateBp ?? s.serviceGstRateBp,
    tdsRateBp: existing?.tdsRateBp ?? s[TDS_RATE_KEY[stream]],
  };
}

/** Our invoice numbers are one series: a number may be used once across every tab. */
async function assertInvoiceNoFree(invoiceNo: string | undefined, selfId?: ObjectId) {
  if (!invoiceNo) return;
  const { purchases, finance, insurance, renewals } = await collections();
  const filter = { invoiceNo, ...(selfId ? { _id: { $ne: selfId } } : {}) };
  const hits = await Promise.all(
    [purchases, finance, insurance, renewals].map((c) => (c as unknown as Collection<Document>).countDocuments(filter, { limit: 1 })),
  );
  if (hits.some(Boolean)) throw new ValidationError("invoiceNo", "This invoice no is already used on another record.");
}

/** Receipts on a record (documents saved before multi-receipt hold a single receipt inline). */
export function receiptLines(doc: Partial<ClaimFields>): ReceiptLine[] {
  if (doc.receipts) return doc.receipts;
  if (!doc.receiptNo || !doc.receiptDate) return [];
  return [
    {
      id: "legacy",
      receiptNo: doc.receiptNo,
      receiptDate: doc.receiptDate,
      tdsAmount: doc.tdsAmount ?? 0,
      receivedAmount: doc.receivedAmount ?? 0,
      at: doc.receiptDate,
      by: "",
    },
  ];
}

/**
 * Claim fields for a save from the main (invoice) form. Receipts are not part
 * of that form: they are kept as they are, and the balance recomputed.
 * `amountField` is the input that drives the amount (for error messages).
 */
async function buildClaim(
  claimAmount: number,
  invoice: { invoiceNo?: string; invoiceDate?: Date },
  rates: ClaimRates,
  existing: (Partial<ClaimFields> & { _id?: ObjectId }) | null | undefined,
  amountField: string,
): Promise<Omit<ClaimFields, keyof ReceiptPart>> {
  const { claimGst, claimTotal } = claimTotals(claimAmount, rates.serviceGstRateBp);
  const lines = existing ? receiptLines(existing) : [];
  if (lines.length) {
    if (!invoice.invoiceNo) {
      throw new ValidationError("invoiceNo", "Receipts are recorded against this invoice. Remove the receipts first.");
    }
    const firstReceipt = lines.reduce((d, r) => (r.receiptDate < d ? r.receiptDate : d), lines[0].receiptDate);
    if (invoice.invoiceDate && invoice.invoiceDate > firstReceipt) {
      throw new ValidationError("invoiceDate", "Invoice date cannot be after the first receipt date.");
    }
  }
  // An invoice that has gone out cannot silently change amount.
  if (existing?.invoiceNo && invoice.invoiceNo && existing.claimAmount !== undefined && existing.claimAmount !== claimAmount) {
    throw new ValidationError(
      amountField,
      `Invoice ${existing.invoiceNo} is raised for ${formatMoney(existing.claimTotal)}. To change the amount, clear the invoice no first (and issue a credit note).`,
    );
  }
  if (invoice.invoiceNo !== existing?.invoiceNo) await assertInvoiceNoFree(invoice.invoiceNo, existing?._id);
  const totals = receiptTotals(claimTotal, lines);
  return {
    serviceGstRateBp: rates.serviceGstRateBp,
    tdsRateBp: rates.tdsRateBp,
    claimAmount,
    claimGst,
    claimTotal,
    invoiceNo: invoice.invoiceNo,
    invoiceDate: invoice.invoiceDate,
    balance: totals.balance,
    stage: claimStage({ invoiceNo: invoice.invoiceNo, receiptNo: totals.receiptNo, balance: totals.balance }),
  };
}

/** Writes a new receipt list and the totals derived from it. */
async function writeReceipts(
  col: Collection<Document>,
  entity: AuditEntity,
  existing: Document,
  expectedVersion: number,
  receipts: ReceiptLine[],
  user: Actor,
) {
  const totals = receiptTotals(existing.claimTotal, receipts);
  const fields: Record<string, unknown> = {
    receipts: receipts.length ? receipts : undefined,
    ...totals,
    stage: claimStage({ invoiceNo: existing.invoiceNo, receiptNo: totals.receiptNo, balance: totals.balance }),
  };
  const $set: Document = { updatedAt: new Date(), updatedBy: user.username };
  const $unset: Document = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) $unset[k] = "";
    else $set[k] = v;
  }
  const after = await col.findOneAndUpdate(
    { _id: existing._id, version: expectedVersion },
    { $set, $inc: { version: 1 }, ...(Object.keys($unset).length ? { $unset } : {}) },
    { returnDocument: "after" },
  );
  if (!after) throw new ConflictError(STALE);
  await writeAudit({ user, action: "update", entity, entityId: String(existing._id), chassisNumber: existing.chassisNumber, before: existing, after });
}

async function loadClaimForReceipt(col: Collection<Document>, id: string, expectedVersion: number) {
  const existing = await col.findOne({ _id: toObjectId(id) });
  if (!existing) throw new NotFoundError("This record no longer exists.");
  if (existing.version !== expectedVersion) throw new ConflictError(STALE);
  if (!existing.invoiceNo || existing.stage === "na") {
    throw new ValidationError("receiptNo", "Raise the invoice before recording a receipt.");
  }
  return existing;
}

/** Records one payment against a raised invoice. */
async function addReceiptOn(col: Collection<Document>, entity: AuditEntity, id: string, expectedVersion: number, input: ReceiptInput, user: Actor) {
  const existing = await loadClaimForReceipt(col, id, expectedVersion);
  if (input.receiptDate < existing.invoiceDate) {
    throw new ValidationError("receiptDate", "Receipt date cannot be before the invoice date.");
  }
  const lines = receiptLines(existing as Partial<ClaimFields>);
  if (lines.some((r) => r.receiptNo === input.receiptNo)) {
    throw new ValidationError("receiptNo", "This receipt no is already recorded on this invoice.");
  }
  // The payer deducts TDS once, normally with the first payment.
  const tdsSoFar = lines.reduce((t, r) => t + r.tdsAmount, 0);
  const tdsAmount = input.tdsAmount ?? Math.max(0, percentOf(existing.claimAmount, existing.tdsRateBp) - tdsSoFar);
  if (tdsSoFar + tdsAmount > existing.claimTotal) throw new ValidationError("tdsAmount", "TDS cannot be more than the invoice total.");
  if (tdsAmount === 0 && input.receivedAmount === 0) throw new ValidationError("receivedAmount", "Enter the amount received.");
  const line: ReceiptLine = {
    id: new ObjectId().toHexString(),
    receiptNo: input.receiptNo,
    receiptDate: input.receiptDate,
    tdsAmount,
    receivedAmount: input.receivedAmount,
    at: new Date(),
    by: user.username,
  };
  await writeReceipts(col, entity, existing, expectedVersion, [...lines, line], user);
}

/** Removes one receipt (e.g. entered by mistake). */
async function removeReceiptOn(col: Collection<Document>, entity: AuditEntity, id: string, expectedVersion: number, receiptId: string, user: Actor) {
  const existing = await loadClaimForReceipt(col, id, expectedVersion);
  const lines = receiptLines(existing as Partial<ClaimFields>);
  const next = lines.filter((r) => r.id !== receiptId);
  if (next.length === lines.length) throw new NotFoundError("This receipt no longer exists. Reload the page.");
  await writeReceipts(col, entity, existing, expectedVersion, next, user);
}

/** Entry points for every module with an invoice loop. */
const CLAIM_COLLECTION = { purchase: "purchases", finance: "finance", insurance: "insurance", renewal: "renewals" } as const;
export type ClaimEntity = keyof typeof CLAIM_COLLECTION;

export async function addReceipt(entity: ClaimEntity, id: string, version: number, input: ReceiptInput, user: Actor) {
  const c = await collections();
  await addReceiptOn(c[CLAIM_COLLECTION[entity]] as unknown as Collection<Document>, entity, id, version, input, user);
}

export async function removeReceipt(entity: ClaimEntity, id: string, version: number, receiptId: string, user: Actor) {
  const c = await collections();
  await removeReceiptOn(c[CLAIM_COLLECTION[entity]] as unknown as Collection<Document>, entity, id, version, receiptId, user);
}

/* --------------------------------------------------------------------- deals */

/** A sale that payouts can be recorded against. */
export interface Deal {
  kind: DealKind;
  ref: string;
  id: string;
  chassisNumber: string;
  label: string;
  model: string;
  customer?: string;
  sold: boolean;
  saleDate?: Date;
  /** What the customer's car is worth: total selling price if recorded, else final purchase price. Caps the loan value. */
  carValue?: number;
}

export function isPurchaseSold(p: Pick<PurchaseDoc, "type" | "saleDate">): boolean {
  return p.type === "new" || Boolean(p.saleDate);
}

function purchaseDeal(p: PurchaseDoc): Deal {
  return {
    kind: "purchase",
    ref: p.commissionNo,
    id: p._id.toHexString(),
    chassisNumber: p.chassisNumber,
    label: `${purchaseTypeLabel(p.type)} car`,
    model: p.model,
    customer: p.type === "new" ? p.customerName : p.soldTo,
    sold: isPurchaseSold(p),
    saleDate: p.type === "new" ? p.purchaseDate : p.saleDate,
    carValue: p.saleTotal ?? p.salePrice ?? p.finalPrice,
  };
}

function preownedDeal(p: PreownedDoc): Deal {
  return {
    kind: "preowned",
    ref: p.stockNo,
    id: p._id.toHexString(),
    chassisNumber: p.chassisNumber,
    label: "Pre-owned car",
    model: `${p.make} ${p.model}`,
    customer: p.buyerName,
    sold: Boolean(p.saleDate),
    saleDate: p.saleDate,
    carValue: p.salePrice ?? p.purchasePrice,
  };
}

export function normalizeDealRef(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

/** Commission no → purchase row; PO-… → pre-owned car. */
export async function findDeal(rawRef: string): Promise<Deal | null> {
  const ref = normalizeDealRef(rawRef);
  if (!ref) return null;
  const { purchases, preowned } = await collections();
  if (ref.startsWith("PO-")) {
    const p = await preowned.findOne({ stockNo: ref });
    return p ? preownedDeal(p) : null;
  }
  const p = await purchases.findOne({ commissionNo: ref });
  return p ? purchaseDeal(p) : null;
}

/** For payout forms: the deal must exist and be sold. */
async function requireSoldDeal(ref: string): Promise<Deal> {
  const deal = await findDeal(ref);
  if (!deal) throw new ValidationError("dealRef", "No purchase with this commission no (or pre-owned car with this stock no).");
  if (!deal.sold) throw new ValidationError("dealRef", "This car has not been sold yet. Record the sale first.");
  return deal;
}

async function dealHasPayouts(ref: string): Promise<boolean> {
  const { finance, insurance, renewals } = await collections();
  const [f, i, r] = await Promise.all([
    finance.countDocuments({ dealRef: ref }, { limit: 1 }),
    insurance.countDocuments({ dealRef: ref }, { limit: 1 }),
    renewals.countDocuments({ dealRef: ref }, { limit: 1 }),
  ]);
  return f + i + r > 0;
}

export async function payoutsForDeal(ref: string) {
  const { finance, insurance, renewals } = await collections();
  const [f, i, r] = await Promise.all([
    finance.find({ dealRef: ref }).toArray(),
    insurance.find({ dealRef: ref }).sort({ policyStartDate: 1 }).toArray(),
    renewals.find({ dealRef: ref }).sort({ policyStartDate: 1 }).toArray(),
  ]);
  return { finance: f, insurance: i, renewals: r };
}

/* ----------------------------------------------------------------- purchases */

const NO_CLAIM = {
  fcRateBp: undefined,
  serviceGstRateBp: undefined,
  tdsRateBp: undefined,
  claimAmount: undefined,
  claimGst: undefined,
  claimTotal: undefined,
  invoiceNo: undefined,
  invoiceDate: undefined,
  receipts: undefined,
  tdsAmount: undefined,
  receivedAmount: undefined,
  receiptNo: undefined,
  receiptDate: undefined,
  balance: undefined,
  stage: "na" as const,
};

const NO_SALE = {
  saleDate: undefined,
  soldTo: undefined,
  salePrice: undefined,
  saleGstRateBp: undefined,
  saleGst: undefined,
  saleTotal: undefined,
  priceDifference: undefined,
  lossClaim: undefined,
  saleSalesMeasure: undefined,
  netProfit: undefined,
};

async function buildPurchase(input: PurchaseInput, existing?: PurchaseDoc | null): Promise<Payload<PurchaseDoc>> {
  const [s, lists] = await Promise.all([getSettings(), getOptionLists()]);
  const type = applyPurchaseType(lists, input.type, existing?.type);
  const isNew = type === "new";

  if (existing?.invoiceNo && !isNew) {
    throw new ValidationError("type", "The fixed compensation for this car has been invoiced, so it must stay a New car.");
  }

  // Keep the GST rate the record was bought at, unless the grade moved between EV and non-EV.
  const sameGstClass = existing && (existing.grade === "ev") === (input.grade === "ev");
  const purchaseGstRateBp = sameGstClass ? existing.purchaseGstRateBp : purchaseGstRate(input.grade, s);
  const totals = purchaseTotals(input, purchaseGstRateBp);

  let demo: Pick<PurchaseDoc, "lockInDays" | "deflectDate"> = { lockInDays: undefined, deflectDate: undefined };
  if (type === "demo") {
    const lockInDays = input.lockInDays ?? existing?.lockInDays ?? s.demoLockInDays;
    const deflectDate = addDays(input.purchaseDate, lockInDays);
    if (input.saleDate && input.saleDate < deflectDate) {
      throw new ValidationError("saleDate", `This demo car is in its lock-in period until ${formatDay(deflectDate)}; it cannot be sold before then.`);
    }
    demo = { lockInDays, deflectDate };
  }

  // A new car is sold to its customer when booked; others record a sale.
  let sale: Partial<PurchaseDoc> = NO_SALE;
  if (!isNew && input.saleDate && input.salePrice !== undefined) {
    const saleGstRateBp = existing?.saleGstRateBp ?? s.saleGstRateBp;
    const { saleGst, saleTotal } = saleTotals(input.salePrice, saleGstRateBp);
    sale = { ...NO_SALE, saleDate: input.saleDate, soldTo: input.soldTo, salePrice: input.salePrice, saleGstRateBp, saleGst, saleTotal };
    if (type === "demo") {
      const lossClaim = input.lossClaim ?? 0;
      const saleSalesMeasure = input.saleSalesMeasure ?? 0;
      sale = { ...sale, lossClaim, saleSalesMeasure, ...demoPnl({ finalPrice: totals.finalPrice, saleTotal, lossClaim, saleSalesMeasure }) };
    }
  }

  let claim: Partial<ClaimFields> & { fcRateBp?: number; stage: ClaimStage } = NO_CLAIM;
  if (isNew) {
    const fcRateBp = existing?.fcRateBp ?? s.fcRateBp;
    const rates = await claimRates("fc", existing);
    claim = { fcRateBp, ...(await buildClaim(percentOf(input.basicPrice, fcRateBp), input, rates, existing, "basicPrice")) };
  }

  const doc = {
    commissionNo: input.commissionNo,
    chassisNumber: input.chassisNumber,
    purchaseDate: input.purchaseDate,
    type,
    location: applyOption(lists, "location", input.location, "location", "Location", existing?.location),
    customerName: input.customerName,
    benzInvoiceNo: input.benzInvoiceNo,
    grade: input.grade,
    carClass: applyOption(lists, "carClass", input.carClass, "carClass", "Class", existing?.carClass),
    model: applyOption(lists, "model", input.model, "model", "Model", existing?.model),
    basicPrice: input.basicPrice,
    salesMeasure: input.salesMeasure,
    demoDiscount: input.demoDiscount,
    lossAllowance: input.lossAllowance,
    purchaseGstRateBp,
    ...totals,
    ...demo,
    ...sale,
    notes: input.notes,
    ...claim,
  } as Payload<PurchaseDoc>;

  if (existing && isPurchaseSold(existing) && !isPurchaseSold(doc) && (await dealHasPayouts(existing.commissionNo))) {
    throw new ValidationError("saleDate", "Payouts are recorded against this sale, so it must stay sold.");
  }
  if (existing && existing.type === "new" && !isNew && (await dealHasPayouts(existing.commissionNo))) {
    throw new ValidationError("type", "Payouts are recorded against this car as a New car sale. Delete them before changing the type.");
  }
  return doc;
}

function purchaseDuplicate(err: unknown): never {
  if (isDuplicateKey(err)) {
    throw new ValidationError("commissionNo", "A purchase with this commission no already exists. Open it from the list to edit.");
  }
  throw err;
}

export async function createPurchase(input: PurchaseInput, user: Actor) {
  const { purchases } = await collections();
  try {
    return await insertRecord(purchases, "purchase", await buildPurchase(input), user);
  } catch (err) {
    purchaseDuplicate(err);
  }
}

export async function updatePurchase(id: string, version: number, input: PurchaseInput, user: Actor) {
  const { purchases } = await collections();
  const existing = await findRecord(purchases, id);
  if (!existing) throw new NotFoundError("This record no longer exists.");
  if (existing.version !== version) throw new ConflictError(STALE);
  await updateRecord(purchases, "purchase", id, version, await buildPurchase(input, existing), user, [
    { field: "commissionNo", label: "Commission no" },
  ]);
}

export async function deletePurchase(id: string, version: number, user: Actor) {
  const { purchases } = await collections();
  const existing = await findRecord(purchases, id);
  if (existing && (await dealHasPayouts(existing.commissionNo))) {
    throw new ConflictError("Finance, insurance or renewal payouts are recorded against this car. Delete those first.");
  }
  if (existing?.invoiceNo) {
    throw new ConflictError(`Fixed compensation invoice ${existing.invoiceNo} is raised on this car. Clear the invoice (and its receipts) first.`);
  }
  await deleteRecord(purchases, "purchase", id, version, user);
}

export async function getPurchase(id: string) {
  const { purchases } = await collections();
  return findRecord(purchases, id);
}

export type PurchaseTypeFilter = "all" | string;
export function parsePurchaseType(raw: string | undefined, extra: readonly string[] = []): PurchaseTypeFilter {
  const v = raw ?? "";
  return (PURCHASE_TYPES as readonly string[]).includes(v) || extra.includes(v) ? v : "all";
}

export async function listPurchases(opts: { q?: string; type: PurchaseTypeFilter; stage: StageFilter; period: Period; page: number }) {
  const { purchases } = await collections();
  const filter = {
    ...searchFilter(opts.q, ["commissionNo", "customerName", "soldTo", "model", "benzInvoiceNo", "invoiceNo", "receiptNo"]),
    ...(opts.type === "all" ? {} : { type: opts.type }),
    ...stageFilter(opts.stage),
    ...periodFilter("purchaseDate", opts.period),
  } as Filter<PurchaseDoc>;
  return listRecords(purchases, filter, { purchaseDate: -1, _id: -1 }, opts.page);
}

/* ----------------------------------------------------------------- pre-owned */

async function nextStockNo(): Promise<string> {
  const { counters } = await collections();
  const row = await counters.findOneAndUpdate({ _id: "preowned" }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: "after" });
  return `PO-${String(row!.seq).padStart(4, "0")}`;
}

async function preownedPayload(input: PreownedInput, existing?: PreownedDoc | null) {
  const lists = await getOptionLists();
  return {
    ...input,
    make: applyOption(lists, "preownedMake", input.make, "make", "Make", existing?.make),
    saleDate: input.saleDate,
    buyerName: input.buyerName,
    salePrice: input.salePrice,
  };
}

export async function createPreowned(input: PreownedInput, user: Actor) {
  const { preowned } = await collections();
  const payload = await preownedPayload(input);
  return insertRecord(preowned, "preowned", { stockNo: await nextStockNo(), ...payload }, user);
}

export async function updatePreowned(id: string, version: number, input: PreownedInput, user: Actor) {
  const { preowned } = await collections();
  const existing = await findRecord(preowned, id);
  if (!existing) throw new NotFoundError("This record no longer exists.");
  if (existing.saleDate && !input.saleDate && (await dealHasPayouts(existing.stockNo))) {
    throw new ValidationError("saleDate", "Payouts are recorded against this sale, so it must stay sold.");
  }
  await updateRecord(preowned, "preowned", id, version, await preownedPayload(input, existing), user);
}

export async function deletePreowned(id: string, version: number, user: Actor) {
  const { preowned } = await collections();
  const existing = await findRecord(preowned, id);
  if (existing && (await dealHasPayouts(existing.stockNo))) {
    throw new ConflictError("Finance, insurance or renewal payouts are recorded against this car. Delete those first.");
  }
  await deleteRecord(preowned, "preowned", id, version, user);
}

export async function getPreowned(id: string) {
  const { preowned } = await collections();
  return findRecord(preowned, id);
}

export type PreownedFilter = "all" | "in_stock" | "sold";

export async function listPreowned(opts: { q?: string; status: PreownedFilter; period: Period; page: number }) {
  const { preowned } = await collections();
  const filter = {
    ...searchFilter(opts.q, ["stockNo", "registrationNo", "make", "model", "sellerName", "buyerName"]),
    ...(opts.status === "in_stock" ? { saleDate: { $exists: false } } : opts.status === "sold" ? { saleDate: { $exists: true } } : {}),
    ...periodFilter("purchaseDate", opts.period),
  } as Filter<PreownedDoc>;
  return listRecords(preowned, filter, { purchaseDate: -1, _id: -1 }, opts.page);
}

/* ------------------------------------------------------------------- payouts */

function dealLink(deal: Deal) {
  return { dealRef: deal.ref, dealKind: deal.kind, chassisNumber: deal.chassisNumber };
}

const DEAL_IMMUTABLE = [{ field: "dealRef", label: "Commission / stock no" }];

/** Loads the record being edited and checks the version before any other work. */
async function loadForUpdate<T extends { version: number }>(col: Collection<T>, id: string, version: number) {
  const existing = (await findRecord(col as never, id)) as T | null;
  if (!existing) throw new NotFoundError("This record no longer exists.");
  if (existing.version !== version) throw new ConflictError(STALE);
  return existing;
}

/** A payout with receipts or a raised invoice should be cleared before it is deleted. */
function assertDeletableClaim(existing: Partial<ClaimFields> | null) {
  if (existing?.invoiceNo) {
    throw new ConflictError(`Invoice ${existing.invoiceNo} is raised on this payout. Clear the invoice (and its receipts) first.`);
  }
}

/* finance */

async function buildFinance(input: FinanceInput, existing?: FinanceDoc | null): Promise<Payload<FinanceDoc>> {
  const [deal, lists] = await Promise.all([requireSoldDeal(input.dealRef), getOptionLists()]);
  if (deal.carValue !== undefined && input.loanAmount > deal.carValue) {
    throw new ValidationError("loanAmount", `Loan value cannot be above the car value (${formatMoney(deal.carValue)}).`);
  }
  if (deal.saleDate && input.disbursalDate < deal.saleDate) {
    throw new ValidationError("disbursalDate", `Disbursal date cannot be before the sale (${formatDay(deal.saleDate)}).`);
  }
  return {
    ...dealLink(deal),
    provider: applyOption(lists, "financeProvider", input.provider, "provider", "Finance provider", existing?.provider),
    loanAmount: input.loanAmount,
    contractNo: input.contractNo,
    disbursalDate: input.disbursalDate,
    notes: input.notes,
    ...(await buildClaim(input.claimAmount, input, await claimRates("finance", existing), existing, "claimAmount")),
  } as Payload<FinanceDoc>;
}

function financeDuplicate(err: unknown): never {
  if (isDuplicateKey(err)) throw new ValidationError("dealRef", "A finance payout already exists for this sale. Open it from the list to edit.");
  throw err;
}

export async function createFinance(input: FinanceInput, user: Actor) {
  const { finance } = await collections();
  try {
    return await insertRecord(finance, "finance", await buildFinance(input), user);
  } catch (err) {
    financeDuplicate(err);
  }
}

export async function updateFinance(id: string, version: number, input: FinanceInput, user: Actor) {
  const { finance } = await collections();
  const existing = await loadForUpdate(finance, id, version);
  await updateRecord(finance, "finance", id, version, await buildFinance(input, existing), user, DEAL_IMMUTABLE);
}

export async function deleteFinance(id: string, version: number, user: Actor) {
  const { finance } = await collections();
  assertDeletableClaim(await findRecord(finance, id));
  await deleteRecord(finance, "finance", id, version, user);
}

export async function getFinance(id: string) {
  const { finance } = await collections();
  return findRecord(finance, id);
}

export async function listFinance(opts: { q?: string; stage: StageFilter; period: Period; page: number }) {
  const { finance } = await collections();
  const filter = {
    ...searchFilter(opts.q, ["provider", "dealRef", "contractNo", "invoiceNo", "receiptNo"]),
    ...stageFilter(opts.stage),
    ...periodFilter("disbursalDate", opts.period),
  } as Filter<FinanceDoc>;
  return listRecords(finance, filter, { disbursalDate: -1, _id: -1 }, opts.page);
}

/* insurance */

type PolicyInput = Omit<RenewalInput, "chassisNumber">;

function policyPayload(input: PolicyInput) {
  return {
    policyNumber: input.policyNumber,
    odPremium: input.odPremium,
    policyStartDate: input.policyStartDate,
    policyEndDate: input.policyEndDate,
    notes: input.notes,
  };
}

function policyDuplicate(err: unknown, dealMessage: string): never {
  if (isDuplicateKey(err)) {
    if (err.keyPattern?.dealRef) throw new ValidationError("dealRef", dealMessage);
    throw new ValidationError("policyNumber", "This policy no is already recorded for this provider.");
  }
  throw err;
}

async function buildInsurance(input: InsuranceInput, existing?: InsuranceDoc | null): Promise<Payload<InsuranceDoc>> {
  const [deal, lists] = await Promise.all([requireSoldDeal(input.dealRef), getOptionLists()]);
  return {
    ...dealLink(deal),
    provider: applyOption(lists, "insuranceProvider", input.provider, "provider", "Insurance provider", existing?.provider),
    ...policyPayload(input),
    ...(await buildClaim(input.claimAmount, input, await claimRates("insurance", existing), existing, "claimAmount")),
  } as Payload<InsuranceDoc>;
}

const INSURANCE_DUP = "An insurance payout already exists for this sale. Renewals go under Renewal payout.";

export async function createInsurance(input: InsuranceInput, user: Actor) {
  const { insurance } = await collections();
  try {
    return await insertRecord(insurance, "insurance", await buildInsurance(input), user);
  } catch (err) {
    policyDuplicate(err, INSURANCE_DUP);
  }
}

export async function updateInsurance(id: string, version: number, input: InsuranceInput, user: Actor) {
  const { insurance } = await collections();
  const existing = await loadForUpdate(insurance, id, version);
  try {
    await updateRecord(insurance, "insurance", id, version, await buildInsurance(input, existing), user, DEAL_IMMUTABLE);
  } catch (err) {
    policyDuplicate(err, INSURANCE_DUP);
  }
}

export async function deleteInsurance(id: string, version: number, user: Actor) {
  const { insurance, renewals } = await collections();
  const existing = await findRecord(insurance, id);
  assertDeletableClaim(existing);
  if (existing && (await renewals.countDocuments({ chassisNumber: existing.chassisNumber }, { limit: 1 }))) {
    const others = await insurance.countDocuments({ chassisNumber: existing.chassisNumber, _id: { $ne: existing._id } }, { limit: 1 });
    if (!others) throw new ConflictError("Renewal payouts are recorded for this car. Delete those first.");
  }
  await deleteRecord(insurance, "insurance", id, version, user);
}

export async function getInsurance(id: string) {
  const { insurance } = await collections();
  return findRecord(insurance, id);
}

export async function listInsurance(opts: { q?: string; stage: StageFilter; period: Period; page: number }) {
  const { insurance } = await collections();
  const filter = {
    ...searchFilter(opts.q, ["provider", "policyNumber", "dealRef", "invoiceNo", "receiptNo"]),
    ...stageFilter(opts.stage),
    ...periodFilter("policyStartDate", opts.period),
  } as Filter<InsuranceDoc>;
  return listRecords(insurance, filter, { policyStartDate: -1, _id: -1 }, opts.page);
}

/* renewals */

/** The car's insurance with us (latest), which a renewal must follow. */
export async function insuranceForChassis(chassisNumber: string) {
  const { insurance } = await collections();
  return insurance.findOne({ chassisNumber }, { sort: { policyStartDate: -1 } });
}

async function buildRenewal(input: RenewalInput, existing?: RenewalDoc | null): Promise<Payload<RenewalDoc>> {
  const original = await insuranceForChassis(input.chassisNumber);
  if (!original) {
    throw new ValidationError("chassisNumber", "This car has no insurance with us. Record the insurance payout first; only our policies can be renewed here.");
  }
  if (input.policyStartDate < original.policyStartDate) {
    throw new ValidationError("policyStartDate", "A renewal cannot start before the car's first policy with us.");
  }
  return {
    dealRef: existing?.dealRef ?? original.dealRef,
    dealKind: existing?.dealKind ?? original.dealKind,
    chassisNumber: input.chassisNumber,
    // The renewal is with the insurer the car is insured with.
    provider: existing?.provider ?? original.provider,
    ...policyPayload(input),
    ...(await buildClaim(input.claimAmount, input, await claimRates("insurance", existing), existing, "claimAmount")),
  } as Payload<RenewalDoc>;
}

export async function createRenewal(input: RenewalInput, user: Actor) {
  const { renewals } = await collections();
  try {
    return await insertRecord(renewals, "renewal", await buildRenewal(input), user);
  } catch (err) {
    policyDuplicate(err, "");
  }
}

export async function updateRenewal(id: string, version: number, input: RenewalInput, user: Actor) {
  const { renewals } = await collections();
  const existing = await loadForUpdate(renewals, id, version);
  try {
    await updateRecord(renewals, "renewal", id, version, await buildRenewal(input, existing), user);
  } catch (err) {
    policyDuplicate(err, "");
  }
}

export async function deleteRenewal(id: string, version: number, user: Actor) {
  const { renewals } = await collections();
  assertDeletableClaim(await findRecord(renewals, id));
  await deleteRecord(renewals, "renewal", id, version, user);
}

export async function getRenewal(id: string) {
  const { renewals } = await collections();
  return findRecord(renewals, id);
}

export async function listRenewals(opts: { q?: string; stage: StageFilter; period: Period; page: number }) {
  const { renewals } = await collections();
  const filter = {
    ...searchFilter(opts.q, ["provider", "policyNumber", "dealRef", "invoiceNo", "receiptNo"]),
    ...stageFilter(opts.stage),
    ...periodFilter("policyStartDate", opts.period),
  } as Filter<RenewalDoc>;
  return listRecords(renewals, filter, { policyStartDate: -1, _id: -1 }, opts.page);
}

export interface ExpiringPolicy {
  id: string;
  source: "insurance" | "renewal";
  chassisNumber: string;
  dealRef: string;
  provider: string;
  policyNumber?: string;
  odPremium: number;
  policyEndDate: Date;
}

/**
 * Our policies (first insurance or a renewal) expiring soon that have not been
 * renewed with us yet.
 */
export async function upcomingExpiries(windowDays = 45): Promise<ExpiringPolicy[]> {
  const { insurance, renewals } = await collections();
  const today = todayUtc();
  const range = { policyEndDate: { $gte: addDays(today, -15), $lte: addDays(today, windowDays) } };
  const [ins, ren] = await Promise.all([
    insurance.find(range).sort({ policyEndDate: 1 }).limit(200).toArray(),
    renewals.find(range).sort({ policyEndDate: 1 }).limit(200).toArray(),
  ]);
  const expiring: ExpiringPolicy[] = [
    ...ins.map((p) => ({ ...p, source: "insurance" as const })),
    ...ren.map((p) => ({ ...p, source: "renewal" as const })),
  ]
    .map((p) => ({
      id: p._id.toHexString(),
      source: p.source,
      chassisNumber: p.chassisNumber,
      dealRef: p.dealRef,
      provider: p.provider,
      policyNumber: p.policyNumber,
      odPremium: p.odPremium,
      policyEndDate: p.policyEndDate,
    }))
    .sort((a, b) => a.policyEndDate.getTime() - b.policyEndDate.getTime());
  if (!expiring.length) return [];

  const chassis = [...new Set(expiring.map((p) => p.chassisNumber))];
  const later = await renewals
    .find({ chassisNumber: { $in: chassis } }, { projection: { chassisNumber: 1, policyStartDate: 1 } })
    .toArray();
  return expiring.filter(
    (p) =>
      !later.some(
        (r) => r.chassisNumber === p.chassisNumber && r._id.toHexString() !== p.id && r.policyStartDate >= addDays(p.policyEndDate, -60),
      ),
  );
}
