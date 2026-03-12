<#
.SYNOPSIS
  Google Chrome — PSADT v4 Deploy-Application.ps1 overlay
  Title: google-chrome | Version: 134.0.6998.89

.DESCRIPTION
  Installs / uninstalls Google Chrome Enterprise (MSI) silently using PSADT v4.
  After a successful install, writes a registry detection marker so Intune can
  confirm the app is present.

  This file overlays the enterprise template Deploy-Application.ps1 that ships
  in the psadt-enterprise framework bundle.
#>

[CmdletBinding()]
param (
    [ValidateSet('Install', 'Uninstall', 'Repair')]
    [String] $DeploymentType = 'Install',
    [ValidateSet('Interactive', 'Silent', 'NonInteractive')]
    [String] $DeployMode = 'Interactive',
    [Switch] $AllowRebootPassThru,
    [Switch] $TerminalServerMode,
    [Switch] $DisableLogging
)

$ErrorActionPreference = 'Stop'

# App-specific constants
$APP_NAME        = 'Google Chrome'
$APP_PUBLISHER   = 'Google LLC'
$APP_VERSION     = '134.0.6998.89'
$PRODUCT_CODE    = '{8A69D345-D564-463C-AFF1-A69D9E530F96}'
$MSI_FILE        = 'GoogleChromeEnterprise64.msi'
$REGISTRY_MARKER = 'GoogleChrome'

# Import org helpers (from psadt-enterprise framework bundle)
. "$PSScriptRoot\helpers\Invoke-RegistryDetection.ps1"
. "$PSScriptRoot\helpers\Write-InstallLog.ps1"

try {
    Import-Module -Name (Join-Path $PSScriptRoot 'PSAppDeployToolkit\PSAppDeployToolkit.psd1') -Force

    $adtSession = Open-ADTSession -SessionState $ExecutionContext.SessionState `
        -DeploymentType $DeploymentType `
        -DeployMode $DeployMode `
        -AllowRebootPassThru:$AllowRebootPassThru `
        -TerminalServerMode:$TerminalServerMode `
        -DisableLogging:$DisableLogging `
        -PassThru

    ##──── INSTALL ─────────────────────────────────────────────────────────────
    if ($DeploymentType -eq 'Install') {

        [string]$installPhase = 'Pre-Installation'
        Write-InstallLog "Starting install of $APP_NAME $APP_VERSION"

        # Close running Chrome instances with a countdown
        Show-ADTInstallationWelcome -CloseProcesses 'chrome' `
            -CloseAppsCountdown 60 -ForceCloseAppsCountdown 180

        [string]$installPhase = 'Installation'

        # Install Chrome MSI silently
        Execute-MSI -Action 'Install' -Path $MSI_FILE `
            -Parameters '/qn REBOOT=ReallySuppress'

        [string]$installPhase = 'Post-Installation'

        # Write registry detection marker for Intune
        Invoke-RegistryDetection -AppName $REGISTRY_MARKER -Version $APP_VERSION
        Write-InstallLog "$APP_NAME $APP_VERSION installed successfully."
    }

    ##──── UNINSTALL ───────────────────────────────────────────────────────────
    elseif ($DeploymentType -eq 'Uninstall') {

        [string]$installPhase = 'Pre-Uninstallation'
        Show-ADTInstallationWelcome -CloseProcesses 'chrome' -CloseAppsCountdown 60

        [string]$installPhase = 'Uninstallation'
        Execute-MSI -Action 'Uninstall' -Path $PRODUCT_CODE

        [string]$installPhase = 'Post-Uninstallation'
        Remove-RegistryDetection -AppName $REGISTRY_MARKER
        Write-InstallLog "$APP_NAME uninstalled successfully."
    }

    ##──── REPAIR ──────────────────────────────────────────────────────────────
    elseif ($DeploymentType -eq 'Repair') {

        [string]$installPhase = 'Repair'
        Show-ADTInstallationWelcome -CloseProcesses 'chrome' -CloseAppsCountdown 60
        Execute-MSI -Action 'Repair' -Path $PRODUCT_CODE
        Invoke-RegistryDetection -AppName $REGISTRY_MARKER -Version $APP_VERSION
        Write-InstallLog "$APP_NAME repaired."
    }

} catch {
    Write-ADTLogEntry -Message "Deployment failed in [$installPhase]: $($_.Exception.Message)" -Severity 3
    Close-ADTSession -ExitCode 60001
    throw
} finally {
    Close-ADTSession
}
