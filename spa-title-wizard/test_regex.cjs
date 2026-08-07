const texts = [
  'Execute-MSI -Action "Install" -Path "file.msi" -ContinueOnError $false -Wait',
  'Copy-File -Path "A" -Destination "B" -ContinueOnError',
  'Execute-MSI -ContinueOnError   $true -Action "Install"',
  'Test -ContinueOnErrorVariable $false'
];

texts.forEach(t => {
  console.log(`Original: ${t}`);
  const modified = t.replace(/\s*-ContinueOnError(?:\s+\$(?:true|false))?\b/gi, '');
  console.log(`Modified: ${modified}`);
  console.log('---');
});
