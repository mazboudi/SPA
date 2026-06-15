/**
 * compareIntuneState.js
 *
 * Compares the current builder state (from GitLab project files) against live
 * Intune app data fetched via Graph API.  Returns an array of diff objects.
 *
 * Each diff: { field, label, category, builder, intune, match }
 */

/**
 * @param {Object} builderState — current wizard state
 * @param {Object} intuneData — response from GET /api/intune/apps/:id
 * @returns {{ diffs: Array, matchCount: number, diffCount: number }}
 */
export function compareIntuneState(builderState, intuneData) {
  const app = intuneData.app || {};
  const diffs = [];

  const s = builderState;

  // Helper to add a diff entry
  const cmp = (field, label, category, builderVal, intuneVal) => {
    const bStr = normalize(builderVal);
    const iStr = normalize(intuneVal);
    diffs.push({
      field,
      label,
      category,
      builder: builderVal,
      intune: intuneVal,
      builderDisplay: bStr,
      intuneDisplay: iStr,
      match: bStr === iStr,
    });
  };

  // ── Metadata ──────────────────────────────────────────────────────────
  const builderDisplayName = s.intuneAppName || `${s.displayName || ''} ${s.version || ''}`.trim().replace(/\s+/g, ' ');
  cmp('displayName', 'Display Name', 'Metadata', builderDisplayName, app.displayName);
  cmp('description', 'Description', 'Metadata', s.appDescription, app.description);
  cmp('publisher', 'Publisher', 'Metadata', s.publisher, app.publisher);
  cmp('displayVersion', 'Version', 'Metadata', s.version, app.displayVersion);
  cmp('owner', 'Owner', 'Metadata', s.appOwner || 'EUC Packaging', app.owner);
  cmp('developer', 'Developer', 'Metadata', s.appDeveloper, app.developer);
  cmp('informationUrl', 'Information URL', 'Metadata', s.informationUrl, app.informationUrl);
  cmp('privacyUrl', 'Privacy URL', 'Metadata', s.privacyUrl, app.privacyInformationUrl);
  cmp('notes', 'Notes', 'Metadata', s.appNotes, app.notes);
  cmp('isFeatured', 'Featured', 'Metadata', !!s.isFeatured, !!app.isFeatured);
  cmp('allowAvailableUninstall', 'Allow Uninstall', 'Metadata', !!s.allowAvailableUninstall, !!app.allowAvailableUninstall);

  // ── Commands ──────────────────────────────────────────────────────────
  const installCmd = buildInstallCommand(s);
  const uninstallCmd = buildUninstallCommand(s);
  cmp('installCommandLine', 'Install Command', 'Commands', installCmd, app.installCommandLine);
  cmp('uninstallCommandLine', 'Uninstall Command', 'Commands', uninstallCmd, app.uninstallCommandLine);

  // ── Install Experience ────────────────────────────────────────────────
  const ie = app.installExperience || {};
  cmp('restartBehavior', 'Restart Behavior', 'Install Experience', s.restartBehavior, ie.deviceRestartBehavior);
  cmp('maxInstallTime', 'Max Install Time (min)', 'Install Experience', s.maxInstallTime || 60, ie.maxRunTimeInMinutes);

  // ── Requirements ──────────────────────────────────────────────────────
  cmp('minWinRelease', 'Min Windows Release', 'Requirements', s.minWinRelease, app.minimumSupportedWindowsRelease);

  const builderArch = getApplicableArchitectures(s);
  cmp('applicableArchitectures', 'Architectures', 'Requirements', builderArch, app.applicableArchitectures);

  cmp('minDiskSpaceMB', 'Min Disk Space (MB)', 'Requirements', s.minDiskSpaceMB, app.minimumFreeDiskSpaceInMB);
  cmp('minMemoryMB', 'Min Memory (MB)', 'Requirements', s.minMemoryMB, app.minimumMemoryInMB);
  cmp('minCpuSpeedMHz', 'Min CPU Speed (MHz)', 'Requirements', s.minCpuSpeedMHz, app.minimumCpuSpeedInMHz);
  cmp('minProcessors', 'Min Processors', 'Requirements', s.minLogicalProcessors, app.minimumNumberOfProcessors);

  // ── Detection Rules ───────────────────────────────────────────────────
  const builderRulesStr = summarizeDetectionRules(s.detectionRules || []);
  const intuneRulesStr = summarizeDetectionRules((app.detectionRules || []).map(mapGraphDetectionRule));
  cmp('detectionRules', 'Detection Rules', 'Detection', builderRulesStr, intuneRulesStr);

  // ── Return Codes ──────────────────────────────────────────────────────
  const builderCodes = (s.returnCodes || []).map(rc => `${rc.code}:${rc.type}`).sort().join(', ');
  const intuneCodes = (app.returnCodes || []).map(rc => `${rc.returnCode}:${rc.type}`).sort().join(', ');
  cmp('returnCodes', 'Return Codes', 'Detection', builderCodes, intuneCodes);

  // ── Assignments ───────────────────────────────────────────────────────
  const builderAssign = summarizeAssignments(s.assignments || []);
  const intuneAssign = summarizeAssignments((intuneData.assignments || []).map(a => ({
    intent: a.intent,
    groupId: a.target?.groupId || '',
  })));
  cmp('assignments', 'Assignments', 'Assignments', builderAssign, intuneAssign);

  // ── Supersedence ──────────────────────────────────────────────────────
  const builderSup = s.supersedesAppId ? `${s.supersedesAppId} (${s.supersedenceType || 'update'})` : '(none)';
  const intuneSup = (intuneData.supersedence || []).length > 0
    ? intuneData.supersedence.map(r => `${r.supersededAppId} (${r.supersedenceType})`).join(', ')
    : '(none)';
  cmp('supersedence', 'Supersedence', 'Relationships', builderSup, intuneSup);

  // ── Dependencies ──────────────────────────────────────────────────────
  const builderDeps = (s.dependencies || []).length > 0
    ? s.dependencies.map(d => `${d.appId} (${d.dependencyType})`).sort().join(', ')
    : '(none)';
  const intuneDeps = (intuneData.dependencies || []).length > 0
    ? intuneData.dependencies.map(d => `${d.appId} (${d.dependencyType})`).sort().join(', ')
    : '(none)';
  cmp('dependencies', 'Dependencies', 'Relationships', builderDeps, intuneDeps);

  const matchCount = diffs.filter(d => d.match).length;
  const diffCount = diffs.filter(d => !d.match).length;

  return { diffs, matchCount, diffCount };
}


// ── Helpers ─────────────────────────────────────────────────────────────────

function normalize(val) {
  if (val === null || val === undefined) return '';
  if (typeof val === 'boolean') return val ? 'true' : 'false';
  return String(val).trim();
}

function buildInstallCommand(s) {
  let cmd = 'Invoke-AppDeployToolkit.exe -DeploymentType Install';
  const mode = s.deployMode || 'Silent';
  cmd += ` -DeployMode ${mode}`;
  if (s.allowRebootPassThru) cmd += ' -AllowRebootPassThru';
  return cmd;
}

function buildUninstallCommand(s) {
  return 'Invoke-AppDeployToolkit.exe -DeploymentType Uninstall -DeployMode Silent';
}

function getApplicableArchitectures(s) {
  if (!s.archCheckEnabled) return 'x86,x64,arm64';
  const archs = [];
  if (s.archX86) archs.push('x86');
  if (s.archX64) archs.push('x64');
  if (s.archArm64) archs.push('arm64');
  return archs.join(',') || 'x64';
}

function summarizeDetectionRules(rules) {
  if (!rules || rules.length === 0) return '(none)';
  return rules.map(r => {
    if (r.ruleType === 'msi') return `MSI:${r.productCode || '?'}`;
    if (r.ruleType === 'registry') return `REG:${r.keyPath || '?'}\\${r.valueName || ''}`;
    if (r.ruleType === 'file') return `FILE:${r.path || '?'}/${r.fileOrFolder || ''}`;
    return `${r.ruleType || '?'}`;
  }).sort().join('; ');
}

function mapGraphDetectionRule(rule) {
  const type = rule['@odata.type'] || '';
  if (type.includes('ProductCodeDetection')) {
    return { ruleType: 'msi', productCode: rule.productCode, productVersion: rule.productVersion };
  }
  if (type.includes('RegistryDetection')) {
    return { ruleType: 'registry', keyPath: rule.keyPath, valueName: rule.valueName, detectionValue: rule.detectionValue };
  }
  if (type.includes('FileSystemDetection')) {
    return { ruleType: 'file', path: rule.path, fileOrFolder: rule.fileOrFolderName };
  }
  return { ruleType: type };
}

function summarizeAssignments(assignments) {
  if (!assignments || assignments.length === 0) return '(none)';
  return assignments
    .map(a => `${a.intent || '?'}:${a.groupId || '?'}`)
    .sort()
    .join(', ');
}
