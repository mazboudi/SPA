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
	[string]$appVendor = 'Verient'                                    
	[string]$appName = 'DesktopClientTools'
	[string]$appVersion = '15.2.9'
	[string]$appArch = 'x64'
	[string]$appLang = 'EN'
	[string]$appRevision = '01'
	[string]$appScriptVersion = '1.0.0'
	[string]$appScriptDate = '09/29/2023'
	[string]$appScriptAuthor = 'b.shrunga@fiserv.com'
	##*===============================================
	## Variables: Install Titles (Only set here to override defaults set by the toolkit)
	[string]$installName = ''
	[string]$installTitle = ''
    [string]$value = Get-Date
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
        
		#Close apps
        Show-InstallationWelcome -CloseApps 'aimtray,captureservice,wcapw32,wcapwlistener,verint.dms.connectionmanager,Verint.DPA.DCUWindowsService,Verint.DMS.DesktopMessagingClient,Verint.DPA.DCUBrowserService,captest,DCUApp,DpaWfoAlert,DPAMessageClient,LoggerManager,LoggerServer,LoggerServerMonitor,LoggerViewer,Gacutil,RegAsm,MsgPop,mspvdx,PopData,svstr,TSStart,java,javaw,jabswitch,java-rmi,javacpl,javaws,jp2launcher,jqs,keytool,kinit,klist,ktab,orbd,pack200,policytool,rmid,rmiregistry,servertool,ssvagent,tnameserv,unpack200' -AllowDeferCloseApps -CheckDiskSpace -PersistPrompt -CloseAppsCountdown 5400 -MinimizeWindows $false

		
		## Show Progress Message (with the default message)
		Show-InstallationProgress -WindowLocation 'TopCenter'

		## Stop Services
        If (Test-ServiceExists -Name "DCUBrowserService") {
			Stop-ServiceAndDependencies -Name "DCUBrowserService"
        }

        ## Terminate Processes
        If (Get-Process -Name 'DCUapp' -ErrorAction SilentlyContinue) {
		    Execute-Process -Path "TASKKILL" -Parameters "/F /IM DCUapp.exe /t" -WindowStyle Hidden
            Start-Sleep -Seconds 5
        }
        If (Get-Process -Name 'DPAWow64' -ErrorAction SilentlyContinue) {
		    Execute-Process -Path "TASKKILL" -Parameters "/F /IM DPAWow64.exe /t" -WindowStyle Hidden
            Start-Sleep -Seconds 5
        }

        If (Get-Process -Name 'svstr' -ErrorAction SilentlyContinue) {
		    Execute-Process -Path "TASKKILL" -Parameters "/F /IM svstr.exe /t" -WindowStyle Hidden
            Start-Sleep -Seconds 5
        }

        If (Get-Process -Name 'DPAMessageClient' -ErrorAction SilentlyContinue) {
		    Execute-Process -Path "TASKKILL" -Parameters "/F /IM DPAMessageClient.exe /t" -WindowStyle Hidden
            Start-Sleep -Seconds 5
        }

        If (Get-Process -Name 'CaptureService' -ErrorAction SilentlyContinue) {
		    Execute-Process -Path "TASKKILL" -Parameters "/F /IM CaptureService.exe /t" -WindowStyle Hidden
            Start-Sleep -Seconds 5
        }

		## Uninstall All Screen Capture Module Versions
        $ScreenCapture = Get-InstalledApplication -Name 'Screen Capture Module' -Exact
        If($ScreenCapture) {
			Write-Log -Message "Attempting to Removing Screen Capture Module."
        "{4F6241BF-B9B8-4439-8185-1D8FA52C1061}", <# 15.2.8.747 #>`
			"{BF4A5C34-57F2-4727-A1EB-359BD4BFEA8F}", <# 15.2.7.600 #>`
			"{8585ED5A-B7B3-4D27-85CF-105FD1E617F3}", <# 15.2.5.377 #>`
			"{AF86FAB8-F969-49C2-B0BD-0948E625248B}", <# 15.2 #>`
			"{E473C64C-48DF-4205-AE89-1093ABF80BEE}", <# 15.1 #>`
			"{ACF6A782-283F-474D-8EA4-F4A0D91A3B81}", <# 11 #>`
			"{F894CFF6-1501-43C1-8C51-69E769C4CD21}", <#  #>`
			"{3F69F2D9-FCB0-44F6-B4B9-61A82FD5A408}", <#  #>`
			"{DA905477-8428-49B7-A8F2-EC029CBAC023}" <#  #>`
				| ForEach-Object { Execute-MSI -Action 'Uninstall' -Path "$_" } <# foreach item, uninstall #>
        }
        Remove-MSIApplications -Name 'Screen Capture Module' -Exact -Parameters '/qn /norestart'
        $RecheckScapture = Get-InstalledApplication -Name 'Screen Capture Module' -Exact
        If($RecheckScapture) {
			Write-Log -Message "Screen Capture Module Removal Failed."
        }
        Else {
			Write-Log -Message "Screen Capture Module Successfully Removed."
        }

		## Uninstall All Playback Versions
        $Playback = Get-InstalledApplication -Name 'Playback' -Exact
        If($Playback) {		
			"{A7013F30-90A8-41C9-B6F1-7DDE49311B11}", <# 15.2.0.316 #>`
			"{FA98207B-3919-4A25-9CE8-80ADD7BAB7A7}", <# 15.2,0,300 #>`
			"{22B23068-FAAA-48EE-85F5-419C091C6333}", <# 15.2 #>`
			"{9717AA1A-3A0F-4488-A468-E5F6727FDAD2}", <# 15.1 #>`
			"{FEE25469-462E-4850-9C75-35D6BA91BC2C}", <# 11 #>`
			"{0F274A85-8973-4324-A1AB-3C32D39B9BA1}", <#  #>`
			"{6A140312-6A6F-434F-832D-A786F597989C}", <# #>`
			"{97024FA6-544F-4159-9067-C0AF13AC0F89}", <# #>`
			"{6ED181DA-F036-4734-A41D-1BEF909020F7}", <#  #>`
			"{7DB74931-8DDE-4F0D-8929-5E8294B79845}", <# #>`
			"{89EA4623-E4A6-4B10-A8C7-0C1FD8CE2EC1}" <# #>`
				| ForEach-Object { Execute-MSI -Action 'Uninstall' -Path "$_" } <# foreach item, uninstall #>
        }
        Remove-MSIApplications -Name 'Playback' -Exact -Parameters '/qn /norestart'
        $RecheckPlayback = Get-InstalledApplication -Name 'Playback' -Exact
        If($RecheckPlayback) {
			Write-Log -Message "Playback Removal Failed."
        }
		Else {
			Write-Log -Message "Playback Successfully Removed."
        }

        ## Uninstall All DPA Client Versions
        $DPAClient = Get-InstalledApplication -Name 'Desktop & Process Analytics Client*' -WildCard
        If($DPAClient) {
        "{5EA14529-9A8B-4EC4-B19E-E343468CFBA5}", <# DPA x64 15.2.8.118 #>`
		"{8BA86C5A-6042-46E0-A1B8-0C9F79E56AA2}", <# DPA x32 15.2.8.118 #>`
			"{AF2463AC-FD42-41FC-99F6-BB27CB101E12}", <# DPA x64 15.2.7.124 #>`
			"{A582BE0B-B5FB-43A6-AE21-99FCBF6C2072}", <# DPA x32 15.2.7.124 #>`
			"{BC0DB85B-747E-4AB3-9C63-741BD660555B}", <# DPA x64 15.2.5 #>`
			"{0CD4B184-A8B9-4526-B128-2CD6E7DB1970}", <# DPA x32 15.2.5 #>`
			"{CBD809D8-724F-4F63-93BC-FD674F4ED711}", <# DPA x64 15.2.2.153 Process Discovery Plugin #>`
			"{CED814F5-781C-42C3-A621-162698063695}", <# 15.1 #>`
            "{5B87EDB6-6B7A-4AE7-BECF-23A3F4F7DF9B}",`
			"{A9ABACAE-393B-4A7B-A09A-616A19D54C6C}",<# DPA x64 15.2.2.153 #>`
            "{AF694898-4B4B-46E5-A2AA-8AE4B43E4A04}",<# DPA x64 15.2.9 #>`
            "{8DEF13F1-0A13-4116-8F45-43F84FCA955D}"<# DPA x64 15.2.9 #>`
				| ForEach-Object { Execute-MSI -Action 'Uninstall' -Path "$_" } <# foreach item, uninstall #>
        }
        Remove-MSIApplications -Name 'Desktop & Process Analytics Client*' -WildCard -Parameters '/qn /norestart'
        $RecheckDPAClient = Get-InstalledApplication -Name 'Desktop & Process Analytics Client*' -WildCard
        If($RecheckDPAClient) {
			Write-Log -Message "DPA Client Removal Failed."
        }
		Else {
			Write-Log -Message "DPA Client Successfully Removed."
        }	

		## Uninstall All Desktop Connection Manager Versions
        $DCManager = Get-InstalledApplication -Name 'Desktop Messaging Connection Manager*' -WildCard
        If($DCManager) {
        "{21840FE9-B0B9-4282-9216-1ACE39764678}", <# 15.2.8.15 #>`
			"{FDFF1354-F27B-477E-BEE0-CB1407E5E6C2}", <# 15.2.7.14 #>`
			"{BD4B93DB-EFD0-4A09-997D-71543A0BE200}", <# 15.2.5 #>`
			"{8310EF63-CEB3-418A-9F49-7CE4E377F04D}", <# 15.2 #>`
			"{C9529B20-AF44-485B-8990-3C07A82D9B2E}" <# 15.1 #>`
				| ForEach-Object { Execute-MSI -Action 'Uninstall' -Path "$_" } <# foreach item, uninstall #>
        }
        Remove-MSIApplications -Name 'Desktop Messaging Connection Manager*' -WildCard -Parameters '/qn /norestart'
        $RecheckDCManager = Get-InstalledApplication -Name 'Desktop Messaging Connection Manager*' -WildCard
        If($RecheckDCManager) {
			Write-Log -Message "Desktop Messaging Connection Manager Removal Failed."
        }
		Else {
			Write-Log -Message "Desktop Messaging Connection Manager Successfully Removed."
        }

		## Uninstall All Desktop Messaging Client Versions
        $DMClient = Get-InstalledApplication -Name 'Desktop Messaging Client*' -WildCard
        If($DMClient) {
        "{44010D16-5431-4E4E-B596-725B68EA80FA}", <# 15.2.8.10 #>`	
			"{09CD1FAA-BED3-4731-9398-6F422DBB122F}", <# 15.2.7.14 #>`
			"{9D7BD7C0-28F4-4509-A5CE-E215EC775ADA}", <# 15.2.5 #>`
			"{FD7A4C10-ED8E-40F2-9B49-1867D5962152}", <# 15.2 #>`
			"{009A24B5-2EEF-44D5-98D5-F710FD7D7BA9}", <#  #>`
			"{FC770B3D-FA18-44A0-938F-4B6D1260F7D0}" <# 15.1 #>`
				| ForEach-Object { Execute-MSI -Action 'Uninstall' -Path "$_" } <# foreach item, uninstall #>
        }
        Remove-MSIApplications -Name 'Desktop Messaging Client*' -WildCard -Parameters '/qn /norestart'
        $RecheckDMClient = Get-InstalledApplication -Name 'Desktop Messaging Client*' -WildCard
        If($RecheckDMClient) {
			Write-Log -Message "Desktop Messaging Client Removal Failed."
        }
		Else {
			Write-Log -Message "Desktop Messaging Client Successfully Removed."
        }

		## Uninstall All Verint Logger Versions
        $VLogger = Get-InstalledApplication -Name 'Logger' -Exact
        If($VLogger) {	
			"{2A55E493-F199-4888-807A-9DA554A92DED}", <# 15.2.4.74 #>`
			"{5BC0BD43-6B95-43CF-960D-D30670370E2C}" <# 15.1 #>`
				| ForEach-Object { Execute-MSI -Action 'Uninstall' -Path "$_" } <# foreach item, uninstall #>
        }
        Remove-MSIApplications -Name 'Logger' -Exact -Parameters '/qn /norestart'
        $RecheckVLogger = Get-InstalledApplication -Name 'Logger' -Exact
        If($RecheckVLogger) {
			Write-Log -Message "Verint Logger Removal Failed."
        }
		Else {
			Write-Log -Message "Verint Logger Successfully Removed."
        }

        ## Uninstall All Desktop Resources Versions
        $DResources = Get-InstalledApplication -Name 'Desktop Resources Verint' -Exact
        If($DResources) {
        "{2897355D-DFC1-423F-8734-26AB9A6F2483}", <# 15.2.8.14 #>`
			"{51801F63-2D4C-45FD-8CD0-D2F7385D08A8}", <# 15.2.7.15 #>`
			"{E353C20E-5F8D-47C8-81ED-54BC60585B93}", <# 15.2 #>`
			"{9FAE0F49-CBFE-47A7-8C50-767A4273996B}", <# 15.1 #>`
			"{27538D70-AE44-4CF0-ABFB-2A465C930F35}", <# 11.0 #>`
            "{4F6241BF-B9B8-4439-8185-1D8FA52C1061}" <# 15.2.8.747 #>`
				| ForEach-Object { Execute-MSI -Action 'Uninstall' -Path "$_" } <# foreach item, uninstall #>
        }
        Remove-MSIApplications -Name 'Desktop Resources Verint' -Exact -Parameters '/qn /norestart'
        $RecheckDResources = Get-InstalledApplication -Name 'Desktop Resources Verint' -Exact
        If($RecheckDResources) {
			Write-Log -Message "Desktop Resources Verint Removal Failed."
        }
		Else {
			Write-Log -Message "Desktop Resources Verint Successfully Removed."
        }

		## Enable Microsoft Messaging Queue Service (MSMQ) for DPA, if disabled
		$InstallState = Get-WmiObject -query "select * from Win32_OptionalFeature where name = 'MSMQ-Container'"
        If ($InstallState.InstallState -ne "1") {
            Write-Log -Message "Enabling MSMQ-Container feature"
            If ($envOSName -match "Windows 10") {
                Enable-WindowsOptionalFeature -Online -FeatureName "MSMQ-Container" -Source "SourcePath" -NoRestart
            }
            If ($envOSName -match "Windows 11") {
                Enable-WindowsOptionalFeature -Online -FeatureName "MSMQ-Container" -Source "SourcePath" -NoRestart
            }
           ## Wait-Process -Name "Dism"
        }
        
		$InstallState = Get-WmiObject -query "select * from Win32_OptionalFeature where name = 'MSMQ-Server'"
        If ($InstallState.InstallState -ne "1") {
            Write-Log -Message "Enabling MSMQ-Server feature"
            If ($envOSName -match "Windows 10") {
                Enable-WindowsOptionalFeature -Online -FeatureName "MSMQ-Server" -Source "SourcePath" -NoRestart
            }
           If ($envOSName -match "Windows 11") {
               Enable-WindowsOptionalFeature -Online -FeatureName "MSMQ-Server" -Source "SourcePath" -NoRestart
            }
            Wait-Process -Name "Dism"
        }
        
		$InstallState = Get-WmiObject -query "select * from Win32_OptionalFeature where name = 'MSMQ-ADIntegration'"
        If ($InstallState.InstallState -ne "1") {
            Write-Log -Message "Enabling MSMQ-ADIntegration feature"
            If ($envOSName -match "Windows 10") {
                Enable-WindowsOptionalFeature -Online -FeatureName "MSMQ-ADIntegration" -Source "SourcePath" -NoRestart
            }
            If ($envOSName -match "Windows 11") {
                Enable-WindowsOptionalFeature -Online -FeatureName "MSMQ-ADIntegration" -Source "SourcePath" -NoRestart
            }
        }
		
		## Install Prerequisites, if needed
		## Install MSXML4
		If ($Is64Bit) {
            If (-not (Test-Path -Path "$envProgramFilesX86\MSXML 4.0")) {
                Write-Log -Message "MSXML 4.0 not detected. Installing."
                Execute-MSI -Action 'Install' -Path "$dirSupportFiles\MSXML4\msxml.msi" -Parameters '/qn ALLUSERS=1 REBOOT=ReallySuppress'
            }
        }
		
        If (-not (Test-Path -Path "$envProgramFiles\MSXML 4.0")) {
            Write-Log -Message "MSXML 4.0 not detected. Installing."
            Execute-MSI -Action 'Install' -Path "$dirSupportFiles\MSXML4\msxml.msi" -Parameters '/qn ALLUSERS=1 REBOOT=ReallySuppress'
        }
		
		## Install Visual C++ Redistributable 2008
		If ($Is64Bit) {
            If (-not (Test-Path -Path "HKEY_LOCAL_MACHINE\Software\Classes\Installer\Products\67D6ECF5CD5FBA732B8B22BAC8DE1B4D")) {
                Write-Log -Message "Visual C++ 2008 x64 not detected. Installing."
                Execute-Process -Path "$dirSupportFiles\Visual C++ 2008\vcredist_x64.exe" -Parameters "/q:a /c:`"msiexec.exe /i vcredist.msi /qn`"" -IgnoreExitCodes "1638" -ContinueOnError $true
            }
        }
        
		If (-not (Test-Path -Path "HKEY_LOCAL_MACHINE\SOFTWARE\Classes\Installer\Products\6E815EB96CCE9A53884E7857C57002F0")) {
            Write-Log -Message "Visual C++ 2008 x86 not detected. Installing."
            Execute-Process -Path "$dirSupportFiles\Visual C++ 2008\vcredist_x86.exe" -Parameters "/q:a /c:`"msiexec.exe /i vcredist.msi /qn`"" -IgnoreExitCodes "1638" -ContinueOnError $true
        }
		
		## Install Visual C++ Redistributable 2010
		If ($Is64Bit) {
            If (-not (Test-Path -Path "HKEY_LOCAL_MACHINE\Software\Classes\Installer\Products\1926E8D15D0BCE53481466615F760A7F")) {
                Write-Log -Message "Visual C++ 2010 x64 not detected. Installing."
                Execute-Process -Path "$dirSupportFiles\Visual C++ 2010\vcredist_x64.exe" -Parameters "/q /norestart" -IgnoreExitCodes "1638" -ContinueOnError $true
            }
        }
        
		If (-not (Test-Path -Path "HKEY_LOCAL_MACHINE\SOFTWARE\Classes\Installer\Products\1D5E3C0FEDA1E123187686FED06E995A")) {
            Write-Log -Message "Visual C++ 2010 x86 not detected. Installing."
            Execute-Process -Path "$dirSupportFiles\Visual C++ 2010\vcredist_x86.exe" -Parameters "/q /norestart" -IgnoreExitCodes "1638" -ContinueOnError $true
        }
		
		## Install Visual C++ Redistributable 2012
		If ($Is64Bit) {
            If (-not (Test-Path -Path "HKEY_LOCAL_MACHINE\Software\Classes\Installer\Dependencies\{ca67548a-5ebe-413a-b50c-4b9ceb6d66c6}")) {
                Write-Log -Message "Visual C++ 2012 x64 not detected. Installing."
                Execute-Process -Path "$dirSupportFiles\Visual C++ 2012\vcredist_x64.exe" -Parameters "/q /norestart" -IgnoreExitCodes "1638" -ContinueOnError $true
            }
        }
        
		If (-not (Test-Path -Path "HKEY_LOCAL_MACHINE\SOFTWARE\Classes\Installer\Dependencies\{33d1fd90-4274-48a1-9bc1-97e33d9c2d6f}")) {
            Write-Log -Message "Visual C++ 2012 x86 not detected. Installing."
            Execute-Process -Path "$dirSupportFiles\Visual C++ 2012\vcredist_x86.exe" -Parameters "/q /norestart" -IgnoreExitCodes "1638" -ContinueOnError $true
        }
		
		## Install Visual C++ Redistributable 2015
		If ($Is64Bit) {
            If (-not (Test-Path -Path "HKEY_LOCAL_MACHINE\SOFTWARE\Classes\Installer\Dependencies\{d992c12e-cab2-426f-bde3-fb8c53950b0d}")) {
                Write-Log -Message "Visual C++ 2015 x64 not detected. Installing."
                Execute-Process -Path "$dirSupportFiles\Visual C++ 2015\vc_redist.x64.exe" -Parameters "/q /norestart" -IgnoreExitCodes "1638" -ContinueOnError $true
            }
        }
        
		If (-not (Test-Path -Path "HKEY_LOCAL_MACHINE\SOFTWARE\Classes\Installer\Dependencies\{e2803110-78b3-4664-a479-3611a381656a}")) {
            Write-Log -Message "Visual C++ 2015 x86 not detected. Installing."
            Execute-Process -Path "$dirSupportFiles\Visual C++ 2015\vc_redist.x86.exe" -Parameters "/q /norestart" -IgnoreExitCodes "1638" -ContinueOnError $true
        }

        ## Install Visual C++ Redistributable 2019
		If ($Is64Bit) {
            If (-not (Test-Path -Path "HKEY_LOCAL_MACHINE\SOFTWARE\Classes\Installer\Products\3367A02690A78A24580870A644384C0B")) {
                Write-Log -Message "Visual C++ 2019 x64 not detected. Installing."
                Execute-Process -Path "$dirSupportFiles\Visual C++ 2019\VC_redist.x64.exe" -Parameters "/q /norestart" -IgnoreExitCodes "1638" -ContinueOnError $true
            }
        }
        
		If (-not (Test-Path -Path "HKEY_LOCAL_MACHINE\SOFTWARE\Classes\Installer\Products\01DCD275E2FC1D341815B89DCA09680D")) {
            Write-Log -Message "Visual C++ 2019 x86 not detected. Installing."
            Execute-Process -Path "$dirSupportFiles\Visual C++ 2019\VC_redist.x86.exe" -Parameters "/q /norestart" -IgnoreExitCodes "1638" -ContinueOnError $true
        }
		
		## Install .NET Framework 4.6.2
		$DotNetVersion = "394806"
        $DotNetInstall = "$dirSupportFiles\.NET Framework 4.6.2\NDP462-KB3151800-x86-x64-AllOS-ENU.exe"
        $DotNetParams = "/q /norestart"
        If ((Get-RegistryKey "HKLM:SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full" -Value "Release") -lt $DotNetVersion) {
			$thumbPrint = "‎8f43288ad272f3103b6fb1428485ea3014c0bcfe"
			If (-not(Test-Path -Path "Cert:\LocalMachine\Root\$thumbPrint")) {
                Write-Log -Message "Importing MicrosoftRootCertificateAuthority2011.cer for .NET Framework $DotNetVersion"
                Execute-Process -Path "certutil" -Parameters "-addstore `"Root`" `"$dirSupportFiles\.NET Framework 4.6.2\MicrosoftRootCertificateAuthority2011.cer`""
            }
            
			Write-Log -Source $deployAppScriptFriendlyName -Message ".NET version is < [string]$DotNetVersion, installing"
            Execute-Process -Path "$DotNetInstall" -Parameters "$DotNetParams" -WaitForMSIExec:$true
        }
		
		## Install Certificate      
        $DomainNameCheck = (Get-WmiObject -Class Win32_ComputerSystem).Domain
        If (-NOT ($DomainNameCheck -eq "1dc.com")) {
			##Execute-Process -Path "certutil.exe" -Parameters "-p `"Verintprod1!`" -importPFX `"$dirSupportFiles\impact360.1dc.com.pfx`""
			##Execute-Process -Path "certutil.exe" -Parameters "-f -p `"Verintprod1!`" -importPFX root `"$dirSupportFiles\impact360.1dc.com.pfx`""
        
			function Import-PfxCertificate {
				param([String]$certPath,[String]$certRootStore = “LocalMachine”,[String]$certStore = “Root”,$pfxPass = "Verintprod1!")
				$pfx = new-object System.Security.Cryptography.X509Certificates.X509Certificate2
				if ($pfxPass -eq $null) {$pfxPass = read-host “Enter the pfx password” -assecurestring}
				$pfx.import($certPath,$pfxPass,“Exportable,PersistKeySet”)
				$store = new-object System.Security.Cryptography.X509Certificates.X509Store($certStore,$certRootStore)
				$store.open(“MaxAllowed”)
				$store.add($pfx)
				$store.close()
			}

			Import-PfxCertificate -certpath "$dirSupportFiles\impact360.1dc.com.pfx"
		
			Execute-Process -Path "certutil.exe" -Parameters "-f -addstore -enterprise root `"$dirSupportFiles\FDC_InternalMediumAssurance.cer`""
			Execute-Process -Path "certutil.exe" -Parameters "-f -addstore -enterprise root `"$dirSupportFiles\FDC_MediumAssurance.cer`""
		
		}
		##*===============================================
		##* INSTALLATION
		##*===============================================
		[string]$installPhase = 'Installation'

		## Handle Zero-Config MSI Installations
		If ($useDefaultMsi) {
			[hashtable]$ExecuteDefaultMSISplat =  @{ Action = 'Install'; Path = $defaultMsiFile }; If ($defaultMstFile) { $ExecuteDefaultMSISplat.Add('Transform', $defaultMstFile) }
			}

		## <Perform Installation tasks here>

       
	 Execute-MSI -Action "Install" -Path "$dirFiles\Desktop Resources\KB213008-Verint-15.2.9.166.msi" -Parameters "USE_COMMAND_LINE=1 ALLUSERS=1 MSIRESTARTMANAGER=1 MSIRESTARTMANAGERCONTROL=Disable MSIRMSHUTDOWN=2 ROOTDRIVE=C:\ MSIDISABLERMRESTART=Disable REBOOT=ReallySuppress /qn /norestart" -ContinueOnError $false
	 Execute-MSI -Action "Install" -Path "$dirFiles\Screen Capture Module\KB212451-15.2.9.563.msi" -Parameters "ENCRYPTION_DATAENCRYPT=FALSE FQDN=TRUE SENDFQDN=1 CONN_INTG_SVC=TRUE INTG_SERVERS=W1PVAP2376.1dc.com:29522,W3PVAP1869.1dc.com:29522,W1PVAP2377.1dc.com:29522,W3PVAP1870.1dc.com:29522 ALLUSERS=1 MSIRESTARTMANAGER=1 MSIRESTARTMANAGERCONTROL=Disable MSIRMSHUTDOWN=2 ROOTDRIVE=C:\ MSIDISABLERMRESTART=Disable REBOOT=ReallySuppress /qn /norestart" -ContinueOnError $false
	 Execute-MSI -Action "Install" -Path "$dirFiles\PlayBack\KB211676-15.2.0.1676.msi" -Parameters "PLAYBACK_ENCRYPTED=1 PLAYBACK_ENCRYPTIONWEBSERVICE=verintprod.1dc.com ARPNOMODIFY=1 ALLUSERS=1 MSIRESTARTMANAGER=1 MSIRESTARTMANAGERCONTROL=Disable MSIRMSHUTDOWN=2 ROOTDRIVE=C:\ MSIDISABLERMRESTART=Disable REBOOT=ReallySuppress /qn /norestart" -ContinueOnError $false
	 Execute-MSI -Action "Install" -Path "$dirFiles\DPA Client\KB222637-64-15.2.9.254.msi" -Parameters "CONFIGSERVER=verintprod.1dc.com USEHTTPS=Y AUTOSTART=Y ALLUSERS=1 MSIRESTARTMANAGER=1 MSIRESTARTMANAGERCONTROL=Disable MSIRMSHUTDOWN=2 ROOTDRIVE=C:\ MSIDISABLERMRESTART=Disable REBOOT=ReallySuppress /qn /norestart" -passthru 
     ## Install DPA Firefox Extensions
        If (Test-Path -Path "HKLM:Software\Mozilla\Mozilla Firefox") {
            $ProfilePaths = Get-UserProfiles | Select-Object -ExpandProperty 'ProfilePath'
            ForEach ($Profile in $ProfilePaths) {
                If (-not(Test-Path -Path "$Profile\AppData\Roaming\Mozilla\Extensions\{ec8030f7-c20a-464f-9b0e-13a3a9e97384}")) {
					New-Folder -Path "$Profile\AppData\Roaming\Mozilla\Extensions\{ec8030f7-c20a-464f-9b0e-13a3a9e97384}"
                }
                Copy-File -Path "$DirSupportFiles\Firefox\dpa-client-ff-15.2.6.2@verint.com.xpi" -Destination "$Profile\AppData\Roaming\Mozilla\Extensions\{ec8030f7-c20a-464f-9b0e-13a3a9e97384}\dpa-client-ff-15.2.6.2@verint.com.xpi"
            }
        }
        Else {
			Write-Log -Message "Firefox not detected, skipping DPA Firefox extensions."
		}
	 Execute-MSI -Action "Install" -Path "$dirFiles\Desktop Connection Manager\KB221897-15.2.9.178.msi" -Parameters "SERVERADDR=verintprod.1dc.com USEHTTPS=Y USEFQDN=Y ALLUSERS=1 MSIRESTARTMANAGER=1 MSIRESTARTMANAGERCONTROL=Disable MSIRMSHUTDOWN=2 ROOTDRIVE=C:\ MSIDISABLERMRESTART=Disable REBOOT=ReallySuppress /qn /norestart" -ContinueOnError $false
	 Execute-MSI -Action "Install" -Path "$dirFiles\Desktop Messaging Client\KB221898-15.2.9.178.msi" -Parameters "AUTOSTART=Y ALLUSERS=1 MSIRESTARTMANAGER=1 MSIRESTARTMANAGERCONTROL=Disable MSIRMSHUTDOWN=2 ROOTDRIVE=C:\ MSIDISABLERMRESTART=Disable REBOOT=ReallySuppress /qn /norestart" -ContinueOnError $false
	 Execute-MSI -Action "Install" -Path "$dirFiles\Logger\KB211074-15.2.9.157.msi" -Parameters "USE_COMMAND_LINE=1 ALLUSERS=1 ARPNOMODIFY=1 MSIRESTARTMANAGER=1 MSIRESTARTMANAGERCONTROL=Disable MSIRMSHUTDOWN=2 ROOTDRIVE=C:\ MSIDISABLERMRESTART=Disable REBOOT=ReallySuppress /qn /norestart" -ContinueOnError $false
       



		##*===============================================
		##* POST-INSTALLATION
		##*===============================================
		[string]$installPhase = 'Post-Installation'

		## <Perform Post-Installation tasks here>
        Remove-RegistryKey -Key 'HKEY_LOCAL_MACHINE\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\{5256667C-27D7-4767-85B3-89153FEF5026}' -Name 'URLInfoAbout'
        Remove-RegistryKey -Key 'HKEY_LOCAL_MACHINE\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\{5256667C-27D7-4767-85B3-89153FEF5026}' -Name 'URLUpdateInfo'
        Remove-RegistryKey -Key 'HKEY_LOCAL_MACHINE\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\{5256667C-27D7-4767-85B3-89153FEF5026}' -Name 'HelpLink'

        

       #Create Dummy Registry

        $sName = "Verient_DesktopClientTools_15.2.9"
        $sDummyRegistry = "HKLM:\SOFTWARE\Fiserv\Applications\$sName"
       [hashtable]$sRegkeyName = @{'Application Name'="$appName";'InstallDate'="$value";'Manufacturer'="$appVendor";'Version'="$appVersion"}
        foreach ($sRegkeyNames in $sRegkeyName.GetEnumerator()) {
            $sRegType = 'String'
            Try {
            Set-RegistryKey -Key $sDummyRegistry -Name $sRegkeyNames.Name -Value $sRegkeyNames.Value -Type $sRegType -ErrorAction 'stop'
            Write-Log -Message "Successfully created $($sDummyRegistry)"
            }
            Catch {
            Write-Log -Message "Failed to create $($sDummyRegistry)"
            }
        }

		## If (-not $useDefaultMsi) { Show-InstallationPrompt -Message 'You can customize text to appear at the end of an install or remove it completely for unattended installations.' -ButtonRightText 'OK' -Icon Information -NoWait }
	}
	ElseIf ($deploymentType -ieq 'Uninstall')
	{
		##*===============================================
		##* PRE-UNINSTALLATION
		##*===============================================
		[string]$installPhase = 'Pre-Uninstallation'

		## Show Welcome Message, close Internet Explorer with a 60 second countdown before automatically closing
		
        Show-InstallationWelcome -CloseApps 'aimtray,captureservice,wcapw32,wcapwlistener,verint.dms.connectionmanager,Verint.DPA.DCUWindowsService,Verint.DMS.DesktopMessagingClient,Verint.DPA.DCUBrowserService,captest,DCUApp,DpaWfoAlert,DPAMessageClient,LoggerManager,LoggerServer,LoggerServerMonitor,LoggerViewer,Gacutil,RegAsm,MsgPop,mspvdx,PopData,svstr,TSStart,java,javaw,jabswitch,java-rmi,javacpl,javaws,jp2launcher,jqs,keytool,kinit,klist,ktab,orbd,pack200,policytool,rmid,rmiregistry,servertool,ssvagent,tnameserv,unpack200' -AllowDeferCloseApps -CheckDiskSpace -PersistPrompt -CloseAppsCountdown 5400 -MinimizeWindows $false
        
		## Show Progress Message (with the default message)
		Show-InstallationProgress -WindowLocation 'TopCenter'

		## <Perform Pre-Uninstallation tasks here>
        ## Stop Services
        If (Test-ServiceExists -Name "DCUBrowserService") {
			Stop-ServiceAndDependencies -Name "DCUBrowserService"
        }

        ## Terminate Processes
        If (Get-Process -Name 'DCUapp' -ErrorAction SilentlyContinue) {
		    Execute-Process -Path "TASKKILL" -Parameters "/F /IM DCUapp.exe /t" -WindowStyle Hidden
            Start-Sleep -Seconds 5
        }
        If (Get-Process -Name 'DPAWow64' -ErrorAction SilentlyContinue) {
		    Execute-Process -Path "TASKKILL" -Parameters "/F /IM DPAWow64.exe /t" -WindowStyle Hidden
            Start-Sleep -Seconds 5
        }

        If (Get-Process -Name 'svstr' -ErrorAction SilentlyContinue) {
		    Execute-Process -Path "TASKKILL" -Parameters "/F /IM svstr.exe /t" -WindowStyle Hidden
            Start-Sleep -Seconds 5
        }

        If (Get-Process -Name 'DPAMessageClient' -ErrorAction SilentlyContinue) {
		    Execute-Process -Path "TASKKILL" -Parameters "/F /IM DPAMessageClient.exe /t" -WindowStyle Hidden
            Start-Sleep -Seconds 5
        }

        If (Get-Process -Name 'CaptureService' -ErrorAction SilentlyContinue) {
		    Execute-Process -Path "TASKKILL" -Parameters "/F /IM CaptureService.exe /t" -WindowStyle Hidden
            Start-Sleep -Seconds 5
        }


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
    

        ## Uninstall All Screen Capture Module Versions
        $ScreenCapture = Get-InstalledApplication -Name 'Screen Capture Module' -Exact
        If($ScreenCapture) {
			Write-Log -Message "Attempting to Removing Screen Capture Module."
        "{4F6241BF-B9B8-4439-8185-1D8FA52C1061}", <# 15.2.8.747 #>`
			"{BF4A5C34-57F2-4727-A1EB-359BD4BFEA8F}", <# 15.2.7.600 #>`
			"{8585ED5A-B7B3-4D27-85CF-105FD1E617F3}", <# 15.2.5.377 #>`
			"{AF86FAB8-F969-49C2-B0BD-0948E625248B}", <# 15.2 #>`
			"{E473C64C-48DF-4205-AE89-1093ABF80BEE}", <# 15.1 #>`
			"{ACF6A782-283F-474D-8EA4-F4A0D91A3B81}", <# 11 #>`
			"{F894CFF6-1501-43C1-8C51-69E769C4CD21}", <#  #>`
			"{3F69F2D9-FCB0-44F6-B4B9-61A82FD5A408}", <#  #>`
	        "{DA905477-8428-49B7-A8F2-EC029CBAC023}", <#15.2.9#>`
             "{5256667C-27D7-4767-85B3-89153FEF5026}" <#15.2.9#>`
             | ForEach-Object { Execute-MSI -Action 'Uninstall' -Path "$_" } <# foreach item, uninstall #>
        }
        Remove-MSIApplications -Name 'Screen Capture Module' -Exact -Parameters '/qn /norestart'
        $RecheckScapture = Get-InstalledApplication -Name 'Screen Capture Module' -Exact
        If($RecheckScapture) {
			Write-Log -Message "Screen Capture Module Removal Failed."
        }
        Else {
			Write-Log -Message "Screen Capture Module Successfully Removed."
        }
        Execute-MSI -Action Uninstall -Path '{5256667C-27D7-4767-85B3-89153FEF5026}' -Parameters "/qn "
		## Uninstall All Playback Versions
        $Playback = Get-InstalledApplication -Name 'Playback' -Exact
        If($Playback) {		
			"{A7013F30-90A8-41C9-B6F1-7DDE49311B11}", <# 15.2.0.316 #>`
			"{FA98207B-3919-4A25-9CE8-80ADD7BAB7A7}", <# 15.2,0,300 #>`
			"{22B23068-FAAA-48EE-85F5-419C091C6333}", <# 15.2 #>`
			"{9717AA1A-3A0F-4488-A468-E5F6727FDAD2}", <# 15.1 #>`
			"{FEE25469-462E-4850-9C75-35D6BA91BC2C}", <# 11 #>`
			"{0F274A85-8973-4324-A1AB-3C32D39B9BA1}", <#  #>`
			"{6A140312-6A6F-434F-832D-A786F597989C}", <# #>`
			"{97024FA6-544F-4159-9067-C0AF13AC0F89}", <# #>`
			"{6ED181DA-F036-4734-A41D-1BEF909020F7}", <#  #>`
			"{7DB74931-8DDE-4F0D-8929-5E8294B79845}", <# #>`
			"{89EA4623-E4A6-4B10-A8C7-0C1FD8CE2EC1}", <# #>`
			"{41835F9D-59DD-4529-B7F0-542CC42B0B28}" <#15.2.9 #>`
| ForEach-Object { Execute-MSI -Action 'Uninstall' -Path "$_" } <# foreach item, uninstall #>
        }
        Remove-MSIApplications -Name 'Playback' -Exact -Parameters '/qn /norestart'
        $RecheckPlayback = Get-InstalledApplication -Name 'Playback' -Exact
        If($RecheckPlayback) {
			Write-Log -Message "Playback Removal Failed."
        }
		Else {
			Write-Log -Message "Playback Successfully Removed."
        }

        ## Uninstall All DPA Client Versions
        $DPAClient = Get-InstalledApplication -Name 'Desktop & Process Analytics Client*' -WildCard
        If($DPAClient) {
        "{5EA14529-9A8B-4EC4-B19E-E343468CFBA5}", <# DPA x64 15.2.8.118 #>`
		"{8BA86C5A-6042-46E0-A1B8-0C9F79E56AA2}", <# DPA x32 15.2.8.118 #>`
			"{AF2463AC-FD42-41FC-99F6-BB27CB101E12}", <# DPA x64 15.2.7.124 #>`
			"{A582BE0B-B5FB-43A6-AE21-99FCBF6C2072}", <# DPA x32 15.2.7.124 #>`
			"{BC0DB85B-747E-4AB3-9C63-741BD660555B}", <# DPA x64 15.2.5 #>`
			"{0CD4B184-A8B9-4526-B128-2CD6E7DB1970}", <# DPA x32 15.2.5 #>`
			"{CBD809D8-724F-4F63-93BC-FD674F4ED711}", <# DPA x64 15.2.2.153 Process Discovery Plugin #>`
			"{CED814F5-781C-42C3-A621-162698063695}", <# 15.1 #>`
            "{5B87EDB6-6B7A-4AE7-BECF-23A3F4F7DF9B}",`
			"{A9ABACAE-393B-4A7B-A09A-616A19D54C6C}",<# DPA x64 15.2.2.153 #>`
			"{AF694898-4B4B-46E5-A2AA-8AE4B43E4A04}",<# DPA x64 15.2.9 #>`
            "{8DEF13F1-0A13-4116-8F45-43F84FCA955D}"<# DPA x64 15.2.9 #>`
				| ForEach-Object { Execute-MSI -Action 'Uninstall' -Path "$_" } <# foreach item, uninstall #>
        }
        Remove-MSIApplications -Name 'Desktop & Process Analytics Client*' -WildCard -Parameters '/qn /norestart'
        $RecheckDPAClient = Get-InstalledApplication -Name 'Desktop & Process Analytics Client*' -WildCard
        If($RecheckDPAClient) {
			Write-Log -Message "DPA Client Removal Failed."
        }
		Else {
			Write-Log -Message "DPA Client Successfully Removed."
        }	

		## Uninstall All Desktop Connection Manager Versions
        $DCManager = Get-InstalledApplication -Name 'Desktop Messaging Connection Manager*' -WildCard
        If($DCManager) {
        "{21840FE9-B0B9-4282-9216-1ACE39764678}", <# 15.2.8.15 #>`
			"{FDFF1354-F27B-477E-BEE0-CB1407E5E6C2}", <# 15.2.7.14 #>`
			"{BD4B93DB-EFD0-4A09-997D-71543A0BE200}", <# 15.2.5 #>`
			"{8310EF63-CEB3-418A-9F49-7CE4E377F04D}", <# 15.2 #>`
			"{C9529B20-AF44-485B-8990-3C07A82D9B2E}", <# 15.1 #>`
			"{0366602F-6C92-4354-BC7C-994AD974F308}" <# 15.2.9 #>`
              | ForEach-Object { Execute-MSI -Action 'Uninstall' -Path "$_" } <# foreach item, uninstall #>
        }
        Remove-MSIApplications -Name 'Desktop Messaging Connection Manager*' -WildCard -Parameters '/qn /norestart'
        $RecheckDCManager = Get-InstalledApplication -Name 'Desktop Messaging Connection Manager*' -WildCard
        If($RecheckDCManager) {
			Write-Log -Message "Desktop Messaging Connection Manager Removal Failed."
        }
		Else {
			Write-Log -Message "Desktop Messaging Connection Manager Successfully Removed."
        }

		## Uninstall All Desktop Messaging Client Versions
        $DMClient = Get-InstalledApplication -Name 'Desktop Messaging Client*' -WildCard
        If($DMClient) {
        "{44010D16-5431-4E4E-B596-725B68EA80FA}", <# 15.2.8.10 #>`	
			"{09CD1FAA-BED3-4731-9398-6F422DBB122F}", <# 15.2.7.14 #>`
			"{9D7BD7C0-28F4-4509-A5CE-E215EC775ADA}", <# 15.2.5 #>`
			"{FD7A4C10-ED8E-40F2-9B49-1867D5962152}", <# 15.2 #>`
			"{009A24B5-2EEF-44D5-98D5-F710FD7D7BA9}", <#  #>`
			"{FC770B3D-FA18-44A0-938F-4B6D1260F7D0}", <# 15.1 #>`
			"{0471B603-5C8F-47D2-A8B6-2AFEB611C3BC}" <# 15.2.9 #>`
              | ForEach-Object { Execute-MSI -Action 'Uninstall' -Path "$_" } <# foreach item, uninstall #>
        }
        Remove-MSIApplications -Name 'Desktop Messaging Client*' -WildCard -Parameters '/qn /norestart'
        $RecheckDMClient = Get-InstalledApplication -Name 'Desktop Messaging Client*' -WildCard
        If($RecheckDMClient) {
			Write-Log -Message "Desktop Messaging Client Removal Failed."
        }
		Else {
			Write-Log -Message "Desktop Messaging Client Successfully Removed."
        }

		## Uninstall All Verint Logger Versions
        $VLogger = Get-InstalledApplication -Name 'Logger' -Exact
        If($VLogger) {	
			"{2A55E493-F199-4888-807A-9DA554A92DED}", <# 15.2.4.74 #>`
			"{5BC0BD43-6B95-43CF-960D-D30670370E2C}", <# 15.1 #>`
			"{72607611-A697-4C71-9FC9-9C52082CB951}" <# 15.1 #>`
               | ForEach-Object { Execute-MSI -Action 'Uninstall' -Path "$_" } <# foreach item, uninstall #>
        }
        Remove-MSIApplications -Name 'Logger' -Exact -Parameters '/qn /norestart'
        $RecheckVLogger = Get-InstalledApplication -Name 'Logger' -Exact
        If($RecheckVLogger) {
			Write-Log -Message "Verint Logger Removal Failed."
        }
		Else {
			Write-Log -Message "Verint Logger Successfully Removed."
        }

        ## Uninstall All Desktop Resources Versions
        $DResources = Get-InstalledApplication -Name 'Desktop Resources Verint' -Exact
        If($DResources) {
        "{2897355D-DFC1-423F-8734-26AB9A6F2483}", <# 15.2.8.14 #>`
			"{51801F63-2D4C-45FD-8CD0-D2F7385D08A8}", <# 15.2.7.15 #>`
			"{E353C20E-5F8D-47C8-81ED-54BC60585B93}", <# 15.2 #>`
			"{9FAE0F49-CBFE-47A7-8C50-767A4273996B}", <# 15.1 #>`
			"{27538D70-AE44-4CF0-ABFB-2A465C930F35}", <# 11.0 #>`
			"{C30A6C7B-2DFA-4389-820D-2D1307B866F7}" <# 15.2.9 #>`
              | ForEach-Object { Execute-MSI -Action 'Uninstall' -Path "$_" } <# foreach item, uninstall #>
        }
        Remove-MSIApplications -Name 'Desktop Resources Verint' -Exact -Parameters '/qn /norestart'
        $RecheckDResources = Get-InstalledApplication -Name 'Desktop Resources Verint' -Exact
        If($RecheckDResources) {
			Write-Log -Message "Desktop Resources Verint Removal Failed."
        }
		Else {
			Write-Log -Message "Desktop Resources Verint Successfully Removed."
        }

        Execute-MSI -Action "Uninstall" -Path '{5256667C-27D7-4767-85B3-89153FEF5026}' -Parameters "/qn /norestart"
		##*===============================================
		##* POST-UNINSTALLATION
		##*===============================================
		[string]$installPhase = 'Post-Uninstallation'

		## <Perform Post-Uninstallation tasks here>

       Remove-Item -Path "HKLM:\SOFTWARE\Fiserv\Applications\Verient_DesktopClientTools_15.2.9" -Force -Recurse -ErrorAction 'stop'
       
       if((test-path -path "C:\Program Files\Verint")){
				Write-Log -Message "C:\Program Files\Verint folder still exists so removing."
				Remove-Folder -path "C:\Program Files\Verint" -ContinueOnError $true
			}

       if((test-path -path "C:\Program Files (x86)\Verint")){
				Write-Log -Message "C:\Program Files (x86)\Verint folder still exists so removing."
				Remove-Folder -path "C:\Program Files (x86)\Verint" -ContinueOnError $true
			}
       if((test-path -path "C:\ProgramData\Verint")){
				Write-Log -Message "C:\ProgramData\Verint folder still exists so removing."
				Remove-Folder -path "C:\ProgramData\Verint" -ContinueOnError $true
			}
	
	}
	ElseIf ($deploymentType -ieq 'Repair')
	{
		##*===============================================
		##* PRE-REPAIR
		##*===============================================
		[string]$installPhase = 'Pre-Repair'
        Show-InstallationWelcome -CloseApps 'ConversionsPCFUtility' -AllowDeferCloseApps -CheckDiskSpace -PersistPrompt -CloseAppsCountdown 5400 -MinimizeWindows $false
        
		## Show Progress Message (with the default message)
		Show-InstallationProgress -WindowLocation 'TopCenter'

		
		## <Perform Pre-Repair tasks here>
        ## Stop Services
        If (Test-ServiceExists -Name "DCUBrowserService") {
			Stop-ServiceAndDependencies -Name "DCUBrowserService"
        }

        ## Terminate Processes
        If (Get-Process -Name 'DCUapp' -ErrorAction SilentlyContinue) {
		    Execute-Process -Path "TASKKILL" -Parameters "/F /IM DCUapp.exe /t" -WindowStyle Hidden
            Start-Sleep -Seconds 5
        }
        If (Get-Process -Name 'DPAWow64' -ErrorAction SilentlyContinue) {
		    Execute-Process -Path "TASKKILL" -Parameters "/F /IM DPAWow64.exe /t" -WindowStyle Hidden
            Start-Sleep -Seconds 5
        }

        If (Get-Process -Name 'svstr' -ErrorAction SilentlyContinue) {
		    Execute-Process -Path "TASKKILL" -Parameters "/F /IM svstr.exe /t" -WindowStyle Hidden
            Start-Sleep -Seconds 5
        }

        If (Get-Process -Name 'DPAMessageClient' -ErrorAction SilentlyContinue) {
		    Execute-Process -Path "TASKKILL" -Parameters "/F /IM DPAMessageClient.exe /t" -WindowStyle Hidden
            Start-Sleep -Seconds 5
        }

        If (Get-Process -Name 'CaptureService' -ErrorAction SilentlyContinue) {
		    Execute-Process -Path "TASKKILL" -Parameters "/F /IM CaptureService.exe /t" -WindowStyle Hidden
            Start-Sleep -Seconds 5
        }

        ## Enable Microsoft Messaging Queue Service (MSMQ) for DPA, if disabled
		$InstallState = Get-WmiObject -query "select * from Win32_OptionalFeature where name = 'MSMQ-Container'"
        If ($InstallState.InstallState -ne "1") {
            Write-Log -Message "Enabling MSMQ-Container feature"
            If ($envOSName -match "Windows 10") {
                Enable-WindowsOptionalFeature -Online -FeatureName "MSMQ-Container" -Source "SourcePath" -NoRestart
            }
            If ($envOSName -match "Windows 11") {
                Enable-WindowsOptionalFeature -Online -FeatureName "MSMQ-Container" -Source "SourcePath" -NoRestart
            }
           ## Wait-Process -Name "Dism"
        }
        
		$InstallState = Get-WmiObject -query "select * from Win32_OptionalFeature where name = 'MSMQ-Server'"
        If ($InstallState.InstallState -ne "1") {
            Write-Log -Message "Enabling MSMQ-Server feature"
            If ($envOSName -match "Windows 10") {
                Enable-WindowsOptionalFeature -Online -FeatureName "MSMQ-Server" -Source "SourcePath" -NoRestart
            }
           If ($envOSName -match "Windows 11") {
               Enable-WindowsOptionalFeature -Online -FeatureName "MSMQ-Server" -Source "SourcePath" -NoRestart
            }
            Wait-Process -Name "Dism"
        }
        
		$InstallState = Get-WmiObject -query "select * from Win32_OptionalFeature where name = 'MSMQ-ADIntegration'"
        If ($InstallState.InstallState -ne "1") {
            Write-Log -Message "Enabling MSMQ-ADIntegration feature"
            If ($envOSName -match "Windows 10") {
                Enable-WindowsOptionalFeature -Online -FeatureName "MSMQ-ADIntegration" -Source "SourcePath" -NoRestart
            }
            If ($envOSName -match "Windows 11") {
                Enable-WindowsOptionalFeature -Online -FeatureName "MSMQ-ADIntegration" -Source "SourcePath" -NoRestart
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
        Execute-MSI -Action 'Repair' -Path '{5256667C-27D7-4767-85B3-89153FEF5026}' -Parameters 'ENCRYPTION_DATAENCRYPT=FALSE FQDN=TRUE SENDFQDN=1 CONN_INTG_SVC=TRUE INTG_SERVERS=W1PVAP2376.1dc.com:29522,W3PVAP1869.1dc.com:29522,W1PVAP2377.1dc.com:29522,W3PVAP1870.1dc.com:29522 Restart_lbl=1 ALLUSERS=1 MSIRESTARTMANAGER=1 MSIRESTARTMANAGERCONTROL=Disable MSIRMSHUTDOWN=2 ROOTDRIVE=C:\ MSIDISABLERMRESTART=Disable REBOOT=ReallySuppress /qn /norestart' -ContinueOnError $false
        Execute-MSI -Action 'Repair' -Path '{41835F9D-59DD-4529-B7F0-542CC42B0B28}' -Parameters 'PLAYBACK_ENCRYPTED=1 PLAYBACK_ENCRYPTIONWEBSERVICE=verintprod.1dc.com NOREBOOT=1 ARPNOMODIFY=1 ALLUSERS=1 MSIRESTARTMANAGER=1 MSIRESTARTMANAGERCONTROL=Disable MSIRMSHUTDOWN=2 ROOTDRIVE=C:\ MSIDISABLERMRESTART=Disable REBOOT=ReallySuppress /qn /norestart' -ContinueOnError $false
        Execute-MSI -Action 'Repair' -Path '{0366602F-6C92-4354-BC7C-994AD974F308}' -Parameters 'SERVERADDR=verintprod.1dc.com USEHTTPS=Y USEFQDN=Y ALLUSERS=1 MSIRESTARTMANAGER=1 MSIRESTARTMANAGERCONTROL=Disable MSIRMSHUTDOWN=2 ROOTDRIVE=C:\ MSIDISABLERMRESTART=Disable REBOOT=ReallySuppress /qn /norestart' -ContinueOnError $false
        Execute-MSI -Action 'Repair' -Path '{0471B603-5C8F-47D2-A8B6-2AFEB611C3BC}' -Parameters 'AUTOSTART=Y ALLUSERS=1 MSIRESTARTMANAGER=1 MSIRESTARTMANAGERCONTROL=Disable MSIRMSHUTDOWN=2 ROOTDRIVE=C:\ MSIDISABLERMRESTART=Disable REBOOT=ReallySuppress /qn /norestart' -ContinueOnError $false
        Execute-MSI -Action 'Repair' -Path '{72607611-A697-4C71-9FC9-9C52082CB951}' -Parameters 'USE_COMMAND_LINE=1 ALLUSERS=1 ARPNOMODIFY=1 MSIRESTARTMANAGER=1 MSIRESTARTMANAGERCONTROL=Disable MSIRMSHUTDOWN=2 ROOTDRIVE=C:\ MSIDISABLERMRESTART=Disable REBOOT=ReallySuppress /qn /norestart' -ContinueOnError $false
        Execute-MSI -Action 'Repair' -Path '{C30A6C7B-2DFA-4389-820D-2D1307B866F7}' -Parameters 'USE_COMMAND_LINE=1 ALLUSERS=1 MSIRESTARTMANAGER=1 MSIRESTARTMANAGERCONTROL=Disable MSIRMSHUTDOWN=2 ROOTDRIVE=C:\ MSIDISABLERMRESTART=Disable REBOOT=ReallySuppress /qn /norestart' -ContinueOnError $false
         
        Remove-RegistryKey -Key 'HKEY_LOCAL_MACHINE\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\{5256667C-27D7-4767-85B3-89153FEF5026}' -Name 'URLInfoAbout'
        Remove-RegistryKey -Key 'HKEY_LOCAL_MACHINE\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\{5256667C-27D7-4767-85B3-89153FEF5026}' -Name 'URLUpdateInfo'
        Remove-RegistryKey -Key 'HKEY_LOCAL_MACHINE\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\{5256667C-27D7-4767-85B3-89153FEF5026}' -Name 'HelpLink'
     
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
