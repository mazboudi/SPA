<#
.SYNOPSIS
  Sets ALL relationships (supersedence + dependencies) for a Win32 LOB app in
  a SINGLE updateRelationships call.

.DESCRIPTION
  The Graph API updateRelationships action is a REPLACE-ALL operation: each call
  replaces the complete set of relationships on the app.  Calling it twice
  (once for supersedence, once for dependencies) means the second call silently
  discards the first set.

  This script reads both windows/intune/supersedence.json and
  windows/intune/dependencies.json, merges all valid entries into one array,
  and posts them in a single call so both relationship types are preserved.

.PARAMETER AppId
  The Win32 app GUID to set relationships on.

.PARAMETER SupersedencePath
  Path to supersedence.json  (default: windows/intune/supersedence.json)

.PARAMETER DependenciesPath
  Path to dependencies.json  (default: windows/intune/dependencies.json)
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)] [string] $AppId,
    [Parameter(Mandatory)] [string] $TenantId,
    [Parameter(Mandatory)] [string] $ClientId,
    [Parameter(Mandatory)] [string] $ClientSecret,
    [string] $SupersedencePath = 'windows/intune/supersedence.json',
    [string] $DependenciesPath = 'windows/intune/dependencies.json'
)

$ErrorActionPreference = 'Stop'
$GRAPH_BASE = 'https://graph.microsoft.com/beta'   # updateRelationships is beta-only

$moduleFile = Join-Path $PSScriptRoot 'IntuneDeployment.psm1'
if (Test-Path $moduleFile) { Import-Module $moduleFile -Force }

# ── Collect supersedence entries ──────────────────────────────────────────────
$relationships = @()

if (Test-Path $SupersedencePath) {
    $rawS = @(Get-Content $SupersedencePath -Raw | ConvertFrom-Json)
    $validS = @($rawS | Where-Object {
        $id = $_.supersededAppId ?? $_.targetId ?? ''
        $id -and $id.Trim() -ne ''
    })
    foreach ($s in $validS) {
        $targetId = $s.supersededAppId ?? $s.targetId
        $sType    = $s.supersedenceType ?? 'update'
        $relationships += @{
            '@odata.type'    = '#microsoft.graph.mobileAppSupersedence'
            targetId         = $targetId
            supersedenceType = $sType
        }
        Write-Log "  [supersedence] → $targetId ($sType)"
    }
    if ($validS.Count -eq 0) {
        Write-Host "supersedence.json found but no valid entries — skipping supersedence." -ForegroundColor DarkGray
    }
} else {
    Write-Host "supersedence.json not found — skipping supersedence." -ForegroundColor DarkGray
}

# ── Collect dependency entries ─────────────────────────────────────────────────
if (Test-Path $DependenciesPath) {
    $rawD = @(Get-Content $DependenciesPath -Raw | ConvertFrom-Json)
    $validD = @($rawD | Where-Object {
        $id = $_.appId ?? $_.targetId ?? ''
        $id -and $id.Trim() -ne ''
    })
    foreach ($d in $validD) {
        $targetId = $d.appId ?? $d.targetId
        $depType  = $d.dependencyType ?? 'autoInstall'
        $relationships += @{
            '@odata.type'  = '#microsoft.graph.mobileAppDependency'
            targetId       = $targetId
            dependencyType = $depType
        }
        Write-Log "  [dependency]   → $targetId ($depType)"
    }
    if ($validD.Count -eq 0) {
        Write-Host "dependencies.json found but no valid entries — skipping dependencies." -ForegroundColor DarkGray
    }
} else {
    Write-Host "dependencies.json not found — skipping dependencies." -ForegroundColor DarkGray
}

# ── Nothing to do ─────────────────────────────────────────────────────────────
if ($relationships.Count -eq 0) {
    Write-Host "No relationship entries found — skipping updateRelationships." -ForegroundColor DarkGray
    exit 0
}

# ── Single POST — all relationships in one call ───────────────────────────────
Write-Log "Setting $($relationships.Count) relationship(s) for app: $AppId"
Write-Log "  ($(@($relationships | Where-Object { $_.'@odata.type' -like '*Supersedence*' }).Count) supersedence, $(@($relationships | Where-Object { $_.'@odata.type' -like '*Dependency*' }).Count) dependenc$(if ($relationships.Count -eq 1) {'y'} else {'ies'}))"

$token = Get-GraphToken -TenantId $TenantId -ClientId $ClientId -ClientSecret $ClientSecret

$uri  = "$GRAPH_BASE/deviceAppManagement/mobileApps/$AppId/updateRelationships"
$body = @{ relationships = $relationships }

try {
    Invoke-GraphRequest -Token $token -Method POST -Uri $uri -Body $body | Out-Null
    Write-Log "All relationships applied successfully."
    Write-Host "✅ Relationships configured: $($relationships.Count) total." -ForegroundColor Green
} catch {
    if ($_.Exception.Message -like '*already exists*') {
        Write-Log "Relationships already exist — skipping." -Level WARN
        Write-Host "✅ Relationships already configured." -ForegroundColor Green
    } else {
        throw
    }
}
