import "server-only";
import { MongoClient, type Db } from "mongodb";
import { env } from "@/lib/env";

/**
 * One MongoClient per server instance. On Vercel each warm function instance
 * reuses the same pool; in dev the global survives hot reloads.
 */
const globalForMongo = globalThis as unknown as { _mongoClientPromise?: Promise<MongoClient> };

/**
 * Data in transit to the database must be encrypted. `mongodb+srv://` (Atlas)
 * turns TLS on by default; a plain `mongodb://` URI is only accepted for a
 * local database in development.
 */
function tlsOptions(uri: string) {
  const local = /^mongodb:\/\/(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(uri);
  if (/[?&](tls|ssl)=false/i.test(uri)) {
    throw new Error("MONGODB_URI disables TLS. Remove tls=false: database traffic must be encrypted.");
  }
  if (env.isProd && local) throw new Error("MONGODB_URI points at a local database in production.");
  return local && !env.isProd ? {} : { tls: true };
}

function getClient(): Promise<MongoClient> {
  if (!globalForMongo._mongoClientPromise) {
    const client = new MongoClient(env.mongoUri, {
      ...tlsOptions(env.mongoUri),
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
