<#
.SYNOPSIS
  Builds Intune Win32 requirement rule objects from windows/intune/requirements.json.

.PARAMETER RequirementsPath
  Path to windows/intune/requirements.json.

.OUTPUTS
  [hashtable] Hardware properties and resolved requirement rules for the Graph API body.

.EXAMPLE requirements.json
  {
    "minimumSupportedWindowsRelease": "2004",
    "applicableArchitectures": "x64",
    "minimumFreeDiskSpaceInMB": 500,
    "minimumMemoryInMB": 2048,
    "customRequirementRules": [
      { "type": "file", "path": "C:\\Program Files\\MyApp", "fileOrFolder": "MyApp.exe", "detectionType": "exists" },
      { "type": "script", "scriptFile": "windows/intune/scripts/check-prereq.ps1", "outputDataType": "string", "operator": "equal", "detectionValue": "True" }
    ]
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
    return @{ hardware = @{}; requirementRules = @() }
}
$req = Get-Content $RequirementsPath -Raw | ConvertFrom-Json -AsHashtable

# ── Hardware properties (passed directly to app body) ─────────────────────────
$hardware = @{
    minimumSupportedWindowsRelease = $req.minimumSupportedWindowsRelease
    applicableArchitectures        = $req.applicableArchitectures
    minimumFreeDiskSpaceInMB       = $req.minimumFreeDiskSpaceInMB
    minimumMemoryInMB              = $req.minimumMemoryInMB
    minimumNumberOfProcessors      = $req.minimumNumberOfProcessors
    minimumCpuSpeedInMHz           = $req.minimumCpuSpeedInMHz
}
Write-Host "Hardware properties resolved (minOS=$($hardware.minimumSupportedWindowsRelease), arch=$($hardware.applicableArchitectures))"

# ── Custom requirement rules → Graph API requirementRules array ───────────────
$requirementRules = @()

if ($req.customRequirementRules) {
    foreach ($rule in $req.customRequirementRules) {
        switch ($rule.type) {
            'file' {
                $graphRule = @{
                    '@odata.type'          = '#microsoft.graph.win32LobAppFileSystemRequirement'
                    path                   = $rule.path
                    fileOrFolderName       = $rule.fileOrFolder
                    check32BitOn64System   = if ($rule.check32BitOn64 -eq $true) { $true } else { $false }
                    detectionType          = $rule.detectionType ?? 'exists'
                }
                if ($rule.operator -and $rule.operator -ne 'notConfigured') {
                    $graphRule['operator']       = $rule.operator
                    $graphRule['detectionValue'] = $rule.detectionValue ?? ''
                }
                $requirementRules += $graphRule
                Write-Host "  + File requirement: $($rule.path)\$($rule.fileOrFolder) ($($rule.detectionType))"
            }

            'registry' {
                $fullKeyPath = switch ($rule.hive) {
                    'HKLM' { "HKEY_LOCAL_MACHINE\$($rule.keyPath)" }
                    'HKCU' { "HKEY_CURRENT_USER\$($rule.keyPath)" }
                    default { $rule.keyPath }
                }
                $graphRule = @{
                    '@odata.type'          = '#microsoft.graph.win32LobAppRegistryRequirement'
                    keyPath                = $fullKeyPath
                    valueName              = $rule.valueName ?? ''
                    check32BitOn64System   = if ($rule.check32BitOn64 -eq $true) { $true } else { $false }
                    detectionType          = $rule.detectionType ?? 'exists'
                }
                if ($rule.operator -and $rule.operator -ne 'notConfigured') {
                    $graphRule['operator']       = $rule.operator
                    $graphRule['detectionValue'] = $rule.detectionValue ?? ''
                }
                $requirementRules += $graphRule
                Write-Host "  + Registry requirement: $fullKeyPath ($($rule.detectionType))"
            }

            'script' {
                # Read script from standalone .ps1 file
                $scriptPath = $rule.scriptFile
                if (-not $scriptPath -or !(Test-Path $scriptPath)) {
                    Write-Warning "  Script requirement file not found: $scriptPath — skipping."
                    continue
                }
                $scriptBytes   = [System.IO.File]::ReadAllBytes((Resolve-Path $scriptPath).Path)
                $scriptBase64  = [Convert]::ToBase64String($scriptBytes)

                $graphRule = @{
                    '@odata.type'              = '#microsoft.graph.win32LobAppPowerShellScriptRequirement'
                    displayName                = [System.IO.Path]::GetFileNameWithoutExtension($scriptPath)
                    scriptContent              = $scriptBase64
                    enforceSignatureCheck      = if ($rule.enforceSignatureCheck -eq $true) { $true } else { $false }
                    runAs32Bit                 = if ($rule.runAs32Bit -eq $true) { $true } else { $false }
                    runAsAccount               = if ($rule.runAsAccount -eq $true) { 'user' } else { 'system' }
                    detectionType              = 'string'
                    operator                   = $rule.operator ?? 'notConfigured'
                    detectionValue             = $rule.detectionValue ?? ''
                    outputDataType             = $rule.outputDataType ?? 'string'
                }
                $requirementRules += $graphRule
                Write-Host "  + Script requirement: $scriptPath (output=$($rule.outputDataType), op=$($rule.operator))"
            }

            default {
                Write-Warning "  Unknown requirement type: $($rule.type) — skipping."
            }
        }
    }
}

Write-Host "Custom requirement rules resolved: $($requirementRules.Count) rules"

return @{
    hardware         = $hardware
    requirementRules = $requirementRules
}
