<#
.SYNOPSIS
  Configures supersedence relationships for a Win32 LOB app in Intune via Graph API.

.DESCRIPTION
  Reads windows/intune/supersedence.json and creates or updates the supersedence
  relationships for the specified app.

.PARAMETER AppId
  The Win32 app to set supersedence on.

.PARAMETER SupersedencePath
  Path to windows/intune/supersedence.json.

.EXAMPLE supersedence.json
  [
    {
      "supersededAppId": "bbbbbbbb-0000-0000-0000-000000000001",
      "supersedenceType": "replace",
      "isCircularSupersedence": false
    }
  ]
  Note: supersedenceType values: "replace" | "update"
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
$GRAPH_BASE = 'https://graph.microsoft.com/v1.0'

$moduleFile = Join-Path $PSScriptRoot 'IntuneDeployment.psm1'
if (Test-Path $moduleFile) { Import-Module $moduleFile -Force }

if (!(Test-Path $SupersedencePath)) {
    Write-Warning "supersedence.json not found: $SupersedencePath — skipping."
    exit 0
}

$supersedences = Get-Content $SupersedencePath -Raw | ConvertFrom-Json
Write-Log "Setting $(@($supersedences).Count) supersedence relationship(s) for app: $AppId"

$token = Get-GraphToken -TenantId $TenantId -ClientId $ClientId -ClientSecret $ClientSecret

foreach ($s in $supersedences) {
    $body = @{
        '@odata.type'          = '#microsoft.graph.mobileAppSupersedence'
        supersededAppId        = $s.supersededAppId
        supersedenceType       = $s.supersedenceType ?? 'replace'
        isCircularSupersedence = $s.isCircularSupersedence ?? $false
    }

    $uri = "$GRAPH_BASE/deviceAppManagement/mobileApps/$AppId/relationships"
    try {
        Invoke-GraphRequest -Token $token -Method POST -Uri $uri -Body $body | Out-Null
        Write-Log "Supersedence created: $($s.supersededAppId) => $($s.supersedenceType)"
    } catch {
        if ($_.Exception.Message -like '*already exists*') {
            Write-Log "Supersedence already exists for $($s.supersededAppId) — skipping." -Level WARN
        } else { throw }
    }
}

Write-Host "✅ Supersedence configuration complete." -ForegroundColor Green
