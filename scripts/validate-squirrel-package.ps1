[CmdletBinding()]
param([switch]$Silent)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$contract = Get-Content -Raw (Join-Path $root 'release-support/installer-contract.json') | ConvertFrom-Json
$distRoots = @(
  (Join-Path $root 'dist/squirrel-windows'),
  (Join-Path $root 'packages/electron/dist/squirrel-windows')
) | Where-Object { Test-Path -LiteralPath $_ }
$dist = $distRoots | Select-Object -First 1
if (-not $dist) { throw 'No dist/squirrel-windows output exists. The packaging command returned success without producing Squirrel.Windows files.' }
$setup = Join-Path $dist 'Setup.exe'
$releases = Join-Path $dist 'RELEASES'
if (-not (Test-Path -LiteralPath $setup)) { throw "Squirrel.Windows Setup.exe is missing: $setup" }
if (-not (Test-Path -LiteralPath $releases)) { throw "Squirrel.Windows RELEASES is missing: $releases" }
$nupkg = Get-ChildItem -LiteralPath $dist -Filter '*.nupkg' -File | Where-Object { $_.Name -notmatch '-delta\.nupkg$' } | Select-Object -First 1
if (-not $nupkg) { throw "Squirrel.Windows full .nupkg is missing in $dist" }
$sig = Get-AuthenticodeSignature -LiteralPath $setup
if ($sig.Status -ne 'NotSigned') { throw "Code signing is prohibited, but $setup reports Authenticode status $($sig.Status)." }
$releaseText = Get-Content -Raw $releases
if ($releaseText -notmatch [regex]::Escape($nupkg.Name)) { throw "RELEASES does not reference the full package $($nupkg.Name)." }
$tmp = Join-Path ([IO.Path]::GetTempPath()) ("claude-design-package-{0}" -f [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
try {
  Expand-Archive -LiteralPath $nupkg.FullName -DestinationPath $tmp -Force
  $appAsar = Join-Path $tmp 'lib/net45/resources/app.asar'
  if (-not (Test-Path -LiteralPath $appAsar)) { throw "Full package does not contain lib/net45/resources/app.asar: $($nupkg.Name)" }
  $runtimeFound = $false
  foreach ($candidate in $contract.requiredRuntimeCandidates) {
    if (Get-ChildItem -LiteralPath $tmp -Recurse -File -ErrorAction SilentlyContinue | Where-Object { $_.FullName.Replace('\','/').EndsWith($candidate) } | Select-Object -First 1) { $runtimeFound = $true; break }
  }
  if (-not $runtimeFound) { throw "Full package contains app.asar but no bundled app-server runtime candidate from the installer contract." }
} finally {
  Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
if (-not $Silent) {
  Write-Host ("[installer] {0}" -f $setup)
  Write-Host ("[installer] SHA256 {0}" -f (Get-FileHash -LiteralPath $setup -Algorithm SHA256).Hash.ToLowerInvariant())
  Write-Host '[installer] Authenticode: NotSigned (unknown-publisher warning is expected).'
}
