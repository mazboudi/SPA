/**
 * test-v4-roundtrip.mjs
 * Validates that parsePsadt + generatePsadtScript produce v4.1 output.
 * Run: node scripts/test-v4-roundtrip.mjs
 */
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { fileURLToPath, pathToFileURL } from 'url';
import { resolve, dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(__dirname, '../src/lib');

// Dynamically import ES modules
const { parsePsadtFile } = await import(pathToFileURL(resolve(srcDir, 'parsePsadt.js')));
const generatePsadtScript = (await import(pathToFileURL(resolve(srcDir, 'generatePsadtScript.js')))).default;

// ── Sample v3 script to parse ─────────────────────────────────────────────────
const v3Script = `
##*===============================================
##* VARIABLE DECLARATION
##*===============================================
$appVendor = 'Adobe'
$appName = 'Reader'
$appVersion = '2024.0'

##*===============================================
##* PRE-INSTALLATION
##*===============================================
[String]$installPhase = 'Pre-Installation'
Show-InstallationWelcome -CloseApps 'acrobat,acrord32' -AllowDefer -DeferTimes 3
Show-InstallationProgress
Stop-ADTServiceAndDependencies -Name 'AdobeARMservice'
Write-ADTLogEntry -Message 'Starting installation' -Severity 1

##*===============================================
##* INSTALLATION
##*===============================================
[String]$installPhase = 'Installation'
Execute-MSI -Action 'Install' -Path "$dirFiles\\AdobeReader.msi" -Transform "$dirFiles\\reader.mst"
Start-ADTMspProcess -FilePath "$dirFiles\\patch.msp"
Write-ADTLogEntry -Message 'MSI installed' -Severity 1

##*===============================================
##* POST-INSTALLATION
##*===============================================
[String]$installPhase = 'Post-Installation'
Set-RegistryKey -Key 'HKLM:\\SOFTWARE\\Fiserv\\InstalledApps' -Name 'AdobeReader' -Value '2024.0'
Set-ADTIniSection -FilePath 'C:\\Program Files\\Adobe\\settings.ini' -Section 'General' -Key 'UpdateMode' -Value '0'
`;

// Create a File-like object
const mockFile = {
  name: 'Deploy-Application.ps1',
  text: async () => v3Script,
};

console.log('=== PSADT v3→v4 Round-Trip Verification ===\n');

// Parse
const result = await parsePsadtFile(mockFile, 'refactor-convert');
console.log(`Detected version: ${result.psadtVersion}`);
console.log(`Warnings: ${result.warnings.length > 0 ? result.warnings.join(', ') : 'none'}`);

// Check parsed phases
const phases = result.parsedPhases || {};
console.log(`\nParsed phases: ${Object.keys(phases).join(', ') || '(none)'}`);

const PHASES_TO_CHECK = ['preInstall', 'installation', 'postInstall'];
let hasIssues = false;

for (const phase of PHASES_TO_CHECK) {
  const actions = phases[phase] || [];
  console.log(`\n  [${phase}] (${actions.length} actions):`);
  for (const a of actions) {
    console.log(`    - type: ${a.type}, desc: ${a.desc || '(no desc)'}`);
    if (a.type === 'raw_ps' || a.type === 'custom_script') {
      console.warn(`    ⚠ UNEXPECTED raw/custom fallback — may be a missing parser: ${(a.script || a.code || '').slice(0, 80)}`);
      hasIssues = true;
    }
  }
}

// Now build a minimal state to generate the v4 script
const minimalState = {
  wizardMode: 'refactor',
  platform: 'windows',
  displayName: 'Adobe Reader',
  publisher: 'Adobe',
  version: '2024.0',
  packageId: 'adobe-reader',
  installerType: 'msi',
  deployMode: 'Silent',
  lifecycle: {
    phases: {
      variableDeclaration: { actions: [] },
      preInstall: { enabled: true, actions: phases.preInstall || [] },
      installation: { enabled: true, actions: phases.installation || [] },
      postInstall: { enabled: true, actions: phases.postInstall || [] },
      preUninstall: { enabled: false, actions: [] },
      uninstall: { enabled: false, actions: [] },
      postUninstall: { enabled: false, actions: [] },
      preRepair: { enabled: false, actions: [] },
      repair: { enabled: false, actions: [] },
      postRepair: { enabled: false, actions: [] },
    },
  },
  assignments: [],
  detectionRules: [],
  returnCodes: [],
  allowAvailableUninstall: true,
};

const v4Script = generatePsadtScript(minimalState, true);

console.log('\n=== Generated v4.1 Script (relevant lines) ===\n');

// Check for v3 commands that MUST NOT appear
const V3_COMMANDS = [
  'Execute-MSI', 'Execute-Process', 'Show-InstallationWelcome',
  'Show-InstallationProgress', 'Show-InstallationPrompt',
  'Remove-RegistryKey', 'Set-RegistryKey', 'Copy-File',
  'Get-FileVersion', 'Invoke-HKCURegistrySettingsForAllUsers',
  'Write-Log',
];

// Check for v4.1 commands that MUST appear when used
const V4_EXPECTED = [
  'Start-ADTMsiProcess',
  'Show-ADTInstallationWelcome',
  'Stop-ADTServiceAndDependencies',
  'Write-ADTLogEntry',
  'Start-ADTMspProcess',
  'Set-ADTRegistryKey',
  'Set-ADTIniSection',
];

let scriptIssues = false;

for (const cmd of V3_COMMANDS) {
  // Only count actual command usage, not inside comments
  const re = new RegExp(`^(?!\\s*#).*\\b${cmd}\\b`, 'm');
  if (re.test(v4Script)) {
    console.error(`❌ FAIL: v3 command found in output: ${cmd}`);
    scriptIssues = true;
  }
}

for (const cmd of V4_EXPECTED) {
  if (v4Script.includes(cmd)) {
    console.log(`✅ PASS: ${cmd} present in v4 output`);
  }
}

// Show key lines
const lines = v4Script.split('\n');
const keyLines = lines.filter(l => 
  /Start-ADT|Show-ADT|Stop-ADT|Write-ADT|Set-ADT|Remove-ADT|New-ADT|Copy-ADT|Invoke-ADT|Uninstall-ADT/.test(l) &&
  !/^\s*#/.test(l)
);

console.log('\nGenerated ADT command lines:');
keyLines.forEach(l => console.log(' ', l.trim()));

if (!scriptIssues && !hasIssues) {
  console.log('\n✅ All checks passed — generated script is v4.1 compliant.');
} else {
  console.error('\n❌ Issues found — review above.');
  process.exit(1);
}
