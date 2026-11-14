# Update procedure: backup -> stop services -> replace build -> run migrations -> start services.
#   .\scripts\update.ps1 -AppDir "C:\SchoolBilling" -NewBuild "D:\release-1.1" -Nssm "C:\SchoolBilling\tools\nssm.exe"
param(
  [Parameter(Mandatory)] [string]$AppDir,
  [Parameter(Mandatory)] [string]$NewBuild,
  [Parameter(Mandatory)] [string]$Nssm,
  [string]$PgBin = "C:\Program Files\PostgreSQL\16\bin"
)
$ErrorActionPreference = "Stop"
& "$PSScriptRoot\backup.ps1" -Out (Join-Path $AppDir "storage\backups") -PgBin $PgBin
& $Nssm stop SchoolBillingWorker
& $Nssm stop SchoolBillingWeb
foreach ($part in "web", "worker", "migrations") {
  if (Test-Path (Join-Path $NewBuild $part)) {
    Remove-Item -Recurse -Force (Join-Path $AppDir $part) -ErrorAction SilentlyContinue
    Copy-Item -Recurse (Join-Path $NewBuild $part) (Join-Path $AppDir $part)
  }
}
Push-Location (Join-Path $AppDir "worker")
& (Join-Path $AppDir "node\node.exe") "dist\migrate.js"
if ($LASTEXITCODE -ne 0) { Pop-Location; throw "Migration failed - services left stopped. Restore the backup if needed." }
Pop-Location
& $Nssm start SchoolBillingWeb
& $Nssm start SchoolBillingWorker
Write-Host "Update complete."
