# Start the local stack using the shared orchestrator and saved runtime.
$ErrorActionPreference = 'Stop'
$nodeExecutable = (Get-Command node -CommandType Application | Select-Object -First 1).Source
$launcherPath = Join-Path $PSScriptRoot 'tools/development/run-local.mjs'
# Native tools write progress to stderr. Their exit code determines failure,
# including when Windows PowerShell callers redirect output to a log file.
$ErrorActionPreference = 'Continue'
& $nodeExecutable $launcherPath @args
exit $LASTEXITCODE
