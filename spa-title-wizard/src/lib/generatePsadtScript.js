/**
 * generatePsadtScript.js
 * Converts wizard form state into a complete, native PSADT v4.1.0 script.
 * Mirrors the exact code generation logic of Build-DeployApplication.ps1.
 */

export default function generatePsadtScript(s, clean = false) {
  const isClean = clean || !!s.pristineScripts;
  const lc = s.lifecycle || {};
  const phases = lc.phases || {};
  const packageId = s.packageId || 'TODO-PACKAGE-ID';
  const displayName = s.displayName || 'TODO-DISPLAY-NAME';
  const publisher = s.publisher || 'Fiserv';
  const version = s.version || '1.0.0';
  const frameworkVersion = '4.1.0';
  const today = new Date().toISOString().split('T')[0];

  // ── Helper: Compile Welcome/Progress block ─────────────────────────────
  function convertToCloseWelcomeBlock(actions, phaseName) {
    const lines = [];
    const closeAction = (actions || []).find(a => a.type === 'stop_process' || a.type === 'show_welcome');
    const welcomeAction = (actions || []).find(a => a.type === 'show_welcome');
    const progressAction = (actions || []).find(a => a.type === 'show_progress');

    let welcomeParams = [];
    if (welcomeAction) {
      if (welcomeAction.closeApps) {
        welcomeParams.push(`-CloseApps '${welcomeAction.closeApps}'`);
        welcomeParams.push('-CloseAppsCountdown 60');
        welcomeParams.push('-ForceCloseAppsCountdown 180');
      }
      if (welcomeAction.checkDiskSpace) {
        welcomeParams.push('-CheckDiskSpace');
      }
      if (welcomeAction.deferTimes) {
        welcomeParams.push(`-AllowDefer -DeferTimes ${welcomeAction.deferTimes}`);
        welcomeParams.push('-PersistPrompt');
      }
    } else if (closeAction && closeAction.type === 'stop_process' && closeAction.closeApps) {
      // Fallback for simple stop_process action
      welcomeParams.push(`-CloseApps '${closeAction.closeApps}'`);
      welcomeParams.push('-CloseAppsCountdown 60');
      welcomeParams.push('-ForceCloseAppsCountdown 180');
    }

    if (welcomeParams.length > 0) {
      lines.push(`        Show-ADTInstallationWelcome ${welcomeParams.join(' ')}`);
    }

    if (progressAction) {
      const msg = phaseName.toLowerCase().includes('uninstall') ? 'Uninstall in Progress...' : 'Installation in Progress...';
      lines.push(`        Show-ADTInstallationProgress -StatusMessage '${msg}' -WindowLocation 'TopCenter'`);
    }

    return lines;
  }



  // ── Helper: Compile Action list to PS1 lines ───────────────────────────
  function convertToActionLines(actions) {
    const lines = [];
    if (!actions || actions.length === 0) return lines;

    actions.forEach(action => {
      if (action.enabled === false) return;

      const actionLines = [];
      switch (action.type) {
        case 'msi_install': {
          const args = action.args ? ` -ArgumentList '${action.args}'` : '';
          actionLines.push(`        Start-ADTMsiProcess -Action 'Install' -FilePath '$dirFiles\\${action.file}'${args} -ErrorAction Stop`);
          break;
        }
        case 'exe_install': {
          const args = action.args ? ` -ArgumentList '${action.args}'` : '';
          actionLines.push(`        Start-ADTProcess -FilePath '$dirFiles\\${action.file}'${args} -ErrorAction Stop`);
          break;
        }
        case 'execute_process': {
          const args = action.args ? ` -ArgumentList '${action.args}'` : '';
          actionLines.push(`        Start-ADTProcess -FilePath '${action.file}'${args} -ErrorAction Stop`);
          break;
        }
        case 'exe_uninstall': {
          const args = action.args ? ` -ArgumentList '${action.args}'` : '';
          actionLines.push(`        Start-ADTProcess -FilePath '${action.file}'${args} -ErrorAction Stop`);
          break;
        }
        case 'msi_uninstall': {
          const args = action.args ? ` -ArgumentList '${action.appName}'` : '';
          actionLines.push(`        Uninstall-ADTApplication -Name '${action.appName}' -ApplicationType 'MSI'${args} -ErrorAction Stop`);
          break;
        }
        case 'msi_uninstall_batch': {
          const guids = Array.isArray(action.guids) ? action.guids : [];
          if (guids.length > 0) {
            actionLines.push('        # Batch MSI uninstall');
            guids.forEach(g => {
              actionLines.push(`        Uninstall-ADTApplication -Name '${g}' -ApplicationType 'MSI' -ErrorAction SilentlyContinue`);
            });
          }
          break;
        }
        case 'stop_process': {
          actionLines.push(`        Stop-Process -Name '${action.closeApps}' -Force -ErrorAction SilentlyContinue`);
          break;
        }
        case 'file_copy': {
          actionLines.push(`        $sourceFolder = "$dirFiles\\${action.source}"`);
          actionLines.push(`        $destinationFolder = '${action.dest}'`);
          actionLines.push(`        if (Test-Path -Path $destinationFolder -PathType Container) {`);
          actionLines.push(`            Copy-Item -Path $sourceFolder -Destination $destinationFolder -Recurse -Force`);
          actionLines.push(`        } else {`);
          actionLines.push(`            Copy-Item -Path $sourceFolder -Destination $destinationFolder -Recurse`);
          actionLines.push(`        }`);
          break;
        }
        case 'file_remove': {
          actionLines.push(`        $folderPath = '${action.path}'`);
          actionLines.push(`        if (Test-Path -Path $folderPath) {`);
          actionLines.push(`            Remove-Item -Path $folderPath -Force -Recurse`);
          actionLines.push(`        }`);
          break;
        }
        case 'create_folder': {
          actionLines.push(`        $folderPath = '${action.path}'`);
          actionLines.push(`        if (!(Test-Path -Path $folderPath)) {`);
          actionLines.push(`            New-Item -ItemType Directory -Path $folderPath -Force | Out-Null`);
          actionLines.push(`        }`);
          break;
        }
        case 'registry_marker': {
          const regKey = `HKLM:\\SOFTWARE\\Fiserv\\InstalledApps\\${packageId}`;
          actionLines.push('        # Write Fiserv registry detection marker');
          actionLines.push(`        Set-ADTRegistryKey -LiteralPath '${regKey}' \``);
          actionLines.push(`            -Name 'Version' -Type 'String' -Value '${version}'`);
          actionLines.push(`        Set-ADTRegistryKey -LiteralPath '${regKey}' \``);
          actionLines.push(`            -Name 'Publisher' -Type 'String' -Value '${publisher}'`);
          actionLines.push(`        Set-ADTRegistryKey -LiteralPath '${regKey}' \``);
          actionLines.push(`            -Name 'DisplayName' -Type 'String' -Value '${displayName}'`);
          actionLines.push(`        Set-ADTRegistryKey -LiteralPath '${regKey}' \``);
          actionLines.push(`            -Name 'InstallDate' -Type 'String' -Value (Get-Date -Format 'yyyy-MM-dd')`);
          break;
        }
        case 'remove_registry_marker': {
          const regKey = `HKLM:\\SOFTWARE\\Fiserv\\InstalledApps\\${packageId}`;
          actionLines.push('        # Remove Fiserv registry detection marker');
          actionLines.push(`        Remove-ADTRegistryKey -LiteralPath '${regKey}' -ErrorAction SilentlyContinue`);
          break;
        }
        case 'registry_set': {
          actionLines.push(`        Set-ADTRegistryKey -LiteralPath '${action.key}' -Name '${action.name}' -Type 'String' -Value '${action.value}'`);
          break;
        }
        case 'registry_remove': {
          actionLines.push(`        Remove-ADTRegistryKey -LiteralPath '${action.key}' -Name '${action.name}'`);
          break;
        }
        case 'env_variable': {
          actionLines.push(`        # Set environment variable: ${action.name}`);
          actionLines.push(`        $currentValue = [Environment]::GetEnvironmentVariable('${action.name}', 'Machine')`);
          actionLines.push(`        $newValue = '${action.value}' + ';' + $currentValue`);
          actionLines.push(`        [Environment]::SetEnvironmentVariable('${action.name}', $newValue, 'Machine')`);
          break;
        }
        case 'remove_env_variable': {
          actionLines.push(`        # Remove from environment variable: ${action.name}`);
          actionLines.push(`        $currentValue = [Environment]::GetEnvironmentVariable('${action.name}', 'Machine')`);
          actionLines.push(`        $newValue = ($currentValue -split ';' | Where-Object { $_ -ne '${action.value}' }) -join ';'`);
          actionLines.push(`        [Environment]::SetEnvironmentVariable('${action.name}', $newValue, 'Machine')`);
          break;
        }
        case 'show_completion': {
          actionLines.push(`        Show-ADTInstallationPrompt -Message 'The install has completed.' \``);
          actionLines.push("            -ButtonRightText 'OK' -Icon Information -NoWait -Timeout 5");
          break;
        }
        case 'sleep': {
          actionLines.push(`        Start-Sleep -Seconds ${action.seconds || 5}`);
          break;
        }
        case 'custom_variable': {
          const cleanName = (action.name || '').replace(/^\$/, '');
          if (cleanName) {
            actionLines.push(`        $${cleanName} = "${action.value || ''}"`);
          }
          break;
        }
        case 'custom_script': {
          if (action.note) actionLines.push(`        # Custom script: ${action.note}`);
          if (action.code) {
            action.code.split('\n').forEach(line => {
              actionLines.push(`        ${line.trimRight()}`);
            });
          }
          break;
        }
        case 'raw_ps': {
          if (action.note) actionLines.push(`        # Raw PowerShell: ${action.note}`);
          if (action.script) {
            action.script.split('\n').forEach(line => {
              actionLines.push(`        ${line.trimRight()}`);
            });
          }
          break;
        }
        case 'execute_process_as_user': {
          const isMsi = (action.file || '').toLowerCase().endsWith('.msi');
          const args = action.args ? ` -ArgumentList '${action.args}'` : '';
          if (isMsi) {
            actionLines.push(`        Start-ADTMsiProcessAsUser -Action 'Install' -FilePath '$dirFiles\\${action.file}'${args} -ErrorAction Stop`);
          } else {
            actionLines.push(`        Start-ADTProcessAsUser -FilePath '$dirFiles\\${action.file}'${args} -ErrorAction Stop`);
          }
          break;
        }
        case 'block_app_execution': {
          const header = action.textHeader ? ` -TextHeader '${action.textHeader}'` : '';
          const message = action.textMessage ? ` -TextMessage '${action.textMessage}'` : '';
          actionLines.push(`        Block-AppExecution -ProcessName '${action.processName}'${header}${message}`);
          break;
        }
        case 'unblock_app_execution': {
          actionLines.push(`        Unblock-AppExecution -ProcessName '${action.processName}'`);
          break;
        }
        case 'copy_file_to_user_profiles': {
          actionLines.push(`        Copy-FileToUserProfiles -FilePath "$dirFiles\\${action.source}" -DestinationFolderPath '${action.destination}'`);
          break;
        }
        case 'new_shortcut': {
          const args = action.arguments ? ` -Arguments '${action.arguments}'` : '';
          const icon = action.iconLocation ? ` -IconLocation '${action.iconLocation}'` : '';
          const desc = action.description ? ` -Description '${action.description}'` : '';
          actionLines.push(`        New-Shortcut -ShortcutPath '${action.shortcutPath}' -TargetPath '${action.targetPath}'${args}${icon}${desc}`);
          break;
        }
        case 'show_balloon_tip': {
          actionLines.push(`        Show-ADTBalloonTip -BalloonText '${action.balloonText}' -BalloonTitle '${action.balloonTitle}' -BalloonIcon '${action.balloonIcon || 'Info'}'`);
          break;
        }
        case 'show_dialog_box': {
          actionLines.push(`        Show-ADTDialogBox -Text '${action.text}' -Title '${action.title}' -Buttons '${action.buttons || 'OK'}' -Icon '${action.icon || 'Information'}'`);
          break;
        }
        case 'get_installed_application': {
          const cleanVar = (action.varName || '').replace(/^\$/, '');
          actionLines.push(`        $${cleanVar} = Get-InstalledApplication -Name '${action.name}'`);
          break;
        }
        case 'set_service_state': {
          actionLines.push(`        Set-ADTServiceState -Name '${action.name}' -State '${action.state}'`);
          break;
        }
        case 'write_log_entry': {
          actionLines.push(`        Write-ADTLogEntry -Message '${action.message}' -Severity ${action.severity || 1}`);
          break;
        }
        default:
          break;
      }

      if (actionLines.length > 0) {
        if (isClean) {
          actionLines.forEach(l => lines.push(l));
        } else {
          const actionData = encodeURIComponent(JSON.stringify(action));
          lines.push(`        # <SPA:Action Data="${actionData}">`);
          actionLines.forEach(l => lines.push(l));
          lines.push(`        # </SPA:Action>`);
        }
      }
    });

    return lines;
  }

  // ── 1. Variables section ($adtSession CloseApps) ─────────────────────────
  let closeAppsList = '@()';
  const preInstallActions = phases.preInstall?.actions || [];
  const welcomeAction = preInstallActions.find(a => a.type === 'show_welcome' || a.type === 'stop_process');
  if (welcomeAction && welcomeAction.closeApps) {
    const list = welcomeAction.closeApps.split(',').map(app => `'${app.trim()}'`).join(', ');
    closeAppsList = `@(${list})`;
  }

  // Extract parsed v3/v4 custom variables from the variableDeclaration phase
  const varActions = phases.variableDeclaration?.actions || [];

  // Helper to clean variable names by stripping $ and optional adtSession. prefix
  function getCleanVarName(name) {
    let clean = (name || '').replace(/^\$/, '');
    if (clean.toLowerCase().startsWith('adtsession.')) {
      clean = clean.slice(11);
    }
    return clean;
  }

  // Helper to find a parsed variable value case-insensitively
  function getVarVal(name, fallback) {
    const act = varActions.find(a => {
      const cleanName = getCleanVarName(a.name);
      return cleanName.toLowerCase() === name.toLowerCase();
    });
    return act ? act.value : fallback;
  }

  // Map onto PascalCase official PSADT v4 standard keys
  const appVendor = getVarVal('appVendor', s.publisher || 'Fiserv');
  const appName = getVarVal('appName', s.displayName || 'TODO-DISPLAY-NAME');
  const appVersion = getVarVal('appVersion', s.version || '1.0.0');
  const appArch = getVarVal('appArch', 'x64');
  const appLang = getVarVal('appLang', 'EN');
  const appRevision = getVarVal('appRevision', '01');
  const appScriptVersion = getVarVal('appScriptVersion', '1.0.0');
  const appScriptDate = getVarVal('appScriptDate', today);
  const appScriptAuthor = getVarVal('appScriptAuthor', 'SPA Factory');

  // Support v3 style installName/installTitle overrides if present, otherwise default to v4 standard format
  const defaultInstallName = `${appName} ${appVersion}`;
  const installName = getVarVal('installName', defaultInstallName);
  const installTitle = getVarVal('installTitle', defaultInstallName);

  // ── 2. Standard custom variables ─────────────────────────────────────────
  const standardVars = [];
  const standardKeys = [
    'appvendor', 'appname', 'appversion', 'apparch', 'applang',
    'apprevision', 'appsuccessexitcodes', 'apprebootexitcodes',
    'appprocessestoclose', 'appscriptversion', 'appscriptdate',
    'appscriptauthor', 'requireadmin', 'installname', 'installtitle',
    'deployappscriptfriendlyname', 'deployappscriptparameters',
    'deployappscriptversion'
  ];

  varActions.forEach(action => {
    if (action.enabled === false) return;
    const cleanName = getCleanVarName(action.name);
    if (cleanName) {
      // If it is one of the standard official variables, omit it from custom variables list to avoid duplicates
      if (standardKeys.includes(cleanName.toLowerCase())) return;

      const codeLine = `    ${cleanName} = '${action.value || ''}'`;
      if (isClean) {
        standardVars.push(codeLine);
      } else {
        const actionData = encodeURIComponent(JSON.stringify(action));
        standardVars.push(`    # <SPA:Action Data="${actionData}">`);
        standardVars.push(codeLine);
        standardVars.push(`    # </SPA:Action>`);
      }
    }
  });

  // ── 3. Build block strings per phase ─────────────────────────────────────
  
  // Helper to compile standard visual actions, followed by a separate CustomCode block
  function compilePhaseBlock(actions, phaseName, guideDesc) {
    const builderActions = (actions || []).filter(a => !a.isCustomCodeBlock);
    const customCodeActions = (actions || []).filter(a => a.isCustomCodeBlock);

    const builderLines = convertToActionLines(builderActions);

    const customLines = [];
    customLines.push(`        # <SPA:CustomCode Phase="${phaseName}" Guide="${guideDesc}">`);
    if (customCodeActions.length > 0) {
      customCodeActions.forEach(a => {
        if (a.script) {
          a.script.split(/\r?\n/).forEach(l => {
            customLines.push(`        ${l.trimRight()}`);
          });
        }
      });
    } else {
      customLines.push(`        # TODO: ${guideDesc}`);
    }
    customLines.push('        # </SPA:CustomCode>');

    return [...builderLines, ...customLines].join('\n');
  }

  // Install phases
  const preInstallWelcome = convertToCloseWelcomeBlock(phases.preInstall?.actions, 'PreInstall');
  const preInstallActionsList = (phases.preInstall?.actions || []).filter(a => a.type !== 'show_welcome' && a.type !== 'stop_process' && a.type !== 'show_progress');
  const preInstallBlock = [
    ...preInstallWelcome,
    compilePhaseBlock(preInstallActionsList, 'Pre-Install', 'Enter custom pre-installation script code here (e.g. show welcome prompt, stop processes, check requirements)')
  ].filter(Boolean).join('\n');

  const installBlock = compilePhaseBlock(phases.install?.actions, 'Install', 'Enter custom installation script code here (e.g. run MSI/EXE installer, perform file copy)');

  const postInstallBlock = compilePhaseBlock(phases.postInstall?.actions, 'Post-Install', 'Enter custom post-installation script code here (e.g. apply registry keys, set environment variables, cleanup temporary files)');

  // Uninstall phases
  const preUninstallWelcome = convertToCloseWelcomeBlock(phases.preUninstall?.actions, 'PreUninstall');
  const preUninstallActionsList = (phases.preUninstall?.actions || []).filter(a => a.type !== 'show_welcome' && a.type !== 'stop_process' && a.type !== 'show_progress');
  const preUninstallBlock = [
    ...preUninstallWelcome,
    compilePhaseBlock(preUninstallActionsList, 'Pre-Uninstall', 'Enter custom pre-uninstallation script code here (e.g. show welcome prompt, close processes before uninstalling)')
  ].filter(Boolean).join('\n');

  const uninstallBlock = compilePhaseBlock(phases.uninstall?.actions, 'Uninstall', 'Enter custom uninstallation script code here (e.g. run MSI/EXE uninstall commands)');

  const postUninstallBlock = compilePhaseBlock(phases.postUninstall?.actions, 'Post-Uninstall', 'Enter custom post-uninstallation script code here (e.g. delete config folders, remove registry keys)');

  // Repair phases
  let preRepairBlock, repairBlock, postRepairBlock;
  if (lc.repairMode === 'mirror') {
    preRepairBlock = preInstallBlock;
    repairBlock = installBlock;
    postRepairBlock = postInstallBlock;
  } else {
    const preRepairWelcome = convertToCloseWelcomeBlock(phases.preRepair?.actions, 'PreRepair');
    const preRepairActionsList = (phases.preRepair?.actions || []).filter(a => a.type !== 'show_welcome' && a.type !== 'stop_process' && a.type !== 'show_progress');
    preRepairBlock = [
      ...preRepairWelcome,
      compilePhaseBlock(preRepairActionsList, 'Pre-Repair', 'Enter custom pre-repair script code here (e.g. close processes, check corrupt states)')
    ].filter(Boolean).join('\n');

    repairBlock = compilePhaseBlock(phases.repair?.actions, 'Repair', 'Enter custom repair script code here (e.g. run repair commands, re-copy pristine files)');

    postRepairBlock = compilePhaseBlock(phases.postRepair?.actions, 'Post-Repair', 'Enter custom post-repair script code here (e.g. verify repair, log completion)');
  }

  // ── 4. Assemble standard PSADT template ──────────────────────────────────
  return `<#
.SYNOPSIS
    ${displayName} - PSADT v4 deployment script.
    Generated by SPA Workbench on ${today}.

.DESCRIPTION
    Performs Install, Uninstall, or Repair of ${displayName}.
    Uses the PSAppDeployToolkit v4 function-based architecture.

.NOTES
    Framework : PSAppDeployToolkit ${frameworkVersion}
    Package   : ${packageId}
    Version   : ${version}
#>

[CmdletBinding()]
param
(
    [Parameter(Mandatory = $false)]
    [ValidateSet('Install', 'Uninstall', 'Repair')]
    [System.String]$DeploymentType,

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

$adtSession = @{
    AppVendor              = '${appVendor}'
    AppName                = '${appName}'
    AppVersion             = '${appVersion}'
    AppArch                = '${appArch}'
    AppLang                = '${appLang}'
    AppRevision            = '${appRevision}'
    AppSuccessExitCodes    = @(0)
    AppRebootExitCodes     = @(1641, 3010)
    AppProcessesToClose    = ${closeAppsList}
    AppScriptVersion       = '${appScriptVersion}'
    AppScriptDate          = '${appScriptDate}'
    AppScriptAuthor        = '${appScriptAuthor}'
    RequireAdmin           = $true

    InstallName            = '${installName}'
    InstallTitle           = '${installTitle}'

    DeployAppScriptFriendlyName = $MyInvocation.MyCommand.Name
    DeployAppScriptParameters   = $PSBoundParameters
    DeployAppScriptVersion      = '${frameworkVersion}'${standardVars.length > 0 ? '\n' + standardVars.join('\n') : ''}
}


##================================================
## MARK: Deployment Flow
##================================================

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

${preInstallBlock}

    ##================================================
    ## MARK: Install
    ##================================================
    $adtSession.InstallPhase = $adtSession.DeploymentType

${installBlock}

    ##================================================
    ## MARK: Post-Install
    ##================================================
    $adtSession.InstallPhase = "Post-$($adtSession.DeploymentType)"

${postInstallBlock}
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

${preUninstallBlock}

    ##================================================
    ## MARK: Uninstall
    ##================================================
    $adtSession.InstallPhase = $adtSession.DeploymentType

${uninstallBlock}

    ##================================================
    ## MARK: Post-Uninstall
    ##================================================
    $adtSession.InstallPhase = "Post-$($adtSession.DeploymentType)"

${postUninstallBlock}
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

${preRepairBlock}

    ##================================================
    ## MARK: Repair
    ##================================================
    $adtSession.InstallPhase = $adtSession.DeploymentType

${repairBlock}

    ##================================================
    ## MARK: Post-Repair
    ##================================================
    $adtSession.InstallPhase = "Post-$($adtSession.DeploymentType)"

${postRepairBlock}
}


##================================================
## MARK: Initialization
##================================================

$ErrorActionPreference = [System.Management.Automation.ActionPreference]::Stop
$ProgressPreference = [System.Management.Automation.ActionPreference]::SilentlyContinue
Set-StrictMode -Version 1

try
{
    if (Test-Path -LiteralPath "$PSScriptRoot\\PSAppDeployToolkit\\PSAppDeployToolkit.psd1" -PathType Leaf)
    {
        Get-ChildItem -LiteralPath "$PSScriptRoot\\PSAppDeployToolkit" -Recurse -File | Unblock-File -ErrorAction Ignore
        Import-Module -FullyQualifiedName @{ ModuleName = "$PSScriptRoot\\PSAppDeployToolkit\\PSAppDeployToolkit.psd1"; Guid = '8c3c366b-8606-4576-9f2d-4051144f7ca2'; ModuleVersion = '${frameworkVersion}' } -Force
    }
    else
    {
        Import-Module -FullyQualifiedName @{ ModuleName = 'PSAppDeployToolkit'; Guid = '8c3c366b-8606-4576-9f2d-4051144f7ca2'; ModuleVersion = '${frameworkVersion}' } -Force
    }

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

try
{
    Get-ChildItem -LiteralPath $PSScriptRoot -Directory | & {
        process
        {
            if ($_.Name -match 'PSAppDeployToolkit\\..+$')
            {
                Get-ChildItem -LiteralPath $_.FullName -Recurse -File | Unblock-File -ErrorAction Ignore
                Import-Module -Name $_.FullName -Force
            }
        }
    }

    & "$($adtSession.DeploymentType)-ADTDeployment"
    Close-ADTSession
}
catch
{
    $mainErrorMessage = "An unhandled error within [$($MyInvocation.MyCommand.Name)] has occurred.\`n$(Resolve-ADTErrorRecord -ErrorRecord $_)"
    Write-ADTLogEntry -Message $mainErrorMessage -Severity 3
    Close-ADTSession -ExitCode 60001
}
`;
}
