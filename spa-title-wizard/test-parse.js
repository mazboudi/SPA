import { extractAllPhasesV4 } from './src/lib/parsePsadt.js';
const text = `
function Install-ADTDeployment {
    #Copy configuration file
    Copy-ADTFile -Path "$($adtSession.DirSupportFiles)\\KeePass.config.enforced.xml" -Destination "$envProgramFiles\\KeePass Password Safe 2\\KeePass.config.enforced.xml"
}
`;
const result = extractAllPhasesV4(text);
console.log(JSON.stringify(result, null, 2));
