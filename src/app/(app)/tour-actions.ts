"use server";

import { ObjectId } from "mongodb";
import { getCurrentUser } from "@/lib/auth/dal";
import { collections } from "@/lib/db/collections";

/** Remembers that this user finished or skipped the tour (all devices). */
export async function markTourDone(): Promise<void> {
  const user = await getCurrentUser();
  if (!user || user.tourDone) return;
  const { users } = await collections();
  await users.updateOne({ _id: new ObjectId(user.id) }, { $set: { tourCompletedAt: new Date() } });
}
