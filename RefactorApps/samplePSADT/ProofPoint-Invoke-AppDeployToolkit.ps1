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
    AppVendor = 'Proofpoint'
    AppName = 'Proofpoint DLP Agent'
    AppVersion = '4.3.3.530'
    AppArch = 'x64'
    AppLang = 'EN'
    AppRevision = '01'
    AppSuccessExitCodes = @(0)
    AppRebootExitCodes = @(1641, 3010)
    AppProcessesToClose = @()  # Example: @('excel', @{ Name = 'winword'; Description = 'Microsoft Word' })
    AppScriptVersion = '1.0.0'
    AppScriptDate = '2026-02-16'
    AppScriptAuthor = 'Joe Cassera'
    RequireAdmin = $true

    # Install Titles (Only set here to override defaults set by the toolkit).
    InstallName = 'Proofpoint DLP Agent'
    InstallTitle = 'Proofpoint DLP Agent'

    # Script variables.
    DeployAppScriptFriendlyName = $MyInvocation.MyCommand.Name
    DeployAppScriptParameters = $PSBoundParameters
    DeployAppScriptVersion = '4.1.7'
}

function Install-ADTDeployment
{
    [CmdletBinding()]
    param
    (
    )

    ##================================================
    ## MARK: Pre-Install
    ##================================================
    $adtSession.InstallPhase = "Pre-$($adtSession.DeploymentType)"

    ## Show Welcome Message, close processes if specified, allow up to 3 deferrals, verify there is enough disk space to complete the install, and persist the prompt.
    $saiwParams = @{
        AllowDefer = $true
        DeferTimes = 3
        CheckDiskSpace = $true
        PersistPrompt = $true
    }
    if ($adtSession.AppProcessesToClose.Count -gt 0)
    {
        $saiwParams.Add('CloseProcesses', $adtSession.AppProcessesToClose)
    }
    #Show-ADTInstallationWelcome @saiwParams

    ## Show Progress Message.
	Show-ADTInstallationProgress -StatusMessage 'Installation in Progress...' -WindowLocation 'TopCenter'

    ## <Perform Pre-Installation tasks here>
	
	Remove-ADTFile -LiteralPath 'C:\temp\fiserv-production_agent_install_config.json' -ErrorAction SilentlyContinue 
	Remove-ADTFile -LiteralPath 'C:\temp\fiserv-production_updater_install_config.json' -ErrorAction SilentlyContinue
	Remove-ADTFile -LiteralPath 'C:\temp\fiserv_emea_prod_agent_install_config.json' -ErrorAction SilentlyContinue
	Remove-ADTFile -LiteralPath 'C:\temp\fiserv_emea_prod_updater_install_config.json' -ErrorAction SilentlyContinue
	
	If (Test-Path -Path "HKLM:\SOFTWARE\Fiserv\Applications\Proofpoint_DataLossPrevention-Global_2.8.0.461") {
		Try {
			Remove-Item "HKLM:\SOFTWARE\Fiserv\Applications\Proofpoint_DataLossPrevention-Global_2.8.0.461" -Recurse -Force -ErrorAction SilentlyContinue
			Write-ADTLogEntry -Message "Successfully removed HKLM:\SOFTWARE\Fiserv\Applications\Proofpoint_DataLossPrevention-Global_2.8.0.461..."
		}
		Catch {
			Write-ADTLogEntry -Message "Failed to remove HKLM:\SOFTWARE\Fiserv\Applications\Proofpoint_DataLossPrevention-Global_2.8.0.461..."
		}
	}
	
	If (Test-Path -Path "HKLM:\SOFTWARE\Fiserv\Applications\Proofpoint_DataLossPrevention-Global_2.8.1.5") {
		Try {
			Remove-Item "HKLM:\SOFTWARE\Fiserv\Applications\Proofpoint_DataLossPrevention-Global_2.8.1.5" -Recurse -Force -ErrorAction SilentlyContinue
			Write-ADTLogEntry -Message "Successfully removed HKLM:\SOFTWARE\Fiserv\Applications\Proofpoint_DataLossPrevention-Global_2.8.1.5..."
		}
		Catch {
			Write-ADTLogEntry -Message "Failed to remove HKLM:\SOFTWARE\Fiserv\Applications\Proofpoint_DataLossPrevention-Global_2.8.1.5..."
		}
	}
	
	If (Test-Path -Path "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\{6043b50e-68fe-41fa-a797-4cdeab582c2e}") {
		Try {
			Remove-Item "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\{6043b50e-68fe-41fa-a797-4cdeab582c2e}" -Recurse -Force -ErrorAction SilentlyContinue
			Write-ADTLogEntry -Message "Successfully removed HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\{6043b50e-68fe-41fa-a797-4cdeab582c2e}..."
		}
		Catch {
			Write-ADTLogEntry -Message "Failed to remove HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\{6043b50e-68fe-41fa-a797-4cdeab582c2e}..."
		}
	}
	
	Uninstall-ADTApplication -Name 'Updater Utility' -ApplicationType 'MSI' -ErrorAction Stop

    ##================================================
    ## MARK: Install
    ##================================================
    $adtSession.InstallPhase = $adtSession.DeploymentType

    ## Handle Zero-Config MSI installations.
    if ($adtSession.UseDefaultMsi)
    {
        $ExecuteDefaultMSISplat = @{ Action = $adtSession.DeploymentType; FilePath = $adtSession.DefaultMsiFile }
        if ($adtSession.DefaultMstFile)
        {
            $ExecuteDefaultMSISplat.Add('Transforms', $adtSession.DefaultMstFile)
        }
        Start-ADTMsiProcess @ExecuteDefaultMSISplat
        if ($adtSession.DefaultMspFiles)
        {
            $adtSession.DefaultMspFiles | Start-ADTMsiProcess -Action Patch
        }
    }

    ## <Perform Installation tasks here>
	
	$LocationKeyCheck = (Get-ItemProperty -Path HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\EUCOps_LocationInfo -ErrorAction SilentlyContinue)

	function Get-EMEA {

	if(($LocationKeyCheck.Publisher -like 'Europe*') -or ($LocationKeyCheck.Publisher -like 'Africa*') -or ($LocationKeyCheck.Publisher -eq 'Asia/Jerusalem') -or ($LocationKeyCheck.Publisher -eq 'Asia/Dubai')){
		Write-ADTLogEntry -Message "Device location is EMEA..."
		return 1
	}else{
		Write-ADTLogEntry -Message "Device location is GLOBAL..."
		return 0
	}
	}

	$EMEA = Get-EMEA

	if($EMEA -eq '1'){
		Write-ADTLogEntry -Message "Installing with EMEA config..."
		Start-ADTProcess -FilePath 'ITMSaaSBundle-4.3.3.530-x64.exe' -ArgumentList "TargetDir=`"C:\Program Files\IT Client Utility\Client Utility`" PreConfigPath=`"$($adtSession.DirFiles)\fiserv_emea_prod_agent_install_config.json`" /install /quiet contentdetection=1 /log C:\Windows\Temp\FISV\Logs\ITMSaaSBundle_SetupLog.log" -ErrorAction Stop 
		Start-Sleep -Seconds 10
		Start-ADTMsiProcess -Action 'Install' -FilePath 'UpdaterSetup-2.3.0.97.msi' -ArgumentList "INSTALLDIR=`"C:\Program Files\Windows Client Utility\Saas Updater Utility`" PRECONFIGPATH=`"$($adtSession.DirFiles)\fiserv_emea_prod_updater_install_config.json`" ARPNOREMOVE=1 /quiet /norestart" -ErrorAction Stop
	}else{
		Write-ADTLogEntry -Message "Installing with GLOBAL config..."
		Start-ADTProcess -FilePath 'ITMSaaSBundle-4.3.3.530-x64.exe' -ArgumentList "TargetDir=`"C:\Program Files\IT Client Utility\Client Utility`" PreConfigPath=`"$($adtSession.DirFiles)\fiserv-production_agent_install_config.json`" /install /quiet contentdetection=1 /log C:\Windows\Temp\FISV\Logs\ITMSaaSBundle_SetupLog.log" -ErrorAction Stop
		Start-Sleep -Seconds 10
		Start-ADTMsiProcess -Action 'Install' -FilePath 'UpdaterSetup-2.3.0.97.msi' -ArgumentList "INSTALLDIR=`"C:\Program Files\Windows Client Utility\Saas Updater Utility`" PRECONFIGPATH=`"$($adtSession.DirFiles)\fiserv-production_updater_install_config.json`" ARPNOREMOVE=1 /quiet /norestart" -ErrorAction Stop
	}

    ##================================================
    ## MARK: Post-Install
    ##================================================
    $adtSession.InstallPhase = "Post-$($adtSession.DeploymentType)"

    ## <Perform Post-Installation tasks here>
	
	$OldCache1 = "C:\ProgramData\Package Cache\{6043b50e-68fe-41fa-a797-4cdeab582c2e}"
	$OldCache2 = "C:\ProgramData\Package Cache\{02060b4d-2c4c-4f17-8938-fb3e0226fa10}"
		
	if((Test-Path -Path $OldCache1) -or (Test-Path -Path $OldCache2)){
		Remove-Item -Path $OldCache1 -Recurse -Force -ErrorAction SilentlyContinue
		Remove-Item -Path $OldCache2 -Recurse -Force -ErrorAction SilentlyContinue
	}
	
	#Create Proofpoint UninstallKey
	
	Write-ADTLogEntry -Message "Creating Proofpoint Uninstall Key..."
	
	$InstallSource = Get-Location
	$InstallDate = Get-Date -Format 'yyyyMMdd'
	$DisplayVersion = (Get-Item "C:\Program Files\IT Client Utility\Client Utility\it-agent.exe").VersionInfo.FileVersion
	$Path = (Get-ChildItem -Path "C:\ProgramData\Package Cache\*" -Include ITMSaaSBundle.exe -Recurse -ErrorAction SilentlyContinue).Directory
	$DisplayName_GBL = "Proofpoint DLP Agent – GLOBAL"
	$DisplayName_EMEA = "Proofpoint DLP Agent – EMEA"
	$InstallLocation = "C:\Program Files\IT Client Utility\Client Utility"
	$Publisher = "Proofpoint"
	$UninstallString = "$Path\ITMSaaSBundle.exe"

	if(!(Test-Path -Path HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\ProofpointDLPAgent)){
		New-Item -Path HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\ProofpointDLPAgent -Force
	}
	
	if($EMEA -eq '1'){		
		New-ItemProperty -Path HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\ProofpointDLPAgent -Name "DisplayName" -Value $DisplayName_EMEA -Force
	}else{
		New-ItemProperty -Path HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\ProofpointDLPAgent -Name "DisplayName" -Value $DisplayName_GBL -Force
	}
	
	New-ItemProperty -Path HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\ProofpointDLPAgent -Name "DisplayVersion" -Value $DisplayVersion -Force
	New-ItemProperty -Path HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\ProofpointDLPAgent -Name "InstallLocation" -Value $InstallLocation -Force
	New-ItemProperty -Path HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\ProofpointDLPAgent -Name "Publisher" -Value $Publisher -Force
	New-ItemProperty -Path HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\ProofpointDLPAgent -Name "InstallSource" -Value $InstallSource -Force
	New-ItemProperty -Path HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\ProofpointDLPAgent -Name "InstallDate" -Value $InstallDate -Force
	New-ItemProperty -Path HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\ProofpointDLPAgent -Name "UninstallString" -Value $UninstallString -Force
	New-ItemProperty -Path HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\ProofpointDLPAgent -Name "NoModify" -PropertyType DWord -Value "1" -Force
	New-ItemProperty -Path HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\ProofpointDLPAgent -Name "NoRepair" -PropertyType DWord -Value "1" -Force

	#Hide from Programs and Features
	New-ItemProperty -Path HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\ProofpointDLPAgent -Name "SystemComponent" -PropertyType DWord -Value "1" -Force


    ## Display a message at the end of the install.
    if (!$adtSession.UseDefaultMsi)
    {
        Show-ADTInstallationPrompt -Message 'The install has completed...' -ButtonRightText 'OK' -Icon Information -NoWait -Timeout '5'
    }
}

function Uninstall-ADTDeployment
{
    [CmdletBinding()]
    param
    (
    )

    ##================================================
    ## MARK: Pre-Uninstall
    ##================================================
    $adtSession.InstallPhase = "Pre-$($adtSession.DeploymentType)"

    ## If there are processes to close, show Welcome Message with a 60 second countdown before automatically closing.
    if ($adtSession.AppProcessesToClose.Count -gt 0)
    {
        Show-ADTInstallationWelcome -CloseProcesses $adtSession.AppProcessesToClose -CloseProcessesCountdown 60
    }

    ## Show Progress Message (with the default message).
    Show-ADTInstallationProgress -StatusMessage 'Uninstall in Progress...' -WindowLocation 'TopCenter'

    ## <Perform Pre-Uninstallation tasks here>


    ##================================================
    ## MARK: Uninstall
    ##================================================
    $adtSession.InstallPhase = $adtSession.DeploymentType

    ## Handle Zero-Config MSI uninstallations.
    if ($adtSession.UseDefaultMsi)
    {
        $ExecuteDefaultMSISplat = @{ Action = $adtSession.DeploymentType; FilePath = $adtSession.DefaultMsiFile }
        if ($adtSession.DefaultMstFile)
        {
            $ExecuteDefaultMSISplat.Add('Transforms', $adtSession.DefaultMstFile)
        }
        Start-ADTMsiProcess @ExecuteDefaultMSISplat
    }

    ## <Perform Uninstallation tasks here>
	
	$UninstallString = "C:\ProgramData\Package Cache\{f31def60-ad95-43e0-a79a-bec92020d5fe}\ITMSaaSBundle.exe"
	
	#Uninstall ITMSaaSBundle
	Start-ADTProcess -FilePath $UninstallString -ArgumentList "/silent /uninstall UninstallKey=M-geEqKi /norestart /log C:\Windows\Temp\FISV\Logs\ITMSaaSBundle-Uninstall.log" -ErrorAction Stop
	
	Start-Sleep -Seconds 15
	
	#Uninstall Updater Utility
	Uninstall-ADTApplication -Name 'Updater Utility' -ApplicationType 'MSI' -ErrorAction Stop
	
	#Check for and delete uninstall key
	If (Test-Path HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\ProofpointDLPAgent) {
		Try {
			Remove-ADTRegistryKey -LiteralPath 'HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\EUCOps_DellCUConfig' -ErrorAction Stop
			Write-ADTLogEntry -Message "ProofpointDLPAgent Uninstall Key has been deleted successfully..."
		}
		Catch {
			Write-ADTLogEntry -Message "Failed to remove HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\ProofpointDLPAgent..."
		}
	}
	
	#Cleanup folders
	Remove-Item -Path "C:\Program Files\IT Client Utility" -Recurse -Force -ErrorAction SilentlyContinue
	Remove-Item -Path "C:\Program Files\Windows Client Utility" -Recurse -Force -ErrorAction SilentlyContinue

    ##================================================
    ## MARK: Post-Uninstallation
    ##================================================
    $adtSession.InstallPhase = "Post-$($adtSession.DeploymentType)"

    ## <Perform Post-Uninstallation tasks here>
	
}

function Repair-ADTDeployment
{
    [CmdletBinding()]
    param
    (
    )

    ##================================================
    ## MARK: Pre-Repair
    ##================================================
    $adtSession.InstallPhase = "Pre-$($adtSession.DeploymentType)"

    ## If there are processes to close, show Welcome Message with a 60 second countdown before automatically closing.
    if ($adtSession.AppProcessesToClose.Count -gt 0)
    {
        Show-ADTInstallationWelcome -CloseProcesses $adtSession.AppProcessesToClose -CloseProcessesCountdown 60
    }

    ## Show Progress Message (with the default message).
    Show-ADTInstallationProgress

    ## <Perform Pre-Repair tasks here>


    ##================================================
    ## MARK: Repair
    ##================================================
    $adtSession.InstallPhase = $adtSession.DeploymentType

    ## Handle Zero-Config MSI repairs.
    if ($adtSession.UseDefaultMsi)
    {
        $ExecuteDefaultMSISplat = @{ Action = $adtSession.DeploymentType; FilePath = $adtSession.DefaultMsiFile }
        if ($adtSession.DefaultMstFile)
        {
            $ExecuteDefaultMSISplat.Add('Transforms', $adtSession.DefaultMstFile)
        }
        Start-ADTMsiProcess @ExecuteDefaultMSISplat
    }

    ## <Perform Repair tasks here>


    ##================================================
    ## MARK: Post-Repair
    ##================================================
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
        Import-Module -FullyQualifiedName @{ ModuleName = "$PSScriptRoot\PSAppDeployToolkit\PSAppDeployToolkit.psd1"; Guid = '8c3c366b-8606-4576-9f2d-4051144f7ca2'; ModuleVersion = '4.1.7' } -Force
    }
    else
    {
        Import-Module -FullyQualifiedName @{ ModuleName = 'PSAppDeployToolkit'; Guid = '8c3c366b-8606-4576-9f2d-4051144f7ca2'; ModuleVersion = '4.1.7' } -Force
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

