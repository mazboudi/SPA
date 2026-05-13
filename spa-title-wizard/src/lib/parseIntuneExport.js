/**
 * parseIntuneExport.js
 *
 * Parses an Intune Win32 app export JSON and returns a partial wizard state
 * object that can be merged into INITIAL_STATE via importIntuneExport().
 *
 * @param {Object} exportData — the full parsed JSON from an export file
 * @returns {{ fields: Object, warnings: string[] }}
 */
export function parseIntuneExport(exportData) {
  const warnings = [];
  const app = exportData.app || {};
  const fields = {};

  // ── App Metadata ──────────────────────────────────────────────────────
  fields.displayName = app.displayName || exportData.displayName || '';
  fields.publisher = app.publisher || '';
  fields.version = app.displayVersion || '';
  fields.appDescription = app.description || '';
  fields.informationUrl = app.informationUrl || '';
  fields.privacyUrl = app.privacyInformationUrl || '';
  fields.appOwner = app.owner || 'EUC Packaging';
  fields.appDeveloper = app.developer || '';
  fields.appNotes = app.notes || 'Managed by SPA pipeline.';
  fields.isFeatured = !!app.isFeatured;
  fields.allowAvailableUninstall = app.allowAvailableUninstall ?? true;
  fields.platform = 'windows';

  // Store original Intune app ID for reference
  fields._intuneAppId = exportData.appId || app.id || '';

  // ── Architecture ──────────────────────────────────────────────────────
  if (app.applicableArchitectures && app.applicableArchitectures.toLowerCase() !== 'none') {
    const archs = app.applicableArchitectures.toLowerCase();
    const hasX86 = archs.includes('x86');
    const hasX64 = archs.includes('x64');
    const hasArm64 = archs.includes('arm64');
    // If all major archs are present, treat as "no restriction"
    if (hasX86 && hasX64 && !hasArm64) {
      fields.archCheckEnabled = false;
    } else {
      fields.archCheckEnabled = true;
      fields.archX86 = hasX86;
      fields.archX64 = hasX64;
      fields.archArm64 = hasArm64;
    }
  }

  // ── Windows Release ───────────────────────────────────────────────────
  if (app.minimumSupportedWindowsRelease) {
    fields.minWinRelease = app.minimumSupportedWindowsRelease;
  }

  // ── Resource Requirements (always set — null values override wizard defaults) ──
  fields.minDiskSpaceMB = app.minimumFreeDiskSpaceInMB ?? null;
  fields.minMemoryMB = app.minimumMemoryInMB ?? null;
  fields.minLogicalProcessors = app.minimumNumberOfProcessors ?? null;
  fields.minCpuSpeedMHz = app.minimumCpuSpeedInMHz ?? null;

  // ── Install Experience ────────────────────────────────────────────────
  if (app.installExperience) {
    const ie = app.installExperience;
    if (ie.deviceRestartBehavior) {
      fields.restartBehavior = ie.deviceRestartBehavior;
    }
    if (ie.maxRunTimeInMinutes) {
      fields.maxInstallTime = ie.maxRunTimeInMinutes;
    }
    if (ie.runAsAccount) {
      fields.installContext = ie.runAsAccount;
    }
  }

  // ── Detection Rules ───────────────────────────────────────────────────
  const rawRules = app.detectionRules || [];
  if (rawRules.length > 0) {
    fields.detectionMethod = 'manual';
    fields.detectionRules = rawRules.map(r => mapDetectionRule(r, warnings)).filter(Boolean);
  }

  // ── Return Codes ──────────────────────────────────────────────────────
  if (app.returnCodes && app.returnCodes.length > 0) {
    fields.returnCodes = app.returnCodes.map(rc => ({
      code: rc.returnCode,
      type: rc.type || 'success',
    }));
  }

  // ── Assignments ───────────────────────────────────────────────────────
  const rawAssignments = exportData.assignments || [];
  if (rawAssignments.length > 0) {
    fields.assignments = rawAssignments.map(a => mapAssignment(a));
  }

  // ── Logo ──────────────────────────────────────────────────────────────
  if (app.largeIcon && app.largeIcon.value) {
    const mimeType = app.largeIcon.type || 'image/png';
    fields.logoDataUrl = `data:${mimeType};base64,${app.largeIcon.value}`;
    // Create a minimal File-like object for the scaffolding generator
    fields.logoFile = { name: `intune-logo.${mimeType.split('/')[1] || 'png'}` };
  }

  return { fields, warnings };
}

// ── Detection Rule Mappers ──────────────────────────────────────────────

function mapDetectionRule(rule, warnings) {
  const type = rule['@odata.type'] || '';

  if (type.includes('ProductCodeDetection')) {
    return {
      ruleType: 'msi',
      productCode: rule.productCode || '',
      productVersionOperator: rule.productVersionOperator || 'notConfigured',
      productVersion: rule.productVersion || '',
    };
  }

  if (type.includes('RegistryDetection')) {
    // Parse hive from keyPath
    const { hive, path } = parseRegistryKeyPath(rule.keyPath || '');
    return {
      ruleType: 'registry',
      hive,
      keyPath: path,
      valueName: rule.valueName || '',
      detectionType: rule.detectionType || 'exists',
      operator: rule.operator || 'notConfigured',
      detectionValue: rule.detectionValue || '',
      check32BitOn64: !!rule.check32BitOn64System,
    };
  }

  if (type.includes('FileSystemDetection')) {
    return {
      ruleType: 'file',
      path: rule.path || '',
      fileOrFolder: rule.fileOrFolderName || '',
      detectionType: rule.detectionType || 'exists',
      operator: rule.operator || 'notConfigured',
      detectionValue: rule.detectionValue || '',
      check32BitOn64: !!rule.check32BitOn64System,
    };
  }

  // Script-based detection
  if (type.includes('PowerShellScriptDetection')) {
    warnings.push('Script-based detection found in Intune export. The script content is not included in exports — you will need to provide it manually.');
    return null;
  }

  warnings.push(`Unknown detection rule type: ${type}`);
  return null;
}

function parseRegistryKeyPath(fullPath) {
  const normalized = fullPath.replace(/\\\\/g, '\\');
  if (normalized.startsWith('HKEY_CURRENT_USER')) {
    return { hive: 'HKCU', path: normalized.replace(/^HKEY_CURRENT_USER\\?/, '') };
  }
  // Default to HKLM
  return { hive: 'HKLM', path: normalized.replace(/^HKEY_LOCAL_MACHINE\\?/, '') };
}

// ── Assignment Mapper ───────────────────────────────────────────────────

function mapAssignment(assignment) {
  const target = assignment.target || {};
  const settings = assignment.settings || {};

  return {
    intent: assignment.intent || 'available',
    groupId: target.groupId || '',
    filterMode: target.deviceAndAppManagementAssignmentFilterType || 'none',
    filterId: target.deviceAndAppManagementAssignmentFilterId || '',
    notifications: settings.notifications || 'showAll',
    deliveryOptPriority: settings.deliveryOptimizationPriority || 'notConfigured',
  };
}
