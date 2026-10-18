import "server-only";
import { MongoClient, type Db } from "mongodb";
import { env } from "@/lib/env";

/**
 * One MongoClient per server instance. On Vercel each warm function instance
 * reuses the same pool; in dev the global survives hot reloads.
 */
const globalForMongo = globalThis as unknown as { _mongoClientPromise?: Promise<MongoClient> };

function getClient(): Promise<MongoClient> {
  if (!globalForMongo._mongoClientPromise) {
    const client = new MongoClient(env.mongoUri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 8000,
      appName: "chasis-erp",
    });
    globalForMongo._mongoClientPromise = client.connect().catch((err) => {
      // Do not cache a failed connection; the next request retries.
      globalForMongo._mongoClientPromise = undefined;
      throw err;
    });
  }
  return globalForMongo._mongoClientPromise;
}

export async function getDb(): Promise<Db> {
  const client = await getClient();
  return client.db(env.mongoDb);
}
