import "server-only";
import { collections } from "@/lib/db/collections";

const WINDOW_MS = 15 * 60 * 1000;
/** Per username+IP (typos by a real user) and per username (distributed guessing). */
export const LIMITS = { userIp: 5, user: 20 } as const;

/** Login throttling stored in MongoDB so it holds across serverless instances. */
export async function isLockedOut(key: string, max: number): Promise<boolean> {
  const { loginAttempts } = await collections();
  const doc = await loginAttempts.findOne({ _id: key });
  return Boolean(doc && doc.count >= max && doc.expiresAt > new Date());
}

export async function recordFailure(key: string) {
  const { loginAttempts } = await collections();
  const now = new Date();
  // Reset expired windows (TTL deletion is lazy, up to ~60s late).
  await loginAttempts.deleteOne({ _id: key, expiresAt: { $lte: now } });
  await loginAttempts.updateOne(
    { _id: key },
    { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(now.getTime() + WINDOW_MS) } },
    { upsert: true },
  );
}

export async function clearFailures(key: string) {
  const { loginAttempts } = await collections();
  await loginAttempts.deleteOne({ _id: key });
}
