const text = `
function Install-ADTDeployment
{
    [CmdletBinding()]
    param
    (
    )

    ##================================================
    ## MARK: Pre-Install
    ##================================================
    $adtSession.InstallPhase = "Pre-$($adtSession.DeploymentType)"

    Show-InstallationWelcome
}
`;

const lines = text.split('\n');
let i = 0;
while (i < lines.length) {
  const line = lines[i];
  const trimmed = line.trim();
  
  if (trimmed.startsWith('[CmdletBinding()]')) {
    let paramParen = 0;
    let seenParamBlock = false;
    let lineLimit = 50;

    console.log('Skipping CmdletBinding line:', i);

    while (i + 1 < lines.length && lineLimit-- > 0) {
      i++;
      const innerLine = lines[i];
      const innerTrimmed = innerLine.trim();
      
      if (innerTrimmed.startsWith('param')) {
        seenParamBlock = true;
      }
      
      for (const ch of innerLine) {
        if (ch === '(') paramParen++;
        if (ch === ')') paramParen--;
      }
      
      console.log('Skipped inner line:', i, innerLine, 'seenParamBlock:', seenParamBlock, 'paramParen:', paramParen);
      
      if (seenParamBlock && paramParen <= 0 && innerTrimmed.endsWith(')')) {
        break;
      }
    }
    console.log('Finished skipping at line:', i);
    i++;
    continue;
  }
  
  console.log('Processed line:', i, line);
  i++;
}
