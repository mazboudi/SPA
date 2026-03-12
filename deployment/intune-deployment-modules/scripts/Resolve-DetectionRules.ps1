<#
.SYNOPSIS
  Builds Intune Win32 detection rule objects from windows/package.yaml.

.DESCRIPTION
  Reads the detection_mode and detection block from package.yaml and returns
  a JSON-compatible array of detection rule objects ready for the Graph API body.

.PARAMETER PackageYamlPath
  Path to windows/package.yaml.

.OUTPUTS
  [object[]] Array of detection rule hashtables for Graph API.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string] $PackageYamlPath = 'windows/package.yaml'
)

$ErrorActionPreference = 'Stop'

if (!(Test-Path $PackageYamlPath)) { throw "package.yaml not found: $PackageYamlPath" }

$yaml = Get-Content $PackageYamlPath -Raw

function Read-YamlScalar([string] $content, [string] $key) {
    if ($content -match "(?m)^  ${key}:\s*['\"]?([^'\"\r\n]+)['\"]?") { return $Matches[1].Trim() }
    if ($content -match "(?m)^${key}:\s*['\"]?([^'\"\r\n]+)['\"]?")   { return $Matches[1].Trim() }
    return $null
}

$detectionMode = Read-YamlScalar $yaml 'detection_mode'
if (-not $detectionMode) { $detectionMode = 'registry-marker' }

Write-Host "Building detection rules for mode: $detectionMode"

switch ($detectionMode) {

    'registry-marker' {
        # Expected YAML:
        #   detection_mode: registry-marker
        #   detection:
        #     registry:
        #       hive: HKLM          # must be HKLM or HKCU
        #       key_path: SOFTWARE\YourOrg\InstalledApps\AppName
        #       value_name: Version
        #       operator: exists    # exists|notExists|equal|notEqual|greaterThanOrEqual
        $hive      = Read-YamlScalar $yaml 'hive'       ?? 'HKLM'
        $keyPath   = Read-YamlScalar $yaml 'key_path'
        $valueName = Read-YamlScalar $yaml 'value_name' ?? 'Version'
        $operator  = Read-YamlScalar $yaml 'operator'   ?? 'exists'
        $value     = Read-YamlScalar $yaml 'value'

        # --- Validation (ported from validate-appjson.ps1) ---
        if (-not $keyPath) {
            throw "package.yaml detection.registry.key_path is required for registry-marker mode"
        }
        $validHives = @('HKLM', 'HKCU')
        if ($hive -notin $validHives) {
            throw "detection.registry.hive must be one of: $($validHives -join ', ') (got: '$hive')"
        }
        $validOperators = @('exists', 'notExists', 'equal', 'notEqual', 'greaterThanOrEqual')
        if ($operator -notin $validOperators) {
            throw "detection.registry.operator must be one of: $($validOperators -join ', ') (got: '$operator')"
        }
        if ($operator -ne 'exists' -and $operator -ne 'notExists' -and -not $value) {
            throw "detection.registry.value is required when operator is '$operator'"
        }

        $rule = @{
            '@odata.type'        = '#microsoft.graph.win32LobAppRegistryDetection'
            check32BitOn64System = $false
            keyPath              = $keyPath
            valueName            = $valueName
            detectionType        = switch ($operator) {
                'exists'             { 'exists' }
                'notExists'          { 'doesNotExist' }
                'equal'              { 'equal' }
                'notEqual'           { 'notEqual' }
                'greaterThanOrEqual' { 'greaterThanOrEqual' }
                default              { 'exists' }
            }
            detectionValue       = $value
        }
        return @($rule)
    }

    'file' {
        $path         = Read-YamlScalar $yaml 'path'
        $fileOrFolder = Read-YamlScalar $yaml 'file_or_folder'
        $operator     = Read-YamlScalar $yaml 'operator' ?? 'exists'
        $versionVal   = Read-YamlScalar $yaml 'version'
        $check32      = ($yaml -match '(?m)check32BitOn64System:\s*true')

        # --- Validation (ported from validate-appjson.ps1) ---
        if (-not $path) {
            throw "package.yaml detection.file.path is required for file mode"
        }
        if (-not $fileOrFolder) {
            throw "package.yaml detection.file.file_or_folder is required for file mode"
        }
        $validOperators = @('exists', 'doesNotExist', 'equal', 'greaterThanOrEqual', 'versionEquals', 'versionGreaterThanOrEqual')
        if ($operator -notin $validOperators) {
            throw "detection.file.operator must be one of: $($validOperators -join ', ') (got: '$operator')"
        }
        if ($operator -match '^version' -and -not $versionVal) {
            throw "detection.file.version is required when operator is '$operator'"
        }

        $rule = @{
            '@odata.type'        = '#microsoft.graph.win32LobAppFileSystemDetection'
            path                 = $path
            fileOrFolderName     = $fileOrFolder
            check32BitOn64System = $check32
            detectionType        = switch ($operator) {
                'exists'                  { 'exists' }
                'doesNotExist'            { 'doesNotExist' }
                'equal'                   { 'equal' }
                'greaterThanOrEqual'      { 'greaterThanOrEqual' }
                'versionEquals'           { 'equal' }
                'versionGreaterThanOrEqual' { 'greaterThanOrEqual' }
                default                   { 'exists' }
            }
            detectionValue       = $versionVal
        }
        return @($rule)
    }

    'msi-product-code' {
        $productCode = Read-YamlScalar $yaml 'product_code'
        $versionOp   = Read-YamlScalar $yaml 'version_operator' ?? 'greaterThanOrEqual'
        $versionVal  = Read-YamlScalar $yaml 'version'

        # --- Validation (ported from validate-appjson.ps1) ---
        if (-not $productCode) {
            throw "package.yaml detection.msi.product_code is required for msi-product-code mode"
        }
        # Must be a GUID wrapped in braces: {xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx}
        if ($productCode -notmatch '^\{[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}\}$') {
            throw "detection.msi.product_code must be a GUID in braces (e.g. {8A69D345-D564-463C-AFF1-A69D9E530F96}). Got: '$productCode'"
        }
        $validVersionOps = @('greaterThanOrEqual', 'equal', 'notConfigured')
        if ($versionOp -notin $validVersionOps) {
            throw "detection.msi.version_operator must be one of: $($validVersionOps -join ', ') (got: '$versionOp')"
        }

        $rule = @{
            '@odata.type'          = '#microsoft.graph.win32LobAppProductCodeDetection'
            productCode            = $productCode
            productVersionOperator = switch ($versionOp) {
                'greaterThanOrEqual' { 'greaterThanOrEqual' }
                'equal'              { 'equal' }
                'notConfigured'      { 'notConfigured' }
                default              { 'greaterThanOrEqual' }
            }
            productVersion         = $versionVal
        }
        return @($rule)
    }

    'script' {
        # For script-based detection, title must provide windows/detection/detect.ps1
        $scriptPath = 'windows/detection/detect.ps1'
        if (!(Test-Path $scriptPath)) {
            throw "detection_mode=script requires windows/detection/detect.ps1"
        }
        $scriptContent = Get-Content $scriptPath -Raw
        $encoded       = [Convert]::ToBase64String([System.Text.Encoding]::Unicode.GetBytes($scriptContent))

        $rule = @{
            '@odata.type'          = '#microsoft.graph.win32LobAppPowerShellScriptDetection'
            enforceSignatureCheck  = $false
            runAs32Bit             = $false
            scriptContent          = $encoded
        }
        return @($rule)
    }

    default {
        throw "Unknown detection_mode: $detectionMode"
    }
}
