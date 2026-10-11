# Bootstrap only the Node prerequisite; shared JavaScript handles the rest.
param(
    [ValidateSet('setup', 'doctor')]
    [string]$Mode
)

$ErrorActionPreference = 'Stop'

# Select the first PATH match when several Node installations are present.
$nodeCommand = Get-Command node -CommandType Application -ErrorAction SilentlyContinue |
    Select-Object -First 1

if (-not $nodeCommand) {
    # Doctor must explain missing prerequisites without installing anything.
    if ($Mode -eq 'doctor') {
        Write-Error 'Node is missing. Install Node.js 24 LTS, restart your terminal/IDE, and run setup.ps1.'
        exit 1
    }
    $packageManager = Get-Command winget -ErrorAction SilentlyContinue
    if (-not $packageManager) {
        $installationHelp = 'https://learn.microsoft.com/windows/package-manager/winget/'
        Write-Error "WinGet is missing. Install Microsoft App Installer: $installationHelp"
        exit 1
    }

    Write-Host 'Installing Node.js LTS with WinGet. UAC elevation may be required.'

    $installationArguments = @(
        'install'
        '--id', 'OpenJS.NodeJS.LTS'
        '--exact'
        '--accept-package-agreements'
        '--accept-source-agreements'
    )
    & winget @installationArguments

    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }

    # A setup-only PATH refresh would not fix commits from a terminal or IDE.
    Write-Host 'Restart your terminal and IDE so their persistent PATH includes Node, then rerun setup.ps1.'
    exit 1
}
$environmentScript = Join-Path $PSScriptRoot 'environment.mjs'
& $nodeCommand.Source $environmentScript $Mode
exit $LASTEXITCODE
