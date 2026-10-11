# Start the local stack using the shared orchestrator and saved runtime.
$ErrorActionPreference = 'Stop'
& node (Join-Path $PSScriptRoot 'run-local.mjs')
exit $LASTEXITCODE
