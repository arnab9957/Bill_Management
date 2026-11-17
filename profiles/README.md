# School profiles

A profile is a JSON file that holds everything specific to one school. Setting up a school means
creating one profile and running `setup.cmd` (or `pnpm new-school --profile <file>`). After setup,
everything can also be changed in the app under **Settings**, **Fee setup** and **Messages**.

| File | Purpose |
|---|---|
| `school-default.json` | Blank starting point. Copy it for a new school. |
| `dev-demo.json` | Development data used by `pnpm db:seed` (demo school with 15 classes). |
| `examples/parul-indobala.json` | A real school's profile, as a worked example. |
| `local/` | Put each real school's profile here. This folder is not committed to git. |

## Fields

| Field | Meaning |
|---|---|
| `profileName` | Name shown in the setup message. |
| `school.name` | School name. Printed in capitals on the banner of receipts and bills. |
| `school.headerSubtitle` | Line under the name, e.g. "(Managed by …)". |
| `school.udiseCode` | Printed as "U-Dise Code- …" (India). Leave empty if not used. |
| `school.registrationNote` | Registration lines; use `\n` for a new line. |
| `school.address` | Location line printed in bold under the registration lines. |
| `school.phone`, `school.email`, `school.upiId` | Contact details; UPI ID is used for the payment QR on bills. |
| `academicYear` | Current academic year: `name` (e.g. `2026-27`), `startDate` and `endDate` (YYYY-MM-DD). |
| `classes` | Classes in order, each with its `sections`. Names are printed exactly as written (e.g. `S-I`). |
| `feeHeads` | Fee heads. `type`: `recurring`, `one_time` or `optional`. `isRefundable` for deposits. |
| `feeHeads[].receiptOrder` | Fixed row number on receipts and bills (1 = top). Leave out to print only when an amount exists. |
| `feeHeads[].receiptLabel` | Wording on the receipt when different from the name. |
| `receipts.prefix` | Letter(s) before the number, e.g. `C` or `RCT`. |
| `receipts.numbering` | `continuous` (C/6434) or `per_year` (RCT/2026-27/000001, restarts each year). |
| `receipts.digits` | Digits in the number; 1 = no leading zeros, 6 = 000123. |
| `receipts.nextNumber` | First receipt number to issue. Use the number after the last receipt in the paper book. |
| `bills.prefix` | Prefix for bill numbers. |
| `lateFee` | Late-fee rule, or `null` for none. `kind`: `flat`, `per_day` or `percent`; amounts in rupees (percent: a percentage). `graceDays` before it starts; `maxCap` in rupees (0 = no cap). |
| `reminders` | `daysBefore` the due date, `overdueSteps` (days after the due date), and sending hours `quietStart`–`quietEnd`. |
| `features.concessions` | Show fee concessions (sibling, staff ward, merit…). |
| `features.counterClosing` | Show cash-counter closing (denomination count and day lock). |

Fee heads the software itself needs (Transport, Late fee, Miscellaneous, Opening balance and Cheque
bounce) are always created, even if the profile leaves them out.

## Checking a profile

Setup checks the profile and stops with a message for each problem, for example a duplicate fee-head
code, two heads on the same receipt row, an end date before the start date, or a bad time.
