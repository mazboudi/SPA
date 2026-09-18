import JSZip from '../spa-title-wizard/node_modules/jszip/dist/jszip.min.js';
import fs from 'fs';
import { createHash } from 'crypto';
import { DatabaseSync } from 'node:sqlite';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '..', 'spa-intake-portal', 'server', 'data', 'intake.db');
const APPROVED_PATH = join(__dirname, '..', 'data', 'EUC Approved Software List_090826.xlsx');
const DENIED_PATH = join(__dirname, '..', 'data', 'EUC Denied Software List_090826.xlsx');
const INTUNE_PATH = join(__dirname, '..', 'intune-catalog-extracted.json');

console.log('🚀 Starting Clean Catalog Rebuild...');
console.log('Database Path:', DB_PATH);

const db = new DatabaseSync(DB_PATH);

// Helper for deterministic IDs
function hashId(str) {
  return createHash('sha256').update(str).digest('hex').slice(0, 16);
}

// Clean string normalization
function cleanStr(str) {
  if (!str) return '';
  return String(str).trim();
}

function normKey(publisher, title) {
  const p = (publisher || 'Unknown').toLowerCase().replace(/[®™©]/g, '').replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
  const t = (title || 'Unknown').toLowerCase().replace(/[®™©]/g, '').replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
  return `${p}::${t}`;
}

// Intelligent category fallback
function resolveCategory(rawCategory, rawSubcategory, title) {
  const cat = cleanStr(rawCategory);
  if (cat) return cat;

  const sub = (rawSubcategory || '').toLowerCase();
  const t = (title || '').toLowerCase();

  if (sub.includes('developer') || sub.includes('ide') || sub.includes('programming') || sub.includes('runtime') || sub.includes('sdk')) {
    return 'Development';
  }
  if (sub.includes('security') || sub.includes('identity') || sub.includes('access mgmt') || sub.includes('vpn')) {
    return 'Security';
  }
  if (sub.includes('driver') || sub.includes('firmware') || sub.includes('utility') || sub.includes('endpoint') || sub.includes('it operations')) {
    return 'System';
  }
  if (sub.includes('database') || sub.includes('data platform') || sub.includes('business') || sub.includes('analytics') || sub.includes('finance') || sub.includes('document')) {
    return 'Business';
  }

  // Check title keywords
  if (t.includes('driver') || t.includes('agent') || t.includes('tool') || t.includes('printer')) {
    return 'System';
  }
  if (t.includes('studio') || t.includes('sdk') || t.includes('compiler') || t.includes('.net')) {
    return 'Development';
  }

  return 'General Business';
}

// XLSX streaming-style parser
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
      rowData[col] = cleanStr(val);
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

async function rebuild() {
  const now = new Date().toISOString();

  // 1. Ensure Schema
  console.log('1️⃣ Setting up clean SQLite schema...');
  db.exec(`
    DROP TABLE IF EXISTS software_packages;
    DROP TABLE IF EXISTS software_versions;
    DROP TABLE IF EXISTS software_titles;

    CREATE TABLE IF NOT EXISTS software_titles (
      id TEXT PRIMARY KEY,
      displayName TEXT NOT NULL,
      publisher TEXT NOT NULL,
      category TEXT NOT NULL,
      subcategory TEXT,
      supportedPlatforms TEXT NOT NULL,
      licenseRequired TEXT DEFAULT 'No',
      isSaaSOrInternetFacing INTEGER DEFAULT 0,
      dataClassification TEXT DEFAULT 'Internal',
      howToObtain TEXT,
      classification TEXT,
      defaultInstallerType TEXT,
      description TEXT,
      defaultDisposition TEXT NOT NULL DEFAULT 'Approved',
      approvalPolicy TEXT NOT NULL DEFAULT 'all',
      approvedVersionRule TEXT DEFAULT '*',
      deniedVersionRule TEXT,
      policyRationale TEXT,
      mandatedAlternative TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS software_packages (
      id TEXT PRIMARY KEY,
      titleId TEXT NOT NULL,
      intuneAppId TEXT UNIQUE,
      intuneAppName TEXT,
      version TEXT NOT NULL,
      platform TEXT NOT NULL DEFAULT 'windows',
      packagingStatus TEXT NOT NULL DEFAULT 'Packaged & Ready',
      fileName TEXT,
      setupFilePath TEXT,
      installCommandLine TEXT,
      uninstallCommandLine TEXT,
      msiProductCode TEXT,
      detectionSummary TEXT,
      sourceSharePath TEXT,
      sizeInBytes INTEGER,
      isAssigned INTEGER DEFAULT 0,
      assignmentCount INTEGER DEFAULT 0,
      assignedIntents TEXT,
      assignedGroupIds TEXT,
      notes TEXT,
      description TEXT,
      extractedAt TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (titleId) REFERENCES software_titles(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS software_versions (
      id TEXT PRIMARY KEY,
      titleId TEXT NOT NULL,
      version TEXT NOT NULL,
      disposition TEXT NOT NULL,
      dispositionReason TEXT,
      alternative TEXT,
      packagingStatus TEXT DEFAULT 'Not Packaged',
      packageRef TEXT,
      installerSource TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (titleId) REFERENCES software_titles(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_titles_disp ON software_titles(defaultDisposition);
    CREATE INDEX IF NOT EXISTS idx_titles_cat ON software_titles(category);
    CREATE INDEX IF NOT EXISTS idx_packages_title ON software_packages(titleId);
    CREATE INDEX IF NOT EXISTS idx_packages_intune ON software_packages(intuneAppId);
  `);

  // Truncate existing catalog tables for fresh rebuild
  console.log('🧹 Purging old data tables...');
  db.exec(`
    DELETE FROM software_packages;
    DELETE FROM software_versions;
    DELETE FROM software_titles;
  `);

  // 2. Parse Approved List
  console.log('2️⃣ Parsing EUC Approved Software List...');
  const approvedRows = await parseSheet(APPROVED_PATH);
  console.log(`   ✅ Parsed ${approvedRows.length} approved records.`);

  const modelMap = new Map(); // key -> model object
  const keyToId = new Map();

  for (const row of approvedRows) {
    const title = cleanStr(row['Software Title']);
    if (!title) continue;
    const publisher = cleanStr(row['Publisher Name']) || 'Unknown';
    const key = normKey(publisher, title);
    const ver = cleanStr(row['Version.']);
    const category = resolveCategory(row['Category'], row['Subcategory'], title);
    const subcategory = cleanStr(row['Subcategory']);
    const rawPlat = (row['Platform'] || '').toLowerCase();
    const platform = rawPlat.includes('mac') ? (rawPlat.includes('win') ? ['windows', 'macos'] : ['macos']) : ['windows'];
    const isCommercial = row['Classification'] === 'Commercial';

    let approvalPolicy = 'all';
    let approvedVersionRule = '*';
    if (ver && ver !== 'NA' && ver !== 'Standard' && ver !== 'All') {
      approvalPolicy = 'version_range';
      approvedVersionRule = ver.startsWith('>=') || ver.startsWith('>') ? ver : `>= ${ver}`;
    }

    if (!modelMap.has(key)) {
      const id = 'title_' + hashId(key);
      keyToId.set(key, id);
      modelMap.set(key, {
        id,
        displayName: title,
        publisher,
        category,
        subcategory,
        supportedPlatforms: platform,
        licenseRequired: isCommercial ? 'Yes' : 'No',
        isSaaSOrInternetFacing: 0,
        dataClassification: 'Internal',
        howToObtain: cleanStr(row['How to obtain']) || 'Intune',
        classification: cleanStr(row['Classification']) || 'Commercial',
        defaultInstallerType: platform.includes('macos') ? { windows: 'msi', macos: 'pkg' } : { windows: 'msi' },
        description: `Enterprise approved software model for ${title} by ${publisher}.`,
        defaultDisposition: 'Approved',
        approvalPolicy,
        approvedVersionRule,
        deniedVersionRule: null,
        policyRationale: 'Approved standard software for enterprise EUC deployment.',
        mandatedAlternative: null,
        hasApprovedRecord: true,
        createdAt: now,
        updatedAt: now,
      });
    } else {
      // If title appeared multiple times with different version floors, preserve the lowest/widest floor
      const existing = modelMap.get(key);
      if (approvedVersionRule !== '*' && existing.approvedVersionRule === '*') {
        existing.approvedVersionRule = approvedVersionRule;
        existing.approvalPolicy = 'version_range';
      }
    }
  }

  // 3. Parse Denied List
  console.log('3️⃣ Reconciling EUC Denied Software List...');
  const deniedRows = await parseSheet(DENIED_PATH);
  console.log(`   ✅ Parsed ${deniedRows.length} denied records.`);

  let hybridCount = 0;
  let fullDeniedCount = 0;

  for (const row of deniedRows) {
    const title = cleanStr(row['Software Title']);
    if (!title) continue;
    const publisher = cleanStr(row['Publisher Name']) || 'Unknown';
    const key = normKey(publisher, title);
    const ver = cleanStr(row['Software Version']) || 'All Versions';
    const reason = cleanStr(row['Denial Reason']) || 'Prohibited by EUC cybersecurity policy.';
    const alt = cleanStr(row['Alternative']);
    const isAll = ver.toUpperCase() === 'ALL' || ver.toLowerCase() === 'all versions' || ver === '*';
    const rawPlat = (row['Platform'] || '').toLowerCase();
    const platform = rawPlat.includes('mac') ? (rawPlat.includes('win') ? ['windows', 'macos'] : ['macos']) : ['windows'];

    if (modelMap.has(key)) {
      const existing = modelMap.get(key);
      if (isAll && existing.approvedVersionRule === '*') {
        // Completely prohibited title (e.g. .NET 5.0 End of Life)
        existing.defaultDisposition = 'Denied';
        existing.approvalPolicy = 'prohibited';
        existing.approvedVersionRule = null;
        existing.deniedVersionRule = 'ALL';
        existing.category = 'Prohibited / Denied';
        existing.policyRationale = reason;
        existing.mandatedAlternative = alt || null;
        fullDeniedCount++;
      } else {
        // Floor Rule (e.g. >= 20.0 is Approved, < 20.0 is Denied)
        hybridCount++;
        existing.approvalPolicy = 'version_range';
        existing.deniedVersionRule = ver.startsWith('<') ? ver : `< ${ver}`;
        existing.policyRationale = `Versions below approved floor (${existing.approvedVersionRule}) are prohibited: ${reason}`;
        if (alt) existing.mandatedAlternative = alt;
      }
    } else {
      // Purely Denied Title
      fullDeniedCount++;
      const id = 'title_' + hashId(key);
      keyToId.set(key, id);
      modelMap.set(key, {
        id,
        displayName: title,
        publisher,
        category: 'Prohibited / Denied',
        subcategory: cleanStr(row['Sub-Category']),
        supportedPlatforms: platform,
        licenseRequired: 'No',
        isSaaSOrInternetFacing: 0,
        dataClassification: 'Internal',
        howToObtain: 'N/A',
        classification: 'Denied',
        defaultInstallerType: platform.includes('macos') ? { windows: 'msi', macos: 'pkg' } : { windows: 'msi' },
        description: `Prohibited software title: ${title} by ${publisher}.`,
        defaultDisposition: 'Denied',
        approvalPolicy: 'prohibited',
        approvedVersionRule: null,
        deniedVersionRule: isAll ? 'ALL' : ver,
        policyRationale: reason,
        mandatedAlternative: alt || null,
        hasApprovedRecord: false,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  // 4. Ingest Live Intune Applications & Link Packages
  console.log('4️⃣ Ingesting Live Intune Applications & Linking Packages...');
  const intuneData = JSON.parse(fs.readFileSync(INTUNE_PATH, 'utf8'));
  const intuneApps = intuneData.applications || [];
  console.log(`   ✅ Loaded ${intuneApps.length} live Intune packages.`);

  let matchedPackageCount = 0;
  let newModelCount = 0;

  const titleStmt = db.prepare(`
    INSERT INTO software_titles (
      id, displayName, publisher, category, subcategory, supportedPlatforms,
      licenseRequired, isSaaSOrInternetFacing, dataClassification, howToObtain,
      classification, defaultInstallerType, description, defaultDisposition,
      approvalPolicy, approvedVersionRule, deniedVersionRule, policyRationale,
      mandatedAlternative, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const packageStmt = db.prepare(`
    INSERT INTO software_packages (
      id, titleId, intuneAppId, intuneAppName, version, platform, packagingStatus,
      fileName, setupFilePath, installCommandLine, uninstallCommandLine,
      msiProductCode, detectionSummary, sourceSharePath, sizeInBytes,
      isAssigned, assignmentCount, assignedIntents, assignedGroupIds,
      notes, description, extractedAt, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Secondary search index: title-only map for fuzzy match
  const titleOnlyMap = new Map();
  for (const [key, model] of modelMap.entries()) {
    const tOnly = normKey('', model.displayName).replace(/^::/, '');
    if (!titleOnlyMap.has(tOnly)) {
      titleOnlyMap.set(tOnly, model);
    }
  }

  const packagesToInsert = [];

  for (const app of intuneApps) {
    const rawPub = cleanStr(app.rawPublisher) || cleanStr(app.cleanPublisher) || 'Unknown';
    const rawTitle = cleanStr(app.rawDisplayName) || cleanStr(app.cleanTitle) || 'Unnamed App';
    const cleanT = cleanStr(app.cleanTitle) || rawTitle;
    const cleanP = cleanStr(app.cleanPublisher) || rawPub;

    // Match attempts:
    // 1. Direct key with clean publisher + clean title
    // 2. Direct key with raw publisher + raw title
    // 3. Match on clean title only
    let matchedModel = modelMap.get(normKey(cleanP, cleanT)) ||
                       modelMap.get(normKey(rawPub, rawTitle)) ||
                       titleOnlyMap.get(normKey('', cleanT).replace(/^::/, ''));

    let titleId;
    if (matchedModel) {
      titleId = matchedModel.id;
      matchedPackageCount++;
    } else {
      // Create new base model for uncatalogued Intune application
      const newKey = normKey(cleanP, cleanT);
      titleId = 'title_' + hashId(newKey);
      matchedModel = {
        id: titleId,
        displayName: cleanT,
        publisher: cleanP,
        category: 'General Business',
        subcategory: 'Intune Discovered',
        supportedPlatforms: [app.platform || 'windows'],
        licenseRequired: 'No',
        isSaaSOrInternetFacing: 0,
        dataClassification: 'Internal',
        howToObtain: 'Intune',
        classification: 'Internal / Discovered',
        defaultInstallerType: { [app.platform || 'windows']: 'msi' },
        description: `Discovered in Microsoft Intune enterprise tenant: ${rawTitle}`,
        defaultDisposition: 'Review Required',
        approvalPolicy: 'explicit_only',
        approvedVersionRule: null,
        deniedVersionRule: null,
        policyRationale: 'Discovered in Intune catalog; awaiting formal EUC software governance classification.',
        mandatedAlternative: null,
        hasApprovedRecord: false,
        createdAt: now,
        updatedAt: now,
      };
      modelMap.set(newKey, matchedModel);
      titleOnlyMap.set(normKey('', cleanT).replace(/^::/, ''), matchedModel);
      newModelCount++;
    }

    packagesToInsert.push({
      id: `pkg_${app.intuneAppId}`,
      titleId,
      intuneAppId: app.intuneAppId,
      intuneAppName: cleanStr(app.rawDisplayName) || cleanStr(app.cleanTitle) || cleanT,
      version: cleanStr(app.displayVersion) || cleanStr(app.cleanVersion) || '1.0.0',
      platform: app.platform || 'windows',
      packagingStatus: 'Packaged & Ready',
      fileName: app.fileName || null,
      setupFilePath: app.setupFilePath || null,
      installCommandLine: app.installCommandLine || null,
      uninstallCommandLine: app.uninstallCommandLine || null,
      msiProductCode: app.msiProductCode || null,
      detectionSummary: app.detectionSummary || null,
      sourceSharePath: app.sourceSharePath || null,
      sizeInBytes: app.sizeInBytes || null,
      isAssigned: app.isAssigned ? 1 : 0,
      assignmentCount: app.assignmentCount || 0,
      assignedIntents: JSON.stringify(app.assignedIntents || []),
      assignedGroupIds: JSON.stringify(app.assignedGroupIds || []),
      notes: app.notes ? JSON.stringify(app.notes) : null,
      description: app.description || null,
      extractedAt: app.extractedAt || now,
      createdAt: app.createdDateTime || now,
      updatedAt: app.lastModifiedDateTime || now,
    });
  }

  // 5. Commit all models to SQLite
  console.log(`5️⃣ Committing ${modelMap.size} Authoritative Software Models to SQLite...`);
  db.exec('BEGIN TRANSACTION;');
  try {
    for (const m of modelMap.values()) {
      titleStmt.run(
        m.id,
        m.displayName,
        m.publisher,
        m.category,
        m.subcategory,
        JSON.stringify(m.supportedPlatforms),
        m.licenseRequired,
        m.isSaaSOrInternetFacing,
        m.dataClassification,
        m.howToObtain,
        m.classification,
        JSON.stringify(m.defaultInstallerType),
        m.description,
        m.defaultDisposition,
        m.approvalPolicy,
        m.approvedVersionRule,
        m.deniedVersionRule,
        m.policyRationale,
        m.mandatedAlternative,
        m.createdAt,
        m.updatedAt
      );
    }

    console.log(`6️⃣ Committing ${packagesToInsert.length} Concrete Packages to SQLite...`);
    for (const p of packagesToInsert) {
      packageStmt.run(
        p.id,
        p.titleId,
        p.intuneAppId,
        p.intuneAppName,
        p.version,
        p.platform,
        p.packagingStatus,
        p.fileName,
        p.setupFilePath,
        p.installCommandLine,
        p.uninstallCommandLine,
        p.msiProductCode,
        p.detectionSummary,
        p.sourceSharePath,
        p.sizeInBytes,
        p.isAssigned,
        p.assignmentCount,
        p.assignedIntents,
        p.assignedGroupIds,
        p.notes,
        p.description,
        p.extractedAt,
        p.createdAt,
        p.updatedAt
      );
    }
    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }

  // 6. Print Comprehensive Summary
  console.log('\n======================================================');
  console.log('🎉 REBUILD COMPLETED SUCCESSFULLY!');
  console.log('======================================================');
  
  const totalTitles = db.prepare('SELECT COUNT(*) as c FROM software_titles').get().c;
  const approvedTitles = db.prepare("SELECT COUNT(*) as c FROM software_titles WHERE defaultDisposition = 'Approved'").get().c;
  const deniedTitles = db.prepare("SELECT COUNT(*) as c FROM software_titles WHERE defaultDisposition = 'Denied'").get().c;
  const reviewTitles = db.prepare("SELECT COUNT(*) as c FROM software_titles WHERE defaultDisposition = 'Review Required'").get().c;
  const blankCatCount = db.prepare("SELECT COUNT(*) as c FROM software_titles WHERE category IS NULL OR category = ''").get().c;
  const totalPackages = db.prepare('SELECT COUNT(*) as c FROM software_packages').get().c;
  const assignedPackages = db.prepare('SELECT COUNT(*) as c FROM software_packages WHERE isAssigned = 1').get().c;

  console.log(`📊 Total Authoritative Models: ${totalTitles.toLocaleString()}`);
  console.log(`   - Approved Models:          ${approvedTitles.toLocaleString()}`);
  console.log(`   - Prohibited/Denied Models: ${deniedTitles.toLocaleString()}`);
  console.log(`   - Review Required Models:   ${reviewTitles.toLocaleString()}`);
  console.log(`   - Blank Categories:         ${blankCatCount} (Must be 0)`);
  console.log(`📦 Total Concrete Packages:     ${totalPackages.toLocaleString()}`);
  console.log(`   - Actively Assigned:        ${assignedPackages.toLocaleString()}`);
  console.log(`   - Intune Apps Matched:      ${matchedPackageCount.toLocaleString()}`);
  console.log(`   - New Models Created:       ${newModelCount.toLocaleString()}`);
  console.log('======================================================\n');
}

rebuild().catch(err => {
  console.error('❌ Rebuild failed:', err);
  process.exit(1);
});
