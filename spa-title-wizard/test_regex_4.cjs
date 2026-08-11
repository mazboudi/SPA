const v3ToV4 = {
  parameters: [
    {
      matchCmdlets: ["Start-ADTProcess", "Start-ADTProcessAsUser", "Start-ADTMsiProcess", "Start-ADTMspProcess"],
      v3: "-Path",
      v4: "-FilePath"
    }
  ]
};

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

let result = `Execute-Process -Path "C:\\Temp\\setup.exe" -Parameters "/S"`;
// Mock step 1: cmdlet rename
result = result.replace(/Execute-Process/gi, 'Start-ADTProcess');
console.log("After cmdlet:", result);

for (const { matchCmdlets, v3, v4 } of v3ToV4.parameters) {
  const cmdPat = matchCmdlets.map(escapeRe).join('|');
  const re = new RegExp(`((?:${cmdPat})[^\\n]*)${escapeRe(v3)}\\b`, 'gi');
  result = result.replace(re, (_, p1) => `${p1}${v4}`);
}
console.log("After params:", result);
