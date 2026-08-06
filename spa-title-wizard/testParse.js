import parsePsadt from './src/lib/parsePsadt.js';
import fs from 'fs';
const content = fs.readFileSync('../RefactorApps/samplePSADT/FiservDriveMapper-Deploy-Application.ps1', 'utf8');
const result = parsePsadt(content);
fs.writeFileSync('/tmp/parsed.json', JSON.stringify(result, null, 2));
console.log('Saved to /tmp/parsed.json');
