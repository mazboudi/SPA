<#
.SYNOPSIS
  Builds Intune Win32 detection rules from package.yaml.
  Reads detection fields directly from raw YAML using regex (no custom parser).
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

# ── Read raw YAML ─────────────────────────────────────────────────────────────
$yamlRaw = Get-Content $PackageYamlPath -Raw

function Get-DetectionField {
    param([string] $Key)
    if ($yamlRaw -match "(?m)^\s+${Key}:\s*(.+)$") {
        return $Matches[1].Trim().Trim('"').Trim("'")
    }
    return $null
}

function Get-TopLevelField {
    param([string] $Key)
    if ($yamlRaw -match "(?m)^${Key}:\s*(.+)$") {
        return $Matches[1].Trim().Trim('"').Trim("'")
    }
    return $null
}

$detectionMode = Get-TopLevelField 'detection_mode'
if (-not $detectionMode) { $detectionMode = 'registry-marker' }

Write-Host "Building detection rules for mode: $detectionMode"

switch ($detectionMode) {

    # ─────────────────────────────────────────────────────────────────────────
    # MSI PRODUCT CODE DETECTION (FIXED)
    # ─────────────────────────────────────────────────────────────────────────
    'msi-product-code' {

        $productCode     = Get-DetectionField 'product_code'
        $versionOperator = Get-DetectionField 'version_operator'
        $detVersion      = Get-DetectionField 'version'

        if (-not $productCode) {
            throw "package.yaml: detection.product_code is required for msi-product-code mode"
        }

        if (-not $versionOperator) {
            $versionOperator = 'greaterThanOrEqual'
        }

        if ($versionOperator -eq 'exists') {
            $versionOperator = 'notConfigured'
        }

        if ($versionOperator -ne 'notConfigured' -and -not $detVersion) {
            throw "package.yaml: detection.version is required when using version comparison operators (operator: $versionOperator)"
        }

        Write-Host "  product_code    : $productCode"
        Write-Host "  version         : $detVersion"
        Write-Host "  version_operator: $versionOperator"

        return @(@{
            '@odata.type'            = '#microsoft.graph.win32LobAppProductCodeDetection'
            productCode              = $productCode
            productVersion           = $detVersion
            productVersionOperator   = $versionOperator
        })
    }

    # ─────────────────────────────────────────────────────────────────────────
    # REGISTRY MARKER
    # ─────────────────────────────────────────────────────────────────────────
    'registry-marker' {

        $hive      = Get-DetectionField 'hive'
        $keyPath   = Get-DetectionField 'key_path'
        $valueName = Get-DetectionField 'value_name'
        $operator  = Get-DetectionField 'operator'
        $value     = Get-DetectionField 'value'

        if (-not $keyPath) {
            throw "package.yaml: detection.key_path is required for registry-marker mode"
        }

        if (-not $hive)      { $hive = 'HKLM' }
        if (-not $valueName) { $valueName = 'Version' }
        if (-not $operator)  { $operator = 'exists' }

        if ($hive -notin @('HKLM','HKCU')) {
            throw "package.yaml: detection.hive must be HKLM or HKCU"
        }

        # Graph API uses two separate fields:
        #   detectionType = value type: exists | doesNotExist | string | integer | version
        #   operator      = comparison: notConfigured | equal | notEqual | greaterThanOrEqual | ...
        #
        # The package.yaml 'operator' field maps to BOTH — we infer detectionType from it.

        # Map package.yaml operators → Graph detectionType + operator
        $detectionType = 'version'       # default: compare as version string
        $graphOperator = 'greaterThanOrEqual'

        switch ($operator) {
            'exists'             { $detectionType = 'exists';       $graphOperator = 'notConfigured' }
            'notExists'          { $detectionType = 'doesNotExist'; $graphOperator = 'notConfigured' }
            'equal'              { $detectionType = 'version';      $graphOperator = 'equal' }
            'notEqual'           { $detectionType = 'version';      $graphOperator = 'notEqual' }
            'greaterThanOrEqual' { $detectionType = 'version';      $graphOperator = 'greaterThanOrEqual' }
            default              { $detectionType = 'exists';       $graphOperator = 'notConfigured' }
        }

        $rule = @{
            '@odata.type'            = '#microsoft.graph.win32LobAppRegistryDetection'
            check32BitOn64System     = $false
            keyPath                  = $keyPath
            valueName                = $valueName
            detectionType            = $detectionType
        }

        # Only include operator and detectionValue when doing a comparison
        if ($detectionType -notin @('exists', 'doesNotExist')) {
            $rule['operator']        = $graphOperator
            $rule['detectionValue']  = $value
        }

        return @($rule)
    }

    # ─────────────────────────────────────────────────────────────────────────
    # FILE DETECTION
    # ─────────────────────────────────────────────────────────────────────────
    'file' {

        $path         = Get-DetectionField 'path'
        $fileOrFolder = Get-DetectionField 'file_or_folder'
        $operator     = Get-DetectionField 'operator'
        $detVersion   = Get-DetectionField 'version'
        $check32      = Get-DetectionField 'check_32bit'

        if (-not $path -or -not $fileOrFolder) {
            throw "package.yaml: detection.path and detection.file_or_folder are required"
        }

        if (-not $operator) { $operator = 'exists' }
        $check32Bool = ($check32 -eq 'true')

        return @(@{
            '@odata.type'            = '#microsoft.graph.win32LobAppFileSystemDetection'
            path                     = $path
            fileOrFolderName         = $fileOrFolder
            detectionType            = $operator
            detectionValue           = $detVersion
            check32BitOn64System     = $check32Bool
        })
    }

    # ─────────────────────────────────────────────────────────────────────────
    # SCRIPT
    # ─────────────────────────────────────────────────────────────────────────
    'script' {

        $scriptPath = 'windows/detection/detect.ps1'
        if (!(Test-Path $scriptPath)) {
            throw "script detection requires windows/detection/detect.ps1"
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
        throw "package.yaml: unknown detection_mode '$detectionMode'"
    }
}
