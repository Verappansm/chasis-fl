import type { SectionDef } from "@/components/record-form";
import { dateToInput, paiseToInput } from "@/lib/format";
import {
  PAYEE_TYPES,
  PAYEE_TYPE_LABELS,
  RENEWAL_STATUSES,
  RENEWAL_STATUS_LABELS,
  type FinanceDoc,
  type IncentiveDoc,
  type InsuranceDoc,
  type RenewalDoc,
  type VehicleDoc,
} from "@/lib/types";

/* Field names here must match the zod schemas in lib/validation/schemas.ts. */

const chassis = { name: "chassisNumber", label: "Chassis number", type: "chassis", required: true, immutable: true } as const;

export const financeSections: SectionDef[] = [
  {
    title: "Vehicle",
    description: "Purchase and selling price are stored on the vehicle, against the chassis number.",
    fields: [
      chassis,
      { name: "model", label: "Model / variant", type: "text", maxLength: 80 },
      { name: "purchasePrice", label: "Purchase price", type: "money" },
      { name: "sellingPrice", label: "Selling price", type: "money" },
      { name: "customerName", label: "Customer name", type: "text", wide: true },
    ],
  },
  {
    title: "Finance",
    fields: [
      { name: "provider", label: "Finance provider", type: "text", required: true, hint: "Bank / NBFC, e.g. HDFC Bank" },
      { name: "loanAmount", label: "Loan amount", type: "money", hint: "Disbursed loan amount (optional)" },
    ],
  },
  {
    title: "Finance incentive",
    description: "Payout due from the finance provider for this case.",
    fields: [
      { name: "incentiveAmount", label: "Incentive amount", type: "money", required: true },
      { name: "initiatedDate", label: "Date initiated", type: "date", required: true },
      { name: "incentiveReceived", label: "Incentive received", type: "checkbox" },
      { name: "receivedDate", label: "Date received", type: "date", enabledBy: "incentiveReceived" },
      { name: "notes", label: "Notes", type: "textarea", wide: true },
    ],
  },
];

export function financeValues(doc?: FinanceDoc, vehicle?: VehicleDoc | null): Record<string, string> {
  return {
    chassisNumber: doc?.chassisNumber ?? "",
    model: vehicle?.model ?? "",
    purchasePrice: paiseToInput(vehicle?.purchasePrice),
    sellingPrice: paiseToInput(vehicle?.sellingPrice),
    customerName: vehicle?.customerName ?? "",
    provider: doc?.provider ?? "",
    loanAmount: paiseToInput(doc?.loanAmount),
    incentiveAmount: paiseToInput(doc?.incentiveAmount),
    initiatedDate: dateToInput(doc?.initiatedDate),
    incentiveReceived: doc?.incentiveReceived ? "on" : "",
    receivedDate: dateToInput(doc?.receivedDate),
    notes: doc?.notes ?? "",
  };
}

export const insuranceSections: SectionDef[] = [
  {
    title: "Policy",
    fields: [
      chassis,
      { name: "provider", label: "Insurance provider", type: "text", required: true },
      { name: "policyNumber", label: "Policy number", type: "text", maxLength: 60 },
      {
        name: "policyType",
        label: "Policy type",
        type: "select",
        required: true,
        options: [
          { value: "new", label: "New vehicle" },
          { value: "renewal", label: "Renewal" },
        ],
      },
      { name: "premiumAmount", label: "Insurance amount (premium)", type: "money", required: true },
      { name: "policyStartDate", label: "Policy start date", type: "date" },
      { name: "policyEndDate", label: "Policy end date", type: "date", hint: "Drives the renewal reminders" },
    ],
  },
  {
    title: "Insurance incentive",
    description: "Commission due from the insurer / broker for this policy.",
    fields: [
      { name: "incentiveAmount", label: "Insurance incentive amount", type: "money", required: true },
      { name: "initiatedDate", label: "Date initiated", type: "date", required: true },
      { name: "incentiveReceived", label: "Incentive received", type: "checkbox" },
      { name: "receivedDate", label: "Date received", type: "date", enabledBy: "incentiveReceived" },
      { name: "notes", label: "Notes", type: "textarea", wide: true },
    ],
  },
];

export function insuranceValues(doc?: InsuranceDoc): Record<string, string> {
  return {
    chassisNumber: doc?.chassisNumber ?? "",
    provider: doc?.provider ?? "",
    policyNumber: doc?.policyNumber ?? "",
    policyType: doc?.policyType ?? "new",
    premiumAmount: paiseToInput(doc?.premiumAmount),
    policyStartDate: dateToInput(doc?.policyStartDate),
    policyEndDate: dateToInput(doc?.policyEndDate),
    incentiveAmount: paiseToInput(doc?.incentiveAmount),
    initiatedDate: dateToInput(doc?.initiatedDate),
    incentiveReceived: doc?.incentiveReceived ? "on" : "",
    receivedDate: dateToInput(doc?.receivedDate),
    notes: doc?.notes ?? "",
  };
}

export const incentiveSections: SectionDef[] = [
  {
    title: "Incentive payout",
    description: "Money paid out by the dealership against a chassis.",
    fields: [
      chassis,
      { name: "amount", label: "Incentive amount", type: "money", required: true },
      { name: "paidTo", label: "Paid to", type: "text", required: true, hint: "Person or firm name" },
      {
        name: "payeeType",
        label: "Payee type",
        type: "select",
        required: true,
        options: PAYEE_TYPES.map((t) => ({ value: t, label: PAYEE_TYPE_LABELS[t] })),
      },
      { name: "paidDate", label: "Paid date", type: "date", required: true },
      { name: "reference", label: "Payment reference", type: "text", hint: "UTR / cheque no.", maxLength: 80 },
      { name: "notes", label: "Notes", type: "textarea", wide: true },
    ],
  },
];

export function incentiveValues(doc?: IncentiveDoc): Record<string, string> {
  return {
    chassisNumber: doc?.chassisNumber ?? "",
    amount: paiseToInput(doc?.amount),
    paidTo: doc?.paidTo ?? "",
    payeeType: doc?.payeeType ?? "sales_executive",
    paidDate: dateToInput(doc?.paidDate),
    reference: doc?.reference ?? "",
    notes: doc?.notes ?? "",
  };
}

export const renewalSections: SectionDef[] = [
  {
    title: "Renewal follow-up",
    fields: [
      chassis,
      { name: "dueDate", label: "Renewal due date", type: "date", required: true, hint: "Usually the current policy's end date" },
      {
        name: "status",
        label: "Status",
        type: "select",
        required: true,
        options: RENEWAL_STATUSES.map((s) => ({ value: s, label: RENEWAL_STATUS_LABELS[s] })),
      },
      { name: "followUpDate", label: "Next follow-up date", type: "date" },
      { name: "notes", label: "Notes", type: "textarea", wide: true, hint: "Customer response, quote given, reason lost…" },
    ],
  },
];

export function renewalValues(doc?: RenewalDoc, prefill?: { chassisNumber?: string; dueDate?: string }): Record<string, string> {
  return {
    chassisNumber: doc?.chassisNumber ?? prefill?.chassisNumber ?? "",
    dueDate: dateToInput(doc?.dueDate) || (prefill?.dueDate ?? ""),
    status: doc?.status ?? "due",
    followUpDate: dateToInput(doc?.followUpDate),
    notes: doc?.notes ?? "",
  };
}
