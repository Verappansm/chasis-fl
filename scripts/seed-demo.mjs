#!/usr/bin/env node
/**
 * Demo data for client walkthroughs (VST Titanium Motors, Mercedes-Benz).
 *
 *   npm run seed:demo            # (re)load demo data and demo users
 *   npm run seed:demo -- --reset # remove demo data and demo users only
 *
 * Every document written here carries `demo: true`, and a reset deletes only
 * those, so real records are never touched. Dates are relative to "today"
 * (IST) so the dashboard always looks current. Re-running is safe. The
 * random numbers are seeded, so every run produces the same cars.
 *
 * The calculations mirror src/lib/calc.ts; keep them in step.
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
const DAY = 86_400_000;
const daysAgo = (n) => new Date(TODAY.getTime() - n * DAY);
const addDays = (d, n) => new Date(d.getTime() + n * DAY);
const ageOf = (d) => Math.round((TODAY.getTime() - d.getTime()) / DAY);
const lakh = (l) => Math.round(l * 100_000) * 100; // rupees in lakh → paise
const percentOf = (amount, bp) => Math.round((amount * bp) / 10_000);
const roundTo = (paise, rupees) => Math.round(paise / (rupees * 100)) * rupees * 100;

// Deterministic PRNG (mulberry32) so every run produces the same demo.
let seed = 20261114;
function rand() {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const between = (a, b) => a + Math.floor(rand() * (b - a + 1));
const chance = (p) => rand() < p;
const VIN_CHARS = "ABCDEFGHJKLMNPRSTUVWXYZ0123456789";
const chassis = () => `MBR${Array.from({ length: 14 }, () => pick(VIN_CHARS)).join("")}`;
const fy = (d) => {
  const y = d.getUTCMonth() >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  return `${String(y).slice(2)}-${String(y + 1).slice(2)}`;
};

/* -------------------------------------------------------------- reference data */

const MODELS = [
  { carClass: "A-Class Limousine", model: "A 200", grade: "series", basic: 42 },
  { carClass: "C-Class", model: "C 200", grade: "series", basic: 54 },
  { carClass: "C-Class", model: "C 220d", grade: "series", basic: 58 },
  { carClass: "E-Class LWB", model: "E 200", grade: "series", basic: 70 },
  { carClass: "E-Class LWB", model: "E 220d", grade: "series", basic: 74 },
  { carClass: "GLA", model: "GLA 200", grade: "series", basic: 46 },
  { carClass: "GLC", model: "GLC 300 4MATIC", grade: "series", basic: 72 },
  { carClass: "GLE", model: "GLE 300d 4MATIC", grade: "series", basic: 92 },
  { carClass: "GLS", model: "GLS 450 4MATIC", grade: "top_end", basic: 118 },
  { carClass: "S-Class", model: "S 350d", grade: "top_end", basic: 165 },
  { carClass: "Maybach", model: "Maybach S 580", grade: "top_end", basic: 255 },
  { carClass: "EQA", model: "EQA 250+", grade: "ev", basic: 63 },
  { carClass: "EQB", model: "EQB 350 4MATIC", grade: "ev", basic: 72 },
  { carClass: "EQE SUV", model: "EQE 500 4MATIC", grade: "ev", basic: 132 },
  { carClass: "EQS SUV", model: "EQS 580 4MATIC", grade: "ev", basic: 136 },
];
const LOCATIONS = ["Main showroom", "City showroom", "Stockyard"];
const CUSTOMERS = [
  "Arjun Mehta", "Kavya Iyer", "Rohan Desai", "Neha Kulkarni", "Vikram Singh", "Ananya Rao", "Siddharth Joshi",
  "Pooja Nair", "Imran Shaikh", "Harish Patel", "Meera Pillai", "Deepak Verma", "Shreya Ghosh", "Karan Malhotra",
  "Fatima Khan", "Gurpreet Sandhu", "Lakshmi Menon", "Nikhil Bansal", "Ritu Agarwal", "Aditya Kapoor", "Sanjay Reddy",
  "Divya Krishnan", "Rahul Bhatia", "Priya Raman", "Varun Chopra", "Aisha Siddiqui", "Manoj Pillai", "Sneha Patil",
  "Kiran Rao", "Tarun Gupta", "Nandini Iyer", "Abhishek Jain", "Rekha Subramaniam", "Farhan Ali", "Meghna Das",
];
const BANKS = ["Mercedes-Benz Financial Services", "HDFC Bank", "ICICI Bank", "Axis Bank", "Kotak Mahindra Prime", "SBI"];
const INSURERS = ["ICICI Lombard", "HDFC ERGO", "Bajaj Allianz", "TATA AIG", "Go Digit"];
const MAKES = ["Mercedes-Benz", "BMW", "Audi", "Volvo", "Jaguar", "Lexus"];

/** Starter option lists (only written where an admin has not created the list). */
const OPTION_LISTS = {
  location: { mode: "dropdown", options: LOCATIONS },
  carClass: { mode: "text", options: [...new Set(MODELS.map((m) => m.carClass))] },
  model: { mode: "text", options: MODELS.map((m) => m.model) },
  financeProvider: { mode: "dropdown", options: BANKS },
  insuranceProvider: { mode: "dropdown", options: INSURERS },
  preownedMake: { mode: "text", options: MAKES },
};

const DEMO_USERS = [
  {
    username: "sales", password: "Sales@2026", label: "Sales desk: creates records and raises invoices, no receipts",
    permissions: ["overview:view", "purchases:invoice", "preowned:edit", "finance:invoice", "insurance:invoice", "renewals:invoice"],
  },
  {
    username: "accounts", password: "Accounts@2026", label: "Accounts: views everything, records receipts",
    permissions: ["overview:view", "purchases:receipt", "preowned:view", "finance:receipt", "insurance:receipt", "renewals:receipt"],
  },
  {
    username: "manager", password: "Manager@2026", label: "Manager: all data access incl. delete, no user admin",
    permissions: [
      "overview:view", "purchases:invoice", "purchases:receipt", "purchases:delete", "preowned:edit", "preowned:delete",
      "finance:invoice", "finance:receipt", "finance:delete", "insurance:invoice", "insurance:receipt", "insurance:delete",
      "renewals:invoice", "renewals:receipt", "renewals:delete",
    ],
  },
  {
    username: "viewer", password: "Viewer@2026", label: "Read only",
    permissions: ["overview:view", "purchases:view", "preowned:view", "finance:view", "insurance:view", "renewals:view"],
  },
];

/** Adds the implied `view` for each action, like normalizePermissions(). */
function withView(perms) {
  const out = new Set(perms);
  for (const p of perms) out.add(`${p.split(":")[0]}:view`);
  return [...out];
}

/* ---------------------------------------------------------------------- run */

const client = await MongoClient.connect(uri, { serverSelectionTimeoutMS: 10_000 });
const db = client.db(dbName);
const col = (n) => db.collection(n);
const BUSINESS = ["purchases", "preowned", "finance_payouts", "insurance_payouts", "renewal_payouts", "audit_logs"];

try {
  // 1. Remove previous demo data and demo users (and starter lists nobody has edited).
  let removed = 0;
  for (const n of BUSINESS) removed += (await col(n).deleteMany({ demo: true })).deletedCount;
  removed += (await col("users").deleteMany({ demo: true })).deletedCount;
  removed += (await col("option_lists").deleteMany({ demo: true, version: 1 })).deletedCount;
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
      username: u.username, passwordHash: await bcrypt.hash(u.password, 12), role: "user", permissions: withView(u.permissions),
      active: true, tokenVersion: 0, passwordChangedAt: new Date(),
      createdAt: daysAgo(120), createdBy: "admin", updatedAt: daysAgo(120), updatedBy: "admin", version: 1, demo: true,
    });
  }

  // 4. Starter option lists.
  for (const [key, list] of Object.entries(OPTION_LISTS)) {
    await col("option_lists").updateOne(
      { _id: key },
      { $setOnInsert: { ...list, updatedAt: new Date(), updatedBy: "admin", version: 1, demo: true } },
      { upsert: true },
    );
  }

  // 5. Rates: whatever the admin has set under Constants, else the defaults.
  const s = (await col("settings").findOne({ _id: "rates" })) ?? {};
  const R = {
    fc: s.fcRateBp ?? 350, purchaseGst: s.purchaseGstRateBp ?? 1800, evGst: s.evPurchaseGstRateBp ?? 500,
    saleGst: s.saleGstRateBp ?? 1800, serviceGst: s.serviceGstRateBp ?? 1800,
    tds: { fc: s.fcTdsRateBp ?? s.tdsRateBp ?? 200, finance: s.financeTdsRateBp ?? s.tdsRateBp ?? 200, insurance: s.insuranceTdsRateBp ?? s.tdsRateBp ?? 200 },
    lockIn: s.demoLockInDays ?? 90,
  };
  const gstFor = (grade) => (grade === "ev" ? R.evGst : R.purchaseGst);

  const stamp = (user, at) => ({ createdAt: at, createdBy: user, updatedAt: at, updatedBy: user, version: 1, demo: true });
  const audit = [];
  const log = (at, user, action, entity, doc) =>
    audit.push({ at, user, action, entity, id: doc._id, chassis: doc.chassisNumber, ref: doc.commissionNo ?? doc.stockNo ?? doc.dealRef });

  // Our invoice numbers are one series across all tabs; numbered in date order at the end.
  const pendingInvoices = [];
  const invoiceNo = (date) => {
    const ref = { date, no: "" };
    pendingInvoices.push(ref);
    return ref;
  };
  let receiptSeq = 400000;

  /**
   * Walks a receivable through invoice → receipt(s) depending on its age, so
   * the overview shows a realistic spread: recent ones unbilled, older ones
   * billed, most of the oldest collected, some short-paid (a few of those
   * settled later with a second receipt).
   */
  function claim(claimAmount, startedOn, tdsRateBp) {
    const claimGst = percentOf(claimAmount, R.serviceGst);
    const claimTotal = claimAmount + claimGst;
    const c = { serviceGstRateBp: R.serviceGst, tdsRateBp, claimAmount, claimGst, claimTotal, stage: "not_billed" };
    const age = ageOf(startedOn);
    const billChance = age < 3 ? 0 : age < 10 ? 0.6 : age < 30 ? 0.85 : 0.94;
    if (!chance(billChance)) return c;
    const invoiceDate = addDays(startedOn, between(1, Math.min(8, Math.max(1, age - 1))));
    if (invoiceDate > TODAY) return c;
    Object.assign(c, { invoiceNo: invoiceNo(invoiceDate), invoiceDate, stage: "billed" });
    const invAge = ageOf(invoiceDate);
    const payChance = invAge < 6 ? 0 : invAge < 25 ? 0.5 : invAge < 75 ? 0.8 : 0.9;
    if (!chance(payChance)) return c;
    const receiptDate = addDays(invoiceDate, between(5, Math.min(45, Math.max(5, invAge))));
    if (receiptDate > TODAY) return c;
    const tdsAmount = percentOf(claimAmount, tdsRateBp);
    const payable = claimTotal - tdsAmount;
    const short = chance(0.16) ? roundTo(Math.round(payable * (0.03 + rand() * 0.07)), 100) : 0;
    const receipts = [
      { id: new ObjectId().toHexString(), receiptNo: `RC${receiptSeq++}`, receiptDate, tdsAmount, receivedAmount: payable - short, at: receiptDate, by: "accounts" },
    ];
    // Some short payments are settled later.
    const settleOn = addDays(receiptDate, between(20, 50));
    if (short > 0 && settleOn <= TODAY && chance(0.4)) {
      receipts.push({ id: new ObjectId().toHexString(), receiptNo: `RC${receiptSeq++}`, receiptDate: settleOn, tdsAmount: 0, receivedAmount: short, at: settleOn, by: "accounts" });
    }
    const tds = receipts.reduce((t, r) => t + r.tdsAmount, 0);
    const received = receipts.reduce((t, r) => t + r.receivedAmount, 0);
    const latest = receipts.at(-1);
    const balance = claimTotal - tds - received;
    return Object.assign(c, {
      receipts, tdsAmount: tds, receivedAmount: received, receiptNo: latest.receiptNo, receiptDate: latest.receiptDate,
      balance, stage: balance > 0 ? "short_paid" : "collected",
    });
  }

  function priced(m, purchaseDate, { salesBp, demoBp = 0, lossChance = 0.3 }) {
    const basicPrice = lakh(m.basic + rand() * 4);
    const salesMeasure = roundTo(percentOf(basicPrice, salesBp), 1000);
    const demoDiscount = demoBp ? roundTo(percentOf(basicPrice, demoBp), 1000) : 0;
    const lossAllowance = chance(lossChance) ? roundTo(percentOf(basicPrice, between(10, 120)), 500) : 0;
    const taxableAmount = basicPrice - salesMeasure - demoDiscount - lossAllowance;
    const purchaseGstRateBp = gstFor(m.grade);
    const gstAmount = percentOf(taxableAmount, purchaseGstRateBp);
    return {
      grade: m.grade, carClass: m.carClass, model: m.model, basicPrice, salesMeasure, demoDiscount, lossAllowance,
      taxableAmount, purchaseGstRateBp, gstAmount, finalPrice: taxableAmount + gstAmount, purchaseDate,
    };
  }

  // 6. Purchases. New cars are spread over the last ~13 months (more recent = more of them).
  const purchases = [];
  let commission = 1104520300;
  const nextCommission = () => String((commission += between(11, 97)));
  const NEW_PER_BUCKET = [[0, 13, 14], [14, 30, 10], [31, 60, 12], [61, 90, 9], [91, 180, 8], [181, 300, 5], [330, 375, 16]];
  for (const [from, to, n] of NEW_PER_BUCKET) {
    for (let i = 0; i < n; i++) {
      const m = pick(MODELS);
      const purchaseDate = daysAgo(between(from, to));
      const p = priced(m, purchaseDate, { salesBp: between(50, 300) });
      const doc = {
        _id: new ObjectId(), commissionNo: nextCommission(), chassisNumber: chassis(), type: "new",
        location: pick(LOCATIONS), customerName: pick(CUSTOMERS), benzInvoiceNo: `MBIL${between(10000000, 99999999)}`,
        ...p, fcRateBp: R.fc, ...claim(percentOf(p.basicPrice, R.fc), purchaseDate, R.tds.fc),
        ...stamp(pick(["sales", "sales", "admin"]), purchaseDate),
      };
      purchases.push(doc);
      log(purchaseDate, doc.createdBy, "create", "purchase", doc);
    }
  }

  /**
   * Demo cars: some still in lock-in, some defleeted and waiting (a couple for
   * a long time), and many sold across the year, at a loss or a small profit.
   * Cars without a demo discount usually carry a loss claim with Mercedes-Benz.
   */
  const DEMOS = [
    { ago: 12 }, { ago: 38 }, { ago: 66 }, { ago: 84 },
    { ago: 98 }, { ago: 130 }, { ago: 175 }, { ago: 240, noDiscount: true },
    { ago: 118, soldAfter: 95 }, { ago: 140, soldAfter: 100, noDiscount: true }, { ago: 165, soldAfter: 112 },
    { ago: 190, soldAfter: 98, noDiscount: true }, { ago: 220, soldAfter: 130 }, { ago: 250, soldAfter: 120, noDiscount: true },
    { ago: 290, soldAfter: 150 }, { ago: 320, soldAfter: 105 }, { ago: 350, soldAfter: 140, noDiscount: true },
    { ago: 380, soldAfter: 160 }, { ago: 420, soldAfter: 110, noDiscount: true, noClaim: true },
  ];
  for (const o of DEMOS) {
    const m = pick(MODELS);
    const purchaseDate = daysAgo(o.ago);
    const p = priced(m, purchaseDate, { salesBp: between(50, 200), demoBp: o.noDiscount ? 0 : between(400, 800), lossChance: 0.5 });
    const deflectDate = addDays(purchaseDate, R.lockIn);
    let sale = {};
    if (o.soldAfter) {
      const saleDate = addDays(purchaseDate, Math.max(o.soldAfter, R.lockIn));
      const salePrice = roundTo(Math.round(p.taxableAmount * (0.86 + rand() * 0.16)), 10000);
      const saleGst = percentOf(salePrice, R.saleGst);
      const saleTotal = salePrice + saleGst;
      const priceDifference = saleTotal - p.finalPrice;
      const lossClaim = o.noDiscount && !o.noClaim && priceDifference < 0 ? roundTo(Math.round(-priceDifference * (0.4 + rand() * 0.5)), 1000) : 0;
      const saleSalesMeasure = chance(0.6) ? roundTo(percentOf(p.basicPrice, between(50, 200)), 1000) : 0;
      sale = {
        saleDate, soldTo: pick(CUSTOMERS), salePrice, saleGstRateBp: R.saleGst, saleGst, saleTotal,
        priceDifference, lossClaim, saleSalesMeasure, netProfit: priceDifference + lossClaim + saleSalesMeasure,
      };
    }
    const doc = {
      _id: new ObjectId(), commissionNo: nextCommission(), chassisNumber: chassis(), type: "demo",
      location: pick(LOCATIONS), benzInvoiceNo: `MBIL${between(10000000, 99999999)}`, ...p, stage: "na",
      lockInDays: R.lockIn, deflectDate, ...sale, ...stamp("sales", purchaseDate),
    };
    purchases.push(doc);
    log(purchaseDate, "sales", "create", "purchase", doc);
    if (doc.saleDate) log(doc.saleDate, "sales", "update", "purchase", doc);
  }

  // Bidding and courtesy cars.
  const OTHERS = [
    { type: "bidding", ago: 35 }, { type: "bidding", ago: 70, soldAfter: 25 },
    { type: "courtesy", ago: 160 }, { type: "courtesy", ago: 240, soldAfter: 200 },
  ];
  for (const o of OTHERS) {
    const m = pick(MODELS);
    const purchaseDate = daysAgo(o.ago);
    const p = priced(m, purchaseDate, { salesBp: between(50, 200), lossChance: 0.5 });
    let sale = {};
    if (o.soldAfter) {
      const salePrice = roundTo(Math.round(p.taxableAmount * 0.97), 10000);
      const saleGst = percentOf(salePrice, R.saleGst);
      sale = { saleDate: addDays(purchaseDate, o.soldAfter), soldTo: pick(CUSTOMERS), salePrice, saleGstRateBp: R.saleGst, saleGst, saleTotal: salePrice + saleGst };
    }
    const doc = {
      _id: new ObjectId(), commissionNo: nextCommission(), chassisNumber: chassis(), type: o.type,
      location: pick(LOCATIONS), benzInvoiceNo: `MBIL${between(10000000, 99999999)}`, ...p, stage: "na", ...sale,
      ...stamp("sales", purchaseDate),
    };
    purchases.push(doc);
    log(purchaseDate, "sales", "create", "purchase", doc);
  }

  // 7. Pre-owned: bought from customers; two sold.
  const PREOWNED = [
    { make: "Mercedes-Benz", model: "C 220d", year: 2021, buy: 32, ago: 25, use: "exchange" },
    { make: "Mercedes-Benz", model: "GLA 200", year: 2022, buy: 30.5, ago: 48, use: "resale" },
    { make: "BMW", model: "320d Luxury Line", year: 2020, buy: 26, ago: 70, use: "exchange" },
    { make: "Mercedes-Benz", model: "E 220d", year: 2020, buy: 38, ago: 95, use: "resale", soldAfter: 40, sell: 42.5 },
    { make: "Audi", model: "Q5 45 TFSI", year: 2021, buy: 34, ago: 140, use: "exchange", soldAfter: 30, sell: 37 },
  ];
  const preowned = PREOWNED.map((p, i) => {
    const purchaseDate = daysAgo(p.ago);
    const doc = {
      _id: new ObjectId(), stockNo: `PO-D${String(i + 1).padStart(3, "0")}`, chassisNumber: chassis(),
      registrationNo: `TN${String(between(1, 99)).padStart(2, "0")}${pick(["AB", "BC", "CK", "DZ"])}${between(1000, 9999)}`,
      make: p.make, model: p.model, yearOfMake: p.year, sellerName: pick(CUSTOMERS), purchaseDate,
      purchasePrice: lakh(p.buy), intendedUse: p.use,
      ...(p.soldAfter ? { saleDate: addDays(purchaseDate, p.soldAfter), buyerName: pick(CUSTOMERS), salePrice: lakh(p.sell) } : {}),
      ...stamp("sales", purchaseDate),
    };
    log(purchaseDate, "sales", "create", "preowned", doc);
    return doc;
  });

  // 8. Payouts on sold cars: finance on about half, insurance on most.
  const deals = [
    ...purchases
      .filter((p) => p.type === "new" || p.saleDate)
      .map((p) => ({ ref: p.commissionNo, kind: "purchase", chassis: p.chassisNumber, soldOn: p.type === "new" ? p.purchaseDate : p.saleDate, value: p.saleTotal ?? p.finalPrice, basic: p.basicPrice })),
    ...preowned
      .filter((p) => p.saleDate)
      .map((p) => ({ ref: p.stockNo, kind: "preowned", chassis: p.chassisNumber, soldOn: p.saleDate, value: p.salePrice, basic: p.salePrice })),
  ];
  const finance = [], insurance = [], renewals = [];
  for (const d of deals) {
    const link = { dealRef: d.ref, dealKind: d.kind, chassisNumber: d.chassis };
    if (chance(0.55)) {
      const disbursalDate = addDays(d.soldOn, between(1, 6));
      if (disbursalDate <= TODAY) {
        const loanAmount = roundTo(Math.round(d.value * (0.55 + rand() * 0.25)), 10000);
        const doc = {
          _id: new ObjectId(), ...link, provider: pick(BANKS), loanAmount, contractNo: `LN${between(10000000, 99999999)}`,
          disbursalDate, ...claim(roundTo(percentOf(loanAmount, between(60, 140)), 100), disbursalDate, R.tds.finance), ...stamp("sales", disbursalDate),
        };
        finance.push(doc);
        log(disbursalDate, "sales", "create", "finance", doc);
      }
    }
    if (chance(0.82)) {
      const policyStartDate = d.soldOn;
      const odPremium = roundTo(percentOf(d.basic, between(150, 230)), 100);
      const doc = {
        _id: new ObjectId(), ...link, provider: pick(INSURERS), policyNumber: `P${between(100000000, 999999999)}`, odPremium,
        policyStartDate, policyEndDate: addDays(policyStartDate, 364),
        ...claim(roundTo(percentOf(odPremium, between(1000, 1800)), 10), policyStartDate, R.tds.insurance), ...stamp("sales", policyStartDate),
      };
      insurance.push(doc);
      log(policyStartDate, "sales", "create", "insurance", doc);

      // About a year on: renew about half of the policies that have come up, with the same insurer.
      const end = doc.policyEndDate;
      if (ageOf(end) > -25 && chance(0.55)) {
        const start = addDays(end, 1);
        const createdOn = addDays(end, -between(5, 15)) < TODAY ? addDays(end, -between(5, 15)) : TODAY;
        const ren = {
          _id: new ObjectId(), ...link, provider: doc.provider,
          policyNumber: `P${between(100000000, 999999999)}`, odPremium: roundTo(Math.round(odPremium * 0.88), 100),
          policyStartDate: start, policyEndDate: addDays(start, 364),
          ...claim(roundTo(percentOf(odPremium, between(900, 1500)), 10), createdOn, R.tds.insurance), ...stamp("sales", createdOn),
        };
        renewals.push(ren);
        log(createdOn, "sales", "create", "renewal", ren);
      }
    }
  }

  // Number our invoices in date order, one series per financial year ("D" marks demo data).
  pendingInvoices.sort((a, b) => a.date - b.date);
  const perFy = {};
  for (const inv of pendingInvoices) {
    const f = fy(inv.date);
    perFy[f] = (perFy[f] ?? 0) + 1;
    inv.no = `VST/${f}/D${String(perFy[f]).padStart(4, "0")}`;
  }
  for (const doc of [...purchases, ...finance, ...insurance, ...renewals]) if (doc.invoiceNo) doc.invoiceNo = doc.invoiceNo.no;

  await col("purchases").insertMany(purchases);
  await col("preowned").insertMany(preowned);
  if (finance.length) await col("finance_payouts").insertMany(finance);
  if (insurance.length) await col("insurance_payouts").insertMany(insurance);
  if (renewals.length) await col("renewal_payouts").insertMany(renewals);

  // 9. Audit trail so "Recent activity" and the activity log read naturally (times spread through the working day).
  const users = await col("users").find({}, { projection: { username: 1 } }).toArray();
  const idOf = (name) => users.find((u) => u.username === name)?._id.toHexString() ?? "demo";
  await col("audit_logs").insertMany(
    audit.map((a, i) => ({
      _id: new ObjectId(), at: new Date(a.at.getTime() + (4 + (i % 8)) * 3_600_000 + ((i * 7) % 60) * 60_000),
      userId: idOf(a.user), username: a.user, action: a.action, entity: a.entity,
      entityId: a.id.toHexString(), ref: a.ref, chassisNumber: a.chassis, ip: "10.0.0.12", demo: true,
    })),
  );

  // Summary
  const thisMonth = new Date(Date.UTC(TODAY.getUTCFullYear(), TODAY.getUTCMonth(), 1));
  const newThisMonth = purchases.filter((p) => p.type === "new" && p.purchaseDate >= thisMonth);
  const count = (arr, stage) => arr.filter((p) => p.stage === stage).length;
  const demos = purchases.filter((p) => p.type === "demo");
  const demoSold = demos.filter((p) => p.saleDate);
  console.log(`\nLoaded demo data into "${dbName}" (today = ${todayIso}):`);
  console.log(`  ${purchases.length} purchases (${purchases.filter((p) => p.type === "new").length} new, ${demos.length} demo), ${preowned.length} pre-owned`);
  console.log(`  ${finance.length} finance, ${insurance.length} insurance, ${renewals.length} renewal payouts, ${pendingInvoices.length} invoices`);
  console.log(
    `  New cars this month: ${newThisMonth.length} · not billed ${count(newThisMonth, "not_billed")} · billed ${count(newThisMonth, "billed")} · collected ${count(newThisMonth, "collected")} · short-paid ${count(newThisMonth, "short_paid")}`,
  );
  console.log(
    `  Demo cars: ${demos.length - demoSold.length} in stock, ${demoSold.length} sold, net ₹${(demoSold.reduce((t, p) => t + p.netProfit, 0) / 100).toLocaleString("en-IN")}`,
  );
  console.log(`\nDemo logins:  admin / (your admin password, default "chasis")`);
  for (const u of DEMO_USERS) console.log(`               ${u.username.padEnd(9)} / ${u.password.padEnd(14)} ${u.label}`);
} catch (err) {
  console.error("Seeding failed:", err.message);
  if (err.errInfo) console.error(JSON.stringify(err.errInfo, null, 2).slice(0, 2000));
  process.exitCode = 1;
} finally {
  await client.close();
}
