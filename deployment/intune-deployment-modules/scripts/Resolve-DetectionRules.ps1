<#
.SYNOPSIS
  Builds Intune Win32 detection rules from package.yaml.
  Supports both the new format (detection_method + detection_rules array)
  and legacy format (detection_mode + detection object).
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

# ── Determine which format to use ─────────────────────────────────────────────
# New format: detection_method + detection_rules (array)
# Legacy format: detection_mode + detection (object)
$detectionMethod = Get-TopLevelField 'detection_method'
$detectionMode   = Get-TopLevelField 'detection_mode'

# ══════════════════════════════════════════════════════════════════════════════
#  NEW FORMAT: detection_method + detection_rules
# ══════════════════════════════════════════════════════════════════════════════
if ($detectionMethod) {
    Write-Host "Using new detection format: detection_method=$detectionMethod"

    if ($detectionMethod -eq 'script') {
        # Script detection — same as legacy script mode
        $scriptPath = 'windows/detection/detect.ps1'
        if (!(Test-Path $scriptPath)) {
            throw "script detection requires windows/detection/detect.ps1"
        }

        $runAs32    = $false
        $enforceSig = $false
        $configPath = 'windows/detection/detection-config.json'
        if (Test-Path $configPath) {
            try {
                $detConfig  = Get-Content $configPath -Raw | ConvertFrom-Json
                $runAs32    = [bool]$detConfig.runAs32Bit
                $enforceSig = [bool]$detConfig.enforceSignatureCheck
                Write-Host "  Detection config: runAs32Bit=$runAs32, enforceSignatureCheck=$enforceSig"
            } catch {
                Write-Host "  Warning: Could not parse detection-config.json - using defaults" -ForegroundColor Yellow
            }
        } else {
            $yamlRunAs32    = Get-DetectionField 'run_as_32bit'
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

    # Manual detection — parse detection_rules array from YAML
    # Use powershell-yaml module if available, otherwise regex parse
    $rules = @()

    try {
        Import-Module powershell-yaml -ErrorAction Stop
        $parsed = ConvertFrom-Yaml $yamlRaw
        $yamlRules = $parsed.detection_rules
    } catch {
        # Fallback: regex-based array parsing
        Write-Host "  powershell-yaml not available, using regex parser"
        $yamlRules = @()

        # Match each "- type: xxx" block in detection_rules
        $inRules = $false
        $currentRule = $null
        foreach ($line in $yamlRaw -split "`n") {
            $trimmed = $line.TrimEnd()

            # Detect start of detection_rules array
            if ($trimmed -match '^detection_rules:') {
                $inRules = $true
                continue
            }

            # Exit when we hit a non-indented line (next top-level key)
            if ($inRules -and $trimmed -match '^\S' -and $trimmed -notmatch '^\s*#') {
                if ($currentRule) { $yamlRules += $currentRule }
                $inRules = $false
                continue
            }

            if (-not $inRules) { continue }

            # New array item
            if ($trimmed -match '^\s+-\s+type:\s*(.+)$') {
                if ($currentRule) { $yamlRules += $currentRule }
                $currentRule = @{ type = $Matches[1].Trim().Trim('"').Trim("'") }
            }
            # Key-value within current item
            elseif ($currentRule -and $trimmed -match '^\s+(\w[\w_]*):\s*(.+)$') {
                $k = $Matches[1].Trim()
                $v = $Matches[2].Trim().Trim('"').Trim("'")
                $currentRule[$k] = $v
            }
        }
        if ($currentRule) { $yamlRules += $currentRule }
    }

    if (-not $yamlRules -or $yamlRules.Count -eq 0) {
        throw "package.yaml: detection_rules array is empty or could not be parsed"
    }

    foreach ($r in $yamlRules) {
        $ruleType = $r.type
        Write-Host "  Processing rule: type=$ruleType"

        switch ($ruleType) {
            'msi' {
                $productCode     = $r.product_code
                $versionOperator = if ($r.version_operator) { $r.version_operator } else { 'greaterThanOrEqual' }
                $version         = $r.version

                if (-not $productCode) {
                    throw "detection_rules: product_code is required for msi rule"
                }

                if ($versionOperator -eq 'exists') { $versionOperator = 'notConfigured' }

                Write-Host "    product_code    : $productCode"
                Write-Host "    version         : $version"
                Write-Host "    version_operator: $versionOperator"

                $rules += @{
                    '@odata.type'          = '#microsoft.graph.win32LobAppProductCodeDetection'
                    productCode            = $productCode
                    productVersion         = $version
                    productVersionOperator = $versionOperator
                }
            }

            'file' {
                $path         = $r.path
                $fileOrFolder = $r.file_or_folder
                $detType      = if ($r.detection_type) { $r.detection_type } else { 'exists' }
                $operator     = if ($r.operator) { $r.operator } else { 'notConfigured' }
                $value        = $r.value
                $check32      = ($r.check_32bit -eq 'true' -or $r.check_32bit -eq $true)

                if (-not $path -or -not $fileOrFolder) {
                    throw "detection_rules: path and file_or_folder are required for file rule"
                }

                $graphOperator = 'notConfigured'
                $graphValue    = $null

                if ($detType -notin @('exists', 'doesNotExist')) {
                    $graphOperator = $operator
                    $graphValue    = $value
                    if (-not $graphValue) {
                        throw "detection_rules: value is required when detection_type is '$detType'"
                    }
                }

                Write-Host "    path           : $path"
                Write-Host "    file_or_folder : $fileOrFolder"
                Write-Host "    detection_type : $detType"

                $rule = @{
                    '@odata.type'        = '#microsoft.graph.win32LobAppFileSystemDetection'
                    path                 = $path
                    fileOrFolderName     = $fileOrFolder
                    detectionType        = $detType
                    check32BitOn64System = $check32
                }
                if ($detType -notin @('exists', 'doesNotExist')) {
                    $rule['operator']       = $graphOperator
                    $rule['detectionValue'] = $graphValue
                }
                $rules += $rule
            }

            'registry' {
                $hive      = if ($r.hive) { $r.hive } else { 'HKLM' }
                $keyPath   = $r.key_path
                $valueName = if ($r.value_name) { $r.value_name } else { 'Version' }
                $detType   = if ($r.detection_type) { $r.detection_type } else { 'exists' }
                $operator  = if ($r.operator) { $r.operator } else { 'notConfigured' }
                $value     = $r.value
                $check32   = ($r.check_32bit -eq 'true' -or $r.check_32bit -eq $true)

                if (-not $keyPath) {
                    throw "detection_rules: key_path is required for registry rule"
                }

                # Map detection_type to Graph API fields
                $graphDetType  = 'version'
                $graphOperator = 'greaterThanOrEqual'

                switch ($detType) {
                    'exists'       { $graphDetType = 'exists';       $graphOperator = 'notConfigured' }
                    'doesNotExist' { $graphDetType = 'doesNotExist'; $graphOperator = 'notConfigured' }
                    'string'       { $graphDetType = 'string';       $graphOperator = $operator }
                    'integer'      { $graphDetType = 'integer';      $graphOperator = $operator }
                    'version'      { $graphDetType = 'version';      $graphOperator = $operator }
                    default        { $graphDetType = 'exists';       $graphOperator = 'notConfigured' }
                }

                Write-Host "    hive       : $hive"
                Write-Host "    key_path   : $keyPath"
                Write-Host "    value_name : $valueName"

                $rule = @{
                    '@odata.type'        = '#microsoft.graph.win32LobAppRegistryDetection'
                    check32BitOn64System = $check32
                    keyPath              = $keyPath
                    valueName            = $valueName
                    detectionType        = $graphDetType
                }
                if ($graphDetType -notin @('exists', 'doesNotExist')) {
                    $rule['operator']       = $graphOperator
                    $rule['detectionValue'] = $value
                }
                $rules += $rule
            }

            default {
                throw "detection_rules: unknown rule type '$ruleType'"
            }
        }
    }

    if ($rules.Count -eq 0) {
        throw "No detection rules could be built from detection_rules array"
    }

    Write-Host "Built $($rules.Count) detection rule(s) from detection_rules array"
    return $rules
}

# ══════════════════════════════════════════════════════════════════════════════
#  LEGACY FORMAT: detection_mode + detection object
# ══════════════════════════════════════════════════════════════════════════════
if (-not $detectionMode) { $detectionMode = 'registry-marker' }

Write-Host "Building detection rules for legacy mode: $detectionMode"

switch ($detectionMode) {

    # ─────────────────────────────────────────────────────────────────────────
    # MSI PRODUCT CODE DETECTION
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

        $detectionType = 'version'
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

        $rule = @{
            '@odata.type'            = '#microsoft.graph.win32LobAppFileSystemDetection'
            path                     = $path
            fileOrFolderName         = $fileOrFolder
            detectionType            = $detType
            check32BitOn64System     = $check32Bool
        }

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
                Write-Host "  Warning: Could not parse detection-config.json - using defaults" -ForegroundColor Yellow
            }
        } else {
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
