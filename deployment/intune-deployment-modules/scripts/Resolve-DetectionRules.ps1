<#
.SYNOPSIS
  Builds Intune Win32 detection rules from package.yaml
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string] $PackageYamlPath = 'windows/package.yaml'
)

$ErrorActionPreference = 'Stop'

Import-Module "$PSScriptRoot/IntuneDeployment.psm1" -Force

$pkg = Load-PackageYaml -Path $PackageYamlPath

$detectionMode = $pkg.detection_mode ?? 'registry-marker'
Write-Host "Building detection rules for mode: $detectionMode"

switch ($detectionMode) {

    'registry-marker' {
        $reg = $pkg.detection.registry

        if (-not $reg.key_path) {
            throw "detection.registry.key_path is required"
        }

        if ($reg.hive -and $reg.hive -notin @('HKLM','HKCU')) {
            throw "Invalid hive: $($reg.hive)"
        }

        $operator = $reg.operator ?? 'exists'

        return @(@{
            '@odata.type'        = '#microsoft.graph.win32LobAppRegistryDetection'
            check32BitOn64System = $false
            keyPath              = $reg.key_path
            valueName            = $reg.value_name ?? 'Version'
            detectionType        = @{
                exists             = 'exists'
                notExists          = 'doesNotExist'
                equal              = 'equal'
                notEqual           = 'notEqual'
                greaterThanOrEqual = 'greaterThanOrEqual'
            }[$operator]
            detectionValue       = $reg.value
        })
    }

    'file' {
        $file = $pkg.detection.file

        return @(@{
            '@odata.type'        = '#microsoft.graph.win32LobAppFileSystemDetection'
            path                 = $file.path
            fileOrFolderName     = $file.file_or_folder
            detectionType        = $file.operator ?? 'exists'
            detectionValue       = $file.version
            check32BitOn64System = $file.check32BitOn64System ?? $false
        })
    }

    'msi-product-code' {
        $msi = $pkg.detection.msi

        return @(@{
            '@odata.type'          = '#microsoft.graph.win32LobAppProductCodeDetection'
            productCode            = $msi.product_code
            productVersionOperator = $msi.version_operator ?? 'greaterThanOrEqual'
            productVersion         = $msi.version
        })
    }

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
            '@odata.type'        = '#microsoft.graph.win32LobAppPowerShellScriptDetection'
            scriptContent        = $encoded
            runAs32Bit           = $false
            enforceSignatureCheck = $false
        })
    }

    default {
        throw "Unknown detection_mode: $detectionMode"
    }
}