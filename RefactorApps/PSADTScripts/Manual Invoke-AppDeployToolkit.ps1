<#

.SYNOPSIS
PSAppDeployToolkit - This script performs the installation or uninstallation of an application(s).

.DESCRIPTION
- The script is provided as a template to perform an install, uninstall, or repair of an application(s).
- The script either performs an "Install", "Uninstall", or "Repair" deployment type.
- The install deployment type is broken down into 3 main sections/phases: Pre-Install, Install, and Post-Install.

The script imports the PSAppDeployToolkit module which contains the logic and functions required to install or uninstall an application.

.PARAMETER DeploymentType
The type of deployment to perform.

.PARAMETER DeployMode
Specifies whether the installation should be run in Interactive (shows dialogs), Silent (no dialogs), NonInteractive (dialogs without prompts) mode, or Auto (shows dialogs if a user is logged on, device is not in the OOBE, and there's no running apps to close).

Silent mode is automatically set if it is detected that the process is not user interactive, no users are logged on, the device is in Autopilot mode, or there's specified processes to close that are currently running.

.PARAMETER SuppressRebootPassThru
Suppresses the 3010 return code (requires restart) from being passed back to the parent process (e.g. SCCM) if detected from an installation. If 3010 is passed back to SCCM, a reboot prompt will be triggered.

.PARAMETER TerminalServerMode
Changes to "user install mode" and back to "user execute mode" for installing/uninstalling applications for Remote Desktop Session Hosts/Citrix servers.

.PARAMETER DisableLogging
Disables logging to file for the script.

.EXAMPLE
powershell.exe -File Invoke-AppDeployToolkit.ps1

.EXAMPLE
powershell.exe -File Invoke-AppDeployToolkit.ps1 -DeployMode Silent

.EXAMPLE
powershell.exe -File Invoke-AppDeployToolkit.ps1 -DeploymentType Uninstall

.EXAMPLE
Invoke-AppDeployToolkit.exe -DeploymentType Install -DeployMode Silent

.INPUTS
None. You cannot pipe objects to this script.

.OUTPUTS
None. This script does not generate any output.

.NOTES
Toolkit Exit Code Ranges:
- 60000 - 68999: Reserved for built-in exit codes in Invoke-AppDeployToolkit.ps1, and Invoke-AppDeployToolkit.exe
- 69000 - 69999: Recommended for user customized exit codes in Invoke-AppDeployToolkit.ps1
- 70000 - 79999: Recommended for user customized exit codes in PSAppDeployToolkit.Extensions module.

.LINK
https://psappdeploytoolkit.com

#>

[CmdletBinding()]
param
(
    # Default is 'Install'.
    [Parameter(Mandatory = $false)]
    [ValidateSet('Install', 'Uninstall', 'Repair')]
    [System.String]$DeploymentType,

    # Default is 'Auto'. Don't hard-code this unless required.
    [Parameter(Mandatory = $false)]
    [ValidateSet('Auto', 'Interactive', 'NonInteractive', 'Silent')]
    [System.String]$DeployMode,

    [Parameter(Mandatory = $false)]
    [System.Management.Automation.SwitchParameter]$SuppressRebootPassThru,

    [Parameter(Mandatory = $false)]
    [System.Management.Automation.SwitchParameter]$TerminalServerMode,

    [Parameter(Mandatory = $false)]
    [System.Management.Automation.SwitchParameter]$DisableLogging
)


##================================================
## MARK: Variables
##================================================

# Zero-Config MSI support is provided when "AppName" is null or empty.
# By setting the "AppName" property, Zero-Config MSI will be disabled.
$adtSession = @{
    # App variables.
    AppVendor = 'PKWARE, Inc'
    AppName = 'PK Protect'
    AppVersion = '20.35.0008'
    AppArch = 'x64'
    AppLang = 'EN'
    AppRevision = '01'
    AppSuccessExitCodes = @(0)
    AppRebootExitCodes = @(1641, 3010)
    AppProcessesToClose = @()  # Example: @('excel', @{ Name = 'winword'; Description = 'Microsoft Word' })
    AppScriptVersion = '1.0.0'
    AppScriptDate = '2026-05-19'
    AppScriptAuthor = 'Shubham'
    RequireAdmin = $true

    # Install Titles (Only set here to override defaults set by the toolkit).
    InstallName = 'PKWARE_PKProtect_20.35.0008_v1.0'
    InstallTitle = 'PKWARE_PKProtect_20.35.0008_v1.0'

    # Script variables.
    DeployAppScriptFriendlyName = $MyInvocation.MyCommand.Name
    DeployAppScriptParameters = $PSBoundParameters
    DeployAppScriptVersion = '4.1.8'
}

function Install-ADTDeployment
{
        ##*===============================================
        ##* PRE-INSTALLATION
        ##*===============================================
        $adtSession.InstallPhase = "Pre-$($adtSession.DeploymentType)"

        ## Show Welcome Message, close Internet Explorer if required, allow up to 3 deferrals, verify there is enough disk space to complete the install, and persist the prompt
        #Show-InstallationWelcome -CloseApps 'iexplore' -AllowDefer -DeferTimes 3 -CheckDiskSpace -PersistPrompt

        ## Show Progress Message (with the default message)
        Show-ADTInstallationProgress -WindowLocation 'TopCenter'

        ## <Perform Pre-Installation tasks here>
		
		Uninstall-ADTApplication -Name 'Smartcrypt' -ApplicationType MSI
		
		Uninstall-ADTApplication -Name 'PK Protect' -ApplicationType MSI
		
		Get-ChildItem 'C:\Users\*\AppData\Local\PKWARE' | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

        ##*===============================================
        ##* INSTALLATION
        ##*===============================================
        $adtSession.InstallPhase = $adtSession.DeploymentType

        ## Handle Zero-Config MSI Installations
        If ($adtSession.UseDefaultMsi) {
            [Hashtable]$ExecuteDefaultMSISplat = @{ Action = 'Install'; FilePath = $adtSession.DefaultMsiFile }; If ($defaultMstFile) {
                $ExecuteDefaultMSISplat.Add('Transform', $defaultMstFile)
            }
            Start-ADTMsiProcess @ExecuteDefaultMSISplat; If ($defaultMspFiles) {
                $defaultMspFiles | ForEach-Object { Start-ADTMsiProcess -Action 'Patch' -FilePath $_ }
            }
        }

        ## <Perform Installation tasks here>
		
		Start-ADTMsiProcess -Action 'Install' -FilePath "$($adtSession.DirFiles)\PK Protect 20.35.0008.msi" -ArgumentList 'GENCERT=1 SYSTEMAGENT=0 ALLUSERS=1 ARPNOREMOVE=1 MSIRESTARTMANAGER=1 MSIRESTARTMANAGERCONTROL=Disable MSIRMSHUTDOWN=2 ROOTDRIVE=C:\ MSIDISABLERMRESTART=Disable REBOOT=ReallySuppress /qn /norestart'
		
        Start-Sleep -Seconds 10
        
        ##*===============================================
        ##* POST-INSTALLATION
        ##*===============================================
        $adtSession.InstallPhase = "Post-$($adtSession.DeploymentType)"

        ## <Perform Post-Installation tasks here>

        Remove-ADTRegistryKey -Key 'HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\{EB7BF890-01AE-463C-96CB-A17A8F6DC678}' -Name 'URLUpdateInfo'
        Remove-ADTRegistryKey -Key 'HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\{EB7BF890-01AE-463C-96CB-A17A8F6DC678}' -Name 'URLInfoAbout'
        Remove-ADTRegistryKey -Key 'HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\{EB7BF890-01AE-463C-96CB-A17A8F6DC678}' -Name 'Helplink'
        Set-ADTRegistryKey -LiteralPath 'HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\{EB7BF890-01AE-463C-96CB-A17A8F6DC678}' -Name 'NoModify' -Value '1' -Type 'DWORD' -ErrorAction 'stop'
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
			Write-ADTLogEntry -Message "Registry settings have been applied, continue..."
			
		}else{
			#Already exists, do nothing...
			Write-ADTLogEntry -Message "Registry settings already applied, continue..."
		}
		
		if(Test-Path -Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\PKWare_PKProtect_17.60.0008_v1.0'){
			Remove-ADTRegistryKey -Key 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\PKWare_PKProtect_17.60.0008_v1.0'
		}

        #Cleanup Desktop
        Remove-Item -Path "C:\Users\Public\Desktop\*PK Protect*" -Force -ErrorAction SilentlyContinue
		
		#Find App & PK Protect 20.35.0008 Uninstall Key

		$adtSession.AppName = 'PK Protect 20.35.0008'

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
			Where {$_.DisplayName -like ('*' + $adtSession.AppName + '*')} |
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
		Write-ADTLogEntry -Message "Updated uninstall key to include uninstall string..."

		}
		
    }

function Uninstall-ADTDeployment
{
        ##*===============================================
        ##* PRE-UNINSTALLATION
        ##*===============================================
        $adtSession.InstallPhase = "Pre-$($adtSession.DeploymentType)"

        ## Show Welcome Message, close Internet Explorer with a 60 second countdown before automatically closing
        #Show-InstallationWelcome -CloseApps 'iexplore' -CloseAppsCountdown 60

        ## Show Progress Message (with the default message)
        Show-ADTInstallationProgress -WindowLocation 'TopCenter'

        ## <Perform Pre-Uninstallation tasks here>
		

        ##*===============================================
        ##* UNINSTALLATION
        ##*===============================================
        $adtSession.InstallPhase = $adtSession.DeploymentType

        ## Handle Zero-Config MSI Uninstallations
        If ($adtSession.UseDefaultMsi) {
            [Hashtable]$ExecuteDefaultMSISplat = @{ Action = 'Uninstall'; FilePath = $adtSession.DefaultMsiFile }; If ($defaultMstFile) {
                $ExecuteDefaultMSISplat.Add('Transform', $defaultMstFile)
            }
            Start-ADTMsiProcess @ExecuteDefaultMSISplat
        }

        ## <Perform Uninstallation tasks here>
		
		Uninstall-ADTApplication -Name 'PK Protect' -ApplicationType MSI
		
		Get-ChildItem 'C:\Users\*\AppData\Local\PKWARE' | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
        
        ##*===============================================
        ##* POST-UNINSTALLATION
        ##*===============================================
        $adtSession.InstallPhase = "Post-$($adtSession.DeploymentType)"

        ## <Perform Post-Uninstallation tasks here>


    }

function Repair-ADTDeployment
{
        ##*===============================================
        ##* PRE-REPAIR
        ##*===============================================
        $adtSession.InstallPhase = "Pre-$($adtSession.DeploymentType)"

        ## Show Welcome Message, close Internet Explorer with a 60 second countdown before automatically closing
        #Show-InstallationWelcome -CloseApps 'iexplore' -CloseAppsCountdown 60

        ## Show Progress Message (with the default message)
        Show-ADTInstallationProgress -WindowLocation 'TopCenter'

        ## <Perform Pre-Repair tasks here>

        ##*===============================================
        ##* REPAIR
        ##*===============================================
        $adtSession.InstallPhase = $adtSession.DeploymentType

        ## Handle Zero-Config MSI Repairs
        If ($adtSession.UseDefaultMsi) {
            [Hashtable]$ExecuteDefaultMSISplat = @{ Action = 'Repair'; Path = $adtSession.DefaultMsiFile; }; If ($defaultMstFile) {
                $ExecuteDefaultMSISplat.Add('Transform', $defaultMstFile)
            }
            Start-ADTMsiProcess @ExecuteDefaultMSISplat
        }
        ## <Perform Repair tasks here>


        ##*===============================================
        ##* POST-REPAIR
        ##*===============================================
        $adtSession.InstallPhase = "Post-$($adtSession.DeploymentType)"

        ## <Perform Post-Repair tasks here>


    }


##================================================
## MARK: Initialization
##================================================

# Set strict error handling across entire operation.
$ErrorActionPreference = [System.Management.Automation.ActionPreference]::Stop
$ProgressPreference = [System.Management.Automation.ActionPreference]::SilentlyContinue
Set-StrictMode -Version 1

# Import the module and instantiate a new session.
try
{
    # Import the module locally if available, otherwise try to find it from PSModulePath.
    if (Test-Path -LiteralPath "$PSScriptRoot\PSAppDeployToolkit\PSAppDeployToolkit.psd1" -PathType Leaf)
    {
        Get-ChildItem -LiteralPath "$PSScriptRoot\PSAppDeployToolkit" -Recurse -File | Unblock-File -ErrorAction Ignore
        Import-Module -FullyQualifiedName @{ ModuleName = "$PSScriptRoot\PSAppDeployToolkit\PSAppDeployToolkit.psd1"; Guid = '8c3c366b-8606-4576-9f2d-4051144f7ca2'; ModuleVersion = '4.1.8' } -Force
    }
    else
    {
        Import-Module -FullyQualifiedName @{ ModuleName = 'PSAppDeployToolkit'; Guid = '8c3c366b-8606-4576-9f2d-4051144f7ca2'; ModuleVersion = '4.1.8' } -Force
    }

    # Open a new deployment session, replacing $adtSession with a DeploymentSession.
    $iadtParams = Get-ADTBoundParametersAndDefaultValues -Invocation $MyInvocation
    $adtSession = Remove-ADTHashtableNullOrEmptyValues -Hashtable $adtSession
    $adtSession = Open-ADTSession @adtSession @iadtParams -PassThru
}
catch
{
    $Host.UI.WriteErrorLine((Out-String -InputObject $_ -Width ([System.Int32]::MaxValue)))
    exit 60008
}


##================================================
## MARK: Invocation
##================================================

# Commence the actual deployment operation.
try
{
    # Import any found extensions before proceeding with the deployment.
    Get-ChildItem -LiteralPath $PSScriptRoot -Directory | & {
        process
        {
            if ($_.Name -match 'PSAppDeployToolkit\..+$')
            {
                Get-ChildItem -LiteralPath $_.FullName -Recurse -File | Unblock-File -ErrorAction Ignore
                Import-Module -Name $_.FullName -Force
            }
        }
    }

    # Invoke the deployment and close out the session.
    & "$($adtSession.DeploymentType)-ADTDeployment"
    Close-ADTSession
}
catch
{
    # An unhandled error has been caught.
    $mainErrorMessage = "An unhandled error within [$($MyInvocation.MyCommand.Name)] has occurred.`n$(Resolve-ADTErrorRecord -ErrorRecord $_)"
    Write-ADTLogEntry -Message $mainErrorMessage -Severity 3

    ## Error details hidden from the user by default. Show a simple dialog with full stack trace:
    # Show-ADTDialogBox -Text $mainErrorMessage -Icon Stop -NoWait

    ## Or, a themed dialog with basic error message:
    # Show-ADTInstallationPrompt -Message "$($adtSession.DeploymentType) failed at line $($_.InvocationInfo.ScriptLineNumber), char $($_.InvocationInfo.OffsetInLine):`n$($_.InvocationInfo.Line.Trim())`n`nMessage:`n$($_.Exception.Message)" -ButtonRightText OK -Icon Error -NoWait

    Close-ADTSession -ExitCode 60001
}
