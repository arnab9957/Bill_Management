@echo off
rem ============================================================
rem  School Billing - TEST SCHOOL with 50 practice students
rem  Uses its own database (school_billing_testschool) and opens on
rem  http://127.0.0.1:3001 . Your real school's data is never touched.
rem  Every run starts the test school again from scratch.
rem ============================================================
title School Billing - TEST SCHOOL
cd /d "%~dp0"

where pnpm >nul 2>nul || (echo pnpm is not installed. & goto :fail)
node scripts\wait-port.mjs 5433 0 --check
if errorlevel 1 (
  echo Starting the database...
  start "School Billing - Database (keep open)" /min cmd /k "pnpm db:start"
  node scripts\wait-port.mjs 5433 120 || (echo The database did not start. & goto :fail)
)

set "DATABASE_URL=postgres://billing:billing@127.0.0.1:5433/school_billing_testschool"
set "STORAGE_DIR=./storage-testschool"
set "SB_PORT=3001"

echo How many EXTRA generated students? Press Enter for none, or type e.g. 1000 (takes a few minutes).
set "EXTRA=0"
set /p EXTRA=Extra students:
echo Building the test school...
node scripts\reset-test-db.mjs school_billing_testschool || goto :fail
call pnpm --filter @sb/db migrate || goto :fail
call pnpm --filter @sb/db seed -- --demo || goto :fail
call pnpm --filter @sb/core exec tsx scenarios/load.ts %EXTRA% || goto :fail

echo.
echo Also play the YEAR-END PROMOTION (daily job on 2 April 2027, then failed / left corrections)?
set "ROUND=n"
set /p ROUND=Type y for yes, Enter for no:
if /i "%ROUND%"=="y" (
  call pnpm --filter @sb/core exec tsx scenarios/load-promotion-round.ts || goto :fail
  start "" notepad promotion-round-report.txt
)

start "" /min cmd /c "node scripts\wait-port.mjs 3001 180 && start "" http://127.0.0.1:3001"
echo.
echo  TEST SCHOOL website: http://127.0.0.1:3001   (close this window to stop)
echo.
call pnpm --filter @sb/web dev
exit /b 0

:fail
echo.
echo Something went wrong. See the message above.
pause
exit /b 1
