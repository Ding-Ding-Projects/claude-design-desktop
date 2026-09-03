[CmdletBinding()]
param([switch]$Silent)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$contract = Get-Content -Raw (Join-Path $root 'release-support/installer-contract.json') | ConvertFrom-Json
$distRoots = @(
  (Join-Path $root 'dist/squirrel-windows/squirrel-windows'),
  (Join-Path $root 'packages/electron/dist/squirrel-windows/squirrel-windows'),
  (Join-Path $root 'dist/squirrel-windows'),
  (Join-Path $root 'packages/electron/dist/squirrel-windows')
) | Where-Object {
  (Test-Path -LiteralPath (Join-Path $_ 'Setup.exe')) -and
  (Test-Path -LiteralPath (Join-Path $_ 'RELEASES'))
}
$dist = $distRoots | Select-Object -First 1
if (-not $dist) { throw 'No complete Squirrel.Windows output exists. The packaging command returned without a directory containing both Setup.exe and RELEASES.' }
$setup = Join-Path $dist 'Setup.exe'
$releases = Join-Path $dist 'RELEASES'
if (-not (Test-Path -LiteralPath $setup)) { throw "Squirrel.Windows Setup.exe is missing: $setup" }
if (-not (Test-Path -LiteralPath $releases)) { throw "Squirrel.Windows RELEASES is missing: $releases" }
$nupkg = Get-ChildItem -LiteralPath $dist -Filter '*.nupkg' -File | Where-Object { $_.Name -notmatch '-delta\.nupkg$' } | Select-Object -First 1
if (-not $nupkg) { throw "Squirrel.Windows full .nupkg is missing in $dist" }
function Get-SecurityDirectoryOffset([string]$Path) {
  $stream = [IO.File]::OpenRead($Path)
  $reader = New-Object IO.BinaryReader($stream)
  try {
    if ($stream.Length -lt 256 -or $reader.ReadUInt16() -ne 0x5A4D) { throw "Portable executable has an invalid DOS header: $Path" }
    $stream.Position = 0x3C
    $peOffset = $reader.ReadUInt32()
    if ($peOffset -gt ($stream.Length - 256)) { throw "Portable executable has an invalid PE offset: $Path" }
    $stream.Position = $peOffset
    if ($reader.ReadUInt32() -ne 0x00004550) { throw "Portable executable has an invalid PE signature: $Path" }
    $stream.Position = $peOffset + 20
    $optionalHeaderSize = $reader.ReadUInt16()
    $optionalHeaderOffset = $peOffset + 24
    if (($optionalHeaderOffset + $optionalHeaderSize) -gt $stream.Length) { throw "Portable executable has a truncated optional header: $Path" }
    $stream.Position = $optionalHeaderOffset
    $magic = $reader.ReadUInt16()
    if ($magic -eq 0x10B) { $dataDirectoryOffset = 96 }
    elseif ($magic -eq 0x20B) { $dataDirectoryOffset = 112 }
    else { throw "Portable executable has an unsupported optional-header magic value: $Path" }
    $securityDirectoryOffset = $dataDirectoryOffset + 32
    if ($optionalHeaderSize -lt ($securityDirectoryOffset + 8)) { throw "Portable executable has no complete security directory: $Path" }
    return $optionalHeaderOffset + $securityDirectoryOffset
  } finally {
    $reader.Dispose()
    $stream.Dispose()
  }
}
function Assert-UnsignedPortableExecutable([string]$Path) {
  $securityDirectoryOffset = Get-SecurityDirectoryOffset $Path
  $stream = [IO.File]::OpenRead($Path)
  $reader = New-Object IO.BinaryReader($stream)
  try {
    $stream.Position = $securityDirectoryOffset
    $certificateTableOffset = $reader.ReadUInt32()
    $certificateTableSize = $reader.ReadUInt32()
    if ($certificateTableOffset -ne 0 -or $certificateTableSize -ne 0) {
      throw "Code signing is prohibited, but the PE security directory is populated for $Path."
    }
  } finally {
    $reader.Dispose()
    $stream.Dispose()
  }
}
Assert-UnsignedPortableExecutable $setup
$signatureProbe = Join-Path ([IO.Path]::GetTempPath()) ("claude-design-signature-probe-{0}.exe" -f [guid]::NewGuid().ToString('N'))
try {
  [IO.File]::Copy($setup, $signatureProbe, $true)
  $probeDirectoryOffset = Get-SecurityDirectoryOffset $signatureProbe
  $probeStream = [IO.File]::Open($signatureProbe, [IO.FileMode]::Open, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
  $probeWriter = New-Object IO.BinaryWriter($probeStream)
  try {
    $probeStream.Position = $probeDirectoryOffset
    $probeWriter.Write([uint32]8)
    $probeWriter.Write([uint32]8)
    $probeWriter.Flush()
  } finally {
    $probeWriter.Dispose()
    $probeStream.Dispose()
  }
  $signatureMutationRejected = $false
  try { Assert-UnsignedPortableExecutable $signatureProbe }
  catch {
    if ($_.Exception.Message -like 'Code signing is prohibited*') { $signatureMutationRejected = $true }
    else { throw }
  }
  if (-not $signatureMutationRejected) { throw 'Unsigned PE negative regression stayed green after populating the certificate table.' }
} finally {
  Remove-Item -LiteralPath $signatureProbe -Force -ErrorAction SilentlyContinue
}
Assert-UnsignedPortableExecutable $setup
$unpackedRoot = Join-Path (Split-Path $dist -Parent) 'win-unpacked'
foreach ($productExecutableName in @('Claude Design Desktop.exe', 'Claude Design Desktop_ExecutionStub.exe')) {
  $productExecutable = Join-Path $unpackedRoot $productExecutableName
  if (-not (Test-Path -LiteralPath $productExecutable)) { throw "Packaged product executable is missing: $productExecutable" }
  Assert-UnsignedPortableExecutable $productExecutable
}
$releaseText = Get-Content -Raw $releases
if ($releaseText -notmatch [regex]::Escape($nupkg.Name)) { throw "RELEASES does not reference the full package $($nupkg.Name)." }
$tmp = Join-Path ([IO.Path]::GetTempPath()) ("claude-design-package-{0}" -f [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
try {
  $archiveCopy = Join-Path $tmp 'package.zip'
  $packageRoot = Join-Path $tmp 'expanded'
  [IO.File]::Copy($nupkg.FullName, $archiveCopy, $true)
  Expand-Archive -LiteralPath $archiveCopy -DestinationPath $packageRoot -Force
  $appAsar = Join-Path $packageRoot 'lib/net45/resources/app.asar'
  if (-not (Test-Path -LiteralPath $appAsar)) { throw "Full package does not contain lib/net45/resources/app.asar: $($nupkg.Name)" }
  $runtimeFound = $false
  foreach ($candidate in $contract.requiredRuntimeCandidates) {
    if (Get-ChildItem -LiteralPath $packageRoot -Recurse -File -ErrorAction SilentlyContinue | Where-Object { $_.FullName.Replace('\','/').EndsWith($candidate) } | Select-Object -First 1) { $runtimeFound = $true; break }
  }
  if (-not $runtimeFound) { throw "Full package contains app.asar but no bundled app-server runtime candidate from the installer contract." }
} finally {
  Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
$stream = [IO.File]::OpenRead($setup)
try {
  $sha = [Security.Cryptography.SHA256]::Create()
  try { $setupHash = ([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() }
  finally { $sha.Dispose() }
} finally {
  $stream.Dispose()
}
Write-Host ("[installer] {0}" -f $setup)
Write-Host ("[installer] SHA256 {0}" -f $setupHash)
Write-Host '[installer] Authenticode: NotSigned (unknown-publisher warning is expected).'
Write-Host '[installer] Unsigned PE negative regression: red then green.'
