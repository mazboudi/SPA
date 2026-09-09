import JSZip from '../../spa-title-wizard/node_modules/jszip/dist/jszip.min.js';
import fs from 'fs';

const approvedPath = '/Users/wissammazboudi/Documents/SPA Confluence/SPADocs/Intake/EUC Approved Software List_090826.xlsx';
const deniedPath = '/Users/wissammazboudi/Documents/SPA Confluence/SPADocs/Intake/EUC Denied Software List_090826.xlsx';

async function parseSheet(filePath) {
  const data = fs.readFileSync(filePath);
  const zip = await JSZip.loadAsync(data);
  let sharedStrings = [];
  const sstXml = await zip.file('xl/sharedStrings.xml')?.async('text');
  if (sstXml) {
    const matches = sstXml.match(/<t[^>]*>([^<]*)<\/t>/g) || [];
    sharedStrings = matches.map(m => m.replace(/<t[^>]*>/, '').replace(/<\/t>/, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
  }
  const sheetXml = await zip.file('xl/worksheets/sheet1.xml')?.async('text');
  const rowMatches = sheetXml.match(/<row[^>]*>(.*?)<\/row>/g) || [];
  
  const rows = [];
  // First row is header
  let headers = {};
  for (let rIdx = 0; rIdx < rowMatches.length; rIdx++) {
    const rowXml = rowMatches[rIdx];
    const cellMatches = rowXml.match(/<c r="([A-Z]+)[0-9]+"([^>]*)>(.*?)<\/c>/g) || [];
    const rowData = {};
    cellMatches.forEach(cXml => {
      const refMatch = cXml.match(/r="([A-Z]+)[0-9]+"/);
      const col = refMatch ? refMatch[1] : '?';
      const isString = cXml.includes('t="s"');
      const valMatch = cXml.match(/<v>([^<]*)<\/v>/);
      let val = valMatch ? valMatch[1] : '';
      if (isString && val !== '') {
        const sIdx = parseInt(val, 10);
        val = sharedStrings[sIdx] || val;
      }
      rowData[col] = (val || '').trim();
    });

    if (rIdx === 0) {
      headers = rowData;
    } else {
      const namedRow = {};
      Object.keys(rowData).forEach(col => {
        const hName = headers[col] || col;
        namedRow[hName] = rowData[col];
      });
      rows.push(namedRow);
    }
  }
  return rows;
}

async function analyze() {
  console.log('Reading Approved spreadsheet...');
  const approvedRows = await parseSheet(approvedPath);
  console.log(`✅ Loaded ${approvedRows.length} approved rows.`);

  console.log('Reading Denied spreadsheet...');
  const deniedRows = await parseSheet(deniedPath);
  console.log(`✅ Loaded ${deniedRows.length} denied rows.`);

  // Map by normalized key: publisher + "::" + title
  const catalogMap = new Map();

  function getNormKey(publisher, title) {
    const p = (publisher || 'Unknown').trim().toLowerCase();
    const t = (title || 'Unknown').trim().toLowerCase();
    return `${p}::${t}`;
  }

  // 1. Process Approved
  approvedRows.forEach(row => {
    const title = row['Software Title'];
    if (!title) return;
    const publisher = row['Publisher Name'] || 'Unknown';
    const key = getNormKey(publisher, title);
    const platform = row['Platform']?.toLowerCase().includes('mac') ? (row['Platform']?.toLowerCase().includes('win') ? ['windows', 'macos'] : ['macos']) : ['windows'];

    if (!catalogMap.has(key)) {
      catalogMap.set(key, {
        id: 'title_' + Buffer.from(key).toString('hex').slice(0, 12),
        displayName: title,
        publisher,
        category: row['Category'] || 'Business',
        subcategory: row['Subcategory'] || '',
        supportedPlatforms: platform,
        licenseRequired: row['Classification'] === 'Commercial' ? 'Yes' : 'No',
        howToObtain: row['How to obtain'] || 'Intune',
        classification: row['Classification'] || 'Commercial',
        versions: [],
      });
    }

    const entry = catalogMap.get(key);
    const ver = row['Version.'] || 'Standard';
    entry.versions.push({
      version: ver,
      disposition: 'Approved',
      dispositionReason: 'Approved for enterprise EUC deployment.',
      packagingStatus: row['How to obtain'] === 'Intune' ? 'Packaged & Ready' : 'Available',
      howToObtain: row['How to obtain'] || 'Intune',
    });
  });

  // 2. Process Denied
  deniedRows.forEach(row => {
    const title = row['Software Title'];
    if (!title) return;
    const publisher = row['Publisher Name'] || 'Unknown';
    const key = getNormKey(publisher, title);
    const platform = row['Platform']?.toLowerCase().includes('mac') ? (row['Platform']?.toLowerCase().includes('win') ? ['windows', 'macos'] : ['macos']) : ['windows'];

    if (!catalogMap.has(key)) {
      catalogMap.set(key, {
        id: 'title_' + Buffer.from(key).toString('hex').slice(0, 12),
        displayName: title,
        publisher,
        category: 'Prohibited / Denied',
        subcategory: row['Sub-Category'] || '',
        supportedPlatforms: platform,
        licenseRequired: 'No',
        howToObtain: 'N/A',
        classification: 'Denied',
        versions: [],
      });
    }

    const entry = catalogMap.get(key);
    const ver = row['Software Version'] || 'All Versions';
    entry.versions.push({
      version: ver,
      disposition: 'Denied',
      dispositionReason: row['Denial Reason'] || 'Software title/version is prohibited by EUC security policy.',
      alternative: row['Alternative'] || '',
      packagingStatus: 'Prohibited',
    });
  });

  console.log(`\n🎉 Unified Catalog created with ${catalogMap.size} distinct Software Title Models!`);
  
  // Count dispositions
  let totalApprovedVer = 0;
  let totalDeniedVer = 0;
  let hybridTitles = 0;

  for (const item of catalogMap.values()) {
    const hasApproved = item.versions.some(v => v.disposition === 'Approved');
    const hasDenied = item.versions.some(v => v.disposition === 'Denied');
    if (hasApproved && hasDenied) hybridTitles++;
    item.versions.forEach(v => {
      if (v.disposition === 'Approved') totalApprovedVer++;
      if (v.disposition === 'Denied') totalDeniedVer++;
    });
  }

  console.log(`   - Total Approved Version Records: ${totalApprovedVer}`);
  console.log(`   - Total Denied Version Records:   ${totalDeniedVer}`);
  console.log(`   - Titles with BOTH Approved & Denied versions (Hybrid): ${hybridTitles}`);
}

analyze();
