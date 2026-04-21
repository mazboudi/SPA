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
        $check32   = Get-DetectionField 'check32BitOn64System'

        if (-not $keyPath) {
            throw "package.yaml: detection.key_path is required for registry-marker mode"
        }

        if (-not $hive)      { $hive = 'HKLM' }
        if (-not $valueName) { $valueName = 'Version' }
        if (-not $operator)  { $operator = 'exists' }
        $check32Bool = ($check32 -eq 'true')

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
            check32BitOn64System     = $check32Bool
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

        $path           = Get-DetectionField 'path'
        $fileOrFolder   = Get-DetectionField 'file_or_folder'
        $detType        = Get-DetectionField 'detection_type'
        $operator       = Get-DetectionField 'operator'
        $detValue       = Get-DetectionField 'value'
        $check32        = Get-DetectionField 'check_32bit'

        # Backward compat: if 'operator' is set but 'detection_type' is not,
        # infer detection_type from the operator (legacy package.yaml format)
        if (-not $detType -and $operator) {
            switch ($operator) {
                'exists'             { $detType = 'exists' }
                'doesNotExist'       { $detType = 'doesNotExist' }
                { $_ -match 'version' -or $_ -match 'Version' } {
                    $detType = 'version'
                }
                default              { $detType = 'exists' }
            }
        }

        if (-not $path -or -not $fileOrFolder) {
            throw "package.yaml: detection.path and detection.file_or_folder are required"
        }

        if (-not $detType) { $detType = 'exists' }
        $check32Bool = ($check32 -eq 'true')

        # Graph API uses:
        #   detectionType = exists | doesNotExist | version | sizeInMB | modifiedDate
        #   operator      = notConfigured | equal | notEqual | greaterThan |
        #                   greaterThanOrEqual | lessThan | lessThanOrEqual
        #   detectionValue = comparison value (only when detectionType is version/sizeInMB/modifiedDate)

        $graphOperator  = 'notConfigured'
        $graphValue     = $null

        switch ($detType) {
            'exists'       { $graphOperator = 'notConfigured'; $graphValue = $null }
            'doesNotExist' { $graphOperator = 'notConfigured'; $graphValue = $null }
            { $_ -in @('version', 'sizeInMB', 'modifiedDate') } {
                $graphOperator = if ($operator) { $operator } else { 'greaterThanOrEqual' }
                $graphValue    = $detValue
                if (-not $graphValue) {
                    throw "package.yaml: detection.value is required when detection_type is '$detType'"
                }
            }
        }

        Write-Host "  path            : $path"
        Write-Host "  file_or_folder  : $fileOrFolder"
        Write-Host "  detection_type  : $detType"
        Write-Host "  operator        : $graphOperator"
        Write-Host "  value           : $graphValue"

        $rule = @{
            '@odata.type'            = '#microsoft.graph.win32LobAppFileSystemDetection'
            path                     = $path
            fileOrFolderName         = $fileOrFolder
            detectionType            = $detType
            check32BitOn64System     = $check32Bool
        }

        # Only include operator and detectionValue when doing a comparison
        if ($detType -notin @('exists', 'doesNotExist')) {
            $rule['operator']        = $graphOperator
            $rule['detectionValue']  = $graphValue
        }

        return @($rule)
    }

    # ─────────────────────────────────────────────────────────────────────────
    # SCRIPT
    # ─────────────────────────────────────────────────────────────────────────
    'script' {

        $scriptPath = 'windows/detection/detect.ps1'
        if (!(Test-Path $scriptPath)) {
            throw "script detection requires windows/detection/detect.ps1"
        }

        # Read detection config sidecar if present
        $runAs32   = $false
        $enforceSig = $false
        $configPath = 'windows/detection/detection-config.json'
        if (Test-Path $configPath) {
            try {
                $detConfig = Get-Content $configPath -Raw | ConvertFrom-Json
                $runAs32   = [bool]$detConfig.runAs32Bit
                $enforceSig = [bool]$detConfig.enforceSignatureCheck
                Write-Host "  Detection config: runAs32Bit=$runAs32, enforceSignatureCheck=$enforceSig"
            } catch {
                Write-Host "  ⚠ Could not parse detection-config.json — using defaults" -ForegroundColor Yellow
            }
        } else {
            # Fallback: read from package.yaml detection block
            $yamlRunAs32 = Get-DetectionField 'run_as_32bit'
            $yamlEnforceSig = Get-DetectionField 'enforce_signature_check'
            if ($yamlRunAs32 -eq 'true') { $runAs32 = $true }
            if ($yamlEnforceSig -eq 'true') { $enforceSig = $true }
        }

        $encoded = [Convert]::ToBase64String(
            [Text.Encoding]::Unicode.GetBytes(
                (Get-Content $scriptPath -Raw)
            )
        )

        return @(@{
            '@odata.type'         = '#microsoft.graph.win32LobAppPowerShellScriptDetection'
            scriptContent         = $encoded
            runAs32Bit            = $runAs32
            enforceSignatureCheck = $enforceSig
        })
    }

    default {
        throw "package.yaml: unknown detection_mode '$detectionMode'"
    }
}
