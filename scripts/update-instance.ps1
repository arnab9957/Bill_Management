param(
  [Parameter(Mandatory)] [string]$Instance,
  [string]$Nssm,
  [string]$PgBin
)
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$helper = Join-Path $PSScriptRoot "instance.mjs"

function Get-InstanceValue([string]$Key) {
  $value = & node $helper get $Instance $Key
  if ($LASTEXITCODE -ne 0) { throw "Cannot read institute '$Instance'." }
  return ($value | Select-Object -Last 1).Trim()
}

Push-Location $root
try {
  $backupArgs = @{ Instance = $Instance }
  if ($PgBin) { $backupArgs.PgBin = $PgBin }
  & (Join-Path $PSScriptRoot "backup-instance.ps1") @backupArgs
  if ($LASTEXITCODE -ne 0) { throw "Backup failed; update stopped." }

  $env:SB_INSTANCE = $Instance
  & pnpm db:migrate
  if ($LASTEXITCODE -ne 0) { throw "Migration failed for '$Instance'." }
  & pnpm build
  if ($LASTEXITCODE -ne 0) { throw "Build failed." }

  if ($Nssm) {
    $web = Get-InstanceValue "serviceWeb"
    $worker = Get-InstanceValue "serviceWorker"
    & $Nssm stop $worker 2>$null | Out-Null
    & $Nssm stop $web 2>$null | Out-Null
    & $Nssm start $web
    & $Nssm start $worker
  }
  Write-Host "Update complete for institute '$Instance'."
} finally {
  Pop-Location
}
