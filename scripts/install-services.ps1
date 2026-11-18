param(
  [Parameter(Mandatory)] [string]$AppDir,
  [Parameter(Mandatory)] [string]$Nssm,
  [string]$Node = "$AppDir\node\node.exe",
  [int]$Port = 3000,
  [string]$Subnet = "LocalSubnet",
  [string]$Instance = "default",
  [string]$BindAddress = "127.0.0.1",
  [string]$PgService = "postgresql-x64-16",
  [switch]$AllowLan
)
$ErrorActionPreference = "Stop"
$helper = Join-Path $AppDir "scripts\instance.mjs"

function Get-InstanceValue([string]$Key) {
  $value = & node $helper get $Instance $Key
  if ($LASTEXITCODE -ne 0) { throw "Cannot read institute '$Instance'." }
  return ($value | Select-Object -Last 1).Trim()
}

$webName = Get-InstanceValue "serviceWeb"
$workerName = Get-InstanceValue "serviceWorker"
$firewallName = Get-InstanceValue "firewallRule"
$logs = Join-Path (Get-InstanceValue "storageDir") "logs"
$webPort = if ($Instance -eq "default") { $Port } else { [int](Get-InstanceValue "webPort") }
$bind = if ($Instance -eq "default") { $BindAddress } else { Get-InstanceValue "bind" }
New-Item -ItemType Directory -Force $logs | Out-Null

function Install-Svc($name, $script, $cwd, $extraEnv) {
  & $Nssm stop $name 2>$null | Out-Null
  & $Nssm remove $name confirm 2>$null | Out-Null
  & $Nssm install $name $Node $script
  & $Nssm set $name AppDirectory $cwd
  & $Nssm set $name AppEnvironmentExtra @extraEnv
  & $Nssm set $name Start SERVICE_AUTO_START
  & $Nssm set $name AppExit Default Restart
  & $Nssm set $name AppRestartDelay 5000
  & $Nssm set $name AppStdout (Join-Path $logs "$name.out.log")
  & $Nssm set $name AppStderr (Join-Path $logs "$name.err.log")
  & $Nssm set $name AppRotateFiles 1
  & $Nssm set $name AppRotateBytes 10485760
  if ($PgService) { & $Nssm set $name DependOnService $PgService }
}

$commonEnv = @(
  "NODE_ENV=production",
  "NEXT_TELEMETRY_DISABLED=1",
  "SB_INSTANCE=$Instance",
  "SB_HOST=$bind",
  "SB_PORT=$webPort"
)
Install-Svc $webName "..\..\scripts\next-cli.mjs start" (Join-Path $AppDir "apps\web") $commonEnv
Install-Svc $workerName "dist\index.js" (Join-Path $AppDir "apps\worker") $commonEnv

Remove-NetFirewallRule -DisplayName $firewallName -ErrorAction SilentlyContinue
if ($AllowLan) {
  New-NetFirewallRule -DisplayName $firewallName -Direction Inbound -Protocol TCP -LocalPort $webPort -RemoteAddress $Subnet -Action Allow | Out-Null
}

& $Nssm start $webName
& $Nssm start $workerName
if ($AllowLan) { Write-Host "Services installed. Open http://<server-ip>:$webPort from counter PCs." }
else { Write-Host "Services installed. Open http://${bind}:$webPort on this computer." }
