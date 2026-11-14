/**
 * Role-based access control. Shared by server (enforcement) and client (UI hints).
 *
 * - `admin`: every permission, plus user management and constants. Not configurable.
 * - `user`:  exactly the permissions granted on their account.
 *
 * Tabs that run the invoice → receipt loop split "edit" in two:
 * - `invoice`: create and edit the record, up to and including raising the invoice.
 * - `receipt`: record the receipt (TDS, amount received) once the invoice is raised.
 * Pre-owned has no invoice loop, so it keeps a single `edit`.
 * Every action implies `view`.
 */

export const ROLES = ["admin", "user"] as const;
export type Role = (typeof ROLES)[number];
export const ROLE_LABELS: Record<Role, string> = { admin: "Admin", user: "User" };

export const MODULES = [
  { key: "purchases", label: "Purchase", href: "/purchases", actions: ["view", "invoice", "receipt", "delete"] },
  { key: "preowned", label: "Pre-owned", href: "/preowned", actions: ["view", "edit", "delete"] },
  { key: "finance", label: "Finance payout", href: "/finance", actions: ["view", "invoice", "receipt", "delete"] },
  { key: "insurance", label: "Insurance payout", href: "/insurance", actions: ["view", "invoice", "receipt", "delete"] },
  { key: "renewals", label: "Renewal payout", href: "/renewals", actions: ["view", "invoice", "receipt", "delete"] },
] as const;
export type ModuleKey = (typeof MODULES)[number]["key"];
/** Modules that run the invoice → receipt loop. */
export type ClaimModuleKey = "purchases" | "finance" | "insurance" | "renewals";

export const PERMISSIONS = [
  "overview:view",
  "purchases:view",
  "purchases:invoice",
  "purchases:receipt",
  "purchases:delete",
  "preowned:view",
  "preowned:edit",
  "preowned:delete",
  "finance:view",
  "finance:invoice",
  "finance:receipt",
  "finance:delete",
  "insurance:view",
  "insurance:invoice",
  "insurance:receipt",
  "insurance:delete",
  "renewals:view",
  "renewals:invoice",
  "renewals:receipt",
  "renewals:delete",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const PERMISSION_SET = new Set<string>(PERMISSIONS);

export function isPermission(p: string): p is Permission {
  return PERMISSION_SET.has(p);
}

/**
 * Drops unknown values, adds implied `view`, de-duplicates, stable order.
 * Accounts saved before the invoice/receipt split hold `<module>:edit`; that
 * meant full editing, so it becomes invoice + receipt.
 */
export function normalizePermissions(input: readonly string[]): Permission[] {
  const granted = new Set<string>();
  for (const p of input) {
    if (isPermission(p)) granted.add(p);
    else if (p.endsWith(":edit")) {
      const mod = p.slice(0, -":edit".length);
      for (const a of ["invoice", "receipt"]) if (isPermission(`${mod}:${a}`)) granted.add(`${mod}:${a}`);
    }
  }
  for (const p of [...granted]) {
    const [mod, action] = p.split(":");
    if (action !== "view") granted.add(`${mod}:view`);
  }
  return PERMISSIONS.filter((p) => granted.has(p));
}

export interface Principal {
  role: Role;
  permissions: readonly Permission[];
}

export function effectivePermissions(role: Role, granted: readonly string[] | undefined): Permission[] {
  return role === "admin" ? [...PERMISSIONS] : normalizePermissions(granted ?? []);
}

export function can(user: Principal, permission: Permission): boolean {
  return user.role === "admin" || user.permissions.includes(permission);
}

/** Where to land after login / when a page is not allowed. */
export function homePath(user: Principal): string {
  if (can(user, "overview:view")) return "/overview";
  const mod = MODULES.find((m) => can(user, `${m.key}:view`));
  return mod ? mod.href : "/no-access";
}

const all = (action: string) =>
  MODULES.filter((m) => (m.actions as readonly string[]).includes(action)).map((m) => `${m.key}:${action}`);

/** Quick-fill presets for the permission matrix (UI convenience only). */
export const PERMISSION_PRESETS: { key: string; label: string; permissions: Permission[] }[] = [
  { key: "read", label: "Read only", permissions: normalizePermissions(["overview:view", ...all("view")]) },
  {
    key: "sales",
    label: "Sales desk (up to invoice)",
    permissions: normalizePermissions(["overview:view", ...all("invoice"), "preowned:edit"]),
  },
  { key: "accounts", label: "Accounts (receipts)", permissions: normalizePermissions(["overview:view", ...all("view"), ...all("receipt")]) },
  { key: "full", label: "All data access", permissions: [...PERMISSIONS] },
  { key: "none", label: "Clear", permissions: [] },
];
