@echo off
rem ============================================================
rem  School Billing - start everything (double-click this file)
rem  Database + website + reminder worker, then opens the browser.
rem  Close this window (or press Ctrl+C) to stop the website and worker.
rem ============================================================
title School Billing
cd /d "%~dp0"
set "SB_INSTANCE=default"
set "SB_HOST=127.0.0.1"
set "SB_PORT=3000"

where node >nul 2>nul || (echo Node.js is not installed. Install Node.js 22 or newer from nodejs.org & goto :fail)
where pnpm >nul 2>nul || (echo pnpm is not installed. Run:  npm install -g pnpm & goto :fail)

rem --- 1. First run: install packages and create settings file
if not exist node_modules (
  echo Installing packages, first run only...
  call pnpm install || goto :fail
)
node scripts\ensure-env.mjs || goto :fail

rem --- 2. Website already running? Just open it.
node scripts\wait-port.mjs 3000 0 --check
if not errorlevel 1 (
  echo The website is already running.
  echo  Website:  http://127.0.0.1:3000
  echo  Drizzle:  https://local.drizzle.studio
  start "" http://127.0.0.1:3000
  timeout /t 3 >nul
  exit /b 0
)

rem --- 3. Database: start it in its own minimised window if it isn't running
set FRESH=0
if not exist .pgdata set FRESH=1
node scripts\wait-port.mjs 5433 0 --check
if errorlevel 1 (
  echo Starting the database...
  start "School Billing - Database (keep open)" /min cmd /k "pnpm db:start"
)
echo Waiting for the database...
node scripts\wait-port.mjs 5433 120 || (echo The database did not start. Check the "Database" window. & goto :fail)

rem --- 4. Apply database updates (retries while a brand-new database is being created)
set TRIES=0
:migrate
call pnpm db:migrate >nul 2>&1 && goto :migrated
set /a TRIES+=1
if %TRIES% geq 15 (echo Database update failed: & call pnpm db:migrate & goto :fail)
timeout /t 2 /nobreak >nul
goto :migrate
:migrated
echo Database is up to date.

if "%FRESH%"=="1" (
  echo.
  echo If this is a brand-new computer or database, run setup.cmd first, once.
  echo For the development demo school instead, run:  pnpm db:seed -- --demo
  echo.
)

rem --- 4b. Database dashboard (Drizzle Studio) in its own minimised window
node scripts\wait-port.mjs 4983 0 --check
if errorlevel 1 (
  echo Starting the database dashboard...
  start "School Billing - DB dashboard" /min cmd /k "pnpm db:studio"
  start "" /min cmd /c "node scripts\wait-port.mjs 4983 60 && start "" https://local.drizzle.studio"
)

rem --- 5. Open the browser as soon as the website answers (in the background)
start "" /min cmd /c "node scripts\wait-port.mjs 3000 180 && start "" http://127.0.0.1:3000"

rem --- 6. Website + reminder worker (this window). Code changes appear on browser refresh.
echo.
echo  Starting the website and reminder worker...
echo  Website:  http://127.0.0.1:3000
echo  Drizzle:  https://local.drizzle.studio
echo  Keep this window and the Database window open. Close them to stop.
echo.
call pnpm dev
exit /b 0

:fail
echo.
echo Something went wrong. See the message above.
pause
exit /b 1
