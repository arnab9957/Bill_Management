# School Billing Management System

Offline-first fee billing for a school, built from *School Billing Management System — Architecture & Implementation Plan*.
Everything (admissions, bills, fee collection, receipts, reports) works with the internet switched off.
SMS, WhatsApp and email reminders wait in a local outbox and are sent when a connection is available.

## Easiest way: double-click `start.cmd`

It does everything below automatically:
- installs packages and creates `.env` on the first run
- starts the database in its own minimised window
- applies database updates. On a brand-new, empty database it reminds you to run `setup.cmd` first (see below)
- starts the website and the reminder worker, then opens http://localhost:3000

Code changes appear on a normal browser refresh. To stop, close its window and the "Database" window.

For separate institutes, use `new-institute.cmd` once per institute and then `start-instance.cmd --instance <code>`. See *Setting up institutes* below.

## Quick start by hand (development, Windows)

```powershell
pnpm install
copy .env.example .env          # then set APP_SECRET to 32+ random characters
pnpm db:start                   # local PostgreSQL on port 5433 (keep this window open)
pnpm db:migrate
pnpm db:seed -- --demo          # admin user, classes, fee heads, templates (+ demo fee structure and 2 students)
pnpm dev                        # web on http://localhost:3000 and the worker
```

Sign in as **admin / admin12345**. You must change the password the first time.

**Speed:** `pnpm dev` compiles each page the first time you open it (about 1 s per page), and it's quick after that.
For daily use, or to judge speed, run the production server, where every page loads in under 0.1 s:

```powershell
pnpm --filter @sb/web build
pnpm --filter @sb/web start      # http://localhost:3000
```

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
scripts/            instance.mjs/new-institute.mjs plus NSSM, backup, restore and update scripts
instances/<code>/   one private installation per institute: .env, profile, storage, backups and logs
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
| Academic-year separation: a year switcher in the sidebar; one record per student per year (class, section, roll); admission into a chosen year; promotion from the profile or for a whole class, carrying dues forward; bill run, Students and Bills scoped to the selected year; profile shows the year-by-year history and fee records per year | Done |
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
| Student photos (profile banner and Collect fee screen; camera on phones; JPG, PNG or WebP up to 3 MB) | Done. Photos are files in `storage/photos/` and are **not** in the database backup, so copy that folder to the USB drive with the backups |
| Print buttons on every bill, plus **Print all shown** on the Bills page (one A5 page per bill, using the current filters) | Done |
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
2. Build: `pnpm build`. This builds the web app (`apps/web/.next`) and bundles the worker into `apps/worker/dist`. The web app runs with `next start`. Next's "standalone" output is off by default because on Windows it needs symlink rights (Developer Mode); set `NEXT_STANDALONE=1` to build it anyway.
3. Run migrations with `node apps/worker/dist/migrate.js` (set `MIGRATIONS_DIR=packages/db/migrations`). Then set up the school once with `pnpm new-school --profile profiles/local/<school>.json` (or `setup.cmd`), which also loads the profile and prints the first admin password. Do not run `pnpm db:seed` on a school database: it loads the development demo data.
4. Run `scripts/install-services.ps1 -AppDir <folder> -Nssm <nssm.exe> -Instance <code>` as Administrator. It installs uniquely named services for that institute and binds to `127.0.0.1`. Add `-AllowLan` only if counter PCs must connect over the school LAN; never expose the port to the internet.
5. Under *Settings*, set:
   - the school details and UPI ID
   - a backup folder on a second disk
   - the providers (SMTP, WhatsApp, SMS)
   - one user per staff member

## Setting up institutes

One code base serves every school or college. Each institute gets a separate database, secret, storage folder, web port and browser cookies. This is database-level isolation: do not add a school ID to the shared tables.

```text
instances/<code>/
  institute.json        non-secret instance settings (name, DB, port, service names)
  .env                  DATABASE_URL, APP_SECRET and STORAGE_DIR for this institute only
  profile.json          the profile used at first setup
  storage/              branding, photos, backups and logs
```

1. Copy `profiles/school-default.json` to `profiles/local/<school>.json` and fill it in (see `profiles/README.md`).
2. Double-click **`new-institute.cmd`** and enter the code (for example `st-marys`), display name and profile file. It creates the folder above, a database named `sb_<code>`, a random `APP_SECRET`, and prints the one-time admin password.
3. Double-click **`start-instance.cmd --instance <code>`**. Sign in as `admin` with that password and choose a new one.
4. Follow `docs/new-school-checklist.md` for the rest: fee amounts, users, students, messages, backups and printing.
5. Repeat steps 1-3 for each institute. If they are on separate PCs, copy the whole program folder and run only that institute's setup on each PC.

| Command | What it does |
|---|---|
| `new-institute.cmd` | Creates one institute's config, database and admin. Run once per institute. |
| `start-instance.cmd --instance <code>` | Starts that institute's database, web app and worker on its own port. |
| `pnpm instance:list` | Lists installed institute codes. |
| `powershell scripts\doctor-instance.ps1 -Instance <code>` | Checks config, folders and database connection. |
| `powershell scripts\backup-instance.ps1 -Instance <code>` | Backs up that database, logo and photos. |
| `powershell scripts\restore-instance.ps1 -Instance <code> -File <dump>` | Restores that database after confirmation. |
| `powershell scripts\update-instance.ps1 -Instance <code>` | Backs up, migrates and rebuilds that institute. |
| `setup.cmd` / `start.cmd` | Legacy single-installation path for development/demo only. |
| `pnpm db:seed -- --demo` | Development only: demo school, students and fee structures. |

Notes:
- `APP_SECRET` is unique per institute. Back it up with the database or saved provider passwords cannot be decrypted after a restore.
- Browser cookies are named per institute, so signing in to one institute does not affect another on `127.0.0.1`.
- Changing an institute's details later is done in the app, not by running setup again.
- Parts that are specific to India stay as defaults: the U-DISE line, the ₹ sign and Indian number grouping, Indian mobile numbers and DLT SMS templates.
- For a college, enter each course and year as a class (for example `BCA-1`) and its branches or groups as sections.
