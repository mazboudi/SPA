<#
.SYNOPSIS
  Uploads the encrypted .intunewin binary to an existing Intune Win32 app via
  Microsoft Graph API + Azure Blob Storage.

.DESCRIPTION
  The Microsoft Graph API Win32 content upload flow has 8 steps:
    1. Parse   — Extract encryption metadata from Detection.xml inside the .intunewin ZIP
    2. Version — POST contentVersions  →  get contentVersionId
    3. File    — POST .../files         →  get fileId + placeholder for Azure URI
    4. Poll    — GET  .../files/{id}   until uploadState == azureStorageUriRequestSuccess
    5. Upload  — PUT encrypted chunks to Azure Blob Storage (6 MB blocks)
    6. Commit  — PUT comp=blocklist    →  finalise the Azure blob
    7. commit  — POST .../commitContent with fileEncryptionInfo from Detection.xml
    8. Poll    — GET  .../files/{id}   until uploadState == commitFilesSuccess
    9. Activate— PATCH app with committedContentVersion = contentVersionId

.PARAMETER IntuneWinPath
  Path to the .intunewin file produced by IntuneWinAppUtil.exe.

.PARAMETER AppId
  The Intune app GUID returned by Publish-Win32App.ps1.

.PARAMETER Token
  A valid Microsoft Graph Bearer token (acquired by Get-GraphToken).

.PARAMETER LogFile
  Path to the running publish log (default: out/publish-logs/publish.log).
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory)] [string] $IntuneWinPath,
    [Parameter(Mandatory)] [string] $AppId,
    [Parameter(Mandatory)] [string] $Token,
    [string] $LogFile = 'out/publish-logs/publish.log'
)

$ErrorActionPreference = 'Stop'
$GRAPH_BASE  = 'https://graph.microsoft.com/beta'
$WIN32_TYPE  = 'microsoft.graph.win32LobApp'
$CHUNK_SIZE  = 6 * 1024 * 1024    # 6 MB — recommended Azure Blob block size
$MAX_WAIT    = 30                  # max polls (5 s each = 2.5 min)

Import-Module "$PSScriptRoot/IntuneDeployment.psm1" -Force

if (!(Test-Path $IntuneWinPath)) {
    throw "Upload-Win32Content: .intunewin file not found: $IntuneWinPath"
}
# Resolve to absolute path — .NET methods resolve relative paths against the
# process working directory, not PowerShell's $PWD, which breaks in CI runners.
$IntuneWinPath = (Resolve-Path $IntuneWinPath).Path

# ─────────────────────────────────────────────────────────────────────────────
# Step 1 – Parse Detection.xml from the .intunewin ZIP
# ─────────────────────────────────────────────────────────────────────────────
Write-Log "Parsing .intunewin metadata: $IntuneWinPath" -LogFile $LogFile

Add-Type -AssemblyName System.IO.Compression.FileSystem

$zip = [System.IO.Compression.ZipFile]::OpenRead($IntuneWinPath)
try {
    # Detection.xml contains encryption keys + file sizes
    $detEntry = $zip.Entries | Where-Object { $_.Name -eq 'Detection.xml' } | Select-Object -First 1
    if (-not $detEntry) { throw ".intunewin is corrupt: Detection.xml not found" }

    $detReader = [System.IO.StreamReader]::new($detEntry.Open())
    [xml]$detXml = $detReader.ReadToEnd()
    $detReader.Dispose()

    # IntunePackage.intunewin is the AES-256 encrypted app content
    $pkgEntry = $zip.Entries | Where-Object { $_.Name -eq 'IntunePackage.intunewin' } | Select-Object -First 1
    if (-not $pkgEntry) { throw ".intunewin is corrupt: IntunePackage.intunewin not found" }

    $encryptedSize = $pkgEntry.Length
} finally {
    $zip.Dispose()
}

# PowerShell [xml] accesses default-namespace nodes transparently via property chain
$appInfo        = $detXml.ApplicationInfo
$enc            = $appInfo.EncryptionInfo
$unencryptedSize = [long]$appInfo.UnencryptedContentSize

Write-Log "  Package       : $($appInfo.Name)" -LogFile $LogFile
Write-Log "  Unencrypted   : $unencryptedSize bytes" -LogFile $LogFile
Write-Log "  Encrypted     : $encryptedSize bytes" -LogFile $LogFile

# fileEncryptionInfo posted to Graph to commit the upload
$fileEncryptionInfo = @{
    encryptionKey        = $enc.EncryptionKey
    initializationVector = $enc.InitializationVector
    mac                  = $enc.Mac
    macKey               = $enc.MacKey
    profileIdentifier    = 'ProfileVersion1'
    fileDigest           = $enc.FileDigest
    fileDigestAlgorithm  = 'SHA256'
}

# ─────────────────────────────────────────────────────────────────────────────
# Step 2 – Create a content version
# ─────────────────────────────────────────────────────────────────────────────
Write-Log "Creating content version for app $AppId..." -LogFile $LogFile

$cv   = Invoke-GraphRequest -Token $Token -Method POST `
    -Uri  "$GRAPH_BASE/deviceAppManagement/mobileApps/$AppId/$WIN32_TYPE/contentVersions" `
    -Body @{}
$cvId = $cv.id
Write-Log "  Content version: $cvId" -LogFile $LogFile

# ─────────────────────────────────────────────────────────────────────────────
# Step 3 – Register file entry (triggers Azure Blob URI generation)
# ─────────────────────────────────────────────────────────────────────────────
Write-Log "Registering file upload request..." -LogFile $LogFile

$fileReg = Invoke-GraphRequest -Token $Token -Method POST `
    -Uri  "$GRAPH_BASE/deviceAppManagement/mobileApps/$AppId/$WIN32_TYPE/contentVersions/$cvId/files" `
    -Body @{
        name          = [System.IO.Path]::GetFileName($IntuneWinPath)
        size          = $unencryptedSize
        sizeEncrypted = $encryptedSize
        isDependency  = $false
        manifest      = $null
    }
$fileId = $fileReg.id
Write-Log "  File entry ID: $fileId" -LogFile $LogFile

# ─────────────────────────────────────────────────────────────────────────────
# Step 4 – Poll until Azure Blob Storage URI is ready
# ─────────────────────────────────────────────────────────────────────────────
Write-Log "Waiting for Azure Storage URI (up to $($MAX_WAIT * 5)s)..." -LogFile $LogFile

$azureUri  = $null
$fileStatus = $null
for ($i = 1; $i -le $MAX_WAIT; $i++) {
    Start-Sleep -Seconds 5
    $fileStatus = Invoke-GraphRequest -Token $Token -Method GET `
        -Uri "$GRAPH_BASE/deviceAppManagement/mobileApps/$AppId/$WIN32_TYPE/contentVersions/$cvId/files/$fileId"

    Write-Log "  [$i/$MAX_WAIT] uploadState: $($fileStatus.uploadState)" -LogFile $LogFile

    if ($fileStatus.uploadState -eq 'azureStorageUriRequestSuccess') {
        $azureUri = $fileStatus.azureStorageUri
        break
    }
    if ($fileStatus.uploadState -eq 'azureStorageUriRequestFailed') {
        throw "Graph: Azure Storage URI request failed (fileId: $fileId)"
    }
}
if (-not $azureUri) {
    throw "Timed out waiting for Azure Storage URI after $MAX_WAIT attempts"
}
Write-Log "  Azure Storage URI obtained" -LogFile $LogFile

# ─────────────────────────────────────────────────────────────────────────────
# Step 5 – Upload encrypted content to Azure Blob Storage in 6 MB chunks
# ─────────────────────────────────────────────────────────────────────────────
Write-Log "Uploading encrypted content to Azure Blob Storage..." -LogFile $LogFile

$blockIds  = [System.Collections.Generic.List[string]]::new()
$uploadZip = [System.IO.Compression.ZipFile]::OpenRead($IntuneWinPath)
try {
    $pkgStream = ($uploadZip.Entries |
        Where-Object { $_.Name -eq 'IntunePackage.intunewin' } |
        Select-Object -First 1).Open()

    $buffer    = [byte[]]::new($CHUNK_SIZE)
    $blockIdx  = 0

    while (($bytesRead = $pkgStream.Read($buffer, 0, $CHUNK_SIZE)) -gt 0) {
        # Block IDs must be base64-encoded and all the same byte length.
        # Using 6-digit zero-padded decimal avoids base64 padding ('=') ambiguity.
        $blockId  = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($blockIdx.ToString('D6')))
        $blockIds.Add($blockId)

        $chunk    = $buffer[0..($bytesRead - 1)]
        $blockUri = "${azureUri}&comp=block&blockid=$([Uri]::EscapeDataString($blockId))"

        Invoke-RestMethod -Method Put -Uri $blockUri `
            -Body $chunk `
            -ContentType 'application/octet-stream'

        Write-Log "  Block $blockIdx — $bytesRead bytes uploaded" -LogFile $LogFile
        $blockIdx++
    }
    $pkgStream.Dispose()
} finally {
    $uploadZip.Dispose()
}

# ─────────────────────────────────────────────────────────────────────────────
# Step 6 – Commit the Azure Blob block list
# ─────────────────────────────────────────────────────────────────────────────
Write-Log "Committing $($blockIds.Count) blocks to Azure Blob..." -LogFile $LogFile

$blockListXml  = '<?xml version="1.0" encoding="utf-8"?><BlockList>'
$blockListXml += ($blockIds | ForEach-Object { "<Latest>$_</Latest>" }) -join ''
$blockListXml += '</BlockList>'

Invoke-RestMethod -Method Put -Uri "${azureUri}&comp=blocklist" `
    -Body $blockListXml `
    -ContentType 'text/plain; charset=utf-8'

Write-Log "  Azure Blob committed" -LogFile $LogFile

# ─────────────────────────────────────────────────────────────────────────────
# Step 7 – Commit file upload in Graph (supply encryption info from Detection.xml)
# ─────────────────────────────────────────────────────────────────────────────
Write-Log "Committing file in Graph API with encryption metadata..." -LogFile $LogFile

Invoke-GraphRequest -Token $Token -Method POST `
    -Uri  "$GRAPH_BASE/deviceAppManagement/mobileApps/$AppId/$WIN32_TYPE/contentVersions/$cvId/files/$fileId/commit" `
    -Body @{ fileEncryptionInfo = $fileEncryptionInfo }

# ─────────────────────────────────────────────────────────────────────────────
# Step 8 – Poll until commit succeeds
# ─────────────────────────────────────────────────────────────────────────────
Write-Log "Waiting for Graph commit (up to $($MAX_WAIT * 5)s)..." -LogFile $LogFile

$fileStatus = $null
for ($i = 1; $i -le $MAX_WAIT; $i++) {
    Start-Sleep -Seconds 5
    $fileStatus = Invoke-GraphRequest -Token $Token -Method GET `
        -Uri "$GRAPH_BASE/deviceAppManagement/mobileApps/$AppId/$WIN32_TYPE/contentVersions/$cvId/files/$fileId"

    Write-Log "  [$i/$MAX_WAIT] uploadState: $($fileStatus.uploadState)" -LogFile $LogFile

    if ($fileStatus.uploadState -eq 'commitFilesSuccess') { break }
    if ($fileStatus.uploadState -eq 'commitFilesFailed')  {
        throw "Graph: file commit failed (uploadState: $($fileStatus.uploadState))"
    }
}
if ($fileStatus.uploadState -ne 'commitFilesSuccess') {
    throw "Timed out waiting for file commit. Last state: $($fileStatus.uploadState)"
}

# ─────────────────────────────────────────────────────────────────────────────
# Step 9 – Activate: link the committed version to the app
# ─────────────────────────────────────────────────────────────────────────────
Write-Log "Activating content version $cvId on app $AppId..." -LogFile $LogFile

Invoke-GraphRequest -Token $Token -Method PATCH `
    -Uri  "$GRAPH_BASE/deviceAppManagement/mobileApps/$AppId" `
    -Body @{
        '@odata.type'           = '#microsoft.graph.win32LobApp'
        committedContentVersion = $cvId
    }

Write-Log "✅ Content upload complete — app: $AppId, contentVersion: $cvId" -LogFile $LogFile
Write-Host "✅ Upload complete: $AppId (contentVersion: $cvId)" -ForegroundColor Green
