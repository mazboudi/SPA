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

let result = `
Execute-Process -Path "A" -Path "B"
Start-ADTProcess -Path "C"
`;

for (const { matchCmdlets, v3, v4 } of v3ToV4.parameters) {
  const cmdPat = matchCmdlets.map(escapeRe).join('|');
  const lineRegex = new RegExp(`^.*(?:${cmdPat}).*$`, 'gim');
  result = result.replace(lineRegex, (line) => {
    return line.replace(new RegExp(`\\s${escapeRe(v3)}\\b`, 'gi'), ` ${v4}`);
  });
}
console.log(result);
