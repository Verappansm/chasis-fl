import { z } from "zod";
import { PAYEE_TYPES, POLICY_TYPES, RENEWAL_STATUSES } from "@/lib/types";
import { PERMISSIONS, ROLES, normalizePermissions } from "@/lib/permissions";
import {
  chassisField,
  checkboxField,
  dateField,
  enumField,
  moneyField,
  optionalDateField,
  optionalMoneyField,
  optionalText,
  refineReceived,
  requiredText,
} from "./fields";

export const financeSchema = z
  .object({
    chassisNumber: chassisField,
    provider: requiredText("Finance provider"),
    loanAmount: optionalMoneyField("Loan amount"),
    incentiveAmount: moneyField("Incentive amount"),
    incentiveReceived: checkboxField,
    initiatedDate: dateField("Date initiated"),
    receivedDate: optionalDateField("Date received"),
    purchasePrice: optionalMoneyField("Purchase price"),
    sellingPrice: optionalMoneyField("Selling price"),
    model: optionalText("Model", 80),
    customerName: optionalText("Customer name", 120),
    notes: optionalText("Notes", 1000),
  })
  .superRefine(refineReceived);
export type FinanceInput = z.output<typeof financeSchema>;

export const insuranceSchema = z
  .object({
    chassisNumber: chassisField,
    provider: requiredText("Insurance provider"),
    policyNumber: optionalText("Policy number", 60),
    policyType: enumField(POLICY_TYPES, "Policy type"),
    premiumAmount: moneyField("Insurance amount"),
    incentiveAmount: moneyField("Insurance incentive amount"),
    incentiveReceived: checkboxField,
    initiatedDate: dateField("Date initiated"),
    receivedDate: optionalDateField("Date received"),
    policyStartDate: optionalDateField("Policy start date", { allowFuture: true }),
    policyEndDate: optionalDateField("Policy end date", { allowFuture: true }),
    notes: optionalText("Notes", 1000),
  })
  .superRefine((data, ctx) => {
    refineReceived(data, ctx);
    if (data.policyStartDate && data.policyEndDate && data.policyEndDate <= data.policyStartDate) {
      ctx.addIssue({
        code: "custom",
        path: ["policyEndDate"],
        message: "Policy end date must be after the start date",
      });
    }
  });
export type InsuranceInput = z.output<typeof insuranceSchema>;

export const incentiveSchema = z.object({
  chassisNumber: chassisField,
  amount: moneyField("Incentive amount"),
  paidTo: requiredText("Paid to"),
  payeeType: enumField(PAYEE_TYPES, "Payee type"),
  paidDate: dateField("Paid date"),
  reference: optionalText("Payment reference", 80),
  notes: optionalText("Notes", 1000),
});
export type IncentiveInput = z.output<typeof incentiveSchema>;

export const renewalSchema = z.object({
  chassisNumber: chassisField,
  dueDate: dateField("Renewal due date", { allowFuture: true }),
  status: enumField(RENEWAL_STATUSES, "Status"),
  followUpDate: optionalDateField("Follow-up date", { allowFuture: true }),
  notes: optionalText("Notes", 1000),
});
export type RenewalInput = z.output<typeof renewalSchema>;

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
