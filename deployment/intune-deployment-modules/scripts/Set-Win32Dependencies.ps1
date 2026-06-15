<#
.SYNOPSIS
  Configures dependency relationships for a Win32 LOB app in Intune via Graph API.

.DESCRIPTION
  Reads windows/intune/dependencies.json and creates or updates the dependency
  relationships for the specified app using the updateRelationships action.

  If the file is missing or contains no valid entries (empty IDs), the script
  exits gracefully with exit code 0.

.PARAMETER AppId
  The Win32 app that depends on other apps.

.PARAMETER DependenciesPath
  Path to windows/intune/dependencies.json.

.EXAMPLE dependencies.json
  [
    {
      "appId": "aaaaaaaa-0000-0000-0000-000000000001",
      "dependencyType": "autoInstall"
    }
  ]

  dependencyType: "autoInstall" (auto-install dependency) | "detect" (detect only, don't auto-install)
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)] [string] $AppId,
    [Parameter(Mandatory)] [string] $TenantId,
    [Parameter(Mandatory)] [string] $ClientId,
    [Parameter(Mandatory)] [string] $ClientSecret,
    [string] $DependenciesPath = 'windows/intune/dependencies.json'
)

$ErrorActionPreference = 'Stop'
# updateRelationships action is beta-only
$GRAPH_BASE = 'https://graph.microsoft.com/beta'

$moduleFile = Join-Path $PSScriptRoot 'IntuneDeployment.psm1'
if (Test-Path $moduleFile) { Import-Module $moduleFile -Force }

if (!(Test-Path $DependenciesPath)) {
    Write-Host "dependencies.json not found — skipping dependency configuration." -ForegroundColor DarkGray
    exit 0
}

$raw = Get-Content $DependenciesPath -Raw | ConvertFrom-Json

# Normalize: support both single object and array format
$deps = @(if ($raw -is [System.Array]) { $raw } else { $raw })

# Filter out entries with empty/missing target IDs
$valid = @($deps | Where-Object {
    $id = $_.appId ?? $_.targetId ?? ''
    $id -and $id.Trim() -ne ''
})

if ($valid.Count -eq 0) {
    Write-Host "No valid dependency entries found — skipping." -ForegroundColor DarkGray
    exit 0
}

Write-Log "Setting $($valid.Count) dependency relationship(s) for app: $AppId"

$token = Get-GraphToken -TenantId $TenantId -ClientId $ClientId -ClientSecret $ClientSecret

# Build the relationships array for the updateRelationships action
$relationships = @()
foreach ($d in $valid) {
    $targetId = $d.appId ?? $d.targetId
    $depType  = $d.dependencyType ?? 'autoInstall'
    $relationships += @{
        '@odata.type'  = '#microsoft.graph.mobileAppDependency'
        targetId       = $targetId
        dependencyType = $depType
    }
    Write-Log "  → $targetId ($depType)"
}

# POST to the updateRelationships action endpoint
$uri = "$GRAPH_BASE/deviceAppManagement/mobileApps/$AppId/updateRelationships"
$body = @{
    relationships = $relationships
}

try {
    Invoke-GraphRequest -Token $token -Method POST -Uri $uri -Body $body | Out-Null
    Write-Log "Dependency relationships applied successfully."
    Write-Host "✅ Dependency configuration complete." -ForegroundColor Green
} catch {
    if ($_.Exception.Message -like '*already exists*') {
        Write-Log "Dependency relationships already exist — skipping." -Level WARN
        Write-Host "✅ Dependencies already configured." -ForegroundColor Green
    } else {
        throw
    }
}
