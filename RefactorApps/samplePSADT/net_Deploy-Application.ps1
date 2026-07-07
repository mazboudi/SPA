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
    [String]$appVendor = '.NET Foundation'
    [String]$appName = 'Wix Toolset v3.14.1.8722'
    [String]$appVersion = '3.14.1.8722'
    [String]$appArch = 'x64'
    [String]$appLang = 'EN'
    [String]$appRevision = '01'
    [String]$appScriptVersion = '1.0.0'
    [String]$appScriptDate = '21/01/2025'
    [String]$appScriptAuthor = 'Sunaina Singh'
    ##*===============================================
    ## Variables: Install Titles (Only set here to override defaults set by the toolkit)
    [String]$installName = '.NETFoundation_WixToolsetv3.14.1.8722_3.14.1.8722'
    [String]$installTitle = '.NETFoundation_WixToolsetv3.14.1.8722_3.14.1.8722'

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

         If(Get-Process -Name 'hh' -ErrorAction SilentlyContinue)
        {
		Execute-Process -Path "TASKKILL" -Parameters "/F /IM hh.exe" -WindowStyle Hidden -ContinueOnError $true
        Start-Sleep -Seconds 5
        }

        ##Uninstalling previous versions v3.10   
       
		
        If (Test-Path -Path "$envProgramData\Package Cache\{229c8b18-b30c-409e-a47f-7d11c10aebb7}\WiX310.exe") {
            Execute-Process -Path "$envProgramData\Package Cache\{229c8b18-b30c-409e-a47f-7d11c10aebb7}\WiX310.exe" -Parameters "/uninstall /quiet"
        }

        "{DFECBAD2-D134-4B79-8330-553254ECA16C}", <# WiX Toolset v3.10 Core #>`
            "{42457736-2577-4C40-AB57-91AEBEDCE66E}" <# WiX Toolset 3.10 Managed SDK #>`
            | ForEach-Object { Execute-MSI -Action 'Uninstall' -Path "$_" } <# foreach item, uninstall #>
        
        ##Uninstalling previous versions "3.11.2.4516"
        
        		
        If (Test-Path -Path "$envProgramData\Package Cache\{7a940384-ee12-4443-8aa3-2ab82df2372a}\WiX311.exe") {
            Execute-Process -Path "$envProgramData\Package Cache\{7a940384-ee12-4443-8aa3-2ab82df2372a}\WiX311.exe" -Parameters "/uninstall /quiet"
        }
        Start-Sleep -Seconds 5
   
        

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

         
          Execute-Process -Path "$Dirfiles\wix314.exe" -Parameters "/s"
        

        ##*===============================================
        ##* POST-INSTALLATION
        ##*===============================================
        [String]$installPhase = 'Post-Installation'

        ## <Perform Post-Installation tasks here>

       
        Remove-RegistryKey -key "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\{87475ca3-0418-47e5-a51f-de5bd3d0d9fb}" -Name "URLInfoAbout"
        Remove-RegistryKey -key "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\{87475ca3-0418-47e5-a51f-de5bd3d0d9fb}" -Name "URLUpdateInfo"

        Start-Sleep -Seconds 05

        Set-RegistryKey -key "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\{87475ca3-0418-47e5-a51f-de5bd3d0d9fb}" -Name "NoModify" -Value "1" -type Dword
        
        Start-Sleep -Seconds 05

        Expand-Archive -LiteralPath "$dirFiles\WixEdit-0.8.2712.17-bin.zip" -DestinationPath "$envProgramFiles\WixEdit-0.8.2712.17-bin"
        Start-Sleep -Seconds 5

        New-Shortcut -Path "$envProgramData\Microsoft\Windows\Start Menu\Programs\WixEdit.lnk" -TargetPath "$envProgramFiles\WixEdit-0.8.2712.17-bin\bin\WixEdit.exe" -IconLocation "$envProgramFiles\WixEdit-0.8.2712.17-bin\bin\WixEdit.exe" -Description 'WixEdit' 
       
        Start-Sleep -Seconds 5



    }
    ElseIf ($deploymentType -ieq 'Uninstall') {
        ##*===============================================
        ##* PRE-UNINSTALLATION
        ##*===============================================
        [String]$installPhase = 'Pre-Uninstallation'

        ## Show Welcome Message, close Internet Explorer with a 60 second countdown before automatically closing
        Show-InstallationWelcome -CloseApps 'WixEdit' -CloseAppsCountdown 60

        ## Show Progress Message (with the default message)
        Show-InstallationProgress -WindowLocation 'TopCenter'

        ## <Perform Pre-Uninstallation tasks here>
        If(Get-Process -Name 'hh' -ErrorAction SilentlyContinue)
        {
		Execute-Process -Path "TASKKILL" -Parameters "/F /IM hh.exe" -WindowStyle Hidden -ContinueOnError $true
        Start-Sleep -Seconds 5
        }

		

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

        Execute-Process -Path "$envProgramData\Package Cache\{87475ca3-0418-47e5-a51f-de5bd3d0d9fb}\WiX314.exe" -Parameters "/uninstall /quiet"

        Start-Sleep -Seconds 05

        ##*===============================================
        ##* POST-UNINSTALLATION
        ##*===============================================
        [String]$installPhase = 'Post-Uninstallation'

        ## <Perform Post-Uninstallation tasks here>
        
        If(Test-Path "$env:SystemDrive\hh.exe")
        {
        Remove-Item -Path "$env:SystemDrive\hh.exe" -recurse -Force
        }

        Start-Sleep -Seconds 10 

        If(Test-Path "$env:ProgramFiles\dotnet")
        {
        Remove-Item -Path "$env:ProgramFiles\dotnet" -recurse -Force
        }

        Start-Sleep -Seconds 10 

        If(Test-Path "$env:ProgramFiles\WixEdit-0.8.2712.17-bin")
        {
        Remove-Item -Path "$env:ProgramFiles\WixEdit-0.8.2712.17-bin" -recurse -Force
        }
        Start-Sleep -Seconds 05

       $ProfilePath = Get-UserProfiles | Select-Object -ExpandProperty 'ProfilePath'
        ForEach($profile in $ProfilePath)
        {
        $ADATA="$Profile\Appdata\Local"
        if (test-path -path "$ADATA\WixEdit\WixEdit.exe_Url_34pxu0bole5sfn3ckwvruaq0xa1akfum")
        {
        Remove-File -Path "$ADATA\WixEdit\WixEdit.exe_Url_34pxu0bole5sfn3ckwvruaq0xa1akfum" -Recurse 
        }
        }


         Start-Sleep -Seconds 10 

        If(Test-Path "$envProgramData\Microsoft\Windows\Start Menu\Programs\WixEdit.lnk")
        {
        Remove-Item -Path "$envProgramData\Microsoft\Windows\Start Menu\Programs\WixEdit.lnk" -recurse -Force
        }
      
    }
    ElseIf ($deploymentType -ieq 'Repair') {
        ##*===============================================
        ##* PRE-REPAIR
        ##*===============================================
        [String]$installPhase = 'Pre-Repair'

        ## Show Welcome Message, close Internet Explorer with a 60 second countdown before automatically closing
        Show-InstallationWelcome -CloseApps 'WixEdit' -CloseAppsCountdown 60

        ## Show Progress Message (with the default message)
        Show-InstallationProgress -WindowLocation 'TopCenter'

        ## <Perform Pre-Repair tasks here>
        If(Get-Process -Name 'hh' -ErrorAction SilentlyContinue)
        {
		Execute-Process -Path "TASKKILL" -Parameters "/F /IM hh.exe" -WindowStyle Hidden -ContinueOnError $true
        Start-Sleep -Seconds 5
        }

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
        Execute-Process -Path "$Dirfiles\wix314.exe" -Parameters "/s"
        Start-Sleep -Seconds 05
         

        ##*===============================================
        ##* POST-REPAIR
        ##*===============================================
        [String]$installPhase = 'Post-Repair'

        ## <Perform Post-Repair tasks here>
        Remove-RegistryKey -key "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\{87475ca3-0418-47e5-a51f-de5bd3d0d9fb}" -Name "URLInfoAbout"
        Remove-RegistryKey -key "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\{87475ca3-0418-47e5-a51f-de5bd3d0d9fb}" -Name "URLUpdateInfo"

        Start-Sleep -Seconds 05

        Set-RegistryKey -key "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\{87475ca3-0418-47e5-a51f-de5bd3d0d9fb}" -Name "NoModify" -Value "1" -type Dword
        
        Start-Sleep -Seconds 05

        Expand-Archive -LiteralPath "$dirFiles\WixEdit-0.8.2712.17-bin.zip" -DestinationPath "$envProgramFiles\WixEdit-0.8.2712.17-bin"
        Start-Sleep -Seconds 5

        New-Shortcut -Path "$envProgramData\Microsoft\Windows\Start Menu\Programs\WixEdit.lnk" -TargetPath "$envProgramFiles\WixEdit-0.8.2712.17-bin\bin\WixEdit.exe" -IconLocation "$envProgramFiles\WixEdit-0.8.2712.17-bin\bin\WixEdit.exe" -Description 'WixEdit' 
       
        Start-Sleep -Seconds 5

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
