<#
.SYNOPSIS
  Builds Intune Win32 detection rules from package.yaml.

  Detection fields live directly under the 'detection:' block (2 levels deep).
  There is NO intermediate 'msi:' / 'registry:' / 'file:' sub-key.

  Supported detection_mode values:
    msi-product-code   – MSI product code / version check
    registry-marker    – Registry key/value existence or comparison
    file               – File or folder existence / version check
    script             – Inline PowerShell detection script
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string] $PackageYamlPath = 'windows/package.yaml'
)

$ErrorActionPreference = 'Stop'

Import-Module "$PSScriptRoot/IntuneDeployment.psm1" -Force

$pkg = Import-PackageYaml -Path $PackageYamlPath

$detectionMode = if ($pkg.detection_mode) { $pkg.detection_mode } else { 'registry-marker' }
Write-Host "Building detection rules for mode: $detectionMode"

# All detection fields live directly under $pkg.detection — no intermediate sub-key.
$det = $pkg.detection

switch ($detectionMode) {

    'msi-product-code' {
        if (-not $det) { throw "package.yaml: 'detection:' block is required for msi-product-code mode" }
        if (-not $det.product_code) { throw "package.yaml: detection.product_code is required for msi-product-code mode" }

        $operator = if ($det.version_operator) { $det.version_operator } else { 'greaterThanOrEqual' }

        Write-Host "  product_code    : $($det.product_code)"
        Write-Host "  version         : $($det.version)"
        Write-Host "  version_operator: $operator"

        return @(@{
            '@odata.type'          = '#microsoft.graph.win32LobAppProductCodeDetection'
            productCode            = $det.product_code
            productVersionOperator = $operator
            productVersion         = $det.version
        })
    }

    'registry-marker' {
        if (-not $det) { throw "package.yaml: 'detection:' block is required for registry-marker mode" }
        if (-not $det.key_path) { throw "package.yaml: detection.key_path is required for registry-marker mode" }

        if ($det.hive -and $det.hive -notin @('HKLM','HKCU')) {
            throw "package.yaml: detection.hive must be HKLM or HKCU (got '$($det.hive)')"
        }

        $operator  = if ($det.operator)    { $det.operator }    else { 'exists' }
        $valueName = if ($det.value_name)  { $det.value_name }  else { 'Version' }

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
            keyPath              = $det.key_path
            valueName            = $valueName
            detectionType        = $graphOperator
            detectionValue       = $det.value
        })
    }

    'file' {
        if (-not $det) { throw "package.yaml: 'detection:' block is required for file mode" }
        if (-not $det.path)           { throw "package.yaml: detection.path is required for file mode" }
        if (-not $det.file_or_folder) { throw "package.yaml: detection.file_or_folder is required for file mode" }

        $check32 = if ($det.check_32bit) { [bool]$det.check_32bit } else { $false }

        return @(@{
            '@odata.type'        = '#microsoft.graph.win32LobAppFileSystemDetection'
            path                 = $det.path
            fileOrFolderName     = $det.file_or_folder
            detectionType        = if ($det.operator) { $det.operator } else { 'exists' }
            detectionValue       = $det.version
            check32BitOn64System = $check32
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
        throw "package.yaml: unknown detection_mode '$detectionMode'. Valid values: msi-product-code, registry-marker, file, script"
    }
}