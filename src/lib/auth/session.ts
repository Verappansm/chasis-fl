import "server-only";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, signSession, type SessionPayload } from "./token";

export async function createSession(payload: SessionPayload) {
  const token = await signSession(payload);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env.isProd,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function deleteSession() {
  (await cookies()).delete(SESSION_COOKIE);
}
