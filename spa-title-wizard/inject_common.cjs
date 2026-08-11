const fs = require('fs');
const file = '/Users/wissammazboudi/Development/SPA/spa-title-wizard/src/config/parameters.json';
const data = JSON.parse(fs.readFileSync(file, 'utf8'));

const cmdlets = [...new Set(data.filter(p => p.cmdlet && p.cmdlet !== 'custom_script').map(p => p.cmdlet))];

const toAdd = cmdlets.map(c => ({
  cmdlet: c,
  parameter: 'commonParams',
  label: 'Common Parameters (-ErrorAction, -Verbose, etc.)',
  type: 'text',
  placeholder: '-ErrorAction Stop -Verbose'
}));

// Add them right before the first custom_script parameter
const idx = data.findIndex(p => p.cmdlet === 'custom_script');
if (idx > -1) {
  data.splice(idx, 0, ...toAdd);
} else {
  data.push(...toAdd);
}

fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
console.log('Added commonParams to ' + cmdlets.length + ' cmdlets.');
