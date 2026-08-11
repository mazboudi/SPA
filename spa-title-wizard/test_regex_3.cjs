let text = `
Get-ADTApplication -Name 'Screen Capture Module' -Exact
Uninstall-ADTApplication -Name 'Desktop' -WildCard -Parameters '/qn'
Select-String -Pattern "foo" -Exact
`;

// capitalize function
function capitalizeFirst(str) {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

const modified = text.replace(/(Get-ADTApplication|Uninstall-ADTApplication)[^\n]+?(?:\s-(Exact|Wildcard|Regex|Contains))\b/gi, (match, cmdlet, matchType) => {
    return match.replace(new RegExp(`\\s-${matchType}\\b`, 'i'), ` -NameMatch '${capitalizeFirst(matchType)}'`);
});

console.log(modified);
