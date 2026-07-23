<#
.SYNOPSIS
  Safely removes an Intune Win32 app by first clearing all blocking relationships.

.DESCRIPTION
  Intune prevents deletion of an app that:
    - Has active assignments (especially Uninstall)
    - Is a dependency of another app
    - Participates in a supersedence chain (as superseder or superseded)

  This script follows the correct order:
    1. Clear all assignments   (PATCH mobileApps/{id}/assign)
    2. Clear all relationships (POST mobileApps/{id}/updateRelationships)
    3. DELETE the app

.PARAMETER AppId
  Intune Win32 app GUID to delete.

.PARAMETER Token
  Bearer token for Microsoft Graph.

.PARAMETER LogFile
  Optional path to append log output.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)] [string] $AppId,
    [Parameter(Mandatory)] [string] $Token,
    [string] $LogFile = ''
)

$ErrorActionPreference = 'Stop'
$GRAPH_BASE = 'https://graph.microsoft.com/beta'

Import-Module "$PSScriptRoot/IntuneDeployment.psm1" -Force

function Log([string]$msg, [string]$level = 'INFO') {
    $ts = Get-Date -Format 'HH:mm:ss'
    $line = "[$ts][$level] $msg"
    Write-Host $line
    if ($LogFile) { $line | Out-File $LogFile -Append -Encoding utf8 }
}

Log "Starting safe-delete for app: $AppId"

# ── Step 1: Remove all assignments ──────────────────────────────────────────
# Calling /assign with an empty assignments array clears all groups.
Log "Step 1: Clearing all assignments..."
try {
    Invoke-GraphRequest `
        -Token  $Token `
        -Method POST `
        -Uri    "$GRAPH_BASE/deviceAppManagement/mobileApps/$AppId/assign" `
        -Body   @{ mobileAppAssignments = @() }
    Log "Assignments cleared."
} catch {
    Log "WARNING: Could not clear assignments — $($_.Exception.Message)" WARN
    # Non-fatal: proceed; Intune may allow delete even with stale assignments
    # if the app content was never committed.
}

# ── Step 2: Remove all relationships (supersedence + dependencies) ────────────
# updateRelationships is a replace-all call — sending an empty relationships
# array severs every supersedence and dependency link simultaneously.
Log "Step 2: Clearing all supersedence/dependency relationships..."
try {
    Invoke-GraphRequest `
        -Token  $Token `
        -Method POST `
        -Uri    "$GRAPH_BASE/deviceAppManagement/mobileApps/$AppId/updateRelationships" `
        -Body   @{ relationships = @() }
    Log "Relationships cleared."
} catch {
    Log "WARNING: Could not clear relationships — $($_.Exception.Message)" WARN
    # Non-fatal: Intune may allow delete for apps that were never linked.
}

# ── Step 3: Brief pause so Graph can propagate the relationship changes ───────
Log "Waiting 5 seconds for Graph to propagate relationship changes..."
Start-Sleep -Seconds 5

# ── Step 4: Delete the app ───────────────────────────────────────────────────
Log "Step 3: Deleting app $AppId..."
try {
    Invoke-GraphRequest `
        -Token  $Token `
        -Method DELETE `
        -Uri    "$GRAPH_BASE/deviceAppManagement/mobileApps/$AppId"
    Log "App deleted successfully: $AppId"
} catch {
    $msg = $_.Exception.Message
    # Intune returns 404 if the app was already deleted — treat as success
    if ($msg -match '404|Not Found') {
        Log "App $AppId not found (already deleted) — treating as success." WARN
    } else {
        throw "Failed to delete app $AppId`: $msg"
    }
}

Log "Safe-delete complete for app: $AppId"
