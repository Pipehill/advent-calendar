# Diagnose this clone without installing or repairing prerequisites.
$bootstrapScript = Join-Path $PSScriptRoot 'bootstrap.ps1'
& $bootstrapScript -Mode doctor
exit $LASTEXITCODE
