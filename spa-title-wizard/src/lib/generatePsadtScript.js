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
  const frameworkVersion = '4.1.8';
  const today = new Date().toISOString().split('T')[0];

  // ── Standard PSADT 4.1 template boilerplate (framework code, not user-editable) ──
  // These blocks are always present in the official template and are not exposed in the builder.
  // Action types show_welcome, show_progress, stop_process are framework-level, not user actions.
  const frameworkActionTypes = new Set(['show_welcome', 'show_progress', 'stop_process']);

  // Fingerprints that identify standard template boilerplate inside raw_ps action scripts.
  // When the parser reads a 4.1.x source, it creates raw_ps actions from these blocks.
  // Since the generator now injects them as hardcoded boilerplate, we must filter them
  // out of user actions to prevent duplication.
  const BOILERPLATE_FINGERPRINTS = [
    // Pre-Install welcome splatting
    /\$saiwParams\s*=\s*@\{/,
    /Show-ADTInstallationWelcome\s+@saiwParams/,
    // Standalone progress message (not inside user script context)
    /^\s*Show-ADTInstallationProgress\s*$/m,
    // Countdown welcome for uninstall/repair
    /\$adtSession\.AppProcessesToClose\.Count\s+-gt\s+0[\s\S]*Show-ADTInstallationWelcome\s+-CloseProcesses/,
    // Zero-Config MSI handler
    /\$adtSession\.UseDefaultMsi[\s\S]*\$ExecuteDefaultMSISplat/,
    /\$ExecuteDefaultMSISplat\s*=\s*@\{/,
    // Post-install prompt (standard template text)
    /Show-ADTInstallationPrompt\s+-Message\s+'You can customize text to appear/,
  ];

  /**
   * Returns true if a raw_ps action’s script content matches standard template
   * boilerplate that the generator already injects. These must NOT be emitted
   * as user actions, otherwise the boilerplate appears twice in the output.
   */
  function isBoilerplateBlock(action) {
    if (action.type !== 'raw_ps' || !action.script) return false;
    const s = action.script.trim();
    // Short standalone lines that are pure boilerplate
    if (/^\s*(##=+\s*$|##\s*(MARK|Show Welcome|Show Progress|Handle Zero|Display a message|If there are processes))/im.test(s)) return true;
    return BOILERPLATE_FINGERPRINTS.some(rx => rx.test(s));
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
          const transform = action.transform ? ` -Transforms '${action.transform}'` : '';
          const addlArgs = action.additionalArgs ? ` -AdditionalArgumentList '${action.additionalArgs}'` : '';
          const logName = action.logName ? ` -LogName '${action.logName}'` : '';
          const successCodes = action.successExitCodes ? ` -SuccessExitCodes ${action.successExitCodes}` : '';
          const rebootCodes = action.rebootExitCodes ? ` -RebootExitCodes ${action.rebootExitCodes}` : '';
          actionLines.push(`        Start-ADTMsiProcess -Action 'Install' -FilePath '$dirFiles\\${action.file}'${args}${transform}${addlArgs}${logName}${successCodes}${rebootCodes}`);
          break;
        }
        case 'exe_install': {
          const args = action.args ? ` -ArgumentList '${action.args}'` : '';
          const ws = action.windowStyle ? ` -WindowStyle '${action.windowStyle}'` : '';
          const nw = action.noWait ? ' -NoWait' : '';
          const successCodes = action.successExitCodes ? ` -SuccessExitCodes ${action.successExitCodes}` : '';
          const ignoreCodes = action.ignoreExitCodes ? ` -IgnoreExitCodes ${action.ignoreExitCodes}` : '';
          actionLines.push(`        Start-ADTProcess -FilePath '$dirFiles\\${action.file}'${args}${ws}${nw}${successCodes}${ignoreCodes}`);
          break;
        }
        case 'execute_process': {
          const args = action.args ? ` -ArgumentList '${action.args}'` : '';
          const ws = action.windowStyle ? ` -WindowStyle '${action.windowStyle}'` : '';
          const nw = action.noWait ? ' -NoWait' : '';
          const successCodes = action.successExitCodes ? ` -SuccessExitCodes ${action.successExitCodes}` : '';
          const ignoreCodes = action.ignoreExitCodes ? ` -IgnoreExitCodes ${action.ignoreExitCodes}` : '';
          actionLines.push(`        Start-ADTProcess -FilePath '${action.file}'${args}${ws}${nw}${successCodes}${ignoreCodes}`);
          break;
        }
        case 'exe_uninstall': {
          const args = action.args ? ` -ArgumentList '${action.args}'` : '';
          const ws = action.windowStyle ? ` -WindowStyle '${action.windowStyle}'` : '';
          const nw = action.noWait ? ' -NoWait' : '';
          const successCodes = action.successExitCodes ? ` -SuccessExitCodes ${action.successExitCodes}` : '';
          const ignoreCodes = action.ignoreExitCodes ? ` -IgnoreExitCodes ${action.ignoreExitCodes}` : '';
          actionLines.push(`        Start-ADTProcess -FilePath '${action.file}'${args}${ws}${nw}${successCodes}${ignoreCodes}`);
          break;
        }
        case 'msi_uninstall': {
          const args = action.args ? ` -ArgumentList '${action.args}'` : '';
          if (action.productCode) {
            actionLines.push(`        Start-ADTMsiProcess -Action 'Uninstall' -ProductCode '${action.productCode}'${args}`);
          } else {
            actionLines.push(`        Uninstall-ADTApplication -Name '${action.appName || 'Unknown'}'${args}`);
          }
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
        case 'file_copy': {
          const recurse = action.recurse !== false ? ' -Recurse' : '';
          const flatten = action.flatten ? ' -Flatten' : '';
          const mode = action.fileCopyMode ? ` -FileCopyMode '${action.fileCopyMode}'` : '';
          actionLines.push(`        Copy-ADTFile -Path "$dirFiles\\${action.source}" -Destination '${action.dest}'${recurse}${flatten}${mode}`);
          break;
        }
        case 'file_remove': {
          actionLines.push(`        Remove-ADTFile -Path '${action.path}' -ErrorAction SilentlyContinue`);
          break;
        }
        case 'create_folder': {
          actionLines.push(`        New-ADTFolder -Path '${action.path}'`);
          break;
        }
        case 'registry_marker': {
          const regKey = `HKLM:\\SOFTWARE\\Fiserv\\InstalledApps\\${packageId}`;
          actionLines.push('        # Write Fiserv registry detection marker');
          actionLines.push(`        Set-ADTRegistryKey -Key '${regKey}' -Name 'Version' -Type 'String' -Value '${version}'`);
          actionLines.push(`        Set-ADTRegistryKey -Key '${regKey}' -Name 'Publisher' -Type 'String' -Value '${publisher}'`);
          actionLines.push(`        Set-ADTRegistryKey -Key '${regKey}' -Name 'DisplayName' -Type 'String' -Value '${displayName}'`);
          actionLines.push(`        Set-ADTRegistryKey -Key '${regKey}' -Name 'InstallDate' -Type 'String' -Value (Get-Date -Format 'yyyy-MM-dd')`);
          break;
        }
        case 'remove_registry_marker': {
          const regKey = `HKLM:\\SOFTWARE\\Fiserv\\InstalledApps\\${packageId}`;
          actionLines.push('        # Remove Fiserv registry detection marker');
          actionLines.push(`        Remove-ADTRegistryKey -Key '${regKey}' -ErrorAction SilentlyContinue`);
          break;
        }
        case 'registry_set': {
          const regType = action.regType ? ` -Type '${action.regType}'` : " -Type 'String'";
          const sid = action.sid ? ` -SID '${action.sid}'` : '';
          actionLines.push(`        Set-ADTRegistryKey -Key '${action.key}' -Name '${action.name}'${regType} -Value '${action.value}'${sid}`);
          break;
        }
        case 'registry_remove': {
          const name = action.name ? ` -Name '${action.name}'` : '';
          actionLines.push(`        Remove-ADTRegistryKey -Key '${action.key}'${name}`);
          break;
        }
        case 'env_variable': {
          actionLines.push(`        Set-ADTEnvironmentVariable -Name '${action.name}' -Value '${action.value}' -Target 'Machine'`);
          break;
        }
        case 'remove_env_variable': {
          actionLines.push(`        Remove-ADTEnvironmentVariable -Name '${action.name}' -Target 'Machine'`);
          break;
        }
        case 'show_completion': {
          actionLines.push(`        Show-ADTInstallationPrompt -Message 'The install has completed.' -ButtonRightText 'OK' -Icon Information -NoWait -Timeout 5`);
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
          const ws = action.windowStyle ? ` -WindowStyle '${action.windowStyle}'` : '';
          const nw = action.noWait ? ' -NoWait' : '';
          if (isMsi) {
            actionLines.push(`        Start-ADTMsiProcessAsUser -Action 'Install' -FilePath '$dirFiles\\${action.file}'${args}`);
          } else {
            actionLines.push(`        Start-ADTProcessAsUser -FilePath '$dirFiles\\${action.file}'${args}${ws}${nw}`);
          }
          break;
        }
        case 'block_app_execution': {
          actionLines.push(`        Block-ADTAppExecution -ProcessName '${action.processName}'`);
          break;
        }
        case 'unblock_app_execution': {
          actionLines.push('        Unblock-ADTAppExecution');
          break;
        }
        case 'copy_file_to_user_profiles': {
          actionLines.push(`        Copy-ADTFileToUserProfiles -Path "$dirFiles\\${action.source}" -Destination '${action.destination}'`);
          break;
        }
        case 'new_shortcut': {
          const args = action.arguments ? ` -Arguments '${action.arguments}'` : '';
          const icon = action.iconLocation ? ` -IconLocation '${action.iconLocation}'` : '';
          const desc = action.description ? ` -Description '${action.description}'` : '';
          const workDir = action.workingDirectory ? ` -WorkingDirectory '${action.workingDirectory}'` : '';
          const ws = action.windowStyle ? ` -WindowStyle '${action.windowStyle}'` : '';
          const admin = action.runAsAdmin ? ' -RunAsAdmin' : '';
          const hotkey = action.hotkey ? ` -Hotkey '${action.hotkey}'` : '';
          actionLines.push(`        New-ADTShortcut -Path '${action.shortcutPath}' -TargetPath '${action.targetPath}'${args}${icon}${desc}${workDir}${ws}${admin}${hotkey}`);
          break;
        }
        case 'show_balloon_tip': {
          actionLines.push(`        Show-ADTBalloonTip -BalloonTipText '${action.balloonText}' -BalloonTipTitle '${action.balloonTitle}' -BalloonTipIcon '${action.balloonIcon || 'Info'}'`);
          break;
        }
        case 'show_dialog_box': {
          actionLines.push(`        Show-ADTDialogBox -Text '${action.text}' -Title '${action.title}' -Buttons '${action.buttons || 'OK'}' -Icon '${action.icon || 'Information'}'`);
          break;
        }
        case 'get_installed_application': {
          const cleanVar = (action.varName || '').replace(/^\$/, '');
          const pc = action.productCode ? ` -ProductCode '${action.productCode}'` : '';
          const pub = action.publisher ? ` -Publisher '${action.publisher}'` : '';
          const exact = action.exact ? ' -Exact' : '';
          const arch = action.architecture ? ` -Architecture '${action.architecture}'` : '';
          actionLines.push(`        $${cleanVar} = Get-ADTApplication -Name '${action.name}'${pc}${pub}${exact}${arch}`);
          break;
        }
        case 'set_service_state': {
          const mode = (action.mode || action.state || 'stop').toLowerCase();
          if (mode === 'start') {
            actionLines.push(`        Start-ADTServiceAndDependencies -Name '${action.name}'`);
          } else if (mode === 'stop') {
            actionLines.push(`        Stop-ADTServiceAndDependencies -Name '${action.name}'`);
          } else {
            // Startup type: Automatic, Manual, Disabled
            actionLines.push(`        Set-ADTServiceStartMode -Name '${action.name}' -StartMode '${action.startMode || mode}'`);
          }
          break;
        }
        case 'write_log_entry': {
          actionLines.push(`        Write-ADTLogEntry -Message '${action.message}' -Severity ${action.severity || 1}`);
          break;
        }
        // ── Phase 3: New action types ──────────────────────────────────────
        case 'restart_prompt': {
          const countdown = action.countdownSeconds ? ` -CountdownSeconds ${action.countdownSeconds}` : ' -CountdownSeconds 600';
          const noHide = action.countdownNoHideSeconds ? ` -CountdownNoHideSeconds ${action.countdownNoHideSeconds}` : '';
          const noSilent = action.noSilentRestart ? ' -NoSilentRestart' : '';
          actionLines.push(`        Show-ADTInstallationRestartPrompt${countdown}${noHide}${noSilent}`);
          break;
        }
        case 'active_setup': {
          const setupArgs = action.arguments ? ` -Arguments '${action.arguments}'` : '';
          const setupDesc = action.description ? ` -Description '${action.description}'` : '';
          const setupVer = action.version ? ` -Version '${action.version}'` : '';
          actionLines.push(`        Set-ADTActiveSetup -StubExePath '${action.stubExePath}'${setupArgs}${setupDesc}${setupVer} -Key '${action.key || packageId}'`);
          break;
        }
        case 'all_users_registry': {
          actionLines.push(`        Invoke-ADTAllUsersRegistryAction -ScriptBlock {`);
          if (action.code) {
            action.code.split('\n').forEach(line => {
              actionLines.push(`            ${line.trimRight()}`);
            });
          } else {
            actionLines.push('            # Per-user registry actions here');
          }
          actionLines.push('        }');
          break;
        }
        case 'add_edge_extension': {
          const installMode = action.installationMode ? ` -InstallationMode '${action.installationMode}'` : " -InstallationMode 'force_installed'";
          const updateUrl = action.updateUrl ? ` -UpdateUrl '${action.updateUrl}'` : '';
          const minVer = action.minimumVersionRequired ? ` -MinimumVersionRequired '${action.minimumVersionRequired}'` : '';
          actionLines.push(`        Add-ADTEdgeExtension -ExtensionID '${action.extensionId}'${installMode}${updateUrl}${minVer}`);
          break;
        }
        case 'remove_edge_extension': {
          actionLines.push(`        Remove-ADTEdgeExtension -ExtensionID '${action.extensionId}'`);
          break;
        }
        case 'register_dll': {
          const regAction = action.action === 'Unregister' ? 'Unregister' : 'Register';
          if (regAction === 'Register') {
            actionLines.push(`        Register-ADTDll -FilePath '${action.filePath}'`);
          } else {
            actionLines.push(`        Unregister-ADTDll -FilePath '${action.filePath}'`);
          }
          break;
        }
        case 'install_ms_updates': {
          const dir = action.directory ? ` -Directory '${action.directory}'` : '';
          actionLines.push(`        Install-ADTMSUpdates${dir}`);
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
  // Skips systemManaged actions (PS expressions hardcoded in the template)
  // but allows readOnly-only vars like RequireAdmin which packagers can edit
  function getVarVal(name, fallback) {
    const act = varActions.find(a => {
      if (a.systemManaged) return false;
      const cleanName = getCleanVarName(a.name);
      return cleanName.toLowerCase() === name.toLowerCase();
    });
    return act ? act.value : fallback;
  }

  // ── 1. Variables section ─────────────────────────────────────────────────
  // AppProcessesToClose comes from the variable declaration, not from action cards
  const closeAppsVar = varActions.find(a => getCleanVarName(a.name).toLowerCase() === 'appprocessestoclose');
  let closeAppsList = '@()';
  if (closeAppsVar && closeAppsVar.value) {
    const rawVal = closeAppsVar.value.trim();
    // If already in @(...) format, use as-is; otherwise wrap
    if (rawVal.startsWith('@(')) {
      closeAppsList = rawVal;
    } else {
      const items = rawVal.split(',').map(s => `'${s.trim()}'`).filter(s => s !== "''").join(', ');
      closeAppsList = items ? `@(${items})` : '@()';
    }
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

  // Helper: filter out framework-level actions and boilerplate raw_ps blocks
  function userActions(phaseKey) {
    return (phases[phaseKey]?.actions || []).filter(a => {
      if (frameworkActionTypes.has(a.type)) return false;
      if (isBoilerplateBlock(a)) return false;
      return true;
    });
  }

  // ── Standard boilerplate: Pre-Install Welcome (splatting pattern) ────────
  const STD_PREINSTALL_WELCOME = `    ## Show Welcome Message, close processes if specified, allow up to 3 deferrals, verify there is enough disk space to complete the install, and persist the prompt.
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
    Show-ADTInstallationWelcome @saiwParams

    ## Show Progress Message (with the default message).
    Show-ADTInstallationProgress`;

  // ── Standard boilerplate: Pre-Uninstall/Pre-Repair countdown welcome ────
  const STD_COUNTDOWN_WELCOME = `    ## If there are processes to close, show Welcome Message with a 60 second countdown before automatically closing.
    if ($adtSession.AppProcessesToClose.Count -gt 0)
    {
        Show-ADTInstallationWelcome -CloseProcesses $adtSession.AppProcessesToClose -CloseProcessesCountdown 60
    }

    ## Show Progress Message (with the default message).
    Show-ADTInstallationProgress`;

  // ── Standard boilerplate: Zero-Config MSI handler (Install) ─────────────
  const STD_ZEROCONFIG_MSI_INSTALL = `    ## Handle Zero-Config MSI installations.
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
    }`;

  // ── Standard boilerplate: Zero-Config MSI handler (Uninstall/Repair) ────
  const STD_ZEROCONFIG_MSI_OTHER = `    ## Handle Zero-Config MSI uninstallations.
    if ($adtSession.UseDefaultMsi)
    {
        $ExecuteDefaultMSISplat = @{ Action = $adtSession.DeploymentType; FilePath = $adtSession.DefaultMsiFile }
        if ($adtSession.DefaultMstFile)
        {
            $ExecuteDefaultMSISplat.Add('Transforms', $adtSession.DefaultMstFile)
        }
        Start-ADTMsiProcess @ExecuteDefaultMSISplat
    }`;

  // ── Standard boilerplate: Post-Install prompt ───────────────────────────
  const STD_POSTINSTALL_PROMPT = `    ## Display a message at the end of the install.
    if (!$adtSession.UseDefaultMsi)
    {
        Show-ADTInstallationPrompt -Message 'You can customize text to appear at the end of an install or remove it completely for unattended installations.' -ButtonRightText 'OK' -NoWait
    }`;

  // Install phases
  const preInstallBlock = [
    STD_PREINSTALL_WELCOME,
    compilePhaseBlock(userActions('preInstall'), 'Pre-Install', 'Perform Pre-Installation tasks here')
  ].join('\n\n');

  const installBlock = [
    STD_ZEROCONFIG_MSI_INSTALL,
    compilePhaseBlock(userActions('install'), 'Install', 'Perform Installation tasks here')
  ].join('\n\n');

  const postInstallBlock = [
    compilePhaseBlock(userActions('postInstall'), 'Post-Install', 'Perform Post-Installation tasks here'),
    STD_POSTINSTALL_PROMPT,
  ].join('\n\n');

  // Uninstall phases
  const preUninstallBlock = [
    STD_COUNTDOWN_WELCOME,
    compilePhaseBlock(userActions('preUninstall'), 'Pre-Uninstall', 'Perform Pre-Uninstallation tasks here')
  ].join('\n\n');

  const uninstallBlock = [
    STD_ZEROCONFIG_MSI_OTHER,
    compilePhaseBlock(userActions('uninstall'), 'Uninstall', 'Perform Uninstallation tasks here')
  ].join('\n\n');

  const postUninstallBlock = compilePhaseBlock(userActions('postUninstall'), 'Post-Uninstall', 'Perform Post-Uninstallation tasks here');

  // Repair phases
  let preRepairBlock, repairBlock, postRepairBlock;
  if (lc.repairMode === 'mirror') {
    preRepairBlock = preInstallBlock;
    repairBlock = installBlock;
    postRepairBlock = postInstallBlock;
  } else {
    preRepairBlock = [
      STD_COUNTDOWN_WELCOME,
      compilePhaseBlock(userActions('preRepair'), 'Pre-Repair', 'Perform Pre-Repair tasks here')
    ].join('\n\n');

    repairBlock = [
      STD_ZEROCONFIG_MSI_OTHER,
      compilePhaseBlock(userActions('repair'), 'Repair', 'Perform Repair tasks here')
    ].join('\n\n');

    postRepairBlock = compilePhaseBlock(userActions('postRepair'), 'Post-Repair', 'Perform Post-Repair tasks here');
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
    RequireAdmin           = ${getVarVal('requireAdmin', '$true')}

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
