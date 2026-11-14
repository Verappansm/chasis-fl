import type { FieldDef, SectionDef } from "@/components/record-form";
import { dateToInput, formatMoney, paiseToInput } from "@/lib/format";
import { percentOf } from "@/lib/calc";
import {
  GRADES,
  GRADE_LABELS,
  PREOWNED_USES,
  PREOWNED_USE_LABELS,
  type ClaimFields,
  type FinanceDoc,
  type InsuranceDoc,
  type PreownedDoc,
  type PurchaseDoc,
  type RenewalDoc,
} from "@/lib/types";

/* Field names here must match the zod schemas in lib/validation/schemas.ts. */

const chassis = { name: "chassisNumber", label: "Chassis no", type: "chassis", required: true, immutable: true } as const;
const notes: FieldDef = { name: "notes", label: "Notes", type: "textarea", wide: true };

/* ---------------------------------------------------------------- purchases */

export const purchaseSections: SectionDef[] = [
  {
    title: "Car",
    description: "One row per commission no. The same chassis can appear again if the car is sold more than once.",
    fields: [
      { name: "commissionNo", label: "Commission no", type: "code", required: true, immutable: true },
      chassis,
      { name: "purchaseDate", label: "Date of purchase", type: "date", required: true },
      {
        name: "type",
        label: "Type",
        type: "text",
        list: "purchaseType",
        required: true,
        maxLength: 40,
        hint: "Only New cars earn fixed compensation; only Demo cars have a lock-in.",
      },
      { name: "location", label: "Location", type: "text", list: "location", required: true, maxLength: 80 },
      { name: "customerName", label: "Customer name", type: "text", hint: "Required for a New car (booked for this customer)." },
      { name: "benzInvoiceNo", label: "Inv no (from Mercedes-Benz)", type: "code" },
      {
        name: "grade",
        label: "Grade",
        type: "select",
        required: true,
        options: GRADES.map((g) => ({ value: g, label: GRADE_LABELS[g] })),
      },
      { name: "carClass", label: "Class", type: "text", list: "carClass", required: true, maxLength: 60, hint: "e.g. C-Class, GLE, EQS" },
      { name: "model", label: "Model", type: "text", list: "model", required: true, maxLength: 80, hint: "e.g. GLE 300d 4MATIC" },
    ],
  },
  {
    title: "Purchase price",
    description:
      "Purchase total (taxable) = basic price − sales measure − demo discount − loss allowance. GST is on the purchase total (EVs at the EV rate). Calculated as you type.",
    fields: [
      { name: "basicPrice", label: "Basic price (purchase price)", type: "money", required: true },
      { name: "salesMeasure", label: "Sales measure", type: "money", hint: "Offer that can be given to the customer" },
      { name: "demoDiscount", label: "Demo discount", type: "money" },
      { name: "lossAllowance", label: "Loss allowance", type: "money" },
      { name: "taxable", label: "Purchase total (taxable)", type: "computed", formula: "purchase.taxable" },
      { name: "deduction", label: "Deduction from basic", type: "computed", formula: "purchase.deduction" },
      { name: "gst", label: "GST", type: "computed", formula: "purchase.gst" },
      { name: "final", label: "Total purchase (incl. GST)", type: "computed", formula: "purchase.final", hint: "Purchase total + GST" },
    ],
  },
  {
    title: "Demo lock-in",
    description: "A demo car cannot be sold during its lock-in period. After that it is deflected and can be sold.",
    showWhen: { field: "type", in: ["demo"] },
    fields: [
      { name: "lockInDays", label: "Lock-in period (days)", type: "number", hint: "Leave empty for the default from Constants" },
      { name: "deflect", label: "Deflected on", type: "computed", formula: "purchase.deflect" },
    ],
  },
  {
    title: "Sale",
    description: "Record the sale once the car is sold. Finance and insurance payouts can only be added after this.",
    showWhen: { field: "type", notIn: ["new"] },
    fields: [
      { name: "saleDate", label: "Sale date", type: "date" },
      { name: "soldTo", label: "Sold to", type: "text" },
      { name: "salePrice", label: "Selling price (before GST)", type: "money" },
      { name: "saleGst", label: "GST on selling price", type: "computed", formula: "sale.gst" },
      { name: "saleTotal", label: "Total selling price", type: "computed", formula: "sale.total", wide: true, hint: "Car value; the loan cap on a finance payout is a share of this (set in Constants)" },
    ],
  },
  {
    title: "Demo sale: profit or loss",
    description:
      "A = selling price − purchase (negative is a loss on the car), shown both including GST and before GST. Net profit / loss = A + B + C. Purchase GST is usually reclaimed, so the before-GST figure is the truer margin.",
    showWhen: { field: "type", in: ["demo"] },
    fields: [
      { name: "diff", label: "A · Total SP − total purchase (incl. GST)", type: "computed", formula: "demo.diff" },
      { name: "diffPre", label: "A · Selling price − purchase total (before GST)", type: "computed", formula: "demo.diffPre" },
      { name: "claimHint", label: "Loss claim eligibility", type: "computed", formula: "demo.claimHint", wide: true },
      { name: "lossClaim", label: "B · Loss claim (Mercedes-Benz)", type: "money", hint: "Normally only when no demo discount was given" },
      { name: "saleSalesMeasure", label: "C · Sales measure on sale", type: "money" },
      { name: "net", label: "Net profit / loss (incl. GST)", type: "computed", formula: "demo.net" },
      { name: "netPre", label: "Net profit / loss (before GST)", type: "computed", formula: "demo.netPre" },
    ],
  },
  {
    title: "Fixed compensation invoice",
    description: "Fixed compensation is a share of the basic price. Raise the invoice for the total receivable to Mercedes-Benz.",
    showWhen: { field: "type", in: ["new"] },
    fields: [
      { name: "fc", label: "Fixed compensation", type: "computed", formula: "purchase.fc" },
      { name: "fcGst", label: "GST", type: "computed", formula: "purchase.fcGst" },
      { name: "fcTotal", label: "Total receivable", type: "computed", formula: "purchase.fcTotal", wide: true },
      { name: "invoiceNo", label: "Invoice no", type: "code", hint: "Entering it marks the invoice as raised" },
      { name: "invoiceDate", label: "Invoice date", type: "date" },
    ],
  },
  { title: "Notes", fields: [notes] },
];

export function purchaseValues(doc?: PurchaseDoc | null): Record<string, string> {
  return {
    commissionNo: doc?.commissionNo ?? "",
    chassisNumber: doc?.chassisNumber ?? "",
    purchaseDate: dateToInput(doc?.purchaseDate),
    type: doc?.type ?? "new",
    location: doc?.location ?? "",
    customerName: doc?.customerName ?? "",
    benzInvoiceNo: doc?.benzInvoiceNo ?? "",
    grade: doc?.grade ?? "series",
    carClass: doc?.carClass ?? "",
    model: doc?.model ?? "",
    basicPrice: paiseToInput(doc?.basicPrice),
    salesMeasure: doc?.salesMeasure ? paiseToInput(doc.salesMeasure) : "",
    demoDiscount: doc?.demoDiscount ? paiseToInput(doc.demoDiscount) : "",
    lossAllowance: doc?.lossAllowance ? paiseToInput(doc.lossAllowance) : "",
    lockInDays: doc?.lockInDays !== undefined ? String(doc.lockInDays) : "",
    saleDate: dateToInput(doc?.saleDate),
    soldTo: doc?.soldTo ?? "",
    salePrice: paiseToInput(doc?.salePrice),
    lossClaim: doc?.lossClaim ? paiseToInput(doc.lossClaim) : "",
    saleSalesMeasure: doc?.saleSalesMeasure ? paiseToInput(doc.saleSalesMeasure) : "",
    invoiceNo: doc?.invoiceNo ?? "",
    invoiceDate: dateToInput(doc?.invoiceDate),
    notes: doc?.notes ?? "",
  };
}

/* ----------------------------------------------------------------- pre-owned */

export const preownedSections: SectionDef[] = [
  {
    title: "Car",
    fields: [
      chassis,
      { name: "registrationNo", label: "Registration no", type: "code", maxLength: 20 },
      { name: "make", label: "Make", type: "text", list: "preownedMake", required: true, maxLength: 60 },
      { name: "model", label: "Model", type: "text", required: true, maxLength: 80 },
      { name: "yearOfMake", label: "Year of make", type: "number", maxLength: 4 },
      {
        name: "intendedUse",
        label: "Use",
        type: "select",
        required: true,
        options: PREOWNED_USES.map((u) => ({ value: u, label: PREOWNED_USE_LABELS[u] })),
        hint: "Taken in exchange for a new car, or bought to resell",
      },
    ],
  },
  {
    title: "Purchase",
    fields: [
      { name: "sellerName", label: "Bought from", type: "text", required: true },
      { name: "purchaseDate", label: "Date of purchase", type: "date", required: true },
      { name: "purchasePrice", label: "Purchase price", type: "money", required: true },
    ],
  },
  {
    title: "Sale",
    description: "Record the sale once the car is sold. Finance and insurance payouts can only be added after this.",
    fields: [
      { name: "saleDate", label: "Sale date", type: "date" },
      { name: "buyerName", label: "Sold to", type: "text" },
      { name: "salePrice", label: "Sale price", type: "money" },
      notes,
    ],
  },
];

export function preownedValues(doc?: PreownedDoc | null): Record<string, string> {
  return {
    chassisNumber: doc?.chassisNumber ?? "",
    registrationNo: doc?.registrationNo ?? "",
    make: doc?.make ?? "Mercedes-Benz",
    model: doc?.model ?? "",
    yearOfMake: doc?.yearOfMake ? String(doc.yearOfMake) : "",
    intendedUse: doc?.intendedUse ?? "resale",
    sellerName: doc?.sellerName ?? "",
    purchaseDate: dateToInput(doc?.purchaseDate),
    purchasePrice: paiseToInput(doc?.purchasePrice),
    saleDate: dateToInput(doc?.saleDate),
    buyerName: doc?.buyerName ?? "",
    salePrice: paiseToInput(doc?.salePrice),
    notes: doc?.notes ?? "",
  };
}

/* ------------------------------------------------------------------- payouts */

const dealRef: FieldDef = {
  name: "dealRef",
  label: "Commission no / pre-owned stock no",
  type: "code",
  required: true,
  immutable: true,
};

const claimSection: SectionDef = {
  title: "Incentive & invoice",
  description: "Total = incentive + GST. Entering the invoice no marks the invoice as raised; the receipt is recorded after that.",
  fields: [
    { name: "claimAmount", label: "Incentive amount", type: "money", required: true },
    { name: "claimGst", label: "GST", type: "computed", formula: "claim.gst" },
    { name: "claimTotal", label: "Total", type: "computed", formula: "claim.total", wide: true },
    { name: "invoiceNo", label: "Invoice no", type: "code" },
    { name: "invoiceDate", label: "Invoice date", type: "date" },
    notes,
  ],
};

function claimValues(doc?: Partial<ClaimFields> & { notes?: string } | null) {
  return {
    claimAmount: paiseToInput(doc?.claimAmount),
    invoiceNo: doc?.invoiceNo ?? "",
    invoiceDate: dateToInput(doc?.invoiceDate),
    notes: doc?.notes ?? "",
  };
}

export const financeSections: SectionDef[] = [
  {
    title: "Finance",
    fields: [
      dealRef,
      { name: "provider", label: "Finance provider", type: "text", list: "financeProvider", required: true, hint: "Bank / NBFC, e.g. ICICI Bank" },
      { name: "loanAmount", label: "Loan value", type: "money", required: true, hint: "Capped at a share of the car value, set in Constants" },
      { name: "contractNo", label: "Contract no", type: "code", required: true },
      { name: "disbursalDate", label: "Disbursal date", type: "date", required: true },
    ],
  },
  claimSection,
];

/** Finance sections with the car's price, GST, total and loan cap shown under the loan value. */
export function financeSectionsFor(deal: { carPrice?: number; carGst?: number; carValue?: number } | null, loanCapBp: number): SectionDef[] {
  if (deal?.carValue === undefined) return financeSections;
  const cap = percentOf(deal.carValue, loanCapBp);
  const hint =
    `Car price ${formatMoney(deal.carPrice)} + GST ${formatMoney(deal.carGst ?? 0)} = total ${formatMoney(deal.carValue)}. ` +
    `Loan up to ${formatMoney(cap)} (${loanCapBp / 100}% of total).`;
  return financeSections.map((sec) => ({
    ...sec,
    fields: sec.fields.map((fd) => (fd.name === "loanAmount" ? { ...fd, hint } : fd)),
  }));
}

export function financeValues(doc?: FinanceDoc | null, ref?: string): Record<string, string> {
  return {
    dealRef: doc?.dealRef ?? ref ?? "",
    provider: doc?.provider ?? "",
    loanAmount: paiseToInput(doc?.loanAmount),
    contractNo: doc?.contractNo ?? "",
    disbursalDate: dateToInput(doc?.disbursalDate),
    ...claimValues(doc),
  };
}

const policyFields: FieldDef[] = [
  { name: "policyNumber", label: "Policy no", type: "code", maxLength: 60 },
  { name: "odPremium", label: "OD premium", type: "money", required: true, hint: "Own-damage premium (the insurance amount)" },
  { name: "policyStartDate", label: "Policy start date", type: "date", required: true },
  { name: "policyEndDate", label: "Policy end date", type: "date", required: true, hint: "Drives the renewal reminders" },
];

export const insuranceSections: SectionDef[] = [
  {
    title: "Policy",
    fields: [
      dealRef,
      { name: "provider", label: "Insurance provider", type: "text", list: "insuranceProvider", required: true },
      ...policyFields,
    ],
  },
  claimSection,
];

/** The provider is not entered: it is the insurer the car is insured with (shown read-only). */
export const renewalSections: SectionDef[] = [
  {
    title: "Renewed policy",
    description: "Only cars insured with us can be renewed here. The insurance provider is picked up from the car's insurance.",
    fields: [
      chassis,
      { name: "provider", label: "Insurance provider", type: "text", hint: "Picked up from the car's insurance with us" },
      ...policyFields,
    ],
  },
  claimSection,
];

export function policyValues(
  doc?: InsuranceDoc | RenewalDoc | null,
  prefill?: { dealRef?: string; chassisNumber?: string; provider?: string; policyStartDate?: string },
): Record<string, string> {
  return {
    dealRef: (doc && "dealRef" in doc ? doc.dealRef : undefined) ?? prefill?.dealRef ?? "",
    chassisNumber: doc?.chassisNumber ?? prefill?.chassisNumber ?? "",
    provider: doc?.provider ?? prefill?.provider ?? "",
    policyNumber: doc?.policyNumber ?? "",
    odPremium: paiseToInput(doc?.odPremium),
    policyStartDate: dateToInput(doc?.policyStartDate) || (prefill?.policyStartDate ?? ""),
    policyEndDate: dateToInput(doc?.policyEndDate),
    ...claimValues(doc),
  };
}
