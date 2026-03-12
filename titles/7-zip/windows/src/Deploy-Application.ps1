<#
.SYNOPSIS
  7-Zip 24.08 — PSADT Deploy-Application.ps1 overlay.

.DESCRIPTION
  7-Zip is a straightforward MSI installation. The framework handles all
  logging, restart prompts, and exit code processing.
  No special pre/post steps are needed — the MSI handles everything silently.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)] [ValidateSet('Install','Uninstall','Repair')]
    [string] $DeploymentType = 'Install',
    [Parameter(Mandatory = $false)] [ValidateSet('Interactive','Silent','NonInteractive')]
    [string] $DeployMode = 'Interactive',
    [Parameter(Mandatory = $false)] [switch] $AllowRebootPassThru,
    [Parameter(Mandatory = $false)] [switch] $TerminalServerMode,
    [Parameter(Mandatory = $false)] [switch] $DisableLogging
)

. "$PSScriptRoot\AppDeployToolkit\AppDeployToolkitMain.ps1"

Switch ($DeploymentType) {

    'Install' {
        ## Close 7-Zip File Manager if open
        Show-InstallationWelcome -CloseApps '7zFM=7-Zip File Manager,7zG=7-Zip' -Silent

        ## Install via MSI — /qn = no UI, /norestart = suppress reboot, ALLUSERS=1 = machine-wide
        Execute-MSI -Action Install -Path 'Files\7z2408-x64.msi' -Parameters 'ALLUSERS=1'

        Write-ADTLogEntry -Message "7-Zip 24.08 installed successfully." -Severity 1
    }

    'Uninstall' {
        Show-InstallationWelcome -CloseApps '7zFM=7-Zip File Manager,7zG=7-Zip' -Silent

        ## Uninstall using MSI product code
        Execute-MSI -Action Uninstall -Path '{23170F69-40C1-2702-2408-000001000000}'

        Write-ADTLogEntry -Message "7-Zip 24.08 uninstalled successfully." -Severity 1
    }

    'Repair' {
        Execute-MSI -Action Repair -Path 'Files\7z2408-x64.msi'
    }
}
