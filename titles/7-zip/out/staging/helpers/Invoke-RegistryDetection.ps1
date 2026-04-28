<#
.SYNOPSIS
  Writes a registry marker used by Intune detection rules to confirm the application is installed.

.DESCRIPTION
  Call this function at the end of your Install block in Deploy-Application.ps1.
  The Resolve-DetectionRules.ps1 script in intune-deployment-modules generates a
  matching detection rule that reads the same registry key.

.PARAMETER AppName
  The application name (becomes the subkey under RegistryMarkerBase).

.PARAMETER Version
  The version string to write (used for version-based detection operators).

.PARAMETER RegistryMarkerBase
  Base registry path. Defaults to the value in Config\config.psd1.

.EXAMPLE
  Invoke-RegistryDetection -AppName 'GoogleChrome' -Version '134.0.6998.89'
  # Writes: HKLM:\SOFTWARE\YourOrg\InstalledApps\GoogleChrome  Version = '134.0.6998.89'
#>
function Invoke-RegistryDetection {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory)]
        [string] $AppName,

        [Parameter(Mandatory)]
        [string] $Version,

        [string] $RegistryMarkerBase = 'HKLM:\SOFTWARE\YourOrg\InstalledApps'
    )

    $key = Join-Path $RegistryMarkerBase $AppName

    # Ensure the key exists
    if (!(Test-Path $key)) {
        New-Item -Path $key -Force | Out-Null
    }

    Set-ItemProperty -Path $key -Name 'Version'     -Value $Version  -Type String
    Set-ItemProperty -Path $key -Name 'InstalledAt' -Value (Get-Date -Format 'o') -Type String

    Write-Verbose "Registry detection marker written: $key\Version = $Version"
}

<#
.SYNOPSIS
  Removes the registry detection marker on uninstall.

.PARAMETER AppName
  The application name subkey to remove.
#>
function Remove-RegistryDetection {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory)]
        [string] $AppName,

        [string] $RegistryMarkerBase = 'HKLM:\SOFTWARE\YourOrg\InstalledApps'
    )

    $key = Join-Path $RegistryMarkerBase $AppName

    if (Test-Path $key) {
        Remove-Item -Path $key -Recurse -Force -ErrorAction SilentlyContinue
        Write-Verbose "Registry detection marker removed: $key"
    }
}
