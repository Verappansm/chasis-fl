import "server-only";
import type { Collection, Db } from "mongodb";
import bcrypt from "bcryptjs";
import { getDb } from "./mongo";
import { env } from "@/lib/env";
import { VALIDATORS } from "./validators";
import type {
  AuditLogDoc,
  FinanceDoc,
  InsuranceDoc,
  LoginAttemptDoc,
  OptionListDoc,
  PreownedDoc,
  PurchaseDoc,
  RenewalDoc,
  SettingsDoc,
  UserDoc,
} from "@/lib/types";

/** Typed handles for every collection the app uses. */
export interface Collections {
  users: Collection<UserDoc>;
  settings: Collection<SettingsDoc>;
  optionLists: Collection<OptionListDoc>;
  counters: Collection<{ _id: string; seq: number }>;
  purchases: Collection<PurchaseDoc>;
  preowned: Collection<PreownedDoc>;
  finance: Collection<FinanceDoc>;
  insurance: Collection<InsuranceDoc>;
  renewals: Collection<RenewalDoc>;
  auditLogs: Collection<AuditLogDoc>;
  loginAttempts: Collection<LoginAttemptDoc>;
}

function bind(db: Db): Collections {
  return {
    users: db.collection<UserDoc>("users"),
    settings: db.collection<SettingsDoc>("settings"),
    optionLists: db.collection<OptionListDoc>("option_lists"),
    counters: db.collection<{ _id: string; seq: number }>("counters"),
    purchases: db.collection<PurchaseDoc>("purchases"),
    preowned: db.collection<PreownedDoc>("preowned"),
    finance: db.collection<FinanceDoc>("finance_payouts"),
    insurance: db.collection<InsuranceDoc>("insurance_payouts"),
    renewals: db.collection<RenewalDoc>("renewal_payouts"),
    auditLogs: db.collection<AuditLogDoc>("audit_logs"),
    loginAttempts: db.collection<LoginAttemptDoc>("login_attempts"),
  };
}

/** Within one collection; uniqueness across tabs is checked in the repository. */
const invoiceNoUnique = {
  unique: true,
  partialFilterExpression: { invoiceNo: { $type: "string" } },
} as const;

const policyNoUnique = {
  unique: true,
  partialFilterExpression: { policyNumber: { $type: "string" } },
} as const;

async function ensureIndexes(c: Collections) {
  await Promise.all([
    c.users.createIndex({ username: 1 }, { unique: true }),
    c.purchases.createIndex({ commissionNo: 1 }, { unique: true }),
    c.purchases.createIndex({ chassisNumber: 1 }),
    c.purchases.createIndex({ purchaseDate: -1 }),
    c.purchases.createIndex({ stage: 1, purchaseDate: -1 }),
    c.purchases.createIndex({ type: 1, saleDate: -1 }),
    c.purchases.createIndex({ type: 1, deflectDate: 1 }),
    c.purchases.createIndex({ invoiceNo: 1 }, invoiceNoUnique),
    c.purchases.createIndex({ invoiceDate: -1 }, { sparse: true }),
    c.purchases.createIndex({ receiptDate: -1 }, { sparse: true }),
    c.preowned.createIndex({ stockNo: 1 }, { unique: true }),
    c.preowned.createIndex({ chassisNumber: 1 }),
    c.preowned.createIndex({ purchaseDate: -1 }),
    c.finance.createIndex({ dealRef: 1 }, { unique: true }),
    c.finance.createIndex({ chassisNumber: 1 }),
    c.finance.createIndex({ stage: 1, disbursalDate: -1 }),
    c.finance.createIndex({ provider: 1, disbursalDate: -1 }),
    c.finance.createIndex({ invoiceNo: 1 }, invoiceNoUnique),
    c.finance.createIndex({ invoiceDate: -1 }, { sparse: true }),
    c.finance.createIndex({ receiptDate: -1 }, { sparse: true }),
    c.insurance.createIndex({ dealRef: 1 }, { unique: true }),
    c.insurance.createIndex({ chassisNumber: 1 }),
    c.insurance.createIndex({ stage: 1, policyStartDate: -1 }),
    c.insurance.createIndex({ policyEndDate: 1 }),
    c.insurance.createIndex({ provider: 1, policyNumber: 1 }, policyNoUnique),
    c.insurance.createIndex({ invoiceNo: 1 }, invoiceNoUnique),
    c.insurance.createIndex({ invoiceDate: -1 }, { sparse: true }),
    c.insurance.createIndex({ receiptDate: -1 }, { sparse: true }),
    c.renewals.createIndex({ chassisNumber: 1 }),
    c.renewals.createIndex({ stage: 1, policyStartDate: -1 }),
    c.renewals.createIndex({ policyEndDate: 1 }),
    c.renewals.createIndex({ provider: 1, policyNumber: 1 }, policyNoUnique),
    c.renewals.createIndex({ dealRef: 1 }),
    c.renewals.createIndex({ invoiceNo: 1 }, invoiceNoUnique),
    c.renewals.createIndex({ invoiceDate: -1 }, { sparse: true }),
    c.renewals.createIndex({ receiptDate: -1 }, { sparse: true }),
    c.auditLogs.createIndex({ at: -1 }),
    c.auditLogs.createIndex({ entity: 1, entityId: 1 }),
    c.auditLogs.createIndex({ username: 1, at: -1 }),
    c.auditLogs.createIndex({ entity: 1, at: -1 }),
    c.auditLogs.createIndex({ action: 1, at: -1 }),
    c.auditLogs.createIndex({ chassisNumber: 1, at: -1 }, { sparse: true }),
    c.auditLogs.createIndex({ ref: 1, at: -1 }, { sparse: true }),
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

/**
 * Bump when ensureIndexes() changes. Each cold start then costs one findOne
 * instead of re-issuing every createIndex (which is slow on Atlas).
 */
const SCHEMA_VERSION = 3;

/** Creates each collection with its validator, or attaches the validator to an existing one. */
async function ensureValidators(db: Db) {
  const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((x) => x.name));
  for (const [name, schema] of Object.entries(VALIDATORS)) {
    const options = { validator: { $jsonSchema: schema }, validationLevel: "moderate", validationAction: "error" } as const;
    try {
      if (existing.has(name)) await db.command({ collMod: name, ...options });
      else await db.createCollection(name, options);
    } catch (err) {
      // The app still validates every write; report and carry on.
      console.error(`[schema] could not apply validator to ${name}`, err);
    }
  }
}

async function ensureSchema(db: Db, c: Collections) {
  const meta = db.collection<{ _id: string; version: number; at: Date }>("_meta");
  const current = await meta.findOne({ _id: "schema" });
  if (current && current.version >= SCHEMA_VERSION) return;
  await ensureValidators(db);
  await ensureIndexes(c);
  await meta.updateOne({ _id: "schema" }, { $set: { version: SCHEMA_VERSION, at: new Date() } }, { upsert: true });
}

const globalForSetup = globalThis as unknown as { _chasisSetup?: Promise<void> };

/** Typed collections. Schema check and admin bootstrap run once per server instance. */
export async function collections(): Promise<Collections> {
  const db = await getDb();
  const c = bind(db);
  if (!globalForSetup._chasisSetup) {
    // Schema first, so collections are created with their validators.
    globalForSetup._chasisSetup = ensureSchema(db, c)
      .then(() => bootstrapAdmin(c))
      .catch((err) => {
      globalForSetup._chasisSetup = undefined;
      throw err;
    });
  }
  await globalForSetup._chasisSetup;
  return c;
}
