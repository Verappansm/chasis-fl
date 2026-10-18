import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ObjectId } from "mongodb";
import { collections } from "@/lib/db/collections";
import { can, effectivePermissions, type Permission, type Principal } from "@/lib/permissions";
import { SESSION_COOKIE, verifySession } from "./token";

export interface CurrentUser extends Principal {
  id: string;
  username: string;
  /** Has finished or skipped the guided tour. */
  tourDone: boolean;
}

/**
 * Data Access Layer: the single place that decides who the caller is and
 * what they may do. Verifies the JWT *and* re-reads the user from the
 * database, so deactivation, role/permission changes and tokenVersion bumps
 * take effect on the very next request. Memoised per request.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = await verifySession(token);
  if (!session || !ObjectId.isValid(session.sub)) return null;

  const { users } = await collections();
  const user = await users.findOne(
    { _id: new ObjectId(session.sub) },
    { projection: { username: 1, role: 1, permissions: 1, active: 1, tokenVersion: 1, tourCompletedAt: 1 } },
  );
  if (!user || !user.active || user.tokenVersion !== session.tv) return null;

  const role = user.role === "admin" ? "admin" : "user";
  return {
    id: user._id.toHexString(),
    username: user.username,
    role,
    permissions: effectivePermissions(role, user.permissions),
    tourDone: Boolean(user.tourCompletedAt),
  };
});

/** For pages and server actions: returns the user or redirects to /login. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  // Via /logout so a revoked-but-validly-signed cookie is cleared (else proxy
  // would bounce /login straight back into the app).
  if (!user) redirect("/logout");
  return user;
}

/** Page guard: signed in and holding `permission`, else the "no access" page. */
export async function requirePermission(permission: Permission): Promise<CurrentUser> {
  const user = await requireUser();
  if (!can(user, permission)) redirect("/no-access");
  return user;
}

/** Page guard for user management. */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/no-access");
  return user;
}

export class ForbiddenError extends Error {
  constructor() {
    super("You do not have permission to do this.");
  }
}
