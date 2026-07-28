/**
 * Regression test harness for PSADT v3→v4 conversion.
 *
 * Usage:
 *   node test/regression.mjs           — compare against saved snapshots
 *   node test/regression.mjs --update  — regenerate snapshots (new baseline)
 *
 * Requirements: Node 18+ (ESM + File API)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT  = join(__dir, '..');
const SNAP  = join(__dir, 'snapshots');
const UPDATE = process.argv.includes('--update');

if (!existsSync(SNAP)) mkdirSync(SNAP, { recursive: true });

// ── Dynamic imports (ESM modules) ────────────────────────────────────────────
const { modernizeLegacyScriptParts, parsePsadtFile } =
  await import(`${ROOT}/src/lib/parsePsadt.js`).catch(e => {
    console.error('❌ Could not import parsePsadt.js:', e.message);
    process.exit(1);
  });

const { default: parsePsadtBlocks } =
  await import(`${ROOT}/src/lib/parsePsadtBlocks.js`).catch(e => {
    console.error('❌ Could not import parsePsadtBlocks.js:', e.message);
    process.exit(1);
  });

// ── modernizeLegacyScriptParts unit test cases ────────────────────────────────
// Format: [description, input, expectedOutput]
const MODERNIZE_CASES = [
  // Core cmdlet renames
  ['Execute-MSI → Start-ADTMsiProcess',
    "Execute-MSI -Action 'Install' -Path 'app.msi'",
    "Start-ADTMsiProcess -Action 'Install' -Path 'app.msi'"],

  ['Execute-Process → Start-ADTProcess',
    "Execute-Process -Path 'setup.exe' -Parameters '-q'",
    "Start-ADTProcess -Path 'setup.exe' -ArgumentList '-q'"],

  ['Execute-MSP → Start-ADTMspProcess',
    "Execute-MSP -Path 'patch.msp'",
    "Start-ADTMspProcess -Path 'patch.msp'"],

  ['Remove-MSIApplications → Uninstall-ADTApplication',
    "Remove-MSIApplications -Name 'Teams'",
    "Uninstall-ADTApplication -Name 'Teams'"],

  ['Get-InstalledApplication → Get-ADTApplication',
    "Get-InstalledApplication -Name 'Chrome'",
    "Get-ADTApplication -Name 'Chrome'"],

  ['Copy-File → Copy-ADTFile',
    "Copy-File -Path 'C:\\temp\\a.txt' -Destination 'C:\\dst'",
    "Copy-ADTFile -Path 'C:\\temp\\a.txt' -Destination 'C:\\dst'"],

  ['Remove-File → Remove-ADTFile',
    "Remove-File -Path 'C:\\temp\\old.log'",
    "Remove-ADTFile -Path 'C:\\temp\\old.log'"],

  ['New-Folder → New-ADTFolder',
    "New-Folder -Path 'C:\\MyApp'",
    "New-ADTFolder -Path 'C:\\MyApp'"],

  ['Write-Log → Write-ADTLogEntry',
    "Write-Log -Message 'Done' -Severity 1",
    "Write-ADTLogEntry -Message 'Done' -Severity 1"],

  ['Show-InstallationWelcome → Show-ADTInstallationWelcome',
    "Show-InstallationWelcome -CloseApps 'chrome'",
    "Show-ADTInstallationWelcome -CloseApps 'chrome'"],

  ['Set-RegistryKey → Set-ADTRegistryKey',
    "Set-RegistryKey -Key 'HKLM:\\Software' -Name 'Val' -Value '1'",
    "Set-ADTRegistryKey -Key 'HKLM:\\Software' -Name 'Val' -Value '1'"],

  // Variable path modernization
  ['$dirFiles → $($adtSession.DirFiles)',
    'Execute-MSI -Path "$dirFiles\\app.msi"',
    'Start-ADTMsiProcess -Path "$($adtSession.DirFiles)\\app.msi"'],

  ['$dirSupportFiles → $($adtSession.DirSupportFiles)',
    'Copy-File -Path "$dirSupportFiles\\config.xml"',
    'Copy-ADTFile -Path "$($adtSession.DirSupportFiles)\\config.xml"'],

  // Session variable modernization
  ['$deploymentType → $adtSession.DeploymentType',
    'Write-Host $deploymentType',
    'Write-Host $adtSession.DeploymentType'],

  ['$appName → $adtSession.AppName',
    'Write-Host "Installing $appName"',
    'Write-Host "Installing $adtSession.AppName"'],

  // Parameter rename (must apply AFTER cmdlet rename)
  ['-Parameters → -ArgumentList (after cmdlet rename)',
    "Execute-Process -Path 'setup.exe' -Parameters '-silent'",
    "Start-ADTProcess -Path 'setup.exe' -ArgumentList '-silent'"],

  // Phase 1 additions — new cmdlets now in parser
  ['Execute-ProcessAsUser → Start-ADTProcessAsUser',
    "Execute-ProcessAsUser -Path 'tool.exe' -Parameters '-q'",
    "Start-ADTProcessAsUser -Path 'tool.exe' -ArgumentList '-q'"],

  ['Invoke-HKCURegistrySettingsForAllUsers → Invoke-ADTAllUsersRegistryAction',
    "Invoke-HKCURegistrySettingsForAllUsers -RegistrySettings $regSettings",
    "Invoke-ADTAllUsersRegistryAction -RegistrySettings $regSettings"],

  ['Get-PendingReboot → Get-ADTPendingReboot',
    '$pr = Get-PendingReboot',
    '$pr = Get-ADTPendingReboot'],

  ['Remove-Folder → Remove-ADTFolder',
    "Remove-Folder -Path 'C:\\OldApp'",
    "Remove-ADTFolder -Path 'C:\\OldApp'"],

  // Phase 2 additions — renames in v3ToV4.json not previously tested
  ['Exit-Script → Close-ADTSession',
    "Exit-Script -ExitCode 0",
    "Close-ADTSession -ExitCode 0"],

  ['Get-InstalledApplication → Get-ADTApplication (confirm table)',
    "$app = Get-InstalledApplication -Name 'Teams'",
    "$app = Get-ADTApplication -Name 'Teams'"],

  ['Start-ServiceAndDependencies → Start-ADTServiceAndDependencies',
    "Start-ServiceAndDependencies -Name 'wuauserv'",
    "Start-ADTServiceAndDependencies -Name 'wuauserv'"],

  ['Block-AppExecution → Block-ADTAppExecution',
    "Block-AppExecution -ProcessName 'excel'",
    "Block-ADTAppExecution -ProcessName 'excel'"],

  ['$appVendor → $adtSession.AppVendor',
    'Write-Log "Vendor: $appVendor"',
    'Write-ADTLogEntry "Vendor: $adtSession.AppVendor"'],
];

// ── Test script paths ─────────────────────────────────────────────────────────
const V3_SCRIPTS = [
  '/Users/wissammazboudi/Development/SPA/RefactorApps/samplePSADT/teams-Deploy-Application.ps1',
  '/Users/wissammazboudi/Development/SPA/RefactorApps/PSADTScripts/Deploy-Application.ps1',
];

const V4_SCRIPTS = [
  '/Users/wissammazboudi/spa-workbench/titles/teams/windows/src/Invoke-AppDeployToolkit.ps1',
  '/Users/wissammazboudi/spa-workbench/titles/7-zip/windows/src/Invoke-AppDeployToolkit.ps1',
  '/Users/wissammazboudi/spa-workbench/titles/cyberark-epm-feadone/windows/src/Invoke-AppDeployToolkit.ps1',
  '/Users/wissammazboudi/spa-workbench/titles/notepad-plus-plus/windows/src/Invoke-AppDeployToolkit.ps1',
  '/Users/wissammazboudi/spa-workbench/titles/pk-protect/windows/src/Invoke-AppDeployToolkit.ps1',
  '/Users/wissammazboudi/spa-workbench/titles/google-chrome/windows/src/Invoke-AppDeployToolkit.ps1',
  '/Users/wissammazboudi/spa-workbench/titles/globalprotect/windows/src/Invoke-AppDeployToolkit.ps1',
];

// ── Helpers ───────────────────────────────────────────────────────────────────
let passed = 0, failed = 0;

function pass(label) { console.log(`  ✅ ${label}`); passed++; }
function fail(label, detail) {
  console.error(`  ❌ ${label}`);
  if (detail) console.error(`     ${detail}`);
  failed++;
}

function snapKey(prefix, path) {
  const base = path.split('/').slice(-4).join('_').replace(/[\s.]/g, '_');
  return join(SNAP, `${prefix}_${base}.json`);
}

function diffSummary(a, b, maxLines = 20) {
  const aLines = JSON.stringify(a, null, 2).split('\n');
  const bLines = JSON.stringify(b, null, 2).split('\n');
  const diffs = [];
  const len = Math.max(aLines.length, bLines.length);
  for (let i = 0; i < len; i++) {
    if (aLines[i] !== bLines[i]) {
      diffs.push(`     L${i+1} WAS: ${(aLines[i] || '(missing)').trim()}`);
      diffs.push(`     L${i+1} NOW: ${(bLines[i] || '(missing)').trim()}`);
      if (diffs.length >= maxLines * 2) { diffs.push('     ... (truncated)'); break; }
    }
  }
  return diffs.join('\n');
}

function summarizePhases(phases) {
  const out = {};
  for (const [phase, data] of Object.entries(phases || {})) {
    out[phase] = (data.actions || []).map(a => {
      const entry = { type: a.type };
      if (a.file) entry.file = a.file;
      if (a.dirFilesRelative) entry.dirFilesRelative = true;
      if (a.type === 'raw_ps') entry.script_preview = (a.script || '').slice(0, 100);
      return entry;
    });
  }
  return out;
}

function checkSnapshot(snapFile, actual, label) {
  if (UPDATE || !existsSync(snapFile)) {
    writeFileSync(snapFile, JSON.stringify(actual, null, 2));
    console.log(`  📸 Snapshot ${UPDATE ? 'updated' : 'created'}: ${label}`);
    passed++;
    return;
  }
  const saved = JSON.parse(readFileSync(snapFile, 'utf8'));
  const diff = diffSummary(saved, actual);
  if (diff) {
    fail(label, `Regression detected:\n${diff}\n     (run with --update to accept new baseline)`);
  } else {
    pass(label);
  }
}

// ── Suite 1: modernizeLegacyScriptParts unit tests ────────────────────────────
console.log('\n══════════════════════════════════════════════════════════');
console.log('  SUITE 1: modernizeLegacyScriptParts Unit Tests');
console.log('══════════════════════════════════════════════════════════');

for (const [desc, input, expected] of MODERNIZE_CASES) {
  const actual = modernizeLegacyScriptParts(input);
  if (actual === expected) {
    pass(desc);
  } else {
    fail(desc, `Expected: ${expected}\n     Got:      ${actual}`);
  }
}

// ── Suite 2: V3 Script Parse Snapshots ───────────────────────────────────────
console.log('\n══════════════════════════════════════════════════════════');
console.log('  SUITE 2: V3 Script Parse Snapshots');
console.log('══════════════════════════════════════════════════════════');

for (const scriptPath of V3_SCRIPTS) {
  if (!existsSync(scriptPath)) {
    console.log(`  ⏭  Skipped (not found): ${scriptPath}`);
    continue;
  }
  try {
    const content = readFileSync(scriptPath, 'utf8');
    const file = new File([content], scriptPath.split('/').pop(), { type: 'text/plain' });
    const result = await parsePsadtFile(file);
    const summary = summarizePhases(result?.lifecycle?.phases || {});
    const snapFile = snapKey('v3', scriptPath);
    const label = scriptPath.split('/').pop();
    checkSnapshot(snapFile, summary, label);
  } catch (e) {
    fail(scriptPath.split('/').pop(), `Parse error: ${e.message}`);
  }
}

// ── Suite 3: V4 Round-Trip Snapshots (parsePsadtBlocks) ──────────────────────
console.log('\n══════════════════════════════════════════════════════════');
console.log('  SUITE 3: V4 Round-Trip (parsePsadtBlocks / VS Code sync)');
console.log('══════════════════════════════════════════════════════════');

for (const scriptPath of V4_SCRIPTS) {
  if (!existsSync(scriptPath)) {
    console.log(`  ⏭  Skipped (not found): ${scriptPath}`);
    continue;
  }
  try {
    const content = readFileSync(scriptPath, 'utf8');
    const result = parsePsadtBlocks(content);
    const summary = summarizePhases(result?.lifecycle?.phases || {});
    const snapFile = snapKey('v4', scriptPath);
    const parts = scriptPath.split('/');
    const label = `${parts[parts.length - 4]}/${parts[parts.length - 1]}`;
    checkSnapshot(snapFile, summary, label);
  } catch (e) {
    fail(scriptPath.split('/').pop(), `Parse error: ${e.message}`);
  }
}

// ── Results ───────────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════════════');
console.log(`  Results: ${passed} passed  |  ${failed} failed`);
console.log('══════════════════════════════════════════════════════════\n');

if (failed > 0) {
  console.error('❌ REGRESSIONS DETECTED — do not proceed with changes\n');
  process.exit(1);
} else {
  console.log('✅ All tests passed — safe to proceed\n');
}
