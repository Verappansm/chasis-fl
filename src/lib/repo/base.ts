import "server-only";
import { ObjectId, type Collection, type Document, type Filter, type Sort } from "mongodb";
import { collections } from "@/lib/db/collections";
import type { CurrentUser } from "@/lib/auth/dal";
import type { AuditEntity, AuditFields } from "@/lib/types";
import { ConflictError, NotFoundError, ValidationError } from "./errors";

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

export async function writeAudit(entry: {
  user: CurrentUser;
  action: "create" | "update" | "delete" | "login";
  entity: AuditEntity;
  entityId?: string;
  chassisNumber?: string;
  before?: unknown;
  after?: unknown;
}) {
  const { auditLogs } = await collections();
  await auditLogs.insertOne({
    _id: new ObjectId(),
    at: new Date(),
    userId: entry.user.id,
    username: entry.user.username,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId,
    chassisNumber: entry.chassisNumber,
    before: entry.before,
    after: entry.after,
  });
}

/** Every business record hangs off a vehicle; make sure one exists. */
export async function ensureVehicle(chassisNumber: string, user: CurrentUser) {
  const { vehicles } = await collections();
  const now = new Date();
  await vehicles.updateOne(
    { chassisNumber },
    {
      $setOnInsert: {
        chassisNumber,
        createdAt: now,
        createdBy: user.username,
        updatedAt: now,
        updatedBy: user.username,
        version: 1,
      },
    },
    { upsert: true },
  );
}

export async function insertRecord<T extends BaseDoc>(
  col: Collection<T>,
  entity: AuditEntity,
  data: Payload<T>,
  user: CurrentUser,
): Promise<string> {
  await ensureVehicle(data.chassisNumber, user);
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
  data: Payload<T>,
  user: CurrentUser,
): Promise<void> {
  const raw = col as unknown as Collection<Document>;
  const _id = toObjectId(id);
  const existing = await raw.findOne({ _id });
  if (!existing) throw new NotFoundError("This record no longer exists.");
  if (existing.version !== expectedVersion) {
    throw new ConflictError("Someone else changed this record after you opened it. Reload and try again.");
  }
  if (existing.chassisNumber !== data.chassisNumber) {
    throw new ValidationError("chassisNumber", "Chassis number cannot be changed. Delete and re-create the record instead.");
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
  await writeAudit({ user, action: "update", entity, entityId: id, chassisNumber: data.chassisNumber, before: existing, after });
}

export async function deleteRecord<T extends BaseDoc>(
  col: Collection<T>,
  entity: AuditEntity,
  id: string,
  expectedVersion: number,
  user: CurrentUser,
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
