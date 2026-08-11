const fs = require('fs');
const file = '/Users/wissammazboudi/Development/SPA/spa-title-wizard/src/lib/generatePsadtScript.js';
let data = fs.readFileSync(file, 'utf8');

// Insert `const cp = ...` before the switch
data = data.replace(
  '  switch (action.type) {',
  '  const cp = action.commonParams ? ` ${action.commonParams}` : \'\';\n  switch (action.type) {'
);

// We need to inject ${cp} into the main cmd lines.
// Let's do it manually for the most important ones via regex.
const replacements = [
  ['Start-ADTMsiProcess -Action ${psString(msiAction)}${filePart}${pcPart}${args}${transform}${addlArgs}${patches}${logName}${successCodes}${rebootCodes}${pt}',
   'Start-ADTMsiProcess -Action ${psString(msiAction)}${filePart}${pcPart}${args}${transform}${addlArgs}${patches}${logName}${successCodes}${rebootCodes}${pt}${cp}'],
  
  ['Start-ADTProcess${fp}${args}${winStyle}${successCodes}${rebootCodes}${pt}',
   'Start-ADTProcess${fp}${args}${winStyle}${successCodes}${rebootCodes}${pt}${cp}'],
   
  ['Uninstall-ADTApplication${namePart}${nameMatchPart}${pcPart}${typePart}${filterScriptPart}${argsPart}${addlArgsPart}${succCodes}${rebtCodes}${pt}',
   'Uninstall-ADTApplication${namePart}${nameMatchPart}${pcPart}${typePart}${filterScriptPart}${argsPart}${addlArgsPart}${succCodes}${rebtCodes}${pt}${cp}'],
   
  ['Copy-ADTFile -Path ${psString(srcPath)} -Destination ${psString(destPath)}${recurse}${flatten}${mode}${contErr}${rbcParams}${rbcAdd}',
   'Copy-ADTFile -Path ${psString(srcPath)} -Destination ${psString(destPath)}${recurse}${flatten}${mode}${contErr}${rbcParams}${rbcAdd}${cp}'],
   
  ['Remove-ADTFile -LiteralPath ${psString(action.literalPath)}${rmRecurse}',
   'Remove-ADTFile -LiteralPath ${psString(action.literalPath)}${rmRecurse}${cp}'],
   
  ['Remove-ADTFile -Path ${psString(action.path || \'\')}${rmRecurse}',
   'Remove-ADTFile -Path ${psString(action.path || \'\')}${rmRecurse}${cp}'],
   
  ['Remove-ADTFolder -Path ${psString(action.path)}${disableRec}',
   'Remove-ADTFolder -Path ${psString(action.path)}${disableRec}${cp}'],
   
  ['Set-ADTRegistryKey -LiteralPath ${psString(action.key)} -Name ${psString(action.name)}${regType} -Value ${psString(action.value)}${sid}',
   'Set-ADTRegistryKey -LiteralPath ${psString(action.key)} -Name ${psString(action.name)}${regType} -Value ${psString(action.value)}${sid}${cp}'],
   
  ['Remove-ADTRegistryKey -LiteralPath ${psString(action.key)}${name}${recurse}',
   'Remove-ADTRegistryKey -LiteralPath ${psString(action.key)}${name}${recurse}${cp}'],
   
  ['Start-ADTProcessAsUser -FilePath ${psString(action.file)}${args}${successCodes}${rebootCodes}${pt}',
   'Start-ADTProcessAsUser -FilePath ${psString(action.file)}${args}${successCodes}${rebootCodes}${pt}${cp}'],
   
  ['Start-ADTMsiProcessAsUser -Action ${psString(msiAction)}${filePart}${pcPart}${args}${addlArgs}${transform}${patches}${successCodes}${rebootCodes}${pt}',
   'Start-ADTMsiProcessAsUser -Action ${psString(msiAction)}${filePart}${pcPart}${args}${addlArgs}${transform}${patches}${successCodes}${rebootCodes}${pt}${cp}'],
   
  ['Copy-ADTFileToUserProfiles -Path "$($adtSession.DirFiles)\\\\${action.source}" -Destination ${psString(action.destination)}',
   'Copy-ADTFileToUserProfiles -Path "$($adtSession.DirFiles)\\\\${action.source}" -Destination ${psString(action.destination)}${cp}'],
   
  ['New-ADTShortcut -Path ${psString(action.shortcutPath)} -TargetPath ${psString(action.targetPath)}${args}${icon}${desc}${workDir}${ws}${admin}${hotkey}',
   'New-ADTShortcut -Path ${psString(action.shortcutPath)} -TargetPath ${psString(action.targetPath)}${args}${icon}${desc}${workDir}${ws}${admin}${hotkey}${cp}'],
   
  ['Remove-ADTFileFromUserProfiles -Path ${psString(action.path)}',
   'Remove-ADTFileFromUserProfiles -Path ${psString(action.path)}${cp}']
];

for (const [find, replace] of replacements) {
  if (!data.includes(find)) {
    console.warn('Could not find:', find);
  }
  data = data.replace(find, replace);
}

fs.writeFileSync(file, data);
console.log('generatePsadtScript.js updated.');
