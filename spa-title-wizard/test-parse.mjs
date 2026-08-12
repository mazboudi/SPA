import fs from 'fs';
import { parsePsadtFile } from './src/lib/parsePsadt.js';
const content = fs.readFileSync('/Users/wissammazboudi/Development/SPA/RefactorApps/samplePSADT/Verient-DEsktop-Deploy-Application.ps1', 'utf8');
const fileObj = new File([content], 'Verient-DEsktop-Deploy-Application.ps1', { type: 'text/plain' });

async function run() {
  const parsed = await parsePsadtFile(fileObj, 'convert');
  console.log(JSON.stringify(parsed.lifecycle, null, 2));
}

run();
