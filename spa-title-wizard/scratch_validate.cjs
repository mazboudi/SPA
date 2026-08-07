const fs = require('fs');
const psm1Path = '/Users/wissammazboudi/Development/SPA/frameworks/psadt-enterprise/versions/4.1.0/PSAppDeployToolkit/PSAppDeployToolkit.psm1';
const psm1Content = fs.readFileSync(psm1Path, 'utf8');

function getCmdletParams(cmdletName) {
  const funcRegex = new RegExp(`function\\s+${cmdletName}\\s*\\{`, 'i');
  const match = psm1Content.match(funcRegex);
  if (!match) return null;
  
  const startIdx = match.index;
  const paramMatch = psm1Content.substring(startIdx).match(/param\s*\(/i);
  if (!paramMatch) return [];
  
  const paramStartIdx = startIdx + paramMatch.index + paramMatch[0].length;
  let braceCount = 1;
  let paramBlockEnd = -1;
  
  for (let i = paramStartIdx; i < psm1Content.length; i++) {
    if (psm1Content[i] === '(') braceCount++;
    if (psm1Content[i] === ')') braceCount--;
    if (braceCount === 0) {
      paramBlockEnd = i;
      break;
    }
  }
  
  if (paramBlockEnd === -1) return [];
  
  const paramBlock = psm1Content.substring(paramStartIdx, paramBlockEnd);
  const paramNames = [];
  const regex = /\$([a-zA-Z0-9_]+)/g;
  let paramNameMatch;
  while ((paramNameMatch = regex.exec(paramBlock)) !== null) {
    // Basic filter to ignore common inner variables if any, but since it's the Param block, 
    // most $vars are parameters.
    paramNames.push(paramNameMatch[1]);
  }
  return [...new Set(paramNames)];
}

const cmdsToCheck = [
  'Start-ADTMsiProcess', 'Start-ADTMspProcess', 'Start-ADTProcess', 'Start-ADTProcessAsUser',
  'Show-ADTInstallationWelcome', 'Get-ADTRegistryKey', 'Set-ADTRegistryKey', 'Test-ADTRegistryValue',
  'Uninstall-ADTApplication', 'Get-ADTApplication', 'Copy-ADTFile'
];

cmdsToCheck.forEach(cmd => {
  console.log(`\n--- ${cmd} ---`);
  const params = getCmdletParams(cmd);
  if (params) {
    console.log(params.map(p => '-' + p).join(', '));
  } else {
    console.log('NOT FOUND');
  }
});
