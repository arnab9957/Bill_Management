@echo off
title School Billing - New institute
cd /d "%~dp0"

where node >nul 2>nul || (echo Node.js is not installed. Install Node.js 22 or newer from nodejs.org & goto :fail)
where pnpm >nul 2>nul || (echo pnpm is not installed. Run:  npm install -g pnpm & goto :fail)
if not exist node_modules (
  echo Installing packages, first run only...
  call pnpm install || goto :fail
)
node scripts\ensure-env.mjs || goto :fail

set "CODE="
set "NAME="
set "PROFILE="
:parse
if "%~1"=="" goto :parsed
if /i "%~1"=="--code" (
  set "CODE=%~2"
  shift
  shift
  goto :parse
)
if /i "%~1"=="--name" (
  set "NAME=%~2"
  shift
  shift
  goto :parse
)
if /i "%~1"=="--profile" (
  set "PROFILE=%~2"
  shift
  shift
  goto :parse
)
echo Unknown option: %~1
goto :fail
:parsed

if "%CODE%"=="" set /p CODE=Institute code (lowercase slug, e.g. st-marys):
if "%NAME%"=="" set /p NAME=Institute display name:
if "%PROFILE%"=="" set /p PROFILE=Profile file name (e.g. school-default.json):
if "%CODE%"=="" goto :fail
if "%NAME%"=="" goto :fail
if "%PROFILE%"=="" goto :fail

for /f "delims=" %%P in ('node scripts\instance.mjs get default dbPort') do set "DBPORT=%%P"
if errorlevel 1 goto :fail
node scripts\wait-port.mjs %DBPORT% 0 --check
if errorlevel 1 (
  echo Starting the local database...
  set "SB_DB_PORT=%DBPORT%"
  start "School Billing - Database (keep open)" /min cmd /k "pnpm db:start"
  node scripts\wait-port.mjs %DBPORT% 120 || (echo The database did not start. & goto :fail)
)

node scripts\new-institute.mjs --code "%CODE%" --name "%NAME%" --profile "%PROFILE%"
if errorlevel 1 goto :fail
exit /b 0

:fail
echo.
echo Institute setup did not finish. Read the message above, fix it and run again.
pause
exit /b 1
