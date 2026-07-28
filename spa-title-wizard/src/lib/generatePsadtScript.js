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
  // stop_process is a framework-level marker, not a user action.
  const frameworkActionTypes = new Set([]);

  // Fingerprints that identify standard template boilerplate inside raw_ps action scripts.
  // When the parser reads a 4.1.x source, it creates raw_ps actions from these blocks.
  // Since the generator now injects them as hardcoded boilerplate, we must filter them
  // out of user actions to prevent duplication.
  const BOILERPLATE_FINGERPRINTS = [
    // Zero-Config MSI handler
    /\$adtSession\.UseDefaultMsi[\s\S]*\$ExecuteDefaultMSISplat/,
    /\$ExecuteDefaultMSISplat\s*=\s*@\{/,
    // Post-install prompt (standard template text)
    /Show-ADTInstallationPrompt\s+-Message\s+'You can customize text to appear/,
  ];

  /**
   * Returns true if a raw_ps action's script content matches standard template
   * boilerplate that the generator already injects. These must NOT be emitted
   * as user actions, otherwise the boilerplate appears twice in the output.
   *
   * TWO-TIER logic:
   *  1. BOILERPLATE_FINGERPRINTS — precise regex matches for known template
   *     blocks (e.g. Zero-Config MSI handler). Always filter, even when the
   *     block contains executable code.
   *  2. Comment-header patterns — only filter when the block has NO executable
   *     code, to avoid suppressing user blocks that happen to start with a
   *     boilerplate-looking comment (e.g. ## Show Welcome Message + $saiwParams).
   */
  function isBoilerplateBlock(action) {
    if (action.type !== 'raw_ps' || !action.script) return false;
    const s = action.script.trim();

    // Tier 1: precise fingerprints — always filter regardless of executable content
    if (BOILERPLATE_FINGERPRINTS.some(rx => rx.test(s))) return true;

    // Tier 2: comment/header-only blocks — only filter when no executable lines present
    const hasExecutable = s.split('\n').some(line => {
      const t = line.trim();
      return t && !t.startsWith('#') && !t.startsWith('<#');
    });
    if (hasExecutable) return false;

    // Pure comment/header-only: check for boilerplate section markers
    return /^\s*(##=+\s*$|##\s*(MARK|Show Welcome|Show Progress|Handle Zero|Display a message|If there are processes))/im.test(s);
  }


  // ── Installer subfolder helper ──────────────────────────────────────────
  // When installerSubfolder is set, the primary installer lives in a subdirectory
  // of Files/ (e.g. Files\Bin\setup.exe). Prefix its path with the PS variable
  // expression so PSADT resolves it correctly at deploy time.
  const _installerSubfolder = (s.installerSubfolder || '').replace(/^[/\\]+|[/\\]+$/g, '');
  const _primaryInstallerFile = s.installerType === 'msi'
    ? (s.msiFileName || s.installerSourceFile || '')
    : (s.exeSourceFilename || s.installerSourceFile || '');

  // Returns the correctly-prefixed FilePath for an installer action.
  // Bare filenames that match the primary installer get the DirFiles prefix;
  // everything else (uninstall paths, support tools) is returned as-is.
  function resolveFilePath(file) {
    if (!file || !_installerSubfolder) return file;
    // Only prefix if this is the primary installer filename (no path separators present)
    if (file === _primaryInstallerFile || file === _primaryInstallerFile.split(/[\\/]/).pop()) {
      const sub = _installerSubfolder.replace(/\//g, '\\');
      return `"$($adtSession.DirFiles)\\${sub}\\${file}"`;
    }
    return file;
  }

  /**
   * Wrap a resolved file path in the correct PS quote style:
   *  - PS expressions like "$($adtSession.DirFiles)\..." stay double-quoted
   *  - Plain strings use single quotes
   * Returns the full -FilePath 'x' or -FilePath "x" fragment.
   */
  function filePathParam(resolved) {
    if (!resolved) return '';
    if (resolved.startsWith('"')) return ` -FilePath ${resolved}`;
    return ` -FilePath '${resolved}'`;
  }

  // ── Helper: Compile Action list to PS1 lines ───────────────────────────
  function convertToActionLines(actions) {
    const lines = [];
    if (!actions || actions.length === 0) return lines;

    actions.forEach(action => {
      if (action.enabled === false) return;

      // generateActionCmd returns raw lines (no leading spaces).
      const rawLines = generateActionCmd(action, { resolveFilePath, filePathParam });
      if (rawLines.length === 0) return;

      // Apply 8-space generator indent and wrap with SPA:Action tags if needed.
      const indented = rawLines.map(l => (l === '' ? '' : `        ${l}`));
      if (isClean) {
        indented.forEach(l => lines.push(l));
      } else {
        const actionData = encodeURIComponent(JSON.stringify(action));
        lines.push(`        # <SPA:Action Data="${actionData}">`);
        indented.forEach(l => lines.push(l));
        lines.push(`        # </SPA:Action>`);
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

  // Install phases — show_welcome and show_progress now come from user action cards
  const preInstallBlock = compilePhaseBlock(userActions('preInstall'), 'Pre-Install', 'Perform Pre-Installation tasks here');

  const installBlock = [
    STD_ZEROCONFIG_MSI_INSTALL,
    compilePhaseBlock(userActions('install'), 'Install', 'Perform Installation tasks here')
  ].join('\n\n');

  const postInstallBlock = compilePhaseBlock(userActions('postInstall'), 'Post-Install', 'Perform Post-Installation tasks here');

  // Uninstall phases
  const preUninstallBlock = compilePhaseBlock(userActions('preUninstall'), 'Pre-Uninstall', 'Perform Pre-Uninstallation tasks here');

  const uninstallBlock = [
    STD_ZEROCONFIG_MSI_OTHER,
    compilePhaseBlock(userActions('uninstall'), 'Uninstall', 'Perform Uninstallation tasks here')
  ].join('\n\n');

  const postUninstallBlock = compilePhaseBlock(userActions('postUninstall'), 'Post-Uninstall', 'Perform Post-Uninstallation tasks here');



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


/**
 * Helper to smart quote strings containing PS variables
 */
export function psString(str) {
  if (str == null || str === '') return '';
  if (str.startsWith("'") || str.startsWith('"')) return str;
  return str.includes('$') ? `"${str}"` : `'${str}'`;
}

/**
 * Generate the raw PowerShell command line(s) for a single lifecycle action.
 *
 * Returns an array of strings (NO leading spaces). The caller is responsible
 * for indentation and wrapping (SPA:Action tags or preview formatting).
 *
 * @param {Object} action   - The action object from the wizard state
 * @param {Object} pathCtx  - Path helpers:
 *   .resolveFilePath(f)   — returns the final filepath string (may add subfolder prefix)
 *   .filePathParam(r)     — returns ' -FilePath ...' fragment with correct quoting
 *
 * For the generator, pathCtx = { resolveFilePath, filePathParam } (the closures above).
 * For the UI preview, pass a simple passthrough that returns the file as-is.
 */
export function generateActionCmd(action, pathCtx = {}) {
  const { resolveFilePath = f => f, filePathParam: fpParam = r => (r ? ` -FilePath ${psString(r)}` : '') } = pathCtx;
  const lines = [];

  switch (action.type) {
    case 'start_msi_process': {
      const msiAction = action.action || 'Install';
      const resolvedFile = resolveFilePath(action.file);
      const filePart = fpParam(resolvedFile);
      const pcPart = action.productCode ? ` -ProductCode ${psString(action.productCode)}` : '';
      const args = action.args ? ` -ArgumentList ${psString(action.args)}` : '';
      const transform = action.transform ? ` -Transforms ${psString(action.transform)}` : '';
      const addlArgs = action.additionalArgs ? ` -AdditionalArgumentList ${psString(action.additionalArgs)}` : '';
      const patches = action.patches ? ` -Patches ${psString(action.patches)}` : '';
      const logName = action.logName ? ` -LogName ${psString(action.logName)}` : '';
      const successCodes = action.successExitCodes ? ` -SuccessExitCodes ${action.successExitCodes}` : '';
      const rebootCodes = action.rebootExitCodes ? ` -RebootExitCodes ${action.rebootExitCodes}` : '';
      const pt = action.passThru ? ' -PassThru' : '';
      let cmd = `Start-ADTMsiProcess -Action ${psString(msiAction)}${filePart}${pcPart}${args}${transform}${addlArgs}${patches}${logName}${successCodes}${rebootCodes}${pt}`;
      if (action.passThru && action.passThruVar) {
        cmd = `$${action.passThruVar.replace(/^\$/, '')} = ${cmd}`;
      }
      lines.push(cmd);
      break;
    }

    // Batch MSI uninstall/install: array of GUIDs piped through ForEach-Object
    // V3: "{GUID1}", "{GUID2}" | ForEach-Object { Execute-MSI -Action 'Uninstall' -Path "$_" }
    // V4: @('{GUID1}', '{GUID2}') | ForEach-Object { Start-ADTMsiProcess -Action 'Uninstall' -ProductCode $_ }
    case 'msi_uninstall_batch':
    case 'msi_install_batch': {
      const batchAction = action.type === 'msi_uninstall_batch' ? 'Uninstall' : 'Install';
      const guids = Array.isArray(action.guids) && action.guids.length > 0 ? action.guids : [];
      if (guids.length > 0) {
        const guidList = guids.map(g => `'${g}'`).join(', ');
        lines.push(`@(${guidList}) | ForEach-Object { Start-ADTMsiProcess -Action ${psString(batchAction)} -ProductCode $_ }`);
      } else {
        // No GUIDs captured — emit a clearly labelled comment so the packager can fill them in
        lines.push(`# TODO: Batch MSI ${batchAction} — GUIDs not captured from v3 script. Replace the placeholders below:`);
        lines.push(`# @('{GUID1}', '{GUID2}') | ForEach-Object { Start-ADTMsiProcess -Action ${psString(batchAction)} -ProductCode $_ }`);
      }
      break;
    }

    case 'start_process': {
      const args = action.args ? ` -ArgumentList ${psString(action.args)}` : '';
      const winStyle = action.windowStyle && action.windowStyle !== 'Normal' ? ` -WindowStyle ${psString(action.windowStyle)}` : '';
      const successCodes = action.successExitCodes ? ` -SuccessExitCodes ${action.successExitCodes}` : '';
      const rebootCodes = action.rebootExitCodes ? ` -RebootExitCodes ${action.rebootExitCodes}` : '';
      const pt = action.passThru ? ' -PassThru' : '';
      let resolvedFile = resolveFilePath(action.file);
      // If the original path had a $dirFiles\ prefix, re-apply the v4 equivalent.
      // Use double-quotes so PowerShell expands the subexpression at runtime.
      if (action.dirFilesRelative && resolvedFile && !resolvedFile.startsWith('"')) {
        resolvedFile = `"$($adtSession.DirFiles)\\${resolvedFile}"`;
      }
      const fp = fpParam(resolvedFile);
      let cmd = `Start-ADTProcess${fp}${args}${winStyle}${successCodes}${rebootCodes}${pt}`;
      if (action.passThru && action.passThruVar) {
        cmd = `$${action.passThruVar.replace(/^\$/, '')} = ${cmd}`;
      }
      lines.push(cmd);
      break;
    }

    case 'uninstall_application': {
      const appNameVal = action.appName || action.name || '';
      const namePart = appNameVal ? ` -Name ${psString(appNameVal)}` : '';
      const nameMatchPart = (appNameVal && action.nameMatch && action.nameMatch !== 'Exact') ? ` -NameMatch ${psString(action.nameMatch)}` : '';
      const pcPart = action.productCode ? ` -ProductCode ${psString(action.productCode)}` : '';
      const typePart = (action.applicationType && action.applicationType !== 'All') ? ` -ApplicationType ${psString(action.applicationType)}` : '';
      const filterScriptPart = action.filterScript ? ` -FilterScript ${action.filterScript}` : '';
      const argsPart = action.args ? ` -ArgumentList ${psString(action.args)}` : '';
      const addlArgsPart = action.additionalArgs ? ` -AdditionalArgumentList ${psString(action.additionalArgs)}` : '';
      const succCodes = action.successExitCodes ? ` -SuccessExitCodes ${action.successExitCodes}` : '';
      const rebtCodes = action.rebootExitCodes ? ` -RebootExitCodes ${action.rebootExitCodes}` : '';
      const pt = action.passThru ? ' -PassThru' : '';
      let cmd = `Uninstall-ADTApplication${namePart}${nameMatchPart}${pcPart}${typePart}${filterScriptPart}${argsPart}${addlArgsPart}${succCodes}${rebtCodes}${pt}`;
      if (action.passThru && action.passThruVar) {
        cmd = `$${action.passThruVar.replace(/^\$/, '')} = ${cmd}`;
      }
      lines.push(cmd);
      break;
    }

    case 'file_copy': {
      const recurse = action.recurse !== false ? ' -Recurse' : '';
      const flatten = action.flatten ? ' -Flatten' : '';
      const mode = action.fileCopyMode ? ` -FileCopyMode ${psString(action.fileCopyMode)}` : '';
      const contErr = action.continueOnError ? ' -ContinueFileCopyOnError' : '';
      const rbcParams = action.robocopyParams ? ` -RobocopyParams ${psString(action.robocopyParams)}` : '';
      const rbcAdd = action.robocopyAdditionalParams ? ` -RobocopyAdditionalParams ${psString(action.robocopyAdditionalParams)}` : '';
      const srcPath = action.path || action.source || '';
      const destPath = action.destination || action.dest || '';
      lines.push(`Copy-ADTFile -Path ${psString(srcPath)} -Destination ${psString(destPath)}${recurse}${flatten}${mode}${contErr}${rbcParams}${rbcAdd}`);
      break;
    }

    case 'file_remove': {
      const rmRecurse = action.recurse ? ' -Recurse' : '';
      if (action.literalPath) {
        lines.push(`Remove-ADTFile -LiteralPath ${psString(action.literalPath)}${rmRecurse}`);
      } else {
        lines.push(`Remove-ADTFile -Path ${psString(action.path || '')}${rmRecurse}`);
      }
      break;
    }

    case 'folder_remove': {
      const disableRec = action.disableRecursion ? ' -DisableRecursion' : '';
      lines.push(`Remove-ADTFolder -Path ${psString(action.path)}${disableRec}`);
      break;
    }

    case 'pending_reboot': {
      const cleanVar = (action.varName || 'isRebootPending').replace(/^\$/, '');
      lines.push(`$${cleanVar} = (Get-ADTPendingReboot).IsSystemRebootPending`);
      break;
    }

    case 'create_folder': {
      lines.push(`New-ADTFolder -Path ${psString(action.path)}`);
      break;
    }

    case 'registry_set': {
      const regType = action.regType ? ` -Type ${psString(action.regType)}` : " -Type 'String'";
      const sid = action.sid ? ` -SID ${psString(action.sid)}` : '';
      lines.push(`Set-ADTRegistryKey -Key ${psString(action.key)} -Name ${psString(action.name)}${regType} -Value ${psString(action.value)}${sid}`);
      break;
    }

    case 'registry_remove': {
      const name = action.name ? ` -Name ${psString(action.name)}` : '';
      lines.push(`Remove-ADTRegistryKey -Key ${psString(action.key)}${name}`);
      break;
    }

    case 'show_completion': {
      lines.push(`Show-ADTInstallationPrompt -Message 'The install has completed.' -ButtonRightText 'OK' -Icon Information -NoWait -Timeout 5`);
      break;
    }

    case 'show_welcome': {
      // Build the $saiwParams splatting hashtable dynamically
      const swParams = [];
      if (action.allowDefer) {
        swParams.push('    AllowDefer = $true');
        if (action.deferTimes && action.deferTimes > 0) swParams.push(`    DeferTimes = ${action.deferTimes}`);
        if (action.deferDays && action.deferDays > 0) swParams.push(`    DeferDays = ${action.deferDays}`);
        if (action.deferDeadline) swParams.push(`    DeferDeadline = '${action.deferDeadline}'`);
      }
      if (action.checkDiskSpace) swParams.push('    CheckDiskSpace = $true');
      if (action.persistPrompt) swParams.push('    PersistPrompt = $true');
      if (action.closeProcessesCountdown && action.closeProcessesCountdown > 0) {
        swParams.push(`    CloseProcessesCountdown = ${action.closeProcessesCountdown}`);
      }
      if (action.forceCloseProcessesCountdown && action.forceCloseProcessesCountdown > 0) {
        swParams.push(`    ForceCloseProcessesCountdown = ${action.forceCloseProcessesCountdown}`);
      }
      if (action.blockExecution) swParams.push('    BlockExecution = $true');

      const commentParts = [];
      if (action.allowDefer) commentParts.push(`allow up to ${action.deferTimes || 3} deferrals`);
      if (action.checkDiskSpace) commentParts.push('verify disk space');
      if (action.persistPrompt) commentParts.push('persist the prompt');
      const commentSuffix = commentParts.length > 0 ? `, ${commentParts.join(', ')}` : '';

      lines.push(`## Show Welcome Message, close processes if specified${commentSuffix}.`);
      lines.push('$saiwParams = @{');
      swParams.forEach(p => lines.push(p));
      lines.push('}');
      lines.push('if ($adtSession.AppProcessesToClose.Count -gt 0)');
      lines.push('{');
      lines.push("    $saiwParams.Add('CloseProcesses', $adtSession.AppProcessesToClose)");
      lines.push('}');
      lines.push('Show-ADTInstallationWelcome @saiwParams');
      break;
    }

    case 'show_progress': {
      const msg = action.statusMessage ? ` -StatusMessage ${psString(action.statusMessage)}` : '';
      const winLoc = action.windowLocation ? ` -WindowLocation ${psString(action.windowLocation)}` : '';
      const notTop = (action.topMost === false) ? ' -NotTopMost' : '';
      lines.push(`## Show Progress Message${action.statusMessage ? '' : ' (with the default message)'}.`);
      lines.push(`Show-ADTInstallationProgress${msg}${winLoc}${notTop}`);
      break;
    }

    case 'sleep': {
      lines.push(`Start-Sleep -Seconds ${action.seconds || 5}`);
      break;
    }

    case 'custom_variable': {
      const cleanName = (action.name || '').replace(/^\$/, '');
      if (cleanName) {
        lines.push(`$${cleanName} = "${action.value || ''}"`);
      }
      break;
    }

    case 'custom_script': {
      if (action.note) lines.push(`# Custom script: ${action.note}`);
      if (action.code) {
        action.code.split('\n').forEach(line => lines.push(line.trimRight()));
      }
      break;
    }

    case 'raw_ps': {
      if (action.note) lines.push(`# Raw PowerShell: ${action.note}`);
      if (action.script) {
        // Normalize tabs → 4 spaces, strip minimum indent from block body
        const scriptLines = action.script.split('\n').map(l => l.replace(/\t/g, '    ').trimRight());
        const STRUCTURAL = /^\s*(\}|catch\s*\{?|finally\s*\{?)$/i;
        const bodyLines = scriptLines.slice(1).filter(l => l.trim() && !STRUCTURAL.test(l));
        const indentLengths = bodyLines.map(l => (l.match(/^( *)/)?.[1] || '').length);
        const minIndent = indentLengths.length > 0 ? Math.min(...indentLengths) : 0;
        scriptLines.forEach(line => {
          if (!line.trim()) {
            lines.push('');
          } else {
            const lineIndent = (line.match(/^( *)/)?.[1] || '').length;
            const stripAmt = Math.min(minIndent, lineIndent);
            lines.push(line.substring(stripAmt));
          }
        });
      }
      break;
    }

    case 'execute_process_as_user': {
      const args = action.args ? ` -ArgumentList ${psString(action.args)}` : '';
      const successCodes = action.successExitCodes ? ` -SuccessExitCodes ${action.successExitCodes}` : '';
      const rebootCodes = action.rebootExitCodes ? ` -RebootExitCodes ${action.rebootExitCodes}` : '';
      const pt = action.passThru ? ' -PassThru' : '';
      let cmd = `Start-ADTProcessAsUser -FilePath ${psString(action.file)}${args}${successCodes}${rebootCodes}${pt}`;
      if (action.passThru && action.passThruVar) {
        cmd = `$${action.passThruVar.replace(/^\$/, '')} = ${cmd}`;
      }
      lines.push(cmd);
      break;
    }

    case 'msi_process_as_user': {
      const msiAction = action.action || 'Install';
      const filePart = action.file ? ` -FilePath ${psString(action.file)}` : '';
      const pcPart = action.productCode ? ` -ProductCode ${psString(action.productCode)}` : '';
      const args = action.args ? ` -ArgumentList ${psString(action.args)}` : '';
      const addlArgs = action.additionalArgs ? ` -AdditionalArgumentList ${psString(action.additionalArgs)}` : '';
      const transform = action.transform ? ` -Transforms ${psString(action.transform)}` : '';
      const patches = action.patches ? ` -Patches ${psString(action.patches)}` : '';
      const successCodes = action.successExitCodes ? ` -SuccessExitCodes ${action.successExitCodes}` : '';
      const rebootCodes = action.rebootExitCodes ? ` -RebootExitCodes ${action.rebootExitCodes}` : '';
      const pt = action.passThru ? ' -PassThru' : '';
      let cmd = `Start-ADTMsiProcessAsUser -Action ${psString(msiAction)}${filePart}${pcPart}${args}${addlArgs}${transform}${patches}${successCodes}${rebootCodes}${pt}`;
      if (action.passThru && action.passThruVar) {
        cmd = `$${action.passThruVar.replace(/^\$/, '')} = ${cmd}`;
      }
      lines.push(cmd);
      break;
    }

    case 'copy_file_to_user_profiles': {
      lines.push(`Copy-ADTFileToUserProfiles -Path "$($adtSession.DirFiles)\\${action.source}" -Destination ${psString(action.destination)}`);
      break;
    }

    case 'new_shortcut': {
      const args = action.arguments ? ` -Arguments ${psString(action.arguments)}` : '';
      const icon = action.iconLocation ? ` -IconLocation ${psString(action.iconLocation)}` : '';
      const desc = action.description ? ` -Description ${psString(action.description)}` : '';
      const workDir = action.workingDirectory ? ` -WorkingDirectory ${psString(action.workingDirectory)}` : '';
      const ws = action.windowStyle ? ` -WindowStyle ${psString(action.windowStyle)}` : '';
      const admin = action.runAsAdmin ? ' -RunAsAdmin' : '';
      const hotkey = action.hotkey ? ` -Hotkey ${psString(action.hotkey)}` : '';
      lines.push(`New-ADTShortcut -Path ${psString(action.shortcutPath)} -TargetPath ${psString(action.targetPath)}${args}${icon}${desc}${workDir}${ws}${admin}${hotkey}`);
      break;
    }

    case 'restart_prompt': {
      const countdown = action.countdownSeconds ? ` -CountdownSeconds ${action.countdownSeconds}` : ' -CountdownSeconds 600';
      const noHide = action.countdownNoHideSeconds ? ` -CountdownNoHideSeconds ${action.countdownNoHideSeconds}` : '';
      const silent = action.silentRestart ? ' -SilentRestart' : '';
      lines.push(`Show-ADTInstallationRestartPrompt${countdown}${noHide}${silent}`);
      break;
    }

    case 'stop_process': {
      const names = (action.processName || '').split(',').map(n => n.trim()).filter(Boolean);
      const force = action.force !== false ? ' -Force' : '';
      names.forEach(name => {
        lines.push(`Stop-Process -Name ${psString(name)}${force} -ErrorAction SilentlyContinue`);
      });
      break;
    }

    case 'remove_file_from_profiles': {
      lines.push(`Remove-ADTFileFromUserProfiles -Path ${psString(action.path)}`);
      break;
    }

    case 'stop_service': {
      const pt = action.passThru ? ' -PassThru' : '';
      let svcCmd = `Stop-ADTServiceAndDependencies -Name ${psString(action.name || '')}${pt}`;
      if (action.passThru && action.passThruVar) {
        svcCmd = `$${action.passThruVar.replace(/^\$/, '')} = ${svcCmd}`;
      }
      lines.push(svcCmd);
      break;
    }

    case 'start_service': {
      const pt = action.passThru ? ' -PassThru' : '';
      let svcCmd = `Start-ADTServiceAndDependencies -Name ${psString(action.name || '')}${pt}`;
      if (action.passThru && action.passThruVar) {
        svcCmd = `$${action.passThruVar.replace(/^\$/, '')} = ${svcCmd}`;
      }
      lines.push(svcCmd);
      break;
    }

    case 'start_msp_process': {
      const mspArgs = action.args ? ` -ArgumentList ${psString(action.args)}` : '';
      const mspPt = action.passThru ? ' -PassThru' : '';
      let mspCmd = `Start-ADTMspProcess -FilePath ${psString(action.file || '')}${mspArgs}${mspPt}`;
      if (action.passThru && action.passThruVar) {
        mspCmd = `$${action.passThruVar.replace(/^\$/, '')} = ${mspCmd}`;
      }
      lines.push(mspCmd);
      break;
    }

    case 'write_log': {
      const severity = action.severity || '1';
      lines.push(`Write-ADTLogEntry -Message ${psString((action.message || '').replace(/'/g, "''"))} -Severity ${severity}`);
      break;
    }

    case 'set_ini': {
      lines.push(`Set-ADTIniValue -FilePath ${psString(action.filePath || '')} -Section ${psString(action.section || '')} -Key ${psString(action.key || '')} -Value ${psString(action.value || '')}`);
      break;
    }

    case 'all_users_registry': {
      const scriptBlock = (action.scriptBlock || '').trim();
      if (scriptBlock) {
        const indented = scriptBlock.split('\n').map(l => `    ${l}`).join('\n');
        lines.push(`Invoke-ADTAllUsersRegistryAction -ScriptBlock {\n${indented}\n}`);
      } else {
        lines.push(`Invoke-ADTAllUsersRegistryAction -ScriptBlock { }`);
      }
      break;
    }

    case 'get_registry_key': {
      const regName = action.name ? ` -Name ${psString(action.name)}` : '';
      lines.push(`Get-ADTRegistryKey -Key ${psString(action.key || '')}${regName}`);
      break;
    }

    case 'remove_firewall_rule': {
      const byDisplayName = action.displayName ? ` -DisplayName ${psString(action.displayName)}` : '';
      const byName = action.name ? ` -Name ${psString(action.name)}` : '';
      if (byDisplayName || byName) {
        lines.push(`Remove-NetFirewallRule${byDisplayName}${byName}`);
      }
      break;
    }

    default:
      break;
  }

  return lines;
}
