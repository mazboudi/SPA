<#
.SYNOPSIS
  Interactive prompts for PSADT v4 packaging lifecycle phases.
  Returns a hashtable describing actions for each phase.

.DESCRIPTION
  Walks the packager through Pre-Install → Install → Post-Install →
  Pre-Uninstall → Uninstall → Post-Uninstall. Repair phases default
  to mirroring Install unless the packager opts to customize.

.PARAMETER InstallerType
  The installer type (msi, exe). Determines default actions.

.PARAMETER MsiFile
  MSI filename (if already extracted). Used to pre-fill install action.

.PARAMETER ProductCode
  MSI ProductCode (if already extracted). Used for uninstall.

.PARAMETER PackageId
  Package identifier for registry marker paths.

.PARAMETER DisplayName
  Display name for the application.

.PARAMETER Publisher
  Publisher name for registry markers.

.PARAMETER Version
  Application version string.

.PARAMETER CloseApps
  Pre-filled close apps string (from earlier prompt, if any).

.OUTPUTS
  Hashtable with keys: PreInstall, Install, PostInstall, PreUninstall,
  Uninstall, PostUninstall, RepairMode ('mirror' or 'custom'),
  PreRepair, Repair, PostRepair.
#>
function Invoke-PackagingLifecyclePrompts {
    [CmdletBinding()]
    param(
        [string] $InstallerType = 'msi',
        [string] $MsiFile = '',
        [string] $ProductCode = '',
        [string] $PackageId = '',
        [string] $DisplayName = '',
        [string] $Publisher = 'Fiserv',
        [string] $Version = '',
        [string] $CloseApps = ''
    )

    # ── Reusable helpers ──────────────────────────────────────────────────────
    function Show-PhaseMenu {
        param(
            [string]   $PhaseName,
            [string[]] $Options,
            [string]   $Prompt = 'Select actions (comma-separated, or Enter to skip)'
        )
        Write-Host ""
        Write-Host "═══ $PhaseName ═══" -ForegroundColor Cyan
        for ($i = 0; $i -lt $Options.Count; $i++) {
            Write-Host "  [$($i + 1)] $($Options[$i])"
        }
        $raw = Read-Host $Prompt
        if ([string]::IsNullOrWhiteSpace($raw)) { return @() }
        $indices = $raw -split ',' | ForEach-Object {
            $v = $_.Trim()
            if ($v -match '^\d+$') { [int]$v - 1 }
        }
        return @($indices | Where-Object { $_ -ge 0 -and $_ -lt $Options.Count })
    }

    function Read-OptionalInput {
        param(
            [string] $Prompt,
            [string] $Default = ''
        )
        $suffix = if ($Default) { " (default: $Default)" } else { '' }
        $value = Read-Host "$Prompt$suffix"
        if ([string]::IsNullOrWhiteSpace($value) -and $Default) { return $Default }
        if ([string]::IsNullOrWhiteSpace($value)) { return '' }
        return $value.Trim()
    }

    # ── Result object ─────────────────────────────────────────────────────────
    $lifecycle = @{
        PreInstall     = @{ Actions = @() }
        Install        = @{ Actions = @() }
        PostInstall    = @{ Actions = @() }
        PreUninstall   = @{ Actions = @() }
        Uninstall      = @{ Actions = @() }
        PostUninstall  = @{ Actions = @() }
        RepairMode     = 'mirror'
        PreRepair      = @{ Actions = @() }
        Repair         = @{ Actions = @() }
        PostRepair     = @{ Actions = @() }
    }

    Write-Host ""
    Write-Host "╔══════════════════════════════════════════════╗" -ForegroundColor Magenta
    Write-Host "║  PACKAGING LIFECYCLE CONFIGURATION           ║" -ForegroundColor Magenta
    Write-Host "╚══════════════════════════════════════════════╝" -ForegroundColor Magenta

    # ══════════════════════════════════════════════════════════════════════════
    #  PRE-INSTALL
    # ══════════════════════════════════════════════════════════════════════════
    $preInstallOptions = @(
        'Close processes before install',
        'Check disk space',
        'Allow user deferrals',
        'Show progress message',
        'Custom PowerShell (from file)'
    )
    $selected = Show-PhaseMenu -PhaseName 'PRE-INSTALL' -Options $preInstallOptions
    $preActions = @()

    foreach ($idx in $selected) {
        switch ($idx) {
            0 {
                $apps = if ($CloseApps) { $CloseApps }
                        else { Read-OptionalInput "Process(es) to close (comma-separated, e.g. 'chrome,msedge')" }
                if ($apps) {
                    $preActions += @{ Type = 'CloseApps'; Apps = $apps }
                    $lifecycle.PreInstall.CloseApps = $apps
                }
            }
            1 {
                $preActions += @{ Type = 'CheckDiskSpace' }
                $lifecycle.PreInstall.CheckDiskSpace = $true
            }
            2 {
                $times = Read-OptionalInput "Number of deferrals allowed" -Default '3'
                $preActions += @{ Type = 'AllowDefer'; DeferTimes = [int]$times }
                $lifecycle.PreInstall.DeferTimes = [int]$times
            }
            3 {
                $preActions += @{ Type = 'ShowProgress' }
            }
            4 {
                $path = Read-OptionalInput "Path to PowerShell script file for Pre-Install"
                if ($path -and (Test-Path $path)) {
                    $preActions += @{ Type = 'CustomScript'; Path = $path; Content = (Get-Content $path -Raw) }
                } elseif ($path) {
                    Write-Host "  ⚠ File not found: $path — skipping" -ForegroundColor Yellow
                }
            }
        }
    }
    $lifecycle.PreInstall.Actions = $preActions

    # ══════════════════════════════════════════════════════════════════════════
    #  INSTALL
    # ══════════════════════════════════════════════════════════════════════════
    $installOptions = @(
        'MSI install (Start-ADTMsiProcess)',
        'EXE install (Start-ADTProcess)',
        'File/folder copy',
        'Custom PowerShell (from file)'
    )
    # Pre-select based on installer type
    $defaultInstall = if ($InstallerType -eq 'msi') { 0 } else { 1 }

    $selected = Show-PhaseMenu -PhaseName 'INSTALL' -Options $installOptions `
        -Prompt "Select install method (default: $($installOptions[$defaultInstall]))"
    if ($selected.Count -eq 0) { $selected = @($defaultInstall) }

    $installActions = @()
    foreach ($idx in $selected) {
        switch ($idx) {
            0 {
                $file = if ($MsiFile) { $MsiFile } else { Read-OptionalInput "MSI filename" }
                $args = Read-OptionalInput "MSI arguments" -Default '/QN /norestart'
                $installActions += @{
                    Type = 'MsiInstall'
                    FilePath = $file
                    ArgumentList = $args
                }
            }
            1 {
                $file = Read-OptionalInput "EXE filename (in Files\ folder)"
                $args = Read-OptionalInput "EXE arguments (e.g. '/S /v/qn')"
                $installActions += @{
                    Type = 'ExeInstall'
                    FilePath = $file
                    ArgumentList = $args
                }
            }
            2 {
                $src = Read-OptionalInput "Source folder name (relative to Files\)"
                $dest = Read-OptionalInput "Destination path (e.g. 'C:\')"
                $installActions += @{
                    Type = 'FolderCopy'
                    Source = $src
                    Destination = $dest
                }
            }
            3 {
                $path = Read-OptionalInput "Path to PowerShell script file for Install"
                if ($path -and (Test-Path $path)) {
                    $installActions += @{ Type = 'CustomScript'; Path = $path; Content = (Get-Content $path -Raw) }
                } elseif ($path) {
                    Write-Host "  ⚠ File not found: $path — skipping" -ForegroundColor Yellow
                }
            }
        }
    }
    $lifecycle.Install.Actions = $installActions

    # ══════════════════════════════════════════════════════════════════════════
    #  POST-INSTALL
    # ══════════════════════════════════════════════════════════════════════════
    $postInstallOptions = @(
        'Write Fiserv registry marker',
        'Set environment variable (e.g. PATH)',
        'Patch registry keys',
        'Show completion message',
        'Custom PowerShell (from file)'
    )
    $selected = Show-PhaseMenu -PhaseName 'POST-INSTALL' -Options $postInstallOptions

    $postActions = @()
    foreach ($idx in $selected) {
        switch ($idx) {
            0 {
                $postActions += @{
                    Type = 'RegistryMarker'
                    PackageId = $PackageId
                    DisplayName = $DisplayName
                    Publisher = $Publisher
                    Version = $Version
                }
            }
            1 {
                $varName = Read-OptionalInput "Variable name" -Default 'Path'
                $varValue = Read-OptionalInput "Value to add"
                $postActions += @{
                    Type = 'SetEnvVariable'
                    Name = $varName
                    Value = $varValue
                }
            }
            2 {
                $regPath = Read-OptionalInput "Registry key path (HKLM:\...)"
                $regName = Read-OptionalInput "Value name"
                $regValue = Read-OptionalInput "Value data"
                $regType = Read-OptionalInput "Value type" -Default 'String'
                $postActions += @{
                    Type = 'SetRegistryKey'
                    Path = $regPath
                    Name = $regName
                    Value = $regValue
                    RegType = $regType
                }
            }
            3 {
                $postActions += @{ Type = 'ShowCompletion' }
            }
            4 {
                $path = Read-OptionalInput "Path to PowerShell script file for Post-Install"
                if ($path -and (Test-Path $path)) {
                    $postActions += @{ Type = 'CustomScript'; Path = $path; Content = (Get-Content $path -Raw) }
                } elseif ($path) {
                    Write-Host "  ⚠ File not found: $path — skipping" -ForegroundColor Yellow
                }
            }
        }
    }
    $lifecycle.PostInstall.Actions = $postActions

    # ══════════════════════════════════════════════════════════════════════════
    #  PRE-UNINSTALL
    # ══════════════════════════════════════════════════════════════════════════
    $preUninstallOptions = @(
        'Close processes before uninstall',
        'Show progress message',
        'Custom PowerShell (from file)'
    )
    $selected = Show-PhaseMenu -PhaseName 'PRE-UNINSTALL' -Options $preUninstallOptions

    $preUnActions = @()
    foreach ($idx in $selected) {
        switch ($idx) {
            0 {
                $apps = if ($lifecycle.PreInstall.CloseApps) { $lifecycle.PreInstall.CloseApps }
                        else { Read-OptionalInput "Process(es) to close" }
                if ($apps) {
                    $preUnActions += @{ Type = 'CloseApps'; Apps = $apps }
                }
            }
            1 { $preUnActions += @{ Type = 'ShowProgress'; Message = 'Uninstall in Progress...' } }
            2 {
                $path = Read-OptionalInput "Path to PowerShell script file for Pre-Uninstall"
                if ($path -and (Test-Path $path)) {
                    $preUnActions += @{ Type = 'CustomScript'; Path = $path; Content = (Get-Content $path -Raw) }
                } elseif ($path) {
                    Write-Host "  ⚠ File not found: $path — skipping" -ForegroundColor Yellow
                }
            }
        }
    }
    $lifecycle.PreUninstall.Actions = $preUnActions

    # ══════════════════════════════════════════════════════════════════════════
    #  UNINSTALL
    # ══════════════════════════════════════════════════════════════════════════
    $uninstallOptions = @(
        'MSI uninstall (Uninstall-ADTApplication)',
        'EXE uninstall (Start-ADTProcess)',
        'File/folder removal',
        'Custom PowerShell (from file)'
    )
    $selected = Show-PhaseMenu -PhaseName 'UNINSTALL' -Options $uninstallOptions `
        -Prompt "Select uninstall method"
    if ($selected.Count -eq 0) { $selected = @(0) }

    $uninstallActions = @()
    foreach ($idx in $selected) {
        switch ($idx) {
            0 {
                $appName = Read-OptionalInput "Application name for MSI uninstall" -Default $DisplayName
                $uninstallActions += @{
                    Type = 'MsiUninstall'
                    AppName = $appName
                    ProductCode = $ProductCode
                }
            }
            1 {
                $file = Read-OptionalInput "Uninstaller path (e.g. 'C:\Program Files\App\uninstall.exe')"
                $args = Read-OptionalInput "Uninstall arguments (e.g. '/S')"
                $uninstallActions += @{
                    Type = 'ExeUninstall'
                    FilePath = $file
                    ArgumentList = $args
                }
            }
            2 {
                $folder = Read-OptionalInput "Folder path to remove"
                $uninstallActions += @{
                    Type = 'FolderRemove'
                    Path = $folder
                }
            }
            3 {
                $path = Read-OptionalInput "Path to PowerShell script file for Uninstall"
                if ($path -and (Test-Path $path)) {
                    $uninstallActions += @{ Type = 'CustomScript'; Path = $path; Content = (Get-Content $path -Raw) }
                } elseif ($path) {
                    Write-Host "  ⚠ File not found: $path — skipping" -ForegroundColor Yellow
                }
            }
        }
    }
    $lifecycle.Uninstall.Actions = $uninstallActions

    # ══════════════════════════════════════════════════════════════════════════
    #  POST-UNINSTALL
    # ══════════════════════════════════════════════════════════════════════════
    $postUninstallOptions = @(
        'Remove Fiserv registry marker',
        'Remove environment variable entry',
        'Remove registry keys',
        'Custom PowerShell (from file)'
    )
    $selected = Show-PhaseMenu -PhaseName 'POST-UNINSTALL' -Options $postUninstallOptions

    $postUnActions = @()
    foreach ($idx in $selected) {
        switch ($idx) {
            0 {
                $postUnActions += @{
                    Type = 'RemoveRegistryMarker'
                    PackageId = $PackageId
                }
            }
            1 {
                $varName = Read-OptionalInput "Variable name" -Default 'Path'
                $varValue = Read-OptionalInput "Value to remove"
                $postUnActions += @{
                    Type = 'RemoveEnvVariable'
                    Name = $varName
                    Value = $varValue
                }
            }
            2 {
                $regPath = Read-OptionalInput "Registry key path to remove"
                $postUnActions += @{
                    Type = 'RemoveRegistryKey'
                    Path = $regPath
                }
            }
            3 {
                $path = Read-OptionalInput "Path to PowerShell script file for Post-Uninstall"
                if ($path -and (Test-Path $path)) {
                    $postUnActions += @{ Type = 'CustomScript'; Path = $path; Content = (Get-Content $path -Raw) }
                } elseif ($path) {
                    Write-Host "  ⚠ File not found: $path — skipping" -ForegroundColor Yellow
                }
            }
        }
    }
    $lifecycle.PostUninstall.Actions = $postUnActions

    # ══════════════════════════════════════════════════════════════════════════
    #  REPAIR — default to mirror install
    # ══════════════════════════════════════════════════════════════════════════
    Write-Host ""
    Write-Host "═══ REPAIR ═══" -ForegroundColor Cyan
    Write-Host "  Repair phases will mirror Install by default."
    $customRepair = Read-Host "  Customize repair phases? (y/N)"
    if ($customRepair -in @('y', 'Y', 'yes')) {
        $lifecycle.RepairMode = 'custom'

        # Pre-Repair
        $selected = Show-PhaseMenu -PhaseName 'PRE-REPAIR' -Options @(
            'Close processes', 'Show progress', 'Custom PowerShell (from file)'
        )
        $repairPre = @()
        foreach ($idx in $selected) {
            switch ($idx) {
                0 {
                    $apps = if ($lifecycle.PreInstall.CloseApps) { $lifecycle.PreInstall.CloseApps }
                            else { Read-OptionalInput "Process(es) to close" }
                    $repairPre += @{ Type = 'CloseApps'; Apps = $apps }
                }
                1 { $repairPre += @{ Type = 'ShowProgress' } }
                2 {
                    $path = Read-OptionalInput "Path to PowerShell script file"
                    if ($path -and (Test-Path $path)) {
                        $repairPre += @{ Type = 'CustomScript'; Path = $path; Content = (Get-Content $path -Raw) }
                    }
                }
            }
        }
        $lifecycle.PreRepair.Actions = $repairPre

        # Repair
        $selected = Show-PhaseMenu -PhaseName 'REPAIR' -Options @(
            'MSI repair', 'File/folder re-copy', 'Custom PowerShell (from file)'
        )
        $repairActions = @()
        foreach ($idx in $selected) {
            switch ($idx) {
                0 { $repairActions += @{ Type = 'MsiRepair' } }
                1 {
                    $src = Read-OptionalInput "Source folder"
                    $dest = Read-OptionalInput "Destination"
                    $repairActions += @{ Type = 'FolderCopy'; Source = $src; Destination = $dest }
                }
                2 {
                    $path = Read-OptionalInput "Path to PowerShell script file"
                    if ($path -and (Test-Path $path)) {
                        $repairActions += @{ Type = 'CustomScript'; Path = $path; Content = (Get-Content $path -Raw) }
                    }
                }
            }
        }
        $lifecycle.Repair.Actions = $repairActions

        # Post-Repair — reuse post-install menu
        $selected = Show-PhaseMenu -PhaseName 'POST-REPAIR' -Options @(
            'Write Fiserv registry marker', 'Set environment variable', 'Custom PowerShell (from file)'
        )
        $repairPost = @()
        foreach ($idx in $selected) {
            switch ($idx) {
                0 { $repairPost += @{ Type = 'RegistryMarker'; PackageId = $PackageId; DisplayName = $DisplayName; Publisher = $Publisher; Version = $Version } }
                1 {
                    $varName = Read-OptionalInput "Variable name" -Default 'Path'
                    $varValue = Read-OptionalInput "Value"
                    $repairPost += @{ Type = 'SetEnvVariable'; Name = $varName; Value = $varValue }
                }
                2 {
                    $path = Read-OptionalInput "Path to PowerShell script file"
                    if ($path -and (Test-Path $path)) {
                        $repairPost += @{ Type = 'CustomScript'; Path = $path; Content = (Get-Content $path -Raw) }
                    }
                }
            }
        }
        $lifecycle.PostRepair.Actions = $repairPost
    }

    return $lifecycle
}
