<#
.SYNOPSIS
  Assigns a Win32 LOB app to Azure AD groups in Microsoft Intune via Graph API.

.PARAMETER AppId
  The Intune Win32 app ID (from Publish-Win32App.ps1 / out/app.env APP_ID).

.PARAMETER AssignmentsPath
  Path to windows/intune/assignments.json.

.PARAMETER TenantId / ClientId / ClientSecret
  Graph API credentials.

.PARAMETER DryRun
  If $true, validates and logs, but does NOT call Graph.

.EXAMPLE assignments.json
  [
    { "groupId": "aaaaaaaa-0000-0000-0000-000000000001", "intent": "required",    "filter": null },
    { "groupId": "aaaaaaaa-0000-0000-0000-000000000002", "intent": "available",   "filter": null },
    { "groupId": "aaaaaaaa-0000-0000-0000-000000000003", "intent": "uninstall",   "filter": null }
  ]
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)] [string] $AppId,
    [Parameter(Mandatory)] [string] $AssignmentsPath = 'windows/intune/assignments.json',
    [Parameter(Mandatory)] [string] $TenantId,
    [Parameter(Mandatory)] [string] $ClientId,
    [Parameter(Mandatory)] [string] $ClientSecret,
    [switch] $DryRun
)

$ErrorActionPreference = 'Stop'
$GRAPH_BASE = 'https://graph.microsoft.com/v1.0'

$logDir  = 'out/assign-logs'
if (!(Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }
$logFile = Join-Path $logDir 'assign.log'

$moduleFile = Join-Path $PSScriptRoot 'IntuneDeployment.psm1'
if (Test-Path $moduleFile) { Import-Module $moduleFile -Force }
function Log([string]$m, [string]$l='INFO') { Write-Log -Message $m -Level $l -LogFile $logFile }

if (!(Test-Path $AssignmentsPath)) { throw "assignments.json not found: $AssignmentsPath" }

$assignments = Get-Content $AssignmentsPath -Raw | ConvertFrom-Json
Log "Loading $(@($assignments).Count) assignment(s) for app: $AppId"

if ($DryRun) {
    foreach ($a in $assignments) { Log "DRY RUN: would assign groupId=$($a.groupId) intent=$($a.intent)" -l WARN }
    exit 0
}

$token = Get-GraphToken -TenantId $TenantId -ClientId $ClientId -ClientSecret $ClientSecret

# Build Graph assignment body
$assignBody = @{
    mobileAppAssignments = @(
        foreach ($a in $assignments) {
            @{
                '@odata.type' = '#microsoft.graph.mobileAppAssignment'
                target        = @{
                    '@odata.type' = '#microsoft.graph.groupAssignmentTarget'
                    groupId       = $a.groupId
                }
                intent        = $a.intent ?? 'required'
                settings      = @{
                    '@odata.type'                   = '#microsoft.graph.win32LobAppAssignmentSettings'
                    notifications                   = 'showAll'
                    installTimeSettings             = $null
                    restartSettings                 = $null
                    deliveryOptimizationPriority    = 'notConfigured'
                }
            }
        }
    )
}

$uri = "$GRAPH_BASE/deviceAppManagement/mobileApps/$AppId/assign"
Log "Posting assignments to Graph..."
Invoke-GraphRequest -Token $token -Method POST -Uri $uri -Body $assignBody | Out-Null
Log "✅ Assignments applied for app: $AppId"

Write-Host "✅ Assignments applied." -ForegroundColor Green
