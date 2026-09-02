[CmdletBinding()]
param([switch]$Silent)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$env:SILENT = if ($Silent) { '1' } else { $env:SILENT }
$fetcher = Join-Path $root 'scripts/download-dependencies.ps1'
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $fetcher $(if ($Silent) { '-Silent' })
if ($LASTEXITCODE -ne 0) { throw "Dependency bootstrap exited with code $LASTEXITCODE." }

$manifest = Get-Content -Raw (Join-Path $root 'release-support/dependency-manifest.json') | ConvertFrom-Json
$nodeExe = Join-Path $env:LOCALAPPDATA ("Ding-Ding-Projects/ClaudeDesignDesktop/toolchain/node-v{0}-win-x64/node.exe" -f $manifest.node.version)
if (-not (Test-Path -LiteralPath $nodeExe)) { throw "Pinned Node $($manifest.node.version) is missing after bootstrap: $nodeExe" }
$npm = Join-Path (Split-Path $nodeExe -Parent) 'npm.cmd'
$package = Get-Content -Raw (Join-Path $root 'package.json') | ConvertFrom-Json
if (-not $package.scripts.build) { throw "package.json does not declare the required build script." }

function Write-Phase([string]$Message) { if (-not $Silent) { Write-Host ("[build] {0}" -f $Message) } }
Write-Phase 'Building the runnable application through npm run build'
& $npm run build
if ($LASTEXITCODE -ne 0) { throw "npm run build exited with code $LASTEXITCODE." }

$candidates = @('dist', 'packages/electron/dist', 'build/dist') | ForEach-Object { Join-Path $root $_ } | Where-Object { Test-Path -LiteralPath $_ }
if (-not ($candidates | Where-Object { Get-ChildItem -LiteralPath $_ -Force | Select-Object -First 1 })) {
  throw 'The build command returned success but produced no runnable output in dist, packages/electron/dist, or build/dist.'
}
Write-Phase 'Runnable build verified'
if (-not $Silent) {
  $answer = Read-Host 'Run the built application now? [y/N]'
  if ($answer -match '^(y|yes)$') {
    if (-not $package.scripts.start) { throw 'The build completed, but package.json does not declare a start script.' }
    & $npm run start
    if ($LASTEXITCODE -ne 0) { throw "npm run start exited with code $LASTEXITCODE." }
  }
}
