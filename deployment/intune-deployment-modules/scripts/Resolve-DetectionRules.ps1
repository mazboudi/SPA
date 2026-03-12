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
        # Read registry block
        # Expected YAML:
        #   detection:
        #     registry:
        #       hive: HKLM
        #       key_path: SOFTWARE\YourOrg\InstalledApps\AppName
        #       value_name: Version
        #       operator: exists
        $hive       = Read-YamlScalar $yaml 'hive'         ?? 'HKLM'
        $keyPath    = Read-YamlScalar $yaml 'key_path'
        $valueName  = Read-YamlScalar $yaml 'value_name'   ?? 'Version'
        $operator   = Read-YamlScalar $yaml 'operator'     ?? 'exists'
        $value      = Read-YamlScalar $yaml 'value'

        if (-not $keyPath) { throw "package.yaml detection.registry.key_path is required for registry-marker mode" }

        $rule = @{
            '@odata.type' = '#microsoft.graph.win32LobAppRegistryDetection'
            check32BitOn64System = $false
            keyPath       = $keyPath
            valueName     = $valueName
            detectionType = switch ($operator) {
                'exists'              { 'exists' }
                'notExists'           { 'doesNotExist' }
                'equal'               { 'equal' }
                'notEqual'            { 'notEqual' }
                'greaterThanOrEqual'  { 'greaterThanOrEqual' }
                default               { 'exists' }
            }
            detectionValue = $value
        }
        return @($rule)
    }

    'file' {
        $path          = Read-YamlScalar $yaml 'path'
        $fileOrFolder  = Read-YamlScalar $yaml 'file_or_folder'
        $operator      = Read-YamlScalar $yaml 'operator'      ?? 'exists'
        $versionVal    = Read-YamlScalar $yaml 'version'
        $check32       = ($yaml -match '(?m)check32BitOn64System:\s*true')

        if (-not $path -or -not $fileOrFolder) {
            throw "package.yaml detection.file requires path and file_or_folder fields"
        }

        $rule = @{
            '@odata.type'        = '#microsoft.graph.win32LobAppFileSystemDetection'
            path                 = $path
            fileOrFolderName     = $fileOrFolder
            check32BitOn64System = $check32
            detectionType        = switch ($operator) {
                'exists'             { 'exists' }
                'notExists'          { 'doesNotExist' }
                'equal'              { 'equal' }
                'greaterThanOrEqual' { 'greaterThanOrEqual' }
                default              { 'exists' }
            }
            detectionValue       = $versionVal
        }
        return @($rule)
    }

    'msi-product-code' {
        $productCode   = Read-YamlScalar $yaml 'product_code'
        $versionOp     = Read-YamlScalar $yaml 'version_operator' ?? 'greaterThanOrEqual'
        $versionVal    = Read-YamlScalar $yaml 'version'

        if (-not $productCode) {
            throw "package.yaml detection.msi.product_code is required for msi-product-code mode"
        }

        $rule = @{
            '@odata.type'    = '#microsoft.graph.win32LobAppProductCodeDetection'
            productCode      = $productCode
            productVersionOperator = switch ($versionOp) {
                'greaterThanOrEqual' { 'greaterThanOrEqual' }
                'equal'              { 'equal' }
                default              { 'greaterThanOrEqual' }
            }
            productVersion   = $versionVal
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
