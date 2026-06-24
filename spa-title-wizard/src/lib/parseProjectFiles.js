/**
 * parseProjectFiles.js
 *
 * Reverse-parses scaffolded SPA project files back into wizard state.
 * Used by the "Edit Existing" flow to hydrate the wizard from GitLab.
 *
 * @param {Object} files — { [relativePath]: fileContent }
 * @returns {Object} wizardState — partial state to merge into INITIAL_STATE
 */
import parsePsadtBlocks from './parsePsadtBlocks.js';

export function parseProjectFiles(files) {
  const state = {};
  const warnings = [];

  // ── app.json ────────────────────────────────────────────────────────────
  if (files['app.json']) {
    try {
      const app = JSON.parse(files['app.json']);
      state.displayName = app.title || '';
      state.publisher = app.publisher || '';
      state.packageId = app.package_id || '';
      state.version = app.version || '';
      // Platform from platforms block
      const winEnabled = app.platforms?.windows?.enabled;
      const macEnabled = app.platforms?.macos?.enabled;
      if ((winEnabled === true || winEnabled === 'true') && (macEnabled === true || macEnabled === 'true')) {
        state.platform = 'both';
      } else if (macEnabled === true || macEnabled === 'true') {
        state.platform = 'macos';
      } else {
        state.platform = 'windows';
      }
    } catch (e) {
      warnings.push(`Failed to parse app.json: ${e.message}`);
    }
  }

  // ── windows/package.yaml ────────────────────────────────────────────────
  if (files['windows/package.yaml']) {
    const yamlText = files['windows/package.yaml'];
    const pkg = parseSimpleYaml(yamlText);
    if (pkg.installer_type) state.installerType = pkg.installer_type;
    if (pkg.source_filename) {
      // Legacy projects stored the full path as source_filename.
      // Split into dir + filename for the new model.
      const raw = pkg.source_filename;
      if (raw.includes('\\') || raw.includes('/')) {
        const parts = raw.replace(/\\/g, '/').split('/');
        state.installerSourceFile = parts.pop();
        state.installerSourceDir = parts.join('\\');
      } else {
        state.installerSourceFile = raw;
      }
    }
    if (pkg.max_install_time) state.maxInstallTime = parseInt(pkg.max_install_time) || 60;
    if (pkg.restart_behavior) state.restartBehavior = pkg.restart_behavior;

    // Parse install_command for deploy mode flags
    if (pkg.install_command) {
      const cmd = pkg.install_command;
      const modeMatch = cmd.match(/-DeployMode\s+(\w+)/i);
      if (modeMatch) state.deployMode = modeMatch[1];
      state.allowRebootPassThru = cmd.includes('-AllowRebootPassThru');
    }

    // Detection
    if (pkg.detection_method === 'script') {
      state.detectionMode = 'script';
    } else if (pkg.detection_method === 'manual') {
      state.detectionMode = 'manual';
      state.detectionRules = extractDetectionRules(yamlText);
    } else {
      state.detectionMode = pkg.detection_method || 'msi';
    }

    // MSI information
    if (yamlText.includes('msi_information:')) {
      const msiPc = yamlText.match(/product_code:\s*"?([^"\n]+)/);
      const msiPv = yamlText.match(/product_version:\s*"?([^"\n]+)/);
      const msiPn = yamlText.match(/product_name:\s*"?([^"\n]+)/);
      const msiUc = yamlText.match(/upgrade_code:\s*"?([^"\n]+)/);
      const msiMf = yamlText.match(/manufacturer:\s*"?([^"\n]+)/);
      if (msiPc) state.msiProductCode = msiPc[1].trim().replace(/"$/, '');
      if (msiPv) state.msiProductVersion = msiPv[1].trim().replace(/"$/, '');
      if (msiPn) state.msiProductName = msiPn[1].trim().replace(/"$/, '');
      if (msiUc) state.msiUpgradeCode = msiUc[1].trim().replace(/"$/, '');
      if (msiMf) state.msiManufacturer = msiMf[1].trim().replace(/"$/, '');
    }

    // v3 conversion flag
    if (pkg.v3_conversion === 'true') {
      state._v3Conversion = true;
    }
  }

  // ── windows/intune/app.json ─────────────────────────────────────────────
  if (files['windows/intune/app.json']) {
    try {
      const intuneApp = JSON.parse(files['windows/intune/app.json']);
      // Only set _intuneAppNameOverride if user customized it beyond the auto-generated pattern.
      // The auto-generated pattern is "DisplayName Version" — if it matches, leave blank
      // so deriveState() keeps the name current when displayName/version change.
      const intuneDisplayName = intuneApp.displayName || '';
      const autoPattern = `${state.displayName || ''} ${state.version || ''}`.trim().replace(/\s+/g, ' ');
      
      // If we don't have a displayName in state yet (e.g. missing app.json), we shouldn't 
      // lock in an override because it will break auto-calculation when the user fills in Basic Info.
      // Also, check if it matches common auto-patterns.
      if (state.displayName && intuneDisplayName) {
        if (intuneDisplayName !== autoPattern && intuneDisplayName !== state.displayName.trim()) {
          state._intuneAppNameOverride = intuneDisplayName;
        }
      }
      state.appDescription = intuneApp.description || '';
      state.appOwner = intuneApp.owner || 'EUC Packaging';
      state.appDeveloper = intuneApp.developer || '';
      state.informationUrl = intuneApp.informationUrl || '';
      state.privacyUrl = intuneApp.privacyInformationUrl || '';
      state.isFeatured = !!intuneApp.isFeatured;
      state.allowAvailableUninstall = intuneApp.allowAvailableUninstall ?? true;
      state.appNotes = intuneApp.notes || '';

      // Intune Sync App ID — user-chosen sync target (not the import source)
      if (intuneApp.syncIntuneAppId) state.syncIntuneAppId = intuneApp.syncIntuneAppId;
      // Legacy: keep _intuneAppId for display only — do NOT use for sync
      if (intuneApp.intuneAppId) state._intuneAppId = intuneApp.intuneAppId;

      // Category
      if (intuneApp.categories?.length > 0) {
        state.intuneCategoryIds = intuneApp.categories.map(c => typeof c === 'object' ? c.id : c).filter(Boolean);
        const firstCat = intuneApp.categories[0];
        state.softwareCategory = typeof firstCat === 'object' ? (firstCat.displayName || '') : firstCat;
      } else {
        state.intuneCategoryIds = [];
        state.softwareCategory = '';
      }

      // Scope tags
      // Scope tags — filter out Intune's default "0" scope tag (means "no real scope tag assigned")
      const rawScopeTagIds = intuneApp.roleScopeTagIds;
      state.roleScopeTagIds = Array.isArray(rawScopeTagIds)
        ? rawScopeTagIds.filter(id => id !== '0' && id !== 0)
        : [];
    } catch (e) {
      warnings.push(`Failed to parse windows/intune/app.json: ${e.message}`);
    }
  }

  // ── windows/intune/requirements.json ────────────────────────────────────
  if (files['windows/intune/requirements.json']) {
    try {
      const req = JSON.parse(files['windows/intune/requirements.json']);
      if (req.minimumSupportedWindowsRelease) {
        state.minWinRelease = req.minimumSupportedWindowsRelease;
      }
      // Architecture
      if (req.applicableArchitectures) {
        const arch = req.applicableArchitectures.toLowerCase();
        if (arch === 'none' || (arch.includes('x86') && arch.includes('x64'))) {
          state.archCheckEnabled = false;
        } else {
          state.archCheckEnabled = true;
          state.archX86 = arch.includes('x86');
          state.archX64 = arch.includes('x64');
          state.archArm64 = arch.includes('arm64');
        }
      }
      // Resource requirements — preserve nulls
      state.minDiskSpaceMB = req.minimumFreeDiskSpaceInMB ?? null;
      state.minMemoryMB = req.minimumMemoryInMB ?? null;
      state.minCpuSpeedMHz = req.minimumCpuSpeedInMHz ?? null;
      state.minProcessors = req.minimumNumberOfProcessors ?? null;
    } catch (e) {
      warnings.push(`Failed to parse requirements.json: ${e.message}`);
    }
  }

  // ── windows/intune/assignments.json ─────────────────────────────────────
  if (files['windows/intune/assignments.json']) {
    try {
      const assignments = JSON.parse(files['windows/intune/assignments.json']);
      if (Array.isArray(assignments) && assignments.length > 0) {
        state.assignments = assignments.map(a => ({
          intent: a.intent || 'required',
          target: a.target || '',
          groupId: a.target?.groupId || a.groupId || '',
          groupName: a.groupName || a.target?.groupName || '',
          filterType: a.filterType || 'none',
          filterId: a.filterId || '',
          notifications: a.settings?.notifications || 'showAll',
          restartGracePeriod: a.settings?.restartGracePeriod || 1440,
          restartCountDown: a.settings?.restartCountDown || 30,
          restartSnooze: a.settings?.restartSnooze || 240,
          deadlineDateTime: a.settings?.deadlineDateTime || '',
          availableDateTime: a.settings?.availableDateTime || '',
        }));
      }
    } catch (e) {
      warnings.push(`Failed to parse assignments.json: ${e.message}`);
    }
  }

  // ── windows/intune/supersedence.json ────────────────────────────────────
  if (files['windows/intune/supersedence.json']) {
    try {
      const sup = JSON.parse(files['windows/intune/supersedence.json']);
      // camelCase (current schema) with snake_case fallback (legacy)
      const appId = sup.supersededAppId || sup.supersedes_app_id;
      const supType = sup.supersedenceType || sup.supersedence_type;
      if (appId) state.supersedesAppId = appId;
      if (supType) state.supersedenceType = supType;
    } catch (e) {
      warnings.push(`Failed to parse supersedence.json: ${e.message}`);
    }
  }

  // ── windows/intune/dependencies.json ─────────────────────────────────────
  if (files['windows/intune/dependencies.json']) {
    try {
      const deps = JSON.parse(files['windows/intune/dependencies.json']);
      if (Array.isArray(deps) && deps.length > 0) {
        state.dependencies = deps.map(d => ({
          appId: d.appId || d.targetId || '',
          dependencyType: d.dependencyType || 'autoInstall',
        }));
      }
    } catch (e) {
      warnings.push(`Failed to parse dependencies.json: ${e.message}`);
    }
  }

  // ── windows/lifecycle.yaml ──────────────────────────────────────────────
  if (files['windows/lifecycle.yaml']) {
    const lcResult = parseLifecycleYaml(files['windows/lifecycle.yaml']);
    if (lcResult.variables && lcResult.variables.length > 0) {
      state._lifecycleVarActions = lcResult.variables;
    }
    if (Object.keys(lcResult.phases).length > 0) {
      state._lifecyclePhases = lcResult.phases;
    }
  } else {
    const ps1Path = files['windows/src/Invoke-AppDeployToolkit.ps1'] 
      ? 'windows/src/Invoke-AppDeployToolkit.ps1' 
      : (files['windows/src/Deploy-Application.ps1'] ? 'windows/src/Deploy-Application.ps1' : null);
    if (ps1Path && files[ps1Path]) {
      // Parse block comments to recover visual actions and custom blocks
      try {
        const parsed = parsePsadtBlocks(files[ps1Path]);
        if (parsed.lifecycle && parsed.lifecycle.phases) {
          state._lifecyclePhases = parsed.lifecycle.phases;
        }
      } catch (e) {
        warnings.push(`Failed to parse script blocks from Invoke-AppDeployToolkit.ps1: ${e.message}`);
      }
    }
  }

  // ── windows/detection/detection-config.json ─────────────────────────────
  if (files['windows/detection/detection-config.json']) {
    try {
      const det = JSON.parse(files['windows/detection/detection-config.json']);
      if (det.scriptRunAs32Bit !== undefined) state.scriptRunAs32Bit = det.scriptRunAs32Bit;
      if (det.scriptEnforceSignature !== undefined) state.scriptEnforceSignature = det.scriptEnforceSignature;
      if (det.scriptContent) state.detectionScriptContent = det.scriptContent;
    } catch (e) {
      warnings.push(`Failed to parse detection-config.json: ${e.message}`);
    }
  }

  // ── macOS files ─────────────────────────────────────────────────────────
  if (files['macos/package.yaml']) {
    const macPkg = parseSimpleYaml(files['macos/package.yaml']);
    if (macPkg.installer_type) state.macInstallerType = macPkg.installer_type;
    if (macPkg.bundle_id) state.bundleId = macPkg.bundle_id;
    if (macPkg.receipt_id) state.receiptId = macPkg.receipt_id;
  }

  if (files['macos/jamf/package-inputs.json']) {
    try {
      const jamfPkg = JSON.parse(files['macos/jamf/package-inputs.json']);
      if (jamfPkg.category_id) state.jamfCategoryId = String(jamfPkg.category_id);
      if (jamfPkg.category_name) state.jamfCategory = jamfPkg.category_name;
    } catch { /* skip */ }
  }

  if (files['macos/jamf/policy-inputs.json']) {
    try {
      const jamfPolicy = JSON.parse(files['macos/jamf/policy-inputs.json']);
      state.macSelfService = !!(jamfPolicy.self_service?.use_for_self_service);
      if (jamfPolicy.self_service?.self_service_category_id) {
        state.selfServiceCategoryId = String(jamfPolicy.self_service.self_service_category_id);
      }
    } catch { /* skip */ }
  }

  if (files['macos/jamf/scope-inputs.json']) {
    try {
      const scope = JSON.parse(files['macos/jamf/scope-inputs.json']);
      if (scope.computer_group_ids) state.scopeGroupIds = scope.computer_group_ids.join(',');
      if (scope.exclusion_group_ids) state.exclusionGroupIds = scope.exclusion_group_ids.join(',');
    } catch { /* skip */ }
  }

  return { state, warnings };
}


// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Simple YAML key-value parser for SPA config files.
 * Handles: `key: value`, `key: "value"`, `key: 'value'`
 * Only parses TOP-LEVEL keys (no leading whitespace).
 */
function parseSimpleYaml(text) {
  const result = {};
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#') || t.startsWith('-')) continue;
    // Only match lines without leading whitespace (top-level keys)
    if (line.match(/^\s/)) continue;
    const m = t.match(/^(\w[\w_]*):\s*(.+)$/);
    if (m) {
      const key = m[1];
      let val = m[2].trim();
      // Strip quotes
      if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
        val = val.slice(1, -1);
      }
      result[key] = val;
    }
  }
  return result;
}

/**
 * Extract detection rules from a package.yaml file.
 * Matches the scaffolding format:
 *   detection_rules:
 *     - type: msi
 *       product_code: "{GUID}"
 *       version_operator: greaterThanOrEqual
 *       version: "1.0"
 */
function extractDetectionRules(yamlText) {
  const rules = [];

  // Find where detection_rules: starts
  const startIdx = yamlText.indexOf('detection_rules:');
  if (startIdx === -1) return rules;

  const afterBlock = yamlText.substring(startIdx + 'detection_rules:'.length);
  const lines = afterBlock.split('\n');

  let currentRule = null;

  for (const line of lines) {
    // Stop at the next top-level key (no leading whitespace, not blank, not comment)
    if (line.match(/^[a-z_]+:/) && !line.match(/^\s/)) break;

    // New rule: "  - type: xxx"
    const typeMatch = line.match(/^\s*-\s*type:\s*(\w+)/);
    if (typeMatch) {
      if (currentRule) rules.push(currentRule);
      currentRule = { _type: typeMatch[1] };
      continue;
    }

    // Field within a rule: "    key: value"
    if (currentRule) {
      const fieldMatch = line.trim().match(/^([\w_]+):\s*(.+)$/);
      if (fieldMatch) {
        let val = fieldMatch[2].trim();
        if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
          val = val.slice(1, -1);
        }
        currentRule[fieldMatch[1]] = val;
      }
    }
  }
  if (currentRule) rules.push(currentRule);

  // Map to wizard state field names
  return rules.map(r => {
    if (r._type === 'msi') {
      return {
        ruleType: 'msi',
        productCode: r.product_code || '',
        productVersionOperator: r.version_operator || 'notConfigured',
        productVersion: r.version || '',
        enabled: true,
      };
    } else if (r._type === 'file') {
      return {
        ruleType: 'file',
        path: r.path || '',
        fileOrFolder: r.file_or_folder || '',
        detectionType: r.detection_type || 'exists',
        operator: r.operator || '',
        detectionValue: r.value || '',
        check32BitOn64: r.check_32bit === 'true',
        enabled: true,
      };
    } else if (r._type === 'registry') {
      return {
        ruleType: 'registry',
        hive: r.hive || 'HKLM',
        keyPath: r.key_path || '',
        valueName: r.value_name || '',
        detectionType: r.detection_type || 'exists',
        operator: r.operator || '',
        detectionValue: r.value || '',
        check32BitOn64: r.check_32bit === 'true',
        enabled: true,
      };
    }
    return null;
  }).filter(Boolean);
}


