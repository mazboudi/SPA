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
 *
 * Command reference: src/config/commands.json + src/config/parameters.json
 */

/**
 * Parse a PSADT .ps1 file and return extracted wizard state fields.
 * @param {File} file - The .ps1 File object from a file input
 * @param {'new'|'refactor'|'refactor-convert'} mode
 *   'refactor'         — metadata + variables only, raw script for passthrough
 *   'refactor-convert' — full phase parsing + raw script for diff preview/archive
 *   'new'              — full phase parsing (no raw script)
 * @returns {Promise<Object>} - { psadtVersion, fields, parsedPhases?, scriptContent?, warnings }
 */
export async function parsePsadtFile(file, mode = 'new') {
  let text = await file.text();
  // Strip UTF-8/UTF-16 BOM and normalize Windows CRLF → LF
  text = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
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
    // Refactor passthrough: return raw script, extract variables only
    result.scriptContent = text;
    const varDeclActions = version === 'v4'
      ? extractVarDeclarationsV4(text)
      : extractVarDeclarations(text);
    if (varDeclActions.length > 0) {
      result.parsedPhases = { variableDeclaration: varDeclActions };
    }
    if (version === 'v3') {
      warnings.push('v3 script detected — Convert-ADTDeployment will be run in the pipeline to convert to v4.');
    }
  } else if (mode === 'refactor-convert') {
    // Refactor conversion: full phase parsing + keep raw script for diff/archive
    result.scriptContent = text;
    result.parsedPhases = version === 'v4'
      ? extractAllPhasesV4(text)
      : extractAllPhasesV3(text);
    if (version === 'v3') {
      warnings.push('v3 script detected — actions have been extracted and converted to v4 action types. The pipeline will generate the v4 .ps1 from lifecycle.yaml.');
    } else if (version === 'v4') {
      // Detect 4.0 vs 4.1 sub-version for upgrade warnings
      const has41Markers = /AppProcessesToClose\s*=/i.test(text) || /RequireAdmin\s*=\s*\$true/i.test(text);
      const scriptVer = extractScriptVersion(text, 'v4');
      const is40 = !has41Markers || (scriptVer && /^4\.0/.test(scriptVer));
      if (is40) {
        warnings.push('v4.0 script detected — converting to v4.1 structure. Key 4.1 changes: DeployMode defaults to "Auto", AppProcessesToClose and RequireAdmin are now set in $adtSession.');
        if (!/AppProcessesToClose\s*=/i.test(text)) {
          warnings.push('AppProcessesToClose was not found in $adtSession — the wizard will populate it from Show-ADTInstallationWelcome -CloseApps if present.');
        }
        if (!/RequireAdmin\s*=\s*\$true/i.test(text)) {
          warnings.push('RequireAdmin was not found in $adtSession — the wizard will add RequireAdmin = $true to the generated script (standard for system-context deployments).');
        }
      }
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

  // Deploy mode: ignore the legacy script default (v3 templates hardcode 'Interactive')
  // The wizard defaults to 'Silent' which is correct for Intune deployments.
  // const deployMode = extractParamDefault(text, 'DeployMode');
  // if (deployMode) f.deployMode = capitalizeFirst(deployMode);

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
        // Look for EXE installer via Start-ADTProcess / Start-ADTProcessAsUser
        const exeInstall = extractExeInstallV4(installBlock);
        if (exeInstall) {
          f.installerType = 'exe';
          if (exeInstall.file) f.exeSourceFilename = exeInstall.file;
          if (exeInstall.args) f.exeInstallArgs = exeInstall.args;
        } else {
          f.installerType = f.installerType || 'exe';
        }
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
      // Uninstall-ADTApplication (MSI uninstall by name)
      const unApp = uninstallBlock.match(/Uninstall-ADTApplication\s+-Name\s+['"](.*?)['"]/i);
      if (unApp) {
        f._uninstallAppName = unApp[1];
      }
      // EXE uninstall via Start-ADTProcess
      if (!unApp) {
        const exeUn = extractExeInstallV4(uninstallBlock);
        if (exeUn) {
          if (exeUn.fullPath) f.exeUninstallPath = exeUn.fullPath;
          if (exeUn.args) f.exeUninstallArgs = exeUn.args;
        }
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
    endPos = Math.min(afterPhase.length, 5000); // safety limit
  }

  let block = afterPhase.substring(0, endPos);

  const lines = block.split(/\r?\n/);
  let depth = 0;
  let cleanLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();

    // Check for the end of the outer block if we hit a deploymentType conditional line at depth 0
    if (depth === 0 && /^(?:if|elseif|else)\b/i.test(t) && /deploymentType/i.test(t)) {
      break;
    }

    // Update brace depth
    let tempDepth = depth;
    let foundNegative = false;
    for (let charIdx = 0; charIdx < line.length; charIdx++) {
      const ch = line[charIdx];
      if (ch === '{') {
        tempDepth++;
      } else if (ch === '}') {
        tempDepth--;
        if (tempDepth < 0) {
          foundNegative = true;
          break;
        }
      }
    }

    if (foundNegative) {
      // This line has a closing brace that closes the outer block scope.
      // We stop here to prevent stripping inner custom closing braces.
      break;
    }

    depth = tempDepth;
    cleanLines.push(line);
  }

  // Trim trailing empty lines from cleanLines
  while (cleanLines.length > 0 && !cleanLines[cleanLines.length - 1].trim()) {
    cleanLines.pop();
  }

  return cleanLines.join('\n');
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
  // Use a prefix match so "Post-Uninstall" also matches "Post-Uninstallation"
  const escapedMark = markName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const markRe = new RegExp(`## MARK: ${escapedMark}(?:\\w+)?\\b`, 'i');
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
      const argVal = extractPsParamValue(trimmed, 'ArgumentList');
      return { file: fileName, args: argVal || '' };
    }
  }
  return null;
}

/** Extract EXE install info from v4 Start-ADTProcess / Start-ADTProcessAsUser call */
function extractExeInstallV4(block) {
  const lines = block.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#')) continue;
    // Start-ADTProcess -FilePath "path\setup.exe" -ArgumentList '/S'
    const m = trimmed.match(/Start-ADTProcess(?:AsUser)?\s+.*-FilePath\s+['"](.*?)['"]/i);
    if (m) {
      const fullPath = m[1];
      // Strip PS variable expressions like $($adtSession.DirFiles)\ or $dirFiles\
      const fileName = fullPath
        .replace(/\$\([^)]+\)[\\\/]?/g, '')
        .replace(/\$\w+[\\\/]/g, '')
        .replace(/.*[\\\/]/, '');
      const argVal = extractPsParamValue(trimmed, 'ArgumentList');
      return { file: fileName, args: argVal || '', fullPath };
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

/**
 * Extract a PowerShell parameter value from a command line.
 * Handles both quoted strings ('val' / "val") and bare variable
 * expressions ($var, $($obj.Prop)\path, etc.).
 *
 * Quote matching is aware of outer vs inner quotes:
 * -Param 'value with "inner" quotes' → correctly captures full value
 */
function extractPsParamValue(line, paramName) {
  // Try single-quoted first: -ParamName 'value' (may contain " inside)
  const singleRe = new RegExp(`-${paramName}\\s+'([^']*)'`, 'i');
  const sq = line.match(singleRe);
  if (sq) return sq[1];
  // Try double-quoted: -ParamName "value" (may contain ' inside)
  const doubleRe = new RegExp(`-${paramName}\\s+"([^"]*)"`, 'i');
  const dq = line.match(doubleRe);
  if (dq) return dq[1];
  // Try unquoted variable: -ParamName $varName or -ParamName $($expr)\path
  const unquotedRe = new RegExp(`-${paramName}\\s+(\\$(?:\\([^)]+\\)|[\\w.]+)(?:[\\\\/][^\\s'",;|}]+)*)`, 'i');
  const um = line.match(unquotedRe);
  if (um) return um[1];
  // Try unquoted bare word: -ParamName SomeWord (no quotes, no $, ends at whitespace/end)
  const bareRe = new RegExp(`-${paramName}\\s+([A-Za-z][A-Za-z0-9_]*)(?=[\\s,;|]|$)`, 'i');
  const bw = line.match(bareRe);
  if (bw) return bw[1];
  return null;
}

/**
 * Strip common PS path-variable prefixes like $dirFiles\, $dirSupportFiles\, $PSScriptRoot\
 * so the generator can re-add the correct prefix without doubling.
 * E.g. "$dirFiles\setup.msi" → "setup.msi"
 */
function stripDirPrefix(filepath) {
  if (!filepath) return filepath;
  return filepath.replace(/^\$(?:dirFiles|dirSupportFiles|PSScriptRoot)[\\/]/, '');
}

// ─── Brace-balanced block extractor ────────────────────────────────────────

/**
 * Keywords that open a brace-balanced control-flow block in PowerShell.
 * Split into two sets:
 *   TRY_OPENERS  — error-handling constructs → always raw_ps (Catch/Finally must not be dropped)
 *   FLOW_OPENERS — regular flow control → parse interior if it contains known ADT cmdlets
 */
const TRY_OPENERS  = /^(?:try)\b/i;
const FLOW_OPENERS = /^(?:if\s*\(|elseif\s*\(|else\b|foreach\s*\(|for\s*\(|while\s*\(|do\b|switch\s*\()/i;
// Combined — used for the first-pass check
const BLOCK_OPENERS = /^(?:try\b|if\s*\(|elseif\s*\(|else\b|foreach\s*\(|for\s*\(|while\s*\(|do\b|switch\s*\()/i;
// Nested helper-function definitions inside a phase block (e.g. function Get-EMEA {)
// These must be extracted as a complete brace-balanced unit so the closing } is not orphaned.
const FUNCTION_OPENER = /^function\s+\S+.*\{\s*$/i;

/**
 * Regex matching a recognizable PSADT/ADT cmdlet inside a block.
 * Used to decide: parse interior individually vs preserve as raw_ps.
 */
const ADT_CMDLET_RE = /(?:Start-ADTMsiProcess|Start-ADTProcessAsUser|Start-ADTProcess|Execute-MSI|Execute-Process|Set-ADTRegistryKey|Set-RegistryKey|Remove-ADTRegistryKey|Remove-RegistryKey|Copy-ADTFile|Remove-ADTFolder|New-ADTFolder|Uninstall-ADTApplication|Show-ADTInstallationWelcome|Show-ADTInstallationProgress|Show-ADTInstallationPrompt|Show-InstallationWelcome|Show-InstallationProgress|Show-InstallationPrompt|Close-ADTInstallation|Copy-Item|Remove-Item|Start-Process|Start-Sleep|Stop-Process|Write-ADTLogEntry)/i;

/**
 * Extract a brace-balanced block starting at startIdx.
 * Stops as soon as depth returns to 0 after the first '{' is seen.
 * Returns { blockText, endIndex }.
 */
function extractBraceBlock(lines, startIdx) {
  let depth = 0;
  let blockLines = [];
  let started = false;

  for (let i = startIdx; i < lines.length; i++) {
    const raw = lines[i];
    const t = raw.trim();

    for (const ch of t) {
      if (ch === '{') { depth++; started = true; }
      if (ch === '}') depth--;
    }

    blockLines.push(raw);

    if (started && depth === 0) {
      return { blockText: blockLines.join('\n'), endIndex: i };
    }
  }

  return { blockText: blockLines.join('\n'), endIndex: lines.length - 1 };
}

/**
 * Extract a complete Try { } Catch { } Finally { } sequence as one unit.
 * PowerShell requires Catch/Finally to immediately follow the Try body,
 * so we keep consuming brace-balanced blocks as long as the NEXT non-blank
 * line starts with 'catch' or 'finally'.
 * Returns { blockText, endIndex }.
 */
function extractTryCatchBlock(lines, startIdx) {
  let allLines = [];
  let endIdx = startIdx;

  // Extract the Try body
  const tryResult = extractBraceBlock(lines, startIdx);
  allLines.push(...tryResult.blockText.split('\n'));
  endIdx = tryResult.endIndex;

  // Keep consuming Catch / Finally clauses
  while (endIdx + 1 < lines.length) {
    // Peek ahead — skip blank lines to find the next keyword
    let peekIdx = endIdx + 1;
    while (peekIdx < lines.length && !lines[peekIdx].trim()) peekIdx++;

    const peek = (lines[peekIdx] || '').trim();
    if (/^(?:catch|finally)\b/i.test(peek)) {
      const clauseResult = extractBraceBlock(lines, peekIdx);
      // Add any blank lines between
      for (let b = endIdx + 1; b <= peekIdx - 1; b++) allLines.push(lines[b]);
      allLines.push(...clauseResult.blockText.split('\n'));
      endIdx = clauseResult.endIndex;
    } else {
      break;
    }
  }

  return { blockText: allLines.join('\n'), endIndex: endIdx };
}


/** Modernize legacy PSADT v3 cmdlets to standard v4 cmdlets inside custom blocks. */
function modernizeLegacyScriptParts(scriptText) {
  if (!scriptText) return '';
  return scriptText
    // ── Core deployment commands ─────────────────────────────────────────
    .replace(/\bExecute-MSI\b/g, 'Start-ADTMsiProcess')
    .replace(/\bExecute-MSP\b/g, 'Start-ADTMspProcess')
    .replace(/\bExecute-Process\b/g, 'Start-ADTProcess')
    .replace(/\bExecute-ProcessAsUser\b/g, 'Start-ADTProcessAsUser')
    .replace(/\bExit-Script\b/g, 'Close-ADTSession')
    // ── Registry ─────────────────────────────────────────────────────────
    .replace(/\bGet-RegistryKey\b/g, 'Get-ADTRegistryKey')
    .replace(/\bSet-RegistryKey\b/g, 'Set-ADTRegistryKey')
    .replace(/\bRemove-RegistryKey\b/g, 'Remove-ADTRegistryKey')
    .replace(/\bTest-RegistryValue\b/g, 'Test-ADTRegistryValue')
    .replace(/\bConvert-RegistryPath\b/g, 'Convert-ADTRegistryPath')
    .replace(/\bInvoke-HKCURegistrySettingsForAllUsers\b/g, 'Invoke-ADTAllUsersRegistryAction')
    // ── File and folder operations ────────────────────────────────────────
    .replace(/\bCopy-File\b/g, 'Copy-ADTFile')
    .replace(/\bCopy-FileToUserProfiles\b/g, 'Copy-ADTFileToUserProfiles')
    .replace(/\bRemove-File\b/g, 'Remove-ADTFile')
    .replace(/\bRemove-FileFromUserProfiles\b/g, 'Remove-ADTFileFromUserProfiles')
    .replace(/\bRemove-Folder\b/g, 'Remove-ADTFolder')
    .replace(/\bNew-Folder\b/g, 'New-ADTFolder')
    .replace(/\bNew-ZipFile\b/g, 'New-ADTZipFile')
    // ── Application management ────────────────────────────────────────────
    .replace(/\bRemove-MSIApplications\b/g, 'Uninstall-ADTApplication')
    .replace(/\bGet-InstalledApplication\b/g, 'Get-ADTApplication')
    // ── INI file operations ───────────────────────────────────────────────
    .replace(/\bSet-IniValue\b/g, 'Set-ADTIniValue')
    .replace(/\bGet-IniValue\b/g, 'Get-ADTIniValue')
    // ── Shortcuts ─────────────────────────────────────────────────────────
    .replace(/\bNew-Shortcut\b/g, 'New-ADTShortcut')
    .replace(/\bGet-Shortcut\b/g, 'Get-ADTShortcut')
    .replace(/\bSet-Shortcut\b/g, 'Set-ADTShortcut')
    // ── Services ─────────────────────────────────────────────────────────
    .replace(/\bStart-ServiceAndDependencies\b/g, 'Start-ADTServiceAndDependencies')
    .replace(/\bStop-ServiceAndDependencies\b/g, 'Stop-ADTServiceAndDependencies')
    .replace(/\bGet-ServiceStartMode\b/g, 'Get-ADTServiceStartMode')
    .replace(/\bSet-ServiceStartMode\b/g, 'Set-ADTServiceStartMode')
    .replace(/\bTest-ServiceExists\b/g, 'Test-ADTServiceExists')
    // ── UI/progress dialogs ───────────────────────────────────────────────
    .replace(/\bShow-InstallationWelcome\b/g, 'Show-ADTInstallationWelcome')
    .replace(/\bShow-WelcomePrompt\b/g, 'Show-ADTInstallationWelcome')
    .replace(/\bShow-InstallationProgress\b/g, 'Show-ADTInstallationProgress')
    .replace(/\bClose-InstallationProgress\b/g, 'Close-ADTInstallationProgress')
    .replace(/\bShow-InstallationPrompt\b/g, 'Show-ADTInstallationPrompt')
    .replace(/\bShow-InstallationRestartPrompt\b/g, 'Show-ADTInstallationRestartPrompt')
    .replace(/\bShow-BalloonTip\b/g, 'Show-ADTBalloonTip')
    .replace(/\bShow-DialogBox\b/g, 'Show-ADTDialogBox')
    // ── App execution blocking ────────────────────────────────────────────
    .replace(/\bBlock-AppExecution\b/g, 'Block-ADTAppExecution')
    .replace(/\bUnblock-AppExecution\b/g, 'Unblock-ADTAppExecution')
    // ── Logging ───────────────────────────────────────────────────────────
    .replace(/\bWrite-Log\b/g, 'Write-ADTLogEntry')
    .replace(/\bResolve-Error\b/g, 'Resolve-ADTErrorRecord')
    // ── User/environment helpers ──────────────────────────────────────────
    .replace(/\bGet-UserProfiles\b/g, 'Get-ADTUserProfiles')
    .replace(/\bGet-LoggedOnUser\b/g, 'Get-ADTLoggedOnUser')
    .replace(/\bUpdate-Desktop\b/g, 'Update-ADTDesktop')
    .replace(/\bUpdate-GroupPolicy\b/g, 'Update-ADTGroupPolicy')
    .replace(/\bUpdate-SessionEnvironmentVariables\b/g, 'Update-ADTEnvironmentPsProvider')
    // ── Disk/system info ─────────────────────────────────────────────────
    .replace(/\bGet-FreeDiskSpace\b/g, 'Get-ADTFreeDiskSpace')
    .replace(/\bGet-PendingReboot\b/g, 'Get-ADTPendingReboot')
    .replace(/\bTest-Battery\b/g, 'Test-ADTBattery')
    .replace(/\bTest-NetworkConnection\b/g, 'Test-ADTNetworkConnection')
    .replace(/\bTest-PowerPoint\b/g, 'Test-ADTPowerPoint')
    .replace(/\bGet-WindowTitle\b/g, 'Get-ADTWindowTitle')
    // ── MSI helpers ───────────────────────────────────────────────────────
    .replace(/\bGet-MsiExitCodeMessage\b/g, 'Get-ADTMsiExitCodeMessage')
    .replace(/\bGet-MsiTableProperty\b/g, 'Get-ADTMsiTableProperty')
    .replace(/\bNew-MsiTransform\b/g, 'New-ADTMsiTransform')
    .replace(/\bSet-MsiProperty\b/g, 'Set-ADTMsiProperty')
    .replace(/\bTest-MSUpdates\b/g, 'Test-ADTMSUpdates')
    .replace(/\bInstall-MSUpdates\b/g, 'Install-ADTMSUpdates')
    // ── Variable paths ────────────────────────────────────────────────────
    .replace(/\$dirFiles\b/g, '$($adtSession.DirFiles)')
    .replace(/\$dirSupportFiles\b/g, '$($adtSession.DirSupportFiles)');
}

/** Scan a script block for all recognizable PowerShell commands and return action objects. */
function extractBlockActions(block) {
  if (!block) return [];
  const actions = [];

  // ── Step 1: Join backtick-continuation lines ────────────────────────────
  const rawLines = block.split('\n');
  const lines = [];
  let pending = '';
  for (const line of rawLines) {
    const trimmed = line.trimEnd();
    if (trimmed.endsWith('`')) {
      pending += (pending ? ' ' : '') + trimmed.slice(0, -1).trim();
    } else {
      if (pending) {
        lines.push(pending + ' ' + trimmed.trim());
        pending = '';
      } else {
        lines.push(line);
      }
    }
  }
  if (pending) lines.push(pending);

  // Buffer to accumulate consecutive lines of custom PowerShell code
  const customBuffer = [];
  const flushCustomBuffer = () => {
    if (customBuffer.length > 0) {
      // Trim empty lines from top and bottom of buffer
      let start = 0;
      while (start < customBuffer.length && !customBuffer[start].trim()) {
        start++;
      }
      let end = customBuffer.length - 1;
      while (end >= start && !customBuffer[end].trim()) {
        end--;
      }
      const trimmedLines = customBuffer.slice(start, end + 1);
      if (trimmedLines.length > 0) {
        // Only flush if there is at least one line with executable code (not comment only)
        const hasExecutableCode = trimmedLines.some(line => {
          const t = line.trim();
          return t && !t.startsWith('#') && !t.startsWith('<#');
        });

        if (hasExecutableCode) {
          const scriptText = modernizeLegacyScriptParts(trimmedLines.join('\n'));
          actions.push({
            type: 'raw_ps',
            desc: `PowerShell block: ${scriptText.split('\n')[0].trim().substring(0, 60)}`,
            script: scriptText,
            note: 'PowerShell script block',
            enabled: true,
          });
        }
      }
      customBuffer.length = 0; // clear
    }
  };

  // ── Step 1.5: Pre-process $saiwParams splatting patterns ──────────────
  // The $saiwParams block spans multiple lines (hashtable + conditional +
  // Show-ADTInstallationWelcome @saiwParams) and would otherwise fragment
  // into 3 separate actions. Detect it and inject a structured show_welcome
  // action directly, then remove those lines from further processing.
  const joinedBlock = lines.join('\n');

  // Pattern A: Full splatting ($saiwParams = @{ ... } + conditional + @saiwParams)
  const saiwRx = /\$saiwParams\s*=\s*@\{([^}]*)\}[\s\S]*?Show-ADTInstallationWelcome\s+@saiwParams/;
  const saiwMatch = joinedBlock.match(saiwRx);
  if (saiwMatch) {
    const hashtableBody = saiwMatch[1];
    const parseBool = (key) => new RegExp(`${key}\\s*=\\s*\\$true`, 'i').test(hashtableBody);
    const parseNum = (key) => { const m = hashtableBody.match(new RegExp(`${key}\\s*=\\s*(\\d+)`, 'i')); return m ? parseInt(m[1]) : 0; };
    const parseStr = (key) => { const m = hashtableBody.match(new RegExp(`${key}\\s*=\\s*'([^']*)'`, 'i')); return m ? m[1] : ''; };

    actions.push({
      type: 'show_welcome',
      enabled: true,
      allowDefer: parseBool('AllowDefer'),
      deferTimes: parseNum('DeferTimes') || 3,
      deferDays: parseNum('DeferDays'),
      deferDeadline: parseStr('DeferDeadline'),
      checkDiskSpace: parseBool('CheckDiskSpace'),
      persistPrompt: parseBool('PersistPrompt'),
      closeProcessesCountdown: parseNum('CloseProcessesCountdown'),
      forceCloseProcessesCountdown: parseNum('ForceCloseProcessesCountdown'),
      blockExecution: parseBool('BlockExecution'),
    });
    // Remove the matched region from lines so it won't be re-parsed
    const matchStart = joinedBlock.indexOf(saiwMatch[0]);
    const matchEnd = matchStart + saiwMatch[0].length;
    const before = joinedBlock.substring(0, matchStart);
    const after = joinedBlock.substring(matchEnd);
    lines.length = 0;
    lines.push(...(before + after).split('\n'));
  }

  // Pattern B: Countdown welcome (pre-uninstall/pre-repair)
  // if ($adtSession.AppProcessesToClose.Count -gt 0) { Show-ADTInstallationWelcome -CloseProcesses ... -CloseProcessesCountdown 60 }
  const countdownRx = /if\s*\(\$adtSession\.AppProcessesToClose\.Count\s+-gt\s+0\)\s*\{[\s\S]*?Show-ADTInstallationWelcome\s+-CloseProcesses\s+\$adtSession\.AppProcessesToClose\s+-CloseProcessesCountdown\s+(\d+)[\s\S]*?\}/;
  const countdownJoined = lines.join('\n');
  const countdownMatch = countdownJoined.match(countdownRx);
  if (countdownMatch) {
    actions.push({
      type: 'show_welcome',
      enabled: true,
      allowDefer: false,
      deferTimes: 0,
      deferDays: 0,
      deferDeadline: '',
      checkDiskSpace: false,
      persistPrompt: false,
      closeProcessesCountdown: parseInt(countdownMatch[1]) || 60,
      forceCloseProcessesCountdown: 0,
      blockExecution: false,
    });
    const matchStart = countdownJoined.indexOf(countdownMatch[0]);
    const matchEnd = matchStart + countdownMatch[0].length;
    const before = countdownJoined.substring(0, matchStart);
    const after = countdownJoined.substring(matchEnd);
    lines.length = 0;
    lines.push(...(before + after).split('\n'));
  }

  // ── Step 2: Index-based loop ──────────────────────────────────────────
  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    const t = line.trim();

    // Skip empty lines at the very beginning of parsing to avoid leading raw blocks
    if (!t && customBuffer.length === 0) {
      continue;
    }

    // Nested helper-function definition (e.g. function Get-EMEA { ... })
    // Extract the entire function as one raw_ps block so the opening line,
    // body, and closing brace stay together and are not split across actions.
    if (FUNCTION_OPENER.test(t)) {
      const { blockText, endIndex } = extractBraceBlock(lines, lineIdx);
      lineIdx = endIndex;
      flushCustomBuffer();
      const modernizedBlock = modernizeLegacyScriptParts(blockText.trim());
      if (modernizedBlock.length > 3) {
        const fnName = t.match(/^function\s+(\S+)/i)?.[1] || 'helper';
        actions.push({
          type: 'raw_ps',
          desc: `Helper function: ${fnName}`,
          script: modernizedBlock,
          note: 'Nested helper function preserved as-is',
          enabled: true,
        });
      }
      continue;
    }

    // Try block opener
    if (TRY_OPENERS.test(t)) {
      const { blockText, endIndex } = extractTryCatchBlock(lines, lineIdx);
      lineIdx = endIndex;
      flushCustomBuffer();
      const modernizedBlock = modernizeLegacyScriptParts(blockText.trim());
      if (modernizedBlock.length > 3) {
        actions.push({
          type: 'raw_ps',
          desc: `Try/Catch block: ${modernizedBlock.split('\n')[0].trim().substring(0, 60)}`,
          script: modernizedBlock,
          note: 'Error-handling block preserved as-is (Try/Catch/Finally)',
          enabled: true,
        });
      }
      continue;
    }

    // Flow block opener (if/foreach/etc.) - always treat as raw_ps to preserve exact control-flow scope and balance braces
    if (FLOW_OPENERS.test(t)) {
      const { blockText, endIndex } = extractBraceBlock(lines, lineIdx);
      lineIdx = endIndex;
      flushCustomBuffer();
      const modernizedBlock = modernizeLegacyScriptParts(blockText.trim());
      if (modernizedBlock.length > 3) {
        actions.push({
          type: 'raw_ps',
          desc: `Control block: ${modernizedBlock.split('\n')[0].trim().substring(0, 60)}`,
          script: modernizedBlock,
          note: 'Control flow block preserved as-is',
          enabled: true,
        });
      }
      continue;
    }

    // ── Skip PowerShell comment lines (# prefix) ──────────────────────────
    // Prevents commented-out cmdlets (e.g. #Show-InstallationWelcome ...) from
    // being misidentified as real actions. Comment lines accumulate in customBuffer
    // and are naturally dropped by the hasExecutableCode filter in flushCustomBuffer.
    if (t.startsWith('#')) {
      customBuffer.push(line);
      continue;
    }

    let matched = false;

    // Check for ADT cmdlet matches
    // Execute-MSI (v3) — convert to start_msi_process so the generator can render it.
    // GUARD: if the line is actually a ForEach-Object batch pipeline (e.g. "{GUID1}", "{GUID2}" | ForEach-Object { Execute-MSI ... })
    // do NOT treat it as a plain Execute-MSI — it will be caught by the msi_uninstall_batch handler below.
    const isForeachMsiPipeline = /\|\s*ForEach-Object\s*\{\s*Execute-MSI/i.test(t);
    const msiMatch = !isForeachMsiPipeline && t.match(/Execute-MSI\s+.*-Action\s+['"](\w+)['"]?/i);
    if (msiMatch) {
      flushCustomBuffer();
      const msiAction = msiMatch[1];
      const path = extractPsParamValue(t, 'Path') || '';
      const params = extractPsParamValue(t, 'Parameters') || extractPsParamValue(t, 'ArgumentList') || '';
      const transform = extractPsParamValue(t, 'Transforms?') || extractPsParamValue(t, 'Transform') || '';
      const cleanPath = path ? path.replace(/.*[\\]/, '') : '';
      const cleanFile = stripDirPrefix(path) || cleanPath;
      const productCode = path.match(/^\{?[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}\}?$/) ? path : '';
      const actionObj = {
        type: 'start_msi_process',
        action: msiAction,
        desc: `MSI ${msiAction}: ${cleanFile || productCode || 'default'}`,
        file: productCode ? '' : cleanFile,
        productCode,
        args: params,
        transform,
        raw: t,
      };
      actions.push(actionObj);
      matched = true;
    }

    // Start-ADTMsiProcess (v4) — with -FilePath (install/repair)
    if (!matched) {
      const adtMsiMatch = t.match(/Start-ADTMsiProcess\b.*-FilePath\s+['"]([^'"]+)['"]/i);
      if (adtMsiMatch) {
        flushCustomBuffer();
        const actionMatch = t.match(/-Action\s+['"]?(\w+)['"]?/i);
        const argVal = extractPsParamValue(t, 'ArgumentList');
        const transformVal = extractPsParamValue(t, 'Transforms?');
        const fname = adtMsiMatch[1].replace(/.*[\\]/, '');
        const actionObj = { type: 'start_msi_process', action: actionMatch?.[1] || 'Install', desc: `MSI ${actionMatch?.[1] || 'Install'}: ${fname}`, file: fname, args: argVal || '', raw: t };
        if (transformVal) actionObj.transform = transformVal;
        actions.push(actionObj);
        matched = true;
      }
    }

    // Start-ADTMsiProcess (v4) — with -ProductCode GUID (uninstall/repair/install by product code)
    // Emit as 'start_msi_process' with productCode so the generator's existing case handles it.
    if (!matched) {
      const adtMsiPcMatch = t.match(/Start-ADTMsiProcess\b.*-ProductCode\s+['"]?(\{?[0-9A-Fa-f\-]{32,38}\}?)['"]?/i);
      if (adtMsiPcMatch) {
        flushCustomBuffer();
        const actionMatch = t.match(/-Action\s+['"]?(\w+)['"]?/i);
        const argVal = extractPsParamValue(t, 'ArgumentList');
        const action = actionMatch?.[1] || 'Uninstall';
        actions.push({
          type: 'start_msi_process',
          action,
          productCode: adtMsiPcMatch[1],
          args: argVal || '',
          desc: `MSI ${action} by ProductCode: ${adtMsiPcMatch[1]}`,
          raw: t,
        });
        matched = true;
      }
    }

    // Uninstall-ADTApplication (v4)
    if (!matched) {
      if (/Uninstall-ADTApplication/i.test(t)) {
        flushCustomBuffer();
        const appName    = extractPsParamValue(t, 'Name');
        const appType    = extractPsParamValue(t, 'ApplicationType');
        const nameMatch  = extractPsParamValue(t, 'NameMatch');
        const productCode = extractPsParamValue(t, 'ProductCode');
        const argList    = extractPsParamValue(t, 'ArgumentList');
        const filterScr  = extractPsParamValue(t, 'FilterScript');
        const actionObj  = {
          type: 'uninstall_application',
          desc: appName ? `Uninstall by name: ${appName}` : 'Uninstall-ADTApplication',
          raw: t,
        };
        if (appName)     actionObj.name            = appName;
        if (appType)     actionObj.applicationType  = appType;
        if (nameMatch)   actionObj.nameMatch        = nameMatch;
        if (productCode) actionObj.productCode      = productCode;
        if (argList)     actionObj.args             = argList;
        if (filterScr)   actionObj.filterScript     = filterScr;
        actions.push(actionObj);
        matched = true;
      }
    }

    // Remove-MSIApplications (v3)
    if (!matched) {
      const rmMsiMatch = t.match(/Remove-MSIApplications\s+-Name\s+['"]([^'"]+)['"]/i);
      if (rmMsiMatch) {
        flushCustomBuffer();
        actions.push({ type: 'uninstall_application', desc: `Remove MSI: ${rmMsiMatch[1]}`, name: rmMsiMatch[1], applicationType: 'MSI', raw: t });
        matched = true;
      }
    }

    // Execute-Process / Start-ADTProcess
    if (!matched) {
      const procMatch = t.match(/(?:Execute-Process|Start-ADTProcess(?:AsUser)?)\s+.*-(?:Path|FilePath)\s+['"]([^'"]+)['"]/i);
      if (procMatch) {
        flushCustomBuffer();
        const paramVal = extractPsParamValue(t, 'Parameters') || extractPsParamValue(t, 'ArgumentList');
        actions.push({ type: 'start_process', desc: `Run: ${procMatch[1].replace(/.*[\\]/, '')}`, file: procMatch[1], args: paramVal || '', raw: t });
        matched = true;
      }
    }


    // Stop-ADTServiceAndDependencies
    if (!matched) {
      const svcMatch = t.match(/Stop-ADTServiceAndDependencies\b.*-Name\s+['"]([^'"]+)['"]/i);
      if (svcMatch) {
        flushCustomBuffer();
        const varMatch = t.match(/^\s*\$(\w+)\s*=/);
        actions.push({ type: 'stop_service', desc: `Stop service: ${svcMatch[1]}`, name: svcMatch[1], passThruVar: varMatch ? varMatch[1] : '', raw: t });
        matched = true;
      }
    }

    // Start-ADTMspProcess
    if (!matched) {
      const mspMatch = t.match(/Start-ADTMspProcess\b.*-FilePath\s+['"]([^'"]+)['"]/i);
      if (mspMatch) {
        flushCustomBuffer();
        const fname = mspMatch[1].replace(/.*[\\]/, '');
        const argVal = extractPsParamValue(t, 'ArgumentList');
        actions.push({ type: 'start_msp_process', desc: `Run MSP: ${fname}`, file: mspMatch[1], args: argVal || '', raw: t });
        matched = true;
      }
    }

    // Write-ADTLogEntry
    if (!matched) {
      const logMatch = t.match(/Write-ADTLogEntry\b.*-Message\s+['"]([^'"]*)['"](?:.*-Severity\s+(\d+))?/i);
      if (logMatch) {
        flushCustomBuffer();
        actions.push({ type: 'write_log', desc: `Log: ${logMatch[1].slice(0, 40)}`, message: logMatch[1], severity: logMatch[2] || '1', raw: t });
        matched = true;
      }
    }

    // Set-ADTIniValue / Set-IniValue (v3)
    if (!matched) {
      const iniMatch = t.match(/(?:Set-ADTIniSection|Set-ADTIniValue|Set-IniValue)\b/i);
      if (iniMatch) {
        flushCustomBuffer();
        const fp = extractPsParamValue(t, 'FilePath');
        const sec = extractPsParamValue(t, 'Section');
        const k = extractPsParamValue(t, 'Key');
        const v = extractPsParamValue(t, 'Value');
        actions.push({ type: 'set_ini', desc: `Set INI: ${k}=${v}`, filePath: fp || '', section: sec || '', key: k || '', value: v || '', raw: t });
        matched = true;
      }
    }

    

    // Get-ADTRegistryKey
    if (!matched) {
      const getRegMatch = t.match(/Get-ADTRegistryKey\b.*-Key\s+['"]([^'"]+)['"]/i);
      if (getRegMatch) {
        flushCustomBuffer();
        const val = extractPsParamValue(t, 'Value');
        const varMatch = t.match(/^\s*\$(\w+)\s*=/);
        actions.push({ type: 'get_registry_key', desc: `Get Reg: ${getRegMatch[1]}`, key: getRegMatch[1], value: val || '', passThruVar: varMatch ? varMatch[1] : '', raw: t });
        matched = true;
      }
    }

    // Remove-NetFirewallRule
    if (!matched) {
      const fwMatch = t.match(/Remove-NetFirewallRule\b/i);
      if (fwMatch) {
        flushCustomBuffer();
        const dn = extractPsParamValue(t, 'DisplayName');
        const n = extractPsParamValue(t, 'Name');
        actions.push({ type: 'remove_firewall_rule', desc: `Remove Firewall Rule`, displayName: dn || '', name: n || '', raw: t });
        matched = true;
      }
    }

    // Native PowerShell: Start-Process -FilePath ...
    if (!matched) {
      const startProcMatch = t.match(/Start-Process\s+.*-FilePath\s+['"]?([^\s'"}{]+)/i);
      if (startProcMatch) {
        flushCustomBuffer();
        const spArgVal = extractPsParamValue(t, 'ArgumentList');
        actions.push({ type: 'start_process', desc: `Run (native): ${startProcMatch[1].replace(/.*[\\]/, '')}`, file: startProcMatch[1], args: spArgVal || '', raw: t });
        matched = true;
      }
    }

    // Copy-Item / Copy-ADTFile
    if (!matched && /(?:Copy-Item|Copy-ADTFile)\b/i.test(t)) {
      const copySrc = extractPsParamValue(t, '(?:Path|Source)');
      const copyDst = extractPsParamValue(t, 'Destination');
      if (copySrc && copyDst) {
        flushCustomBuffer();
        actions.push({ type: 'file_copy', desc: `Copy: ${copySrc.replace(/.*[\\/]/, '')} \u2192 ${copyDst}`, source: stripDirPrefix(copySrc), dest: copyDst, raw: t });
        matched = true;
      }
    }

    // Piped removal: Get-ChildItem '...' | Remove-Item
    if (!matched) {
      const pipedRemoveMatch = t.match(/Get-ChildItem\s+['"]([^'"]+)['"]\s*\|\s*Remove-Item/i);
      if (pipedRemoveMatch) {
        flushCustomBuffer();
        actions.push({ type: 'file_remove', desc: `Remove (piped): ${pipedRemoveMatch[1]}`, path: pipedRemoveMatch[1], raw: t });
        matched = true;
      }
    }

    // Remove-Item / Remove-File / Remove-ADTFolder (with -Path flag)
    if (!matched && /(?:Remove-Item|Remove-File|Remove-ADTFolder)\b/i.test(t)) {
      const removePath = extractPsParamValue(t, '(?:Path|LiteralPath)');
      if (removePath) {
        flushCustomBuffer();
        actions.push({ type: 'file_remove', desc: `Remove: ${removePath}`, path: removePath, raw: t });
        matched = true;
      }
    }

    // Set-RegistryKey / Set-ADTRegistryKey
    if (!matched) {
      const regSetMatch = t.match(/(?:Set-RegistryKey|Set-ADTRegistryKey)\s+.*-(?:Key|LiteralPath)\s+['"]([^'"]+)['"].*-Name\s+['"]([^'"]+)['"].*-Value\s+['"]?([^'"\s]+)/i);
      if (regSetMatch) {
        flushCustomBuffer();
        const regType = extractPsParamValue(t, 'Type') || 'String';
        actions.push({ type: 'registry_set', desc: `Registry: ${regSetMatch[2]} = ${regSetMatch[3]}`, key: regSetMatch[1], name: regSetMatch[2], value: regSetMatch[3], regType, raw: t });
        matched = true;
      }
    }

    // Native PowerShell: Set-ItemProperty -Path ... -Name ... -Value ...
    if (!matched) {
      const setIPMatch = t.match(/Set-ItemProperty\s+.*-Path\s+['"]?([^\s'"}{]+)['"]?\s+.*-Name\s+['"]([^'"]+)['"]\s+.*-Value\s+['"]?([^\s'"}{]+)/i);
      if (setIPMatch) {
        flushCustomBuffer();
        actions.push({ type: 'registry_set', desc: `Registry (native): ${setIPMatch[2]} = ${setIPMatch[3]}`, key: setIPMatch[1], name: setIPMatch[2], value: setIPMatch[3], raw: t });
        matched = true;
      }
    }

    // Native PowerShell: New-ItemProperty -Path ... -Name ... -Value ...
    if (!matched) {
      const newIPMatch = t.match(/New-ItemProperty\s+.*-Path\s+['"]?([^\s'"}{]+)['"]?\s+.*-Name\s+['"]([^'"]+)['"]\s+.*-Value\s+['"]?([^\s'"}{]+)/i);
      if (newIPMatch) {
        flushCustomBuffer();
        actions.push({ type: 'registry_set', desc: `Registry (new): ${newIPMatch[2]} = ${newIPMatch[3]}`, key: newIPMatch[1], name: newIPMatch[2], value: newIPMatch[3], raw: t });
        matched = true;
      }
    }

    // Remove-RegistryKey / Remove-ADTRegistryKey (with optional -Name for value removal)
    if (!matched) {
      const regRemoveMatch = t.match(/(?:Remove-RegistryKey|Remove-ADTRegistryKey)\s+.*-(?:Key|LiteralPath)\s+['"]([^'"]+)['"]/i);
      if (regRemoveMatch) {
        flushCustomBuffer();
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
        flushCustomBuffer();
        actions.push({ type: 'registry_remove', desc: `Remove reg value (native): ${removeIPMatch[2]}`, key: removeIPMatch[1], name: removeIPMatch[2], raw: t });
        matched = true;
      }
    }

    // New-ADTFolder
    if (!matched && /New-ADTFolder\b/i.test(t)) {
      const mkdirPath = extractPsParamValue(t, '(?:Path|LiteralPath)');
      if (mkdirPath) {
        flushCustomBuffer();
        actions.push({ type: 'create_folder', desc: `Create: ${mkdirPath}`, path: mkdirPath, raw: t });
        matched = true;
      }
    }

    // SetEnvironmentVariable (raw .NET) or Set-ADTEnvironmentVariable
    if (!matched) {
      const envMatch = t.match(/SetEnvironmentVariable\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]/i);
      const adtEnvMatch = !envMatch ? t.match(/Set-ADTEnvironmentVariable\s+.*-Name\s+['"]([^'"]+)['"]\s+.*-Value\s+['"]([^'"]+)['"]/i) : null;
      const em = envMatch || adtEnvMatch;
      if (em) {
        flushCustomBuffer();
        actions.push({ type: 'custom_script', code: t, desc: `Env: ${em[1]} = ${em[2]}`, name: em[1], value: em[2], raw: t });
        matched = true;
      }
    }

    // Remove-ADTEnvironmentVariable
    if (!matched) {
      const removeEnvMatch = t.match(/Remove-ADTEnvironmentVariable\s+.*-Name\s+['"]([^'"]+)['"]/i);
      if (removeEnvMatch) {
        flushCustomBuffer();
        actions.push({ type: 'custom_script', code: t, desc: `Remove env: ${removeEnvMatch[1]}`, name: removeEnvMatch[1], raw: t });
        matched = true;
      }
    }

    // Show-InstallationWelcome / Show-ADTInstallationWelcome (inline params, not splatting)
    // Guard: skip comment lines — e.g. #Show-InstallationWelcome ... should not produce an action
    if (!matched) {
      const welcomeMatch = !t.startsWith('#') && t.match(/Show-(?:ADT)?InstallationWelcome\b(.+)/i);
      if (welcomeMatch && !/@saiwParams/.test(t)) {
        flushCustomBuffer();
        const params = welcomeMatch[1];
        const hasParam = (name) => new RegExp(`-${name}\\b`, 'i').test(params);
        const getNumParam = (name) => { const m = params.match(new RegExp(`-${name}\\s+(\\d+)`, 'i')); return m ? parseInt(m[1]) : 0; };

        actions.push({
          type: 'show_welcome',
          enabled: true,
          allowDefer: hasParam('AllowDefer'),
          deferTimes: getNumParam('DeferTimes') || (hasParam('AllowDefer') ? 3 : 0),
          deferDays: getNumParam('DeferDays'),
          deferDeadline: '',
          checkDiskSpace: hasParam('CheckDiskSpace'),
          persistPrompt: hasParam('PersistPrompt'),
          closeProcessesCountdown: getNumParam('CloseProcessesCountdown'),
          forceCloseProcessesCountdown: getNumParam('ForceCloseProcessesCountdown') || getNumParam('ForceCountdown'),
          blockExecution: hasParam('BlockExecution'),
          raw: t,
        });
        matched = true;
      }
    }

    // Show-InstallationProgress / Show-ADTInstallationProgress
    if (!matched && /Show-(?:ADT)?InstallationProgress/i.test(t)) {
      flushCustomBuffer();
      const msgMatch = t.match(/-(?:StatusMessage|Message)\s+['"]([^'"]+)['"]/i);
      actions.push({
        type: 'show_progress',
        enabled: true,
        statusMessage: msgMatch ? msgMatch[1] : '',
        topMost: !/-NotTopMost/i.test(t),
        raw: t,
      });
      matched = true;
    }

    // Show-InstallationPrompt / Show-ADTInstallationPrompt (completion / notification dialogs)
    if (!matched) {
      const promptMatch = t.match(/Show-(?:ADT)?InstallationPrompt\b/i);
      if (promptMatch) {
        flushCustomBuffer();
        actions.push({ type: 'show_completion', desc: 'Show completion dialog', raw: t });
        matched = true;
      }
    }

    // Stop-Process / Get-Process ... | Stop-Process
    if (!matched) {
      const stopProcMatch = t.match(/(?:Get-Process\s.*\|\s*)?Stop-Process\s+.*-(?:Name|Id)\s+['"]*([\w]+)['"]*/i) ||
                            t.match(/Stop-Process\s+-Name\s+['"]*([\w]+)['"]*/i) ||
                            t.match(/Get-Process\s+['"]*([\w]+)['"]*/i);
      if (stopProcMatch) {
        flushCustomBuffer();
        const procName = stopProcMatch[1] || 'process';
        actions.push({ type: 'stop_process', enabled: true, processName: procName, force: /-Force/i.test(t), raw: t });
        matched = true;
      }
    }

    // Set-ADTIniValue / Set-IniValue
    if (!matched) {
      const iniSetMatch = t.match(/Set-(?:ADT)?IniValue\b/i);
      if (iniSetMatch) {
        flushCustomBuffer();
        const fp = extractPsParamValue(t, 'FilePath') || '';
        const sec = extractPsParamValue(t, 'Section') || '';
        const key = extractPsParamValue(t, 'Key') || '';
        const val = extractPsParamValue(t, 'Value') || '';
        actions.push({ type: 'custom_script', code: t, enabled: true, filePath: fp, section: sec, key, value: val, raw: t });
        matched = true;
      }
    }

    // Remove-ADTIniValue / Remove-IniValue
    if (!matched) {
      const iniRemoveMatch = t.match(/Remove-(?:ADT)?IniValue\b/i);
      if (iniRemoveMatch) {
        flushCustomBuffer();
        const fp = extractPsParamValue(t, 'FilePath') || '';
        const sec = extractPsParamValue(t, 'Section') || '';
        const key = extractPsParamValue(t, 'Key') || '';
        actions.push({ type: 'custom_script', code: t, enabled: true, filePath: fp, section: sec, key, raw: t });
        matched = true;
      }
    }

    // Close-ADTInstallationProgress / Close-InstallationProgress
    if (!matched && /Close-(?:ADT)?InstallationProgress/i.test(t)) {
      flushCustomBuffer();
      actions.push({ type: 'custom_script', code: t, enabled: true, raw: t });
      matched = true;
    }

    // Remove-ADTFileFromUserProfiles
    if (!matched) {
      const removeProfileMatch = t.match(/Remove-ADTFileFromUserProfiles\s+.*-Path\s+['"]([^'"]+)['"]/i);
      if (removeProfileMatch) {
        flushCustomBuffer();
        actions.push({ type: 'remove_file_from_profiles', enabled: true, path: removeProfileMatch[1], raw: t });
        matched = true;
      }
    }

    // Start-ADTMsiProcess -Action Patch
    if (!matched) {
      const msiPatchMatch = t.match(/Start-ADTMsiProcess\b.*-Action\s+['"]?Patch['"]?/i);
      if (msiPatchMatch) {
        flushCustomBuffer();
        const fpMatch = t.match(/-FilePath\s+['"]([^'"]+)['"]/i);
        const argMatch = t.match(/-ArgumentList\s+['"]([^'"]+)['"]/i);
        const fname = fpMatch ? fpMatch[1].replace(/.*[\\]/, '') : '';
        actions.push({ type: 'custom_script', code: t, enabled: true, file: fname, args: argMatch?.[1] || '', raw: t });
        matched = true;
      }
    }

    // Set-ADTItemPermission
    if (!matched) {
      const permMatch = t.match(/Set-ADTItemPermission\b/i);
      if (permMatch) {
        flushCustomBuffer();
        const path = extractPsParamValue(t, 'Path') || '';
        const user = extractPsParamValue(t, 'User') || '';
        const perm = extractPsParamValue(t, 'Permission') || '';
        const inherit = extractPsParamValue(t, 'Inheritance') || '';
        const prop = extractPsParamValue(t, 'Propagation') || '';
        const acType = extractPsParamValue(t, 'AccessControlType') || 'Allow';
        actions.push({ type: 'custom_script', code: t, enabled: true, path, user, permission: perm, inheritance: inherit, propagation: prop, accessControlType: acType, raw: t });
        matched = true;
      }
    }
    // ForEach-Object with Execute-MSI (multi-GUID batch pattern)
    // Pattern: "{GUID1}", "{GUID2}" | ForEach-Object { Execute-MSI -Action 'Uninstall' -Path "$_" }
    // After backtick-joining these all appear on one line.
    if (!matched) {
      const foreachMsi = t.match(/\|?\s*ForEach-Object\s*\{\s*Execute-MSI\s+-Action\s+['"]?(\w+)['"]?/i);
      if (foreachMsi) {
        flushCustomBuffer();
        const action = foreachMsi[1];
        // Extract GUIDs from the part of the line BEFORE the pipe — these are the piped values
        const beforePipe = t.split('|')[0];
        const guidRe = /\{([0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12})\}/g;
        const guids = [];
        let gm;
        while ((gm = guidRe.exec(beforePipe)) !== null) {
          guids.push(`{${gm[1]}}`);
        }
        actions.push({
          type: `msi_${action.toLowerCase()}_batch`,
          desc: guids.length > 0
            ? `Batch MSI ${action} (${guids.length} GUID${guids.length !== 1 ? 's' : ''})`
            : `Batch MSI ${action} (multiple GUIDs)`,
          guids: [...new Set(guids)],
          raw: t,
        });
        matched = true;
      }
    }

    // Start-Sleep
    if (!matched) {
      const sleepMatch = t.match(/Start-Sleep\s+-Seconds\s+(\d+)/i);
      if (sleepMatch) {
        flushCustomBuffer();
        actions.push({ type: 'sleep', desc: `Wait ${sleepMatch[1]}s`, seconds: parseInt(sleepMatch[1]), raw: t });
        matched = true;
      }
    }

    // Write-Log / Write-ADTLogEntry (informational, skip silently)
    if (!matched && /^Write-(?:Log|ADTLogEntry)\b/i.test(t)) {
      matched = true;
    }

    // Stop-Process / Get-Process ... | Stop-Process
    if (!matched) {
      const stopProcMatch = t.match(/(?:Get-Process\s.*\|\s*)?Stop-Process\s+.*-(?:Name|Id)\s+['"]*(\w+)['"]*|Stop-Process\s+-Name\s+['"]*(\w+)['"]*|Get-Process\s+['"]*(\w+)['"]*\s*\|\s*Stop-Process/i);
      if (stopProcMatch) {
        flushCustomBuffer();
        const procName = stopProcMatch[1] || stopProcMatch[2] || stopProcMatch[3] || 'process';
        actions.push({ type: 'stop_process', desc: `Stop: ${procName}`, closeApps: procName, raw: t });
        matched = true;
      }
    }

    // Copy-ADTFile
    if (!matched) {
      const copyADTMatch = t.match(/Copy-ADTFile\s+.*-Path\s+['"]?([^'"\s]+)['"]?\s+.*-Destination\s+['"]([^'"]+)['"]/i);
      if (copyADTMatch) {
        flushCustomBuffer();
        actions.push({ type: 'file_copy', desc: `Copy: ${copyADTMatch[1]}`, source: copyADTMatch[1], dest: copyADTMatch[2], raw: t });
        matched = true;
      }
    }

    // Copy-ADTFileToUserProfiles
    if (!matched) {
      const copyUserMatch = t.match(/Copy-ADTFileToUserProfiles\s+.*-Path\s+['"]?([^'"\s]+)['"]?\s+.*-Destination\s+['"]([^'"]+)['"]/i);
      if (copyUserMatch) {
        flushCustomBuffer();
        actions.push({ type: 'copy_file_to_user_profiles', desc: `Copy to profiles: ${copyUserMatch[1]}`, source: copyUserMatch[1], destination: copyUserMatch[2], raw: t });
        matched = true;
      }
    }

    // New-ADTShortcut
    if (!matched) {
      const shortcutMatch = t.match(/New-ADTShortcut\s+.*-Path\s+['"]([^'"]+)['"]\s+.*-TargetPath\s+['"]([^'"]+)['"]/i);
      if (shortcutMatch) {
        flushCustomBuffer();
        actions.push({ type: 'new_shortcut', desc: `Shortcut: ${shortcutMatch[1]}`, shortcutPath: shortcutMatch[1], targetPath: shortcutMatch[2], raw: t });
        matched = true;
      }
    }

    // Get-ADTApplication
    if (!matched) {
      const getAppMatch = t.match(/\$([\w]+)\s*=\s*Get-ADTApplication\s+.*-Name\s+['"]([^'"]+)['"]/i);
      if (getAppMatch) {
        flushCustomBuffer();
        actions.push({ type: 'custom_script', code: t, desc: `Query: ${getAppMatch[2]}`, varName: getAppMatch[1], name: getAppMatch[2], raw: t });
        matched = true;
      }
    }

    // Show-ADTInstallationRestartPrompt
    if (!matched && /Show-(?:ADT)?InstallationRestartPrompt\b/i.test(t)) {
      flushCustomBuffer();
      const countdownMatch = t.match(/-CountdownSeconds\s+(\d+)/i);
      const noHideMatch = t.match(/-CountdownNoHideSeconds\s+(\d+)/i);
      const hasSilentRestart = /-SilentRestart\b/i.test(t);
      // Legacy support: -NoSilentRestart was the old v3 name (opposite meaning)
      const hasNoSilentRestart = /-NoSilentRestart\b/i.test(t);
      actions.push({
        type: 'restart_prompt',
        desc: 'Restart prompt',
        countdownSeconds: countdownMatch ? parseInt(countdownMatch[1]) : 600,
        countdownNoHideSeconds: noHideMatch ? parseInt(noHideMatch[1]) : 0,
        silentRestart: hasSilentRestart && !hasNoSilentRestart,
        raw: t,
      });
      matched = true;
    }

    // Set-ADTActiveSetup
    if (!matched) {
      const activeSetupMatch = t.match(/Set-ADTActiveSetup\s+.*-StubExePath\s+['"]([^'"]+)['"]/i);
      if (activeSetupMatch) {
        flushCustomBuffer();
        const keyMatch = t.match(/-Key\s+['"]([^'"]+)['"]/i);
        actions.push({ type: 'custom_script', code: t, desc: `Active Setup: ${activeSetupMatch[1]}`, stubExePath: activeSetupMatch[1], key: keyMatch?.[1] || '', raw: t });
        matched = true;
      }
    }

    // Add-ADTEdgeExtension
    if (!matched) {
      const addEdgeMatch = t.match(/Add-ADTEdgeExtension\s+.*-ExtensionID\s+['"]([^'"]+)['"]/i);
      if (addEdgeMatch) {
        flushCustomBuffer();
        const modeMatch = t.match(/-InstallationMode\s+['"]([^'"]+)['"]/i);
        actions.push({ type: 'custom_script', code: t, desc: `Edge ext: ${addEdgeMatch[1]}`, extensionId: addEdgeMatch[1], installationMode: modeMatch?.[1] || 'force_installed', raw: t });
        matched = true;
      }
    }

    // Remove-ADTEdgeExtension
    if (!matched) {
      const removeEdgeMatch = t.match(/Remove-ADTEdgeExtension\s+.*-ExtensionID\s+['"]([^'"]+)['"]/i);
      if (removeEdgeMatch) {
        flushCustomBuffer();
        actions.push({ type: 'custom_script', code: t, desc: `Remove Edge ext: ${removeEdgeMatch[1]}`, extensionId: removeEdgeMatch[1], raw: t });
        matched = true;
      }
    }

    // Register-ADTDll / Unregister-ADTDll
    if (!matched) {
      const regDllMatch = t.match(/(Register|Unregister)-ADTDll\s+.*-FilePath\s+['"]([^'"]+)['"]/i);
      if (regDllMatch) {
        flushCustomBuffer();
        actions.push({ type: 'custom_script', code: t, desc: `${regDllMatch[1]} DLL: ${regDllMatch[2]}`, filePath: regDllMatch[2], action: regDllMatch[1], raw: t });
        matched = true;
      }
    }

    // Install-ADTMSUpdates
    if (!matched && /Install-ADTMSUpdates\b/i.test(t)) {
      flushCustomBuffer();
      const dirMatch = t.match(/-Directory\s+['"]([^'"]+)['"]/i);
      actions.push({ type: 'custom_script', code: t, desc: 'Install MS Updates', directory: dirMatch?.[1] || '', raw: t });
      matched = true;
    }

    // Start-ADTServiceAndDependencies / Stop-ADTServiceAndDependencies / Set-ADTServiceStartMode
    if (!matched) {
      const startSvcMatch = t.match(/Start-ADTServiceAndDependencies\s+.*-Name\s+['"]([^'"]+)['"]/i);
      if (startSvcMatch) {
        flushCustomBuffer();
        const passThruMatch = t.match(/\$(\w+)\s*=\s*Start-ADTServiceAndDependencies/i);
        actions.push({
          type: 'start_service',
          desc: `Start service: ${startSvcMatch[1]}`,
          name: startSvcMatch[1],
          passThru: !!passThruMatch || /\-PassThru/i.test(t),
          passThruVar: passThruMatch ? passThruMatch[1] : '',
          raw: t,
        });
        matched = true;
      }
    }
    
    if (!matched) {
      const setStartModeMatch = t.match(/Set-ADTServiceStartMode\s+.*-Name\s+['"]([^'"]+)['"].*-StartMode\s+['"]([^'"]+)['"]/i);
      if (setStartModeMatch) {
        flushCustomBuffer();
        actions.push({ type: 'custom_script', code: t, desc: `Service ${setStartModeMatch[1]} → ${setStartModeMatch[2]}`, name: setStartModeMatch[1], mode: setStartModeMatch[2], startMode: setStartModeMatch[2], raw: t });
        matched = true;
      }
    }

    // Write-ADTLogEntry
    

    // ── Unmatched line — buffer or skip ────────────────────────────────
    if (!matched) {
      // Boilerplate skips to ignore clean skeleton noise
      if (t.startsWith('[string]') || t.startsWith('[String]') || t.startsWith('[int') || t.startsWith('[Int')) continue;
      if (/^\s*If\s*\(\$useDefaultMsi/i.test(t)) continue;
      if (/^\$ExecuteDefaultMSISplat/i.test(t)) continue;
      if (/^Execute-MSI\s+@ExecuteDefaultMSISplat/i.test(t)) continue;
      if (/^\s*if\s*\(\$adtSession\.UseDefaultMsi/i.test(t)) continue;
      if (/^Start-ADTMsiProcess\s+@ExecuteDefaultMSISplat/i.test(t)) continue;
      if (/^\$adtSession\.DefaultMspFiles\s*\|/i.test(t)) continue;
      if (/^\s*if\s*\(\$adtSession\.DefaultMstFile/i.test(t)) continue;
      if (/^\$ExecuteDefaultMSISplat\.Add\b/i.test(t)) continue;
      if (/^\$adtSession\.InstallPhase\s*=/i.test(t)) continue;
      if (/^\$installPhase\s*=/i.test(t)) continue;
      if (/^Write-(?:Host|Output|Verbose|Warning|Debug)\b/i.test(t)) continue;

      // Skip standalone braces if customBuffer is empty
      if (customBuffer.length === 0 && (/^\}$/.test(t) || /^\{$/.test(t) || /^\}\s*$/.test(t))) {
        continue;
      }

      // Buffer custom PowerShell line
      customBuffer.push(line);
    }
  }

  // Flush remaining buffer at the end
  flushCustomBuffer();

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
  };
  for (const [psName, key] of Object.entries(phaseNames)) {
    const block = extractV3Phase(text, psName);
    const actions = extractBlockActions(block);
    // Enrich pre-install with GUIDs was previously done here via extractGuidsFromBlock(block).
    // That approach picked up ALL GUIDs in the block — including ones embedded in file paths
    // (e.g. Package Cache\{229c8b18-...}\WiX310.exe) — producing false positives.
    // GUIDs are now extracted accurately in-line during extractBlockActions()
    // by splitting the ForEach-Object token on the pipe and scanning only the left side.
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

  // ── AppProcessesToClose: editable — extract from Show-InstallationWelcome -CloseApps ──
  // V3 scripts don't have $adtSession.AppProcessesToClose; we promote -CloseApps
  // from the pre-install phase into the variable declaration for the v4 conversion.
  const preInstallBlock = extractV3Phase(text, 'Pre-Installation');
  const v3CloseApps = preInstallBlock ? extractCloseAppsV3(preInstallBlock) : null;
  actions.push({
    type: 'custom_variable',
    desc: `$adtSession.AppProcessesToClose = @(${v3CloseApps || ''})`,
    name: '$adtSession.AppProcessesToClose',
    value: v3CloseApps || '',
    enabled: true,
    raw: `AppProcessesToClose = @(${v3CloseApps || ''})`,
  });

  // ── RequireAdmin: editable — V3 scripts don't have it, default to $true ──
  actions.push({
    type: 'custom_variable',
    desc: '$adtSession.RequireAdmin = $true',
    name: '$adtSession.RequireAdmin',
    value: '$true',
    enabled: true,
    raw: 'RequireAdmin = $true',
  });

  // ── System-managed vars: V3 scripts don't have $adtSession, but after
  // conversion to V4 the generated template always includes these.
  const systemManagedDefaults = [
    { key: 'DeployAppScriptFriendlyName', value: '$MyInvocation.MyCommand.Name' },
    { key: 'DeployAppScriptParameters',   value: '$PSBoundParameters' },
    { key: 'DeployAppScriptVersion',      value: "'4.1.8'" },
  ];
  for (const { key, value } of systemManagedDefaults) {
    actions.push({
      type: 'custom_variable',
      desc: `$adtSession.${key} = ${value}`,
      name: `$adtSession.${key}`,
      value,
      enabled: true,
      readOnly: true,
      systemManaged: true,
      raw: `${key} = ${value}`,
    });
  }

  return actions;
}

/**
 * Extract app variable declarations from a v4 $adtSession = @{ ... } hashtable.
 * Captures AppVendor, AppName, AppVersion, AppArch, AppScriptVersion, etc.
 */
export function extractVarDeclarationsV4(text) {
  const sessionBlock = extractAdtSession(text);
  if (!sessionBlock) return [];

  const actions = [];
  const lines = sessionBlock.split('\n');

  // Keys we want to extract as meaningful (editable) variables
  const interestingKeys = [
    'AppVendor', 'AppName', 'AppVersion', 'AppArch', 'AppLang',
    'AppRevision', 'AppScriptVersion', 'AppScriptDate', 'AppScriptAuthor',
    'InstallName', 'InstallTitle',
  ];

  for (const line of lines) {
    const t = line.trim();
    // Match: Key = 'value' or Key = "value"
    const m = t.match(/^(\w+)\s*=\s*['"](.*?)['"]/);
    if (m) {
      const key = m[1];
      const value = m[2];
      if (!interestingKeys.includes(key)) continue;
      if (!value && !['InstallName', 'InstallTitle'].includes(key)) continue;
      actions.push({
        type: 'custom_variable',
        desc: `$adtSession.${key} = '${value}'`,
        name: `$adtSession.${key}`,
        value: value,
        enabled: true,
        raw: t,
      });
    }
  }

  // Also extract array values that are useful
  const arrayKeys = [
    { key: 'AppSuccessExitCodes', desc: 'Success exit codes' },
    { key: 'AppRebootExitCodes', desc: 'Reboot exit codes' },
  ];

  for (const { key, desc } of arrayKeys) {
    const arrValues = extractArrayValue(sessionBlock, key);
    if (arrValues.length > 0) {
      actions.push({
        type: 'custom_variable',
        desc: `$adtSession.${key} = @(${arrValues.join(', ')})`,
        name: `$adtSession.${key}`,
        value: arrValues.join(', '),
        enabled: true,
        raw: `${key} = @(${arrValues.join(', ')})`,
      });
    }
  }

  // AppProcessesToClose — always include, even when empty, so it is
  // always visible and editable in the builder's variable section.
  const closeProcs = extractArrayValue(sessionBlock, 'AppProcessesToClose');
  actions.push({
    type: 'custom_variable',
    desc: `$adtSession.AppProcessesToClose = @(${closeProcs.length > 0 ? closeProcs.join(', ') : ''})`,
    name: '$adtSession.AppProcessesToClose',
    value: closeProcs.length > 0 ? closeProcs.join(', ') : '',
    enabled: true,
    raw: `AppProcessesToClose = @(${closeProcs.length > 0 ? closeProcs.join(', ') : ''})`,
  });

  // ── RequireAdmin: editable boolean variable ─────────────────────────────
  // This is a per-package setting that packagers may override to $false.
  // It's a boolean (not a quoted string) so it doesn't match the interestingKeys regex.
  const requireAdminMatch = sessionBlock.match(/^\s*RequireAdmin\s*=\s*(\$\w+)/im);
  const requireAdminValue = requireAdminMatch ? requireAdminMatch[1].trim() : '$true';
  actions.push({
    type: 'custom_variable',
    desc: `$adtSession.RequireAdmin = ${requireAdminValue}`,
    name: '$adtSession.RequireAdmin',
    value: requireAdminValue,
    enabled: true,
    raw: `RequireAdmin = ${requireAdminValue}`,
  });

  // ── System-managed keys: ALWAYS present as readOnly ──────────────────────
  // These are hardcoded in the generated template with canonical values.
  // We always use the defaults — the original script's values are irrelevant
  // since the generator overwrites them.
  const systemManagedKeys = [
    { key: 'DeployAppScriptFriendlyName', value: '$MyInvocation.MyCommand.Name' },
    { key: 'DeployAppScriptParameters',   value: '$PSBoundParameters' },
    { key: 'DeployAppScriptVersion',      value: "'4.1.8'" },
  ];

  for (const { key, value } of systemManagedKeys) {
    const varName = `$adtSession.${key}`;
    // Skip if already extracted by the interestingKeys or arrayKeys loop
    if (actions.some(a => a.name === varName)) continue;
    actions.push({
      type: 'custom_variable',
      desc: `$adtSession.${key} = ${value}`,
      name: varName,
      value,
      enabled: true,
      readOnly: true,
      systemManaged: true,
      raw: `${key} = ${value}`,
    });
  }

  return actions;
}

/** Extract all phase actions from a v4 script */
function extractAllPhasesV4(text) {
  const phases = {};

  // ── Variable Declaration phase ──────────────────────────────────────
  const varDeclActions = extractVarDeclarationsV4(text);
  if (varDeclActions.length > 0) phases['variableDeclaration'] = varDeclActions;

  const funcMap = {
    'Install-ADTDeployment': { 'Pre-Install': 'preInstall', 'Install': 'install', 'Post-Install': 'postInstall' },
    'Uninstall-ADTDeployment': { 'Pre-Uninstall': 'preUninstall', 'Uninstall': 'uninstall', 'Post-Uninstall': 'postUninstall' },
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
