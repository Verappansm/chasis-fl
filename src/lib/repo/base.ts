import "server-only";
import { ObjectId, type Collection, type Document, type Filter, type Sort } from "mongodb";
import { headers } from "next/headers";
import { collections } from "@/lib/db/collections";
import type { AuditAction, AuditChange, AuditEntity, AuditFields } from "@/lib/types";
import { ConflictError, NotFoundError, ValidationError } from "./errors";

/** Who is acting (a signed-in user). */
export type Actor = { id: string; username: string };

export type BaseDoc = AuditFields & { _id: ObjectId; chassisNumber: string };
/** The business fields of a document — what a validated form produces. */
export type Payload<T extends BaseDoc> = Omit<T, "_id" | keyof AuditFields>;

export const PAGE_SIZE = 25;

export function toObjectId(id: string): ObjectId {
  if (!ObjectId.isValid(id) || String(new ObjectId(id)) !== id) throw new NotFoundError("Record not found");
  return new ObjectId(id);
}

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Splits a payload into $set (defined values) and $unset (cleared optional fields). */
function splitPayload(data: Record<string, unknown>) {
  const $set: Record<string, unknown> = {};
  const $unset: Record<string, ""> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) $unset[k] = "";
    else $set[k] = v;
  }
  return { $set, $unset };
}

function stripUndefined<T extends Record<string, unknown>>(data: T): T {
  return Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)) as T;
}

/** Bookkeeping fields left out of the change list. */
const NOISE = new Set(["_id", "createdAt", "createdBy", "updatedAt", "updatedBy", "version", "passwordHash", "demo"]);

function same(a: unknown, b: unknown): boolean {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (a instanceof ObjectId && b instanceof ObjectId) return a.equals(b);
  if (typeof a === "object" && a !== null && typeof b === "object" && b !== null) return JSON.stringify(a) === JSON.stringify(b);
  return a === b;
}

/** Field-by-field differences between two snapshots of a document. */
export function diff(before: unknown, after: unknown): AuditChange[] {
  if (!before || !after || typeof before !== "object" || typeof after !== "object") return [];
  const b = before as Record<string, unknown>;
  const a = after as Record<string, unknown>;
  const changes: AuditChange[] = [];
  for (const field of new Set([...Object.keys(b), ...Object.keys(a)])) {
    if (NOISE.has(field) || same(b[field], a[field])) continue;
    changes.push({ field, from: b[field], to: a[field] });
  }
  return changes;
}

/** Human reference for a record in the activity log. */
export function refOf(doc: unknown): string | undefined {
  if (!doc || typeof doc !== "object") return undefined;
  const d = doc as Record<string, unknown>;
  const ref = d.commissionNo ?? d.stockNo ?? d.dealRef ?? d.username;
  return typeof ref === "string" ? ref : undefined;
}

async function requestMeta(): Promise<{ ip?: string; userAgent?: string }> {
  try {
    const h = await headers();
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || undefined;
    return { ip, userAgent: h.get("user-agent")?.slice(0, 200) || undefined };
  } catch {
    return {}; // outside a request (scripts)
  }
}

/**
 * Appends to the activity log. The log is append-only: nothing in the app
 * updates or deletes entries. A failure to log never hides the result of the
 * change itself, but is reported on the server.
 */
export async function writeAudit(entry: {
  user: { id: string; username: string } | null;
  action: AuditAction;
  entity: AuditEntity;
  entityId?: string;
  ref?: string;
  chassisNumber?: string;
  detail?: string;
  /** Username typed on a failed login (there is no user). */
  username?: string;
  before?: unknown;
  after?: unknown;
}) {
  try {
    const { auditLogs } = await collections();
    const changes = entry.action === "update" ? diff(entry.before, entry.after) : undefined;
    await auditLogs.insertOne({
      _id: new ObjectId(),
      at: new Date(),
      userId: entry.user?.id ?? "",
      username: entry.user?.username ?? entry.username ?? "",
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      ref: entry.ref ?? refOf(entry.after) ?? refOf(entry.before),
      chassisNumber: entry.chassisNumber,
      changes: changes?.length ? changes : undefined,
      detail: entry.detail,
      ...(await requestMeta()),
      before: entry.before,
      after: entry.after,
    });
  } catch (err) {
    console.error("[audit] could not write entry", entry.action, entry.entity, err);
  }
}

export async function insertRecord<T extends BaseDoc>(
  col: Collection<T>,
  entity: AuditEntity,
  data: Payload<T>,
  user: Actor,
): Promise<string> {
  const now = new Date();
  const doc = {
    ...stripUndefined(data as Record<string, unknown>),
    _id: new ObjectId(),
    createdAt: now,
    createdBy: user.username,
    updatedAt: now,
    updatedBy: user.username,
    version: 1,
  };
  await (col as unknown as Collection<Document>).insertOne(doc);
  const id = doc._id.toHexString();
  await writeAudit({ user, action: "create", entity, entityId: id, chassisNumber: data.chassisNumber, after: doc });
  return id;
}

export async function updateRecord<T extends BaseDoc>(
  col: Collection<T>,
  entity: AuditEntity,
  id: string,
  expectedVersion: number,
  data: Partial<Payload<T>>,
  user: Actor,
  /** Key fields that may not change once the record exists. */
  immutable: { field: string; label: string }[] = [{ field: "chassisNumber", label: "Chassis number" }],
): Promise<void> {
  const raw = col as unknown as Collection<Document>;
  const _id = toObjectId(id);
  const existing = await raw.findOne({ _id });
  if (!existing) throw new NotFoundError("This record no longer exists.");
  if (existing.version !== expectedVersion) {
    throw new ConflictError("Someone else changed this record after you opened it. Reload and try again.");
  }
  for (const { field, label } of immutable) {
    const next = (data as Record<string, unknown>)[field];
    if (next !== undefined && existing[field] !== next) {
      throw new ValidationError(field, `${label} cannot be changed. Delete and re-create the record instead.`);
    }
  }

  const { $set, $unset } = splitPayload(data as Record<string, unknown>);
  const after = await raw.findOneAndUpdate(
    { _id, version: expectedVersion },
    {
      $set: { ...$set, updatedAt: new Date(), updatedBy: user.username },
      $inc: { version: 1 },
      ...(Object.keys($unset).length ? { $unset } : {}),
    },
    { returnDocument: "after" },
  );
  if (!after) throw new ConflictError("Someone else changed this record after you opened it. Reload and try again.");
  await writeAudit({ user, action: "update", entity, entityId: id, chassisNumber: existing.chassisNumber, before: existing, after });
}

export async function deleteRecord<T extends BaseDoc>(
  col: Collection<T>,
  entity: AuditEntity,
  id: string,
  expectedVersion: number,
  user: Actor,
): Promise<void> {
  const raw = col as unknown as Collection<Document>;
  const _id = toObjectId(id);
  const removed = await raw.findOneAndDelete({ _id, version: expectedVersion });
  if (!removed) {
    const stillThere = await raw.countDocuments({ _id }, { limit: 1 });
    throw stillThere
      ? new ConflictError("Someone else changed this record after you opened it. Reload and try again.")
      : new NotFoundError("This record no longer exists.");
  }
  await writeAudit({ user, action: "delete", entity, entityId: id, chassisNumber: removed.chassisNumber, before: removed });
}

export async function findRecord<T extends BaseDoc>(col: Collection<T>, id: string): Promise<T | null> {
  let _id: ObjectId;
  try {
    _id = toObjectId(id);
  } catch {
    return null;
  }
  return (await col.findOne({ _id } as Filter<T>)) as T | null;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageCount: number;
}

export async function listRecords<T extends BaseDoc>(
  col: Collection<T>,
  filter: Filter<T>,
  sort: Sort,
  page: number,
): Promise<Page<T>> {
  const safePage = Number.isInteger(page) && page > 0 ? page : 1;
  const [items, total] = await Promise.all([
    col
      .find(filter)
      .sort(sort)
      .skip((safePage - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .toArray(),
    col.countDocuments(filter),
  ]);
  return {
    items: items as T[],
    total,
    page: safePage,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

/** Search box semantics shared by all modules: chassis prefix, or a text field contains. */
export function searchFilter(q: string | undefined, textFields: string[]): Document {
  const term = (q ?? "").trim().slice(0, 60);
  if (!term) return {};
  const chassis = term.replace(/[\s-]/g, "").toUpperCase();
  const or: Document[] = [];
  if (chassis) or.push({ chassisNumber: { $regex: `^${escapeRegex(chassis)}` } });
  for (const f of textFields) or.push({ [f]: { $regex: escapeRegex(term), $options: "i" } });
  return { $or: or };
}
