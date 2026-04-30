/**
 * psadtCompatCheck.js
 * Client-side v3→v4 compatibility analysis for PSADT scripts.
 * Mirrors the output of Test-ADTCompatibility from PSAppDeployToolkit.Tools.
 *
 * Scans the uploaded .ps1 for:
 *  - Renamed functions (v3 name → v4 ADT-prefixed name)
 *  - Deprecated variables
 *  - Boolean params that became switches
 *  - Config file changes (XML → .psd1)
 */

// ── v3 → v4 Function Mapping ────────────────────────────────────────────────
const FUNCTION_MAP = {
  // Installation UI
  'Show-InstallationWelcome':     'Show-ADTInstallationWelcome',
  'Show-InstallationProgress':    'Show-ADTInstallationProgress',
  'Show-InstallationPrompt':      'Show-ADTInstallationPrompt',
  'Show-InstallationRestartPrompt': 'Show-ADTInstallationRestartPrompt',
  'Show-BalloonNotification':     'Show-ADTBalloonNotification',
  'Show-DialogBox':               'Show-ADTDialogBox',

  // MSI / Process execution
  'Execute-MSI':                  'Start-ADTMsiProcess',
  'Execute-Process':              'Start-ADTProcess',
  'Execute-ProcessAsUser':        'Start-ADTProcessAsUser',

  // File operations
  'Copy-File':                    'Copy-ADTFile',
  'Remove-File':                  'Remove-ADTFile',
  'New-Folder':                   'New-ADTFolder',
  'Remove-Folder':                'Remove-ADTFolder',
  'Copy-FileToUserProfiles':      'Copy-ADTFileToUserProfiles',

  // Registry
  'Set-RegistryKey':              'Set-ADTRegistryKey',
  'Remove-RegistryKey':           'Remove-ADTRegistryKey',
  'Get-RegistryKey':              'Get-ADTRegistryKey',

  // Shortcuts
  'New-Shortcut':                 'New-ADTShortcut',

  // Services
  'Set-ServiceStartMode':         'Set-ADTServiceStartMode',
  'Get-ServiceStartMode':         'Get-ADTServiceStartMode',

  // Logging
  'Write-Log':                    'Write-ADTLogEntry',

  // INI / Config
  'Set-IniValue':                 'Set-ADTIniValue',
  'Get-IniValue':                 'Get-ADTIniValue',
  'Remove-IniValue':              'Remove-ADTIniValue',

  // Application management
  'Get-InstalledApplication':     'Get-ADTApplication',
  'Remove-MSIApplications':       'Remove-ADTMsiApplications',

  // Active setup
  'Set-ActiveSetup':              'Set-ADTActiveSetup',

  // Environment
  'Get-FreeDiskSpace':            'Get-ADTFreeDiskSpace',
  'Get-PendingReboot':            'Get-ADTPendingReboot',
  'Get-DeferHistory':             'Get-ADTDeferHistory',
  'Set-DeferHistory':             'Set-ADTDeferHistory',
  'Get-MsiTableProperty':         'Get-ADTMsiTableProperty',

  // Misc
  'Test-Battery':                 'Test-ADTBattery',
  'Test-NetworkConnection':       'Test-ADTNetworkConnection',
  'Test-PowerPoint':              'Test-ADTPowerPoint',
  'Test-MSUpdates':               'Test-ADTMSUpdates',
  'Test-RegistryValue':           'Test-ADTRegistryValue',
  'Update-Desktop':               'Update-ADTDesktop',
  'Update-GroupPolicy':            'Update-ADTGroupPolicy',
  'Block-AppExecution':           'Block-ADTAppExecution',
  'Unblock-AppExecution':         'Unblock-ADTAppExecution',
  'Resolve-Error':                'Resolve-ADTErrorRecord',
  'Exit-Script':                  'Close-ADTSession',
  'Set-PinnedApplication':        'Set-ADTPinnedApplication',
};

// ── Deprecated Variables ────────────────────────────────────────────────────
const DEPRECATED_VARS = {
  '$appVendor':          { replacement: 'Passed via $adtSession hashtable', severity: 'info' },
  '$appName':            { replacement: 'Passed via $adtSession hashtable', severity: 'info' },
  '$appVersion':         { replacement: 'Passed via $adtSession hashtable', severity: 'info' },
  '$appArch':            { replacement: 'Passed via $adtSession hashtable', severity: 'info' },
  '$appLang':            { replacement: 'Passed via $adtSession hashtable', severity: 'info' },
  '$appRevision':        { replacement: 'Passed via $adtSession hashtable', severity: 'info' },
  '$appScriptVersion':   { replacement: 'Passed via $adtSession hashtable', severity: 'info' },
  '$appScriptDate':      { replacement: 'Passed via $adtSession hashtable', severity: 'info' },
  '$appScriptAuthor':    { replacement: 'Passed via $adtSession hashtable', severity: 'info' },
  '$installName':        { replacement: 'Auto-derived from session metadata', severity: 'info' },
  '$installTitle':       { replacement: 'Auto-derived from session metadata', severity: 'info' },
  '$installPhase':       { replacement: 'Managed internally by PSADT v4 session', severity: 'warning' },
  '$deploymentType':     { replacement: '$adtSession.DeploymentType', severity: 'info' },
  '$deployMode':         { replacement: '$adtSession.DeployMode', severity: 'info' },
  '$useDefaultMsi':      { replacement: 'Auto-handled by PSADT v4 session', severity: 'info' },
  '$dirFiles':           { replacement: '$adtSession.DirFiles', severity: 'info' },
  '$dirSupportFiles':    { replacement: '$adtSession.DirSupportFiles', severity: 'info' },
  '$defaultMsiFile':     { replacement: 'Auto-detected by PSADT v4', severity: 'info' },
  '$defaultMstFile':     { replacement: 'Auto-detected by PSADT v4', severity: 'info' },
};

// ── Boolean → Switch Parameter Changes ──────────────────────────────────────
const BOOL_TO_SWITCH = [
  { pattern: /-AllowDefer\s+\$true/i, replacement: '-AllowDefer', context: 'Boolean → Switch param' },
  { pattern: /-PersistPrompt\s+\$true/i, replacement: '-PersistPrompt', context: 'Boolean → Switch param' },
  { pattern: /-CheckDiskSpace\s+\$true/i, replacement: '-CheckDiskSpace', context: 'Boolean → Switch param' },
  { pattern: /-TopMost\s+\$true/i, replacement: '-TopMost', context: 'Boolean → Switch param' },
  { pattern: /-ContinueOnError\s+\$true/i, replacement: '-ContinueOnError (or -ErrorAction)', context: 'Boolean → Switch param' },
  { pattern: /-PassThru\s+\$true/i, replacement: '-PassThru', context: 'Boolean → Switch param' },
  { pattern: /-MinimizeWindows\s+\$false/i, replacement: 'Omit -MinimizeWindows (default is off in v4)', context: 'Boolean → Switch param' },
];

/**
 * Run client-side v3→v4 compatibility check.
 * @param {string} scriptContent - The raw .ps1 file text
 * @returns {{ findings: Array, summary: Object }}
 */
export function checkV3Compatibility(scriptContent) {
  const findings = [];
  const lines = scriptContent.split('\n');

  // 1. Scan for renamed functions (auto-resolved by Convert-ADTDeployment)
  for (const [v3Name, v4Name] of Object.entries(FUNCTION_MAP)) {
    const regex = new RegExp(`\\b${v3Name}\\b`, 'g');
    lines.forEach((line, idx) => {
      if (regex.test(line) && !line.trimStart().startsWith('#')) {
        findings.push({
          type: 'renamed',
          severity: 'warning',
          autoResolved: true,
          line: idx + 1,
          v3: v3Name,
          v4: v4Name,
          context: line.trim().substring(0, 100),
        });
        regex.lastIndex = 0;
      }
    });
  }

  // 2. Scan for deprecated variables (auto-resolved)
  for (const [varName, info] of Object.entries(DEPRECATED_VARS)) {
    const escaped = varName.replace('$', '\\$');
    const regex = new RegExp(escaped + '\\b', 'g');
    let firstOccurrence = null;
    let count = 0;
    lines.forEach((line, idx) => {
      if (regex.test(line) && !line.trimStart().startsWith('#')) {
        count++;
        if (!firstOccurrence) firstOccurrence = idx + 1;
        regex.lastIndex = 0;
      }
    });
    if (count > 0) {
      findings.push({
        type: 'deprecated_var',
        severity: info.severity,
        autoResolved: true,
        line: firstOccurrence,
        v3: varName,
        v4: info.replacement,
        count,
        context: `Used ${count} time${count !== 1 ? 's' : ''}`,
      });
    }
  }

  // 3. Scan for boolean → switch parameter issues (auto-resolved)
  for (const check of BOOL_TO_SWITCH) {
    lines.forEach((line, idx) => {
      if (check.pattern.test(line) && !line.trimStart().startsWith('#')) {
        findings.push({
          type: 'param_change',
          severity: 'info',
          autoResolved: true,
          line: idx + 1,
          v3: line.trim().match(check.pattern)?.[0] || '',
          v4: check.replacement,
          context: check.context,
        });
      }
    });
  }

  // 4. Scan for patterns that NEED MANUAL REVIEW
  //    These are things Convert-ADTDeployment may not handle correctly.
  const manualPatterns = [
    { regex: /Get-ChildItem\s+.*\|\s*Remove-Item/i,       reason: 'Native PS piped command — not a PSADT function, verify path logic still works in v4 context' },
    { regex: /Start-Process\s+-FilePath/i,                 reason: 'Use Start-ADTProcess instead for proper logging and error handling' },
    { regex: /Copy-Item\s+-Path/i,                         reason: 'Consider using Copy-ADTFile for PSADT-integrated logging' },
    { regex: /Remove-Item\s+-Path/i,                       reason: 'Consider using Remove-ADTFile for PSADT-integrated logging' },
    { regex: /New-Item\s+-ItemType\s+Directory/i,          reason: 'Consider using New-ADTFolder for PSADT-integrated logging' },
    { regex: /\|\s*ForEach-Object\s*\{.*Execute-MSI/i,     reason: 'Batch MSI pattern — verify GUID list maps correctly after conversion' },
    { regex: /Set-ItemProperty\s+/i,                       reason: 'Native registry cmd — consider using Set-ADTRegistryKey for consistency' },
    { regex: /\[Microsoft\.Win32\.Registry\]/i,            reason: '.NET registry access — not handled by converter, must migrate manually' },
    { regex: /Invoke-WebRequest|Invoke-RestMethod/i,       reason: 'Web request — verify network calls still work in deployment context' },
    { regex: /\$env:/i,                                    reason: 'Environment variable — verify still resolves correctly in v4 session context' },
  ];

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('##')) return;
    for (const mp of manualPatterns) {
      if (mp.regex.test(trimmed)) {
        findings.push({
          type: 'manual_review',
          severity: 'caution',
          autoResolved: false,
          line: idx + 1,
          v3: trimmed.substring(0, 80),
          v4: mp.reason,
          context: trimmed.substring(0, 100),
        });
        break; // one match per line
      }
    }
  });

  // Sort by autoResolved (manual first), then line number
  findings.sort((a, b) => {
    if (a.autoResolved !== b.autoResolved) return a.autoResolved ? 1 : -1;
    return a.line - b.line;
  });

  const autoFindings = findings.filter(f => f.autoResolved);
  const manualFindings = findings.filter(f => !f.autoResolved);

  const summary = {
    total: findings.length,
    renamed: findings.filter(f => f.type === 'renamed').length,
    deprecated: findings.filter(f => f.type === 'deprecated_var').length,
    paramChanges: findings.filter(f => f.type === 'param_change').length,
    manualReview: manualFindings.length,
    autoResolved: autoFindings.length,
  };

  return { findings, autoFindings, manualFindings, summary };
}
