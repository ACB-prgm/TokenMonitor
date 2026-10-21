param([switch]$VerifyOnly)
$ErrorActionPreference = 'Stop'
$mode = if ($VerifyOnly) { 'verify-install' } else { 'install' }
& (Join-Path $PSScriptRoot 'plugins/token-monitor-embedded/scripts/launch.ps1') -Mode $mode
exit $LASTEXITCODE
