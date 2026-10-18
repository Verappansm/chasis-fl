# Chasis ERP

Finance & Insurance (F&I) desk ERP for a car dealership. Every record is keyed by
**chassis number** and tracks:

- **Finance**: loan cases, finance-provider payout (incentive) and vehicle purchase/selling price
- **Insurance**: policies sold and insurer commission (incentive)
- **Renewal**: insurance renewal follow-ups, plus an automatic list of policies about to expire
- **Incentive**: incentives paid out to sales executives, brokers, DSAs and others
- **Overview**: received vs pending incentives with ageing, payouts, net incentive, margin and renewals due

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

The first request creates the database indexes. If the `users` collection is
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

- **Roles:** *Admin* has full access plus user management. *User* gets only the permissions ticked on their account.
- **Permissions:** View / Create & edit / Delete per module (Finance, Insurance, Renewal, Incentive), plus the Overview dashboard. Edit and Delete include View. Quick-fill presets: Read only, Data entry, All data access.
- **Changes take effect on the user's next click**, with no need to sign out. Deactivating a user or resetting their password signs them out everywhere.
- **Lock-out protection:** admins cannot demote or deactivate themselves, and the last active admin cannot be removed.
- Users are **deactivated, not deleted**, so the audit trail stays intact.
- Everyone can change their own password under **My account** (click your name in the sidebar).

Every rule is enforced on the server for each page and each save, so hiding a button is never the only protection.

## Guided tour

New users get a step-by-step tour on their first sign-in. It spotlights each part of the app, asks them to click each tab, and explains what they're looking at. It only shows sections the person has access to. Finishing or skipping is remembered per user, across devices; **Take the tour** in the sidebar replays it. Steps live in `src/lib/tour-steps.ts`.

To show the tour to someone again, unset `tourCompletedAt` on their `users` document.

## Performance notes

- `vercel.json` pins server functions to **Mumbai (`bom1`)**, next to the Atlas cluster (AWS ap-south-1). If the database ever moves region, change this too; every query crosses the gap.
- Indexes are created once and recorded in `_meta`. Bump `SCHEMA_VERSION` in `src/lib/db/collections.ts` when you change `ensureIndexes()`.

## Operations

- **Revoke all sessions for a user:** reset their password, deactivate them, or increment `tokenVersion` on their `users` document.
- **Audit trail:** the `audit_logs` collection records every create, update, delete and login, with before/after snapshots.
- **Locked out after failed logins:** wait 15 minutes, or delete the matching documents from `login_attempts`.

## Scripts

| | |
|---|---|
| `npm run dev` | dev server |
| `npm run build` | production build |
| `npm start` | serve the production build |
| `npm run lint` | ESLint |
| `npm run seed:demo` | load demo data (safe to re-run; see `docs/DEMO_SCRIPT.md`) |
| `npm run seed:demo -- --reset` | remove demo data |
