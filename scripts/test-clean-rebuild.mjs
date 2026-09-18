import JSZip from '../spa-title-wizard/node_modules/jszip/dist/jszip.min.js';
import fs from 'fs';
import { createHash } from 'crypto';

function hashId(str) {
  return createHash('sha256').update(str).digest('hex').slice(0, 16);
}

function norm(str) {
  if (!str) return '';
  return str.toLowerCase()
    .replace(/[®™©]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getNormKey(publisher, title) {
  const p = norm(publisher || 'Unknown');
  const t = norm(title || 'Unknown');
  return p + '::' + t;
}

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

async function dryRun() {
  console.log('📂 Reading files...');
  const approvedRows = await parseSheet('./data/EUC Approved Software List_090826.xlsx');
  const deniedRows = await parseSheet('./data/EUC Denied Software List_090826.xlsx');
  const intuneData = JSON.parse(fs.readFileSync('./intune-catalog-extracted.json', 'utf8'));
  const intuneApps = intuneData.applications;

  console.log(`   - Approved rows: ${approvedRows.length}`);
  console.log(`   - Denied rows: ${deniedRows.length}`);
  console.log(`   - Intune apps: ${intuneApps.length}`);

  const modelMap = new Map();

  // 1. Process Approved
  for (const row of approvedRows) {
    const title = (row['Software Title'] || '').trim();
    if (!title) continue;
    const publisher = (row['Publisher Name'] || 'Unknown').trim();
    const key = getNormKey(publisher, title);
    const ver = (row['Version.'] || '').trim();
    const cat = (row['Category'] || '').trim() || 'Business';

    let policy = 'all';
    let appRule = '*';
    if (ver && ver !== 'NA' && ver !== 'Standard' && ver !== 'All') {
      policy = 'version_range';
      appRule = ver.startsWith('>=') || ver.startsWith('>') ? ver : '>= ' + ver;
    }

    modelMap.set(key, {
      id: 'title_' + hashId(key),
      displayName: title,
      publisher,
      category: cat,
      subcategory: (row['Subcategory'] || '').trim(),
      supportedPlatforms: row['Platform']?.toLowerCase().includes('mac') ? (row['Platform']?.toLowerCase().includes('win') ? ['windows', 'macos'] : ['macos']) : ['windows'],
      licenseRequired: row['Classification'] === 'Commercial' ? 'Yes' : 'No',
      classification: row['Classification'] || 'Commercial',
      howToObtain: row['How to obtain'] || 'Intune',
      defaultDisposition: 'Approved',
      approvalPolicy: policy,
      approvedVersionRule: appRule,
      deniedVersionRule: null,
      policyRationale: 'Approved standard software for enterprise EUC deployment.',
      mandatedAlternative: null
    });
  }

  // 2. Process Denied
  let hybridCount = 0;
  let fullDeniedCount = 0;
  for (const row of deniedRows) {
    const title = (row['Software Title'] || '').trim();
    if (!title) continue;
    const publisher = (row['Publisher Name'] || 'Unknown').trim();
    const key = getNormKey(publisher, title);
    const ver = (row['Software Version'] || 'All Versions').trim();
    const reason = (row['Denial Reason'] || 'Prohibited by EUC cybersecurity policy.').trim();
    const alt = (row['Alternative'] || '').trim();
    const isAll = ver.toUpperCase() === 'ALL' || ver.toLowerCase() === 'all versions' || ver === '*';

    if (modelMap.has(key)) {
      const m = modelMap.get(key);
      if (isAll && m.approvedVersionRule === '*') {
        // End-of-life or completely prohibited title (e.g. .NET 5.0)
        m.defaultDisposition = 'Denied';
        m.approvalPolicy = 'prohibited';
        m.approvedVersionRule = null;
        m.deniedVersionRule = 'ALL';
        m.category = 'Prohibited / Denied';
        m.policyRationale = reason;
        m.mandatedAlternative = alt || null;
        fullDeniedCount++;
      } else {
        // Floor rule: versions below baseline prohibited
        hybridCount++;
        m.approvalPolicy = 'version_range';
        m.deniedVersionRule = ver.startsWith('<') ? ver : '< ' + ver;
        m.policyRationale = `Versions below approved floor (${m.approvedVersionRule}) prohibited: ${reason}`;
        m.mandatedAlternative = alt || null;
      }
    } else {
      fullDeniedCount++;
      modelMap.set(key, {
        id: 'title_' + hashId(key),
        displayName: title,
        publisher,
        category: 'Prohibited / Denied',
        subcategory: (row['Sub-Category'] || '').trim(),
        supportedPlatforms: row['Platform']?.toLowerCase().includes('mac') ? (row['Platform']?.toLowerCase().includes('win') ? ['windows', 'macos'] : ['macos']) : ['windows'],
        licenseRequired: 'No',
        classification: 'Denied',
        howToObtain: 'N/A',
        defaultDisposition: 'Denied',
        approvalPolicy: 'prohibited',
        approvedVersionRule: null,
        deniedVersionRule: isAll ? 'ALL' : ver,
        policyRationale: reason,
        mandatedAlternative: alt || null
      });
    }
  }

  // 3. Process Intune matching
  let intuneMatched = 0;
  let intuneUnmatched = 0;
  for (const app of intuneApps) {
    const k1 = getNormKey(app.cleanPublisher, app.cleanTitle);
    const k2 = getNormKey(app.rawPublisher, app.rawDisplayName);
    if (modelMap.has(k1) || modelMap.has(k2)) {
      intuneMatched++;
    } else {
      intuneUnmatched++;
    }
  }

  console.log(`\n📊 Results:`);
  console.log(`   - Total Distinct Title Models in Map: ${modelMap.size}`);
  console.log(`   - Hybrid Models (Approved with Prohibited Floor): ${hybridCount}`);
  console.log(`   - Fully Denied/Prohibited Models: ${fullDeniedCount}`);
  console.log(`   - Intune Apps Directly Matched to Models: ${intuneMatched}`);
  console.log(`   - Intune Apps Unmatched (Will create Review Required Models): ${intuneUnmatched}`);

  const dispCounts = {};
  for (const m of modelMap.values()) {
    dispCounts[m.defaultDisposition] = (dispCounts[m.defaultDisposition] || 0) + 1;
  }
  console.log(`   - Base Dispositions:`, dispCounts);
}
dryRun();
