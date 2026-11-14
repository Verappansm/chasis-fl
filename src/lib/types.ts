import type { ObjectId } from "mongodb";
import type { Permission, Role } from "@/lib/permissions";

export type { Role };

/** Money is always integer paise (₹1 = 100). Dates are UTC calendar dates. Rates are basis points (1% = 100). */
export type Paise = number;
export type BasisPoints = number;

export interface AuditFields {
  createdAt: Date;
  createdBy: string;
  updatedAt: Date;
  updatedBy: string;
  /** Optimistic-concurrency counter; incremented on every update. */
  version: number;
}

export interface UserDoc {
  _id: ObjectId;
  username: string;
  passwordHash: string;
  role: Role;
  /** Granted permissions; ignored for admins (they have all). */
  permissions: Permission[];
  active: boolean;
  /** Bump to revoke every session of this user. */
  tokenVersion: number;
  lastLoginAt?: Date;
  passwordChangedAt?: Date;
  /** Set when the user finishes or skips the guided tour. */
  tourCompletedAt?: Date;
  createdAt: Date;
  createdBy?: string;
  updatedAt: Date;
  updatedBy?: string;
  /** Optimistic concurrency; absent on documents created before RBAC (treated as 0). */
  version?: number;
}

/* ------------------------------------------------------------------ constants */

/** Admin-editable constants (single document, `_id: "rates"`). Snapshotted onto each record when it is created. */
export interface SettingsDoc {
  _id: "rates";
  /** Fixed compensation from Mercedes-Benz on a new car, as a share of the basic price. */
  fcRateBp: BasisPoints;
  /** GST on the car purchase (taxable amount), petrol / diesel cars. */
  purchaseGstRateBp: BasisPoints;
  /** GST on the car purchase for EV-grade cars. */
  evPurchaseGstRateBp?: BasisPoints;
  /** GST on the selling price when a demo / bidding / courtesy car is sold. */
  saleGstRateBp?: BasisPoints;
  /** GST the dealership charges on its invoices (fixed compensation and payouts). */
  serviceGstRateBp: BasisPoints;
  /** TDS each payer deducts, as a share of the amount before GST. */
  fcTdsRateBp?: BasisPoints;
  financeTdsRateBp?: BasisPoints;
  insuranceTdsRateBp?: BasisPoints;
  /** Before per-stream TDS: one rate for every payer. Read as the fallback. */
  tdsRateBp?: BasisPoints;
  /** Days a demo car is locked after purchase before it is deflected and can be sold. */
  demoLockInDays: number;
  updatedAt?: Date;
  updatedBy?: string;
  version: number;
}

/** Admin-managed choices for a form field (collection `option_lists`, `_id` = list key). */
export interface OptionListDoc {
  _id: string;
  /** `text`: free text with suggestions. `dropdown`: only these options may be chosen. */
  mode: "text" | "dropdown";
  options: string[];
  updatedAt: Date;
  updatedBy: string;
  version: number;
}

/* ------------------------------------------------------------- invoice loop */

/**
 * Where a receivable stands:
 * - `not_billed`: no invoice raised yet
 * - `billed`: invoice raised, no receipt yet
 * - `collected`: receipt recorded and fully paid
 * - `short_paid`: receipt recorded but less than payable was received
 * - `na`: the record has no receivable (e.g. a demo car has no fixed compensation)
 */
export const CLAIM_STAGES = ["not_billed", "billed", "collected", "short_paid"] as const;
export type ClaimStage = (typeof CLAIM_STAGES)[number] | "na";
export const CLAIM_STAGE_LABELS: Record<ClaimStage, string> = {
  not_billed: "Not billed",
  billed: "Billed, not collected",
  collected: "Collected",
  short_paid: "Short-paid",
  na: "—",
};

/**
 * The invoice → receipt loop, shared by fixed compensation, finance,
 * insurance and renewal payouts. Field names are identical everywhere so the
 * overview can aggregate them the same way.
 */
export interface ClaimFields {
  serviceGstRateBp: BasisPoints;
  tdsRateBp: BasisPoints;
  /** Amount before GST (fixed compensation, or the payout/incentive). */
  claimAmount: Paise;
  claimGst: Paise;
  /** claimAmount + claimGst: the "total receivable" invoiced. */
  claimTotal: Paise;
  invoiceNo?: string;
  invoiceDate?: Date;
  /** Every payment received against the invoice (a short payment can be followed by more). */
  receipts?: ReceiptLine[];
  /** Totals over `receipts`, kept on the document for lists and the overview. */
  tdsAmount?: Paise;
  receivedAmount?: Paise;
  /** Latest receipt. */
  receiptNo?: string;
  receiptDate?: Date;
  /** claimTotal − tdsAmount − receivedAmount, once a receipt exists (negative = paid in excess). */
  balance?: Paise;
  stage: ClaimStage;
}

export interface ReceiptLine {
  id: string;
  receiptNo: string;
  receiptDate: Date;
  tdsAmount: Paise;
  receivedAmount: Paise;
  at: Date;
  by: string;
}

/* ---------------------------------------------------------------- purchases */

/**
 * Built-in purchase types. Business rules hang off two of them: only `new`
 * earns fixed compensation, only `demo` has a lock-in. Admins may add more
 * types (Constants); those behave like bidding / courtesy cars.
 */
export const PURCHASE_TYPES = ["new", "demo", "bidding", "courtesy"] as const;
export type BuiltinPurchaseType = (typeof PURCHASE_TYPES)[number];
/** A built-in key, or the name of an admin-defined type. */
export type PurchaseType = BuiltinPurchaseType | (string & {});
export const PURCHASE_TYPE_LABELS: Record<BuiltinPurchaseType, string> = {
  new: "New",
  demo: "Demo",
  bidding: "Bidding",
  courtesy: "Courtesy",
};

export function purchaseTypeLabel(t: string): string {
  return PURCHASE_TYPE_LABELS[t as BuiltinPurchaseType] ?? t;
}

/** "Demo", " demo " → "demo"; anything else is kept as typed (trimmed). */
export function normalizePurchaseType(raw: string): PurchaseType {
  const t = raw.trim().replace(/\s+/g, " ");
  const lower = t.toLowerCase();
  const builtin = PURCHASE_TYPES.find((k) => k === lower || PURCHASE_TYPE_LABELS[k].toLowerCase() === lower);
  return builtin ?? t;
}

export const GRADES = ["series", "ev", "top_end"] as const;
export type Grade = (typeof GRADES)[number];
export const GRADE_LABELS: Record<Grade, string> = { series: "Series", ev: "EV", top_end: "Top end" };

/**
 * One row per commission number. The same chassis can appear on several rows
 * (e.g. sold, returned, sold again). Only `new` cars earn fixed compensation,
 * so the claim fields are present only on those.
 */
export interface PurchaseDoc extends AuditFields, Partial<Omit<ClaimFields, "stage">> {
  _id: ObjectId;
  commissionNo: string;
  chassisNumber: string;
  purchaseDate: Date;
  type: PurchaseType;
  location: string;
  customerName?: string;
  /** Mercedes-Benz invoice number for the purchase. */
  benzInvoiceNo?: string;
  grade: Grade;
  carClass: string;
  model: string;
  basicPrice: Paise;
  /** Offer the dealership may pass on to the customer. */
  salesMeasure: Paise;
  demoDiscount: Paise;
  lossAllowance: Paise;
  /** basicPrice − salesMeasure − demoDiscount − lossAllowance. */
  taxableAmount: Paise;
  purchaseGstRateBp: BasisPoints;
  gstAmount: Paise;
  /** taxableAmount + gstAmount. */
  finalPrice: Paise;
  /** Rate the fixed compensation was computed with (new cars). */
  fcRateBp?: BasisPoints;
  /** Demo only: lock-in from purchase; sellable from deflectDate. */
  lockInDays?: number;
  deflectDate?: Date;
  /** Sale of a non-new car (a new car is sold to its customer on purchase). */
  saleDate?: Date;
  soldTo?: string;
  /** Selling price before GST (entered). */
  salePrice?: Paise;
  saleGstRateBp?: BasisPoints;
  saleGst?: Paise;
  /** salePrice + saleGst: "total SP". */
  saleTotal?: Paise;
  /** Demo sale P&L. A = saleTotal − finalPrice (negative = loss on the car). */
  priceDifference?: Paise;
  /** B: loss claim with Mercedes-Benz (normally only when no demo discount was given). */
  lossClaim?: Paise;
  /** C: sales measure received on the sale. */
  saleSalesMeasure?: Paise;
  /** A + B + C. */
  netProfit?: Paise;
  notes?: string;
  stage: ClaimStage;
}

/* ----------------------------------------------------------------- pre-owned */

export const PREOWNED_USES = ["resale", "exchange"] as const;
export type PreownedUse = (typeof PREOWNED_USES)[number];
export const PREOWNED_USE_LABELS: Record<PreownedUse, string> = { resale: "Resale", exchange: "Exchange" };

export interface PreownedDoc extends AuditFields {
  _id: ObjectId;
  /** Generated: PO-0001, PO-0002… */
  stockNo: string;
  chassisNumber: string;
  registrationNo?: string;
  make: string;
  model: string;
  yearOfMake?: number;
  sellerName: string;
  purchaseDate: Date;
  purchasePrice: Paise;
  intendedUse: PreownedUse;
  saleDate?: Date;
  buyerName?: string;
  salePrice?: Paise;
  notes?: string;
}

/* ------------------------------------------------------------------- payouts */

/** Which sale a payout belongs to: a purchase row (commission no) or a pre-owned car (stock no). */
export type DealKind = "purchase" | "preowned";

export interface DealLink {
  /** Commission no, or pre-owned stock no (PO-…). */
  dealRef: string;
  dealKind: DealKind;
  chassisNumber: string;
}

export interface FinanceDoc extends AuditFields, ClaimFields, DealLink {
  _id: ObjectId;
  provider: string;
  loanAmount: Paise;
  contractNo: string;
  disbursalDate: Date;
  notes?: string;
}

export interface InsuranceDoc extends AuditFields, ClaimFields, DealLink {
  _id: ObjectId;
  provider: string;
  policyNumber?: string;
  /** Own-damage premium: the insurance amount the payout is earned on. */
  odPremium: Paise;
  policyStartDate: Date;
  policyEndDate: Date;
  notes?: string;
}

/** A renewal of a policy we sold; the chassis must already have an insurance payout with us. */
export interface RenewalDoc extends AuditFields, ClaimFields, DealLink {
  _id: ObjectId;
  provider: string;
  policyNumber?: string;
  odPremium: Paise;
  policyStartDate: Date;
  policyEndDate: Date;
  notes?: string;
}

/* --------------------------------------------------------------------- audit */

export type AuditEntity =
  | "purchase"
  | "preowned"
  | "finance"
  | "insurance"
  | "renewal"
  | "settings"
  | "options"
  | "auth"
  | "user"
  | "access";

export type AuditAction = "create" | "update" | "delete" | "login" | "login_failed" | "logout" | "denied";

export interface AuditChange {
  field: string;
  from?: unknown;
  to?: unknown;
}

export interface AuditLogDoc {
  _id: ObjectId;
  at: Date;
  userId: string;
  username: string;
  action: AuditAction;
  entity: AuditEntity;
  entityId?: string;
  /** Human reference: commission no, stock no, payout's deal ref, username… */
  ref?: string;
  chassisNumber?: string;
  /** Fields that changed on an update (from → to). */
  changes?: AuditChange[];
  /** What was attempted, for failed logins and denied access. */
  detail?: string;
  ip?: string;
  userAgent?: string;
  before?: unknown;
  after?: unknown;
}

export interface LoginAttemptDoc {
  _id: string;
  count: number;
  expiresAt: Date;
}
