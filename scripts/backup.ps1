# Manual backup (also copy to USB): .\scripts\backup.ps1 -Out "E:\SchoolBackups"
# The worker already takes nightly backups; use this before updates or to copy to a USB drive.
param(
  [string]$Out = ".\storage\backups",
  [string]$PgBin = "C:\Program Files\PostgreSQL\16\bin",
  [string]$Db = "school_billing", [string]$User = "billing", [string]$PgHost = "127.0.0.1", [int]$Port = 5432,
  [string]$Prefix = "school_billing"
)
$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force $Out | Out-Null
$file = Join-Path $Out ("{0}_{1}_manual.dump" -f $Prefix, (Get-Date -Format "yyyy-MM-dd_HHmm"))
& "$PgBin\pg_dump.exe" -h $PgHost -p $Port -U $User -Fc -f $file $Db
if ($LASTEXITCODE -ne 0) { throw "pg_dump failed" }
Write-Host "Backup written to $file ($([math]::Round((Get-Item $file).Length / 1MB, 1)) MB)"
