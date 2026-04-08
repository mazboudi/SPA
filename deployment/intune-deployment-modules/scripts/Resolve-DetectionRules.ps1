<#
.SYNOPSIS
  Builds Intune Win32 detection rules from package.yaml.
  Reads detection fields directly from raw YAML using regex (no custom parser).

  Supported detection_mode values:
    msi-product-code   – MSI product code / version check
    registry-marker    – Registry key/value existence or comparison
    file               – File or folder existence / version check
    script             – Inline PowerShell detection script

  package.yaml structure (all detection fields indented under detection:):

    detection_mode: msi-product-code
    detection:
      product_code: "{GUID}"
      version_operator: greaterThanOrEqual
      version: "26.00"

    detection_mode: registry-marker
    detection:
      hive: HKLM
      key_path: "SOFTWARE\Org\App"
      value_name: Version
      operator: greaterThanOrEqual
      value: "1.0"

    detection_mode: file
    detection:
      path: "C:\Program Files\App"
      file_or_folder: "app.exe"
      operator: versionGreaterThanOrEqual
      version: "1.0"
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string] $PackageYamlPath = 'windows/package.yaml'
)

$ErrorActionPreference = 'Stop'

if (!(Test-Path $PackageYamlPath)) {
    throw "package.yaml not found at: $PackageYamlPath"
}

# ── Read raw YAML (regex-based, no custom YAML parser) ────────────────────────
$yamlRaw = Get-Content $PackageYamlPath -Raw

# Helper: extract an indented field value (strips surrounding quotes)
function Get-DetectionField {
    param([string] $Key)
    # Match only indented fields (detection block) — at least one leading space
    if ($yamlRaw -match "(?m)^\s+${Key}:\s*(.+)$") {
        return $Matches[1].Trim().Trim('"').Trim("'").Trim()
    }
    return $null
}

# Top-level field (no leading whitespace)
function Get-TopLevelField {
    param([string] $Key)
    if ($yamlRaw -match "(?m)^${Key}:\s*(.+)$") {
        return $Matches[1].Trim().Trim('"').Trim("'").Trim()
    }
    return $null
}

$detectionMode = Get-TopLevelField 'detection_mode'
if (-not $detectionMode) { $detectionMode = 'registry-marker' }
Write-Host "Building detection rules for mode: $detectionMode"

# ── Build rules per mode ──────────────────────────────────────────────────────

switch ($detectionMode) {

    'msi-product-code' {
        $productCode     = Get-DetectionField 'product_code'
        $versionOperator = Get-DetectionField 'version_operator'
        $detVersion      = Get-DetectionField 'version'

        if (-not $productCode) {
            throw "package.yaml: detection.product_code is required for msi-product-code mode"
        }
        if (-not $versionOperator) { $versionOperator = 'greaterThanOrEqual' }

        Write-Host "  product_code    : $productCode"
        Write-Host "  version         : $detVersion"
        Write-Host "  version_operator: $versionOperator"

        return @(@{
            '@odata.type'          = '#microsoft.graph.win32LobAppProductCodeDetection'
            productCode            = $productCode
            productVersionOperator = $versionOperator
            productVersion         = $detVersion
        })
    }

    'registry-marker' {
        $hive      = Get-DetectionField 'hive'
        $keyPath   = Get-DetectionField 'key_path'
        $valueName = Get-DetectionField 'value_name'
        $operator  = Get-DetectionField 'operator'
        $value     = Get-DetectionField 'value'

        if (-not $keyPath) {
            throw "package.yaml: detection.key_path is required for registry-marker mode"
        }
        if (-not $hive)      { $hive      = 'HKLM' }
        if (-not $valueName) { $valueName = 'Version' }
        if (-not $operator)  { $operator  = 'exists' }

        if ($hive -notin @('HKLM','HKCU')) {
            throw "package.yaml: detection.hive must be HKLM or HKCU (got '$hive')"
        }

        $operatorMap = @{
            exists             = 'exists'
            notExists          = 'doesNotExist'
            equal              = 'equal'
            notEqual           = 'notEqual'
            greaterThanOrEqual = 'greaterThanOrEqual'
        }
        $graphOperator = if ($operatorMap.ContainsKey($operator)) { $operatorMap[$operator] } else { 'exists' }

        return @(@{
            '@odata.type'        = '#microsoft.graph.win32LobAppRegistryDetection'
            check32BitOn64System = $false
            keyPath              = $keyPath
            valueName            = $valueName
            detectionType        = $graphOperator
            detectionValue       = $value
        })
    }

    'file' {
        $path         = Get-DetectionField 'path'
        $fileOrFolder = Get-DetectionField 'file_or_folder'
        $operator     = Get-DetectionField 'operator'
        $detVersion   = Get-DetectionField 'version'
        $check32      = Get-DetectionField 'check_32bit'

        if (-not $path) {
            throw "package.yaml: detection.path is required for file mode"
        }
        if (-not $fileOrFolder) {
            throw "package.yaml: detection.file_or_folder is required for file mode"
        }
        if (-not $operator)  { $operator = 'exists' }
        $check32Bool = ($check32 -eq 'true')

        return @(@{
            '@odata.type'        = '#microsoft.graph.win32LobAppFileSystemDetection'
            path                 = $path
            fileOrFolderName     = $fileOrFolder
            detectionType        = $operator
            detectionValue       = $detVersion
            check32BitOn64System = $check32Bool
        })
    }

    'script' {
        $scriptPath = 'windows/detection/detect.ps1'
        if (!(Test-Path $scriptPath)) {
            throw "script detection requires windows/detection/detect.ps1 — file not found"
        }

        $encoded = [Convert]::ToBase64String(
            [Text.Encoding]::Unicode.GetBytes(
                (Get-Content $scriptPath -Raw)
            )
        )

        return @(@{
            '@odata.type'         = '#microsoft.graph.win32LobAppPowerShellScriptDetection'
            scriptContent         = $encoded
            runAs32Bit            = $false
            enforceSignatureCheck = $false
        })
    }

    default {
        throw "package.yaml: unknown detection_mode '$detectionMode'. Valid: msi-product-code, registry-marker, file, script"
    }
}