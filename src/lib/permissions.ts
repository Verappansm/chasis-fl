/**
 * Role-based access control. Shared by server (enforcement) and client (UI hints).
 *
 * - `admin`: every permission, plus user management. Not configurable.
 * - `user`:  exactly the permissions granted on their account.
 *
 * Within a module, `edit` (create + update) and `delete` both imply `view`.
 */

export const ROLES = ["admin", "user"] as const;
export type Role = (typeof ROLES)[number];
export const ROLE_LABELS: Record<Role, string> = { admin: "Admin", user: "User" };

export const MODULES = [
  { key: "finance", label: "Finance", href: "/finance" },
  { key: "insurance", label: "Insurance", href: "/insurance" },
  { key: "renewals", label: "Renewal", href: "/renewals" },
  { key: "incentives", label: "Incentive", href: "/incentives" },
] as const;
export type ModuleKey = (typeof MODULES)[number]["key"];

export const PERMISSIONS = [
  "overview:view",
  "finance:view",
  "finance:edit",
  "finance:delete",
  "insurance:view",
  "insurance:edit",
  "insurance:delete",
  "renewals:view",
  "renewals:edit",
  "renewals:delete",
  "incentives:view",
  "incentives:edit",
  "incentives:delete",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const PERMISSION_SET = new Set<string>(PERMISSIONS);

export function isPermission(p: string): p is Permission {
  return PERMISSION_SET.has(p);
}

/** Drops unknown values, adds implied `view`, de-duplicates, stable order. */
export function normalizePermissions(input: readonly string[]): Permission[] {
  const granted = new Set(input.filter(isPermission));
  for (const p of [...granted]) {
    const [mod, action] = p.split(":");
    if (action !== "view") granted.add(`${mod}:view` as Permission);
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

/** Quick-fill presets for the permission matrix (UI convenience only). */
export const PERMISSION_PRESETS: { key: string; label: string; permissions: Permission[] }[] = [
  {
    key: "read",
    label: "Read only",
    permissions: ["overview:view", ...MODULES.map((m) => `${m.key}:view` as Permission)],
  },
  {
    key: "entry",
    label: "Data entry",
    permissions: normalizePermissions(["overview:view", ...MODULES.map((m) => `${m.key}:edit`)]),
  },
  {
    key: "full",
    label: "All data access",
    permissions: [...PERMISSIONS],
  },
  { key: "none", label: "Clear", permissions: [] },
];
