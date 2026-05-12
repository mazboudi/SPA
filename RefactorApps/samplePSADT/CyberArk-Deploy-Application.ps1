<#
.SYNOPSIS
	This script performs the installation or uninstallation of an application(s).
	# LICENSE #
	PowerShell App Deployment Toolkit - Provides a set of functions to perform common application deployment tasks on Windows.
	Copyright (C) 2017 - Sean Lillis, Dan Cunningham, Muhammad Mashwani, Aman Motazedian.
	This program is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or any later version. This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
	You should have received a copy of the GNU Lesser General Public License along with this program. If not, see <http://www.gnu.org/licenses/>.
.DESCRIPTION
	The script is provided as a template to perform an install or uninstall of an application(s).
	The script either performs an "Install" deployment type or an "Uninstall" deployment type.
	The install deployment type is broken down into 3 main sections/phases: Pre-Install, Install, and Post-Install.
	The script dot-sources the AppDeployToolkitMain.ps1 script which contains the logic and functions required to install or uninstall an application.
.PARAMETER DeploymentType
	The type of deployment to perform. Default is: Install.
.PARAMETER DeployMode
	Specifies whether the installation should be run in Interactive, Silent, or NonInteractive mode. Default is: Interactive. Options: Interactive = Shows dialogs, Silent = No dialogs, NonInteractive = Very silent, i.e. no blocking apps. NonInteractive mode is automatically set if it is detected that the process is not user interactive.
.PARAMETER AllowRebootPassThru
	Allows the 3010 return code (requires restart) to be passed back to the parent process (e.g. SCCM) if detected from an installation. If 3010 is passed back to SCCM, a reboot prompt will be triggered.
.PARAMETER TerminalServerMode
	Changes to "user install mode" and back to "user execute mode" for installing/uninstalling applications for Remote Destkop Session Hosts/Citrix servers.
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
.NOTES
	Toolkit Exit Code Ranges:
	60000 - 68999: Reserved for built-in exit codes in Deploy-Application.ps1, Deploy-Application.exe, and AppDeployToolkitMain.ps1
	69000 - 69999: Recommended for user customized exit codes in Deploy-Application.ps1
	70000 - 79999: Recommended for user customized exit codes in AppDeployToolkitExtensions.ps1
.LINK
	http://psappdeploytoolkit.com
#>
[CmdletBinding()]
Param (
	[Parameter(Mandatory=$false)]
	[ValidateSet('Install','Uninstall','Repair')]
	[string]$DeploymentType = 'Install',
	[Parameter(Mandatory=$false)]
	[ValidateSet('Interactive','Silent','NonInteractive')]
	[string]$DeployMode = 'Interactive',
	[Parameter(Mandatory=$false)]
	[switch]$AllowRebootPassThru = $false,
	[Parameter(Mandatory=$false)]
	[switch]$TerminalServerMode = $false,
	[Parameter(Mandatory=$false)]
	[switch]$DisableLogging = $false
)

Try {
	## Set the script execution policy for this process
	Try { Set-ExecutionPolicy -ExecutionPolicy 'ByPass' -Scope 'Process' -Force -ErrorAction 'Stop' } Catch {}

	##*===============================================
	##* VARIABLE DECLARATION
	##*===============================================
	## Variables: Application
	[string]$appVendor = 'CyberArk Software Ltd'
	[string]$appName = 'CyberArk EPM - FeadOne'
	[string]$appVersion = '25.12.0.2827'
	[string]$appArch = 'x64'
	[string]$appLang = 'EN'
	[string]$appRevision = '01'
	[string]$appScriptVersion = '1.0.0'
	[string]$appScriptDate = '01/05/2026'
	[string]$appScriptAuthor = 'Brian.Starbuck@fiserv.com'
	##*===============================================
	## Variables: Install Titles (Only set here to override defaults set by the toolkit)
	[string]$installName = ''
	[string]$installTitle = ''

	##* Do not modify section below
	#region DoNotModify

	## Variables: Exit Code
	[int32]$mainExitCode = 0

	## Variables: Script
	[string]$deployAppScriptFriendlyName = 'Deploy Application'
	[version]$deployAppScriptVersion = [version]'3.8.3'
	[string]$deployAppScriptDate = '30/09/2020'
	[hashtable]$deployAppScriptParameters = $psBoundParameters

	## Variables: Environment
	If (Test-Path -LiteralPath 'variable:HostInvocation') { $InvocationInfo = $HostInvocation } Else { $InvocationInfo = $MyInvocation }
	[string]$scriptDirectory = Split-Path -Path $InvocationInfo.MyCommand.Definition -Parent

	## Dot source the required App Deploy Toolkit Functions
	Try {
		[string]$moduleAppDeployToolkitMain = "$scriptDirectory\AppDeployToolkit\AppDeployToolkitMain.ps1"
		If (-not (Test-Path -LiteralPath $moduleAppDeployToolkitMain -PathType 'Leaf')) { Throw "Module does not exist at the specified location [$moduleAppDeployToolkitMain]." }
		If ($DisableLogging) { . $moduleAppDeployToolkitMain -DisableLogging } Else { . $moduleAppDeployToolkitMain }
	}
	Catch {
		If ($mainExitCode -eq 0){ [int32]$mainExitCode = 60008 }
		Write-Error -Message "Module [$moduleAppDeployToolkitMain] failed to load: `n$($_.Exception.Message)`n `n$($_.InvocationInfo.PositionMessage)" -ErrorAction 'Continue'
		## Exit the script, returning the exit code to SCCM
		If (Test-Path -LiteralPath 'variable:HostInvocation') { $script:ExitCode = $mainExitCode; Exit } Else { Exit $mainExitCode }
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
		[string]$installPhase = 'Pre-Installation'

		## Show Welcome Message, close Internet Explorer if required, allow up to 3 deferrals, verify there is enough disk space to complete the install, and persist the prompt
		## Show-InstallationWelcome -CloseApps 'iexplore' -AllowDefer -DeferTimes 3 -CheckDiskSpace -PersistPrompt
        #Show-InstallationWelcome -CloseApps '' -AllowDeferCloseApps -CheckDiskSpace -PersistPrompt -CloseAppsCountdown 5400 -MinimizeWindows $false

		## Show Progress Message (with the default message)
		#Show-InstallationProgress -WindowLocation 'TopCenter'

		## <Perform Pre-Installation tasks here>

		# Confirm Checkfree domain
		#$domain = Get-WmiObject -Namespace root\cimv2 -Class Win32_ComputerSystem | select domain

        ##Removing older versions

		try {
					"{203D4C43-6485-4641-B928-36D4D5FF4987}", <# Cyberark EPM 24.4.0.1980 #>`
					"{B339080F-2DD2-444D-B94D-92A9B1410D42}",<# 24.4#>`
					"{FD38B376-6E9F-4C41-9E4D-8BE4863D71EC}", <#23.4#>`
					"{C0F7E747-A46C-4536-A2E5-5F00DB158440}", <#23.10#>`
					"{584EF1BB-DF98-4A88-BBA3-637D335E2308}", <#24.2#>`
					"{BFD0818E-0A23-4F37-A9C8-BFB95998704C}", <#24.12#>`
					"{203D4C43-6485-4641-B928-36D4D5FF4987}", <#24.7#>`
					"{0D506E26-9DA8-412A-A01D-08AECF6894A1}", <#24.2#>`
					"{4CC72562-4338-465A-97A6-899FF1BC0882}" <#24.9#>`
            			| ForEach-Object { Execute-MSI -Action 'Uninstall' -Path "$_" } <# foreach item, uninstall #>
				}
				catch {
					Write-Log $_.Exception.Message
				}

			
		
	

       
		##*===============================================
		##* INSTALLATION
		##*===============================================
		[string]$installPhase = 'Installation'

		## Handle Zero-Config MSI Installations
		If ($useDefaultMsi) {
			[hashtable]$ExecuteDefaultMSISplat =  @{ Action = 'Install'; Path = $defaultMsiFile }; If ($defaultMstFile) { $ExecuteDefaultMSISplat.Add('Transform', $defaultMstFile) }
			Execute-MSI @ExecuteDefaultMSISplat; If ($defaultMspFiles) { $defaultMspFiles | ForEach-Object { Execute-MSI -Action 'Patch' -Path $_ } }
		}

		## <Perform Installation tasks here>
		# Get Current EPM Version
		Try{
			$EPMversion = Get-ItemPropertyValue -Path "HKLM:\SOFTWARE\Viewfinity\Agent" -Name "Version"
			} Catch {Write-Log "No Version Found"}
		
		If ($EPMversion -eq '25.12.02827')
			{
			Copy-Item -Path "$dirFiles\CyberArkEPMAgentSetupWindows.config" -Destination "C:\Windows\Temp\FISV\CyberArkEPMAgentSetupWindows.config" -Force
			Execute-MSI -Action 'Install' -SkipMSIAlreadyInstalledCheck -Path "$dirFiles\vfagentsetupx64.msi" -Parameters "INSTALLATIONKEY=MF0zIWJ1ZUw0ZidhRDo8PCxjIStLb2xZSW09Ki53R3Q= REINSTALLMODE=vm SECURE_TOKEN=56A61139DCE05A9417FECBA6FAC15E9F9F9A40E31E6CF90942CA5CB4DE255CB5 CONFIGURATION=C:\Windows\Temp\FISV\CyberArkEPMAgentSetupWindows.config /qn"
			}
				Else {Copy-Item -Path "$dirFiles\CyberArkEPMAgentSetupWindows.config" -Destination "C:\Windows\Temp\FISV\CyberArkEPMAgentSetupWindows.config" -Force
				Execute-MSI -Action 'Install' -SkipMSIAlreadyInstalledCheck -Path "$dirFiles\vfagentsetupx64.msi" -Parameters "INSTALLATIONKEY=MF0zIWJ1ZUw0ZidhRDo8PCxjIStLb2xZSW09Ki53R3Q= SECURE_TOKEN=56A61139DCE05A9417FECBA6FAC15E9F9F9A40E31E6CF90942CA5CB4DE255CB5 CONFIGURATION=C:\Windows\Temp\FISV\CyberArkEPMAgentSetupWindows.config /qn"
				}

		##*===============================================
		##* POST-INSTALLATION
		##*===============================================
		[string]$installPhase = 'Post-Installation'

		## <Perform Post-Installation tasks here>

        

		## Display a message at the end of the install
		## If (-not $useDefaultMsi) { Show-InstallationPrompt -Message 'You can customize text to appear at the end of an install or remove it completely for unattended installations.' -ButtonRightText 'OK' -Icon Information -NoWait }
	}
	ElseIf ($deploymentType -ieq 'Uninstall')
	{
		##*===============================================
		##* PRE-UNINSTALLATION
		##*===============================================
		[string]$installPhase = 'Pre-Uninstallation'

		## Show Welcome Message, close Internet Explorer with a 60 second countdown before automatically closing
		#Show-InstallationWelcome -CloseApps '' -AllowDeferCloseApps -CheckDiskSpace -PersistPrompt -CloseAppsCountdown 5400 -MinimizeWindows $false

		## Show Progress Message (with the default message)
		#Show-InstallationProgress -WindowLocation 'TopCenter'

		## <Perform Pre-Uninstallation tasks here>


		##*===============================================
		##* UNINSTALLATION
		##*===============================================
		[string]$installPhase = 'Uninstallation'

		## Handle Zero-Config MSI Uninstallations
		If ($useDefaultMsi) {
			[hashtable]$ExecuteDefaultMSISplat =  @{ Action = 'Uninstall'; Path = $defaultMsiFile }; If ($defaultMstFile) { $ExecuteDefaultMSISplat.Add('Transform', $defaultMstFile) }
			Execute-MSI @ExecuteDefaultMSISplat
		}

		# <Perform Uninstallation tasks here>


		##*===============================================
		##* POST-UNINSTALLATION
		##*===============================================
		[string]$installPhase = 'Post-Uninstallation'

		## <Perform Post-Uninstallation tasks here>

       
         
	}
	ElseIf ($deploymentType -ieq 'Repair')
	{
		##*===============================================
		##* PRE-REPAIR
		##*===============================================
		[string]$installPhase = 'Pre-Repair'

		## Show Progress Message (with the default message)
		#Show-InstallationProgress -WindowLocation 'TopCenter'

		## <Perform Pre-Repair tasks here>
		If (!(Test-Path -Path "C:\Program Files\CyberArk\Endpoint Privilege Manager\Agent\vf_agent.exe"))
			{
				try {
					"{203D4C43-6485-4641-B928-36D4D5FF4987}" <# Cyberark EPM 24.4.0.1980 #>`
            			| ForEach-Object { Execute-MSI -Action 'Uninstall' -Path "$_" } <# foreach item, uninstall #>
				}
				catch {
					Write-Log $_.Exception.Message
				}
			}

		##*===============================================
		##* REPAIR
		##*===============================================
		[string]$installPhase = 'Repair'

		## Handle Zero-Config MSI Repairs
		If ($useDefaultMsi) {
			[hashtable]$ExecuteDefaultMSISplat =  @{ Action = 'Repair'; Path = $defaultMsiFile; }; If ($defaultMstFile) { $ExecuteDefaultMSISplat.Add('Transform', $defaultMstFile) }
			Execute-MSI @ExecuteDefaultMSISplat
		}
		# <Perform Repair tasks here>
		Copy-Item -Path "$dirFiles\CyberArkEPMAgentSetupWindows.config" -Destination "C:\Windows\Temp\FISV\CyberArkEPMAgentSetupWindows.config" -Force
		Execute-MSI -Action 'Install' -SkipMSIAlreadyInstalledCheck -Path "$dirFiles\vfagentsetupx64.msi" -Parameters "INSTALLATIONKEY=MF0zIWJ1ZUw0ZidhRDo8PCxjIStLb2xZSW09Ki53R3Q= REINSTALLMODE=vm CONFIGURATION=C:\Windows\Temp\FISV\CyberArkEPMAgentSetupWindows.config /qn"


		##*===============================================
		##* POST-REPAIR
		##*===============================================
		[string]$installPhase = 'Post-Repair'

		## <Perform Post-Repair tasks here>


    }
	##*===============================================
	##* END SCRIPT BODY
	##*===============================================

	## Call the Exit-Script function to perform final cleanup operations
	Exit-Script -ExitCode $mainExitCode
}
Catch {
	[int32]$mainExitCode = 60001
	[string]$mainErrorMessage = "$(Resolve-Error)"
	Write-Log -Message $mainErrorMessage -Severity 3 -Source $deployAppScriptFriendlyName
	Show-DialogBox -Text $mainErrorMessage -Icon 'Stop'
	Exit-Script -ExitCode $mainExitCode
}
