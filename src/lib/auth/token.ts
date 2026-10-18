import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { env } from "@/lib/env";

export const SESSION_COOKIE = "chasis_session";
export const SESSION_TTL_SECONDS = 8 * 60 * 60; // one working day

export interface SessionPayload {
  sub: string; // user id
  username: string;
  tv: number; // user.tokenVersion at login; mismatch = revoked
}

const ISSUER = "chasis-erp";
const AUDIENCE = "chasis-erp-web";

function key() {
  return new TextEncoder().encode(env.authSecret);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ username: payload.username, tv: payload.tv })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(key());
}

/** Returns the payload for a valid, unexpired token, otherwise null. Never throws. */
export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), {
      algorithms: ["HS256"],
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    if (
      typeof payload.sub !== "string" ||
      typeof payload.username !== "string" ||
      typeof payload.tv !== "number"
    ) {
      return null;
    }
    return { sub: payload.sub, username: payload.username, tv: payload.tv };
  } catch {
    return null;
  }
}
