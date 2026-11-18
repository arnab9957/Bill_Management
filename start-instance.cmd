@echo off
setlocal
title School Billing - Institute
cd /d "%~dp0"

where node >nul 2>nul || (echo Node.js is not installed. Install Node.js 22 or newer from nodejs.org & goto :fail)
where pnpm >nul 2>nul || (echo pnpm is not installed. Run:  npm install -g pnpm & goto :fail)
if not exist node_modules (
  echo Installing packages, first run only...
  call pnpm install || goto :fail
)

set "CODE=%~1"
if /i "%~1"=="--instance" set "CODE=%~2"
if "%CODE%"=="" (
  echo Available institutes:
  node scripts\instance.mjs list
  set /p CODE=Institute code:
)
node scripts\instance.mjs validate "%CODE%" || goto :fail

for /f "delims=" %%P in ('node scripts\instance.mjs get "%CODE%" dbPort') do set "DBPORT=%%P"
for /f "delims=" %%P in ('node scripts\instance.mjs get "%CODE%" webPort') do set "WEBPORT=%%P"
for /f "delims=" %%P in ('node scripts\instance.mjs get "%CODE%" bind') do set "BIND=%%P"
node scripts\wait-port.mjs %DBPORT% 0 --check
if errorlevel 1 (
  echo Starting the local database...
  set "SB_DB_PORT=%DBPORT%"
  start "School Billing - Database (keep open)" /min cmd /k "pnpm db:start"
  node scripts\wait-port.mjs %DBPORT% 120 || (echo The database did not start. & goto :fail)
)

set "SB_INSTANCE=%CODE%"
set "SB_HOST=%BIND%"
set "SB_PORT=%WEBPORT%"
set "SB_DB_PORT=%DBPORT%"
call pnpm db:migrate || goto :fail

echo.
echo  Institute: %CODE%
echo  Website:   http://%BIND%:%WEBPORT%
echo  Keep this window and the Database window open. Close them to stop.
echo.
start "" /min cmd /c "node scripts\wait-port.mjs %WEBPORT% 180 && start "" http://%BIND%:%WEBPORT%"
call pnpm dev
endlocal
exit /b 0

:fail
echo.
echo Could not start institute '%CODE%'. Read the message above.
endlocal
pause
exit /b 1
