import "server-only";
import type { Filter } from "mongodb";
import { collections } from "@/lib/db/collections";
import type { AuditAction, AuditEntity, AuditLogDoc } from "@/lib/types";
import { AUDIT_ACTION_LABELS, AUDIT_ENTITY_LABELS } from "@/lib/audit-labels";
import { escapeRegex } from "./base";

export const AUDIT_PAGE_SIZE = 50;

export interface AuditFilters {
  user?: string;
  entity?: AuditEntity;
  action?: AuditAction;
  /** yyyy-mm-dd, inclusive, IST calendar days. */
  from?: string;
  to?: string;
  q?: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseAuditFilters(sp: Record<string, string | undefined>): AuditFilters {
  const pick = <T extends string>(v: string | undefined, allowed: readonly T[]) => (v && allowed.includes(v as T) ? (v as T) : undefined);
  return {
    user: sp.user && /^[a-z0-9._-]{1,64}$/.test(sp.user) ? sp.user : undefined,
    entity: pick(sp.entity, Object.keys(AUDIT_ENTITY_LABELS) as AuditEntity[]),
    action: pick(sp.action, Object.keys(AUDIT_ACTION_LABELS) as AuditAction[]),
    from: sp.from && DATE_RE.test(sp.from) ? sp.from : undefined,
    to: sp.to && DATE_RE.test(sp.to) ? sp.to : undefined,
    q: sp.q?.trim().slice(0, 60) || undefined,
  };
}

/** IST midnight of a yyyy-mm-dd day, as a UTC instant. */
function istStart(day: string): Date {
  return new Date(`${day}T00:00:00.000+05:30`);
}

export async function listAudit(f: AuditFilters, page: number) {
  const { auditLogs } = await collections();
  const filter: Filter<AuditLogDoc> = {};
  if (f.user) filter.username = f.user;
  if (f.entity) filter.entity = f.entity;
  if (f.action) filter.action = f.action;
  if (f.from || f.to) {
    filter.at = {
      ...(f.from ? { $gte: istStart(f.from) } : {}),
      ...(f.to ? { $lt: new Date(istStart(f.to).getTime() + 86_400_000) } : {}),
    };
  }
  if (f.q) {
    const rx = { $regex: escapeRegex(f.q), $options: "i" };
    filter.$or = [{ ref: rx }, { chassisNumber: { $regex: `^${escapeRegex(f.q.replace(/[\s-]/g, "").toUpperCase())}` } }, { detail: rx }, { ip: rx }];
  }
  const safePage = Number.isInteger(page) && page > 0 ? page : 1;
  const [items, total] = await Promise.all([
    auditLogs
      .find(filter, { projection: { before: 0, after: 0 } })
      .sort({ at: -1, _id: -1 })
      .skip((safePage - 1) * AUDIT_PAGE_SIZE)
      .limit(AUDIT_PAGE_SIZE)
      .toArray(),
    auditLogs.countDocuments(filter),
  ]);
  return { items, total, page: safePage, pageCount: Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE)) };
}

/** Everyone who appears in the log (including deleted or mistyped usernames). */
export async function auditUsernames(): Promise<string[]> {
  const { auditLogs, users } = await collections();
  const [logged, accounts] = await Promise.all([auditLogs.distinct("username"), users.distinct("username")]);
  return [...new Set([...accounts, ...logged].filter((u): u is string => typeof u === "string" && u.length > 0))].sort();
}

/** Headline counts for the last 24 hours. */
export async function auditSummary() {
  const { auditLogs } = await collections();
  const since = new Date(Date.now() - 86_400_000);
  const rows = await auditLogs.aggregate<{ _id: AuditAction; n: number }>([{ $match: { at: { $gte: since } } }, { $group: { _id: "$action", n: { $sum: 1 } } }]).toArray();
  const by = Object.fromEntries(rows.map((r) => [r._id, r.n])) as Partial<Record<AuditAction, number>>;
  return {
    changes: (by.create ?? 0) + (by.update ?? 0) + (by.delete ?? 0),
    logins: by.login ?? 0,
    failedLogins: by.login_failed ?? 0,
    denied: by.denied ?? 0,
  };
}
