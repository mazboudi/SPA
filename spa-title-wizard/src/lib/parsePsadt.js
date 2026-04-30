/**
 * parsePsadt.js
 * Parses PSADT v3 (Deploy-Application.ps1) and v4 (Invoke-AppDeployToolkit.ps1)
 * scripts in the browser. Extracts app metadata and lifecycle actions, returning
 * a partial wizard state object that can be merged into INITIAL_STATE.
 *
 * Detection heuristics:
 *   v3: $appVendor/$appName/$appVersion variables, AppDeployToolkitMain.ps1 dot-source,
 *       deployAppScriptVersion = [version]'3.x.x'
 *   v4: $adtSession = @{ ... } hashtable, Install-ADTDeployment function,
 *       Start-ADTMsiProcess, DeployAppScriptVersion = '4.x.x'
 */

/**
 * Parse a PSADT .ps1 file and return extracted wizard state fields.
 * @param {File} file - The .ps1 File object from a file input
 * @param {'new'|'refactor'} mode - 'refactor' skips phase parsing, returns raw script for passthrough
 * @returns {Promise<Object>} - { psadtVersion, fields, parsedPhases?, scriptContent?, warnings }
 */
export async function parsePsadtFile(file, mode = 'new') {
  const text = await file.text();
  const warnings = [];

  // Detect version
  const version = detectVersion(text);

  let fields = {};
  if (version === 'v4') {
    fields = parseV4(text, warnings);
  } else {
    fields = parseV3(text, warnings);
  }

  // Derive packageId from displayName if we got one
  if (fields.displayName && !fields.packageId) {
    fields.packageId = toKebabCase(fields.displayName);
  }

  // Set platform to windows (PSADT is Windows-only)
  fields.platform = 'windows';

  const result = {
    psadtVersion: version,
    psadtScriptVersion: extractScriptVersion(text, version),
    fileName: file.name,
    fields,
    warnings,
  };

  if (mode === 'refactor') {
    // Refactor mode: return raw script for pipeline passthrough, skip heavy parsing
    result.scriptContent = text;
    // Still extract variable declarations (needed for Intune metadata + pipeline config)
    const varDeclActions = extractVarDeclarations(text);
    if (varDeclActions.length > 0) {
      result.parsedPhases = { variableDeclaration: varDeclActions };
    }
    if (version === 'v3') {
      warnings.push('v3 script detected — Convert-ADTDeployment will be run in the pipeline to convert to v4.');
    }
  } else {
    // New title mode: full phase parsing for lifecycle editor
    result.parsedPhases = version === 'v4'
      ? extractAllPhasesV4(text)
      : extractAllPhasesV3(text);
  }

  return result;
}

// ─── Version Detection ─────────────────────────────────────────────────────

function detectVersion(text) {
  // v4 markers: $adtSession hashtable, ADT cmdlets
  if (/\$adtSession\s*=\s*@\{/i.test(text) || /Install-ADTDeployment/i.test(text)) {
    return 'v4';
  }
  // v3 markers: traditional variable declarations, AppDeployToolkitMain dot-source
  if (/\$appVendor\s*=/i.test(text) && /AppDeployToolkitMain/i.test(text)) {
    return 'v3';
  }
  // Fallback: check script version string
  if (/DeployAppScriptVersion\s*=\s*['"]4\./i.test(text)) return 'v4';
  if (new RegExp("deployAppScriptVersion\\s*=\\s*\\[version\\]['\"]3\\.", 'i').test(text)) return 'v3';
  // Default to v3 if we see $appVendor at all
  if (/\$appVendor\s*=/i.test(text)) return 'v3';
  return 'v3'; // fallback
}

function extractScriptVersion(text, version) {
  if (version === 'v4') {
    const m = text.match(/DeployAppScriptVersion\s*=\s*['"]([\d.]+)['"]/i);
    return m ? m[1] : '';
  }
  // v3: [version]'3.8.3' or [Version]'3.9.3'
  const m = text.match(new RegExp("deployAppScriptVersion\\s*=\\s*\\[version\\]\\s*['\"]([\\d.]+)['\"]", 'i'));
  return m ? m[1] : '';
}

// ─── V3 Parser ─────────────────────────────────────────────────────────────

function parseV3(text, warnings) {
  const f = {};

  // App metadata from variable declarations
  f.publisher = extractV3Var(text, 'appVendor') || '';
  f.displayName = extractV3Var(text, 'appName') || '';
  f.version = extractV3Var(text, 'appVersion') || '';

  const arch = extractV3Var(text, 'appArch');
  if (arch) f.applicableArch = arch.toLowerCase();

  // Deploy mode from param default
  const deployMode = extractParamDefault(text, 'DeployMode');
  if (deployMode) f.deployMode = capitalizeFirst(deployMode);

  // AllowRebootPassThru from param default
  const reboot = extractParamDefault(text, 'AllowRebootPassThru');
  if (reboot && reboot.toLowerCase() === '$true') f.allowRebootPassThru = true;

  // ── Pre-Install phase ──
  const preInstallBlock = extractV3Phase(text, 'Pre-Installation');
  if (preInstallBlock) {
    const closeApps = extractCloseAppsV3(preInstallBlock);
    if (closeApps) f.closeApps = closeApps;

    // Check for disk space check
    if (/CheckDiskSpace/i.test(preInstallBlock)) {
      f._lifecycle_preInstall_checkDiskSpace = true;
    }
    // Check for defer
    const deferMatch = preInstallBlock.match(/-(?:DeferTimes|AllowDefer)\b/i);
    if (deferMatch) {
      const deferTimesMatch = preInstallBlock.match(/-DeferTimes\s+(\d+)/i);
      f._lifecycle_preInstall_allowDefer = deferTimesMatch ? parseInt(deferTimesMatch[1]) : 3;
    }
    // Show progress
    if (/Show-InstallationProgress/i.test(preInstallBlock) && !/^\s*#/m.test(preInstallBlock.match(/.*Show-InstallationProgress.*/)?.[0] || '#')) {
      f._lifecycle_preInstall_showProgress = true;
    }
  }

  // ── Install phase ──
  const installBlock = extractV3Phase(text, 'Installation');
  if (installBlock) {
    const msiInstall = extractMsiInstallV3(installBlock);
    if (msiInstall) {
      f.installerType = 'msi';
      if (msiInstall.file) f.msiFileName = msiInstall.file;
      if (msiInstall.productCode) f.msiProductCode = msiInstall.productCode;
    } else if (/Execute-Process|Copy-Item/i.test(installBlock)) {
      // EXE or file copy install
      const exeInstall = extractExeInstallV3(installBlock);
      if (exeInstall) {
        f.installerType = 'exe';
        if (exeInstall.file) f.exeSourceFilename = exeInstall.file;
        if (exeInstall.args) f.exeInstallArgs = exeInstall.args;
      } else if (/Copy-Item/i.test(installBlock)) {
        f.installerType = 'exe'; // closest match for folder copy
      }
    }
  }

  // ── Post-Install phase ──
  const postInstallBlock = extractV3Phase(text, 'Post-Installation');
  if (postInstallBlock) {
    const regMarker = extractRegistryMarkerV3(postInstallBlock);
    if (regMarker) {
      f.detectionMode = 'registry-marker';
      if (regMarker.keyPath) f.regKeyPath = regMarker.keyPath;
      if (regMarker.version) f.regValue = regMarker.version;
    }
  }

  // ── Uninstall phase ──
  const uninstallBlock = extractV3Phase(text, 'Uninstallation');
  if (uninstallBlock) {
    const msiUn = uninstallBlock.match(/Execute-MSI\s+-Action\s+['"]?Uninstall['"]?\s+-Path\s+['"](.*?)['"]/i);
    if (msiUn) {
      // Check if it's a GUID (product code uninstall)
      const guid = msiUn[1].match(/\{[0-9A-Fa-f-]{36}\}/);
      if (guid) f.msiProductCode = f.msiProductCode || guid[0];
    }
    // Remove-MSIApplications
    const removeMsi = uninstallBlock.match(/Remove-MSIApplications\s+-Name\s+['"](.*?)['"]/i);
    if (removeMsi && !f.displayName) {
      f.displayName = removeMsi[1];
    }
  }

  // ── Post-Uninstall phase ──
  const postUninstallBlock = extractV3Phase(text, 'Post-Uninstallation');
  if (postUninstallBlock) {
    if (/Remove-RegistryKey/i.test(postUninstallBlock) && /Fiserv|InstalledApps/i.test(postUninstallBlock)) {
      f._lifecycle_postUninstall_removeRegistryMarker = true;
    }
  }

  return f;
}

// ─── V4 Parser ─────────────────────────────────────────────────────────────

function parseV4(text, warnings) {
  const f = {};

  // Extract $adtSession hashtable
  const sessionBlock = extractAdtSession(text);
  if (sessionBlock) {
    f.publisher = extractHashtableValue(sessionBlock, 'AppVendor') || '';
    f.displayName = extractHashtableValue(sessionBlock, 'AppName') || '';
    f.version = extractHashtableValue(sessionBlock, 'AppVersion') || '';

    const arch = extractHashtableValue(sessionBlock, 'AppArch');
    if (arch) f.applicableArch = arch.toLowerCase();

    // Processes to close
    const procs = extractArrayValue(sessionBlock, 'AppProcessesToClose');
    if (procs && procs.length > 0) {
      f.closeApps = procs.join(',');
    }
  } else {
    warnings.push('Could not locate $adtSession hashtable block.');
  }

  // ── Install-ADTDeployment function ──
  const installFunc = extractV4Function(text, 'Install-ADTDeployment');
  if (installFunc) {
    // Pre-Install
    const preInstallBlock = extractV4Mark(installFunc, 'Pre-Install');
    if (preInstallBlock) {
      // Show-ADTInstallationWelcome params
      const welcomeMatch = preInstallBlock.match(/Show-ADTInstallationWelcome\b(.*)/i);
      if (welcomeMatch && !/^\s*#/.test(welcomeMatch[0])) {
        // Already have closeApps from adtSession, but check for explicit param
      }
      if (/CheckDiskSpace/i.test(preInstallBlock)) {
        f._lifecycle_preInstall_checkDiskSpace = true;
      }
      const deferMatch = preInstallBlock.match(/DeferTimes\s*=?\s*(\d+)/i);
      if (deferMatch) {
        f._lifecycle_preInstall_allowDefer = parseInt(deferMatch[1]);
      }
      if (/Show-ADTInstallationProgress/i.test(preInstallBlock) &&
          !isCommentedOut(preInstallBlock, 'Show-ADTInstallationProgress')) {
        f._lifecycle_preInstall_showProgress = true;
      }
    }

    // Install
    const installBlock = extractV4Mark(installFunc, 'Install');
    if (installBlock) {
      const msiInstall = extractMsiInstallV4(installBlock);
      if (msiInstall) {
        f.installerType = 'msi';
        if (msiInstall.file) f.msiFileName = msiInstall.file;
        if (msiInstall.args) f._msiArgs = msiInstall.args;
      } else {
        f.installerType = f.installerType || 'exe';
      }
    }

    // Post-Install
    const postInstallBlock = extractV4Mark(installFunc, 'Post-Install');
    if (postInstallBlock) {
      // Check for Set-ADTRegistryKey with Fiserv/InstalledApps pattern
      const regMarker = extractRegistryMarkerV4(postInstallBlock);
      if (regMarker) {
        f.detectionMode = 'registry-marker';
        if (regMarker.keyPath) f.regKeyPath = regMarker.keyPath;
        if (regMarker.version) f.regValue = regMarker.version;
      }
    }
  }

  // ── Uninstall-ADTDeployment function ──
  const uninstallFunc = extractV4Function(text, 'Uninstall-ADTDeployment');
  if (uninstallFunc) {
    const uninstallBlock = extractV4Mark(uninstallFunc, 'Uninstall');
    if (uninstallBlock) {
      // Uninstall-ADTApplication
      const unApp = uninstallBlock.match(/Uninstall-ADTApplication\s+-Name\s+['"](.*?)['"]/i);
      if (unApp) {
        // MSI uninstall by name
        f._uninstallAppName = unApp[1];
      }
    }

    const postUnBlock = extractV4Mark(uninstallFunc, 'Post-Uninstall');
    if (postUnBlock) {
      if (/Remove-ADTRegistryKey/i.test(postUnBlock)) {
        f._lifecycle_postUninstall_removeRegistryMarker = true;
      }
    }
  }

  return f;
}

// ─── Extraction Helpers ────────────────────────────────────────────────────

/** Extract a v3-style variable: [string]$varName = 'value' */
function extractV3Var(text, varName) {
  // Match both [string]$var = 'val' and [String]$var = "val"
  const re = new RegExp(`\\$${varName}\\s*=\\s*['"]([^'"]*?)['"]`, 'im');
  const m = text.match(re);
  return m ? m[1].trim() : null;
}

/** Extract default param value: [string]$ParamName = 'Default' */
function extractParamDefault(text, paramName) {
  const re = new RegExp(`\\$${paramName}\\s*=\\s*['"]?([^'",\\s\\)]+)`, 'im');
  const m = text.match(re);
  return m ? m[1].trim() : null;
}

/** Extract the $adtSession = @{ ... } block */
function extractAdtSession(text) {
  const start = text.indexOf('$adtSession');
  if (start === -1) return null;
  const braceStart = text.indexOf('{', start);
  if (braceStart === -1) return null;

  let depth = 1;
  let i = braceStart + 1;
  while (i < text.length && depth > 0) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') depth--;
    i++;
  }
  return text.substring(braceStart + 1, i - 1);
}

/** Extract a value from a PowerShell hashtable block */
function extractHashtableValue(block, key) {
  const re = new RegExp(`${key}\\s*=\\s*['"]([^'"]*?)['"]`, 'im');
  const m = block.match(re);
  return m ? m[1].trim() : null;
}

/** Extract a PowerShell array value: Key = @('val1', 'val2') or @() */
function extractArrayValue(block, key) {
  const re = new RegExp(`${key}\\s*=\\s*@\\(([^)]*)\\)`, 'im');
  const m = block.match(re);
  if (!m) return [];
  const inner = m[1].trim();
  if (!inner) return [];
  return inner.split(',').map(s => {
    const cleaned = s.trim().replace(/^['"]|['"]$/g, '');
    return cleaned;
  }).filter(Boolean);
}

/** Extract a v3 phase block between phase markers */
function extractV3Phase(text, phaseName) {
  // Phase blocks are delimited by: [string]$installPhase = 'Pre-Installation'
  // and the next phase marker or end of deployment type block.
  // Use regex to find the actual $installPhase assignment, not just any occurrence of the name.
  const escapedName = phaseName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const phaseRe = new RegExp("\\$installPhase\\s*=\\s*'" + escapedName + "'", "i");
  const phaseMatch = text.match(phaseRe);
  if (!phaseMatch) return null;

  const phaseStart = text.indexOf(phaseMatch[0]) + phaseMatch[0].length;

  // Find the next phase marker or end marker
  const afterPhase = text.substring(phaseStart);
  const nextPhaseMatch = afterPhase.match(/\n\s*\[(?:string|String)\]\$installPhase\s*=\s*'([^']+)'/);
  const nextPhasePos = nextPhaseMatch ? afterPhase.indexOf(nextPhaseMatch[0]) : -1;

  // Also check for section markers
  const sectionMatch = afterPhase.match(/\n\s*##\*={10,}/);
  const sectionPos = sectionMatch ? afterPhase.indexOf(sectionMatch[0]) : -1;

  let endPos;
  if (nextPhasePos > 0 && sectionPos > 0) {
    endPos = Math.min(nextPhasePos, sectionPos);
  } else if (nextPhasePos > 0) {
    endPos = nextPhasePos;
  } else if (sectionPos > 0) {
    endPos = sectionPos;
  } else {
    endPos = Math.min(afterPhase.length, 2000); // safety limit
  }

  return afterPhase.substring(0, endPos);
}

/** Extract a v4 function body: function FuncName { ... } */
function extractV4Function(text, funcName) {
  const re = new RegExp(`function\\s+${funcName}\\s*\\{`, 'i');
  const m = text.match(re);
  if (!m) return null;

  const start = text.indexOf(m[0]) + m[0].length;
  let depth = 1;
  let i = start;
  while (i < text.length && depth > 0) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') depth--;
    i++;
  }
  return text.substring(start, i - 1);
}

/** Extract a MARK: block from v4 function body */
function extractV4Mark(funcBody, markName) {
  const markRe = new RegExp(`## MARK: ${markName}\\b`, 'i');
  const markMatch = funcBody.match(markRe);
  if (!markMatch) return null;

  const startPos = funcBody.indexOf(markMatch[0]) + markMatch[0].length;
  const afterMark = funcBody.substring(startPos);

  // Find next MARK or end of function
  const nextMark = afterMark.match(/## MARK:/i);
  const endPos = nextMark ? afterMark.indexOf(nextMark[0]) : afterMark.length;

  return afterMark.substring(0, endPos);
}

/** Extract close apps from v3 Show-InstallationWelcome */
function extractCloseAppsV3(block) {
  // Match active (non-commented) Show-InstallationWelcome with -CloseApps
  const lines = block.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#')) continue;
    const m = trimmed.match(/Show-InstallationWelcome\b.*-CloseApps\s+['"]([^'"]*)['"]/i);
    if (m && m[1]) return m[1];
  }
  return null;
}

/** Extract MSI install info from v3 Execute-MSI call */
function extractMsiInstallV3(block) {
  // Look for active (non-commented) Execute-MSI -Action 'Install'
  const lines = block.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#')) continue;
    // Execute-MSI -Action 'Install' -Path "$dirFiles\file.msi" or -Path "file.msi"
    const m = trimmed.match(/Execute-MSI\s+.*-Action\s+['"]?Install['"]?\s+.*-Path\s+['"](.*?)['"]/i) ||
              trimmed.match(/Execute-MSI\s+.*-Path\s+['"](.*?)['"].*-Action\s+['"]?Install['"]?/i);
    if (m) {
      const fullPath = m[1];
      // Extract just the filename from paths like $dirFiles\file.msi
      const fileName = fullPath.replace(/.*[\\\/]/, '').replace(/^\$\w+\\/, '');
      return {
        file: fileName,
        productCode: extractGuidFromString(fullPath),
      };
    }
  }
  return null;
}

/** Extract EXE install info from v3 Execute-Process call */
function extractExeInstallV3(block) {
  const lines = block.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#')) continue;
    const m = trimmed.match(/Execute-Process\s+.*-Path\s+['"](.*?)['"](?:.*-Parameters\s+['"](.*?)['"])?/i);
    if (m) {
      const fullPath = m[1];
      const fileName = fullPath.replace(/.*[\\\/]/, '');
      return { file: fileName, args: m[2] || '' };
    }
  }
  return null;
}

/** Extract MSI install info from v4 Start-ADTMsiProcess call */
function extractMsiInstallV4(block) {
  const lines = block.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#')) continue;
    // Start-ADTMsiProcess -Action 'Install' -FilePath 'file.msi'
    const m = trimmed.match(/Start-ADTMsiProcess\b.*-FilePath\s+['"](.*?)['"]/i);
    if (m) {
      const fullPath = m[1];
      const fileName = fullPath.replace(/.*[\\\/]/, '');
      // Extract -ArgumentList if present
      const argMatch = trimmed.match(/-ArgumentList\s+['"](.*?)['"]/i);
      return { file: fileName, args: argMatch ? argMatch[1] : '' };
    }
  }
  return null;
}

/** Extract Fiserv registry marker from v3 post-install */
function extractRegistryMarkerV3(block) {
  // Look for Set-RegistryKey targeting Fiserv\Applications or Fiserv\InstalledApps
  const lines = block.split('\n');
  let keyPath = '';
  let version = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#')) continue;

    const keyMatch = trimmed.match(/Set-RegistryKey\s+.*-Key\s+['"](.*?Fiserv[^'"]*)['"]/i);
    if (keyMatch) {
      // Normalize key path: remove HKEY_LOCAL_MACHINE prefix, convert to short form
      keyPath = keyMatch[1]
        .replace(/^HKEY_LOCAL_MACHINE\\/, '')
        .replace(/^HKLM:\\?/, '')
        .replace(/^SOFTWARE\\/, 'SOFTWARE\\');

      // Check if this same line or nearby lines have a Version value
      const versionMatch = trimmed.match(/-Name\s+['"]Version['"]\s+.*-Value\s+['"](.*?)['"]/i);
      if (versionMatch) version = versionMatch[1];
    }
  }

  if (keyPath) return { keyPath, version };
  return null;
}

/** Extract Fiserv registry marker from v4 post-install */
function extractRegistryMarkerV4(block) {
  const lines = block.split('\n');
  let keyPath = '';
  let version = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#')) continue;

    // Set-ADTRegistryKey -LiteralPath 'HKLM:\...' -Name 'Version' -Value ...
    const keyMatch = trimmed.match(/Set-ADTRegistryKey\s+.*-LiteralPath\s+['"]([^'"]*(?:Fiserv|InstalledApps)[^'"]*)['"]/i);
    if (keyMatch) {
      keyPath = keyMatch[1]
        .replace(/^HKLM:\\?/, '')
        .replace(/^HKEY_LOCAL_MACHINE\\/, '')
        .replace(/^SOFTWARE\\/, 'SOFTWARE\\');

      const versionMatch = trimmed.match(/-Name\s+['"]Version['"]\s+.*-Value\s+['"$]*(.*?)['"]/i);
      if (versionMatch) {
        version = versionMatch[1].replace(/^\$/, '');
      }
    }
  }

  if (keyPath) return { keyPath, version };
  return null;
}

/** Check if a cmdlet call is commented out in a block */
function isCommentedOut(block, cmdletName) {
  const lines = block.split('\n');
  for (const line of lines) {
    if (line.includes(cmdletName)) {
      return line.trim().startsWith('#');
    }
  }
  return false;
}

/** Extract a GUID from a string */
function extractGuidFromString(str) {
  const m = str.match(/\{[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}\}/);
  return m ? m[0] : '';
}

/** Convert display name to kebab-case package ID */
function toKebabCase(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function capitalizeFirst(str) {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}
// ─── Phase Action Extraction ───────────────────────────────────────────────

/** Scan a script block for all recognizable PowerShell commands and return action objects. */
function extractBlockActions(block) {
  if (!block) return [];
  const actions = [];
  const lines = block.split('\n');

  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith('#') || t.startsWith('##') || t.startsWith('[string]') || t.startsWith('[String]') || t.startsWith('[int') || t.startsWith('[Int')) continue;
    if (/^\s*If\s*\(\$useDefaultMsi/i.test(t)) continue;
    if (/^\$ExecuteDefaultMSISplat/i.test(t)) continue;
    if (/^Execute-MSI\s+@ExecuteDefaultMSISplat/i.test(t)) continue;
    if (/^\}$/.test(t) || /^\{$/.test(t) || /^try\s*\{/i.test(t) || /^catch\s*\{/i.test(t) || /^\}\s*$/.test(t)) continue;
    if (/^\[hashtable\]/i.test(t)) continue;
    if (t.length < 3) continue;

    let matched = false;

    // Execute-MSI
    const msiMatch = t.match(/Execute-MSI\s+.*-Action\s+['"]?(\w+)['"]?/i);
    if (msiMatch) {
      const action = msiMatch[1];
      const pathMatch = t.match(/-Path\s+['"]([^'"]+)['"]/i);
      const paramsMatch = t.match(/-Parameters\s+['"]([^'"]+)['"]/i);
      const path = pathMatch ? pathMatch[1].replace(/.*[\\]/, '').replace(/^\$\w+\\/, '') : '';
      actions.push({ type: `msi_${action.toLowerCase()}`, desc: `MSI ${action}: ${path || 'default'}`, file: path, args: paramsMatch?.[1] || '', raw: t });
      matched = true;
    }

    // Start-ADTMsiProcess (v4)
    if (!matched) {
      const adtMsiMatch = t.match(/Start-ADTMsiProcess\b.*-FilePath\s+['"]([^'"]+)['"]/i);
      if (adtMsiMatch) {
        const actionMatch = t.match(/-Action\s+['"]?(\w+)['"]?/i);
        const argMatch = t.match(/-ArgumentList\s+['"]([^'"]+)['"]/i);
        const fname = adtMsiMatch[1].replace(/.*[\\]/, '');
        actions.push({ type: `msi_${(actionMatch?.[1] || 'install').toLowerCase()}`, desc: `MSI ${actionMatch?.[1] || 'Install'}: ${fname}`, file: fname, args: argMatch?.[1] || '', raw: t });
        matched = true;
      }
    }

    // Uninstall-ADTApplication (v4)
    if (!matched) {
      const unAppMatch = t.match(/Uninstall-ADTApplication\s+-Name\s+['"]([^'"]+)['"]/i);
      if (unAppMatch) {
        actions.push({ type: 'msi_uninstall', desc: `Uninstall by name: ${unAppMatch[1]}`, appName: unAppMatch[1], raw: t });
        matched = true;
      }
    }

    // Remove-MSIApplications (v3)
    if (!matched) {
      const rmMsiMatch = t.match(/Remove-MSIApplications\s+-Name\s+['"]([^'"]+)['"]/i);
      if (rmMsiMatch) {
        actions.push({ type: 'msi_uninstall', desc: `Remove MSI: ${rmMsiMatch[1]}`, appName: rmMsiMatch[1], raw: t });
        matched = true;
      }
    }

    // Execute-Process / Start-ADTProcess
    if (!matched) {
      const procMatch = t.match(/(?:Execute-Process|Start-ADTProcess(?:AsUser)?)\s+.*-(?:Path|FilePath)\s+['"]([^'"]+)['"]/i);
      if (procMatch) {
        const paramMatch = t.match(/-(?:Parameters|ArgumentList)\s+['"]([^'"]+)['"]/i);
        actions.push({ type: 'execute_process', desc: `Run: ${procMatch[1].replace(/.*[\\]/, '')}`, file: procMatch[1], args: paramMatch?.[1] || '', raw: t });
        matched = true;
      }
    }

    // Native PowerShell: Start-Process -FilePath ...
    if (!matched) {
      const startProcMatch = t.match(/Start-Process\s+.*-FilePath\s+['"]?([^\s'"}{]+)/i);
      if (startProcMatch) {
        const spArgMatch = t.match(/-ArgumentList\s+['"]([^'"]+)['"]/i);
        actions.push({ type: 'execute_process', desc: `Run (native): ${startProcMatch[1].replace(/.*[\\]/, '')}`, file: startProcMatch[1], args: spArgMatch?.[1] || '', raw: t });
        matched = true;
      }
    }

    // Copy-Item / Copy-ADTFile
    if (!matched) {
      const copyMatch = t.match(/(?:Copy-Item|Copy-ADTFile)\s+.*-(?:Path|Source)\s+['"]([^'"]+)['"].*-Destination\s+['"]([^'"]+)['"]/i);
      if (copyMatch) {
        actions.push({ type: 'file_copy', desc: `Copy: ${copyMatch[1].replace(/.*[\\]/, '')} \u2192 ${copyMatch[2]}`, source: copyMatch[1], dest: copyMatch[2], raw: t });
        matched = true;
      }
    }

    // Piped removal: Get-ChildItem '...' | Remove-Item
    if (!matched) {
      const pipedRemoveMatch = t.match(/Get-ChildItem\s+['"]([^'"]+)['"]\s*\|\s*Remove-Item/i);
      if (pipedRemoveMatch) {
        actions.push({ type: 'file_remove', desc: `Remove (piped): ${pipedRemoveMatch[1]}`, path: pipedRemoveMatch[1], raw: t });
        matched = true;
      }
    }

    // Remove-Item / Remove-File / Remove-ADTFolder (with -Path flag)
    if (!matched) {
      const removeMatch = t.match(/(?:Remove-Item|Remove-File|Remove-ADTFolder)\s+.*-(?:Path|LiteralPath)\s+['"]([^'"]+)['"]/i);
      if (removeMatch) {
        actions.push({ type: 'file_remove', desc: `Remove: ${removeMatch[1]}`, path: removeMatch[1], raw: t });
        matched = true;
      }
    }

    // Set-RegistryKey / Set-ADTRegistryKey
    if (!matched) {
      const regSetMatch = t.match(/(?:Set-RegistryKey|Set-ADTRegistryKey)\s+.*-(?:Key|LiteralPath)\s+['"]([^'"]+)['"].*-Name\s+['"]([^'"]+)['"].*-Value\s+['"]?([^'"\s]+)/i);
      if (regSetMatch) {
        actions.push({ type: 'registry_set', desc: `Registry: ${regSetMatch[2]} = ${regSetMatch[3]}`, key: regSetMatch[1], name: regSetMatch[2], value: regSetMatch[3], raw: t });
        matched = true;
      }
    }

    // Native PowerShell: Set-ItemProperty -Path ... -Name ... -Value ...
    if (!matched) {
      const setIPMatch = t.match(/Set-ItemProperty\s+.*-Path\s+['"]?([^\s'"}{]+)['"]?\s+.*-Name\s+['"]([^'"]+)['"]\s+.*-Value\s+['"]?([^\s'"}{]+)/i);
      if (setIPMatch) {
        actions.push({ type: 'registry_set', desc: `Registry (native): ${setIPMatch[2]} = ${setIPMatch[3]}`, key: setIPMatch[1], name: setIPMatch[2], value: setIPMatch[3], raw: t });
        matched = true;
      }
    }

    // Native PowerShell: New-ItemProperty -Path ... -Name ... -Value ...
    if (!matched) {
      const newIPMatch = t.match(/New-ItemProperty\s+.*-Path\s+['"]?([^\s'"}{]+)['"]?\s+.*-Name\s+['"]([^'"]+)['"]\s+.*-Value\s+['"]?([^\s'"}{]+)/i);
      if (newIPMatch) {
        actions.push({ type: 'registry_set', desc: `Registry (new): ${newIPMatch[2]} = ${newIPMatch[3]}`, key: newIPMatch[1], name: newIPMatch[2], value: newIPMatch[3], raw: t });
        matched = true;
      }
    }

    // Remove-RegistryKey / Remove-ADTRegistryKey (with optional -Name for value removal)
    if (!matched) {
      const regRemoveMatch = t.match(/(?:Remove-RegistryKey|Remove-ADTRegistryKey)\s+.*-(?:Key|LiteralPath)\s+['"]([^'"]+)['"]/i);
      if (regRemoveMatch) {
        const regNameMatch = t.match(/-Name\s+['"]([^'"]+)['"]/i);
        const nameVal = regNameMatch ? regNameMatch[1] : '';
        const descSuffix = nameVal ? ` \u2192 ${nameVal}` : '';
        actions.push({ type: 'registry_remove', desc: `Remove reg: ${regRemoveMatch[1]}${descSuffix}`, key: regRemoveMatch[1], name: nameVal, raw: t });
        matched = true;
      }
    }

    // Native PowerShell: Remove-ItemProperty -Path ... -Name ...
    if (!matched) {
      const removeIPMatch = t.match(/Remove-ItemProperty\s+.*-Path\s+['"]?([^\s'"}{]+)['"]?\s+.*-Name\s+['"]?([^\s'"}{]+)/i);
      if (removeIPMatch) {
        actions.push({ type: 'registry_remove', desc: `Remove reg value (native): ${removeIPMatch[2]}`, key: removeIPMatch[1], name: removeIPMatch[2], raw: t });
        matched = true;
      }
    }

    // New-ADTFolder
    if (!matched) {
      const mkdirMatch = t.match(/New-ADTFolder\s+.*-LiteralPath\s+['"]([^'"]+)['"]/i);
      if (mkdirMatch) {
        actions.push({ type: 'create_folder', desc: `Create: ${mkdirMatch[1]}`, path: mkdirMatch[1], raw: t });
        matched = true;
      }
    }

    // SetEnvironmentVariable
    if (!matched) {
      const envMatch = t.match(/SetEnvironmentVariable\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]/i);
      if (envMatch) {
        actions.push({ type: 'env_variable', desc: `Env: ${envMatch[1]} = ${envMatch[2]}`, name: envMatch[1], value: envMatch[2], raw: t });
        matched = true;
      }
    }

    // Show-InstallationWelcome / Show-ADTInstallationWelcome
    if (!matched) {
      const welcomeMatch = t.match(/Show-(?:ADT)?InstallationWelcome\b(.+)/i);
      if (welcomeMatch) {
        const closeMatch = welcomeMatch[1].match(/-Close(?:Apps|Processes)\s+['"]?([^'"\s-]+)/i);
        actions.push({ type: 'show_welcome', desc: `Welcome dialog${closeMatch ? ` (close: ${closeMatch[1]})` : ''}`, closeApps: closeMatch?.[1] || '', raw: t });
        matched = true;
      }
    }

    // Show-InstallationProgress / Show-ADTInstallationProgress
    if (!matched && /Show-(?:ADT)?InstallationProgress/i.test(t)) {
      actions.push({ type: 'show_progress', desc: 'Show progress dialog', raw: t });
      matched = true;
    }

    // ForEach-Object with Execute-MSI (multi-GUID uninstall pattern)
    // Matches both: ForEach-Object { Execute-MSI ... } and | ForEach-Object { Execute-MSI ... }
    if (!matched) {
      const foreachMsi = t.match(/\|?\s*ForEach-Object\s*\{\s*Execute-MSI\s+-Action\s+['"]?(\w+)['"]?/i);
      if (foreachMsi) {
        actions.push({ type: `msi_${foreachMsi[1].toLowerCase()}_batch`, desc: `Batch MSI ${foreachMsi[1]} (multiple GUIDs)`, raw: t });
        matched = true;
      }
    }

    // Start-Sleep
    if (!matched) {
      const sleepMatch = t.match(/Start-Sleep\s+-Seconds\s+(\d+)/i);
      if (sleepMatch) {
        actions.push({ type: 'sleep', desc: `Wait ${sleepMatch[1]}s`, seconds: parseInt(sleepMatch[1]), raw: t });
        matched = true;
      }
    }

    // Write-Log (informational, skip silently)
    if (!matched && /^Write-Log\b/i.test(t)) {
      matched = true;
    }

    // ── Unmatched line — surface as custom_script ──────────────────────
    if (!matched) {
      // Skip trivial lines: control flow, variable assignments, braces
      if (/^(?:if|else|elseif|switch|foreach|for|while|do|return|break|continue|exit)\b/i.test(t)) continue;
      if (/^\$\w+\s*=/i.test(t)) continue;
      if (/^\}.*\{/.test(t)) continue;
      if (/^\)\s*$/.test(t)) continue;
      if (/^\|\s*\w+/i.test(t)) continue;
      if (/^[)\]}]+\s*$/i.test(t)) continue;
      if (/^Select\b|^Sort\b|^Where\b|^ForEach\b/i.test(t)) continue;
      // Skip phase label lines (e.g. 'Pre-Installation')
      if (/^'[A-Za-z-]+'\s*$/.test(t)) continue;
      // Skip bare property names from multi-line Select/Sort pipelines
      if (/^\w+,?\s*$/.test(t)) continue;
      // Skip pipeline continuation lines starting with $
      if (/^\$\w+\s*\|/i.test(t)) continue;
      // Skip bare property/variable refs ending with pipe (multi-line pipeline)
      if (/^\w+\s*\|?\s*$/.test(t)) continue;
      // Skip bare GUID lines from multi-line batch uninstall patterns
      // e.g. "{203D4C43-...}", <# comment #>`
      if (/^"\{[0-9A-Fa-f-]{36}\}"/.test(t)) continue;

      // Meaningful unmatched command
      actions.push({ type: 'custom_script', desc: `Unmatched: ${t.substring(0, 60)}${t.length > 60 ? '\u2026' : ''}`, code: t, note: 'Auto-detected \u2014 could not be mapped to a known action type', raw: t });
    }
  }

  return actions;
}

/** Extract GUIDs from a phase block (used for batch uninstall detection) */
function extractGuidsFromBlock(block) {
  if (!block) return [];
  const guids = [];
  const re = /\{([0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12})\}/g;
  let m;
  while ((m = re.exec(block)) !== null) {
    guids.push(`{${m[1]}}`);
  }
  return [...new Set(guids)];
}

/** Extract all phase actions from a v3 script */
function extractAllPhasesV3(text) {
  const phases = {};

  // ── Variable Declaration phase ──────────────────────────────────────
  const varDeclActions = extractVarDeclarations(text);
  if (varDeclActions.length > 0) phases['variableDeclaration'] = varDeclActions;

  const phaseNames = {
    'Pre-Installation': 'preInstall',
    'Installation': 'install',
    'Post-Installation': 'postInstall',
    'Pre-Uninstallation': 'preUninstall',
    'Uninstallation': 'uninstall',
    'Post-Uninstallation': 'postUninstall',
    'Pre-Repair': 'preRepair',
    'Repair': 'repair',
    'Post-Repair': 'postRepair',
  };
  for (const [psName, key] of Object.entries(phaseNames)) {
    const block = extractV3Phase(text, psName);
    const actions = extractBlockActions(block);
    // Enrich pre-install with GUIDs for batch uninstall
    if (key === 'preInstall' && block) {
      const guids = extractGuidsFromBlock(block);
      if (guids.length > 0) {
        const existing = actions.find(a => a.type === 'msi_uninstall_batch');
        if (existing) {
          existing.guids = guids;
          existing.desc = `Batch MSI Uninstall (${guids.length} old versions)`;
        } else if (guids.length > 1) {
          actions.unshift({ type: 'msi_uninstall_batch', desc: `Remove ${guids.length} old versions by GUID`, guids });
        }
      }
    }
    if (actions.length > 0) phases[key] = actions;
  }
  return phases;
}

/**
 * Extract app variable declarations from the VARIABLE DECLARATION block.
 * Captures [string]$appVendor, $appName, $appVersion, etc.
 */
function extractVarDeclarations(text) {
  // Find the VARIABLE DECLARATION block
  const startMarker = text.indexOf('VARIABLE DECLARATION');
  if (startMarker === -1) return [];

  // End at the DoNotModify region or the first $installPhase
  const afterStart = text.substring(startMarker);
  const endMarkers = [
    afterStart.indexOf('#region DoNotModify'),
    afterStart.indexOf('Do not modify section below'),
    afterStart.indexOf("$installPhase"),
  ].filter(i => i > 0);
  const endPos = endMarkers.length > 0 ? Math.min(...endMarkers) : Math.min(afterStart.length, 1500);

  const block = afterStart.substring(0, endPos);
  const actions = [];
  const lines = block.split('\n');

  for (const line of lines) {
    const t = line.trim();
    // Match: [string]$varName = 'value' or [string]$varName = "value"
    const m = t.match(/^\[(?:string|String)\]\$(\w+)\s*=\s*['"](.*?)['"]$/);
    if (m) {
      const varName = m[1];
      const varValue = m[2];
      // Skip empty values and boilerplate vars
      if (!varValue && !['installName', 'installTitle'].includes(varName)) continue;
      actions.push({
        type: 'custom_variable',
        desc: `$${varName} = '${varValue}'`,
        name: `$${varName}`,
        value: varValue,
        enabled: true,
        raw: t,
      });
    }
  }

  return actions;
}

/** Extract all phase actions from a v4 script */
function extractAllPhasesV4(text) {
  const phases = {};
  const funcMap = {
    'Install-ADTDeployment': { 'Pre-Install': 'preInstall', 'Install': 'install', 'Post-Install': 'postInstall' },
    'Uninstall-ADTDeployment': { 'Pre-Uninstall': 'preUninstall', 'Uninstall': 'uninstall', 'Post-Uninstall': 'postUninstall' },
    'Repair-ADTDeployment': { 'Pre-Repair': 'preRepair', 'Repair': 'repair', 'Post-Repair': 'postRepair' },
  };
  for (const [funcName, marks] of Object.entries(funcMap)) {
    const funcBody = extractV4Function(text, funcName);
    if (!funcBody) continue;
    for (const [markName, key] of Object.entries(marks)) {
      const block = extractV4Mark(funcBody, markName);
      const actions = extractBlockActions(block);
      if (actions.length > 0) phases[key] = actions;
    }
  }
  return phases;
}

/**
 * Convert the raw parsed fields (including _lifecycle_ prefixed keys) into
 * a clean wizard state update object with proper lifecycle nesting.
 */
export function toWizardState(parsed) {
  const { fields } = parsed;
  const state = {};
  const lifecycle = {};

  for (const [key, value] of Object.entries(fields)) {
    if (key.startsWith('_lifecycle_')) {
      // e.g. _lifecycle_preInstall_checkDiskSpace → lifecycle.preInstall.checkDiskSpace
      const parts = key.replace('_lifecycle_', '').split('_');
      const phase = parts[0];
      const field = parts.slice(1).join('_');
      // camelCase the field parts
      const camelField = parts.slice(1).map((p, i) => i === 0 ? p : p.charAt(0).toUpperCase() + p.slice(1)).join('');
      if (!lifecycle[phase]) lifecycle[phase] = {};
      lifecycle[phase][camelField] = value;
    } else if (key.startsWith('_')) {
      // Internal fields — skip from wizard state
      continue;
    } else {
      state[key] = value;
    }
  }

  // Merge lifecycle into state
  if (Object.keys(lifecycle).length > 0) {
    state._lifecycleOverrides = lifecycle;
  }

  return state;
}
