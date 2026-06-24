/**
 * test-pkware-roundtrip.mjs
 * Tests the actual v3example.ps1 round-trip against v4example.ps1 expected output.
 */
import { readFileSync } from 'fs';
import { pathToFileURL } from 'url';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(__dirname, '../src/lib');

const { parsePsadtFile } = await import(pathToFileURL(resolve(srcDir, 'parsePsadt.js')));
const generatePsadtScript = (await import(pathToFileURL(resolve(srcDir, 'generatePsadtScript.js')))).default;

const v3Text = readFileSync('/Users/wissammazboudi/Development/SPA/v3example.ps1', 'utf8');

const mockFile = { name: 'Deploy-Application.ps1', text: async () => v3Text };
const result = await parsePsadtFile(mockFile, 'refactor-convert');

console.log(`Detected: ${result.psadtVersion}\n`);

const phases = result.parsedPhases || {};
console.log('=== Parsed Phases ===');
for (const [phase, actions] of Object.entries(phases)) {
  if (!Array.isArray(actions) || actions.length === 0) continue;
  console.log(`\n[${phase}] (${actions.length} actions):`);
  for (const a of actions) {
    const extra = a.file ? ` file=${a.file}` : a.appName ? ` appName=${a.appName}` : a.name ? ` name=${a.name}` : '';
    const type2 = a.regType ? ` regType=${a.regType}` : a.action ? ` action=${a.action}` : '';
    const warn = (a.type === 'raw_ps') ? ' ⚠ raw_ps' : '';
    console.log(`  - ${a.type}${extra}${type2}${warn}: ${(a.desc || '').slice(0, 70)}`);
  }
}

// Build minimal state and generate
const minimalState = {
  wizardMode: 'refactor',
  platform: 'windows',
  displayName: 'PKWARE PK Protect',
  publisher: 'PKWARE, Inc',
  version: '20.35.0008',
  packageId: 'pkware-pk-protect',
  installerType: 'msi',
  deployMode: 'Silent',
  lifecycle: {
    phases: {
      variableDeclaration: { actions: phases.variableDeclaration || [] },
      preInstall: { enabled: true, actions: phases.preInstall || [] },
      install: { enabled: true, actions: phases.install || [] },
      postInstall: { enabled: true, actions: phases.postInstall || [] },
      preUninstall: { enabled: true, actions: phases.preUninstall || [] },
      uninstall: { enabled: true, actions: phases.uninstall || [] },
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

console.log('\n=== Key Commands in Generated v4 ===');
const keyLines = v4Script.split('\n').filter(l =>
  /Start-ADT|Show-ADT|Stop-ADT|Write-ADT|Set-ADT|Remove-ADT|Uninstall-ADT|Copy-ADT|Invoke-ADT/.test(l) &&
  !/^\s*#/.test(l) && !/function\s/.test(l)
);
keyLines.forEach(l => console.log(' ', l.trim()));

// Check specific commands
console.log('\n=== Verification ===');
const checks = [
  { label: 'MSI Install present',     pass: /Start-ADTMsiProcess.*Install/i.test(v4Script) },
  { label: 'Smartcrypt uninstall',     pass: /Uninstall-ADTApplication.*Smartcrypt/i.test(v4Script) },
  { label: 'PK Protect uninstall',     pass: /Uninstall-ADTApplication.*PK Protect/i.test(v4Script) },
  { label: 'Registry DWORD type',      pass: /Set-ADTRegistryKey.*DWORD/i.test(v4Script) },
  { label: 'No v3 Execute-MSI',        pass: !/\bExecute-MSI\b/.test(v4Script) },
  { label: 'No v3 Remove-MSIApps',     pass: !/\bRemove-MSIApplications\b/.test(v4Script) },
  { label: 'No Write-Log (v3)',         pass: !/^\s+Write-Log\b/m.test(v4Script) },
];
for (const c of checks) {
  console.log(`${c.pass ? '✅' : '❌'} ${c.label}`);
}
