# Setting up a new school

The same program runs every school. The details of each school live in its profile file and, after setup, in the app Settings.
Plan the visit with the school: setup, a printing test and training.

## Before you go

1. Copy profiles/school-default.json to profiles/local/<school>.json and fill it in. The fields are listed in profiles/README.md. Get these from the school:
   - the school name as printed on its receipts, and the line under it (for example "Managed by ...")
   - the U-DISE code and the registration lines printed on its paper receipts (India; leave blank if not used), the address, phone and UPI ID
   - the academic year with its start and end dates
   - the classes exactly as the school writes them (for example S-I or Class 5) and their sections
   - the fee heads, which of them are fixed rows on the receipt and in what order, and any wording that differs from the name
   - the receipt prefix, the numbering style and the **next receipt number**: the number after the last receipt in the paper book
   - the late-fee rule, or none
   - reminder days and quiet hours
   - whether the school wants concessions or cash-counter closing (both are off unless the profile turns them on)

## On the school computer

2. Install Node.js 22 or newer, then pnpm (npm install -g pnpm). Copy the program folder onto the computer.
   If the school uses its own PostgreSQL instead of the built-in database, copy .env.example to .env and set DATABASE_URL before step 3.
3. Double-click **setup.cmd** and type the profile file name (for example school-name.json). Setup checks the whole profile first and lists every problem; if there are problems, nothing is written. It refuses to run on a database that already has school data. At the end it shows the first admin password **once**. Write it down.
4. Double-click **start.cmd**. Sign in as admin with that password and choose a new one.
5. In **Settings**, check:
   - the school details and receipt numbers, including the next receipt number
   - the **logo** (optional; PNG, JPG or WebP, wide and short; it appears on receipts and bills)
   - the **Backup folder** (a second disk is best)
6. **Settings > Users**: one account per person (Admin, Accountant, Cashier or Principal). Nobody shares a login.
7. **Fee setup**: choose the academic year, enter the fee amounts for each class, and check the late-fee rule.
8. **Students > Import Excel**: download the template, fill it in, preview it, then import. The template has an **Opening Balance** column for old dues, which become opening bills. Students can also be added one at a time with **New admission**. Check guardian mobile numbers (10-digit Indian numbers).
9. **Settings > SMS / WhatsApp / Email**: keep each channel on **Console (test)** until its approval arrives. Messages are then written to storage/outbox-console.log and not sent. For email, enter the SMTP details and press **Send test email**. For Gmail, use a 16-character App password, not the normal password.
10. **Printing**: print one receipt and one bill on the school printer. Use A5 paper, the smallest margins, scale 100 percent, and turn on *Background graphics* so the banner and logo print.
11. **Training**: cashier (about 1 hour), accountant (half a day), principal (a view-only walk-through).
12. **Go live** at the start of a billing month. If the school used another system, run both for one month and compare the totals each day.

## After go-live

- **Settings > Backups & health**: check it weekly. When it says the weekly USB backup is overdue, copy the newest backup to a USB drive kept away from the server, then press **I have done it today**.
- Copy the storage/photos and storage/branding folders with the backups. Student photos and the logo are files, not database rows.
- If the program should start by itself when the computer boots, ask for the service setup described in the README (*Production on the school server*).
- Updates are done with the update script in the scripts folder (update.ps1), which takes a backup first.
