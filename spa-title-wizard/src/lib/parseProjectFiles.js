/**
 * parseProjectFiles.js
 *
 * Reverse-parses scaffolded SPA project files back into wizard state.
 * Used by the "Edit Existing" flow to hydrate the wizard from GitLab.
 *
 * @param {Object} files — { [relativePath]: fileContent }
 * @returns {Object} wizardState — partial state to merge into INITIAL_STATE
 */
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
    const pkg = parseSimpleYaml(files['windows/package.yaml']);
    if (pkg.installer_type) state.installerType = pkg.installer_type;
    if (pkg.source_filename) state.installerSource = pkg.source_filename;
    if (pkg.max_install_time) state.maxInstallTime = parseInt(pkg.max_install_time) || 60;
    if (pkg.restart_behavior) state.restartBehavior = pkg.restart_behavior;
    if (pkg.close_apps) state.closeApps = pkg.close_apps;

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
      // Parse detection rules from YAML
      const rulesSection = files['windows/package.yaml'].match(/detection_rules:\n([\s\S]*?)(?:\n\w|\n$|$)/);
      if (rulesSection) {
        state.detectionRules = parseDetectionRules(rulesSection[1]);
      }
    } else {
      state.detectionMode = pkg.detection_method || 'msi';
    }

    // MSI information
    if (pkg.msi_product_code || files['windows/package.yaml'].includes('msi_information:')) {
      const msiSection = files['windows/package.yaml'];
      const msiPc = msiSection.match(/product_code:\s*"?([^"\n]+)/);
      const msiPv = msiSection.match(/product_version:\s*"?([^"\n]+)/);
      const msiPn = msiSection.match(/product_name:\s*"?([^"\n]+)/);
      const msiUc = msiSection.match(/upgrade_code:\s*"?([^"\n]+)/);
      const msiMf = msiSection.match(/manufacturer:\s*"?([^"\n]+)/);
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
      state.appDescription = intuneApp.description || '';
      state.appOwner = intuneApp.owner || 'EUC Packaging';
      state.appDeveloper = intuneApp.developer || '';
      state.informationUrl = intuneApp.informationUrl || '';
      state.privacyUrl = intuneApp.privacyInformationUrl || '';
      state.isFeatured = !!intuneApp.isFeatured;
      state.allowAvailableUninstall = intuneApp.allowAvailableUninstall ?? true;
      state.appNotes = intuneApp.notes || '';

      // Category
      if (intuneApp.categories?.length > 0) {
        state.softwareCategory = intuneApp.categories[0].displayName || '';
      }
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
      if (sup.supersedes_app_id) state.supersedesAppId = sup.supersedes_app_id;
      if (sup.supersedence_type) state.supersedenceType = sup.supersedence_type;
    } catch (e) {
      warnings.push(`Failed to parse supersedence.json: ${e.message}`);
    }
  }

  // ── windows/lifecycle.yaml ──────────────────────────────────────────────
  if (files['windows/lifecycle.yaml']) {
    const lcResult = parseLifecycleYaml(files['windows/lifecycle.yaml']);
    if (lcResult.repairMode) {
      state._lifecycleRepairMode = lcResult.repairMode;
    }
    if (lcResult.variables && lcResult.variables.length > 0) {
      state._lifecycleVarActions = lcResult.variables;
    }
    if (Object.keys(lcResult.phases).length > 0) {
      state._lifecyclePhases = lcResult.phases;
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
 * Does NOT handle nested structures (use specific parsers for those).
 */
function parseSimpleYaml(text) {
  const result = {};
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#') || t.startsWith('-')) continue;
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
 * Parse detection_rules from YAML text.
 * Each rule starts with `  - type:` and may have indented fields.
 */
function parseDetectionRules(rulesText) {
  const rules = [];
  const items = rulesText.split(/\n\s*-\s*type:\s*/);
  for (const item of items) {
    if (!item.trim()) continue;
    const lines = item.split('\n');
    const type = lines[0].trim();
    const fields = {};
    for (let i = 1; i < lines.length; i++) {
      const m = lines[i].trim().match(/^(\w+):\s*(.+)$/);
      if (m) {
        let val = m[2].trim();
        if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
          val = val.slice(1, -1);
        }
        fields[m[1]] = val;
      }
    }
    rules.push({ type, ...fields, enabled: true });
  }
  return rules;
}

/**
 * Parse lifecycle.yaml into variables and phase actions.
 * Returns { repairMode, variables, phases }
 */
function parseLifecycleYaml(text) {
  const result = { repairMode: 'mirror', variables: [], phases: {} };
  const lines = text.split('\n');

  // Repair mode
  for (const line of lines) {
    const m = line.match(/^repair_mode:\s*(\w+)/);
    if (m) { result.repairMode = m[1]; break; }
  }

  // Variables section
  let inVars = false;
  for (const line of lines) {
    if (line.match(/^variables:/)) { inVars = true; continue; }
    if (inVars) {
      if (line.match(/^\w/) || line.match(/^#/)) { inVars = false; continue; }
      const m = line.match(/^\s+(\w+):\s*"?([^"]*)"?/);
      if (m) {
        result.variables.push({
          type: 'custom_variable',
          name: `$${m[1]}`,
          value: m[2],
          desc: `$${m[1]} = '${m[2]}'`,
          enabled: true,
        });
      }
    }
  }

  // Phase sections
  const phaseYamlToKey = {
    pre_install: 'preInstall',
    install: 'install',
    post_install: 'postInstall',
    pre_uninstall: 'preUninstall',
    uninstall: 'uninstall',
    post_uninstall: 'postUninstall',
    pre_repair: 'preRepair',
    repair: 'repair',
    post_repair: 'postRepair',
  };

  let currentPhase = null;
  let currentAction = null;

  for (const line of lines) {
    // Check for phase header (top-level key ending with :)
    const phaseMatch = line.match(/^(\w+):$/);
    if (phaseMatch && phaseYamlToKey[phaseMatch[1]]) {
      currentPhase = phaseYamlToKey[phaseMatch[1]];
      if (!result.phases[currentPhase]) result.phases[currentPhase] = [];
      currentAction = null;
      continue;
    }

    // Skip non-phase content
    if (!currentPhase) continue;

    // New action item
    const actionMatch = line.match(/^\s+- type:\s*(\w+)/);
    if (actionMatch) {
      currentAction = { type: actionMatch[1], enabled: true };
      result.phases[currentPhase].push(currentAction);
      continue;
    }

    // Action fields
    if (currentAction) {
      const fieldMatch = line.match(/^\s+(\w+):\s*(.+)$/);
      if (fieldMatch) {
        let val = fieldMatch[2].trim();
        if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
          val = val.slice(1, -1);
        }
        // Map YAML field names to action state keys
        const key = yamlFieldToActionKey(fieldMatch[1]);
        currentAction[key] = val;
      }
    }
  }

  return result;
}

/** Map lifecycle.yaml field names to wizard action state keys */
function yamlFieldToActionKey(yamlField) {
  const map = {
    file_path: 'file',
    arguments: 'args',
    app_name: 'appName',
    product_code: 'productCode',
    close_apps: 'closeApps',
    source: 'source',
    destination: 'dest',
    path: 'path',
    key: 'key',
    name: 'name',
    value: 'value',
  };
  return map[yamlField] || yamlField;
}
