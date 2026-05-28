import { parsePsadtFile, toWizardState } from '../src/lib/parsePsadt.js';
import generatePsadtScript from '../src/lib/generatePsadtScript.js';
import fs from 'fs';

class FileMock {
  constructor(name, content) {
    this.name = name;
    this.content = content;
  }
  async text() {
    return this.content;
  }
}

async function run() {
  const filePath = '/Users/wissammazboudi/Documents/workspace/gravity/SPA/RefactorApps/samplePSADT/PKProtect-Deploy-Application.ps1';
  const content = fs.readFileSync(filePath, 'utf8');
  const fileMock = new FileMock('PKProtect-Deploy-Application.ps1', content);

  console.log('🔄 Parsing PSADT file with new contiguous buffering strategy...');
  const result = await parsePsadtFile(fileMock, 'refactor-convert');
  
  console.log('✅ Parsing completed!');
  console.log('Warnings:', result.warnings);

  console.log('\n--- EXTRACTED PHASES ACTIONS ---');
  for (const [phase, actions] of Object.entries(result.parsedPhases)) {
    console.log(`Phase: ${phase} (${actions.length} actions)`);
    if (phase === 'postInstall') {
      console.log(JSON.stringify(actions, null, 2));
    }
  }

  // Generate Wizard State
  const wizardState = {
    ...toWizardState(result),
    lifecycle: {
      phases: {
        variableDeclaration: { actions: result.parsedPhases.variableDeclaration || [] },
        preInstall: { actions: result.parsedPhases.preInstall || [] },
        install: { actions: result.parsedPhases.install || [] },
        postInstall: { actions: result.parsedPhases.postInstall || [] },
        preUninstall: { actions: result.parsedPhases.preUninstall || [] },
        uninstall: { actions: result.parsedPhases.uninstall || [] },
        postUninstall: { actions: result.parsedPhases.postUninstall || [] },
        preRepair: { actions: result.parsedPhases.preRepair || [] },
        repair: { actions: result.parsedPhases.repair || [] },
        postRepair: { actions: result.parsedPhases.postRepair || [] },
      }
    }
  };

  console.log('\n🔄 Compiling Pristine Script...');
  const pristineScript = generatePsadtScript(wizardState, true);
  fs.writeFileSync('/Users/wissammazboudi/Documents/workspace/gravity/SPA/RefactorApps/PSADTScripts/Invoke-AppDeployToolkit.ps1', pristineScript, 'utf8');
  console.log('💾 Wrote pristine script to RefactorApps/PSADTScripts/Invoke-AppDeployToolkit.ps1');

  // Let's print out the Post-Install section of the compiled script to verify it has balanced braces
  const lines = pristineScript.split('\n');
  const postInstallIdx = lines.findIndex(l => l.includes('MARK: Post-Install'));
  const uninstallIdx = lines.findIndex(l => l.includes('function Uninstall-ADTDeployment'));
  
  console.log('\n--- COMPILED SCRIPT POST-INSTALL BODY ---');
  console.log(lines.slice(postInstallIdx, uninstallIdx).join('\n'));
}

run().catch(err => {
  console.error('❌ Error during test run:', err);
});
