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
    [object[]] $DetectionRules  = @(),
    [object[]] $RequirementRules = @(),
    [switch] $DryRun
)

$ErrorActionPreference = 'Stop'
$GRAPH_BASE = 'https://graph.microsoft.com/v1.0'

# ── Ensure output directories always exist (so artifacts never warn) ──────────
foreach ($d in @('out', 'out/publish-logs')) {
    if (!(Test-Path $d)) { New-Item -ItemType Directory -Path $d | Out-Null }
}
$logFile = 'out/publish-logs/publish.log'
"[$(Get-Date -Format 'o')] Publish-Win32App started" | Out-File $logFile -Encoding utf8 -Force

Import-Module "$PSScriptRoot/IntuneDeployment.psm1" -Force

$pkg         = Import-PackageYaml 'windows/package.yaml'
$intuneMeta  = Get-Content 'windows/intune/app.json' -Raw | ConvertFrom-Json

$displayName   = $intuneMeta.displayName
$vendorVersion = if ($pkg.version) { $pkg.version } else { $pkg.vendor_version }

Write-Log "Publishing $displayName v$vendorVersion" -LogFile $logFile

if ($DryRun) {
    Write-Log "DRY RUN — skipping Graph API calls" WARN -LogFile $logFile
    "APP_ID=DRY-RUN" | Out-File 'out/app.env' -Encoding ascii -Force
    exit 0
}

# ── Validate inputs ───────────────────────────────────────────────────────────
if (!(Test-Path $IntuneWinPath)) {
    throw "IntuneWin file not found: $IntuneWinPath"
}
Write-Log "IntuneWin: $IntuneWinPath" -LogFile $logFile

# ── Acquire Graph token ───────────────────────────────────────────────────────
$token = Get-GraphToken -TenantId $TenantId -ClientId $ClientId -ClientSecret $ClientSecret

# ── Build app body ────────────────────────────────────────────────────────────
$appBody = @{
    '@odata.type'        = '#microsoft.graph.win32LobApp'
    displayName          = $displayName
    displayVersion       = $vendorVersion
    publisher            = if ($intuneMeta.publisher)  { $intuneMeta.publisher }  else { 'Unknown' }
    installCommandLine   = $pkg.install.command_line
    uninstallCommandLine = $pkg.uninstall.command_line
    description          = if ($intuneMeta.description) { $intuneMeta.description } else { $displayName }
    installExperience    = @{
        runAsAccount          = if ($intuneMeta.installContext)   { $intuneMeta.installContext }   else { 'system' }
        deviceRestartBehavior = if ($intuneMeta.restartBehavior)  { $intuneMeta.restartBehavior }  else { 'suppress' }
    }
}

if ($DetectionRules.Count  -gt 0) { $appBody.detectionRules   = $DetectionRules }
if ($RequirementRules.Count -gt 0) { $appBody.requirementRules = $RequirementRules }

Write-Log "App body built for: $displayName" -LogFile $logFile

# ── Create or update app ──────────────────────────────────────────────────────
$create = Invoke-GraphRequest -Token $token -Method POST `
    -Uri "$GRAPH_BASE/deviceAppManagement/mobileApps" `
    -Body $appBody

$appId = $create.id
Write-Log "App created in Intune: $appId" -LogFile $logFile

# ── Write dotenv for downstream assign job ────────────────────────────────────
"APP_ID=$appId" | Out-File 'out/app.env' -Encoding ascii -Force
Write-Log "Written: out/app.env (APP_ID=$appId)" -LogFile $logFile

Write-Host "✅ Publish complete: $displayName v$vendorVersion ($appId)" -ForegroundColor Green