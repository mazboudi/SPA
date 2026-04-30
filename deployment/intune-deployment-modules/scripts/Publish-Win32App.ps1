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
    [hashtable] $HardwareRequirements = @{},

    [string] $AppJsonPath     = 'windows/intune/app.json',
    [string] $PackageYamlPath = 'windows/package.yaml',
    [switch] $DryRun
)

$ErrorActionPreference = 'Stop'
$GRAPH_BASE = 'https://graph.microsoft.com/beta'

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

# ── BUILD return codes ────────────────────────────────────────────────────────
# Priority: app.json returnCodes array > package.yaml return_codes > defaults
$defaultReturnCodes = @(
    @{ returnCode = 0;    type = 'success' }
    @{ returnCode = 1707; type = 'success' }
    @{ returnCode = 3010; type = 'softReboot' }
    @{ returnCode = 1641; type = 'hardReboot' }
    @{ returnCode = 1618; type = 'retry' }
)

$returnCodes = $defaultReturnCodes

# First check app.json for returnCodes array (new wizard format)
if ($intuneMeta.returnCodes -and $intuneMeta.returnCodes.Count -gt 0) {
    $returnCodes = @()
    foreach ($rc in $intuneMeta.returnCodes) {
        $returnCodes += @{ returnCode = [int]$rc.returnCode; type = $rc.type }
    }
    Write-Log "Using return codes from app.json ($($returnCodes.Count) codes)" -LogFile $logFile
}
# Fallback: package.yaml return_codes (legacy "3010=softReboot" format)
elseif ($pkg.return_codes) {
    $customCodes = @()
    foreach ($entry in ($pkg.return_codes -split ',')) {
        $parts = $entry.Trim() -split '='
        if ($parts.Count -eq 2) {
            $customCodes += @{ returnCode = [int]$parts[0].Trim(); type = $parts[1].Trim() }
        }
    }
    if ($customCodes.Count -gt 0) {
        $returnCodes = $customCodes
        Write-Log "Using custom return codes from package.yaml" -LogFile $logFile
    }
}

# ── READ max install time ─────────────────────────────────────────────────────
$maxInstallTime = if ($pkg.max_install_time) { [int]$pkg.max_install_time } else { 60 }

# ── LOAD logo (if present) ────────────────────────────────────────────────────
$intuneDir = Split-Path $AppJsonPath -Parent
$logoFile  = Get-ChildItem -Path $intuneDir -Filter 'logo.*' -File -ErrorAction SilentlyContinue | Select-Object -First 1
$logoPath  = if ($logoFile) { $logoFile.FullName } else { $null }
$largeIcon = $null
if ($logoPath -and (Test-Path $logoPath)) {
    $logoBytes  = [System.IO.File]::ReadAllBytes((Resolve-Path $logoPath).Path)
    $logoBase64 = [Convert]::ToBase64String($logoBytes)
    # Detect MIME type from extension
    $logoExt = [System.IO.Path]::GetExtension($logoPath).ToLower()
    $logoMime = switch ($logoExt) {
        '.png'  { 'image/png' }
        '.jpg'  { 'image/jpeg' }
        '.jpeg' { 'image/jpeg' }
        '.gif'  { 'image/gif' }
        '.bmp'  { 'image/bmp' }
        default { 'image/png' }
    }
    $largeIcon = @{
        '@odata.type' = '#microsoft.graph.mimeContent'
        type          = $logoMime
        value         = $logoBase64
    }
    Write-Log "Logo loaded: $logoPath ($($logoBytes.Length) bytes, $logoMime)" -LogFile $logFile
} else {
    Write-Log "No logo found at $logoPath — skipping largeIcon" -Level WARN -LogFile $logFile
}

# ── CREATE Win32 app ──────────────────────────────────────────────────────────
$appBody = @{
    '@odata.type' = '#microsoft.graph.win32LobApp'

    # App metadata — all fields from intune/app.json
    displayName            = $displayName
    displayVersion         = $vendorVersion
    publisher              = $intuneMeta.publisher ?? 'Unknown'
    description            = $intuneMeta.description ?? $displayName
    developer              = $intuneMeta.developer ?? ''
    informationUrl         = $intuneMeta.informationUrl ?? ''
    privacyInformationUrl  = $intuneMeta.privacyInformationUrl ?? ''
    owner                  = $intuneMeta.owner ?? ''
    notes                  = $intuneMeta.notes ?? ''
    isFeatured             = if ($intuneMeta.isFeatured -eq $true) { $true } else { $false }
    allowAvailableUninstall = if ($intuneMeta.allowAvailableUninstall -eq $true) { $true } else { $false }

    # REQUIRED CREATE-TIME FIELDS
    fileName      = [System.IO.Path]::GetFileName($IntuneWinPath)
    setupFilePath = 'Invoke-AppDeployToolkit.exe'

    # With the beta endpoint, detectionRules are natively supported.
    detectionRules = @($DetectionRules)

    # Return codes — how Intune interprets installer exit codes
    returnCodes = @($returnCodes)

    # Spread hardware requirements if provided
    minimumFreeDiskSpaceInMB       = if ($HardwareRequirements.minimumFreeDiskSpaceInMB) { $HardwareRequirements.minimumFreeDiskSpaceInMB } else { $null }
    minimumMemoryInMB              = if ($HardwareRequirements.minimumMemoryInMB) { $HardwareRequirements.minimumMemoryInMB } else { $null }
    minimumNumberOfProcessors      = if ($HardwareRequirements.minimumNumberOfProcessors) { $HardwareRequirements.minimumNumberOfProcessors } else { $null }
    minimumCpuSpeedInMHz           = if ($HardwareRequirements.minimumCpuSpeedInMHz) { $HardwareRequirements.minimumCpuSpeedInMHz } else { $null }
    applicableArchitectures        = if ($HardwareRequirements.applicableArchitectures) { $HardwareRequirements.applicableArchitectures } else { 'x64' }
    minimumSupportedWindowsRelease = if ($HardwareRequirements.minimumSupportedWindowsRelease) { $HardwareRequirements.minimumSupportedWindowsRelease } else { 'Windows10_2004' }

    installCommandLine   = $pkg.install_command
    uninstallCommandLine = $pkg.uninstall_command

    installExperience    = @{
        runAsAccount               = $intuneMeta.installContext   ?? 'system'
        deviceRestartBehavior      = $intuneMeta.restartBehavior ?? 'suppress'
        maxRunTimeInMinutes        = $maxInstallTime
    }
}

# Add logo if present (only include the key when we have an icon to avoid null-body issues)
if ($largeIcon) {
    $appBody['largeIcon'] = $largeIcon
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

# ── Set categories (post-creation relationship) ──────────────────────────────
if ($intuneMeta.categories -and $intuneMeta.categories.Count -gt 0) {
    foreach ($catId in $intuneMeta.categories) {
        try {
            Invoke-GraphRequest `
                -Token  $token `
                -Method POST `
                -Uri    "$GRAPH_BASE/deviceAppManagement/mobileApps/$appId/categories/`$ref" `
                -Body   @{ '@odata.id' = "$GRAPH_BASE/deviceAppManagement/mobileAppCategories/$catId" }
            Write-Log "Category assigned: $catId" -LogFile $logFile
        } catch {
            Write-Log "Warning: Could not assign category $catId - $($_.Exception.Message)" WARN -LogFile $logFile
        }
    }
}

# ── Write dotenv for downstream jobs ──────────────────────────────────────────
"APP_ID=$appId" | Out-File 'out/app.env' -Encoding ascii -Force
Write-Log "Written out/app.env (APP_ID=$appId)" -LogFile $logFile

Write-Host "✅ Publish complete: $displayName v$vendorVersion ($appId)" -ForegroundColor Green