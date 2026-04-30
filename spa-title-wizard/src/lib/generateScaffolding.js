/**
 * generateScaffolding.js
 * Converts wizard form state into a file map: { relativePath: content }
 * Mirrors the output of New-Title.ps1 exactly.
 */

export default function generateScaffolding(s) {
  const files = {};
  const isWin = s.platform === 'windows' || s.platform === 'both';
  const isMac = s.platform === 'macos' || s.platform === 'both';
  const winEnabled = isWin ? 'true' : 'false';
  const macEnabled = isMac ? 'true' : 'false';

  // ── app.json ────────────────────────────────────────────────────────────
  files['app.json'] = JSON.stringify({
    title: s.displayName,
    publisher: s.publisher,
    package_id: s.packageId,
    version: s.version,
    owners: { team: 'euc-packaging', contact_email: 'euc-packaging@fiserv.com' },
    lifecycle: 'active',
    platforms: {
      windows: { enabled: isWin, framework: 'psadt-enterprise', framework_version: '4.1.0' },
      macos: { enabled: isMac, framework: 'macos-packaging-framework', framework_version: '1.0.0' },
    },
    deployment: { windows: 'intune', macos: 'jamf' },
  }, null, 2);

  // ── .gitlab-ci.yml ──────────────────────────────────────────────────────
  const includeFiles = [];
  if (isWin) {
    includeFiles.push("      - 'templates/windows-build.yml'");
    includeFiles.push("      - 'templates/windows-deploy-intune.yml'");
  }
  if (isMac) {
    includeFiles.push("      - 'templates/macos-deploy-jamf.yml'");
  }

  const stages = [];
  if (isWin) { stages.push('  - build', '  - publish', '  - assign'); }
  if (isMac) { stages.push('  - deploy'); }
  const uniqueStages = [...new Set(stages)];

  const vars = [];
  if (isWin) {
    vars.push('  WINDOWS_ENABLED: "true"');
    vars.push('  PSADT_FRAMEWORK_VERSION: "4.1.0"');
    if (s.installerSource) {
      vars.push(`  WINDOWS_INSTALLER_SOURCE: '${s.installerSource}'`);
    }
  }
  if (isMac) {
    vars.push('  MACOS_ENABLED: "true"');
    vars.push('  TF_JAMF_MODULES_REF: "main"');
  }
  const uniqueVars = [...new Set(vars)];

  files['.gitlab-ci.yml'] = `include:
  - project: '${s.gitLabGroup}/spa-frameworks/gitlab-ci-templates'
    ref: 'main'
    file:
${includeFiles.join('\n')}

stages:
${uniqueStages.join('\n')}

variables:
${uniqueVars.join('\n')}
`;

  // ── .gitignore ──────────────────────────────────────────────────────────
  files['.gitignore'] = `dist/
out/
*.intunewin
*.pkg
*.tar.gz
*.zip
psadt-framework-*/
macos-framework-*/
tools/
intune-modules/
terraform-jamf-modules/
tf-deploy/
.DS_Store
.vscode/

# Generated at build time from lifecycle.yaml — do not commit
windows/src/Invoke-AppDeployToolkit.ps1
`;

  // ══════════════════════════════════════════════════════════════════════════
  //  WINDOWS FILES
  // ══════════════════════════════════════════════════════════════════════════
  if (isWin) {
    const productCode = s.msiProductCode || '{TODO-PRODUCT-CODE-GUID}';
    const sourceFile = s.installerType === 'msi'
      ? (s.msiFileName || 'TODO_INSTALLER.msi')
      : (s.exeSourceFilename || 'TODO_INSTALLER.exe');

    // Detection block
    let detectionBlock = '';
    const detOp = s.fileDetOperator || 'greaterThanOrEqual';
    switch (s.detectionMode) {
      case 'msi-product-code':
        detectionBlock = `detection_mode: msi-product-code
detection:
  product_code: "${productCode}"
  version_operator: ${detOp}
  version: "${s.version}"`;
        break;
      case 'registry-marker': {
        const rkp = s.regKeyPath || `SOFTWARE\\\\Fiserv\\\\InstalledApps\\\\${s.packageId}`;
        detectionBlock = `detection_mode: registry-marker
detection:
  hive: ${s.regHive || 'HKLM'}
  key_path: "${rkp}"
  value_name: ${s.regValueName || 'Version'}
  operator: ${s.regOperator || 'greaterThanOrEqual'}
  value: "${s.regValue || s.version}"
  check32BitOn64System: ${s.regCheck32Bit}`;
        break;
      }
      case 'file': {
        const fp = s.fileDetPath || 'C:\\\\Program Files\\\\TODO';
        const fn = s.fileDetName || 'TODO.exe';
        if (['version', 'sizeInMB', 'modifiedDate'].includes(s.fileDetType)) {
          detectionBlock = `detection_mode: file
detection:
  path: "${fp}"
  file_or_folder: "${fn}"
  detection_type: ${s.fileDetType}
  operator: ${s.fileDetOperator}
  value: "${s.fileDetValue || s.version}"
  check_32bit: false`;
        } else {
          detectionBlock = `detection_mode: file
detection:
  path: "${fp}"
  file_or_folder: "${fn}"
  detection_type: ${s.fileDetType}
  check_32bit: false`;
        }
        break;
      }
      case 'script':
        detectionBlock = `detection_mode: script
detection:
  run_as_32bit: ${s.scriptRunAs32Bit}
  enforce_signature_check: ${s.scriptEnforceSignature}
# Place your detection script at: windows/detection/detect.ps1`;
        break;
    }

    // Optional YAML lines
    const optLines = [];
    if (s.closeApps) optLines.push(`close_apps: '${s.closeApps}'`);
    optLines.push(`restart_behavior: ${s.restartBehavior}`);
    optLines.push('install_experience: system');
    if (s.msiProductCode && s.installerType === 'msi') {
      const msiInfo = ['', 'msi_information:', `  product_code: "${s.msiProductCode}"`];
      if (s.msiProductVersion) msiInfo.push(`  product_version: "${s.msiProductVersion}"`);
      if (s.msiProductName) msiInfo.push(`  product_name: "${s.msiProductName}"`);
      if (s.msiUpgradeCode) msiInfo.push(`  upgrade_code: "${s.msiUpgradeCode}"`);
      if (s.msiManufacturer) msiInfo.push(`  manufacturer: "${s.msiManufacturer}"`);
      optLines.push(...msiInfo);
    }

    // ── Build install commands from deploy mode + reboot passthrough ──────
    const psadtFlags = [];
    if (s.deployMode && s.deployMode !== 'Silent') {
      psadtFlags.push(`-DeployMode ${s.deployMode}`);
    }
    if (s.allowRebootPassThru) {
      psadtFlags.push('-AllowRebootPassThru');
    }
    const installSuffix = psadtFlags.length > 0 ? ' ' + psadtFlags.join(' ') : '';
    const installCmd = `Invoke-AppDeployToolkit.exe${installSuffix}`;
    const uninstallCmd = `Invoke-AppDeployToolkit.exe -DeploymentType Uninstall${installSuffix}`;
    // Add v3_conversion flag when refactoring a v3 script
    const v3Flag = (s.wizardMode === 'refactor' && s._psadtResult?.psadtVersion === 'v3')
      ? '\n# Pipeline will auto-convert v3 → v4 using Convert-ADTDeployment\nv3_conversion: true\n'
      : '';

    files['windows/package.yaml'] = `# ${s.displayName} ${s.version} — Windows package definition
package_id: ${s.packageId}
display_name: "${s.displayName}"
version: "${s.version}"
packaging_version: "1"
installer_type: ${s.installerType}
source_filename: ${sourceFile}
max_install_time: ${s.maxInstallTime}

install_command: '${installCmd}'
uninstall_command: '${uninstallCmd}'

${detectionBlock}

${optLines.join('\n')}
${v3Flag}`;


    // Intune app.json
    files['windows/intune/app.json'] = JSON.stringify({
      displayName: s.displayName,
      description: s.appDescription || 'TODO: Add application description.',
      publisher: s.publisher,
      appVersion: s.version,
      informationUrl: s.informationUrl || '',
      isFeatured: !!s.isFeatured,
      privacyInformationUrl: s.privacyUrl || '',
      notes: s.appNotes || 'Managed by SPA pipeline.',
      owner: s.appOwner || 'EUC Packaging',
      developer: s.appDeveloper || '',
      installCommandLine: installCmd,
      uninstallCommandLine: uninstallCmd,
      applicableArchitectures: s.applicableArch || 'x64',
      minimumSupportedWindowsRelease: s.minWinRelease || 'Windows11_22H2',
      displayVersion: s.version,
      allowAvailableUninstall: true,
      installContext: s.installContext || 'system',
      restartBehavior: s.restartBehavior,
    }, null, 2);

    // Intune assignments.json — use wizard assignments
    const assignArr = s.assignments.map(a => {
      const entry = {
        intent: a.intent,
        groupId: a.groupId || 'TODO-ENTRA-ID-GROUP-OBJECT-ID',
        filterMode: a.filterMode,
        notifications: a.notifications,
        deliveryOptimizationPriority: a.deliveryOptPriority,
      };
      if (a.filterMode !== 'none' && a.filterId) entry.filterId = a.filterId;
      return entry;
    });
    files['windows/intune/assignments.json'] = JSON.stringify(assignArr, null, 2);

    // Intune requirements.json
    files['windows/intune/requirements.json'] = JSON.stringify({
      minimumSupportedWindowsRelease: s.minWinRelease || 'Windows11_22H2',
      applicableArchitectures: s.applicableArch || 'x64',
      minimumFreeDiskSpaceInMB: s.minDiskSpaceMB || 500,
      minimumMemoryInMB: s.minMemoryMB || 2048,
      minimumNumberOfProcessors: null,
      minimumCpuSpeedInMHz: null,
    }, null, 2);

    // Intune supersedence.json
    files['windows/intune/supersedence.json'] = JSON.stringify({
      supersededAppId: s.supersedesAppId || '',
      supersedenceType: s.supersedenceType || 'update',
    }, null, 2);

    // .gitkeep
    files['windows/src/Files/.gitkeep'] = `# Drop installer binary here. Do NOT commit binaries to git.\n# Expected: ${sourceFile}\n`;

    // Logo file — include in zip if provided
    if (s.logoFile && s.logoDataUrl) {
      // Store as a marker; the actual binary is handled by downloadZip
      const logoExt = s.logoFile.name.split('.').pop().toLowerCase();
      files[`windows/intune/logo.${logoExt}`] = s.logoDataUrl;
    }

    // Script detection
    if (s.detectionMode === 'script') {
      const scriptBody = s.scriptContent || `<#
.SYNOPSIS
  Intune detection script for ${s.displayName}.
  Exit 0 + stdout = detected (installed).
  Exit 1 = not detected (not installed).
#>

# TODO: Replace with your detection logic
$appPath = "C:\\Program Files\\TODO\\${s.packageId}.exe"

if (Test-Path $appPath) {
    Write-Host "${s.displayName} is installed."
    exit 0
} else {
    exit 1
}
`;
      files['windows/detection/detect.ps1'] = scriptBody;
      files['windows/detection/detection-config.json'] = JSON.stringify({
        runAs32Bit: s.scriptRunAs32Bit,
        enforceSignatureCheck: s.scriptEnforceSignature,
      }, null, 2);
    }

    // ── windows/lifecycle.yaml OR committed .ps1 ──────────────────────────
    if (s.wizardMode === 'refactor' && s._psadtResult?.scriptContent) {
      // Refactor mode: commit the original .ps1 directly (no lifecycle.yaml)
      const isV3 = s._psadtResult?.psadtVersion === 'v3';
      if (isV3) {
        // v3 scripts go as Deploy-Application.ps1 — pipeline converts to v4
        files['windows/src/Deploy-Application.ps1'] = s._psadtResult.scriptContent;
      } else {
        files['windows/src/Invoke-AppDeployToolkit.ps1'] = s._psadtResult.scriptContent;
      }
    } else {
      // New title mode: declarative lifecycle.yaml
      files['windows/lifecycle.yaml'] = generateLifecycleYaml(s);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  MACOS FILES
  // ══════════════════════════════════════════════════════════════════════════
  if (isMac) {
    const macSourceFile = `TODO_INSTALLER.${s.macInstallerType}`;
    const bundlePlaceholder = s.bundleId || 'com.vendor.TODO';
    const receiptPlaceholder = s.receiptId || 'com.vendor.todo';
    const jamfCat = s.jamfCategory || 'No category';

    files['macos/package.yaml'] = `# ${s.displayName} ${s.version} — macOS package definition
vendor_version: "${s.version}"
packaging_version: 1
source_type: ${s.macInstallerType}
source_filename: ${macSourceFile}
receipt_id: ${receiptPlaceholder}
bundle_id: ${bundlePlaceholder}
minimum_os: "13.0"
architecture: universal
jamf_category: ${jamfCat}
post_install_script: postinstall.sh
`;

    files['macos/jamf/package-inputs.json'] = JSON.stringify({
      package_name: `${s.displayName} ${s.version}`,
      category_id: '-1',
      notes: 'Deployed by SPA pipeline. Do not modify directly in Jamf.',
      reboot_required: false,
      os_requirements: '',
    }, null, 2);

    files['macos/jamf/policy-inputs.json'] = JSON.stringify({
      policy_name: `SPA - Install ${s.displayName}`,
      enabled: true,
      trigger: 'RECURRING_CHECK_IN',
      frequency: 'Once per computer',
      run_recon_after_install: true,
      self_service_enabled: s.macSelfService,
      self_service_display_name: s.displayName,
      self_service_description: '',
    }, null, 2);

    // Scope inputs
    const scopeIds = s.scopeGroupIds
      ? s.scopeGroupIds.split(',').map(s => s.trim()).filter(Boolean)
      : ['TODO-JAMF-SMART-GROUP-ID'];
    const exclusionIds = s.exclusionGroupIds
      ? s.exclusionGroupIds.split(',').map(s => s.trim()).filter(Boolean)
      : [];

    files['macos/jamf/scope-inputs.json'] = JSON.stringify({
      _comment: 'Replace computer_groups values with real Jamf smart/static group IDs',
      scope_groups: { computer_groups: scopeIds },
      exclusion_groups: { computer_groups: exclusionIds },
    }, null, 2);

    // Pre/post install scripts
    files['macos/src/scripts/preinstall'] = `#!/usr/bin/env bash
# =============================================================================
# preinstall — ${s.displayName} macOS pre-install
# =============================================================================
set -euo pipefail

echo "[preinstall] ${s.displayName} pre-install starting..."

# TODO: Add pre-install logic here

echo "[preinstall] ${s.displayName} pre-install complete."
exit 0
`;

    files['macos/src/scripts/postinstall'] = `#!/usr/bin/env bash
# =============================================================================
# postinstall — ${s.displayName} macOS post-install
# =============================================================================
set -euo pipefail

echo "[postinstall] ${s.displayName} post-install starting..."

# TODO: Add post-install logic here

echo "[postinstall] ${s.displayName} post-install complete."
exit 0
`;

    files['macos/src/postinstall.sh'] = `#!/usr/bin/env bash
# =============================================================================
# postinstall.sh — wrapper script referenced by package.yaml
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
bash "$SCRIPT_DIR/scripts/postinstall"
`;

    files['macos/src/Files/.gitkeep'] = `# Drop macOS installer binary here. Do NOT commit binaries to git.\n# Expected: ${macSourceFile}\n`;

    files['macos/detection/extension-attribute.sh'] = `#!/usr/bin/env bash
# =============================================================================
# extension-attribute.sh — Jamf Extension Attribute
# Returns the installed version of ${s.displayName} for inventory reporting.
# =============================================================================

APP_PATH="/Applications/TODO.app"
PLIST_KEY="CFBundleShortVersionString"

if [[ -d "$APP_PATH" ]]; then
    version=$(defaults read "$APP_PATH/Contents/Info" "$PLIST_KEY" 2>/dev/null)
    if [[ -n "$version" ]]; then
        echo "<result>$version</result>"
    else
        echo "<result>Installed (version unknown)</result>"
    fi
else
    echo "<result>Not Installed</result>"
fi
`;

    files['macos/detection/receipt-check.sh'] = `#!/usr/bin/env bash
# =============================================================================
# receipt-check.sh — Receipt-based detection
# Checks if the macOS installer receipt exists for ${s.displayName}.
# =============================================================================

RECEIPT_ID="${receiptPlaceholder}"

if pkgutil --pkg-info "$RECEIPT_ID" &>/dev/null; then
    echo "Installed"
    exit 0
else
    echo "Not Installed"
    exit 1
fi
`;
  }

  return files;
}

/**
 * Generate lifecycle.yaml — produces YAML describing PSADT lifecycle phases.
 * Consumes the new 10-phase actions model from lifecycle.phases.
 */
function generateLifecycleYaml(s) {
  const lc = s.lifecycle;
  const lines = [];
  const today = new Date().toISOString().split('T')[0];

  lines.push('# PSADT v4 Lifecycle Configuration');
  lines.push(`# Generated by SPA Packaging Workbench on ${today}`);
  lines.push('# Edit this file to change install/uninstall behavior.');
  lines.push('# The pipeline generates Invoke-AppDeployToolkit.ps1 from this at build time.');
  lines.push('');
  lines.push(`repair_mode: ${lc.repairMode}`);
  lines.push('');

  // Phase key → YAML key mapping
  const phaseYamlMap = {
    variableDeclaration: 'variable_declaration',
    preInstall: 'pre_install',
    install: 'install',
    postInstall: 'post_install',
    preUninstall: 'pre_uninstall',
    uninstall: 'uninstall',
    postUninstall: 'post_uninstall',
    preRepair: 'pre_repair',
    repair: 'repair',
    postRepair: 'post_repair',
  };

  const phases = lc.phases || {};

  for (const [phaseKey, yamlKey] of Object.entries(phaseYamlMap)) {
    const phaseData = phases[phaseKey];
    if (!phaseData) continue;
    const actions = (phaseData.actions || []).filter(a => a.enabled !== false);
    if (actions.length === 0) continue;

    lines.push(`${yamlKey}:`);
    lines.push('  actions:');

    for (const action of actions) {
      lines.push(`    - type: ${action.type}`);

      // Serialize known fields per action type
      switch (action.type) {
        case 'msi_install':
          if (action.file) lines.push(`      file_path: "${action.file}"`);
          lines.push(`      arguments: "${action.args || '/QN /norestart'}"`);
          break;
        case 'msi_uninstall':
          if (action.appName) lines.push(`      app_name: "${action.appName}"`);
          if (action.productCode) lines.push(`      product_code: "${action.productCode}"`);
          if (action.args) lines.push(`      arguments: "${action.args}"`);
          break;
        case 'msi_uninstall_batch': {
          const guids = Array.isArray(action.guids) ? action.guids : [];
          if (guids.length > 0) {
            lines.push('      guids:');
            for (const g of guids) lines.push(`        - "${g}"`);
          }
          break;
        }
        case 'exe_install':
        case 'exe_uninstall':
          if (action.file) lines.push(`      file_path: "${action.file}"`);
          lines.push(`      arguments: "${action.args || '/S'}"`);
          break;
        case 'execute_process':
          if (action.file) lines.push(`      file_path: "${action.file}"`);
          if (action.args) lines.push(`      arguments: "${action.args}"`);
          break;
        case 'stop_process':
          if (action.closeApps) lines.push(`      close_apps: "${action.closeApps}"`);
          break;
        case 'file_copy':
          if (action.source) lines.push(`      source: "${action.source}"`);
          if (action.dest) lines.push(`      destination: "${action.dest}"`);
          break;
        case 'file_remove':
          if (action.path) lines.push(`      path: "${action.path}"`);
          break;
        case 'create_folder':
          if (action.path) lines.push(`      path: "${action.path}"`);
          break;
        case 'registry_set':
          if (action.key) lines.push(`      key: "${action.key}"`);
          if (action.name) lines.push(`      name: "${action.name}"`);
          if (action.value) lines.push(`      value: "${action.value}"`);
          break;
        case 'registry_remove':
          if (action.key) lines.push(`      key: "${action.key}"`);
          if (action.name) lines.push(`      name: "${action.name}"`);
          break;
        case 'registry_marker':
          lines.push('      # Auto-generated from app metadata');
          break;
        case 'remove_registry_marker':
          lines.push('      # Auto-generated from app metadata');
          break;
        case 'env_variable':
          if (action.name) lines.push(`      name: "${action.name}"`);
          if (action.value) lines.push(`      value: "${action.value}"`);
          break;
        case 'remove_env_variable':
          if (action.name) lines.push(`      name: "${action.name}"`);
          break;
        case 'show_welcome':
          if (action.closeApps) lines.push(`      close_apps: "${action.closeApps}"`);
          if (action.deferTimes) lines.push(`      defer_times: ${action.deferTimes}`);
          if (action.checkDiskSpace) lines.push('      check_disk_space: true');
          break;
        case 'show_progress':
          break; // no params
        case 'show_completion':
          break; // no params
        case 'custom_variable':
          if (action.name) lines.push(`      name: "${action.name}"`);
          if (action.value) lines.push(`      value: "${action.value}"`);
          break;
        case 'sleep':
          lines.push(`      seconds: ${action.seconds || 5}`);
          break;
        case 'custom_script':
          if (action.note) lines.push(`      note: "${action.note}"`);
          if (action.code) {
            // Multi-line code gets block-style YAML
            const codeLines = action.code.split('\n');
            if (codeLines.length === 1) {
              lines.push(`      code: "${action.code.replace(/"/g, '\\"')}"`);
            } else {
              lines.push('      code: |');
              for (const cl of codeLines) lines.push(`        ${cl}`);
            }
          }
          break;
        default:
          // For unrecognized types, serialize all non-meta fields
          for (const [k, v] of Object.entries(action)) {
            if (['type', 'enabled', 'raw', 'desc'].includes(k)) continue;
            if (v !== undefined && v !== null && v !== '') {
              lines.push(`      ${k}: ${typeof v === 'string' ? `"${v}"` : v}`);
            }
          }
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}
