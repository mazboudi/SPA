<#
.SYNOPSIS
  Configures supersedence relationships for a Win32 LOB app in Intune via Graph API.

.DESCRIPTION
  Reads windows/intune/supersedence.json and creates or updates the supersedence
  relationships for the specified app.

  If the file is missing or contains no valid entries (empty IDs), the script
  exits gracefully with exit code 0.

.PARAMETER AppId
  The Win32 app to set supersedence on.

.PARAMETER SupersedencePath
  Path to windows/intune/supersedence.json.

.EXAMPLE supersedence.json
  {
    "supersededAppId": "bbbbbbbb-0000-0000-0000-000000000001",
    "supersedenceType": "replace"
  }
  Note: supersedenceType values: "replace" | "update"
  The "supersededAppId" field maps to "targetId" in the Graph API call.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)] [string] $AppId,
    [Parameter(Mandatory)] [string] $TenantId,
    [Parameter(Mandatory)] [string] $ClientId,
    [Parameter(Mandatory)] [string] $ClientSecret,
    [string] $SupersedencePath = 'windows/intune/supersedence.json'
)

$ErrorActionPreference = 'Stop'
# Relationships API is beta-only
$GRAPH_BASE = 'https://graph.microsoft.com/beta'

$moduleFile = Join-Path $PSScriptRoot 'IntuneDeployment.psm1'
if (Test-Path $moduleFile) { Import-Module $moduleFile -Force }

if (!(Test-Path $SupersedencePath)) {
    Write-Host "supersedence.json not found — skipping supersedence configuration." -ForegroundColor DarkGray
    exit 0
}

$raw = Get-Content $SupersedencePath -Raw | ConvertFrom-Json

# Normalize: support both single object and array format
$supersedences = @(if ($raw -is [System.Array]) { $raw } else { $raw })

# Filter out entries with empty/missing target IDs
$valid = @($supersedences | Where-Object {
    $id = $_.supersededAppId ?? $_.targetId ?? ''
    $id -and $id.Trim() -ne ''
})

if ($valid.Count -eq 0) {
    Write-Host "No valid supersedence entries found — skipping." -ForegroundColor DarkGray
    exit 0
}

Write-Log "Setting $($valid.Count) supersedence relationship(s) for app: $AppId"

$token = Get-GraphToken -TenantId $TenantId -ClientId $ClientId -ClientSecret $ClientSecret

foreach ($s in $valid) {
    # Support both 'supersededAppId' (our file format) and 'targetId' (Graph API)
    $targetId = $s.supersededAppId ?? $s.targetId

    $body = @{
        '@odata.type'    = '#microsoft.graph.mobileAppSupersedence'
        targetId         = $targetId
        supersedenceType = $s.supersedenceType ?? 'update'
    }

    $uri = "$GRAPH_BASE/deviceAppManagement/mobileApps/$AppId/relationships"
    try {
        Invoke-GraphRequest -Token $token -Method POST -Uri $uri -Body $body | Out-Null
        Write-Log "Supersedence created: $targetId => $($body.supersedenceType)"
    } catch {
        if ($_.Exception.Message -like '*already exists*') {
            Write-Log "Supersedence already exists for $targetId — skipping." -Level WARN
        } else { throw }
    }
}

Write-Host "✅ Supersedence configuration complete." -ForegroundColor Green
