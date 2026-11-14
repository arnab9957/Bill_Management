# Restore a backup over the current database. STOP THE SERVICES FIRST.
#   .\scripts\restore.ps1 -File "E:\SchoolBackups\school_billing_2026-11-13_2300_nightly.dump"
# Monthly restore drill: run this on a spare PC with a fresh PostgreSQL and check the dashboard totals.
param(
  [Parameter(Mandatory)] [string]$File,
  [string]$PgBin = "C:\Program Files\PostgreSQL\16\bin",
  [string]$Db = "school_billing", [string]$User = "billing", [string]$PgHost = "127.0.0.1", [int]$Port = 5432
)
$ErrorActionPreference = "Stop"
if (-not (Test-Path $File)) { throw "Backup file not found: $File" }
$answer = Read-Host "This REPLACES all data in '$Db' with $File. Type RESTORE to continue"
if ($answer -ne "RESTORE") { Write-Host "Cancelled."; exit 1 }
& "$PgBin\pg_restore.exe" -h $PgHost -p $Port -U $User --clean --if-exists --no-owner -d $Db $File
if ($LASTEXITCODE -ne 0) { throw "pg_restore reported errors" }
Write-Host "Restore complete. Start the services again."
