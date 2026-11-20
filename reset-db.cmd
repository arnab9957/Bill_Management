@echo off
rem ============================================================
rem  School Billing - Reset Database
rem  Permanently erases and recreates the school database
rem  so you can run setup.cmd fresh.
rem ============================================================
title School Billing - Reset Database
cd /d "%~dp0"

where node >nul 2>nul || (echo Node.js is not installed. Install Node.js 22 or newer from nodejs.org & goto :fail)

echo ============================================================
echo  School Billing - Reset Database
echo.
echo  WARNING: This will permanently ERASE all data in the
echo  database (students, bills, receipts, users, and settings).
echo ============================================================
echo.
set /p CONFIRM="Are you sure you want to erase the database? (Y/N): "
if /i not "%CONFIRM:~0,1%"=="Y" (
  echo.
  echo Reset cancelled. No data was changed.
  pause
  exit /b 0
)

rem --- built-in database: start it in its own window if it is not running
node scripts\wait-port.mjs 5433 0 --check
if errorlevel 1 (
  echo Starting the built-in database...
  start "School Billing - Database (keep open)" /min cmd /k "pnpm db:start"
  node scripts\wait-port.mjs 5433 120 || (echo The database did not start. Check the Database window. & goto :fail)
)

echo.
echo Resetting database...
node scripts\reset-db.mjs || goto :fail

echo.
echo ============================================================
echo  Database reset complete!
echo  You can now run setup.cmd to set up a fresh school.
echo ============================================================
echo.
pause
exit /b 0

:fail
echo.
echo Database reset failed. Check the error message above.
pause
exit /b 1
