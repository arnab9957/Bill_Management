param(
  [Parameter(Mandatory)] [string]$Instance,
  [string]$PgBin,
  [string]$Out
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
if ([string]::IsNullOrWhiteSpace($Out)) { $Out = Join-Path $storage "backups" }
New-Item -ItemType Directory -Force $Out | Out-Null

$env:PGPASSWORD = $password
& (Join-Path $PSScriptRoot "backup.ps1") -Out $Out -PgBin $PgBin -Db $db -User $user -PgHost $hostName -Port $port -Prefix $Instance
if ($LASTEXITCODE -ne 0) { throw "Backup failed for institute '$Instance'." }

$stamp = Get-Date -Format "yyyy-MM-dd_HHmm"
$files = @()
foreach ($name in @("branding", "photos")) {
  $folder = Join-Path $storage $name
  if ((Test-Path $folder) -and @(Get-ChildItem -LiteralPath $folder -Recurse -File).Count -gt 0) { $files += $folder }
}
if ($files.Count -gt 0) {
  $zip = Join-Path $Out ("{0}_{1}_files.zip" -f $Instance, $stamp)
  Compress-Archive -Path $files -DestinationPath $zip -Force
  Write-Host "Files written to $zip"
}
