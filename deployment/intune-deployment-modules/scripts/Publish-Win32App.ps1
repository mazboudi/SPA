<#
.SYNOPSIS
  Creates a Win32 LOB app in Intune, then patches requirement rules after creation
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory)] [string] $IntuneWinPath,
    [Parameter(Mandatory)] [string] $TenantId,
    [Parameter(Mandatory)] [string] $ClientId,
    [Parameter(Mandatory)] [string] $ClientSecret,

    [Parameter(Mandatory)] [object[]] $DetectionRules,
    [object[]] $RequirementRules = @(),

    [string] $AppJsonPath     = 'windows/intune/app.json',
    [string] $PackageYamlPath = 'windows/package.yaml',
    [switch] $DryRun
)

$ErrorActionPreference = 'Stop'
$GRAPH_BASE = 'https://graph.microsoft.com/v1.0'

# ── Output dirs ───────────────────────────────────────────────────────────────
foreach ($d in @('out', 'out/publish-logs')) {
    if (!(Test-Path $d)) { New-Item -ItemType Directory -Path $d | Out-Null }
}
$logFile = 'out/publish-logs/publish.log'
"[$(Get-Date -Format 'o')] Publish-Win32App started" | Out-File $logFile -Encoding utf8 -Force

Import-Module "$PSScriptRoot/IntuneDeployment.psm1" -Force

# ── Validate detection rules ──────────────────────────────────────────────────
if (-not $DetectionRules -or $DetectionRules.Count -eq 0) {
    throw "DetectionRules are required to create a Win32 app."
}

# ── Load metadata ─────────────────────────────────────────────────────────────
$pkg        = Import-PackageYaml $PackageYamlPath
$intuneMeta = Get-Content $AppJsonPath -Raw | ConvertFrom-Json

$displayName   = $intuneMeta.displayName
$vendorVersion = if ($pkg.version) { $pkg.version } else { $pkg.vendor_version }

Write-Log "Publishing $displayName v$vendorVersion" -LogFile $logFile

if ($DryRun) {
    Write-Log "DRY RUN enabled — skipping Graph writes" WARN -LogFile $logFile
    "APP_ID=DRY-RUN" | Out-File 'out/app.env' -Encoding ascii -Force
    exit 0
}

# ── Validate .intunewin exists before any Graph calls ────────────────────────
if (!(Test-Path $IntuneWinPath)) {
    throw "IntuneWin file not found: $IntuneWinPath"
}
Write-Log "IntuneWin: $IntuneWinPath" -LogFile $logFile

# ── Auth ──────────────────────────────────────────────────────────────────────
$token = Get-GraphToken -TenantId $TenantId -ClientId $ClientId -ClientSecret $ClientSecret

# ── CREATE Win32 app (NO requirementRules!) ───────────────────────────────────
$appBody = @{
    '@odata.type' = '#microsoft.graph.win32LobApp'

    displayName    = $displayName
    displayVersion = $vendorVersion
    publisher      = $intuneMeta.publisher ?? 'Unknown'
    description    = $intuneMeta.description ?? $displayName

    # REQUIRED CREATE-TIME FIELDS
    fileName      = [System.IO.Path]::GetFileName($IntuneWinPath)
    setupFilePath = 'Deploy-Application.exe'

    minimumSupportedOperatingSystem = @{
        v10_1903 = $false
        v10_1909 = $false
        v10_2004 = $true
    }

    installCommandLine   = $pkg.install_command
    uninstallCommandLine = $pkg.uninstall_command

    # Always wrap in @() so ConvertTo-Json produces a JSON array, not a bare object.
    # A single-element PS array is unwrapped by the pipeline without this guard.
    detectionRules       = @($DetectionRules)

    installExperience    = @{
        runAsAccount          = $intuneMeta.installContext   ?? 'system'
        deviceRestartBehavior = $intuneMeta.restartBehavior ?? 'suppress'
    }
}

Write-Log "Creating Win32 app (metadata + detection rules only)" -LogFile $logFile

$create = Invoke-GraphRequest `
    -Token  $token `
    -Method POST `
    -Uri    "$GRAPH_BASE/deviceAppManagement/mobileApps" `
    -Body   $appBody

$appId = $create.id
Write-Log "Win32 app created: $appId" -LogFile $logFile

# ── Upload .intunewin content ─────────────────────────────────────────────────
# The app is metadata-only until content is uploaded. Without this step
# the app will appear in Intune but will never deploy to any device.
Write-Log "Starting content upload..." -LogFile $logFile

& "$PSScriptRoot/Upload-Win32Content.ps1" `
    -IntuneWinPath $IntuneWinPath `
    -AppId         $appId `
    -Token         $token `
    -LogFile       $logFile

# ── Write dotenv for downstream jobs ──────────────────────────────────────────
"APP_ID=$appId" | Out-File 'out/app.env' -Encoding ascii -Force
Write-Log "Written out/app.env (APP_ID=$appId)" -LogFile $logFile

Write-Host "✅ Publish complete: $displayName v$vendorVersion ($appId)" -ForegroundColor Green