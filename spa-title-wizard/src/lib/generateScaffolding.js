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
`;

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

    // ── windows/lifecycle.yaml ───────────────────────────────────────────
    files['windows/lifecycle.yaml'] = generateLifecycleYaml(s);
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
 * Generate lifecycle.yaml — mirrors ConvertTo-LifecycleYaml.ps1 output.
 * Produces YAML describing PSADT lifecycle phases for Build-PsadtFromLifecycle.ps1.
 */
function generateLifecycleYaml(s) {
  const lc = s.lifecycle;
  const lines = [];
  const today = new Date().toISOString().split('T')[0];

  lines.push('# PSADT v4 Lifecycle Configuration');
  lines.push(`# Generated by SPA Title Wizard on ${today}`);
  lines.push('# Edit this file to change install/uninstall behavior.');
  lines.push('# The pipeline generates Invoke-AppDeployToolkit.ps1 from this at build time.');
  lines.push('');
  lines.push(`repair_mode: ${lc.repairMode}`);
  lines.push('');

  // Resolve install/uninstall type from 'auto' to the actual installer type
  const resolvedInstallType = lc.install.type === 'auto' ? s.installerType : lc.install.type;
  const resolvedUninstallType = lc.uninstall.type === 'auto' ? s.installerType : lc.uninstall.type;

  // Source file references
  const sourceFile = s.installerType === 'msi'
    ? (s.msiFileName || lc.install.msiFile || 'TODO_INSTALLER.msi')
    : (s.exeSourceFilename || lc.install.exeFile || 'TODO_INSTALLER.exe');
  const productCode = s.msiProductCode || '{TODO-PRODUCT-CODE-GUID}';

  // ── Pre-Install ─────────────────────────────────────────────────────────
  const preInstallLines = [];
  const closeApps = lc.preInstall.closeApps || s.closeApps;
  if (closeApps) preInstallLines.push(`  close_apps: "${closeApps}"`);
  if (lc.preInstall.checkDiskSpace) preInstallLines.push('  check_disk_space: true');
  if (lc.preInstall.allowDefer > 0) preInstallLines.push(`  allow_defer: ${lc.preInstall.allowDefer}`);
  if (lc.preInstall.showProgress) preInstallLines.push('  show_progress: true');

  if (preInstallLines.length) {
    lines.push('pre_install:');
    lines.push(...preInstallLines);
    lines.push('');
  }

  // ── Install ─────────────────────────────────────────────────────────────
  lines.push('install:');
  lines.push('  actions:');
  if (resolvedInstallType === 'msi') {
    const msiFile = lc.install.msiFile || sourceFile;
    const msiArgs = lc.install.msiArgs || '/QN /norestart';
    lines.push('    - type: msi_install');
    lines.push(`      file_path: "${msiFile}"`);
    lines.push(`      arguments: "${msiArgs}"`);
  } else if (resolvedInstallType === 'exe') {
    const exeFile = lc.install.exeFile || sourceFile;
    const exeArgs = lc.install.exeArgs || s.exeInstallArgs || '/S';
    lines.push('    - type: exe_install');
    lines.push(`      file_path: "${exeFile}"`);
    lines.push(`      arguments: "${exeArgs}"`);
  } else if (resolvedInstallType === 'copy') {
    lines.push('    - type: folder_copy');
    lines.push('      source: "TODO"');
    lines.push('      destination: "C:\\"');
  }
  lines.push('');

  // ── Post-Install ────────────────────────────────────────────────────────
  const postInstallActions = [];
  if (lc.postInstall.registryMarker || s.detectionMode === 'registry-marker') {
    postInstallActions.push('    - type: registry_marker');
  }
  if (lc.postInstall.envVar) {
    postInstallActions.push('    - type: set_env_variable');
    postInstallActions.push(`      name: "${lc.postInstall.envVar}"`);
    postInstallActions.push(`      value: "${lc.postInstall.envValue}"`);
  }
  if (lc.postInstall.showCompletion) {
    postInstallActions.push('    - type: show_completion');
  }

  if (postInstallActions.length) {
    lines.push('post_install:');
    lines.push('  actions:');
    lines.push(...postInstallActions);
    lines.push('');
  }

  // ── Pre-Uninstall ───────────────────────────────────────────────────────
  const preUnLines = [];
  const unCloseApps = lc.preUninstall.closeApps || s.closeApps;
  if (unCloseApps) preUnLines.push(`  close_apps: "${unCloseApps}"`);
  if (lc.preUninstall.showProgress) preUnLines.push('  show_progress: true');

  if (preUnLines.length) {
    lines.push('pre_uninstall:');
    lines.push(...preUnLines);
    lines.push('');
  }

  // ── Uninstall ───────────────────────────────────────────────────────────
  lines.push('uninstall:');
  lines.push('  actions:');
  if (resolvedUninstallType === 'msi') {
    const appName = lc.uninstall.appName || s.displayName;
    lines.push('    - type: msi_uninstall');
    lines.push(`      app_name: "${appName}"`);
    if (productCode) lines.push(`      product_code: "${productCode}"`);
  } else if (resolvedUninstallType === 'exe') {
    const unExe = lc.uninstall.exeFile || s.exeUninstallPath || 'C:\\Program Files\\TODO\\uninstall.exe';
    const unArgs = lc.uninstall.exeArgs || s.exeUninstallArgs || '/S';
    lines.push('    - type: exe_uninstall');
    lines.push(`      file_path: "${unExe}"`);
    lines.push(`      arguments: "${unArgs}"`);
  } else if (resolvedUninstallType === 'folder') {
    lines.push('    - type: folder_remove');
    lines.push(`      path: "${lc.uninstall.folderPath || 'C:\\\\Program Files\\\\TODO'}"`);
  }
  lines.push('');

  // ── Post-Uninstall ──────────────────────────────────────────────────────
  const postUnActions = [];
  if (lc.postUninstall.removeRegistryMarker || s.detectionMode === 'registry-marker') {
    postUnActions.push('    - type: remove_registry_marker');
  }
  if (lc.postUninstall.removeEnvVar) {
    postUnActions.push('    - type: remove_env_variable');
    postUnActions.push(`      name: "${lc.postUninstall.removeEnvVar}"`);
  }

  if (postUnActions.length) {
    lines.push('post_uninstall:');
    lines.push('  actions:');
    lines.push(...postUnActions);
    lines.push('');
  }

  return lines.join('\n');
}
