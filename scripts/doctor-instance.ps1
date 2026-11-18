param([Parameter(Mandatory)] [string]$Instance)
$ErrorActionPreference = "Stop"
& node (Join-Path $PSScriptRoot "instance.mjs") doctor $Instance
if ($LASTEXITCODE -ne 0) { throw "Institute '$Instance' failed its checks." }
