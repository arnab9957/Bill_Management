param(
  [Parameter(Mandatory)] [string]$Instance,
  [Parameter(Mandatory)] [string]$File,
  [string]$PgBin,
  [string]$FilesZip
)
$ErrorActionPreference = "Stop"
$helper = Join-Path $PSScriptRoot "instance.mjs"

function Get-InstanceValue([string]$Key) {
  $value = & node $helper get $Instance $Key
  if ($LASTEXITCODE -ne 0) { throw "Cannot read institute '$Instance'." }
  return ($value | Select-Object -Last 1).Trim()
}

$db = Get-InstanceValue "db"
$user = Get-InstanceValue "dbUser"
$password = Get-InstanceValue "dbPassword"
$hostName = Get-InstanceValue "dbHost"
$port = [int](Get-InstanceValue "dbPort")
$dump = Get-InstanceValue "pgDump"
$storage = Get-InstanceValue "storage"

if ([string]::IsNullOrWhiteSpace($PgBin)) {
  if ([IO.Path]::IsPathRooted($dump)) {
    $PgBin = Split-Path $dump -Parent
  } else {
    $found = Get-Command $dump -ErrorAction SilentlyContinue
    if ($found) { $PgBin = Split-Path $found.Source -Parent } else { $PgBin = "C:\Program Files\PostgreSQL\16\bin" }
  }
}
if (-not (Test-Path $File)) { throw "Backup file not found: $File" }

$env:PGPASSWORD = $password
& (Join-Path $PSScriptRoot "restore.ps1") -File $File -PgBin $PgBin -Db $db -User $user -PgHost $hostName -Port $port
if ($LASTEXITCODE -ne 0) { throw "Restore failed for institute '$Instance'." }

if ($FilesZip) {
  if (-not (Test-Path $FilesZip)) { throw "Files zip not found: $FilesZip" }
  Expand-Archive -LiteralPath $FilesZip -DestinationPath $storage -Force
  Write-Host "Restored files into $storage"
}
