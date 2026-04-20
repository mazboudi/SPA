<#
.SYNOPSIS
  Generates a PSADT v4 Deploy-Application.ps1 from a lifecycle configuration hashtable.

.DESCRIPTION
  Takes the structured lifecycle hashtable from Invoke-PackagingLifecyclePrompts
  and produces a complete PSADT v4 function-based script.

.PARAMETER Lifecycle
  Hashtable output from Invoke-PackagingLifecyclePrompts.

.PARAMETER DisplayName
  Application display name.

.PARAMETER Publisher
  Application publisher.

.PARAMETER Version
  Application version.

.PARAMETER PackageId
  Package identifier.

.OUTPUTS
  String — the full content of Deploy-Application.ps1.
#>
function Build-DeployApplication {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)] [hashtable] $Lifecycle,
        [string] $DisplayName = '',
        [string] $Publisher = '',
        [string] $Version = '',
        [string] $PackageId = ''
    )

    # ── Code generation helpers ───────────────────────────────────────────────

    function ConvertTo-CloseAppsBlock {
        param([hashtable[]] $Actions, [string] $Phase)
        $lines = @()
        # Merge close apps + check disk + defer into one Show-ADTInstallationWelcome
        $closeAction = $Actions | Where-Object { $_.Type -eq 'CloseApps' } | Select-Object -First 1
        $checkDisk   = $Actions | Where-Object { $_.Type -eq 'CheckDiskSpace' } | Select-Object -First 1
        $deferAction = $Actions | Where-Object { $_.Type -eq 'AllowDefer' } | Select-Object -First 1

        $welcomeParams = @()
        if ($closeAction) {
            $welcomeParams += "-CloseApps '$($closeAction.Apps)'"
            $welcomeParams += '-CloseAppsCountdown 60'
            $welcomeParams += '-ForceCloseAppsCountdown 180'
        }
        if ($checkDisk)   { $welcomeParams += '-CheckDiskSpace' }
        if ($deferAction) {
            $welcomeParams += "-AllowDefer -DeferTimes $($deferAction.DeferTimes)"
            $welcomeParams += '-PersistPrompt'
        }

        if ($welcomeParams.Count -gt 0) {
            $lines += "        Show-ADTInstallationWelcome $($welcomeParams -join ' ')"
        }

        # Show progress
        $progressAction = $Actions | Where-Object { $_.Type -eq 'ShowProgress' } | Select-Object -First 1
        if ($progressAction) {
            $msg = if ($Phase -like '*Uninstall*') { 'Uninstall in Progress...' } else { 'Installation in Progress...' }
            $lines += "        Show-ADTInstallationProgress -StatusMessage '$msg' -WindowLocation 'TopCenter'"
        }

        return $lines
    }

    function ConvertTo-ActionLines {
        param([hashtable[]] $Actions, [string] $PackageId, [string] $DisplayName, [string] $Publisher, [string] $Version)
        $lines = @()

        foreach ($action in $Actions) {
            switch ($action.Type) {
                'MsiInstall' {
                    $args = if ($action.ArgumentList) { " -ArgumentList '$($action.ArgumentList)'" } else { '' }
                    $lines += "        Start-ADTMsiProcess -Action 'Install' -FilePath '$($action.FilePath)'$args -ErrorAction Stop"
                }
                'ExeInstall' {
                    $args = if ($action.ArgumentList) { " -ArgumentList '$($action.ArgumentList)'" } else { '' }
                    $lines += "        Start-ADTProcess -FilePath '`$dirFiles\$($action.FilePath)'$args -ErrorAction Stop"
                }
                'FolderCopy' {
                    $lines += "        `$sourceFolder = `"`$dirFiles\$($action.Source)`""
                    $lines += "        `$destinationFolder = '$($action.Destination)'"
                    $lines += "        if (Test-Path -Path `$destinationFolder -PathType Container) {"
                    $lines += "            Copy-Item -Path `$sourceFolder -Destination `$destinationFolder -Recurse -Force"
                    $lines += "        } else {"
                    $lines += "            Copy-Item -Path `$sourceFolder -Destination `$destinationFolder -Recurse"
                    $lines += "        }"
                }
                'MsiUninstall' {
                    $lines += "        Uninstall-ADTApplication -Name '$($action.AppName)' -ApplicationType 'MSI' -ErrorAction Stop"
                }
                'ExeUninstall' {
                    $args = if ($action.ArgumentList) { " -ArgumentList '$($action.ArgumentList)'" } else { '' }
                    $lines += "        Start-ADTProcess -FilePath '$($action.FilePath)'$args -ErrorAction Stop"
                }
                'FolderRemove' {
                    $lines += "        `$folderPath = '$($action.Path)'"
                    $lines += "        if (Test-Path -Path `$folderPath -PathType Container) {"
                    $lines += "            Remove-Item -Path `$folderPath -Force -Recurse"
                    $lines += "        }"
                }
                'MsiRepair' {
                    $lines += "        ## Zero-Config MSI repair is handled automatically by the framework"
                }
                'RegistryMarker' {
                    $regKey = "HKLM:\SOFTWARE\Fiserv\InstalledApps\$PackageId"
                    $lines += "        # Write Fiserv registry detection marker"
                    $lines += "        Set-ADTRegistryKey -LiteralPath '$regKey' ``"
                    $lines += "            -Name 'Version' -Type 'String' -Value '$Version'"
                    $lines += "        Set-ADTRegistryKey -LiteralPath '$regKey' ``"
                    $lines += "            -Name 'Publisher' -Type 'String' -Value '$Publisher'"
                    $lines += "        Set-ADTRegistryKey -LiteralPath '$regKey' ``"
                    $lines += "            -Name 'DisplayName' -Type 'String' -Value '$DisplayName'"
                    $lines += "        Set-ADTRegistryKey -LiteralPath '$regKey' ``"
                    $lines += "            -Name 'InstallDate' -Type 'String' -Value (Get-Date -Format 'yyyy-MM-dd')"
                }
                'RemoveRegistryMarker' {
                    $regKey = "HKLM:\SOFTWARE\Fiserv\InstalledApps\$PackageId"
                    $lines += "        # Remove Fiserv registry detection marker"
                    $lines += "        Remove-ADTRegistryKey -LiteralPath '$regKey'"
                }
                'SetEnvVariable' {
                    $lines += "        # Set environment variable: $($action.Name)"
                    $lines += "        `$currentValue = [Environment]::GetEnvironmentVariable('$($action.Name)', 'Machine')"
                    $lines += "        `$newValue = '$($action.Value)' + ';' + `$currentValue"
                    $lines += "        [Environment]::SetEnvironmentVariable('$($action.Name)', `$newValue, 'Machine')"
                }
                'RemoveEnvVariable' {
                    $lines += "        # Remove from environment variable: $($action.Name)"
                    $lines += "        `$currentValue = [Environment]::GetEnvironmentVariable('$($action.Name)', 'Machine')"
                    $lines += "        `$newValue = (`$currentValue -split ';' | Where-Object { `$_ -ne '$($action.Value)' }) -join ';'"
                    $lines += "        [Environment]::SetEnvironmentVariable('$($action.Name)', `$newValue, 'Machine')"
                }
                'SetRegistryKey' {
                    $lines += "        Set-ADTRegistryKey -LiteralPath '$($action.Path)' ``"
                    $lines += "            -Name '$($action.Name)' -Type '$($action.RegType)' -Value '$($action.Value)'"
                }
                'RemoveRegistryKey' {
                    $lines += "        Remove-ADTRegistryKey -LiteralPath '$($action.Path)'"
                }
                'ShowCompletion' {
                    $lines += "        Show-ADTInstallationPrompt -Message 'The install has completed.' ``"
                    $lines += "            -ButtonRightText 'OK' -Icon Information -NoWait -Timeout 5"
                }
                'CustomScript' {
                    $content = $action.Content
                    if ($content) {
                        $lines += "        # Custom script: $($action.Path)"
                        foreach ($line in ($content -split "`n")) {
                            $trimmed = $line.TrimEnd("`r")
                            $lines += "        $trimmed"
                        }
                    }
                }
            }
        }
        return $lines
    }

    # ── Build phase blocks ────────────────────────────────────────────────────

    # Pre-Install
    $preInstallLines = ConvertTo-CloseAppsBlock -Actions $Lifecycle.PreInstall.Actions -Phase 'Install'
    $preInstallCustom = ConvertTo-ActionLines -Actions ($Lifecycle.PreInstall.Actions | Where-Object { $_.Type -notin @('CloseApps','CheckDiskSpace','AllowDefer','ShowProgress') }) `
        -PackageId $PackageId -DisplayName $DisplayName -Publisher $Publisher -Version $Version
    $preInstallBlock = ($preInstallLines + $preInstallCustom) -join "`n"
    if (-not $preInstallBlock.Trim()) { $preInstallBlock = "        ## No pre-installation actions configured" }

    # Install
    $installLines = ConvertTo-ActionLines -Actions $Lifecycle.Install.Actions `
        -PackageId $PackageId -DisplayName $DisplayName -Publisher $Publisher -Version $Version
    $installBlock = $installLines -join "`n"
    if (-not $installBlock.Trim()) { $installBlock = "        Write-ADTLogEntry -Message 'TODO: Add install logic'" }

    # Post-Install
    $postInstallLines = ConvertTo-ActionLines -Actions $Lifecycle.PostInstall.Actions `
        -PackageId $PackageId -DisplayName $DisplayName -Publisher $Publisher -Version $Version
    $postInstallBlock = $postInstallLines -join "`n"
    if (-not $postInstallBlock.Trim()) { $postInstallBlock = "        ## No post-installation actions configured" }

    # Pre-Uninstall
    $preUninstallLines = ConvertTo-CloseAppsBlock -Actions $Lifecycle.PreUninstall.Actions -Phase 'Uninstall'
    $preUninstallCustom = ConvertTo-ActionLines -Actions ($Lifecycle.PreUninstall.Actions | Where-Object { $_.Type -notin @('CloseApps','ShowProgress') }) `
        -PackageId $PackageId -DisplayName $DisplayName -Publisher $Publisher -Version $Version
    $preUninstallBlock = ($preUninstallLines + $preUninstallCustom) -join "`n"
    if (-not $preUninstallBlock.Trim()) { $preUninstallBlock = "        ## No pre-uninstallation actions configured" }

    # Uninstall
    $uninstallLines = ConvertTo-ActionLines -Actions $Lifecycle.Uninstall.Actions `
        -PackageId $PackageId -DisplayName $DisplayName -Publisher $Publisher -Version $Version
    $uninstallBlock = $uninstallLines -join "`n"
    if (-not $uninstallBlock.Trim()) { $uninstallBlock = "        Write-ADTLogEntry -Message 'TODO: Add uninstall logic'" }

    # Post-Uninstall
    $postUninstallLines = ConvertTo-ActionLines -Actions $Lifecycle.PostUninstall.Actions `
        -PackageId $PackageId -DisplayName $DisplayName -Publisher $Publisher -Version $Version
    $postUninstallBlock = $postUninstallLines -join "`n"
    if (-not $postUninstallBlock.Trim()) { $postUninstallBlock = "        ## No post-uninstallation actions configured" }

    # Repair — mirror or custom
    if ($Lifecycle.RepairMode -eq 'mirror') {
        $preRepairBlock = $preInstallBlock
        $repairBlock = $installBlock
        $postRepairBlock = $postInstallBlock
    } else {
        $preRepairLines = ConvertTo-CloseAppsBlock -Actions $Lifecycle.PreRepair.Actions -Phase 'Repair'
        $preRepairBlock = ($preRepairLines) -join "`n"
        if (-not $preRepairBlock.Trim()) { $preRepairBlock = "        ## No pre-repair actions configured" }

        $repairLines = ConvertTo-ActionLines -Actions $Lifecycle.Repair.Actions `
            -PackageId $PackageId -DisplayName $DisplayName -Publisher $Publisher -Version $Version
        $repairBlock = $repairLines -join "`n"
        if (-not $repairBlock.Trim()) { $repairBlock = "        Write-ADTLogEntry -Message 'TODO: Add repair logic'" }

        $postRepairLines = ConvertTo-ActionLines -Actions $Lifecycle.PostRepair.Actions `
            -PackageId $PackageId -DisplayName $DisplayName -Publisher $Publisher -Version $Version
        $postRepairBlock = $postRepairLines -join "`n"
        if (-not $postRepairBlock.Trim()) { $postRepairBlock = "        ## No post-repair actions configured" }
    }

    # ── Close apps list for $adtSession ───────────────────────────────────────
    $closeAppsList = ''
    $closeAction = $Lifecycle.PreInstall.Actions | Where-Object { $_.Type -eq 'CloseApps' } | Select-Object -First 1
    if ($closeAction -and $closeAction.Apps) {
        $appArray = ($closeAction.Apps -split ',' | ForEach-Object { "'$($_.Trim())'" }) -join ', '
        $closeAppsList = "@($appArray)"
    } else {
        $closeAppsList = '@()'
    }

    # ── Assemble the full script ──────────────────────────────────────────────
    $scriptDate = Get-Date -Format 'yyyy-MM-dd'

    return @"
<#
.SYNOPSIS
    $DisplayName - PSADT v4 deployment script.
    Generated by SPA New-Title scaffolding on $scriptDate.

.DESCRIPTION
    Performs Install, Uninstall, or Repair of $DisplayName.
    Uses the PSAppDeployToolkit v4 function-based architecture.

.NOTES
    Framework : PSAppDeployToolkit 4.1.7
    Package   : $PackageId
    Version   : $Version
#>

[CmdletBinding()]
param
(
    [Parameter(Mandatory = `$false)]
    [ValidateSet('Install', 'Uninstall', 'Repair')]
    [System.String]`$DeploymentType,

    [Parameter(Mandatory = `$false)]
    [ValidateSet('Auto', 'Interactive', 'NonInteractive', 'Silent')]
    [System.String]`$DeployMode,

    [Parameter(Mandatory = `$false)]
    [System.Management.Automation.SwitchParameter]`$SuppressRebootPassThru,

    [Parameter(Mandatory = `$false)]
    [System.Management.Automation.SwitchParameter]`$TerminalServerMode,

    [Parameter(Mandatory = `$false)]
    [System.Management.Automation.SwitchParameter]`$DisableLogging
)


##================================================
## MARK: Variables
##================================================

`$adtSession = @{
    AppVendor              = '$Publisher'
    AppName                = '$DisplayName'
    AppVersion             = '$Version'
    AppArch                = 'x64'
    AppLang                = 'EN'
    AppRevision            = '01'
    AppSuccessExitCodes    = @(0)
    AppRebootExitCodes     = @(1641, 3010)
    AppProcessesToClose    = $closeAppsList
    AppScriptVersion       = '1.0.0'
    AppScriptDate          = '$scriptDate'
    AppScriptAuthor        = 'SPA Factory'
    RequireAdmin           = `$true

    InstallName            = '$DisplayName $Version'
    InstallTitle           = '$DisplayName $Version'

    DeployAppScriptFriendlyName = `$MyInvocation.MyCommand.Name
    DeployAppScriptParameters   = `$PSBoundParameters
    DeployAppScriptVersion      = '4.1.7'
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
    `$adtSession.InstallPhase = "Pre-`$(`$adtSession.DeploymentType)"

$preInstallBlock

    ##================================================
    ## MARK: Install
    ##================================================
    `$adtSession.InstallPhase = `$adtSession.DeploymentType

$installBlock

    ##================================================
    ## MARK: Post-Install
    ##================================================
    `$adtSession.InstallPhase = "Post-`$(`$adtSession.DeploymentType)"

$postInstallBlock
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
    `$adtSession.InstallPhase = "Pre-`$(`$adtSession.DeploymentType)"

$preUninstallBlock

    ##================================================
    ## MARK: Uninstall
    ##================================================
    `$adtSession.InstallPhase = `$adtSession.DeploymentType

$uninstallBlock

    ##================================================
    ## MARK: Post-Uninstall
    ##================================================
    `$adtSession.InstallPhase = "Post-`$(`$adtSession.DeploymentType)"

$postUninstallBlock
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
    `$adtSession.InstallPhase = "Pre-`$(`$adtSession.DeploymentType)"

$preRepairBlock

    ##================================================
    ## MARK: Repair
    ##================================================
    `$adtSession.InstallPhase = `$adtSession.DeploymentType

$repairBlock

    ##================================================
    ## MARK: Post-Repair
    ##================================================
    `$adtSession.InstallPhase = "Post-`$(`$adtSession.DeploymentType)"

$postRepairBlock
}


##================================================
## MARK: Initialization
##================================================

`$ErrorActionPreference = [System.Management.Automation.ActionPreference]::Stop
`$ProgressPreference = [System.Management.Automation.ActionPreference]::SilentlyContinue
Set-StrictMode -Version 1

try
{
    if (Test-Path -LiteralPath "`$PSScriptRoot\PSAppDeployToolkit\PSAppDeployToolkit.psd1" -PathType Leaf)
    {
        Get-ChildItem -LiteralPath "`$PSScriptRoot\PSAppDeployToolkit" -Recurse -File | Unblock-File -ErrorAction Ignore
        Import-Module -FullyQualifiedName @{ ModuleName = "`$PSScriptRoot\PSAppDeployToolkit\PSAppDeployToolkit.psd1"; Guid = '8c3c366b-8606-4576-9f2d-4051144f7ca2'; ModuleVersion = '4.1.7' } -Force
    }
    else
    {
        Import-Module -FullyQualifiedName @{ ModuleName = 'PSAppDeployToolkit'; Guid = '8c3c366b-8606-4576-9f2d-4051144f7ca2'; ModuleVersion = '4.1.7' } -Force
    }

    `$iadtParams = Get-ADTBoundParametersAndDefaultValues -Invocation `$MyInvocation
    `$adtSession = Remove-ADTHashtableNullOrEmptyValues -Hashtable `$adtSession
    `$adtSession = Open-ADTSession @adtSession @iadtParams -PassThru
}
catch
{
    `$Host.UI.WriteErrorLine((Out-String -InputObject `$_ -Width ([System.Int32]::MaxValue)))
    exit 60008
}


##================================================
## MARK: Invocation
##================================================

try
{
    Get-ChildItem -LiteralPath `$PSScriptRoot -Directory | & {
        process
        {
            if (`$_.Name -match 'PSAppDeployToolkit\..+`$')
            {
                Get-ChildItem -LiteralPath `$_.FullName -Recurse -File | Unblock-File -ErrorAction Ignore
                Import-Module -Name `$_.FullName -Force
            }
        }
    }

    & "`$(`$adtSession.DeploymentType)-ADTDeployment"
    Close-ADTSession
}
catch
{
    `$mainErrorMessage = "An unhandled error within [`$(`$MyInvocation.MyCommand.Name)] has occurred.``n`$(Resolve-ADTErrorRecord -ErrorRecord `$_)"
    Write-ADTLogEntry -Message `$mainErrorMessage -Severity 3
    Close-ADTSession -ExitCode 60001
}
"@
}
