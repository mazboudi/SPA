const fs = require('fs');

const csvPath = '/Users/wissammazboudi/Development/SPA/spa-title-wizard/src/config/psadt_v3_to_v41_command_parameter_mapping.csv';
const jsonPath = '/Users/wissammazboudi/Development/SPA/spa-title-wizard/src/config/v3ToV4.json';

const csvContent = fs.readFileSync(csvPath, 'utf8').split('\n');
const jsonContent = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

// Get all parameter mappings from CSV where v3 != v4.1 and v4.1 is not something generic like "Validate manually"
const csvMappings = [];
for (let i = 1; i < csvContent.length; i++) {
  const line = csvContent[i].trim();
  if (!line) continue;
  
  // Basic CSV split, ignores quotes for now (we know the file structure)
  // Wait, some have quotes. Better to use a regex split or just match.
  // record_type,category,v3_command,v4_1_command,v3_parameter,v4_1_parameter,...
  
  // Let's just match the columns roughly
  // The first 6 columns don't have commas in their values typically.
  const parts = line.split(',');
  if (parts.length >= 6) {
    const recordType = parts[0];
    const v3Cmd = parts[2];
    const v4Cmd = parts[3];
    const v3Param = parts[4];
    const v4Param = parts[5];
    
    if (recordType === 'command_parameter_mapping' && v3Param && v4Param) {
      if (v3Param !== v4Param && v3Param !== 'N/A' && v4Param !== 'N/A' && v3Param !== 'Legacy prompt parameters') {
        // Only valid looking parameter renames like -Something to -SomethingElse
        if (v4Param.startsWith('-') && !v4Param.includes(' ')) {
          csvMappings.push({ cmd: v4Cmd, v3: v3Param, v4: v4Param });
        } else if (v4Param.includes(' or ')) {
          // "-ArgumentList or -AdditionalArgumentList"
          csvMappings.push({ cmd: v4Cmd, v3: v3Param, v4: v4Param.split(' or ')[0] }); // Just take first
        }
      }
    }
  }
}

console.log("CSV Parameter Renames found:");
console.table(csvMappings);

console.log("\nJSON Parameter Renames currently in v3ToV4.json:");
const jsonMappings = [];
jsonContent.parameters.forEach(p => {
  p.matchCmdlets.forEach(cmd => {
    jsonMappings.push({ cmd, v3: p.v3, v4: p.v4 });
  });
});
console.table(jsonMappings);

// Find missing
const missing = csvMappings.filter(cm => {
  return !jsonMappings.some(jm => jm.cmd === cm.cmd && jm.v3 === cm.v3);
});

console.log("\nMissing mappings in JSON:");
console.table(missing);

