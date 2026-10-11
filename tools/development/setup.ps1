# Prepare this clone through the shared Windows bootstrap.
$bootstrapScript = Join-Path $PSScriptRoot 'bootstrap.ps1'
& $bootstrapScript -Mode setup
exit $LASTEXITCODE
