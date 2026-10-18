const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

const dateFmt = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const dateTimeFmt = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Kolkata",
});

export function formatMoney(paise: number | undefined | null): string {
  if (paise === undefined || paise === null) return "—";
  return inr.format(paise / 100);
}

export function formatDate(d: Date | undefined | null): string {
  return d ? dateFmt.format(d) : "—";
}

export function formatDateTime(d: Date | undefined | null): string {
  return d ? dateTimeFmt.format(d) : "—";
}

/** Paise → plain rupee string for an <input>. */
export function paiseToInput(paise: number | undefined | null): string {
  if (paise === undefined || paise === null) return "";
  const rupees = Math.trunc(paise / 100);
  const rest = paise % 100;
  return rest === 0 ? String(rupees) : `${rupees}.${String(rest).padStart(2, "0")}`;
}

/** UTC calendar date → yyyy-mm-dd for <input type="date">. */
export function dateToInput(d: Date | undefined | null): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

export function daysSince(d: Date, now = new Date()): number {
  return Math.floor((now.getTime() - d.getTime()) / 86_400_000);
}
