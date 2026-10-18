import "server-only";
import type { Collection, Db } from "mongodb";
import bcrypt from "bcryptjs";
import { getDb } from "./mongo";
import { env } from "@/lib/env";
import type {
  AuditLogDoc,
  FinanceDoc,
  IncentiveDoc,
  InsuranceDoc,
  LoginAttemptDoc,
  RenewalDoc,
  UserDoc,
  VehicleDoc,
} from "@/lib/types";

export interface Collections {
  users: Collection<UserDoc>;
  vehicles: Collection<VehicleDoc>;
  finance: Collection<FinanceDoc>;
  insurance: Collection<InsuranceDoc>;
  incentives: Collection<IncentiveDoc>;
  renewals: Collection<RenewalDoc>;
  auditLogs: Collection<AuditLogDoc>;
  loginAttempts: Collection<LoginAttemptDoc>;
}

function bind(db: Db): Collections {
  return {
    users: db.collection<UserDoc>("users"),
    vehicles: db.collection<VehicleDoc>("vehicles"),
    finance: db.collection<FinanceDoc>("finance"),
    insurance: db.collection<InsuranceDoc>("insurance"),
    incentives: db.collection<IncentiveDoc>("incentives"),
    renewals: db.collection<RenewalDoc>("renewals"),
    auditLogs: db.collection<AuditLogDoc>("audit_logs"),
    loginAttempts: db.collection<LoginAttemptDoc>("login_attempts"),
  };
}

async function ensureIndexes(c: Collections) {
  await Promise.all([
    c.users.createIndex({ username: 1 }, { unique: true }),
    c.vehicles.createIndex({ chassisNumber: 1 }, { unique: true }),
    c.finance.createIndex({ chassisNumber: 1 }, { unique: true }),
    c.finance.createIndex({ incentiveReceived: 1, initiatedDate: 1 }),
    c.insurance.createIndex({ chassisNumber: 1 }),
    c.insurance.createIndex({ incentiveReceived: 1, initiatedDate: 1 }),
    c.insurance.createIndex({ policyEndDate: 1 }),
    c.insurance.createIndex(
      { provider: 1, policyNumber: 1 },
      { unique: true, partialFilterExpression: { policyNumber: { $type: "string" } } },
    ),
    c.incentives.createIndex({ chassisNumber: 1 }),
    c.incentives.createIndex({ paidDate: -1 }),
    c.renewals.createIndex({ chassisNumber: 1 }),
    c.renewals.createIndex({ status: 1, dueDate: 1 }),
    c.auditLogs.createIndex({ at: -1 }),
    c.auditLogs.createIndex({ entity: 1, entityId: 1 }),
    c.loginAttempts.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ]);
}

/** Creates the initial admin only when the users collection is empty. */
async function bootstrapAdmin(c: Collections) {
  if ((await c.users.estimatedDocumentCount()) > 0) return;
  const now = new Date();
  const passwordHash = await bcrypt.hash(env.adminInitialPassword, 12);
  await c.users.updateOne(
    { username: env.adminUsername },
    {
      $setOnInsert: {
        username: env.adminUsername,
        passwordHash,
        role: "admin",
        permissions: [],
        active: true,
        tokenVersion: 0,
        createdAt: now,
        createdBy: "system",
        updatedAt: now,
        updatedBy: "system",
        version: 1,
      },
    },
    { upsert: true },
  );
}

const globalForSetup = globalThis as unknown as { _chasisSetup?: Promise<void> };

/** Typed collections. Indexes and the admin bootstrap run once per server instance. */
export async function collections(): Promise<Collections> {
  const c = bind(await getDb());
  if (!globalForSetup._chasisSetup) {
    globalForSetup._chasisSetup = (async () => {
      await ensureIndexes(c);
      await bootstrapAdmin(c);
    })().catch((err) => {
      globalForSetup._chasisSetup = undefined;
      throw err;
    });
  }
  await globalForSetup._chasisSetup;
  return c;
}
