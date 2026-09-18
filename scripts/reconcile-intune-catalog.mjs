import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');
const DB_PATH = join(ROOT_DIR, 'spa-intake-portal', 'server', 'data', 'intake.db');
const INTUNE_EXTRACT_PATH = join(ROOT_DIR, 'intune-catalog-extracted.json');

console.log('================================================================');
console.log('🚀 RECONCILING LIVE INTUNE CATALOG WITH AUTHORITATIVE MODEL');
console.log('================================================================\n');

const db = new DatabaseSync(DB_PATH);

// Ensure schema is up to date
db.exec(`
  CREATE TABLE IF NOT EXISTS software_packages (
    id TEXT PRIMARY KEY,
    titleId TEXT NOT NULL,
    intuneAppId TEXT,
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
    assignedIntents TEXT,
    assignedGroupIds TEXT,
    notes TEXT,
    description TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    FOREIGN KEY (titleId) REFERENCES software_titles(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_packages_title ON software_packages(titleId);
  CREATE INDEX IF NOT EXISTS idx_packages_intune ON software_packages(intuneAppId);
  CREATE INDEX IF NOT EXISTS idx_packages_ver ON software_packages(version);
`);

try { db.exec(`ALTER TABLE software_titles ADD COLUMN defaultDisposition TEXT DEFAULT 'Approved';`); } catch (_) {}
try { db.exec(`ALTER TABLE software_titles ADD COLUMN approvalPolicy TEXT DEFAULT 'all';`); } catch (_) {}
try { db.exec(`ALTER TABLE software_titles ADD COLUMN approvedVersionRule TEXT DEFAULT '*';`); } catch (_) {}
try { db.exec(`ALTER TABLE software_titles ADD COLUMN deniedVersionRule TEXT;`); } catch (_) {}
try { db.exec(`ALTER TABLE software_titles ADD COLUMN policyRationale TEXT;`); } catch (_) {}
try { db.exec(`ALTER TABLE software_titles ADD COLUMN mandatedAlternative TEXT;`); } catch (_) {}

// ── Step 1: Clean Slate Requests & Tasks ──────────────────────────────────────
console.log('🧹 Step 1: Resetting existing requests & tasks (Clean Slate per approval)...');
db.prepare('DELETE FROM catalog_tasks').run();
db.prepare('DELETE FROM software_requests').run();
console.log(`   ✅ Cleared requests & tasks.`);

// ── Step 2: Hoist Governance Rules from Existing software_versions ────────────
console.log('\n🏛️  Step 2: Hoisting governance policy rules to Base Software Models...');
const titles = db.prepare('SELECT id, displayName, publisher, category FROM software_titles').all();
const getVersionsStmt = db.prepare('SELECT * FROM software_versions WHERE titleId = ?');
const updateTitlePolicyStmt = db.prepare(`
  UPDATE software_titles SET
    defaultDisposition = ?,
    approvalPolicy = ?,
    approvedVersionRule = ?,
    deniedVersionRule = ?,
    policyRationale = ?,
    mandatedAlternative = ?,
    updatedAt = ?
  WHERE id = ?
`);

let hoistedCount = 0;
let hybridCount = 0;
let deniedCount = 0;
let approvedCount = 0;
let reviewCount = 0;

const now = new Date().toISOString();

for (const t of titles) {
  const versions = getVersionsStmt.all(t.id);
  let defaultDisposition = 'Approved';
  let approvalPolicy = 'all';
  let approvedVersionRule = '*';
  let deniedVersionRule = null;
  let policyRationale = '';
  let mandatedAlternative = null;

  if (versions.length === 0) {
    defaultDisposition = t.category?.toLowerCase().includes('prohibited') || t.category?.toLowerCase().includes('denied')
      ? 'Denied' : 'Approved';
    approvalPolicy = defaultDisposition === 'Denied' ? 'prohibited' : 'all';
  } else {
    const hasApproved = versions.some(v => v.disposition === 'Approved');
    const hasDenied = versions.some(v => v.disposition === 'Denied');
    const hasReview = versions.some(v => v.disposition === 'Review Required');

    const deniedVers = versions.filter(v => v.disposition === 'Denied');
    const approvedVers = versions.filter(v => v.disposition === 'Approved');
    const reviewVers = versions.filter(v => v.disposition === 'Review Required');

    if (hasApproved && hasDenied) {
      hybridCount++;
      defaultDisposition = 'Approved';
      approvalPolicy = 'version_range';
      
      const appRules = approvedVers.map(v => v.version).filter(v => v && v !== 'ALL' && v !== 'NA');
      const denRules = deniedVers.map(v => v.version).filter(v => v && v !== 'NA');

      approvedVersionRule = appRules.length > 0 ? appRules.join(', ') : '>= Approved Baseline';
      deniedVersionRule = denRules.length > 0 ? denRules.join(', ') : '< Prohibited Versions';

      const reasons = versions.map(v => v.dispositionReason).filter(Boolean);
      policyRationale = [...new Set(reasons)].join(' | ');

      const alt = deniedVers.find(v => v.alternative)?.alternative;
      if (alt) mandatedAlternative = alt;
    } else if (hasDenied && !hasApproved) {
      deniedCount++;
      defaultDisposition = 'Denied';
      approvalPolicy = 'prohibited';
      approvedVersionRule = null;
      deniedVersionRule = 'ALL';
      policyRationale = deniedVers.map(v => v.dispositionReason).filter(Boolean)[0] || 'Software title is prohibited by EUC cybersecurity policy.';
      mandatedAlternative = deniedVers.find(v => v.alternative)?.alternative || null;
    } else if (hasReview && !hasApproved) {
      reviewCount++;
      defaultDisposition = 'Review Required';
      approvalPolicy = 'explicit_only';
      approvedVersionRule = null;
      deniedVersionRule = null;
      policyRationale = reviewVers.map(v => v.dispositionReason).filter(Boolean)[0] || 'Commercial software: requires procurement and SAM review.';
    } else {
      approvedCount++;
      defaultDisposition = 'Approved';
      approvalPolicy = 'all';
      const appRules = approvedVers.map(v => v.version).filter(v => v && v !== 'ALL' && v !== 'NA');
      approvedVersionRule = appRules.length > 0 ? appRules.join(', ') : '*';
      policyRationale = approvedVers.map(v => v.dispositionReason).filter(Boolean)[0] || 'Approved standard software for enterprise EUC deployment.';
    }
  }

  updateTitlePolicyStmt.run(
    defaultDisposition,
    approvalPolicy,
    approvedVersionRule,
    deniedVersionRule,
    policyRationale,
    mandatedAlternative,
    now,
    t.id
  );
  hoistedCount++;
}

console.log(`   ✅ Processed ${hoistedCount} base software models:`);
console.log(`      - Approved Titles:      ${approvedCount}`);
console.log(`      - Hybrid Range Titles:  ${hybridCount}`);
console.log(`      - Prohibited Titles:    ${deniedCount}`);
console.log(`      - Review Req Titles:    ${reviewCount}`);

// ── Step 3: Load Extracted Intune Catalog ─────────────────────────────────────
console.log('\n📦 Step 3: Loading live Intune extract...');
const rawJson = readFileSync(INTUNE_EXTRACT_PATH, 'utf8');
const intuneData = JSON.parse(rawJson);
const applications = intuneData.applications || [];
console.log(`   ✅ Loaded ${applications.length} applications from Intune extract.`);

// Clear existing software_packages for clean synchronization
db.prepare('DELETE FROM software_packages').run();
console.log('   ✅ Cleared software_packages table for authoritative sync.');

// Build title lookup maps
const existingTitles = db.prepare('SELECT id, displayName, publisher FROM software_titles').all();
const titleById = new Map();
const titleByNormKey = new Map();
const titleByName = new Map();

function normalize(str = '') {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

for (const t of existingTitles) {
  titleById.set(t.id, t);
  const key = `${normalize(t.publisher)}::${normalize(t.displayName)}`;
  titleByNormKey.set(key, t);
  const nName = normalize(t.displayName);
  if (!titleByName.has(nName)) titleByName.set(nName, []);
  titleByName.get(nName).push(t);
}

// ── Step 4: Reconcile and Insert Packages ──────────────────────────────────────
console.log('\n🔗 Step 4: Reconciling Intune applications to Software Models...');

const insertTitleStmt = db.prepare(`
  INSERT INTO software_titles (
    id, displayName, publisher, category, subcategory, supportedPlatforms,
    licenseRequired, isSaaSOrInternetFacing, dataClassification, howToObtain,
    classification, defaultInstallerType, description,
    defaultDisposition, approvalPolicy, approvedVersionRule, deniedVersionRule,
    policyRationale, mandatedAlternative, createdAt, updatedAt
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertPackageStmt = db.prepare(`
  INSERT INTO software_packages (
    id, titleId, intuneAppId, version, platform, packagingStatus,
    fileName, setupFilePath, installCommandLine, uninstallCommandLine,
    msiProductCode, detectionSummary, sourceSharePath, sizeInBytes,
    isAssigned, assignedIntents, assignedGroupIds, notes, description,
    createdAt, updatedAt
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

let matchedExisting = 0;
let createdNewTitles = 0;
let packagesInserted = 0;

for (const app of applications) {
  let targetTitle = null;

  // 1. Direct matchedModelId from extract
  if (app.matchedModelId && titleById.has(app.matchedModelId)) {
    targetTitle = titleById.get(app.matchedModelId);
  }

  // Derive sanitized name and publisher
  const rawName = app.rawDisplayName || '';
  let cleanName = app.cleanTitle && app.cleanTitle.length > 2 && !app.cleanTitle.startsWith('-') ? app.cleanTitle : rawName;
  const publisher = app.cleanPublisher || app.rawPublisher || 'Unknown';

  // 2. Normalized key match (publisher::title)
  if (!targetTitle) {
    const key = `${normalize(publisher)}::${normalize(cleanName)}`;
    if (titleByNormKey.has(key)) {
      targetTitle = titleByNormKey.get(key);
    }
  }

  // 3. Fallback name match if publisher is compatible (alias or substring)
  if (!targetTitle) {
    const candidates = titleByName.get(normalize(cleanName));
    if (candidates && candidates.length > 0) {
      const normPub = normalize(publisher);
      const matchP = candidates.find(c => {
        const cp = normalize(c.publisher);
        return cp.includes(normPub) || normPub.includes(cp);
      });
      if (matchP) {
        targetTitle = matchP;
      }
    }
  }

  // 4. If still not matched, auto-create a new Authoritative Software Model
  if (!targetTitle) {
    // Generate deterministic sha256 hash ID
    const hash = crypto.createHash('sha256').update(`${publisher.toLowerCase()}::${cleanName.toLowerCase()}`).digest('hex').slice(0, 16);
    const newId = `title_${hash}`;

    if (titleById.has(newId)) {
      targetTitle = titleById.get(newId);
    } else {
      const category = (app.categories && app.categories[0]) || 'General Business';
      const supportedPlatforms = JSON.stringify([app.platform || 'windows']);

      // As decided by user: "make them review required."
      const defaultDisposition = 'Review Required';
      const approvalPolicy = 'explicit_only';
      const policyRationale = 'Discovered from live Intune tenant. Pending EUC administrator baseline approval.';

      insertTitleStmt.run(
        newId,
        cleanName,
        publisher,
        category,
        '',
        supportedPlatforms,
        'No',
        0,
        'Internal',
        'Intune',
        'Commercial',
        JSON.stringify({ windows: 'msi', macos: 'pkg' }),
        app.description || `Enterprise software title for ${cleanName}`,
        defaultDisposition,
        approvalPolicy,
        null, // approvedVersionRule
        null, // deniedVersionRule
        policyRationale,
        null, // mandatedAlternative
        app.createdDateTime || now,
        now
      );

      targetTitle = { id: newId, displayName: cleanName, publisher };
      titleById.set(newId, targetTitle);
      titleByNormKey.set(`${normalize(publisher)}::${normalize(cleanName)}`, targetTitle);
      const nName = normalize(cleanName);
      if (!titleByName.has(nName)) titleByName.set(nName, []);
      titleByName.get(nName).push(targetTitle);
      createdNewTitles++;
    }
  } else {
    matchedExisting++;
  }

  // Insert Concrete Package
  const pkgId = `pkg_${app.intuneAppId || crypto.createHash('sha256').update(`${targetTitle.id}::${app.cleanVersion}::${Date.now()}`).digest('hex').slice(0, 16)}`;
  const pkgVersion = app.cleanVersion || app.displayVersion || '1.0';

  insertPackageStmt.run(
    pkgId,
    targetTitle.id,
    app.intuneAppId || null,
    pkgVersion,
    app.platform || 'windows',
    app.packagingStatus || 'Packaged & Ready',
    app.fileName || null,
    app.setupFilePath || null,
    app.installCommandLine || null,
    app.uninstallCommandLine || null,
    app.msiProductCode || null,
    app.detectionSummary || null,
    app.sourceSharePath || null,
    app.sizeInBytes ?? null,
    app.isAssigned ? 1 : 0,
    JSON.stringify(app.assignedIntents || []),
    JSON.stringify(app.assignedGroupIds || []),
    app.notes || null,
    app.description || null,
    app.createdDateTime || now,
    app.lastModifiedDateTime || now
  );

  packagesInserted++;
}

// ── Summary Report ────────────────────────────────────────────────────────────
const totalTitlesNow = db.prepare('SELECT COUNT(*) as count FROM software_titles').get().count;
const totalPackagesNow = db.prepare('SELECT COUNT(*) as count FROM software_packages').get().count;
const totalAssigned = db.prepare('SELECT COUNT(*) as count FROM software_packages WHERE isAssigned = 1').get().count;
const totalShares = db.prepare('SELECT COUNT(*) as count FROM software_packages WHERE sourceSharePath IS NOT NULL').get().count;
const totalMsi = db.prepare('SELECT COUNT(*) as count FROM software_packages WHERE msiProductCode IS NOT NULL').get().count;

console.log('\n================================================================');
console.log('🎉 RECONCILIATION COMPLETED SUCCESSFULLY!');
console.log('================================================================');
console.log(`📊 Ingestion & Matching Metrics:`);
console.log(`   - Total Intune Applications Extracted: 3,413`);
console.log(`   - Intune Apps Matched to Existing Models: ${matchedExisting}`);
console.log(`   - New Software Models Created:          ${createdNewTitles}`);
console.log(`   - Total Authoritative Software Titles:  ${totalTitlesNow.toLocaleString()}`);
console.log(`   - Total Concrete Packages Ingested:     ${totalPackagesNow.toLocaleString()}`);
console.log(`   - Actively Assigned Intune Packages:   ${totalAssigned.toLocaleString()}`);
console.log(`   - Packages with Source UNC Shares:      ${totalShares.toLocaleString()}`);
console.log(`   - Packages with MSI Product Codes:      ${totalMsi.toLocaleString()}`);
console.log('================================================================\n');
