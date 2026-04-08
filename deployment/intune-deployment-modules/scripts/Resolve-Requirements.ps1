<#
.SYNOPSIS
  Builds Intune Win32 requirement rule objects from windows/intune/requirements.json.

.PARAMETER RequirementsPath
  Path to windows/intune/requirements.json.

.OUTPUTS
  [object[]] Array of requirement rule hashtables for the Graph API body.

.EXAMPLE requirements.json
  {
    "minWindowsVersion": "10.0.19041.0",
    "architecture": "x64",
    "minDiskSpaceInMB": 500,
    "minRamInMB": 2048,
    "minCpuSpeedInMHz": null
  }
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string] $RequirementsPath = 'windows/intune/requirements.json'
)

$ErrorActionPreference = 'Stop'

if (!(Test-Path $RequirementsPath)) {
    Write-Warning "requirements.json not found: $RequirementsPath — returning empty requirement rules."
    return @()
}
$req = Get-Content $RequirementsPath -Raw | ConvertFrom-Json -AsHashtable

Write-Host "Hardware properties resolved (minOS=$($req.minimumSupportedWindowsRelease), arch=$($req.applicableArchitectures))"
return $req
