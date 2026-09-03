[CmdletBinding()]
param([switch]$Silent)

$ErrorActionPreference = 'Stop'
$Silent = $Silent.IsPresent -or $env:SILENT -eq '1'
if (-not $Silent) {
  $principal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    try { $elevated = Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"") -Wait -PassThru } catch { throw "Interactive elevation was declined: $($_.Exception.Message)" }
    exit $elevated.ExitCode
  }
}
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$fetcher = Join-Path $root 'scripts/download-dependencies.ps1'
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $fetcher $(if ($Silent) { '-Silent' })
if ($LASTEXITCODE -ne 0) { throw "Dependency bootstrap exited with code $LASTEXITCODE." }
$manifest = Get-Content -Raw (Join-Path $root 'release-support/dependency-manifest.json') | ConvertFrom-Json
$nodeExe = Join-Path $env:LOCALAPPDATA ("Ding-Ding-Projects/ClaudeDesignDesktop/toolchain/node-v{0}-win-x64/node.exe" -f $manifest.node.version)
$npm = Join-Path (Split-Path $nodeExe -Parent) 'npm.cmd'
$package = Get-Content -Raw (Join-Path $root 'package.json') | ConvertFrom-Json
if (-not $package.scripts.dist) { throw "package.json does not declare the required dist packaging script." }

if (-not $Silent) { Write-Host '[installer] Building unsigned Squirrel.Windows output through npm run dist' }
& $npm run dist -- '--win' 'squirrel'
if ($LASTEXITCODE -ne 0) { throw "npm run dist -- --win squirrel exited with code $LASTEXITCODE." }

$validator = Join-Path $root 'scripts/validate-squirrel-package.ps1'
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $validator $(if ($Silent) { '-Silent' })
if ($LASTEXITCODE -ne 0) { throw "Squirrel.Windows validation exited with code $LASTEXITCODE." }
if (-not $Silent) { Write-Host '[installer] Unsigned Squirrel.Windows installer verified.' }
