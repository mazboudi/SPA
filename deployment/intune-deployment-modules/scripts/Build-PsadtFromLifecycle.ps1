<#
.SYNOPSIS
  Generates Invoke-AppDeployToolkit.ps1 from lifecycle.yaml at pipeline build time.

.DESCRIPTION
  Reads the declarative lifecycle.yaml and package metadata to produce a
  fully functional PSADT v4 deployment script. This script is called during
  the CI/CD build stage before .intunewin packaging.

  The generated script is NOT committed to the repo — it is a build artifact.

.PARAMETER LifecyclePath
  Path to windows/lifecycle.yaml.

.PARAMETER PackageYamlPath
  Path to windows/package.yaml.

.PARAMETER AppJsonPath
  Path to app.json (title-level metadata).

.PARAMETER OutputPath
  Output path for the generated Invoke-AppDeployToolkit.ps1.
  Defaults to windows/src/Invoke-AppDeployToolkit.ps1.

.PARAMETER FrameworkVersion
  PSADT framework version. Defaults to '4.1.0'.

.EXAMPLE
  pwsh -File Build-PsadtFromLifecycle.ps1 `
      -LifecyclePath  windows/lifecycle.yaml `
      -PackageYamlPath windows/package.yaml `
      -AppJsonPath     app.json
#>
[CmdletBinding()]
param(
    [string] $LifecyclePath   = 'windows/lifecycle.yaml',
    [string] $PackageYamlPath = 'windows/package.yaml',
    [string] $AppJsonPath     = 'app.json',
    [string] $OutputPath      = 'windows/src/Invoke-AppDeployToolkit.ps1',
    [string] $FrameworkVersion = '4.1.0'
)

$ErrorActionPreference = 'Stop'

Import-Module "$PSScriptRoot/IntuneDeployment.psm1" -Force
. "$PSScriptRoot/Build-DeployApplication.ps1"

# ── Validate inputs ──────────────────────────────────────────────────────────
foreach ($file in @($LifecyclePath, $PackageYamlPath, $AppJsonPath)) {
    if (!(Test-Path $file)) {
        throw "Required file not found: $file"
    }
}

# ── Read metadata ─────────────────────────────────────────────────────────────
$pkg = Import-PackageYaml $PackageYamlPath
$app = Get-Content $AppJsonPath -Raw | ConvertFrom-Json

$displayName = $app.title
$publisher   = $app.publisher
$version     = $pkg.version
$packageId   = $pkg.package_id ?? $app.package_id
$closeApps   = $pkg.close_apps ?? ''

Write-Host "Building PSADT script for: $displayName v$version" -ForegroundColor Cyan

# ── Read lifecycle.yaml ───────────────────────────────────────────────────────
$lifecycle = Import-LifecycleYaml -Path $LifecyclePath `
    -PackageId $packageId `
    -DisplayName $displayName `
    -Publisher $publisher `
    -Version $version `
    -CloseApps $closeApps `
    -InstallerType ($pkg.installer_type ?? 'msi') `
    -ProductCode ($pkg.msi_information.product_code ?? $pkg.detection.product_code ?? '')

# ── Generate PSADT script ────────────────────────────────────────────────────
$scriptContent = Build-DeployApplication `
    -Lifecycle $lifecycle `
    -DisplayName $displayName `
    -Publisher $publisher `
    -Version $version `
    -PackageId $packageId `
    -FrameworkVersion $FrameworkVersion

# ── Write output ──────────────────────────────────────────────────────────────
$outputDir = Split-Path $OutputPath -Parent
if ($outputDir -and !(Test-Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
}

Set-Content -Path $OutputPath -Value $scriptContent -Encoding utf8
Write-Host "✅ Generated: $OutputPath" -ForegroundColor Green
