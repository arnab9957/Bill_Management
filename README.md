# School Billing Management System

Offline-first fee billing for a school, built from *School Billing Management System — Architecture & Implementation Plan*.
Everything (admissions, bills, fee collection, receipts, reports) works with the internet switched off.
SMS, WhatsApp and email reminders wait in a local outbox and are sent when a connection is available.

## Quick start (development, Windows)

```powershell
pnpm install
copy .env.example .env          # then set APP_SECRET to 32+ random characters
pnpm db:start                   # local PostgreSQL on port 5433 (keep this window open)
pnpm db:migrate
pnpm db:seed -- --demo          # admin user, classes, fee heads, templates (+ demo fee structure and 2 students)
pnpm dev                        # web on http://localhost:3000 and the worker
```

Sign in as **admin / admin12345**. You must change the password the first time.

`pnpm db:start` runs a real PostgreSQL via `embedded-postgres`, so you don't have to install it. Data is kept in `.pgdata/`.
It doesn't include `pg_dump`. For backups, point `PG_DUMP_PATH` in `.env` at a full PostgreSQL install, for example
`C:\Program Files\PostgreSQL\16\bin\pg_dump.exe`.

| Command | What it does |
|---|---|
| `pnpm check` | Typecheck everything and run the unit tests |
| `RUN_DB_TESTS=1 pnpm test` | Also run the integration tests against a throwaway `school_billing_test` database (needs `pnpm db:start`) |
| `pnpm --filter @sb/worker run-job billRun 2026-07` | Run any job right away: `billRun`, `lateFee`, `dueScan`, `dispatchOutbox`, `backup`, `integrityCheck` |
| `pnpm db:generate` | Create a migration after changing `packages/db/src/schema.ts` |

## Layout

```
apps/web            Next.js 15 (App Router). Screens, Server Actions, print views and export routes
apps/worker         pg-boss cron jobs: bill run, late fees, reminders, outbox dispatcher, backups, integrity check
packages/db         Drizzle schema (single source of types), migrations and seed
packages/core       All business logic as pure TypeScript with no React or Next. Web, worker and tests share it
packages/validation Zod schemas shared by the browser, Server Actions, Excel import and jobs
packages/notifications  Channel adapters: SMTP, WhatsApp Cloud API, SMS over HTTP (DLT), SMS through an Android gateway on the LAN (offline), and console
scripts/            install-services.ps1 (NSSM + LAN firewall), backup.ps1, restore.ps1, update.ps1
```

### Golden rules and where they are enforced

- **Money is integer paise.** Columns are `bigint`. The validation layer converts rupee strings to paise without using floats. `formatINR` is only for display.
- **Financial records are never deleted.** Invoices are cancelled through credit notes, and receipts through reversal of their allocations. Both are kept and marked.
- **No double collection.** `collectPayment` locks the student row with `SELECT … FOR UPDATE` inside a single transaction. The concurrency test fires two collections at once.
- **Idempotent jobs.** These unique indexes prevent duplicates:
  - `(student, year, period)` on invoices
  - `(invoice, late_fee_step)` on late-fee lines
  - `idempotency_key` on the outbox
- **Gap-free numbering.** `INV/2026-27/000123` and `RCT/…` come from a locked counter row. The counter rolls back together with its transaction.
- **The core never calls the internet.** Only the worker's dispatcher uses the adapters.
- **Every Server Action and route checks the role on the server** with `requireRole()`. Middleware only redirects users who have no session cookie.
- **Audit log.** Every create, update or cancel is written to `audit_log` with the user, the IP address, and the old and new values.

## Feature status against the plan

| Area | Status |
|---|---|
| Login, Argon2, roles (Admin/Accountant/Cashier/Principal), lockout after 5 failures, idle timeout, forced password change | Done |
| Academic years, classes, sections, transport routes, students, guardians, siblings | Done |
| Excel import with template, row-level validation, preview, all-or-nothing import, opening balances | Done |
| Fee heads; structures per class and year with frequency, due day and months; copy from another year with a % hike | Done |
| Concessions (percent or flat, per head) with approval; late-fee rules (flat, per day, percent, with a cap) | Done |
| Bill run with dry-run preview, mid-year admissions, students who left, wallet auto-apply; monthly cron job | Done |
| Misc charges, credit notes, invoice cancellation, opening balances | Done |
| Counter screen: keyboard-driven, oldest dues first or head-wise override, excess goes to the wallet | Done |
| Receipts in A5 and 80 mm thermal, amount in words, verification QR, DUPLICATE and CANCELLED watermarks | Done |
| Receipt cancellation, cheque register with bounce (reversal, charge, notification), refunds | Done |
| Day book and per-cashier day closing with denominations, which locks the day | Done |
| Outbox with idempotency keys, sibling-combined reminders, quiet hours, backoff (2 m, 10 m, 1 h, 6 h, 24 h), expiry, cancelling reminders for bills already paid, retry and cancel from the UI | Done |
| Template editor with live preview; adding a Hindi copy | Done (the Hindi text still has to be translated) |
| Dashboard, defaulters with "send reminder now", collections by mode, cashier, class, head and date, outstanding, concessions, late fees, cancelled receipts | Done |
| Excel export; Tally receipt vouchers as CSV | Done |
| UPI QR with the amount filled in on bills; no-dues certificate; student statement | Done |
| Nightly `pg_dump` with 30 daily + 12 monthly retention, USB reminder, restore screen, integrity check, health page | Done |
| Year-end promotion wizard with an automatic backup first and dues carried forward | Done |
| NSSM services, LAN-only firewall rule, backup, restore and update scripts | Done |

### Not built yet, or done differently from the plan

- **Bills and receipts are printable HTML pages** using print CSS. You can print them or save them as PDF from the browser. They are not generated with `@react-pdf/renderer`, so WhatsApp and email messages don't attach a PDF yet. The adapters already accept `attachmentPath`; what's missing is the PDF rendering step.
- **Auth uses a small built-in session layer**, not Auth.js or Better Auth. Sessions are stored in the database and hashed, passwords use Argon2, and the cookie is httpOnly and SameSite=Strict.
- **The UI is built from plain Tailwind components**, not shadcn/ui.
- **Offline SMS goes through an Android SMS-gateway app on the LAN.** The USB GSM modem route (`serialport` AT commands) is not built.
- **Not built yet:**
  - Inno Setup installer
  - Playwright end-to-end tests and the 3,000-student load test
  - ESLint, Prettier and Husky hooks
  - Student photo upload
  - Installment plans
  - Encrypted cloud backup copy
  - Multi-branch support and a parent portal
- **Before go-live**, start the WhatsApp Business verification and SMS DLT registration early. Then enter the approved template IDs under *Messages → Templates*.

## Production on the school server

1. Install PostgreSQL 16 or later as a Windows service and create the database and user. Set `DATABASE_URL`, `APP_SECRET` and `PG_DUMP_PATH` in `.env`.
2. Build: `pnpm build`. This produces `apps/web/.next/standalone` and the bundled worker in `apps/worker/dist`.
3. Run migrations with `node apps/worker/dist/migrate.js` (set `MIGRATIONS_DIR=packages/db/migrations`). Then run `pnpm db:seed` once.
4. Run `scripts/install-services.ps1` as Administrator. It installs both services with auto-start and restart, and allows the port from the LAN subnet only. Never expose the port to the internet.
5. Under *Settings*, set:
   - the school profile and UPI ID
   - a backup folder on a second disk
   - the providers (SMTP, WhatsApp, SMS)
   - one user per staff member
