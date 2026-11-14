import { z } from "zod";
import { GRADES, PREOWNED_USES } from "@/lib/types";
import { PERMISSIONS, ROLES, normalizePermissions } from "@/lib/permissions";
import {
  chassisField,
  checkboxField,
  codeField,
  dateField,
  enumField,
  moneyField,
  moneyOrZeroField,
  optionalCodeField,
  optionalDateField,
  optionalIntField,
  optionalMoneyField,
  optionalText,
  percentField,
  refineInvoice,
  requiredText,
} from "./fields";

/* Field names must match the form definitions in lib/forms.ts. */

/* ---------------------------------------------------------------- purchases */

export const purchaseSchema = z
  .object({
    commissionNo: codeField("Commission no"),
    chassisNumber: chassisField,
    purchaseDate: dateField("Date of purchase"),
    // Normalised against the built-ins and the admin's list in the repository.
    type: requiredText("Type", 40),
    location: requiredText("Location", 80),
    customerName: optionalText("Customer name", 120),
    benzInvoiceNo: optionalCodeField("Mercedes-Benz invoice no"),
    grade: enumField(GRADES, "Grade"),
    carClass: requiredText("Class", 60),
    model: requiredText("Model", 80),
    basicPrice: moneyField("Basic price"),
    salesMeasure: moneyOrZeroField("Sales measure"),
    demoDiscount: moneyOrZeroField("Demo discount"),
    lossAllowance: moneyOrZeroField("Loss allowance"),
    lockInDays: optionalIntField("Lock-in period", 0, 730),
    saleDate: optionalDateField("Sale date"),
    soldTo: optionalText("Sold to", 120),
    salePrice: optionalMoneyField("Selling price"),
    lossClaim: optionalMoneyField("Loss claim"),
    saleSalesMeasure: optionalMoneyField("Sales measure on sale"),
    invoiceNo: optionalCodeField("Invoice no"),
    invoiceDate: optionalDateField("Invoice date"),
    notes: optionalText("Notes", 1000),
  })
  .superRefine((d, ctx) => {
    if (d.salesMeasure + d.demoDiscount + d.lossAllowance > d.basicPrice) {
      ctx.addIssue({ code: "custom", path: ["basicPrice"], message: "Deductions add up to more than the basic price" });
    }
    if (d.type.trim().toLowerCase() === "new") {
      if (!d.customerName) {
        ctx.addIssue({ code: "custom", path: ["customerName"], message: "Customer name is required for a new car (it is booked for them)" });
      }
      refineInvoice(d, ctx, { date: d.purchaseDate, label: "date of purchase" });
    } else {
      if (d.saleDate && !d.soldTo) ctx.addIssue({ code: "custom", path: ["soldTo"], message: "Who was it sold to?" });
      if (d.saleDate && d.salePrice === undefined) ctx.addIssue({ code: "custom", path: ["salePrice"], message: "Enter the selling price" });
      if (!d.saleDate && (d.soldTo || d.salePrice !== undefined || d.lossClaim !== undefined || d.saleSalesMeasure !== undefined)) {
        ctx.addIssue({ code: "custom", path: ["saleDate"], message: "Sale date is required to record a sale" });
      }
      if (d.saleDate && d.saleDate < d.purchaseDate) {
        ctx.addIssue({ code: "custom", path: ["saleDate"], message: "Sale date cannot be before the date of purchase" });
      }
    }
  });
export type PurchaseInput = z.output<typeof purchaseSchema>;

/* ----------------------------------------------------------------- pre-owned */

export const preownedSchema = z
  .object({
    chassisNumber: chassisField,
    registrationNo: optionalCodeField("Registration no", 20),
    make: requiredText("Make", 60),
    model: requiredText("Model", 80),
    yearOfMake: optionalIntField("Year of make", 1980, 2100),
    sellerName: requiredText("Bought from", 120),
    purchaseDate: dateField("Date of purchase"),
    purchasePrice: moneyField("Purchase price"),
    intendedUse: enumField(PREOWNED_USES, "Use"),
    saleDate: optionalDateField("Sale date"),
    buyerName: optionalText("Sold to", 120),
    salePrice: optionalMoneyField("Sale price"),
    notes: optionalText("Notes", 1000),
  })
  .superRefine((d, ctx) => {
    if (d.saleDate && !d.buyerName) ctx.addIssue({ code: "custom", path: ["buyerName"], message: "Who was it sold to?" });
    if (!d.saleDate && (d.buyerName || d.salePrice !== undefined)) {
      ctx.addIssue({ code: "custom", path: ["saleDate"], message: "Sale date is required to record a sale" });
    }
    if (d.saleDate && d.saleDate < d.purchaseDate) {
      ctx.addIssue({ code: "custom", path: ["saleDate"], message: "Sale date cannot be before the date of purchase" });
    }
  });
export type PreownedInput = z.output<typeof preownedSchema>;

/* ------------------------------------------------------------------- payouts */

const claimFields = {
  claimAmount: moneyField("Incentive amount"),
  invoiceNo: optionalCodeField("Invoice no"),
  invoiceDate: optionalDateField("Invoice date"),
  notes: optionalText("Notes", 1000),
};

export const financeSchema = z
  .object({
    dealRef: codeField("Commission / stock no"),
    provider: requiredText("Finance provider"),
    loanAmount: moneyField("Loan value"),
    contractNo: codeField("Contract no"),
    disbursalDate: dateField("Disbursal date"),
    ...claimFields,
  })
  .superRefine((d, ctx) => refineInvoice(d, ctx, { date: d.disbursalDate, label: "disbursal date" }));
export type FinanceInput = z.output<typeof financeSchema>;

const policyFields = {
  policyNumber: optionalCodeField("Policy no", 60),
  odPremium: moneyField("OD premium"),
  policyStartDate: dateField("Policy start date", { allowFuture: true }),
  policyEndDate: dateField("Policy end date", { allowFuture: true }),
  ...claimFields,
};

function refinePolicy(d: { policyStartDate: Date; policyEndDate: Date; invoiceNo?: string; invoiceDate?: Date }, ctx: z.RefinementCtx) {
  if (d.policyEndDate <= d.policyStartDate) {
    ctx.addIssue({ code: "custom", path: ["policyEndDate"], message: "Policy end date must be after the start date" });
  }
  refineInvoice(d, ctx);
}

export const insuranceSchema = z
  .object({ dealRef: codeField("Commission / stock no"), provider: requiredText("Insurance provider"), ...policyFields })
  .superRefine(refinePolicy);
export type InsuranceInput = z.output<typeof insuranceSchema>;

export const renewalSchema = z.object({ chassisNumber: chassisField, ...policyFields }).superRefine(refinePolicy);
export type RenewalInput = z.output<typeof renewalSchema>;

/** One payment against a raised invoice. TDS defaults on the server (full TDS on the first receipt, none after). */
export const receiptSchema = z.object({
  tdsAmount: optionalMoneyField("TDS"),
  receivedAmount: moneyOrZeroField("Amount received"),
  receiptNo: codeField("Receipt no"),
  receiptDate: dateField("Receipt date"),
});
export type ReceiptInput = z.output<typeof receiptSchema>;

/* ----------------------------------------------------------------- constants */

export const settingsSchema = z.object({
  fcRateBp: percentField("Fixed compensation", 20),
  purchaseGstRateBp: percentField("Purchase GST"),
  evPurchaseGstRateBp: percentField("Purchase GST on EVs"),
  saleGstRateBp: percentField("GST on selling price"),
  serviceGstRateBp: percentField("GST on invoices"),
  fcTdsRateBp: percentField("TDS by Mercedes-Benz", 20),
  financeTdsRateBp: percentField("TDS by finance providers", 20),
  insuranceTdsRateBp: percentField("TDS by insurers", 20),
  demoLockInDays: optionalIntField("Demo lock-in", 0, 730).pipe(z.number({ message: "Demo lock-in is required" })),
});
export type SettingsInput = z.output<typeof settingsSchema>;

/** One admin option list: mode + one option per line. */
export const optionListSchema = z.object({
  mode: z.enum(["text", "dropdown"], { message: "Choose text box or drop-down" }),
  options: z
    .string()
    .max(20_000, "The list is too long")
    .optional()
    .transform((v) => (v ?? "").split("\n")),
});

export const loginSchema = z.object({
  username: z.string().trim().toLowerCase().min(1, "Username is required").max(64),
  password: z.string().min(1, "Password is required").max(200),
});

/* ------------------------------------------------------------------- users */

export const usernameField = z
  .string({ message: "Username is required" })
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9._-]{2,31}$/, "3-32 characters: letters, digits, dot, dash or underscore");

export const newPasswordField = z
  .string({ message: "Password is required" })
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must be at most 128 characters")
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), "Password must contain a letter and a number");

const roleField = enumField(ROLES, "Role");
const permissionsField = z.array(z.string().max(40)).max(PERMISSIONS.length * 2).transform(normalizePermissions);

function confirmMatches(data: { password: string; confirmPassword: string }, ctx: z.RefinementCtx) {
  if (data.password !== data.confirmPassword) {
    ctx.addIssue({ code: "custom", path: ["confirmPassword"], message: "Passwords do not match" });
  }
}

export const createUserSchema = z
  .object({
    username: usernameField,
    password: newPasswordField,
    confirmPassword: z.string(),
    role: roleField,
    permissions: permissionsField,
  })
  .superRefine(confirmMatches);
export type CreateUserInput = z.output<typeof createUserSchema>;

export const userAccessSchema = z.object({
  role: roleField,
  active: checkboxField,
  permissions: permissionsField,
});
export type UserAccessInput = z.output<typeof userAccessSchema>;

export const resetPasswordSchema = z
  .object({ password: newPasswordField, confirmPassword: z.string() })
  .superRefine(confirmMatches);

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password").max(200),
    password: newPasswordField,
    confirmPassword: z.string(),
  })
  .superRefine((data, ctx) => {
    confirmMatches(data, ctx);
    if (data.password === data.currentPassword) {
      ctx.addIssue({ code: "custom", path: ["password"], message: "New password must differ from the current one" });
    }
  });
