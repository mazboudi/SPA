<#
.SYNOPSIS
  Creates or updates a Win32 LOB application in Microsoft Intune via the
  Microsoft Graph API and uploads the .intunewin file content.

.DESCRIPTION
  Full Graph API implementation:
    1. Reads Intune metadata from windows/intune/app.json + windows/package.yaml
    2. Checks for an existing app by displayName + version
    3. Creates the Win32LobApp entry (POST mobileApps) or patches it (PATCH)
    4. Requests a content-upload session
    5. Reads the encryption metadata embedded in the .intunewin file
    6. Chunk-uploads to the Azure Blob SAS URL
    7. Commits the content version
    8. Writes APP_ID to out/app.env (dotenv for the assign job)

.PARAMETER IntuneWinPath
  Path to the .intunewin artifact from the build job.

.PARAMETER AppJsonPath
  Path to windows/intune/app.json — Intune display metadata.

.PARAMETER PackageYamlPath
  Path to windows/package.yaml — install/uninstall commands and detection mode.

.PARAMETER DetectionRules
  Array of detection rule objects (from Resolve-DetectionRules.ps1).

.PARAMETER RequirementRules
  Array of requirement rule objects (from Resolve-Requirements.ps1). Optional.

.PARAMETER TenantId / ClientId / ClientSecret
  Graph API credentials.

.PARAMETER DryRun
  If $true, authenticates and validates but does NOT write to Graph.

.OUTPUTS
  out/app.env — contains APP_ID=<guid>
  out/publish-logs/publish.log
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory)] [string]   $IntuneWinPath,
    [Parameter(Mandatory)] [string]   $AppJsonPath        = 'windows/intune/app.json',
    [Parameter(Mandatory)] [string]   $PackageYamlPath    = 'windows/package.yaml',
    [Parameter(Mandatory)] [string]   $TenantId,
    [Parameter(Mandatory)] [string]   $ClientId,
    [Parameter(Mandatory)] [string]   $ClientSecret,
    [object[]]                         $DetectionRules     = @(),
    [object[]]                         $RequirementRules   = @(),
    [switch]                           $DryRun
)

$ErrorActionPreference = 'Stop'
$GRAPH_BASE = 'https://graph.microsoft.com/v1.0'

# ── Setup logging ────────────────────────────────────────────────────────────
$logDir  = 'out/publish-logs'
$outDir  = 'out'
if (!(Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }
if (!(Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }
$logFile = Join-Path $logDir 'publish.log'

# Import shared module (same directory as this script in CI)
$moduleFile = Join-Path $PSScriptRoot 'IntuneDeployment.psm1'
if (Test-Path $moduleFile) { Import-Module $moduleFile -Force }

function Log([string] $m, [string] $l = 'INFO') { Write-Log -Message $m -Level $l -LogFile $logFile }

# ── Validate inputs ───────────────────────────────────────────────────────────
if (!(Test-Path $IntuneWinPath)) { throw "IntuneWin not found: $IntuneWinPath" }
if (!(Test-Path $AppJsonPath))   { throw "app.json not found: $AppJsonPath"    }
if (!(Test-Path $PackageYamlPath)) { throw "package.yaml not found: $PackageYamlPath" }

Log "IntuneWinPath : $IntuneWinPath"
Log "AppJsonPath   : $AppJsonPath"
Log "DryRun        : $DryRun"

# ── Parse metadata ────────────────────────────────────────────────────────────
$intuneMeta  = Get-Content $AppJsonPath   -Raw | ConvertFrom-Json
$packageYaml = Get-Content $PackageYamlPath -Raw

$displayName     = $intuneMeta.displayName
$publisher       = $intuneMeta.publisher        ?? 'Unknown'
$installCtx      = $intuneMeta.installContext   ?? 'system'
$restartBehavior = $intuneMeta.restartBehavior  ?? 'suppress'
$maxRuntime      = [int]($intuneMeta.maxRuntimeMinutes ?? 60)

# Parse package.yaml scalars
function Read-YamlScalar([string] $yaml, [string] $key) {
    if ($yaml -match "(?m)^${key}:\s*['\"]?([^'\"\r\n]+)['\"]?") {
        return $Matches[1].Trim()
    }
    return $null
}
$vendorVersion  = Read-YamlScalar $packageYaml 'vendor_version'
$installCmd     = Read-YamlScalar $packageYaml 'install_command'
$uninstallCmd   = Read-YamlScalar $packageYaml 'uninstall_command'
$installerType  = Read-YamlScalar $packageYaml 'installer_type'

Log "App           : $displayName v$vendorVersion"
Log "Install type  : $installerType"
Log "Install cmd   : $installCmd"

# ── Authenticate ──────────────────────────────────────────────────────────────
$token = Get-GraphToken -TenantId $TenantId -ClientId $ClientId -ClientSecret $ClientSecret

if ($DryRun) {
    Log "DRY RUN: would create/update '$displayName' in Intune. Exiting." -l WARN
    "APP_ID=DRY-RUN-SKIPPED" | Out-File (Join-Path $outDir 'app.env') -Encoding ascii -Force
    exit 0
}

# ── Check for existing app ────────────────────────────────────────────────────
Log "Checking for existing Win32LobApp: $displayName..."
$filter     = [uri]::EscapeDataString("displayName eq '$displayName' and isOf('microsoft.graph.win32LobApp')")
$searchUri  = "$GRAPH_BASE/deviceAppManagement/mobileApps?`$filter=$filter&`$select=id,displayName,displayVersion"
$existing   = Invoke-GraphRequest -Token $token -Method GET -Uri $searchUri

$existingApp = @($existing.value) | Select-Object -First 1

# ── Build Win32LobApp body ────────────────────────────────────────────────────
$appBody = @{
    '@odata.type'                  = '#microsoft.graph.win32LobApp'
    displayName                    = $displayName
    description                    = $intuneMeta.description ?? $displayName
    publisher                      = $publisher
    displayVersion                 = $vendorVersion
    installCommandLine             = $installCmd
    uninstallCommandLine           = $uninstallCmd
    privacyInformationUrl          = $intuneMeta.privacyUrl ?? $null
    isFeatured                     = $false
    installExperience = @{
        runAsAccount         = $installCtx
        deviceRestartBehavior = $restartBehavior
    }
    minimumSupportedWindowsRelease = $intuneMeta.minimumWindowsRelease ?? '1903'
    msiInformation                 = $null
}

if ($DetectionRules.Count -gt 0) {
    $appBody['detectionRules'] = $DetectionRules
}
if ($RequirementRules.Count -gt 0) {
    $appBody['requirementRules'] = $RequirementRules
}

# ── Create or update the app entry ───────────────────────────────────────────
if ($existingApp) {
    $appId = $existingApp.id
    Log "Updating existing app: $appId"
    $patchUri = "$GRAPH_BASE/deviceAppManagement/mobileApps/$appId"
    Invoke-GraphRequest -Token $token -Method PATCH -Uri $patchUri -Body $appBody | Out-Null
    Log "App metadata updated."
} else {
    Log "Creating new Win32LobApp..."
    $createUri = "$GRAPH_BASE/deviceAppManagement/mobileApps"
    $created   = Invoke-GraphRequest -Token $token -Method POST -Uri $createUri -Body $appBody
    $appId     = $created.id
    Log "App created: $appId"
}

# ── Request content version ───────────────────────────────────────────────────
Log "Requesting content version for app $appId..."
$cvUri  = "$GRAPH_BASE/deviceAppManagement/mobileApps/$appId/microsoft.graph.win32LobApp/contentVersions"
$cv     = Invoke-GraphRequest -Token $token -Method POST -Uri $cvUri -Body @{}
$cvId   = $cv.id
Log "Content version created: $cvId"

# ── Read .intunewin encryption metadata ──────────────────────────────────────
# The .intunewin file is a ZIP that contains Detection.xml with encryption info.
# We parse it to get encryptedHash, initializationVector, etc.
Log "Reading .intunewin encryption metadata..."
Add-Type -AssemblyName System.IO.Compression.FileSystem
$intuneZip = [System.IO.Compression.ZipFile]::OpenRead((Resolve-Path $IntuneWinPath))
try {
    $xmlEntry = $intuneZip.Entries | Where-Object { $_.Name -eq 'Detection.xml' }
    if (-not $xmlEntry) { throw '.intunewin does not contain Detection.xml' }
    $reader  = [System.IO.StreamReader]::new($xmlEntry.Open())
    $xmlText = $reader.ReadToEnd()
    $reader.Close()
} finally {
    $intuneZip.Dispose()
}

[xml] $detection = $xmlText
$encryptedFile   = $detection.ApplicationInfo.EncryptedContentFile
$fileEncInfo     = $detection.ApplicationInfo.FileEncryptionInfo

# ── Create file content entry ─────────────────────────────────────────────────
$fileSize  = (Get-Item $IntuneWinPath).Length
$sha256Hex = (Get-FileHash -Path (Resolve-Path $IntuneWinPath) -Algorithm SHA256).Hash.ToLower()

$fileBody = @{
    '@odata.type'       = '#microsoft.graph.mobileAppContentFile'
    name                = Split-Path $IntuneWinPath -Leaf
    size                = $fileSize
    sizeEncrypted       = $fileSize
    isDependency        = $false
}

$filesUri    = "$GRAPH_BASE/deviceAppManagement/mobileApps/$appId/microsoft.graph.win32LobApp/contentVersions/$cvId/files"
$fileCreated = Invoke-GraphRequest -Token $token -Method POST -Uri $filesUri -Body $fileBody
$fileId      = $fileCreated.id
Log "Content file entry created: $fileId"

# ── Wait for Azure Blob SAS URI ───────────────────────────────────────────────
Log "Waiting for Azure Blob SAS URI..."
$fileGetUri = "$filesUri/$fileId"
$sasUri     = $null
$maxWait    = 60  # seconds
$elapsed    = 0
while (-not $sasUri -and $elapsed -lt $maxWait) {
    Start-Sleep -Seconds 5
    $elapsed += 5
    $fileStatus = Invoke-GraphRequest -Token $token -Method GET -Uri $fileGetUri
    if ($fileStatus.uploadState -eq 'azureStorageUriRequestSuccess') {
        $sasUri = $fileStatus.azureStorageUri
    } elseif ($fileStatus.uploadState -like '*Fail*') {
        throw "Azure storage URI request failed: $($fileStatus.uploadState)"
    }
}
if (-not $sasUri) { throw "Timed out waiting for SAS URI after $maxWait seconds" }
Log "SAS URI received."

# ── Chunk-upload to Azure Blob ────────────────────────────────────────────────
Log "Uploading .intunewin to Azure Blob ($fileSize bytes)..."
$chunkSize   = 6 * 1024 * 1024  # 6 MB chunks (Azure Blob block upload max: 100 MB)
$fileStream  = [System.IO.File]::OpenRead((Resolve-Path $IntuneWinPath))
$blockIds    = [System.Collections.Generic.List[string]]::new()
$buffer      = New-Object byte[] $chunkSize
$blockIndex  = 0

try {
    while (($read = $fileStream.Read($buffer, 0, $chunkSize)) -gt 0) {
        $blockId = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($blockIndex.ToString('D6')))
        $blockIds.Add($blockId)

        $chunk      = if ($read -lt $chunkSize) { $buffer[0..($read-1)] } else { $buffer }
        $chunkUri   = "$sasUri&comp=block&blockid=$([uri]::EscapeDataString($blockId))"

        $ms = [System.IO.MemoryStream]::new($chunk)
        Invoke-WebRequest -Method Put -Uri $chunkUri -Body $ms.ToArray() `
            -ContentType 'application/octet-stream' | Out-Null
        $ms.Dispose()

        $blockIndex++
        $uploadedMb = [math]::Round($blockIndex * $chunkSize / 1MB, 1)
        Write-Host "  Uploaded block $blockIndex ($uploadedMb MB)" -ForegroundColor Gray
    }
} finally {
    $fileStream.Close()
}

# Commit the block list
$blockListXml = "<?xml version='1.0'?><BlockList>" +
    ($blockIds | ForEach-Object { "<Latest>$_</Latest>" }) +
    "</BlockList>"
$commitUri = "$sasUri&comp=blocklist"
Invoke-WebRequest -Method Put -Uri $commitUri -Body $blockListXml `
    -ContentType 'application/xml' | Out-Null
Log "Block list committed ($blockIndex blocks)."

# ── Commit content version ────────────────────────────────────────────────────
Log "Committing content version..."
$encBody = @{
    fileEncryptionInfo = @{
        encryptionKey        = $fileEncInfo.EncryptionKey
        initializationVector = $fileEncInfo.InitializationVector
        mac                  = $fileEncInfo.Mac
        macKey               = $fileEncInfo.MacKey
        profileIdentifier    = 'ProfileVersion1'
        fileDigest           = $fileEncInfo.FileDigest
        fileDigestAlgorithm  = 'SHA256'
    }
}
$encUri = "$GRAPH_BASE/deviceAppManagement/mobileApps/$appId/microsoft.graph.win32LobApp/contentVersions/$cvId/files/$fileId/commit"
Invoke-GraphRequest -Token $token -Method POST -Uri $encUri -Body $encBody | Out-Null

# Wait for commit to complete
$commitDone  = $false
$elapsed     = 0
while (-not $commitDone -and $elapsed -lt 120) {
    Start-Sleep -Seconds 5
    $elapsed += 5
    $st = Invoke-GraphRequest -Token $token -Method GET -Uri $fileGetUri
    if ($st.uploadState -eq 'commitFileSuccess') { $commitDone = $true }
    elseif ($st.uploadState -like '*Fail*') { throw "Content commit failed: $($st.uploadState)" }
}
if (-not $commitDone) { throw "Timed out waiting for content commit." }
Log "Content version committed."

# ── Assign committed content to the app ──────────────────────────────────────
Log "Attaching content version $cvId to app $appId..."
$assignCvBody = @{ committedContentVersion = $cvId }
$patchUri = "$GRAPH_BASE/deviceAppManagement/mobileApps/$appId"
Invoke-GraphRequest -Token $token -Method PATCH -Uri $patchUri -Body $assignCvBody | Out-Null
Log "Content version attached."

# ── Write output dotenv ───────────────────────────────────────────────────────
$appEnvPath = Join-Path $outDir 'app.env'
"APP_ID=$appId`nCONTENT_VERSION_ID=$cvId" | Out-File $appEnvPath -Encoding ascii -Force
Log "Dotenv written: $appEnvPath"

Write-Host ""
Write-Host "✅ Publish complete: $displayName (APP_ID=$appId)" -ForegroundColor Green
