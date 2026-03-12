<#
.SYNOPSIS
  Enterprise PSADT v4 Deploy-Application.ps1 template.
  Overlay this file with your title-specific logic using the src/ folder.

.DESCRIPTION
  Provides standard Install, Uninstall, and Repair flows driven by the PSADT v4
  framework. Org-level defaults (logging path, balloon notifications, exit codes)
  are configured in Config\config.psd1.

  Title repos should NOT modify this file directly.  Instead, place a custom
  Deploy-Application.ps1 in the title's windows/src/ directory and the build
  pipeline will overlay it on top of this template.

.NOTES
  Framework : psadt-enterprise
  Version   : 4.1.0
  Upstream  : PSAppDeployToolkit 4.1.0
#>

[CmdletBinding()]
param (
    [Parameter(Mandatory = $false)]
    [ValidateSet('Install', 'Uninstall', 'Repair')]
    [String] $DeploymentType = 'Install',

    [Parameter(Mandatory = $false)]
    [ValidateSet('Interactive', 'Silent', 'NonInteractive')]
    [String] $DeployMode = 'Interactive',

    [Parameter(Mandatory = $false)]
    [Switch] $AllowRebootPassThru,

    [Parameter(Mandatory = $false)]
    [Switch] $TerminalServerMode,

    [Parameter(Mandatory = $false)]
    [Switch] $DisableLogging
)

$ErrorActionPreference = 'Stop'

try {
    ## Import the PSADT module
    Import-Module -Name (Join-Path -Path $PSScriptRoot -ChildPath 'PSAppDeployToolkit\PSAppDeployToolkit.psd1') -Force

    ## Initialize the PSADT session
    $adtSession = Open-ADTSession -SessionState $ExecutionContext.SessionState `
        -DeploymentType $DeploymentType `
        -DeployMode $DeployMode `
        -AllowRebootPassThru:$AllowRebootPassThru `
        -TerminalServerMode:$TerminalServerMode `
        -DisableLogging:$DisableLogging `
        -PassThru

    ##*===============================================
    ##  INSTALL
    ##*===============================================
    if ($DeploymentType -eq 'Install') {

        ## --- Pre-Installation ---
        [String] $installPhase = 'Pre-Installation'

        # Show welcome dialog with defer/close app options (customize as needed)
        Show-ADTInstallationWelcome -CloseAppsCountdown 60 -ForceCloseAppsCountdown 180

        ## --- Installation ---
        [String] $installPhase = 'Installation'

        # *** Title-specific install logic goes here ***
        # Example (MSI):
        # Execute-MSI -Action 'Install' -Path 'YourApp.msi' -Parameters '/qn REBOOT=ReallySuppress'
        # Example (EXE):
        # Execute-Process -Path 'Setup.exe' -Parameters '/S'

        ## --- Post-Installation ---
        [String] $installPhase = 'Post-Installation'

        # Write a registry marker so Intune detection works
        # Set-RegistryKey -Key 'HKLM:\SOFTWARE\YourOrg\InstalledApps\YourApp' -Name 'Version' -Value $adtSession.AppVersion -Type String
    }

    ##*===============================================
    ##  UNINSTALL
    ##*===============================================
    elseif ($DeploymentType -eq 'Uninstall') {

        ## --- Pre-Uninstallation ---
        [String] $installPhase = 'Pre-Uninstallation'

        Show-ADTInstallationWelcome -CloseAppsCountdown 60

        ## --- Uninstallation ---
        [String] $installPhase = 'Uninstallation'

        # *** Title-specific uninstall logic goes here ***
        # Example (MSI):
        # Execute-MSI -Action 'Uninstall' -Path '{ProductCode-Here}'
        # Example (Registry removal):
        # Remove-RegistryKey -Key 'HKLM:\SOFTWARE\YourOrg\InstalledApps\YourApp'

        ## --- Post-Uninstallation ---
        [String] $installPhase = 'Post-Uninstallation'
    }

    ##*===============================================
    ##  REPAIR
    ##*===============================================
    elseif ($DeploymentType -eq 'Repair') {

        ## --- Pre-Repair ---
        [String] $installPhase = 'Pre-Repair'

        Show-ADTInstallationWelcome -CloseAppsCountdown 60

        ## --- Repair ---
        [String] $installPhase = 'Repair'

        # *** Title-specific repair logic goes here ***
        # Example (MSI):
        # Execute-MSI -Action 'Repair' -Path '{ProductCode-Here}'

        ## --- Post-Repair ---
        [String] $installPhase = 'Post-Repair'
    }

} catch {
    Write-ADTLogEntry -Message "Deployment failed in phase [$installPhase]: $($_.Exception.Message)" -Severity 3
    Close-ADTSession -ExitCode 60001
    throw
} finally {
    Close-ADTSession
}
