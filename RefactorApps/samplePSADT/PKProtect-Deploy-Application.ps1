<#
.SYNOPSIS

PSApppDeployToolkit - This script performs the installation or uninstallation of an application(s).

.DESCRIPTION

- The script is provided as a template to perform an install or uninstall of an application(s).
- The script either performs an "Install" deployment type or an "Uninstall" deployment type.
- The install deployment type is broken down into 3 main sections/phases: Pre-Install, Install, and Post-Install.

The script dot-sources the AppDeployToolkitMain.ps1 script which contains the logic and functions required to install or uninstall an application.

PSApppDeployToolkit is licensed under the GNU LGPLv3 License - (C) 2023 PSAppDeployToolkit Team (Sean Lillis, Dan Cunningham and Muhammad Mashwani).

This program is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the
Free Software Foundation, either version 3 of the License, or any later version. This program is distributed in the hope that it will be useful, but
WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License
for more details. You should have received a copy of the GNU Lesser General Public License along with this program. If not, see <http://www.gnu.org/licenses/>.

.PARAMETER DeploymentType

The type of deployment to perform. Default is: Install.

.PARAMETER DeployMode

Specifies whether the installation should be run in Interactive, Silent, or NonInteractive mode. Default is: Interactive. Options: Interactive = Shows dialogs, Silent = No dialogs, NonInteractive = Very silent, i.e. no blocking apps. NonInteractive mode is automatically set if it is detected that the process is not user interactive.

.PARAMETER AllowRebootPassThru

Allows the 3010 return code (requires restart) to be passed back to the parent process (e.g. SCCM) if detected from an installation. If 3010 is passed back to SCCM, a reboot prompt will be triggered.

.PARAMETER TerminalServerMode

Changes to "user install mode" and back to "user execute mode" for installing/uninstalling applications for Remote Desktop Session Hosts/Citrix servers.

.PARAMETER DisableLogging

Disables logging to file for the script. Default is: $false.

.EXAMPLE

powershell.exe -Command "& { & '.\Deploy-Application.ps1' -DeployMode 'Silent'; Exit $LastExitCode }"

.EXAMPLE

powershell.exe -Command "& { & '.\Deploy-Application.ps1' -AllowRebootPassThru; Exit $LastExitCode }"

.EXAMPLE

powershell.exe -Command "& { & '.\Deploy-Application.ps1' -DeploymentType 'Uninstall'; Exit $LastExitCode }"

.EXAMPLE

Deploy-Application.exe -DeploymentType "Install" -DeployMode "Silent"

.INPUTS

None

You cannot pipe objects to this script.

.OUTPUTS

None

This script does not generate any output.

.NOTES

Toolkit Exit Code Ranges:
- 60000 - 68999: Reserved for built-in exit codes in Deploy-Application.ps1, Deploy-Application.exe, and AppDeployToolkitMain.ps1
- 69000 - 69999: Recommended for user customized exit codes in Deploy-Application.ps1
- 70000 - 79999: Recommended for user customized exit codes in AppDeployToolkitExtensions.ps1

.LINK

https://psappdeploytoolkit.com
#>


[CmdletBinding()]
Param (
    [Parameter(Mandatory = $false)]
    [ValidateSet('Install', 'Uninstall', 'Repair')]
    [String]$DeploymentType = 'Install',
    [Parameter(Mandatory = $false)]
    [ValidateSet('Interactive', 'Silent', 'NonInteractive')]
    [String]$DeployMode = 'Interactive',
    [Parameter(Mandatory = $false)]
    [switch]$AllowRebootPassThru = $false,
    [Parameter(Mandatory = $false)]
    [switch]$TerminalServerMode = $false,
    [Parameter(Mandatory = $false)]
    [switch]$DisableLogging = $false
)

Try {
    ## Set the script execution policy for this process
    Try {
        Set-ExecutionPolicy -ExecutionPolicy 'ByPass' -Scope 'Process' -Force -ErrorAction 'Stop'
    }
    Catch {
    }

    ##*===============================================
    ##* VARIABLE DECLARATION
    ##*===============================================
    ## Variables: Application
    [String]$appVendor = 'PKWARE, Inc'
    [String]$appName = 'PK Protect'
    [String]$appVersion = '20.35.0008'
    [String]$appArch = 'x64'
    [String]$appLang = 'EN'
    [String]$appRevision = '01'
    [String]$appScriptVersion = '1.0.0'
    [String]$appScriptDate = '1/14/2026'
    [String]$appScriptAuthor = 'Shubham'
    ##*===============================================
    ## Variables: Install Titles (Only set here to override defaults set by the toolkit)
    [String]$installName = 'PKWARE_PKProtect_20.35.0008_v1.0'
    [String]$installTitle = 'PKWARE_PKProtect_20.35.0008_v1.0'

    ##* Do not modify section below
    #region DoNotModify

    ## Variables: Exit Code
    [Int32]$mainExitCode = 0

    ## Variables: Script
    [String]$deployAppScriptFriendlyName = 'Deploy Application'
    [Version]$deployAppScriptVersion = [Version]'3.9.3'
    [String]$deployAppScriptDate = '02/05/2023'
    [Hashtable]$deployAppScriptParameters = $PsBoundParameters

    ## Variables: Environment
    If (Test-Path -LiteralPath 'variable:HostInvocation') {
        $InvocationInfo = $HostInvocation
    }
    Else {
        $InvocationInfo = $MyInvocation
    }
    [String]$scriptDirectory = Split-Path -Path $InvocationInfo.MyCommand.Definition -Parent

    ## Dot source the required App Deploy Toolkit Functions
    Try {
        [String]$moduleAppDeployToolkitMain = "$scriptDirectory\AppDeployToolkit\AppDeployToolkitMain.ps1"
        If (-not (Test-Path -LiteralPath $moduleAppDeployToolkitMain -PathType 'Leaf')) {
            Throw "Module does not exist at the specified location [$moduleAppDeployToolkitMain]."
        }
        If ($DisableLogging) {
            . $moduleAppDeployToolkitMain -DisableLogging
        }
        Else {
            . $moduleAppDeployToolkitMain
        }
    }
    Catch {
        If ($mainExitCode -eq 0) {
            [Int32]$mainExitCode = 60008
        }
        Write-Error -Message "Module [$moduleAppDeployToolkitMain] failed to load: `n$($_.Exception.Message)`n `n$($_.InvocationInfo.PositionMessage)" -ErrorAction 'Continue'
        ## Exit the script, returning the exit code to SCCM
        If (Test-Path -LiteralPath 'variable:HostInvocation') {
            $script:ExitCode = $mainExitCode; Exit
        }
        Else {
            Exit $mainExitCode
        }
    }

    #endregion
    ##* Do not modify section above
    ##*===============================================
    ##* END VARIABLE DECLARATION
    ##*===============================================

    If ($deploymentType -ine 'Uninstall' -and $deploymentType -ine 'Repair') {
        ##*===============================================
        ##* PRE-INSTALLATION
        ##*===============================================
        [String]$installPhase = 'Pre-Installation'

        ## Show Welcome Message, close Internet Explorer if required, allow up to 3 deferrals, verify there is enough disk space to complete the install, and persist the prompt
        #Show-InstallationWelcome -CloseApps 'iexplore' -AllowDefer -DeferTimes 3 -CheckDiskSpace -PersistPrompt

        ## Show Progress Message (with the default message)
        Show-InstallationProgress -WindowLocation 'TopCenter'

        ## <Perform Pre-Installation tasks here>
		
		Remove-MSIApplications -Name 'Smartcrypt'
		
		Remove-MSIApplications -Name 'PK Protect'
		
		Get-ChildItem 'C:\Users\*\AppData\Local\PKWARE' | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

        ##*===============================================
        ##* INSTALLATION
        ##*===============================================
        [String]$installPhase = 'Installation'

        ## Handle Zero-Config MSI Installations
        If ($useDefaultMsi) {
            [Hashtable]$ExecuteDefaultMSISplat = @{ Action = 'Install'; Path = $defaultMsiFile }; If ($defaultMstFile) {
                $ExecuteDefaultMSISplat.Add('Transform', $defaultMstFile)
            }
            Execute-MSI @ExecuteDefaultMSISplat; If ($defaultMspFiles) {
                $defaultMspFiles | ForEach-Object { Execute-MSI -Action 'Patch' -Path $_ }
            }
        }

        ## <Perform Installation tasks here>
		
		Execute-MSI -Action 'Install' -Path "$dirFiles\PK Protect 20.35.0008.msi" -Parameters 'GENCERT=1 SYSTEMAGENT=0 ALLUSERS=1 ARPNOREMOVE=1 MSIRESTARTMANAGER=1 MSIRESTARTMANAGERCONTROL=Disable MSIRMSHUTDOWN=2 ROOTDRIVE=C:\ MSIDISABLERMRESTART=Disable REBOOT=ReallySuppress /qn /norestart'
		
        Start-Sleep -Seconds 10
        
        ##*===============================================
        ##* POST-INSTALLATION
        ##*===============================================
        [String]$installPhase = 'Post-Installation'

        ## <Perform Post-Installation tasks here>

        Remove-RegistryKey -Key 'HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\{EB7BF890-01AE-463C-96CB-A17A8F6DC678}' -Name 'URLUpdateInfo'
        Remove-RegistryKey -Key 'HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\{EB7BF890-01AE-463C-96CB-A17A8F6DC678}' -Name 'URLInfoAbout'
        Remove-RegistryKey -Key 'HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\{EB7BF890-01AE-463C-96CB-A17A8F6DC678}' -Name 'Helplink'
        Set-RegistryKey -Key 'HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\{EB7BF890-01AE-463C-96CB-A17A8F6DC678}' -Name 'NoModify' -Value '1' -Type 'DWORD' -ErrorAction 'stop'
        Start-Sleep -Seconds 10
		
		$Check = (Get-ItemProperty -Path "HKLM:\SOFTWARE\PKWARE\Smartcrypt")
		
		if(($Check.SMDS -ne "https://syxp2pscadm0001.ess.fiserv.one/mds") -OR ($Check.useIWA -ne "0") -OR ($Check.promptWithoutCredentials -ne "1") -OR ($Check.promptWithoutCredentialsInterval -ne "240")){
			
			$agentPath = $env:ProgramFiles + '\PKWARE\Smartcrypt\agent.exe' # cmiller - made path dynamic
			$discAgentPath = $env:ProgramFiles + '\PKWARE\Smartcrypt\DiscoveryAgent.exe'

			# Update registry keys (replace "keyPath" and "keyValue" with actual values)
			$keyPath1 = "HKLM:\Software\PKWARE\Smartcrypt" # cmiller - corrected path

			# cmiller - Clean up existing registry settings in $keyPath1
			Remove-ItemProperty -Path $keyPath1 -Name *

			#$keyValue1 = "pkwareops.ess.fiserv.one/mds" # cmiller - need to change to a specific cluster node FQDN. Personal preference, I like to use https://
			$keyValue1 = "https://syxp2pscadm0001.ess.fiserv.one/mds"

			Set-ItemProperty -Path $keyPath1 -Name "SMDS" -Value $keyValue1 
			Set-ItemProperty -Path $keyPath1 -Name "useIWA" -Value "0"
			Set-ItemProperty -Path $keyPath1 -Name "promptWithoutCredentials" -Value "1"
			Set-ItemProperty -Path $keyPath1 -Name "promptWithoutCredentialsInterval" -Value "240"

			Start-Process -FilePath $agentPath -NoNewWindow
			Write-Log -Message "Registry settings have been applied, continue..."
			
		}else{
			#Already exists, do nothing...
			Write-Log -Message "Registry settings already applied, continue..."
		}
		
		if(Test-Path -Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\PKWare_PKProtect_17.60.0008_v1.0'){
			Remove-RegistryKey -Key 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\PKWare_PKProtect_17.60.0008_v1.0'
		}

        #Cleanup Desktop
        Remove-Item -Path "C:\Users\Public\Desktop\*PK Protect*" -Force -ErrorAction SilentlyContinue
		
		#Find App & PK Protect 20.35.0008 Uninstall Key

		$appName = 'PK Protect 20.35.0008'

		# Set registry keys to search
		$registryUninstallx64 = 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall'
		$registryUninstallx86 = 'HKLM:\Software\Wow6432Node\Microsoft\Windows\CurrentVersion\Uninstall'
		$regKeyList = $registryUninstallx86,$registryUninstallx64
			   
		# Grab info from registry
		$returnList = (
			$regKeyList |
			ForEach{Get-ItemProperty ($_ + '\*')} |
			Select PSChildName,
					DisplayName,
					Publisher,
					DisplayVersion,
					UninstallString,
					DisplayIcon,
					EstimatedSize,
					Version,
					InstallDate,
					InstallLocation,
					InstallSource,
					ModifyPath,
					PSPath |
			Sort -Unique PSChildName
		)
		# Find matching apps by name
		$foundApp = (
			$returnList |
			Where {$_.DisplayName -like ('*' + $AppName + '*')} |
			Where {$_ -ne $null} #strip null entries
		)

		$ProdKey = ($foundApp).PSChildName

        $UninstallString = "MsiExec.exe /X $ProdKey"

		$UninstallKey = ($FoundApp).PSPath

		$Trim = $UninstallKey.TrimStart("Microsoft.PowerShell.Core\Registry::")
        $Replace = $trim -replace "HKEY_LOCAL_MACHINE", "HKLM:"

		# If there were results
		If ($foundApp){

        New-ItemProperty -Path $Replace -Name "UninstallString" -Value $UninstallString -Force
		Write-Log -Message "Updated uninstall key to include uninstall string..."

		}
		
    }
    ElseIf ($deploymentType -ieq 'Uninstall') {
        ##*===============================================
        ##* PRE-UNINSTALLATION
        ##*===============================================
        [String]$installPhase = 'Pre-Uninstallation'

        ## Show Welcome Message, close Internet Explorer with a 60 second countdown before automatically closing
        #Show-InstallationWelcome -CloseApps 'iexplore' -CloseAppsCountdown 60

        ## Show Progress Message (with the default message)
        Show-InstallationProgress -WindowLocation 'TopCenter'

        ## <Perform Pre-Uninstallation tasks here>
		

        ##*===============================================
        ##* UNINSTALLATION
        ##*===============================================
        [String]$installPhase = 'Uninstallation'

        ## Handle Zero-Config MSI Uninstallations
        If ($useDefaultMsi) {
            [Hashtable]$ExecuteDefaultMSISplat = @{ Action = 'Uninstall'; Path = $defaultMsiFile }; If ($defaultMstFile) {
                $ExecuteDefaultMSISplat.Add('Transform', $defaultMstFile)
            }
            Execute-MSI @ExecuteDefaultMSISplat
        }

        ## <Perform Uninstallation tasks here>
		
		Remove-MSIApplications -Name 'PK Protect'
		
		Get-ChildItem 'C:\Users\*\AppData\Local\PKWARE' | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
        
        ##*===============================================
        ##* POST-UNINSTALLATION
        ##*===============================================
        [String]$installPhase = 'Post-Uninstallation'

        ## <Perform Post-Uninstallation tasks here>


    }
    ElseIf ($deploymentType -ieq 'Repair') {
        ##*===============================================
        ##* PRE-REPAIR
        ##*===============================================
        [String]$installPhase = 'Pre-Repair'

        ## Show Welcome Message, close Internet Explorer with a 60 second countdown before automatically closing
        #Show-InstallationWelcome -CloseApps 'iexplore' -CloseAppsCountdown 60

        ## Show Progress Message (with the default message)
        Show-InstallationProgress -WindowLocation 'TopCenter'

        ## <Perform Pre-Repair tasks here>

        ##*===============================================
        ##* REPAIR
        ##*===============================================
        [String]$installPhase = 'Repair'

        ## Handle Zero-Config MSI Repairs
        If ($useDefaultMsi) {
            [Hashtable]$ExecuteDefaultMSISplat = @{ Action = 'Repair'; Path = $defaultMsiFile; }; If ($defaultMstFile) {
                $ExecuteDefaultMSISplat.Add('Transform', $defaultMstFile)
            }
            Execute-MSI @ExecuteDefaultMSISplat
        }
        ## <Perform Repair tasks here>


        ##*===============================================
        ##* POST-REPAIR
        ##*===============================================
        [String]$installPhase = 'Post-Repair'

        ## <Perform Post-Repair tasks here>


    }
    ##*===============================================
    ##* END SCRIPT BODY
    ##*===============================================

    ## Call the Exit-Script function to perform final cleanup operations
    Exit-Script -ExitCode $mainExitCode
}
Catch {
    [Int32]$mainExitCode = 60001
    [String]$mainErrorMessage = "$(Resolve-Error)"
    Write-Log -Message $mainErrorMessage -Severity 3 -Source $deployAppScriptFriendlyName
    #Show-DialogBox -Text $mainErrorMessage -Icon 'Stop'
    Exit-Script -ExitCode $mainExitCode
}
