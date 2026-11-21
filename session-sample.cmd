@echo off
rem ============================================================
rem  School Billing - SESSION SAMPLE (3 sessions, 15 students, 4 promotions)
rem  Own database (school_billing_ui_sample_test), opens on http://127.0.0.1:3002
rem  Your real school's data is never touched. Every run starts from scratch.
rem  A report of what happened to each student is saved to session-sample-report.txt
rem ============================================================
title School Billing - SESSION SAMPLE
cd /d "%~dp0"

where pnpm >nul 2>nul || (echo pnpm is not installed. & goto :fail)
node scripts\wait-port.mjs 5433 0 --check
if errorlevel 1 (
  echo Starting the database...
  start "School Billing - Database (keep open)" /min cmd /k "pnpm db:start"
  node scripts\wait-port.mjs 5433 120 || (echo The database did not start. & goto :fail)
)

set "DATABASE_URL=postgres://billing:billing@127.0.0.1:5433/school_billing_ui_sample_test"
set "STORAGE_DIR=./storage-sample"
set "SB_PORT=3002"

echo Building the session sample (about half a minute)...
node scripts\reset-test-db.mjs school_billing_ui_sample_test || goto :fail
call pnpm --filter @sb/db migrate || goto :fail
call pnpm --filter @sb/db seed -- --demo || goto :fail
call pnpm --filter @sb/core exec tsx scenarios/load-session-sample.ts || goto :fail

start "" notepad session-sample-report.txt
start "" /min cmd /c "node scripts\wait-port.mjs 3002 180 && start "" http://127.0.0.1:3002/promotion"
echo.
echo  SESSION SAMPLE website: http://127.0.0.1:3002   (close this window to stop)
echo.
call pnpm --filter @sb/web dev
exit /b 0

:fail
echo.
echo Something went wrong. See the message above.
pause
exit /b 1
