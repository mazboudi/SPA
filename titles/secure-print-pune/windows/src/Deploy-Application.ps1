<#
.SYNOPSIS
  Fiserv Secure Print - Pune — PSADT Deploy-Application.ps1 overlay.

.DESCRIPTION
  Installs/removes a network printer (\\10.253.57.135\corp secureprint pune)
  as the logged-on user, then writes a registry marker for Intune detection.

  This file overlays the framework's Deploy-Application.ps1 at build time.
  Only title-specific logic is placed here; the framework handles logging,
  module import, and session lifecycle.

.NOTES
  Original author : Joe Cassera
  Refactored for  : SPA Factory Model (psadt-enterprise 4.1.0)
  App version     : 2.3
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

# ── App metadata ──────────────────────────────────────────────────────────────
$AppVendor   = 'Fiserv'
$AppName     = 'Secure Print - Pune'
$AppVersion  = '2.3'
$PrinterName = '\\10.253.57.135\corp secureprint pune'
$StagingDir  = 'C:\ProgramData\SecurePrint_Pune'
$RegMarker   = 'HKLM:\SOFTWARE\Fiserv\InstalledApps\secure-print-pune'

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

        # Temporarily allow non-admin printer driver installation
        Set-ADTRegistryKey -LiteralPath 'HKEY_LOCAL_MACHINE\Software\Policies\Microsoft\Windows NT\Printers\PointAndPrint' `
            -Name 'RestrictDriverInstallationToAdministrators' -Type 'DWord' -Value '0'

        Start-Sleep -Seconds 5

        # Stage the install script to a temp location
        New-ADTFolder -LiteralPath $StagingDir
        Copy-ADTFile -Path "$($adtSession.DirFiles)\InstallPrinter.ps1" -Destination $StagingDir

        ## --- Installation ---
        [String] $installPhase = 'Installation'

        # Execute the printer install as the logged-on user
        $LoggedInUser = (Get-ADTLoggedOnUser).UserName
        $scriptPath   = Join-Path $StagingDir 'InstallPrinter.ps1'

        Start-ADTProcessAsUser -UserName "FEAD\$LoggedInUser" `
            -FilePath "$PSHOME\powershell.exe" `
            -ArgumentList "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$scriptPath`""

        ## --- Post-Installation ---
        [String] $installPhase = 'Post-Installation'

        # Restore the registry policy
        Remove-ADTRegistryKey -LiteralPath 'HKLM:Software\Policies\Microsoft\Windows NT\Printers\PointAndPrint' `
            -Name 'RestrictDriverInstallationToAdministrators'

        # Clean up staging directory
        Remove-ADTFolder -Path $StagingDir

        # Write registry detection marker for Intune
        Set-ADTRegistryKey -LiteralPath $RegMarker `
            -Name 'Version' -Type 'String' -Value $AppVersion
        Set-ADTRegistryKey -LiteralPath $RegMarker `
            -Name 'Publisher' -Type 'String' -Value $AppVendor
        Set-ADTRegistryKey -LiteralPath $RegMarker `
            -Name 'DisplayName' -Type 'String' -Value "$AppVendor $AppName"
    }

    ##*===============================================
    ##  UNINSTALL
    ##*===============================================
    elseif ($DeploymentType -eq 'Uninstall') {

        ## --- Pre-Uninstallation ---
        [String] $installPhase = 'Pre-Uninstallation'

        # Stage the removal script
        New-ADTFolder -LiteralPath $StagingDir
        Copy-ADTFile -Path "$($adtSession.DirFiles)\RemovePrinter.ps1" -Destination $StagingDir

        ## --- Uninstallation ---
        [String] $installPhase = 'Uninstallation'

        # Execute the printer removal as the logged-on user
        $LoggedInUser = (Get-ADTLoggedOnUser).UserName
        $scriptPath   = Join-Path $StagingDir 'RemovePrinter.ps1'

        Start-ADTProcessAsUser -UserName "FEAD\$LoggedInUser" `
            -FilePath "$PSHOME\powershell.exe" `
            -ArgumentList "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$scriptPath`""

        ## --- Post-Uninstallation ---
        [String] $installPhase = 'Post-Uninstallation'

        # Clean up staging directory
        Remove-ADTFolder -Path $StagingDir

        # Remove registry detection marker
        Remove-ADTRegistryKey -LiteralPath $RegMarker
    }

    ##*===============================================
    ##  REPAIR
    ##*===============================================
    elseif ($DeploymentType -eq 'Repair') {

        ## --- Pre-Repair ---
        [String] $installPhase = 'Pre-Repair'

        ## --- Repair ---
        [String] $installPhase = 'Repair'
        Write-ADTLogEntry -Message 'Repair not supported for this title — re-run Install.'

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
