#!/usr/bin/env node
/**
 * Demo data for client walkthroughs.
 *
 *   npm run seed:demo            # (re)load demo data
 *   npm run seed:demo -- --reset # remove demo data only
 *
 * Every document written here carries `demo: true`. A reset deletes those,
 * plus anything on the demo's fictional chassis numbers (DEMO_CHASSIS), so
 * real records are never touched. Dates are relative to "today"
 * (IST) so the dashboard always looks current. Re-running is safe.
 */
import { MongoClient, ObjectId } from "mongodb";
import bcrypt from "bcryptjs";

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || "chasis_erp";
if (!uri) {
  console.error("MONGODB_URI is not set. Run via `npm run seed:demo` (loads .env.local).");
  process.exit(1);
}
const RESET_ONLY = process.argv.includes("--reset");

/* ----------------------------------------------------------------- helpers */

const todayIso = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const TODAY = new Date(`${todayIso}T00:00:00.000Z`);
const daysAgo = (n) => new Date(TODAY.getTime() - n * 86_400_000);
const daysFromNow = (n) => daysAgo(-n);
const paise = (rupees) => Math.round(rupees * 100);
const lakh = (l) => paise(l * 100_000);
const stamp = (user, at) => ({ createdAt: at, createdBy: user, updatedAt: at, updatedBy: user, version: 1, demo: true });

/* -------------------------------------------------------------- demo data
 * One row per vehicle sold.
 *   fin: [provider, loanLakh, incentive%, initiatedDaysAgo, receivedAfterDays | null]
 *   ins: [provider, premium, incentive%, soldDaysAgo, receivedAfterDays | null, policyNo]
 * A policy runs one year from the sale, so soldDaysAgo ~320-380 means it is
 * up for renewal right now.
 */
const SALES = [
  // Story 1: big pending HDFC payout, overdue (red badge)
  { chassis: "MA3EWDE1S00412345", model: "Maruti Swift VXI", customer: "Arjun Mehta", buy: 6.45, sell: 7.12, by: "priya",
    fin: ["HDFC Bank", 5.5, 1.25, 74, null], ins: ["ICICI Lombard", 28400, 15, 74, 21, "IL-3001-88421"] },
  { chassis: "MALC381CLNM204518", model: "Hyundai Creta SX", customer: "Kavya Iyer", buy: 14.2, sell: 15.6, by: "priya",
    fin: ["HDFC Bank", 11.0, 1.1, 92, null], ins: ["HDFC ERGO", 46200, 12, 92, null, "HE-55-120934"] },
  { chassis: "MAT62512BNP318842", model: "Tata Nexon XZ+", customer: "Rohan Desai", buy: 10.1, sell: 11.05, by: "admin",
    fin: ["SBI", 8.0, 0.9, 41, 29], ins: ["TATA AIG", 33800, 14, 41, 18, "TA-0192-7731"] },
  { chassis: "MA1TA2YD2N2093411", model: "Mahindra XUV700 AX5", customer: "Neha Kulkarni", buy: 17.8, sell: 19.2, by: "priya",
    fin: ["Mahindra Finance", 14.0, 1.4, 63, null], ins: ["Bajaj Allianz", 52100, 13, 63, 30, "BA-OG-26-1102"] },
  { chassis: "MZBEN813LNN120776", model: "Kia Seltos HTX", customer: "Vikram Singh", buy: 13.6, sell: 14.75, by: "admin",
    fin: ["ICICI Bank", 10.5, 1.2, 25, null], ins: ["ICICI Lombard", 41800, 15, 25, null, "IL-3001-90112"] },
  { chassis: "MAKGM657BN4501238", model: "Honda City V", customer: "Ananya Rao", buy: 11.9, sell: 12.85, by: "priya",
    fin: ["Axis Bank", 9.0, 1.0, 118, 46], ins: ["HDFC ERGO", 36500, 12, 118, 40, "HE-55-118020"] },
  { chassis: "MA3EWDE1S00418820", model: "Maruti Baleno Zeta", customer: "Siddharth Joshi", buy: 7.3, sell: 7.95, by: "priya",
    fin: ["Kotak Mahindra Prime", 6.0, 1.3, 15, null], ins: ["New India Assurance", 24300, 10, 15, null, "NIA-31-660218"] },
  { chassis: "MALC381CLNM208840", model: "Hyundai Venue S(O)", customer: "Pooja Nair", buy: 9.4, sell: 10.2, by: "admin",
    fin: ["HDFC Bank", 7.5, 1.25, 156, 52], ins: ["ICICI Lombard", 30100, 15, 156, 35, "IL-3001-85007"] },
  { chassis: "MAT62512BNP322019", model: "Tata Punch Accomplished", customer: "Imran Shaikh", buy: 7.05, sell: 7.6, by: "priya",
    fin: ["SBI", 5.0, 0.9, 8, null], ins: ["TATA AIG", 22900, 14, 8, null, "TA-0192-8840"] },
  // Cash sales: no finance case, margin still tracked
  { chassis: "MA3EWDE1S00420117", model: "Maruti Dzire ZXI", customer: "Harish Patel", buy: 7.9, sell: 8.45, by: "priya",
    fin: null, ins: ["Bajaj Allianz", 26700, 13, 33, null, "BA-OG-26-1290"] },
  { chassis: "MAKGM657BN4507710", model: "Honda Amaze VX", customer: "Meera Pillai", buy: 8.2, sell: 8.7, by: "admin",
    fin: null, ins: ["HDFC ERGO", 27900, 12, 51, 28, "HE-55-121877"] },
  // Up for renewal now (sold ~1 year ago)
  { chassis: "MA3EWDE1S00381120", model: "Maruti Ertiga VXI", customer: "Deepak Verma", buy: 9.6, sell: 10.3, by: "admin",
    fin: ["ICICI Bank", 7.0, 1.2, 352, 41], ins: ["ICICI Lombard", 31200, 15, 352, 38, "IL-3001-61254"] },
  { chassis: "MALC381CLNM189304", model: "Hyundai i20 Asta", customer: "Shreya Ghosh", buy: 8.9, sell: 9.6, by: "admin",
    fin: ["Axis Bank", 6.5, 1.0, 340, 37], ins: ["HDFC ERGO", 29800, 12, 340, 33, "HE-55-097321"] },
  { chassis: "MAT62512BNP290553", model: "Tata Altroz XZ", customer: "Karan Malhotra", buy: 8.1, sell: 8.75, by: "admin",
    fin: null, ins: ["TATA AIG", 25600, 14, 329, 26, "TA-0192-5108"] },
  { chassis: "MZBEN813LNN099812", model: "Kia Sonet HTK+", customer: "Fatima Khan", buy: 10.4, sell: 11.2, by: "admin",
    fin: ["HDFC Bank", 8.0, 1.25, 371, 48], ins: ["Bajaj Allianz", 34400, 13, 371, 31, "BA-OG-25-0871"] },
  { chassis: "MA1TA2YD2N2071190", model: "Mahindra Scorpio-N Z4", customer: "Gurpreet Sandhu", buy: 15.2, sell: 16.4, by: "admin",
    fin: ["Mahindra Finance", 12.0, 1.4, 334, 55], ins: ["New India Assurance", 44700, 10, 334, 47, "NIA-31-588102"] },
  { chassis: "MA3EWDE1S00379945", model: "Maruti Brezza ZXI", customer: "Lakshmi Menon", buy: 10.8, sell: 11.6, by: "admin",
    fin: ["SBI", 8.5, 0.9, 345, 44], ins: ["ICICI Lombard", 35900, 15, 345, 36, "IL-3001-60391"] },
  { chassis: "MAKGM657BN4480061", model: "Honda Elevate ZX", customer: "Nikhil Bansal", buy: 14.9, sell: 16.0, by: "admin",
    fin: ["Kotak Mahindra Prime", 11.0, 1.3, 358, 50], ins: ["HDFC ERGO", 47300, 12, 358, 42, "HE-55-096612"] },
  // Older sales, everything settled
  { chassis: "MALC381CLNM176650", model: "Hyundai Verna SX", customer: "Ritu Agarwal", buy: 12.7, sell: 13.8, by: "admin",
    fin: ["ICICI Bank", 10.0, 1.2, 210, 39], ins: ["ICICI Lombard", 38800, 15, 210, 30, "IL-3001-72218"] },
  { chassis: "MAT62512BNP301877", model: "Tata Harrier Fearless", customer: "Aditya Kapoor", buy: 21.5, sell: 23.1, by: "admin",
    fin: ["HDFC Bank", 17.0, 1.25, 188, 44], ins: ["TATA AIG", 61200, 14, 188, 27, "TA-0192-6620"] },
];

/** Follow-ups for some of the policies that are up for renewal. */
const RENEWALS = [
  { chassis: "MA3EWDE1S00381120", status: "contacted", followUp: 2, notes: "Customer asked for a quote from two insurers. Call back with ICICI Lombard and HDFC ERGO comparison." },
  { chassis: "MALC381CLNM189304", status: "due", followUp: -3, notes: "Not reachable on two attempts. Try WhatsApp." },
  { chassis: "MZBEN813LNN099812", status: "renewed", followUp: null, notes: "Renewed with Bajaj Allianz, 5% NCB applied." },
  { chassis: "MA1TA2YD2N2071190", status: "lost", followUp: null, notes: "Customer renewed online directly with insurer for a lower premium." },
];

/** Payouts to people who brought or closed the deal. */
const PAYOUTS = [
  ["MA3EWDE1S00412345", 2500, "Rahul Sharma", "sales_executive", 40, "UTR SBIN226104455"],
  ["MAT62512BNP318842", 3000, "Rahul Sharma", "sales_executive", 10, "UTR SBIN226198812"],
  ["MA1TA2YD2N2093411", 5000, "Sneha Patil", "sales_executive", 28, "UTR HDFC226140021"],
  ["MA1TA2YD2N2093411", 4000, "Om Motors (sub-dealer)", "broker", 26, "CHQ 004512"],
  ["MAKGM657BN4501238", 2500, "Sneha Patil", "sales_executive", 70, "UTR HDFC226077310"],
  ["MALC381CLNM208840", 3500, "Ajay Finserv DSA", "dsa", 95, "UTR ICIC226011893"],
  ["MA3EWDE1S00381120", 2000, "Rahul Sharma", "sales_executive", 300, "UTR SBIN225880120"],
  ["MZBEN813LNN099812", 3000, "Imran Qureshi", "referral", 320, "Cash voucher 118"],
  ["MALC381CLNM176650", 4500, "Sneha Patil", "sales_executive", 160, "UTR HDFC225990441"],
  ["MAT62512BNP301877", 7500, "Om Motors (sub-dealer)", "broker", 140, "CHQ 004377"],
  ["MAT62512BNP301877", 3000, "Vikas Rao", "sales_executive", 140, "UTR AXIS225991020"],
];

/**
 * Chassis entered live while following docs/DEMO_SCRIPT.md. Records on these
 * (and on the seeded chassis above) are cleared on every run, so rehearsals
 * always start from the same numbers.
 */
const LIVE_DEMO_CHASSIS = ["MA3EWDE1S00431999"];
const DEMO_CHASSIS = [...SALES.map((s) => s.chassis), ...LIVE_DEMO_CHASSIS];

const DEMO_USERS = [
  { username: "priya", password: "Priya@2026", role: "user", label: "Data entry",
    permissions: ["overview:view", "finance:view", "finance:edit", "insurance:view", "insurance:edit", "renewals:view", "renewals:edit", "incentives:view", "incentives:edit"] },
  { username: "accounts", password: "Accounts@2026", role: "user", label: "Read only",
    permissions: ["overview:view", "finance:view", "insurance:view", "renewals:view", "incentives:view"] },
];

/* ---------------------------------------------------------------------- run */

const client = await MongoClient.connect(uri, { serverSelectionTimeoutMS: 10_000 });
const db = client.db(dbName);
const col = (n) => db.collection(n);
const BUSINESS = ["vehicles", "finance", "insurance", "renewals", "incentives", "audit_logs"];

try {
  // 1. Remove previous demo data: anything tagged demo: true, plus records on
  //    the demo's own (fictional) chassis numbers that were entered live.
  let removed = 0;
  const demoFilter = { $or: [{ demo: true }, { chassisNumber: { $in: DEMO_CHASSIS } }] };
  for (const n of BUSINESS) removed += (await col(n).deleteMany(demoFilter)).deletedCount;
  removed += (await col("users").deleteMany({ demo: true })).deletedCount;
  console.log(`Removed ${removed} previous demo documents.`);
  if (RESET_ONLY) {
    console.log("Reset complete.");
    process.exit(0);
  }

  // 2. Make sure the admin exists (the app also does this, but only when users is empty).
  if (!(await col("users").findOne({ role: "admin", active: true }))) {
    const username = (process.env.ADMIN_USERNAME || "admin").trim().toLowerCase();
    await col("users").insertOne({
      username, passwordHash: await bcrypt.hash(process.env.ADMIN_INITIAL_PASSWORD || "chasis", 12),
      role: "admin", permissions: [], active: true, tokenVersion: 0,
      createdAt: new Date(), createdBy: "system", updatedAt: new Date(), updatedBy: "system", version: 1,
    });
    console.log(`Created admin "${username}".`);
  }

  // 3. Demo users.
  for (const u of DEMO_USERS) {
    if (await col("users").findOne({ username: u.username, demo: { $ne: true } })) {
      console.log(`Skipped demo user "${u.username}" (a real user with that name exists).`);
      continue;
    }
    await col("users").insertOne({
      username: u.username, passwordHash: await bcrypt.hash(u.password, 12), role: u.role, permissions: u.permissions,
      active: true, tokenVersion: 0, passwordChangedAt: new Date(),
      createdAt: daysAgo(120), createdBy: "admin", updatedAt: daysAgo(120), updatedBy: "admin", version: 1, demo: true,
    });
  }

  // 4. Vehicles, finance and insurance.
  const vehicles = [], finance = [], insurance = [], audit = [];
  for (const s of SALES) {
    const soldAt = daysAgo(s.fin ? s.fin[3] : s.ins[3]);
    vehicles.push({
      _id: new ObjectId(), chassisNumber: s.chassis, model: s.model, customerName: s.customer,
      purchasePrice: lakh(s.buy), sellingPrice: lakh(s.sell), ...stamp(s.by, soldAt),
    });
    if (s.fin) {
      const [provider, loanL, pct, init, recvAfter] = s.fin;
      const loan = lakh(loanL);
      const received = recvAfter !== null && init - recvAfter >= 0;
      const doc = {
        _id: new ObjectId(), chassisNumber: s.chassis, provider, loanAmount: loan,
        incentiveAmount: Math.round((loan * pct) / 100), incentiveReceived: received,
        initiatedDate: daysAgo(init), ...(received ? { receivedDate: daysAgo(init - recvAfter) } : {}),
        ...stamp(s.by, daysAgo(init)),
      };
      finance.push(doc);
      audit.push({ at: daysAgo(init), user: s.by, action: "create", entity: "finance", id: doc._id, chassis: s.chassis });
    }
    if (s.ins) {
      const [provider, premium, pct, sold, recvAfter, policyNumber] = s.ins;
      const received = recvAfter !== null && sold - recvAfter >= 0;
      const doc = {
        _id: new ObjectId(), chassisNumber: s.chassis, provider, policyNumber, policyType: "new",
        premiumAmount: paise(premium), incentiveAmount: paise(Math.round((premium * pct) / 100)),
        incentiveReceived: received, initiatedDate: daysAgo(sold),
        ...(received ? { receivedDate: daysAgo(sold - recvAfter) } : {}),
        policyStartDate: daysAgo(sold), policyEndDate: daysAgo(sold - 364),
        ...stamp(s.by, daysAgo(sold)),
      };
      insurance.push(doc);
      audit.push({ at: daysAgo(sold), user: s.by, action: "create", entity: "insurance", id: doc._id, chassis: s.chassis });
    }
  }

  // 5. Renewal cases (+ the renewed policy for the "renewed" case).
  const renewals = [];
  for (const r of RENEWALS) {
    const policy = insurance.find((p) => p.chassisNumber === r.chassis);
    const doc = {
      _id: new ObjectId(), chassisNumber: r.chassis, dueDate: policy.policyEndDate, status: r.status,
      ...(r.followUp !== null ? { followUpDate: daysFromNow(r.followUp) } : {}), notes: r.notes,
      ...stamp("priya", daysAgo(12)),
    };
    renewals.push(doc);
    audit.push({ at: daysAgo(Math.max(1, 12 - renewals.length * 2)), user: "priya", action: "update", entity: "renewal", id: doc._id, chassis: r.chassis });
    if (r.status === "renewed") {
      const start = policy.policyEndDate;
      const renewed = {
        _id: new ObjectId(), chassisNumber: r.chassis, provider: policy.provider, policyNumber: `${policy.policyNumber}-R1`,
        policyType: "renewal", premiumAmount: paise(32_100), incentiveAmount: paise(4_170), incentiveReceived: false,
        initiatedDate: daysAgo(6), policyStartDate: start, policyEndDate: new Date(start.getTime() + 364 * 86_400_000),
        ...stamp("priya", daysAgo(6)),
      };
      insurance.push(renewed);
      audit.push({ at: daysAgo(6), user: "priya", action: "create", entity: "insurance", id: renewed._id, chassis: r.chassis });
    }
  }

  // 6. Incentive payouts.
  const incentives = PAYOUTS.map(([chassis, amount, paidTo, payeeType, ago, reference]) => {
    const doc = {
      _id: new ObjectId(), chassisNumber: chassis, amount: paise(amount), paidTo, payeeType,
      paidDate: daysAgo(ago), reference, ...stamp("admin", daysAgo(ago)),
    };
    audit.push({ at: daysAgo(ago), user: "admin", action: "create", entity: "incentive", id: doc._id, chassis });
    return doc;
  });

  await col("vehicles").insertMany(vehicles);
  await col("finance").insertMany(finance);
  await col("insurance").insertMany(insurance);
  await col("renewals").insertMany(renewals);
  await col("incentives").insertMany(incentives);

  // 7. Audit trail so "Recent activity" reads naturally (times spread through the working day).
  const users = await col("users").find({}, { projection: { username: 1 } }).toArray();
  const idOf = (name) => users.find((u) => u.username === name)?._id.toHexString() ?? "demo";
  await col("audit_logs").insertMany(
    audit.map((a, i) => ({
      _id: new ObjectId(), at: new Date(a.at.getTime() + (4 + (i % 8)) * 3_600_000 + (i * 7 % 60) * 60_000),
      userId: idOf(a.user), username: a.user, action: a.action, entity: a.entity,
      entityId: a.id.toHexString(), chassisNumber: a.chassis, demo: true,
    })),
  );

  // Summary
  const sum = (arr, f) => arr.reduce((t, d) => t + f(d), 0) / 100;
  const inr = (n) => n.toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
  console.log(`\nLoaded demo data into "${dbName}" (today = ${todayIso}):`);
  console.log(`  ${vehicles.length} vehicles, ${finance.length} finance cases, ${insurance.length} policies, ${renewals.length} renewal cases, ${incentives.length} payouts`);
  console.log(`  Finance incentive pending: ${inr(sum(finance.filter((f) => !f.incentiveReceived), (f) => f.incentiveAmount))}`);
  console.log(`  Insurance incentive pending: ${inr(sum(insurance.filter((f) => !f.incentiveReceived), (f) => f.incentiveAmount))}`);
  console.log(`  Payouts: ${inr(sum(incentives, (p) => p.amount))}`);
  console.log(`\nDemo logins:  admin / (your admin password)`);
  for (const u of DEMO_USERS) console.log(`               ${u.username} / ${u.password}   (${u.label})`);
} catch (err) {
  console.error("Seeding failed:", err.message);
  process.exitCode = 1;
} finally {
  await client.close();
}
