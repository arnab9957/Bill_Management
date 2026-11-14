# Registers the web app and worker as Windows services with NSSM (auto-start, auto-restart)
# and opens the web port to the school LAN only. Run as Administrator on the server PC.
#
#   .\scripts\install-services.ps1 -AppDir "C:\SchoolBilling" -Nssm "C:\SchoolBilling\tools\nssm.exe" -Subnet "192.168.1.0/24"
param(
  [Parameter(Mandatory)] [string]$AppDir,
  [Parameter(Mandatory)] [string]$Nssm,
  [string]$Node = "$AppDir\node\node.exe",
  [int]$Port = 3000,
  [string]$Subnet = "LocalSubnet"
)
$ErrorActionPreference = "Stop"
$logs = Join-Path $AppDir "storage\logs"
New-Item -ItemType Directory -Force $logs | Out-Null

function Install-Svc($name, $script, $cwd, $extraEnv) {
  & $Nssm stop $name 2>$null | Out-Null
  & $Nssm remove $name confirm 2>$null | Out-Null
  & $Nssm install $name $Node $script
  & $Nssm set $name AppDirectory $cwd
  & $Nssm set $name AppEnvironmentExtra "NODE_ENV=production" "NEXT_TELEMETRY_DISABLED=1" @extraEnv
  & $Nssm set $name Start SERVICE_AUTO_START
  & $Nssm set $name AppExit Default Restart
  & $Nssm set $name AppRestartDelay 5000
  & $Nssm set $name AppStdout (Join-Path $logs "$name.out.log")
  & $Nssm set $name AppStderr (Join-Path $logs "$name.err.log")
  & $Nssm set $name AppRotateFiles 1
  & $Nssm set $name AppRotateBytes 10485760
  & $Nssm set $name DependOnService postgresql-x64-16
}

# .env is read from the app root by both processes.
Install-Svc "SchoolBillingWeb" "apps\web\server.js" "$AppDir\web" @("PORT=$Port", "HOSTNAME=0.0.0.0")
Install-Svc "SchoolBillingWorker" "dist\index.js" "$AppDir\worker" @()

# LAN-only firewall rule. Never port-forward this to the internet.
Remove-NetFirewallRule -DisplayName "School Billing (LAN)" -ErrorAction SilentlyContinue
New-NetFirewallRule -DisplayName "School Billing (LAN)" -Direction Inbound -Protocol TCP -LocalPort $Port -RemoteAddress $Subnet -Action Allow | Out-Null

& $Nssm start SchoolBillingWeb
& $Nssm start SchoolBillingWorker
Write-Host "Services installed. Open http://<server-ip>:$Port from counter PCs."
