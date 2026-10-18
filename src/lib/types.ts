import type { ObjectId } from "mongodb";
import type { Permission, Role } from "@/lib/permissions";

export type { Role };

/** Money is always integer paise (₹1 = 100). Dates are UTC calendar dates. */
export type Paise = number;

export interface AuditFields {
  createdAt: Date;
  createdBy: string;
  updatedAt: Date;
  updatedBy: string;
  /** Optimistic-concurrency counter; incremented on every update. */
  version: number;
}

export interface UserDoc {
  _id: ObjectId;
  username: string;
  passwordHash: string;
  role: Role;
  /** Granted permissions; ignored for admins (they have all). */
  permissions: Permission[];
  active: boolean;
  /** Bump to revoke every session of this user. */
  tokenVersion: number;
  lastLoginAt?: Date;
  passwordChangedAt?: Date;
  /** Set when the user finishes or skips the guided tour. */
  tourCompletedAt?: Date;
  createdAt: Date;
  createdBy?: string;
  updatedAt: Date;
  updatedBy?: string;
  /** Optimistic concurrency; absent on documents created before RBAC (treated as 0). */
  version?: number;
}

export interface VehicleDoc extends AuditFields {
  _id: ObjectId;
  chassisNumber: string;
  purchasePrice?: Paise;
  sellingPrice?: Paise;
  model?: string;
  customerName?: string;
}

export interface FinanceDoc extends AuditFields {
  _id: ObjectId;
  chassisNumber: string;
  provider: string;
  loanAmount?: Paise;
  incentiveAmount: Paise;
  incentiveReceived: boolean;
  initiatedDate: Date;
  receivedDate?: Date;
  notes?: string;
}

export const POLICY_TYPES = ["new", "renewal"] as const;
export type PolicyType = (typeof POLICY_TYPES)[number];

export interface InsuranceDoc extends AuditFields {
  _id: ObjectId;
  chassisNumber: string;
  provider: string;
  policyNumber?: string;
  policyType: PolicyType;
  premiumAmount: Paise;
  incentiveAmount: Paise;
  incentiveReceived: boolean;
  initiatedDate: Date;
  receivedDate?: Date;
  policyStartDate?: Date;
  policyEndDate?: Date;
  notes?: string;
}

export const PAYEE_TYPES = ["sales_executive", "broker", "dsa", "referral", "other"] as const;
export type PayeeType = (typeof PAYEE_TYPES)[number];
export const PAYEE_TYPE_LABELS: Record<PayeeType, string> = {
  sales_executive: "Sales executive",
  broker: "Broker / sub-dealer",
  dsa: "DSA",
  referral: "Referral",
  other: "Other",
};

export interface IncentiveDoc extends AuditFields {
  _id: ObjectId;
  chassisNumber: string;
  amount: Paise;
  paidTo: string;
  payeeType: PayeeType;
  paidDate: Date;
  reference?: string;
  notes?: string;
}

export const RENEWAL_STATUSES = ["due", "contacted", "renewed", "lost"] as const;
export type RenewalStatus = (typeof RENEWAL_STATUSES)[number];
export const RENEWAL_STATUS_LABELS: Record<RenewalStatus, string> = {
  due: "Due",
  contacted: "Contacted",
  renewed: "Renewed",
  lost: "Lost",
};

export interface RenewalDoc extends AuditFields {
  _id: ObjectId;
  chassisNumber: string;
  dueDate: Date;
  status: RenewalStatus;
  followUpDate?: Date;
  notes?: string;
}

export type AuditEntity = "finance" | "insurance" | "incentive" | "renewal" | "vehicle" | "auth" | "user";

export interface AuditLogDoc {
  _id: ObjectId;
  at: Date;
  userId: string;
  username: string;
  action: "create" | "update" | "delete" | "login";
  entity: AuditEntity;
  entityId?: string;
  chassisNumber?: string;
  before?: unknown;
  after?: unknown;
}

export interface LoginAttemptDoc {
  _id: string;
  count: number;
  expiresAt: Date;
}
