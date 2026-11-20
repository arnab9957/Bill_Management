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
3. Double-click **new-institute.cmd** and enter a short lowercase code (for example `st-marys`), the display name and the profile file name. It creates `instances/<code>/` with its own `.env`, profile copy, storage folders and database (`sb_<code>`). Setup checks the whole profile first and lists every problem; at the end it shows the first admin password **once**. Write it down.
4. Double-click **start-instance.cmd --instance <code>**. Sign in as admin with that password and choose a new one.
5. In **Settings**, check:
   - the school details and receipt numbers, including the next receipt number
   - the **logo** (optional; PNG, JPG or WebP, wide and short; it appears on receipts and bills)
   - the **Backup folder** (a second disk is best)
6. **Settings > Users**: one account per person (Admin, Accountant, Cashier or Principal). Nobody shares a login.
7. **Fee setup**: choose the academic year, enter the fee amounts for each class, and check the late-fee rule.
8. **Students > Import Excel**: download the template, fill it in, preview it, then import. The template has an **Opening Balance** column for old dues, which become opening bills. Students can also be added one at a time with **New admission**. Check guardian mobile numbers (10-digit Indian numbers).
9. **Settings > Message providers**: each section saves on its own. Choose **Device WhatsApp (wa.me)** to open reminders in the WhatsApp account logged in on the school computer (the parent sees a ready message to review and send); no Meta approval is needed. Keep SMS on **Console (test)** until approval arrives; console messages are written to storage/outbox-console.log and not sent. For email, choose **Off** until a provider is ready, then choose **Brevo API** (API key and a verified sender email) or **SMTP** (host, user and app password) and save the email section. For Gmail, use a 16-character App password, not the normal password.
10. **Printing**: print one receipt and one bill on the school printer. Use A5 paper, the smallest margins, scale 100 percent, and turn on *Background graphics* so the banner and logo print.
11. **Training**: cashier (about 1 hour), accountant (half a day), principal (a view-only walk-through).
12. **Go live** at the start of a billing month. If the school used another system, run both for one month and compare the totals each day.

## After go-live

- **Settings > Backups & health**: check it weekly. When it says the weekly USB backup is overdue, copy the newest backup to a USB drive kept away from the server, then press **I have done it today**.
- Use `scripts\backup-instance.ps1 -Instance <code>`; it copies the database, `storage/photos` and `storage/branding` together. Keep the institute's `.env` with the backup because it contains the `APP_SECRET` used for saved provider passwords.
- If the program should start by itself when the computer boots, ask for the service setup described in the README (*Production on the school server*).
- Updates are done with `scripts\update-instance.ps1 -Instance <code>`, which takes a backup first.
