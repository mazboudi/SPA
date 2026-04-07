<#
.SYNOPSIS
  Creates or updates a Win32 LOB app in Intune and uploads .intunewin content
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory)] [string] $IntuneWinPath,
    [Parameter(Mandatory)] [string] $TenantId,
    [Parameter(Mandatory)] [string] $ClientId,
    [Parameter(Mandatory)] [string] $ClientSecret,
    [object[]] $DetectionRules = @(),
    [object[]] $RequirementRules = @(),
    [switch] $DryRun
)

$ErrorActionPreference = 'Stop'
$GRAPH_BASE = 'https://graph.microsoft.com/v1.0'

Import-Module "$PSScriptRoot/IntuneDeployment.psm1" -Force

$pkg = Import-PackageYaml 'windows/package.yaml'
$intuneMeta = Get-Content 'windows/intune/app.json' -Raw | ConvertFrom-Json

$displayName = $intuneMeta.displayName
$vendorVersion = if ($pkg.version) { $pkg.version } else { $pkg.vendor_version }

Write-Log "Publishing $displayName v$vendorVersion"

if ($DryRun) {
    Write-Log "DRY RUN — exiting" WARN
    "APP_ID=DRY-RUN" | Out-File 'out/app.env'
    exit 0
}

$token = Get-GraphToken -TenantId $TenantId -ClientId $ClientId -ClientSecret $ClientSecret

$appBody = @{
    '@odata.type'        = '#microsoft.graph.win32LobApp'
    displayName          = $displayName
    displayVersion       = $vendorVersion
    publisher            = $intuneMeta.publisher ?? 'Unknown'
    installCommandLine   = $pkg.install.install_command
    uninstallCommandLine = $pkg.install.uninstall_command
    description          = $intuneMeta.description ?? $displayName
    installExperience    = @{
        runAsAccount          = $intuneMeta.installContext ?? 'system'
        deviceRestartBehavior = $intuneMeta.restartBehavior ?? 'suppress'
    }
}

if ($DetectionRules)   { $appBody.detectionRules   = $DetectionRules }
if ($RequirementRules) { $appBody.requirementRules = $RequirementRules }

# ── Create app ────────────────────────────────────────────
$create = Invoke-GraphRequest -Token $token -Method POST `
    -Uri "$GRAPH_BASE/deviceAppManagement/mobileApps" `
    -Body $appBody

$appId = $create.id
Write-Log "App created: $appId"

"APP_ID=$appId" | Out-File 'out/app.env' -Encoding ascii -Force
Write-Host "✅ Publish complete: $displayName ($appId)" -ForegroundColor Green