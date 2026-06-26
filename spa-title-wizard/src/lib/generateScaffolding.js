/**
 * generateScaffolding.js
 * Converts wizard form state into a file map: { relativePath: content }
 * Mirrors the output of New-Title.ps1 exactly.
 */

import generatePsadtScript from './generatePsadtScript';

export default function generateScaffolding(s, forPublish = false) {
  const files = {};
  const isWin = s.platform === 'windows' || s.platform === 'both';
  const isMac = s.platform === 'macos' || s.platform === 'both';
  const winEnabled = isWin ? 'true' : 'false';
  const macEnabled = isMac ? 'true' : 'false';

  const winFrameworkVersion = '4.1.0';

  // ── app.json ────────────────────────────────────────────────────────────
  files['app.json'] = JSON.stringify({
    title: s.displayName,
    publisher: s.publisher,
    package_id: s.packageId,
    version: s.version,
    owners: { team: 'euc-packaging', contact_email: 'euc-packaging@fiserv.com' },
    lifecycle: 'active',
    platforms: {
      windows: { enabled: isWin, framework: 'psadt-enterprise', framework_version: winFrameworkVersion },
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
  if (isMac) {
    if (s.macSmbEnabled) stages.push('  - prepare');
    stages.push('  - deploy');
  }
  const uniqueStages = [...new Set(stages)];

  const vars = [];
  if (isWin) {
    vars.push('  WINDOWS_ENABLED: "true"');
    vars.push(`  PSADT_FRAMEWORK_VERSION: "${winFrameworkVersion}"`);
    // Build the full installer path from dir + filename
    if (s.installerSourceDir && s.installerSourceFile) {
      const dir = s.installerSourceDir.replace(/[\\/]+$/, '');  // strip trailing slash
      vars.push(`  WINDOWS_INSTALLER_SOURCE: '${dir}\\${s.installerSourceFile}'`);
    }
    if (s.supportFilesSource) {
      vars.push(`  WINDOWS_SUPPORT_FILES_SOURCE: '${s.supportFilesSource}'`);
    }
  }
  if (isMac) {
    vars.push('  MACOS_ENABLED: "true"');
    vars.push('  TF_JAMF_MODULES_REF: "main"');
    if (s.macSmbEnabled && s.macSmbShare) {
      vars.push(`  MAC_SMB_SHARE: '${s.macSmbShare}'`);
      vars.push(`  # Set MAC_SMB_USER, MAC_SMB_PASS (masked), MAC_SMB_DOMAIN in GitLab CI/CD Variables`);
    }
  }
  // Stage gating — set by SPA Workbench when triggering via Pipeline API
  vars.push('  SPA_STAGE_LIMIT: ""');
  const uniqueVars = [...new Set(vars)];

  let ciYml = `include:
  - project: '${s.gitLabGroup}/spa-frameworks/gitlab-ci-templates'
    ref: 'main'
    file:
${includeFiles.join('\n')}

stages:
${uniqueStages.join('\n')}

variables:
${uniqueVars.join('\n')}
`;

  // ── Append fetch-mac-installer job when SMB is enabled ──────────────────
  if (isMac && s.macSmbEnabled && s.macSmbShare && s.macSmbPathInShare) {
    const fileName = s.macSourceFile || s.macSmbPathInShare.replace(/.*[/\\]/, '');
    ciYml += `
# ─────────────────────────────────────────────────────────────────────────────
# fetch-mac-installer
# Pulls the macOS installer binary from the Windows SMB file share.
# Runs in the 'prepare' stage before the Jamf deploy stage.
#
# Required GitLab CI/CD Variables (Settings -> CI/CD -> Variables):
#   MAC_SMB_USER   - SMB username
#   MAC_SMB_PASS   - SMB password  (masked!)
#   MAC_SMB_DOMAIN - Active Directory domain
#
# TESTING: set MAC_SMB_BYPASS to "true" when the SMB share is not yet reachable.
#          The job will use the installer committed to macos/src/Files/ from git.
#          Revert to "false" once the share is available.
# ─────────────────────────────────────────────────────────────────────────────
fetch-mac-installer:
  stage: prepare
  image: ubuntu:22.04
  variables:
    # GIT_STRATEGY: fetch is required so bypass mode can read committed files.
    # When SMB is active the checkout is a small overhead but otherwise harmless.
    GIT_STRATEGY: fetch
  before_script:
    - apt-get update -qq && apt-get install -y -qq smbclient
  script:
    - mkdir -p macos/src/Files
    - |
      if [ "\${MAC_SMB_BYPASS:-false}" = "true" ]; then
        echo "WARNING: MAC_SMB_BYPASS=true - using installer committed to git (macos/src/Files/)"
        PKG_FILE=$(find macos/src/Files -type f \\( -name '*.pkg' -o -name '*.dmg' \\) | head -1)
        if [ -z "$PKG_FILE" ]; then
          echo "ERROR: No .pkg or .dmg found in macos/src/Files/ - commit the installer or set MAC_SMB_BYPASS=false"
          exit 1
        fi
        echo "OK Using committed installer: $PKG_FILE"
        ls -lh "$PKG_FILE"
      else
        echo "Fetching installer from SMB share: $MAC_SMB_SHARE"
        smbclient "$MAC_SMB_SHARE" \\
          -U "\${MAC_SMB_DOMAIN}\\\\\${MAC_SMB_USER}%\${MAC_SMB_PASS}" \\
          --option='client min protocol=SMB2' \\
          -c "get ${s.macSmbPathInShare} macos/src/Files/${fileName}"
        echo "Downloaded: macos/src/Files/${fileName}"
        ls -lh "macos/src/Files/${fileName}"
      fi
  artifacts:
    name: mac-installer
    paths:
      - macos/src/Files/
    expire_in: 2 hours
  rules:
    - if: '$MACOS_ENABLED == "true"'
`;

    // ── Critical: override the template's needs:[] so deploy waits for ───────
    // ── fetch-mac-installer and downloads its artifact (the installer file). ──
    ciYml += `
# ─────────────────────────────────────────────────────────────────────────────
# macos_deploy_jamf needs override
# The shared template defines needs: [] so it can run without a build stage.
# When using SMB, we override needs so the deploy job:
#   1. Waits for fetch-mac-installer to complete
#   2. Downloads its macos/src/Files/ artifact (the installer binary)
# Without this the file would not be present and the deploy would fail at step 2.
# ─────────────────────────────────────────────────────────────────────────────
macos_deploy_jamf:
  needs: [fetch-mac-installer]
`;
  }

  files['.gitlab-ci.yml'] = ciYml;

  // ── .gitignore ──────────────────────────────────────────────────────────
  const gitignoreLines = [
    'dist/',
    'out/',
    '*.intunewin',
    '*.pkg',
    '*.tar.gz',
    '*.zip',
    'psadt-framework-*/',
    'macos-framework-*/',
    'tools/',
    'intune-modules/',
    'terraform-jamf-modules/',
    'tf-deploy/',
    '.DS_Store',
    '.vscode/',
  ];

  files['.gitignore'] = gitignoreLines.join('\n') + '\n';

  // ══════════════════════════════════════════════════════════════════════════
  //  WINDOWS FILES
  // ══════════════════════════════════════════════════════════════════════════
  if (isWin) {
    const productCode = s.msiProductCode || '{TODO-PRODUCT-CODE-GUID}';
    const sourceFile = s.installerType === 'msi'
      ? (s.msiFileName || 'TODO_INSTALLER.msi')
      : (s.exeSourceFilename || 'TODO_INSTALLER.exe');

    // Detection block — new model uses detectionMethod + detectionRules array
    let detectionBlock = '';
    if (s.detectionMethod === 'script') {
      detectionBlock = `detection_method: script
detection:
  run_as_32bit: ${s.scriptRunAs32Bit}
  enforce_signature_check: ${s.scriptEnforceSignature}
# Place your detection script at: windows/detection/detect.ps1`;
    } else {
      // Manual rules
      const rules = (s.detectionRules || []).map(r => {
        if (r.ruleType === 'msi') {
          return `  - type: msi\n    product_code: "${r.productCode}"\n    version_operator: ${r.productVersionOperator}\n    version: "${r.productVersion}"`;
        } else if (r.ruleType === 'file') {
          let rule = `  - type: file\n    path: '${r.path}'\n    file_or_folder: "${r.fileOrFolder}"\n    detection_type: ${r.detectionType}`;
          if (!['exists', 'doesNotExist'].includes(r.detectionType)) {
            rule += `\n    operator: ${r.operator}\n    value: "${r.detectionValue}"`;
          }
          rule += `\n    check_32bit: ${r.check32BitOn64}`;
          return rule;
        } else if (r.ruleType === 'registry') {
          let rule = `  - type: registry\n    hive: ${r.hive}\n    key_path: '${r.keyPath}'\n    value_name: "${r.valueName}"\n    detection_type: ${r.detectionType}`;
          if (!['exists', 'doesNotExist'].includes(r.detectionType)) {
            rule += `\n    operator: ${r.operator}\n    value: "${r.detectionValue}"`;
          }
          rule += `\n    check_32bit: ${r.check32BitOn64}`;
          return rule;
        }
        return '';
      }).filter(Boolean);

      if (rules.length > 0) {
        detectionBlock = `detection_method: manual\ndetection_rules:\n${rules.join('\n')}`;
      } else {
        detectionBlock = `detection_method: manual\ndetection_rules: []\n# TODO: Add at least one detection rule`;
      }
    }

    // Optional YAML lines
    const optLines = [];
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
    if (s.deployMode) {
      psadtFlags.push(`-DeployMode ${s.deployMode}`);
    }
    if (s.allowRebootPassThru) {
      psadtFlags.push('-AllowRebootPassThru');
    }
    const installSuffix = psadtFlags.length > 0 ? ' ' + psadtFlags.join(' ') : '';
    const bootstrapperExe = 'Invoke-AppDeployToolkit.exe';
    const installCmd = `${bootstrapperExe} -DeploymentType Install${installSuffix}`;
    const uninstallCmd = `${bootstrapperExe} -DeploymentType Uninstall${installSuffix}`;

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


    // Compute applicable architectures from new checkbox model
    const getApplicableArchitectures = () => {
      if (!s.archCheckEnabled) return 'x86,x64,arm64'; // "No" = all architectures allowed
      const archs = [];
      if (s.archX86) archs.push('x86');
      if (s.archX64) archs.push('x64');
      if (s.archArm64) archs.push('arm64');
      return archs.join(',') || 'x64';
    };

    // Intune app.json
    const intuneAppObj = {
      displayName: s.intuneAppName || `${s.displayName || ''} ${s.version || ''}`.trim().replace(/\s+/g, ' '),
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
      applicableArchitectures: getApplicableArchitectures(),
      minimumSupportedWindowsRelease: s.minWinRelease || 'Windows11_22H2',
      displayVersion: s.version,
      allowAvailableUninstall: !!s.allowAvailableUninstall,
      installContext: s.installContext || 'system',
      restartBehavior: s.restartBehavior,
      returnCodes: (s.returnCodes || []).map(rc => ({
        returnCode: parseInt(rc.code) || 0,
        type: rc.type || 'success',
      })),
      categories: s.intuneCategoryIds?.length ? s.intuneCategoryIds : (s.softwareCategory ? [s.softwareCategory] : []),
      // Sanitize roleScopeTagIds — must always be an array; filter out Intune's default "0" scope tag
      roleScopeTagIds: Array.isArray(s.roleScopeTagIds)
        ? s.roleScopeTagIds.filter(id => id !== '0' && id !== 0)
        : [],
    };
    // Persist Intune Sync App ID if user has explicitly set one
    if (s.syncIntuneAppId) intuneAppObj.syncIntuneAppId = s.syncIntuneAppId;
    files['windows/intune/app.json'] = JSON.stringify(intuneAppObj, null, 2);

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
    const reqObj = {
      minimumSupportedWindowsRelease: s.minWinRelease || null,
      applicableArchitectures: getApplicableArchitectures(),
      minimumFreeDiskSpaceInMB: s.minDiskSpaceMB ?? null,
      minimumMemoryInMB: s.minMemoryMB ?? null,
      minimumNumberOfProcessors: s.minLogicalProcessors ?? null,
      minimumCpuSpeedInMHz: s.minCpuSpeedMHz ?? null,
    };
    if ((s.customRequirements || []).length > 0) {
      // For script requirements, save the content as separate .ps1 files
      // and reference the path instead of embedding inline
      let scriptIdx = 0;
      reqObj.customRequirementRules = s.customRequirements.map(req => {
        if (req.type === 'script' && req.scriptContent) {
          const filename = req.scriptFileName || `requirement-${scriptIdx}.ps1`;
          const scriptPath = `windows/intune/scripts/${filename}`;
          files[scriptPath] = req.scriptContent;
          scriptIdx++;
          // Return a clean rule with file reference instead of inline content
          const { scriptContent, scriptFileName, ...rest } = req;
          return { ...rest, scriptFile: scriptPath };
        }
        return req;
      });
    }
    files['windows/intune/requirements.json'] = JSON.stringify(reqObj, null, 2);

    // Intune supersedence.json — array format (supports up to 10, per Graph API limit).
    // Only write the file when at least one valid GUID is configured.
    const stripGuidBraces = (g) => (g || '').trim().replace(/^\{|\}$/g, '');
    const validSupersedences = (s.supersedences || [])
      .map(entry => ({
        supersededAppId: stripGuidBraces(entry.appId),
        supersedenceType: entry.supersedenceType || 'replace',
      }))
      .filter(entry => entry.supersededAppId);
    if (validSupersedences.length > 0) {
      files['windows/intune/supersedence.json'] = JSON.stringify(validSupersedences, null, 2);
    }


    // Intune dependencies.json
    if ((s.dependencies || []).length > 0) {
      files['windows/intune/dependencies.json'] = JSON.stringify(
        s.dependencies.map(d => ({
          appId: stripGuidBraces(d.appId),
          dependencyType: d.dependencyType || 'autoInstall',
        })),
        null, 2
      );
    }

    // .gitkeep
    files['windows/src/Files/.gitkeep'] = `# Drop installer binary here. Do NOT commit binaries to git.\n# Expected: ${sourceFile}\n`;

    // ── File dependency manifest ──────────────────────────────────────────
    const deps = extractFileDependencies(s);
    if (deps.files.length > 0 || deps.supportFiles.length > 0) {
      const today = new Date().toISOString().split('T')[0];
      const ml = [
        '# File Dependency Manifest — auto-generated by SPA Packaging Workbench',
        `# Generated on ${today}`,
        '#',
        '# Lists auxiliary files referenced by the PSADT lifecycle script.',
        '# The pipeline validates these files exist in src/ before building.',
        '# Primary installer is defined in package.yaml (source_filename).',
        '',
      ];
      ml.push('files:');
      if (deps.files.length > 0) {
        for (const f of deps.files) ml.push(`  - ${f}`);
      } else {
        ml.push('  []');
      }
      ml.push('');
      ml.push('support_files:');
      if (deps.supportFiles.length > 0) {
        for (const f of deps.supportFiles) ml.push(`  - ${f}`);
      } else {
        ml.push('  []');
      }
      ml.push('');
      files['windows/src/files-manifest.yaml'] = ml.join('\n');
    }

    // Logo file — include if provided (logoFile is a File object from upload,
    // _logoFileName is the saved name from a previous session / refactor load)
    if (s.logoDataUrl) {
      const logoName = s.logoFile?.name || s._logoFileName || 'logo.png';
      const logoExt = logoName.split('.').pop().toLowerCase();
      files[`windows/intune/logo.${logoExt}`] = s.logoDataUrl;
    }

    // Script detection
    if (s.detectionMethod === 'script') {
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

    // ── windows/src/Invoke-AppDeployToolkit.ps1 ──────────────────────────
    const refactorScript = s._psadtResult?.scriptContent || s._scriptContent;
    const psadtScript = generatePsadtScript(s);
    files['windows/src/Invoke-AppDeployToolkit.ps1'] = psadtScript;

    // Archive original script for reference (refactor mode only)
    if (s.wizardMode === 'refactor' && refactorScript) {
      files['windows/src/_original_script.ps1.bak'] = refactorScript;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  MACOS FILES
  // ══════════════════════════════════════════════════════════════════════════
  if (isMac) {
    // Use real filename if provided, otherwise fall back to a placeholder
    const macSourceFile = s.macSourceFile || `TODO_INSTALLER.${s.macInstallerType}`;
    const macSourceDir  = s.macSourceDir  || '';
    const bundlePlaceholder = s.bundleId || 'com.vendor.TODO';
    const receiptPlaceholder = s.receiptId || 'com.vendor.todo';
    const jamfCat = s.jamfCategory || 'No category';

    const smbBlock = s.macSmbEnabled && s.macSmbShare
      ? [
          `smb_share: ${s.macSmbShare}`,
          s.macSmbPathInShare ? `smb_path_in_share: ${s.macSmbPathInShare}` : '',
          s.macSmbUserVar   !== 'MAC_SMB_USER'    ? `smb_user_var: ${s.macSmbUserVar}`   : '',
          s.macSmbPassVar   !== 'MAC_SMB_PASS'    ? `smb_pass_var: ${s.macSmbPassVar}`   : '',
          s.macSmbDomainVar !== 'MAC_SMB_DOMAIN'  ? `smb_domain_var: ${s.macSmbDomainVar}` : '',
        ].filter(Boolean).join('\n') + '\n'
      : '';

    files['macos/package.yaml'] = `# ${s.displayName} ${s.version} — macOS package definition
vendor_version: "${s.version}"
packaging_version: 1
source_type: ${s.macInstallerType}
source_filename: ${macSourceFile}${macSourceDir ? `\nsource_dir: ${macSourceDir}` : ''}
receipt_id: ${receiptPlaceholder}
bundle_id: ${bundlePlaceholder}
minimum_os: "${s.macMinOs || '13.0'}"
architecture: universal
jamf_category: ${jamfCat}
post_install_script: postinstall.sh
${smbBlock}`;

    // ── package-inputs.json — matches jamfpro_package resource ──────────
    const minOsStr = s.macMinOs ? `macOS ${s.macMinOs}` : '';
    files['macos/jamf/package-inputs.json'] = JSON.stringify({
      package_name: `${s.displayName} ${s.version}`,
      category_id: s.jamfCategoryId || '-1',
      info: '',
      notes: s.macPackageNotes || 'Deployed by SPA pipeline. Do not modify directly in Jamf.',
      priority: 10,
      reboot_required: !!s.macRebootRequired,
      fill_user_template: false,
      fill_existing_users: false,
      os_requirements: minOsStr,
      suppress_updates: false,
      suppress_from_dock: false,
      suppress_eula: false,
      suppress_registration: false,
      os_install: false,
    }, null, 2);

    // ── policy-inputs.json — keys must match Build-JamfTerraform.sh jq queries ──
    const isSelfService = !!s.macSelfService;
    const triggers = Array.isArray(s.macPolicyTriggers) && s.macPolicyTriggers.length
      ? s.macPolicyTriggers
      : ['checkin'];
    const policyInputs = {
      policy_name: `SPA - Install ${s.displayName}`,
      enabled: true,
      frequency: s.macPolicyFrequency || 'Ongoing',
      triggers,
      custom_trigger: triggers.includes('custom') ? (s.macPolicyCustomTrigger || '') : '',
      run_recon_after_install: true,
      reboot_required: !!s.macRebootRequired,
      self_service_enabled: isSelfService,
      self_service_display_name: isSelfService ? s.displayName : '',
      self_service_description: isSelfService ? (s.macSelfServiceDescription || '') : '',
      self_service_category_id: isSelfService && s.selfServiceCategoryId
        ? parseInt(s.selfServiceCategoryId)
        : -1,
    };
    files['macos/jamf/policy-inputs.json'] = JSON.stringify(policyInputs, null, 2);

    // ── scope-inputs.json — keys must match Build-JamfTerraform.sh jq queries ──
    const scopeIds = s.scopeGroupIds
      ? s.scopeGroupIds.split(',').map(v => parseInt(v.trim())).filter(n => !isNaN(n))
      : [];
    const exclusionIds = s.exclusionGroupIds
      ? s.exclusionGroupIds.split(',').map(v => parseInt(v.trim())).filter(n => !isNaN(n))
      : [];

    files['macos/jamf/scope-inputs.json'] = JSON.stringify({
      scope_groups: { computer_groups: scopeIds },
      exclusion_groups: { computer_groups: exclusionIds },
    }, null, 2);

    // Pre/post install scripts — use wizard content if enabled, otherwise stubs
    const preScript = s.macEnablePreInstall && s.macPreInstallScript
      ? s.macPreInstallScript
      : `#!/usr/bin/env bash\n# preinstall — ${s.displayName} macOS pre-install\nset -euo pipefail\n\n# TODO: Add pre-install logic here\n\nexit 0\n`;
    const postScript = s.macEnablePostInstall && s.macPostInstallScript
      ? s.macPostInstallScript
      : `#!/usr/bin/env bash\n# postinstall — ${s.displayName} macOS post-install\nset -euo pipefail\n\n# TODO: Add post-install logic here\n\nexit 0\n`;

    files['macos/src/scripts/preinstall'] = preScript;
    files['macos/src/scripts/postinstall'] = postScript;

    files['macos/src/postinstall.sh'] = `#!/usr/bin/env bash
# =============================================================================
# postinstall.sh — wrapper script referenced by package.yaml
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
bash "$SCRIPT_DIR/scripts/postinstall"
`;

    // ── Installer binary: committed to git (git mode) or placeholder (SMB mode) ──
    if (!s.macSmbEnabled && s.macStagedInstaller?.dataUrl) {
      // User staged a local file — commit it directly to macos/src/Files/
      files[`macos/src/Files/${s.macStagedInstaller.fileName}`] = s.macStagedInstaller.dataUrl;
    } else {
      // SMB mode or file not yet staged — use placeholder to keep the directory
      files['macos/src/Files/.gitkeep'] = `# macOS installer binary staging area.\n# Expected: ${macSourceFile}${macSourceDir ? `\n# Source directory on runner: ${macSourceDir}` : ''}\n`;
    }

    // ── scripts-inputs.json — drives the Terraform script module blocks ────
    if (s.macEnablePreInstall || s.macEnablePostInstall) {
      const scriptsInputs = {};
      if (s.macEnablePreInstall) {
        scriptsInputs.preinstall = {
          enabled: true,
          name: `SPA - ${s.displayName} preinstall`,
          priority: 'Before',
          content: preScript,
        };
      }
      if (s.macEnablePostInstall) {
        scriptsInputs.postinstall = {
          enabled: true,
          name: `SPA - ${s.displayName} postinstall`,
          priority: 'After',
          content: postScript,
        };
      }
      files['macos/jamf/scripts-inputs.json'] = JSON.stringify(scriptsInputs, null, 2);
    }

    if (s.macExtensionAttribute) {
      const appPath = s.macAppPath || '/Applications/TODO.app';
      const versionKey = s.macEaVersionKey || 'CFBundleShortVersionString';
      files['macos/detection/extension-attribute.sh'] = `#!/usr/bin/env bash
# =============================================================================
# extension-attribute.sh — Jamf Extension Attribute
# Returns the installed version of ${s.displayName} for inventory reporting.
# =============================================================================

APP_PATH="${appPath}"
PLIST_KEY="${versionKey}"

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
    }

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

  // ── Wizard state snapshot (for Edit Existing round-trip) ────────────────
  // Strip internal/transient keys and non-serializable objects
  const stateSnapshot = { ...s };
  // Internal tracking keys
  delete stateSnapshot._psadtResult;
  delete stateSnapshot._scriptContent;
  delete stateSnapshot._intuneExportImported;
  delete stateSnapshot._receiptIdManual;
  delete stateSnapshot._editProjectId;
  delete stateSnapshot._editProjectPath;
  delete stateSnapshot._editProjectUrl;
  delete stateSnapshot._editLoadedRef;
  delete stateSnapshot._editProjectTags;
  delete stateSnapshot._localRepoPath;
  delete stateSnapshot._lastPublishResult;
  delete stateSnapshot._psadtActiveTab;
  delete stateSnapshot._v3Conversion;
  delete stateSnapshot._intuneAppId; // ephemeral import source — not persisted
  // intuneAppName is derived by deriveState() — don't persist it
  delete stateSnapshot.intuneAppName;
  // _intuneAppNameOverride IS persisted (user's explicit custom name)
  // Strip _userEdited flags from lifecycle actions (internal tracking only)
  if (stateSnapshot.lifecycle?.phases) {
    for (const phase of Object.values(stateSnapshot.lifecycle.phases)) {
      if (phase.actions) {
        phase.actions = phase.actions.map(a => {
          if (a._userEdited) {
            const { _userEdited, ...rest } = a;
            return rest;
          }
          return a;
        });
      }
    }
  }
  // File objects can't be serialized — preserve filename as string
  if (stateSnapshot.logoFile) {
    stateSnapshot._logoFileName = stateSnapshot.logoFile.name || 'logo.png';
  }
  delete stateSnapshot.logoFile;
  // logoDataUrl (base64 data URL) is kept — it's a plain string
  files['spa-wizard-state.json'] = JSON.stringify(stateSnapshot, null, 2);

  return files;
}


/**
 * Scan script content and lifecycle actions for files referenced from
 * PSADT's DirFiles / DirSupportFiles directories.
 * Returns { files: string[], supportFiles: string[] }.
 */
function extractFileDependencies(s) {
  const filesDeps = new Set();
  const supportFilesDeps = new Set();
  const primaryInstaller = s.installerType === 'msi'
    ? (s.msiFileName || '')
    : (s.exeSourceFilename || '');

  // ── Source 1: Scan raw script for DirFiles / DirSupportFiles refs ──────
  const script = s._psadtResult?.scriptContent || s._scriptContent || '';
  if (script) {
    // v4: $($adtSession.DirFiles)\filename.ext
    for (const m of script.matchAll(/\$\(\$adtSession\.DirFiles\)[\\\/]([^\s'"`,;|}]+\.\w+)/gi)) {
      addDep(filesDeps, m[1], primaryInstaller);
    }
    // v3: $dirFiles\filename.ext
    for (const m of script.matchAll(/\$dirFiles[\\\/]([^\s'"`,;|}]+\.\w+)/gi)) {
      addDep(filesDeps, m[1], primaryInstaller);
    }
    // v4: $($adtSession.DirSupportFiles)\filename.ext
    for (const m of script.matchAll(/\$\(\$adtSession\.DirSupportFiles\)[\\\/]([^\s'"`,;|}]+\.\w+)/gi)) {
      addDep(supportFilesDeps, m[1], null);
    }
    // v3: $dirSupportFiles\filename.ext
    for (const m of script.matchAll(/\$dirSupportFiles[\\\/]([^\s'"`,;|}]+\.\w+)/gi)) {
      addDep(supportFilesDeps, m[1], null);
    }
  }

  // ── Source 2: Scan lifecycle actions for DirFiles/DirSupportFiles paths ─
  const phases = s.lifecycle?.phases || {};
  for (const phaseData of Object.values(phases)) {
    for (const action of (phaseData.actions || [])) {
      if (action.enabled === false) continue;
      const paths = [action.source, action.file].filter(Boolean);
      for (const p of paths) {
        if (/DirSupportFiles/i.test(p)) {
          addDep(supportFilesDeps, p.replace(/.*[\\\/]/, ''), null);
        } else if (/DirFiles/i.test(p)) {
          addDep(filesDeps, p.replace(/.*[\\\/]/, ''), primaryInstaller);
        }
      }
    }
  }

  return {
    files: [...filesDeps].sort(),
    supportFiles: [...supportFilesDeps].sort(),
  };
}

/** Add a cleaned filename to a dependency set, excluding the primary installer. */
function addDep(set, filename, exclude) {
  const clean = filename.replace(/^["']|["']$/g, '').trim();
  if (clean && clean !== exclude) set.add(clean);
}
