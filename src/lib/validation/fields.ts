import { z } from "zod";

/** Business timezone; "today" for date rules is evaluated in IST. */
export const BUSINESS_TZ = "Asia/Kolkata";

export function todayIso(): string {
  // en-CA formats as yyyy-mm-dd
  return new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TZ }).format(new Date());
}

export const MAX_RUPEES = 100_000_000; // ₹10 crore — anything above is almost certainly a typo

export function normalizeChassis(raw: string): string {
  return raw.replace(/[\s-]/g, "").toUpperCase();
}

export const chassisField = z
  .string({ message: "Chassis number is required" })
  .transform(normalizeChassis)
  .pipe(
    z
      .string()
      .min(1, "Chassis number is required")
      .regex(/^[A-Z0-9]{6,20}$/, "Chassis number must be 6–20 letters/digits"),
  );

export function requiredText(label: string, max = 120) {
  return z
    .string({ message: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be at most ${max} characters`);
}

export function optionalText(label: string, max = 500) {
  return z
    .string()
    .trim()
    .max(max, `${label} must be at most ${max} characters`)
    .optional()
    .transform((v) => (v ? v : undefined));
}

const MONEY_RE = /^\d{1,9}(\.\d{1,2})?$/;

function toPaise(raw: string, label: string, ctx: z.RefinementCtx): number {
  const cleaned = raw.replace(/[,\s₹]/g, "");
  if (!MONEY_RE.test(cleaned)) {
    ctx.addIssue({ code: "custom", message: `${label} must be a positive amount with up to 2 decimals` });
    return z.NEVER;
  }
  const [rupees, fraction = ""] = cleaned.split(".");
  const paise = Number(rupees) * 100 + Number(fraction.padEnd(2, "0"));
  if (paise > MAX_RUPEES * 100) {
    ctx.addIssue({ code: "custom", message: `${label} exceeds ₹10 crore — please check` });
    return z.NEVER;
  }
  return paise;
}

/** Rupee string in, integer paise out. */
export function moneyField(label: string) {
  return z
    .string({ message: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)
    .transform((v, ctx) => toPaise(v, label, ctx));
}

export function optionalMoneyField(label: string) {
  return z
    .string()
    .trim()
    .optional()
    .transform((v, ctx) => (v ? toPaise(v, label, ctx) : undefined));
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function toDate(raw: string, label: string, allowFuture: boolean, ctx: z.RefinementCtx): Date {
  const d = new Date(`${raw}T00:00:00.000Z`);
  if (!DATE_RE.test(raw) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== raw) {
    ctx.addIssue({ code: "custom", message: `${label} is not a valid date` });
    return z.NEVER;
  }
  if (raw < "2000-01-01") {
    ctx.addIssue({ code: "custom", message: `${label} is too far in the past` });
    return z.NEVER;
  }
  if (!allowFuture && raw > todayIso()) {
    ctx.addIssue({ code: "custom", message: `${label} cannot be in the future` });
    return z.NEVER;
  }
  return d;
}

export function dateField(label: string, { allowFuture = false } = {}) {
  return z
    .string({ message: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)
    .transform((v, ctx) => toDate(v, label, allowFuture, ctx));
}

export function optionalDateField(label: string, { allowFuture = false } = {}) {
  return z
    .string()
    .trim()
    .optional()
    .transform((v, ctx) => (v ? toDate(v, label, allowFuture, ctx) : undefined));
}

/** HTML checkbox: present ("on") = true, absent = false. */
export const checkboxField = z
  .enum(["on", "true", "false"])
  .optional()
  .transform((v) => v === "on" || v === "true");

export function enumField<const T extends readonly [string, ...string[]]>(values: T, label: string) {
  return z.enum(values, { message: `Select a valid ${label.toLowerCase()}` });
}

/** Shared rule for "incentive received" flags. */
export function refineReceived(
  data: { incentiveReceived: boolean; initiatedDate: Date; receivedDate?: Date },
  ctx: z.RefinementCtx,
) {
  if (data.incentiveReceived && !data.receivedDate) {
    ctx.addIssue({
      code: "custom",
      path: ["receivedDate"],
      message: "Received date is required when the incentive is marked received",
    });
  }
  if (!data.incentiveReceived && data.receivedDate) {
    ctx.addIssue({
      code: "custom",
      path: ["receivedDate"],
      message: "Tick \"Incentive received\" or clear the received date",
    });
  }
  if (data.receivedDate && data.receivedDate < data.initiatedDate) {
    ctx.addIssue({
      code: "custom",
      path: ["receivedDate"],
      message: "Received date cannot be before the initiated date",
    });
  }
}
