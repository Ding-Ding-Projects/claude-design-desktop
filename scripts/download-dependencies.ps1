[CmdletBinding()]
param([switch]$Silent)

$ErrorActionPreference = 'Stop'
$Silent = $Silent.IsPresent -or $env:SILENT -eq '1'
if (-not $Silent) {
  $principal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    $arguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"")
    try { $elevated = Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList $arguments -Wait -PassThru } catch { throw "Interactive elevation was declined: $($_.Exception.Message)" }
    exit $elevated.ExitCode
  }
}
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$manifestPath = Join-Path $root 'release-support/dependency-manifest.json'
$manifest = Get-Content -Raw $manifestPath | ConvertFrom-Json
$toolRoot = Join-Path $env:LOCALAPPDATA 'Ding-Ding-Projects/ClaudeDesignDesktop/toolchain'
$nodeRoot = Join-Path $toolRoot ("node-v{0}-win-x64" -f $manifest.node.version)
$nodeExe = Join-Path $nodeRoot 'node.exe'
$cacheManifest = Join-Path $nodeRoot 'cache-manifest.json'

function Write-Phase([string]$Message) {
  if (-not $Silent) { Write-Host ("[dependencies] {0}" -f $Message) }
}

function Get-Sha256([string]$Path) {
  $stream = [System.IO.File]::OpenRead($Path)
  $sha256 = [System.Security.Cryptography.SHA256]::Create()
  try {
    $bytes = $sha256.ComputeHash($stream)
    return (($bytes | ForEach-Object { $_.ToString('x2') }) -join '')
  } finally {
    $sha256.Dispose()
    $stream.Dispose()
  }
}

function Invoke-Checked([string]$Command, [string[]]$Arguments) {
  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Dependency command '$Command $($Arguments -join ' ')' exited with code $LASTEXITCODE."
  }
}

$cacheValid = $false
if ((Test-Path -LiteralPath $nodeExe) -and (Test-Path -LiteralPath $cacheManifest)) {
  $cached = Get-Content -Raw $cacheManifest | ConvertFrom-Json
  $cacheValid = $cached.version -eq $manifest.node.version -and $cached.nodeSha256 -eq (Get-Sha256 $nodeExe)
}
if (-not $cacheValid) {
  New-Item -ItemType Directory -Force -Path $toolRoot | Out-Null
  $archive = Join-Path $toolRoot (".node-{0}.zip" -f [guid]::NewGuid().ToString('N'))
  Write-Phase ("Downloading Node {0} from {1}" -f $manifest.node.version, $manifest.node.url)
  try {
    Invoke-WebRequest -UseBasicParsing -TimeoutSec 120 -Uri $manifest.node.url -OutFile $archive
  } catch {
    Remove-Item -LiteralPath $archive -Force -ErrorAction SilentlyContinue
    throw "Node download failed from $($manifest.node.url): $($_.Exception.Message)"
  }
  $actual = Get-Sha256 $archive
  if ($actual -ne $manifest.node.sha256) {
    throw "Node $($manifest.node.version) digest mismatch. Expected $($manifest.node.sha256), received $actual from $($manifest.node.url)."
  }
  $extractRoot = Join-Path $toolRoot ("extract-{0}" -f [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Force -Path $extractRoot | Out-Null
  Expand-Archive -LiteralPath $archive -DestinationPath $extractRoot -Force
  $expanded = Get-ChildItem -LiteralPath $extractRoot -Directory | Select-Object -First 1
  if (-not $expanded) { throw "Node archive extracted no directory: $archive" }
  if (Test-Path -LiteralPath $nodeRoot) { Remove-Item -LiteralPath $nodeRoot -Recurse -Force }
  Move-Item -LiteralPath $expanded.FullName -Destination $nodeRoot
  Remove-Item -LiteralPath $extractRoot -Recurse -Force
  Remove-Item -LiteralPath $archive -Force -ErrorAction SilentlyContinue
  @{ schemaVersion = 1; version = $manifest.node.version; nodeSha256 = Get-Sha256 $nodeExe } | ConvertTo-Json | Set-Content -LiteralPath $cacheManifest -Encoding utf8
  Write-Phase ("Installed Node to {0}" -f $nodeRoot)
} else {
  Write-Phase ("Found and revalidated product-owned Node cache at {0}" -f $nodeRoot)
}

if (-not (Test-Path -LiteralPath $nodeExe)) {
  throw "Node executable is missing after bootstrap: $nodeExe"
}
$nodeBin = Split-Path $nodeExe -Parent
$env:Path = "$nodeBin;$env:Path"
$npmCmd = Join-Path $nodeBin 'npm.cmd'
if (-not (Test-Path -LiteralPath $npmCmd)) { throw "npm executable is missing beside bundled Node: $npmCmd" }

$packageJson = Join-Path $root 'package.json'
$lockFile = Join-Path $root 'package-lock.json'
if (-not (Test-Path -LiteralPath $packageJson) -or -not (Test-Path -LiteralPath $lockFile)) {
  throw "The application package manifest or lockfile is missing. Expected package.json and package-lock.json at $root."
}

Write-Phase 'Installing locked npm packages from package-lock.json'
Invoke-Checked $npmCmd @('ci', '--no-audit', '--no-fund')
Write-Phase 'Verifying declared release tooling'
$builder = Join-Path $root 'node_modules/.bin/electron-builder.cmd'
if (-not (Test-Path -LiteralPath $builder)) { throw "electron-builder is absent after npm ci: $builder" }
Write-Phase 'Dependency bootstrap complete'
