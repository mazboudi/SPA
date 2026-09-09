import JSZip from '../../spa-title-wizard/node_modules/jszip/dist/jszip.min.js';
import fs from 'fs';

const filePath = '/Users/wissammazboudi/Documents/SPA Confluence/SPADocs/Intake/EUC Approved Software List_090826.xlsx';

async function parseXlsx() {
  try {
    const data = fs.readFileSync(filePath);
    const zip = await JSZip.loadAsync(data);
    
    // 1. Get shared strings
    let sharedStrings = [];
    const sstXml = await zip.file('xl/sharedStrings.xml')?.async('text');
    if (sstXml) {
      const matches = sstXml.match(/<t[^>]*>([^<]*)<\/t>/g) || [];
      sharedStrings = matches.map(m => m.replace(/<t[^>]*>/, '').replace(/<\/t>/, ''));
    }

    // 2. Read sheet1.xml
    const sheetXml = await zip.file('xl/worksheets/sheet1.xml')?.async('text');
    if (!sheetXml) {
      console.log('No sheet1.xml found');
      return;
    }

    // Extract rows
    const rowMatches = sheetXml.match(/<row[^>]*>(.*?)<\/row>/g) || [];
    console.log(`📊 Found ${rowMatches.length} rows in sheet.`);

    const rows = [];
    for (let rIdx = 0; rIdx < Math.min(rowMatches.length, 30); rIdx++) {
      const rowXml = rowMatches[rIdx];
      const cellMatches = rowXml.match(/<c r="([A-Z]+[0-9]+)"([^>]*)>(.*?)<\/c>/g) || [];
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
        rowData[col] = val;
      });

      rows.push(rowData);
    }

    console.log('--- SAMPLE ROWS ---');
    console.log(JSON.stringify(rows.slice(0, 15), null, 2));
  } catch (err) {
    console.error('Error parsing xlsx:', err);
  }
}

parseXlsx();
