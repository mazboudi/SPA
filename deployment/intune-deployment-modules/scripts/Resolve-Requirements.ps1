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

$osMap = @{
    '10.0.14393.0' = '1607'
    '10.0.15063.0' = '1703'
    '10.0.16299.0' = '1709'
    '10.0.17134.0' = '1803'
    '10.0.17763.0' = '1809'
    '10.0.18362.0' = '1903'
    '10.0.18363.0' = '1909'
    '10.0.19041.0' = '2004'
    '10.0.19042.0' = '20H2'
    '10.0.19043.0' = '21H1'
    '10.0.19044.0' = '21H2'
    '10.0.19045.0' = '22H2'
    '10.0.22000.0' = 'Windows11_21H2'
    '10.0.22621.0' = 'Windows11_22H2'
    '10.0.22631.0' = 'Windows11_23H2'
}
$rawOs = $req.minWindowsVersion ?? '10.0.19041.0'
$mappedOs = if ($osMap.ContainsKey($rawOs)) { $osMap[$rawOs] } else { '2004' }

$rule = @{
    minimumFreeDiskSpaceInMB       = $req.minDiskSpaceInMB    ?? $null
    minimumMemoryInMB              = $req.minRamInMB          ?? $null
    minimumNumberOfProcessors      = $null
    minimumCpuSpeedInMHz           = $req.minCpuSpeedInMHz    ?? $null
    minimumSupportedWindowsRelease = $mappedOs
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
