# Chasis ERP

ERP for **VST Titanium Motors**, a Mercedes-Benz agency dealership. It tracks every
car bought from Mercedes-Benz and every receivable, through **invoice → receipt**:

- **Purchase**: one row per **commission no** (a chassis can repeat if the car is sold again). Types *new*, *demo*, *bidding*, *courtesy*, plus any types an admin adds. Purchase total (taxable), deduction %, GST (EVs at the EV rate) and total purchase are calculated. **New** cars earn **fixed compensation** (FC, default 3.5% of basic price) from Mercedes-Benz: FC + GST is invoiced, and each payment is recorded as a receipt (TDS, amount received) until nothing is left to pay. **Demo** cars are locked in (default 90 days) and can only be sold once deflected.
- **Demo stock**: only the demo cars, as *live* (in lock-in), *deflected* or *sold*, with the sale P&L: **A** = total selling price (SP + GST) − total purchase, **B** = loss claim with Mercedes-Benz (hinted only when there was no demo discount), **C** = sales measure on the sale, **net = A + B + C**. Stock and P&L analytics with charts.
- **Pre-owned**: cars bought from customers, for exchange or resale (stock no `PO-0001`…), and their sale.
- **Finance payout / Insurance payout / Renewal payout**: the same invoice → receipt loop for payouts from banks and insurers. Payouts need a sold car; a renewal needs an existing insurance with us. Loan value cannot exceed the car value.
- **Overview**: per stream, how many receivables are *not billed*, *billed but not collected*, *collected* or *short-paid*, by period (this month, last month, FY, all); charts of invoiced vs collected by month, outstanding by invoice age, cars bought per month and top providers; demo P&L.
- **Constants** (admin): FC %, GST on invoices, purchase GST (petrol/diesel and EV), GST on selling price, TDS per payer (Mercedes-Benz, finance, insurers), demo lock-in days. Each record keeps the rates it was created with. Also the **form choices** for type, location, class, model, finance provider, insurance provider and pre-owned make: per field, a free **text box** (with suggestions) or a **drop-down** of only the admin's options.
- **Activity log** (admin): every change with who, when, from which IP and which fields changed (old → new), plus sign-ins, failed sign-ins, sign-outs and refused access. Filter by user, area, action, dates and reference.

For the business analysis, system design and database design, see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Stack

Next.js 16 (App Router, Server Actions, Cache Components) · React 19 · TypeScript ·
Tailwind CSS 4 · MongoDB (official driver) · zod · jose (JWT) · bcrypt.

## Local setup

```bash
npm install
cp .env.example .env.local   # then fill in MONGODB_URI and AUTH_SECRET
npm run dev                  # http://localhost:3000
```

Generate `AUTH_SECRET` with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

The first request creates the collections with their schema validators and indexes. If the `users` collection is
empty, it also creates the admin account from `ADMIN_USERNAME` /
`ADMIN_INITIAL_PASSWORD` (default **admin / chasis**).

> **Security:** `chasis` is a weak password and was requested for the initial
> handover. Set a strong `ADMIN_INITIAL_PASSWORD` **before the first production
> run**. The env var only applies when the admin is first created; changing it
> later has no effect.

## Deploy to Vercel

1. Push this repo to GitHub/GitLab and import it in Vercel. The framework is auto-detected and no build settings are needed.
2. In **Project → Settings → Environment Variables**, set:

   | Name | Value |
   |---|---|
   | `MONGODB_URI` | your Atlas connection string |
   | `MONGODB_DB` | `chasis_erp` |
   | `AUTH_SECRET` | 48+ random characters (unique per environment) |
   | `ADMIN_USERNAME` | `admin` |
   | `ADMIN_INITIAL_PASSWORD` | strong password |

3. In **MongoDB Atlas → Network Access**, allow Vercel to connect. Use `0.0.0.0/0`
   with a strong DB-user password, or Vercel's static egress IPs on paid plans.
   Give the DB user `readWrite` on the app database only.
4. Deploy, then open `/login`.

## Users & access

Admins manage people under **Users** in the sidebar (`/admin/users`):

- **Roles:** *Admin* has full access plus user management and Constants. *User* gets only the permissions ticked on their account.
- **Permissions:** per tab, **View**, **Invoice** (create and edit, up to raising the invoice), **Receipt** (record the receipt after the invoice) and **Delete**, plus the Overview dashboard. Pre-owned has no invoice loop, so it has **Create & edit** instead. Every right includes View. Quick-fill presets: Read only, Sales desk, Accounts, All data access. Accounts saved before this change with "edit" get Invoice + Receipt.
- **Passwords are never shown**, not even to admins. Admins can only reset them.
- **Users always know their access:** each tab shows what they can and cannot do there, and a refused page says exactly which right was missing (the attempt is logged).
- **Changes take effect on the user's next click**, with no need to sign out. Deactivating a user or resetting their password signs them out everywhere.
- **Lock-out protection:** admins cannot demote or deactivate themselves, and the last active admin cannot be removed.
- Users are **deactivated, not deleted**, so the audit trail stays intact.
- Everyone can change their own password under **My account** (click your name in the sidebar).

Every rule is enforced on the server for each page and each save, so hiding a button is never the only protection.

## Security

- **Everything needs a password.** Every page and every save requires a signed-in, active user; only `/login` and `robots.txt` are public. Each server action re-checks the user's right on the server.
- **Encrypted in transit.** HTTPS with HSTS (preload) and `upgrade-insecure-requests` in production; the app refuses a MongoDB URI with TLS turned off, and forces TLS for any non-local database. Atlas also encrypts data at rest.
- **Sessions:** signed (HS256) httpOnly, SameSite=Lax cookie, `__Host-` prefixed and Secure in production, 8-hour lifetime; the user is re-checked against the database on every request, so deactivation or a password reset takes effect immediately.
- **Passwords:** bcrypt (cost 12), never returned to any page or log; login throttled per user and per IP; generic error message, constant-time comparison.
- **Headers:** strict Content-Security-Policy, `frame-ancestors 'none'`, nosniff, strict referrer policy, COOP/CORP same-origin, `no-store` on pages; nothing is indexed (robots meta + robots.txt).
- **Database:** every collection has a MongoDB `$jsonSchema` validator as a last line of defence behind the app's validation; unique indexes on commission no, stock no, invoice no and one finance/insurance payout per sale.
- **Monitoring:** the activity log is append-only from the app.

Before go-live: change the admin password, run `npm run seed:demo -- --reset` to remove the demo users (their passwords are in this repo), and set `AUTH_SECRET` per environment.

## Dates

Lists show dates as **dd-mm-yyyy**. Click any date to switch every date to **Mmm-yy** (e.g. Apr-26) and back; the choice is remembered per browser.

## Guided tour

New users get a step-by-step tour on their first sign-in. It spotlights each part of the app, asks them to click each tab, and explains what they're looking at. It only shows sections the person has access to. Finishing or skipping is remembered per user, across devices; **Take the tour** in the sidebar replays it. Steps live in `src/lib/tour-steps.ts`.

To show the tour to someone again, unset `tourCompletedAt` on their `users` document.

## Performance notes

- `vercel.json` pins server functions to **Mumbai (`bom1`)**, next to the Atlas cluster (AWS ap-south-1). If the database ever moves region, change this too; every query crosses the gap.
- Validators and indexes are applied once and recorded in `_meta`. Bump `SCHEMA_VERSION` in `src/lib/db/collections.ts` when you change `ensureIndexes()` or `src/lib/db/validators.ts`.

## Operations

- **Revoke all sessions for a user:** reset their password, deactivate them, or increment `tokenVersion` on their `users` document.
- **Audit trail:** the `audit_logs` collection records every create, update, delete, sign-in, failed sign-in, sign-out and refused access, with the changed fields, before/after snapshots, IP and browser. Admins read it under **Activity log**.
- **Locked out after failed logins:** wait 15 minutes, or delete the matching documents from `login_attempts`.

## Scripts

| | |
|---|---|
| `npm run dev` | dev server |
| `npm run build` | production build |
| `npm start` | serve the production build |
| `npm run lint` | ESLint |
| `npm run seed:demo` | load demo data and demo users (safe to re-run; see `docs/DEMO_SCRIPT.md`) |
| `npm run seed:demo -- --reset` | remove demo data |
