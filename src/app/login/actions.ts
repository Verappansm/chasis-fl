"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { collections } from "@/lib/db/collections";
import { createSession, deleteSession } from "@/lib/auth/session";
import { verifyPassword } from "@/lib/auth/password";
import { LIMITS, clearFailures, isLockedOut, recordFailure } from "@/lib/auth/rate-limit";
import { loginSchema } from "@/lib/validation/schemas";
import { writeAudit } from "@/lib/repo/base";
import type { FormState } from "@/lib/form-state";
import { effectivePermissions, homePath } from "@/lib/permissions";

async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || h.get("x-real-ip") || "unknown";
}

const GENERIC_ERROR = "Invalid username or password.";

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
  });
  const typedUsername = String(formData.get("username") ?? "").slice(0, 64);
  if (!parsed.success) return { message: GENERIC_ERROR, values: { username: typedUsername } };

  const { username, password } = parsed.data;
  const userIpKey = `${username}|${await clientIp()}`;
  const userKey = `${username}|*`;
  let landing = "/overview";

  try {
    const { users } = await collections();
    // Independent lookups in one round trip.
    const [lockedIp, lockedUser, user] = await Promise.all([
      isLockedOut(userIpKey, LIMITS.userIp),
      isLockedOut(userKey, LIMITS.user),
      users.findOne({ username }),
    ]);
    if (lockedIp || lockedUser) {
      return { message: "Too many failed attempts. Try again in 15 minutes.", values: { username } };
    }

    const ok = await verifyPassword(password, user?.active ? user.passwordHash : undefined);

    if (!ok || !user) {
      await Promise.all([recordFailure(userIpKey), recordFailure(userKey)]);
      return { message: GENERIC_ERROR, values: { username } };
    }

    const principal = {
      id: user._id.toHexString(),
      username: user.username,
      role: user.role,
      permissions: effectivePermissions(user.role, user.permissions),
      tourDone: Boolean(user.tourCompletedAt),
    };
    await Promise.all([
      createSession({ sub: principal.id, username: user.username, tv: user.tokenVersion }),
      clearFailures(userIpKey),
      users.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } }),
      writeAudit({ user: principal, action: "login", entity: "auth" }),
    ]);
    landing = homePath(principal);
  } catch (err) {
    console.error("[login] failed", err);
    return { message: "Sign-in is temporarily unavailable. Please try again.", values: { username } };
  }

  redirect(landing);
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}
