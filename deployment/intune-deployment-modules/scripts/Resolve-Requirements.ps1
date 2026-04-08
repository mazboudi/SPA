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

$req = Get-Content $RequirementsPath -Raw | ConvertFrom-Json

$rule = @{
    minimumFreeDiskSpaceInMB       = $req.minDiskSpaceInMB    ?? $null
    minimumMemoryInMB              = $req.minRamInMB          ?? $null
    minimumNumberOfProcessors      = $null
    minimumCpuSpeedInMHz           = $req.minCpuSpeedInMHz    ?? $null
    minimumSupportedWindowsRelease = $req.minWindowsVersion   ?? '10.0.19041.0'
}

$archMap = @{
    x64   = 'x64'
    x32   = 'x86'
    x86   = 'x86'
    arm64 = 'arm'
}
if ($req.architecture -and $archMap.ContainsKey($req.architecture)) {
    $rule.applicableArchitectures = $archMap[$req.architecture]
} else {
    $rule.applicableArchitectures = 'x64'
}

Write-Host "Hardware properties resolved (minOS=$($rule.minimumSupportedWindowsRelease), arch=$($rule.applicableArchitectures))"
return $rule
