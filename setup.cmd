@echo off
rem ============================================================
rem  School Billing - set up a NEW school (run once for each school)
rem  1. installs packages (first time only)     2. creates .env
rem  3. starts the built-in database if needed   4. creates the tables
rem  5. loads the school's profile               6. shows the first admin password
rem  It refuses to run on a database that already holds school data.
rem ============================================================
title School Billing - Set up a new school
cd /d "%~dp0"
set "SB_INSTANCE=default"

where node >nul 2>nul || (echo Node.js is not installed. Install Node.js 22 or newer from nodejs.org & goto :fail)
where pnpm >nul 2>nul || (echo pnpm is not installed. Run:  npm install -g pnpm & goto :fail)
if not exist node_modules (
  echo Installing packages, first time only...
  call pnpm install || goto :fail
)
node scripts\ensure-env.mjs || goto :fail

rem --- built-in database: start it in its own window if it is not running
rem     (if you use your own PostgreSQL, set DATABASE_URL in .env instead)
node scripts\wait-port.mjs 5433 0 --check
if errorlevel 1 (
  echo Starting the built-in database...
  start "School Billing - Database (keep open)" /min cmd /k "pnpm db:start"
  node scripts\wait-port.mjs 5433 120 || (echo The database did not start. Check the Database window. & goto :fail)
)

echo.
echo Profiles ready to use:
dir /b profiles\*.json profiles\local\*.json profiles\examples\*.json 2>nul
echo.
echo Type the profile file name, for example  parul-indobala.json  or  school-default.json
echo (Profiles in profiles\local\ are your own; profiles\examples\ holds worked examples.)
set /p PROFILE=Profile file name:
if "%PROFILE%"=="" goto :fail
set PFILE=
if exist "profiles\%PROFILE%" set PFILE=profiles\%PROFILE%
if exist "profiles\local\%PROFILE%" set PFILE=profiles\local\%PROFILE%
if exist "profiles\examples\%PROFILE%" set PFILE=profiles\examples\%PROFILE%
if "%PFILE%"=="" (echo Profile "%PROFILE%" was not found. & goto :fail)

echo.
call pnpm new-school --profile "%PFILE%" || goto :fail

echo.
echo Setup finished. Write down the admin password shown above.
echo Next: double-click start.cmd to run the program.
pause
exit /b 0

:fail
echo.
echo Setup did not finish. Read the message above, fix it and run setup.cmd again.
pause
exit /b 1
