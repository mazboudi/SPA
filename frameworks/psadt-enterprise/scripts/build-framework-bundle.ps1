<#
.SYNOPSIS
  Packages the psadt-enterprise versioned directory into a distributable .zip bundle.

.DESCRIPTION
  Reads the target version from the manifest.json inside versions/<version>/,
  zips the contents, computes SHA-256, and writes both to the dist/ directory.
  The resulting bundle is what the CI windows-build job downloads and uses as
  the PSADT staging base.

.PARAMETER Version
  The framework version to bundle (must match a directory under versions/).
  Defaults to the highest semver directory found.

.PARAMETER OutDir
  Output directory for the bundle zip and checksums.json. Default: dist/

.EXAMPLE
  pwsh -File scripts/build-framework-bundle.ps1 -Version 4.1.0
  # Produces: dist/psadt-enterprise-4.1.0.zip
  #           dist/checksums.json
#>
[CmdletBinding()]
param(
    [string] $Version,
    [string] $OutDir = 'dist'
)

$ErrorActionPreference = 'Stop'

# Resolve version
if (-not $Version) {
    $dirs = Get-ChildItem -Path (Join-Path $PSScriptRoot '..\versions') -Directory | Sort-Object Name
    if (-not $dirs) { throw 'No version directories found under versions/.' }
    $Version = $dirs[-1].Name
}

$versionDir = Join-Path $PSScriptRoot "..\versions\$Version"
if (!(Test-Path $versionDir)) { throw "Version directory not found: $versionDir" }

# Read manifest
$manifestPath = Join-Path $versionDir 'manifest.json'
if (!(Test-Path $manifestPath)) { throw "manifest.json not found in: $versionDir" }
$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json

Write-Host "Bundling psadt-enterprise $($manifest.framework_version)..." -ForegroundColor Cyan

# Ensure output directory
if (!(Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir | Out-Null }

# Build zip path
$bundleName = "psadt-enterprise-$Version.zip"
$bundlePath = Join-Path $OutDir $bundleName

# Remove existing zip if present
if (Test-Path $bundlePath) { Remove-Item $bundlePath -Force }

# Compress the versioned bundle content only.
# IntuneWinAppUtil.exe and other tools are pre-installed on the runner at C:\tools
# and do not need to be included in the bundle.
Compress-Archive -Path (Join-Path $versionDir '*') -DestinationPath $bundlePath -CompressionLevel Optimal
Write-Host "Bundle created: $bundlePath" -ForegroundColor Green

# Compute SHA-256
$hash = (Get-FileHash -Path $bundlePath -Algorithm SHA256).Hash.ToLower()
Write-Host "SHA-256: $hash"

# Write checksums.json (append/update for this version)
$checksumPath = Join-Path $OutDir 'checksums.json'
$checksums = @{}
if (Test-Path $checksumPath) {
    $checksums = Get-Content $checksumPath -Raw | ConvertFrom-Json -AsHashtable
}
$checksums[$bundleName] = $hash
$checksums | ConvertTo-Json -Depth 5 | Out-File $checksumPath -Encoding utf8 -Force

Write-Host "Checksums written: $checksumPath" -ForegroundColor Green
Write-Host ""
Write-Host "BUNDLE_PATH=$bundlePath" -ForegroundColor Yellow
Write-Host "BUNDLE_SHA256=$hash"     -ForegroundColor Yellow

# Write dotenv for CI consumption
"BUNDLE_PATH=$bundlePath`nBUNDLE_SHA256=$hash" | Out-File (Join-Path $OutDir 'bundle.env') -Encoding ascii -Force
