import "server-only";
import type { Document } from "mongodb";

/**
 * Database-level schema rules ($jsonSchema). The app validates every write
 * with zod first; these are the last line of defence so that a bug, a script
 * or a manual edit cannot store a malformed document. Money is integer paise
 * but may be stored as a double above 2^31, hence "number".
 */

const money = { bsonType: "number", minimum: 0 };
const signedMoney = { bsonType: "number" };
const str = { bsonType: "string" };
const date = { bsonType: "date" };
const int = { bsonType: ["int", "long", "double"] };
const audit = {
  createdAt: date,
  createdBy: str,
  updatedAt: date,
  updatedBy: str,
  version: { bsonType: ["int", "long", "double"], minimum: 1 },
};
const auditRequired = ["createdAt", "createdBy", "updatedAt", "updatedBy", "version"];

const stage = { enum: ["not_billed", "billed", "collected", "short_paid", "na"] };
const receipt = {
  bsonType: "object",
  required: ["id", "receiptNo", "receiptDate", "tdsAmount", "receivedAmount"],
  properties: { id: str, receiptNo: str, receiptDate: date, tdsAmount: money, receivedAmount: money, at: date, by: str },
};
const claim = {
  serviceGstRateBp: int,
  tdsRateBp: int,
  claimAmount: money,
  claimGst: money,
  claimTotal: money,
  invoiceNo: str,
  invoiceDate: date,
  receipts: { bsonType: "array", items: receipt },
  tdsAmount: money,
  receivedAmount: money,
  receiptNo: str,
  receiptDate: date,
  balance: signedMoney,
  stage,
};
const claimRequired = ["serviceGstRateBp", "tdsRateBp", "claimAmount", "claimGst", "claimTotal", "stage"];
const dealLink = { dealRef: str, dealKind: { enum: ["purchase", "preowned"] }, chassisNumber: str };

const policy = {
  bsonType: "object",
  required: ["dealRef", "dealKind", "chassisNumber", "provider", "odPremium", "policyStartDate", "policyEndDate", ...claimRequired, ...auditRequired],
  properties: {
    ...dealLink,
    provider: str,
    policyNumber: str,
    odPremium: money,
    policyStartDate: date,
    policyEndDate: date,
    notes: str,
    ...claim,
    ...audit,
  },
};

export const VALIDATORS: Record<string, Document> = {
  users: {
    bsonType: "object",
    required: ["username", "passwordHash", "role", "permissions", "active", "tokenVersion"],
    properties: {
      username: { bsonType: "string", pattern: "^[a-z0-9][a-z0-9._-]{2,31}$" },
      passwordHash: { bsonType: "string", pattern: "^\\$2[aby]\\$" },
      role: { enum: ["admin", "user"] },
      permissions: { bsonType: "array", items: str },
      active: { bsonType: "bool" },
      tokenVersion: int,
    },
  },
  purchases: {
    bsonType: "object",
    required: [
      "commissionNo", "chassisNumber", "purchaseDate", "type", "location", "grade", "carClass", "model", "basicPrice",
      "salesMeasure", "demoDiscount", "lossAllowance", "taxableAmount", "purchaseGstRateBp", "gstAmount", "finalPrice", "stage",
      ...auditRequired,
    ],
    properties: {
      commissionNo: str,
      chassisNumber: { bsonType: "string", pattern: "^[A-Z0-9]{6,20}$" },
      purchaseDate: date,
      type: { bsonType: "string", minLength: 1 },
      location: str,
      grade: { enum: ["series", "ev", "top_end"] },
      carClass: str,
      model: str,
      basicPrice: money,
      salesMeasure: money,
      demoDiscount: money,
      lossAllowance: money,
      taxableAmount: money,
      purchaseGstRateBp: int,
      gstAmount: money,
      finalPrice: money,
      fcRateBp: int,
      lockInDays: int,
      deflectDate: date,
      saleDate: date,
      salePrice: money,
      saleGst: money,
      saleTotal: money,
      priceDifference: signedMoney,
      lossClaim: money,
      saleSalesMeasure: money,
      netProfit: signedMoney,
      ...claim,
      ...audit,
    },
  },
  preowned: {
    bsonType: "object",
    required: ["stockNo", "chassisNumber", "make", "model", "sellerName", "purchaseDate", "purchasePrice", "intendedUse", ...auditRequired],
    properties: {
      stockNo: { bsonType: "string", pattern: "^PO-" },
      chassisNumber: str,
      make: str,
      model: str,
      purchaseDate: date,
      purchasePrice: money,
      intendedUse: { enum: ["resale", "exchange"] },
      saleDate: date,
      salePrice: money,
      ...audit,
    },
  },
  finance_payouts: {
    bsonType: "object",
    required: ["dealRef", "dealKind", "chassisNumber", "provider", "loanAmount", "contractNo", "disbursalDate", ...claimRequired, ...auditRequired],
    properties: { ...dealLink, provider: str, loanAmount: money, contractNo: str, disbursalDate: date, notes: str, ...claim, ...audit },
  },
  insurance_payouts: policy,
  renewal_payouts: policy,
  option_lists: {
    bsonType: "object",
    required: ["mode", "options", "version"],
    properties: { mode: { enum: ["text", "dropdown"] }, options: { bsonType: "array", items: str }, version: int },
  },
  audit_logs: {
    bsonType: "object",
    required: ["at", "userId", "username", "action", "entity"],
    properties: {
      at: date,
      userId: str,
      username: str,
      action: { enum: ["create", "update", "delete", "login", "login_failed", "logout", "denied"] },
      entity: str,
    },
  },
};
