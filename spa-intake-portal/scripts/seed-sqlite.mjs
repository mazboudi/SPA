import JSZip from '../../spa-title-wizard/node_modules/jszip/dist/jszip.min.js';
import fs from 'fs';
import { createHash } from 'crypto';
import { db, initSchema } from '../server/db/database.js';

function hashId(str) {
  return createHash('sha256').update(str).digest('hex').slice(0, 20);
}

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

export async function seedDatabase() {
  console.log('🚀 Starting SQLite Catalog & Requests Ingestion...');
  initSchema();

  // Clear existing catalog tables to re-seed fresh
  db.exec(`
    DELETE FROM software_versions;
    DELETE FROM software_titles;
  `);

  console.log('📂 Reading Approved software spreadsheet...');
  const approvedRows = await parseSheet(approvedPath);
  console.log(`   ✅ Parsed ${approvedRows.length} approved rows.`);

  console.log('📂 Reading Denied software spreadsheet...');
  const deniedRows = await parseSheet(deniedPath);
  console.log(`   ✅ Parsed ${deniedRows.length} denied rows.`);

  const catalogMap = new Map();

  function getNormKey(publisher, title) {
    const p = (publisher || 'Unknown').trim().toLowerCase();
    const t = (title || 'Unknown').trim().toLowerCase();
    return `${p}::${t}`;
  }

  const now = new Date().toISOString();

  // 1. Ingest Approved Rows
  approvedRows.forEach(row => {
    const title = row['Software Title'];
    if (!title) return;
    const publisher = row['Publisher Name'] || 'Unknown';
    const key = getNormKey(publisher, title);
    const platform = row['Platform']?.toLowerCase().includes('mac') ? (row['Platform']?.toLowerCase().includes('win') ? ['windows', 'macos'] : ['macos']) : ['windows'];

    if (!catalogMap.has(key)) {
      catalogMap.set(key, {
        id: 'title_' + hashId(key),
        displayName: title,
        publisher,
        category: row['Category'] || 'Business',
        subcategory: row['Subcategory'] || '',
        supportedPlatforms: platform,
        licenseRequired: row['Classification'] === 'Commercial' ? 'Yes' : 'No',
        isSaaSOrInternetFacing: 0,
        dataClassification: 'Internal',
        howToObtain: row['How to obtain'] || 'Intune',
        classification: row['Classification'] || 'Commercial',
        defaultInstallerType: platform.includes('macos') ? { windows: 'msi', macos: 'pkg' } : { windows: 'msi' },
        description: `Enterprise software profile for ${title} by ${publisher}.`,
        createdAt: now,
        updatedAt: now,
        versions: [],
      });
    }

    const entry = catalogMap.get(key);
    const ver = row['Version.'] || 'Standard';
    
    // Conditionally Approved / Review Required if Ariba or review flag
    const isReviewRequired = row['How to obtain'] === 'Ariba' || row['Classification'] === 'Commercial';
    const disposition = isReviewRequired ? 'Review Required' : 'Approved';
    const dispositionReason = isReviewRequired
      ? 'Commercial software: requires Ariba license purchase & SAM entitlement review.'
      : 'Approved standard version for enterprise EUC deployment.';

    let verIdx = entry.versions.length + 1;
    entry.versions.push({
      id: `ver_${entry.id}_app_${verIdx}`,
      titleId: entry.id,
      version: ver,
      disposition,
      dispositionReason,
      alternative: null,
      packagingStatus: row['How to obtain'] === 'Intune' ? 'Packaged & Ready' : 'Available',
      packageRef: row['How to obtain'] === 'Intune' ? { windows: `titles/${entry.id}` } : null,
      installerSource: null,
      createdAt: now,
      updatedAt: now,
    });
  });

  // 2. Ingest Denied Rows
  deniedRows.forEach(row => {
    const title = row['Software Title'];
    if (!title) return;
    const publisher = row['Publisher Name'] || 'Unknown';
    const key = getNormKey(publisher, title);
    const platform = row['Platform']?.toLowerCase().includes('mac') ? (row['Platform']?.toLowerCase().includes('win') ? ['windows', 'macos'] : ['macos']) : ['windows'];

    if (!catalogMap.has(key)) {
      catalogMap.set(key, {
        id: 'title_' + hashId(key),
        displayName: title,
        publisher,
        category: 'Prohibited / Denied',
        subcategory: row['Sub-Category'] || '',
        supportedPlatforms: platform,
        licenseRequired: 'No',
        isSaaSOrInternetFacing: 0,
        dataClassification: 'Internal',
        howToObtain: 'N/A',
        classification: 'Denied',
        defaultInstallerType: { windows: 'msi' },
        description: `Prohibited software model: ${title}.`,
        createdAt: now,
        updatedAt: now,
        versions: [],
      });
    }

    const entry = catalogMap.get(key);
    const ver = row['Software Version'] || 'All Versions';
    let verIdx = entry.versions.length + 1;
    entry.versions.push({
      id: `ver_${entry.id}_den_${verIdx}`,
      titleId: entry.id,
      version: ver,
      disposition: 'Denied',
      dispositionReason: row['Denial Reason'] || 'Software title/version is prohibited by corporate cybersecurity policy.',
      alternative: row['Alternative'] || null,
      packagingStatus: 'Prohibited',
      packageRef: null,
      installerSource: null,
      createdAt: now,
      updatedAt: now,
    });
  });

  console.log(`💾 Inserting ${catalogMap.size} Software Titles and version records into SQLite...`);

  // Insert titles and versions in a fast transaction
  const insertTitleStmt = db.prepare(`
    INSERT INTO software_titles (
      id, displayName, publisher, category, subcategory, supportedPlatforms,
      licenseRequired, isSaaSOrInternetFacing, dataClassification, howToObtain,
      classification, defaultInstallerType, description, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertVerStmt = db.prepare(`
    INSERT INTO software_versions (
      id, titleId, version, disposition, dispositionReason, alternative,
      packagingStatus, packageRef, installerSource, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  db.exec('BEGIN TRANSACTION;');

  let totalVerCount = 0;
  for (const title of catalogMap.values()) {
    insertTitleStmt.run(
      title.id,
      title.displayName,
      title.publisher,
      title.category,
      title.subcategory,
      JSON.stringify(title.supportedPlatforms),
      title.licenseRequired,
      title.isSaaSOrInternetFacing,
      title.dataClassification,
      title.howToObtain,
      title.classification,
      JSON.stringify(title.defaultInstallerType),
      title.description,
      title.createdAt,
      title.updatedAt
    );

    for (const v of title.versions) {
      insertVerStmt.run(
        v.id,
        v.titleId,
        v.version,
        v.disposition,
        v.dispositionReason,
        v.alternative,
        v.packagingStatus,
        v.packageRef ? JSON.stringify(v.packageRef) : null,
        v.installerSource ? JSON.stringify(v.installerSource) : null,
        v.createdAt,
        v.updatedAt
      );
      totalVerCount++;
    }
  }

  db.exec('COMMIT;');

  console.log(`✅ SQLite Seeding Complete!`);
  console.log(`   • ${catalogMap.size} Software Titles stored.`);
  console.log(`   • ${totalVerCount} Version Records stored.`);

  // Ingest Initial Seed Requests if empty
  const reqCount = db.prepare(`SELECT COUNT(*) as count FROM software_requests`).get().count;
  if (reqCount === 0) {
    console.log('📝 Seeding initial demonstration Requests (RITM0010001 - RITM0010004)...');
    seedInitialRequests();
  }
}

function seedInitialRequests() {
  const insertReqStmt = db.prepare(`
    INSERT INTO software_requests (
      id, number, shortDescription, titleId, titleName, publisher, version,
      platform, category, installerType, installerSource, requestedFor,
      requesterEmail, department, targetDevice, installType, deploymentScope,
      businessJustification, disposition, stage, state, priority, submittedAt, updatedAt, packagingArtifacts
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertTaskStmt = db.prepare(`
    INSERT INTO catalog_tasks (
      id, requestId, number, name, assignmentGroup, state, claimedBy, completedBy, completedAt, notes, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const sampleReqs = [
    {
      id: 'REQ0010001',
      number: 'RITM0010001',
      shortDescription: 'Software Request: 1Password for Clover Windows >= 8..0',
      titleId: 'title_1password',
      titleName: '1Password for Clover Windows',
      publisher: 'AgileBits',
      version: '>= 8..0',
      platform: 'windows',
      category: 'Security',
      installerType: 'msi',
      installerSource: '\\\\corp.fiserv.net\\packages\\1Password\\8.0\\1Password.msi',
      requestedFor: 'Alex Johnson',
      requesterEmail: 'alex.johnson@fiserv.com',
      department: 'Digital Banking Engineering',
      targetDevice: 'W11-ENG-08912',
      installType: 'New Install',
      deploymentScope: 'Individual',
      businessJustification: 'Enterprise password management required for secure authentication across production environments.',
      disposition: 'Approved',
      stage: 'packaging',
      state: 'In Packaging',
      priority: 'High',
      submittedAt: '2026-08-20T09:30:00.000Z',
      updatedAt: '2026-08-25T14:15:10.859Z',
      tasks: [
        { id: 'TASK0010001', number: 'SCTASK0010001', name: 'Manager Approval', assignmentGroup: 'Management', state: 'Closed Complete', completedBy: 'Sarah Miller (Manager)', notes: 'Approved for developer workstation.' },
        { id: 'TASK0010002', number: 'SCTASK0010002', name: 'SAM License Review', assignmentGroup: 'Software Asset Management', state: 'Closed Complete', completedBy: 'David Chen (SAM)', notes: 'Enterprise license entitlement confirmed.' },
        { id: 'TASK0010003', number: 'SCTASK0010003', name: 'Packaging Review & Execution', assignmentGroup: 'EUC Software Packaging Team', state: 'Open', claimedBy: 'Packaging Engineer', notes: 'Ready for packaging in SPA Workbench.' },
      ]
    },
    {
      id: 'REQ0010002',
      number: 'RITM0010002',
      shortDescription: 'Software Request: .NET SDK (dotnet) >=9.0.100',
      titleId: 'title_dotnet',
      titleName: '.NET SDK (dotnet)',
      publisher: 'Microsoft',
      version: '>=9.0.100',
      platform: 'windows',
      category: 'Development',
      installerType: 'msi',
      installerSource: '',
      requestedFor: 'Michael Chang',
      requesterEmail: 'michael.chang@fiserv.com',
      department: 'Cloud Platform Architecture',
      targetDevice: 'W11-ENG-04421',
      installType: 'Version Upgrade',
      deploymentScope: 'Department',
      businessJustification: 'Upgrading team build runners to .NET 9.0 SDK standard.',
      disposition: 'Approved',
      stage: 'packaging',
      state: 'In Packaging',
      priority: 'High',
      submittedAt: '2026-08-21T10:15:00.000Z',
      updatedAt: '2026-08-21T11:45:00.000Z',
      tasks: [
        { id: 'TASK0010004', number: 'SCTASK0010004', name: 'Manager Approval', assignmentGroup: 'Management', state: 'Closed Complete', completedBy: 'Elena Rostova (Dev Lead)', notes: 'Approved for platform engineering.' },
        { id: 'TASK0010005', number: 'SCTASK0010005', name: 'Packaging Review & Execution', assignmentGroup: 'EUC Software Packaging Team', state: 'Open', notes: 'Surfaced in SPA Packaging Workbench queue.' },
      ]
    }
  ];

  sampleReqs.forEach(req => {
    insertReqStmt.run(
      req.id, req.number, req.shortDescription, req.titleId, req.titleName, req.publisher,
      req.version, req.platform, req.category, req.installerType, req.installerSource,
      req.requestedFor, req.requesterEmail, req.department, req.targetDevice, req.installType,
      req.deploymentScope, req.businessJustification, req.disposition, req.stage, req.state,
      req.priority, req.submittedAt, req.updatedAt, null
    );
    req.tasks.forEach(t => {
      insertTaskStmt.run(
        t.id, req.id, t.number, t.name, t.assignmentGroup, t.state,
        t.claimedBy || null, t.completedBy || null, t.completedAt || null,
        t.notes || null, req.submittedAt, req.updatedAt
      );
    });
  });
}

// Run when executed directly
seedDatabase().catch(err => {
  console.error('Error seeding database:', err);
  process.exit(1);
});
