import { extractVarDeclarationsV4 } from './src/lib/parsePsadt.js';

// I need to use regex
const t = `New-ADTShortcut -Path "$env:ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\Fiserv Drive Mapper\\Fiserv Drive Mapper 1.0.lnk" -TargetPath "C:\\Program Files\\Fiserv Drive Mapper\\DriveMapping.exe" -IconLocation "C:\\Program Files\\Fiserv Drive Mapper\\DriveMapping.exe" -Description 'Fiserv Drive Mapper' -WorkingDirectory "C:\\Program Files\\Fiserv Drive Mapper" -ContinueOnError $false`;
const match = t.match(/New-(?:ADT)?Shortcut\s+.*-Path\s+['"]([^'"]+)['"]\s+.*-TargetPath\s+['"]([^'"]+)['"]/i);
console.log(match);
