<#
.SYNOPSIS
  Builds Intune Win32 requirement rule objects from windows/intune/requirements.json.

.PARAMETER RequirementsPath
  Path to windows/intune/requirements.json.

.OUTPUTS
  [object[]] Array of requirement rule hashtables for the Graph API body.

.EXAMPLE requirements.json
  {
    "minimumSupportedWindowsRelease": "2004",
    "applicableArchitectures": "x64",
    "minimumFreeDiskSpaceInMB": 500,
    "minimumMemoryInMB": 2048
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
