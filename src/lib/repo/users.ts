import "server-only";
import bcrypt from "bcryptjs";
import { ObjectId, type Filter } from "mongodb";
import { collections } from "@/lib/db/collections";
import type { CurrentUser } from "@/lib/auth/dal";
import { verifyPassword } from "@/lib/auth/password";
import type { UserDoc } from "@/lib/types";
import type { CreateUserInput, UserAccessInput } from "@/lib/validation/schemas";
import { escapeRegex, toObjectId, writeAudit } from "./base";
import { ConflictError, NotFoundError, ValidationError, isDuplicateKey } from "./errors";

const BCRYPT_COST = 12;
const STALE = "This user was changed by someone else after you opened it. Reload and try again.";

/** Never let a password hash leave this module (audit log, UI). */
function safe(user: UserDoc | null) {
  if (!user) return user;
  const { passwordHash: _omit, ...rest } = user;
  void _omit;
  return rest;
}

/** Documents created before RBAC have no version; treat that as 0. */
function versionFilter(expected: number): Filter<UserDoc> {
  return expected === 0 ? { $or: [{ version: 0 }, { version: { $exists: false } }] } : { version: expected };
}

export async function listUsers() {
  const { users } = await collections();
  const docs = await users.find({}, { projection: { passwordHash: 0 } }).sort({ username: 1 }).toArray();
  return docs;
}

export async function getUser(id: string) {
  let _id: ObjectId;
  try {
    _id = toObjectId(id);
  } catch {
    return null;
  }
  const { users } = await collections();
  return users.findOne({ _id }, { projection: { passwordHash: 0 } });
}

export async function createUser(input: CreateUserInput, actor: CurrentUser): Promise<string> {
  const { users } = await collections();
  const now = new Date();
  const doc: UserDoc = {
    _id: new ObjectId(),
    username: input.username,
    passwordHash: await bcrypt.hash(input.password, BCRYPT_COST),
    role: input.role,
    permissions: input.permissions,
    active: true,
    tokenVersion: 0,
    passwordChangedAt: now,
    createdAt: now,
    createdBy: actor.username,
    updatedAt: now,
    updatedBy: actor.username,
    version: 1,
  };
  try {
    await users.insertOne(doc);
  } catch (err) {
    if (isDuplicateKey(err)) throw new ValidationError("username", "This username is already taken.");
    throw err;
  }
  await writeAudit({ user: actor, action: "create", entity: "user", entityId: doc._id.toHexString(), after: safe(doc) });
  return doc._id.toHexString();
}

async function activeAdminCount(excludeId?: ObjectId) {
  const { users } = await collections();
  return users.countDocuments({ role: "admin", active: true, ...(excludeId ? { _id: { $ne: excludeId } } : {}) });
}

export async function updateUserAccess(id: string, expectedVersion: number, input: UserAccessInput, actor: CurrentUser) {
  const { users } = await collections();
  const _id = toObjectId(id);
  const existing = await users.findOne({ _id });
  if (!existing) throw new NotFoundError("This user no longer exists.");
  if ((existing.version ?? 0) !== expectedVersion) throw new ConflictError(STALE);

  const isSelf = existing._id.toHexString() === actor.id;
  if (isSelf && input.role !== existing.role) {
    throw new ValidationError("role", "You cannot change your own role. Ask another admin.");
  }
  if (isSelf && !input.active) {
    throw new ValidationError("active", "You cannot deactivate your own account.");
  }

  const losesAdmin = existing.role === "admin" && existing.active && (input.role !== "admin" || !input.active);
  if (losesAdmin && (await activeAdminCount(_id)) === 0) {
    throw new ValidationError("role", "At least one active admin must remain.");
  }

  const after = await users.findOneAndUpdate(
    { _id, ...versionFilter(expectedVersion) },
    {
      $set: {
        role: input.role,
        active: input.active,
        permissions: input.permissions,
        updatedAt: new Date(),
        updatedBy: actor.username,
        version: expectedVersion + 1,
      },
      // Deactivation also kills any open session immediately.
      ...(existing.active && !input.active ? { $inc: { tokenVersion: 1 } } : {}),
    },
    { returnDocument: "after" },
  );
  if (!after) throw new ConflictError(STALE);

  // Guard against two admins demoting each other at the same moment.
  if (losesAdmin && (await activeAdminCount()) === 0) {
    await users.updateOne(
      { _id },
      { $set: { role: existing.role, active: existing.active, permissions: existing.permissions ?? [], version: expectedVersion + 2 } },
    );
    throw new ValidationError("role", "At least one active admin must remain.");
  }

  await writeAudit({ user: actor, action: "update", entity: "user", entityId: id, before: safe(existing), after: safe(after) });
}

async function clearLockouts(username: string) {
  const { loginAttempts } = await collections();
  await loginAttempts.deleteMany({ _id: { $regex: `^${escapeRegex(username)}\\|` } });
}

/** Admin sets a new password for someone else; all their sessions end. */
export async function resetUserPassword(id: string, password: string, actor: CurrentUser) {
  const { users } = await collections();
  const _id = toObjectId(id);
  if (id === actor.id) {
    throw new ValidationError("password", "Use My account to change your own password.");
  }
  const now = new Date();
  const after = await users.findOneAndUpdate(
    { _id },
    {
      $set: { passwordHash: await bcrypt.hash(password, BCRYPT_COST), passwordChangedAt: now, updatedAt: now, updatedBy: actor.username },
      $inc: { tokenVersion: 1 },
    },
    { returnDocument: "after" },
  );
  if (!after) throw new NotFoundError("This user no longer exists.");
  await clearLockouts(after.username);
  await writeAudit({ user: actor, action: "update", entity: "user", entityId: id, after: { passwordReset: true, username: after.username } });
}

/**
 * The signed-in user changes their own password. Other sessions are revoked;
 * returns the new tokenVersion so the caller can re-issue this session.
 */
export async function changeOwnPassword(actor: CurrentUser, currentPassword: string, newPassword: string): Promise<number> {
  const { users } = await collections();
  const _id = toObjectId(actor.id);
  const user = await users.findOne({ _id });
  if (!user) throw new NotFoundError("Account not found.");
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new ValidationError("currentPassword", "Current password is incorrect.");
  }
  const now = new Date();
  const after = await users.findOneAndUpdate(
    { _id },
    {
      $set: { passwordHash: await bcrypt.hash(newPassword, BCRYPT_COST), passwordChangedAt: now, updatedAt: now, updatedBy: actor.username },
      $inc: { tokenVersion: 1 },
    },
    { returnDocument: "after" },
  );
  if (!after) throw new NotFoundError("Account not found.");
  await writeAudit({ user: actor, action: "update", entity: "user", entityId: actor.id, after: { passwordChanged: true } });
  return after.tokenVersion;
}
