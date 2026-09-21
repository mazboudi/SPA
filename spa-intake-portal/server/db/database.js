import { DatabaseSync } from 'node:sqlite';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const DB_PATH = join(DATA_DIR, 'intake.db');

if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

export const db = new DatabaseSync(DB_PATH);

// ── 1. Initialize Tables ──────────────────────────────────────────────────────
export function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS software_titles (
      id TEXT PRIMARY KEY,
      displayName TEXT NOT NULL,
      publisher TEXT NOT NULL,
      category TEXT NOT NULL,
      subcategory TEXT,
      supportedPlatforms TEXT NOT NULL, -- JSON array
      licenseRequired TEXT DEFAULT 'No',
      isSaaSOrInternetFacing INTEGER DEFAULT 0,
      dataClassification TEXT DEFAULT 'Internal',
      howToObtain TEXT,
      classification TEXT,
      defaultInstallerType TEXT, -- JSON object
      description TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS software_versions (
      id TEXT PRIMARY KEY,
      titleId TEXT NOT NULL,
      version TEXT NOT NULL,
      disposition TEXT NOT NULL, -- 'Approved' | 'Denied' | 'Review Required'
      dispositionReason TEXT,
      alternative TEXT,
      packagingStatus TEXT DEFAULT 'Not Packaged',
      packageRef TEXT, -- JSON object
      installerSource TEXT, -- JSON object
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (titleId) REFERENCES software_titles(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS software_packages (
      id TEXT PRIMARY KEY,
      titleId TEXT NOT NULL,
      intuneAppId TEXT,
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
      assignedIntents TEXT, -- JSON array
      assignedGroupIds TEXT, -- JSON array
      notes TEXT,
      description TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (titleId) REFERENCES software_titles(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS software_requests (
      id TEXT PRIMARY KEY,
      number TEXT UNIQUE NOT NULL,
      shortDescription TEXT NOT NULL,
      titleId TEXT,
      titleName TEXT NOT NULL,
      publisher TEXT NOT NULL,
      version TEXT NOT NULL,
      platform TEXT NOT NULL,
      category TEXT,
      installerType TEXT,
      installerSource TEXT,
      requestedFor TEXT NOT NULL,
      requesterEmail TEXT,
      department TEXT NOT NULL,
      targetDevice TEXT,
      installType TEXT NOT NULL,
      deploymentScope TEXT NOT NULL,
      businessJustification TEXT NOT NULL,
      disposition TEXT NOT NULL,
      stage TEXT NOT NULL,
      state TEXT NOT NULL,
      priority TEXT DEFAULT 'Medium',
      submittedAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      packagingArtifacts TEXT
    );

    CREATE TABLE IF NOT EXISTS catalog_tasks (
      id TEXT PRIMARY KEY,
      requestId TEXT NOT NULL,
      number TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      assignmentGroup TEXT NOT NULL,
      state TEXT NOT NULL, -- 'Pending' | 'Open' | 'Closed Complete' | 'Closed Incomplete'
      claimedBy TEXT,
      completedBy TEXT,
      completedAt TEXT,
      notes TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (requestId) REFERENCES software_requests(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    -- Indices for high performance queries
    CREATE INDEX IF NOT EXISTS idx_titles_name ON software_titles(displayName);
    CREATE INDEX IF NOT EXISTS idx_titles_pub ON software_titles(publisher);
    CREATE INDEX IF NOT EXISTS idx_versions_title ON software_versions(titleId);
    CREATE INDEX IF NOT EXISTS idx_packages_title ON software_packages(titleId);
    CREATE INDEX IF NOT EXISTS idx_packages_intune ON software_packages(intuneAppId);
    CREATE INDEX IF NOT EXISTS idx_packages_ver ON software_packages(version);
    CREATE INDEX IF NOT EXISTS idx_requests_stage ON software_requests(stage);
    CREATE INDEX IF NOT EXISTS idx_tasks_request ON catalog_tasks(requestId);
    CREATE INDEX IF NOT EXISTS idx_tasks_group ON catalog_tasks(assignmentGroup);
    CREATE INDEX IF NOT EXISTS idx_tasks_state ON catalog_tasks(state);
    CREATE TABLE IF NOT EXISTS nist_risk_cache (
      id TEXT PRIMARY KEY,
      titleName TEXT NOT NULL,
      version TEXT,
      riskScore REAL,
      riskLevel TEXT,
      maxCvss REAL,
      trendingCount INTEGER DEFAULT 0,
      totalCves INTEGER DEFAULT 0,
      cvesJson TEXT,
      violationsJson TEXT,
      fetchedAt TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_nist_cache_title ON nist_risk_cache(titleName);
  `);

  // Safe idempotent column additions for software_titles (governance policy rules)
  try { db.exec(`ALTER TABLE software_titles ADD COLUMN defaultDisposition TEXT DEFAULT 'Approved';`); } catch (_) {}
  try { db.exec(`ALTER TABLE software_titles ADD COLUMN approvalPolicy TEXT DEFAULT 'all';`); } catch (_) {}
  try { db.exec(`ALTER TABLE software_titles ADD COLUMN approvedVersionRule TEXT DEFAULT '*';`); } catch (_) {}
  try { db.exec(`ALTER TABLE software_titles ADD COLUMN deniedVersionRule TEXT;`); } catch (_) {}
  try { db.exec(`ALTER TABLE software_titles ADD COLUMN policyRationale TEXT;`); } catch (_) {}
  try { db.exec(`ALTER TABLE software_titles ADD COLUMN mandatedAlternative TEXT;`); } catch (_) {}

  // Safe idempotent column additions for software_requests
  try { db.exec(`ALTER TABLE software_requests ADD COLUMN requestedBy TEXT;`); } catch (_) {}
  try { db.exec(`ALTER TABLE software_requests ADD COLUMN beneficiaryEmail TEXT;`); } catch (_) {}
  try { db.exec(`ALTER TABLE software_requests ADD COLUMN isUnlisted INTEGER DEFAULT 0;`); } catch (_) {}
  try { db.exec(`ALTER TABLE software_requests ADD COLUMN licenseRequired TEXT DEFAULT 'No';`); } catch (_) {}
  try { db.exec(`ALTER TABLE software_requests ADD COLUMN isNewVersion INTEGER DEFAULT 0;`); } catch (_) {}
  try { db.exec(`ALTER TABLE software_requests ADD COLUMN nistRiskScore REAL;`); } catch (_) {}
  try { db.exec(`ALTER TABLE software_requests ADD COLUMN nistRiskLevel TEXT;`); } catch (_) {}
  try { db.exec(`ALTER TABLE software_requests ADD COLUMN nistSummary TEXT;`); } catch (_) {}

  // Safe idempotent column additions for catalog_tasks
  try { db.exec(`ALTER TABLE catalog_tasks ADD COLUMN riskEvaluation TEXT;`); } catch (_) {}

  // Safe idempotent column additions for software_packages
  try { db.exec(`ALTER TABLE software_packages ADD COLUMN intuneAppName TEXT;`); } catch (_) {}
}

// ── 2. Helper Queries ─────────────────────────────────────────────────────────

// Search Software Titles with optional filters & pagination
export function searchCatalog(query = '', limit = 250, filters = {}, offset = 0) {
  let conditions = [];
  let params = [];

  if (query && query.trim() !== '') {
    conditions.push('(displayName LIKE ? OR publisher LIKE ? OR category LIKE ?)');
    const qWild = `%${query.trim()}%`;
    params.push(qWild, qWild, qWild);
  }

  if (filters.category && filters.category !== 'all') {
    conditions.push('category = ?');
    params.push(filters.category);
  }

  if (filters.platform && filters.platform !== 'all') {
    conditions.push('supportedPlatforms LIKE ?');
    params.push(`%"${filters.platform}"%`);
  }

  if (filters.disposition && filters.disposition !== 'all') {
    conditions.push('defaultDisposition = ?');
    params.push(filters.disposition);
  }

  if (filters.licenseRequired && filters.licenseRequired !== 'all') {
    conditions.push('licenseRequired = ?');
    params.push(filters.licenseRequired);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Calculate total matching records before pagination
  const countSql = `SELECT COUNT(*) as count FROM software_titles ${whereClause}`;
  const totalMatching = db.prepare(countSql).get(...params).count;

  let orderBy = 'ORDER BY displayName ASC';
  let queryParams = [...params];

  if (query && query.trim() !== '') {
    const qPrefix = `${query.trim()}%`;
    queryParams.push(qPrefix); // for CASE WHEN displayName LIKE ?
    orderBy = `ORDER BY CASE WHEN displayName LIKE ? THEN 1 ELSE 2 END, displayName ASC`;
  }

  let limitClause = '';
  if (limit && limit !== 'all' && Number(limit) > 0) {
    limitClause = `LIMIT ? OFFSET ?`;
    queryParams.push(Number(limit), Number(offset) || 0);
  }

  const sql = `SELECT * FROM software_titles ${whereClause} ${orderBy} ${limitClause}`;
  const stmt = db.prepare(sql);
  const rows = stmt.all(...queryParams);

  // Hydrate packages and versions for each title
  const verStmt = db.prepare(`SELECT * FROM software_versions WHERE titleId = ? ORDER BY version ASC`);
  const pkgStmt = db.prepare(`SELECT * FROM software_packages WHERE titleId = ? ORDER BY version ASC`);

  const results = rows.map(r => {
    const packages = pkgStmt.all(r.id).map(p => ({
      ...p,
      assignedIntents: p.assignedIntents ? JSON.parse(p.assignedIntents) : [],
      assignedGroupIds: p.assignedGroupIds ? JSON.parse(p.assignedGroupIds) : [],
    }));

    let versions = verStmt.all(r.id).map(v => ({
      ...v,
      packageRef: v.packageRef ? JSON.parse(v.packageRef) : null,
      installerSource: v.installerSource ? JSON.parse(v.installerSource) : null,
    }));

    // If no legacy software_versions, synthesize from packages
    if (versions.length === 0 && packages.length > 0) {
      versions = packages.map(p => ({
        id: p.id,
        titleId: p.titleId,
        version: p.version,
        disposition: r.defaultDisposition || 'Approved',
        dispositionReason: r.policyRationale || '',
        alternative: r.mandatedAlternative || null,
        packagingStatus: p.packagingStatus,
        packageRef: p.intuneAppId ? { windows: p.intuneAppId } : null,
        installerSource: p.sourceSharePath ? { windows: p.sourceSharePath } : null,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      }));
    }

    return {
      ...r,
      defaultDisposition: r.defaultDisposition || 'Approved',
      approvalPolicy: r.approvalPolicy || 'all',
      approvedVersionRule: r.approvedVersionRule || '*',
      deniedVersionRule: r.deniedVersionRule || null,
      policyRationale: r.policyRationale || '',
      mandatedAlternative: r.mandatedAlternative || null,
      supportedPlatforms: r.supportedPlatforms ? JSON.parse(r.supportedPlatforms) : ['windows'],
      defaultInstallerType: r.defaultInstallerType ? JSON.parse(r.defaultInstallerType) : { windows: 'msi' },
      packages,
      versions,
    };
  });

  results.totalMatching = totalMatching;
  return results;
}

// Get High-Level Catalog Stats
export function getCatalogStats() {
  const totalTitles = db.prepare('SELECT COUNT(*) as count FROM software_titles').get().count;
  const approved = db.prepare("SELECT COUNT(*) as count FROM software_titles WHERE defaultDisposition = 'Approved'").get().count;
  const denied = db.prepare("SELECT COUNT(*) as count FROM software_titles WHERE defaultDisposition = 'Denied'").get().count;
  const review = db.prepare("SELECT COUNT(*) as count FROM software_titles WHERE defaultDisposition = 'Review Required'").get().count;
  const licensed = db.prepare("SELECT COUNT(*) as count FROM software_titles WHERE licenseRequired = 'Yes'").get().count;
  const free = db.prepare("SELECT COUNT(*) as count FROM software_titles WHERE licenseRequired = 'No'").get().count;
  const packages = db.prepare('SELECT COUNT(*) as count FROM software_packages').get().count;
  const assigned = db.prepare('SELECT COUNT(*) as count FROM software_packages WHERE isAssigned = 1').get().count;

  return {
    totalTitles,
    approvedTitles: approved,
    deniedTitles: denied,
    reviewRequiredTitles: review,
    licensedTitles: licensed,
    freeTitles: free,
    totalPackages: packages,
    assignedPackages: assigned,
  };
}

// Get Distinct Catalog Categories
export function getCatalogCategories() {
  const rows = db.prepare(`
    SELECT DISTINCT category FROM software_titles 
    WHERE category IS NOT NULL AND category != '' 
    ORDER BY category ASC
  `).all();
  return rows.map(r => r.category);
}

// Get Title by ID
export function getTitleById(id) {
  const stmt = db.prepare(`SELECT * FROM software_titles WHERE id = ?`);
  const title = stmt.get(id);
  if (!title) return null;

  const pkgStmt = db.prepare(`SELECT * FROM software_packages WHERE titleId = ? ORDER BY version ASC`);
  const packages = pkgStmt.all(id).map(p => ({
    ...p,
    assignedIntents: p.assignedIntents ? JSON.parse(p.assignedIntents) : [],
    assignedGroupIds: p.assignedGroupIds ? JSON.parse(p.assignedGroupIds) : [],
  }));

  const verStmt = db.prepare(`SELECT * FROM software_versions WHERE titleId = ? ORDER BY version ASC`);
  let versions = verStmt.all(id).map(v => ({
    ...v,
    packageRef: v.packageRef ? JSON.parse(v.packageRef) : null,
    installerSource: v.installerSource ? JSON.parse(v.installerSource) : null,
  }));

  if (versions.length === 0 && packages.length > 0) {
    versions = packages.map(p => ({
      id: p.id,
      titleId: p.titleId,
      version: p.version,
      disposition: title.defaultDisposition || 'Approved',
      dispositionReason: title.policyRationale || '',
      alternative: title.mandatedAlternative || null,
      packagingStatus: p.packagingStatus,
      packageRef: p.intuneAppId ? { windows: p.intuneAppId } : null,
      installerSource: p.sourceSharePath ? { windows: p.sourceSharePath } : null,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));
  }

  return {
    ...title,
    defaultDisposition: title.defaultDisposition || 'Approved',
    approvalPolicy: title.approvalPolicy || 'all',
    approvedVersionRule: title.approvedVersionRule || '*',
    deniedVersionRule: title.deniedVersionRule || null,
    policyRationale: title.policyRationale || '',
    mandatedAlternative: title.mandatedAlternative || null,
    supportedPlatforms: title.supportedPlatforms ? JSON.parse(title.supportedPlatforms) : ['windows'],
    defaultInstallerType: title.defaultInstallerType ? JSON.parse(title.defaultInstallerType) : { windows: 'msi' },
    packages,
    versions,
  };
}

// Update Title Model
export function updateTitle(id, fields = {}) {
  const existing = getTitleById(id);
  if (!existing) return null;

  const now = new Date().toISOString();
  const displayName = fields.displayName !== undefined ? fields.displayName : existing.displayName;
  const publisher = fields.publisher !== undefined ? fields.publisher : existing.publisher;
  const category = fields.category !== undefined ? fields.category : existing.category;
  const subcategory = fields.subcategory !== undefined ? fields.subcategory : existing.subcategory;
  const supportedPlatforms = fields.supportedPlatforms !== undefined 
    ? (typeof fields.supportedPlatforms === 'string' ? fields.supportedPlatforms : JSON.stringify(fields.supportedPlatforms)) 
    : JSON.stringify(existing.supportedPlatforms);
  const licenseRequired = fields.licenseRequired !== undefined ? fields.licenseRequired : existing.licenseRequired;
  const isSaaSOrInternetFacing = fields.isSaaSOrInternetFacing !== undefined ? (fields.isSaaSOrInternetFacing ? 1 : 0) : existing.isSaaSOrInternetFacing;
  const dataClassification = fields.dataClassification !== undefined ? fields.dataClassification : existing.dataClassification;
  const howToObtain = fields.howToObtain !== undefined ? fields.howToObtain : existing.howToObtain;
  const classification = fields.classification !== undefined ? fields.classification : existing.classification;
  const defaultInstallerType = fields.defaultInstallerType !== undefined
    ? (typeof fields.defaultInstallerType === 'string' ? fields.defaultInstallerType : JSON.stringify(fields.defaultInstallerType))
    : JSON.stringify(existing.defaultInstallerType);
  const description = fields.description !== undefined ? fields.description : existing.description;

  // Governance policy rules
  const defaultDisposition = fields.defaultDisposition !== undefined ? fields.defaultDisposition : existing.defaultDisposition;
  const approvalPolicy = fields.approvalPolicy !== undefined ? fields.approvalPolicy : existing.approvalPolicy;
  const approvedVersionRule = fields.approvedVersionRule !== undefined ? fields.approvedVersionRule : existing.approvedVersionRule;
  const deniedVersionRule = fields.deniedVersionRule !== undefined ? fields.deniedVersionRule : existing.deniedVersionRule;
  const policyRationale = fields.policyRationale !== undefined ? fields.policyRationale : existing.policyRationale;
  const mandatedAlternative = fields.mandatedAlternative !== undefined ? fields.mandatedAlternative : existing.mandatedAlternative;

  db.prepare(`
    UPDATE software_titles SET
      displayName = ?,
      publisher = ?,
      category = ?,
      subcategory = ?,
      supportedPlatforms = ?,
      licenseRequired = ?,
      isSaaSOrInternetFacing = ?,
      dataClassification = ?,
      howToObtain = ?,
      classification = ?,
      defaultInstallerType = ?,
      description = ?,
      defaultDisposition = ?,
      approvalPolicy = ?,
      approvedVersionRule = ?,
      deniedVersionRule = ?,
      policyRationale = ?,
      mandatedAlternative = ?,
      updatedAt = ?
    WHERE id = ?
  `).run(
    displayName,
    publisher,
    category,
    subcategory,
    supportedPlatforms,
    licenseRequired,
    isSaaSOrInternetFacing,
    dataClassification,
    howToObtain,
    classification,
    defaultInstallerType,
    description,
    defaultDisposition,
    approvalPolicy,
    approvedVersionRule,
    deniedVersionRule,
    policyRationale,
    mandatedAlternative,
    now,
    id
  );

  return getTitleById(id);
}

// Delete Title Model
export function deleteTitle(id) {
  const existing = getTitleById(id);
  if (!existing) return { deleted: false, reason: 'Title not found' };

  // Safety check: verify if active requests reference this titleId
  const activeReq = db.prepare(`
    SELECT COUNT(*) as count FROM software_requests 
    WHERE titleId = ? AND state NOT IN ('Closed Complete', 'Closed Incomplete', 'Cancelled')
  `).get(id);

  if (activeReq && activeReq.count > 0) {
    return {
      deleted: false,
      reason: `Cannot delete software model: it is referenced by ${activeReq.count} active request(s). Please complete or cancel those requests first.`,
      activeRequestCount: activeReq.count,
    };
  }

  // Unlink completed/archived requests to preserve historical audit trail
  db.prepare(`UPDATE software_requests SET titleId = NULL WHERE titleId = ?`).run(id);

  // Delete packages, versions & title
  db.prepare(`DELETE FROM software_packages WHERE titleId = ?`).run(id);
  db.prepare(`DELETE FROM software_versions WHERE titleId = ?`).run(id);
  db.prepare(`DELETE FROM software_titles WHERE id = ?`).run(id);

  return { deleted: true, id };
}

// Update Version Record
export function updateVersion(titleId, verId, fields = {}) {
  const existing = db.prepare(`SELECT * FROM software_versions WHERE id = ? AND titleId = ?`).get(verId, titleId);
  if (!existing) return null;

  const now = new Date().toISOString();
  const version = fields.version !== undefined ? fields.version : existing.version;
  const disposition = fields.disposition !== undefined ? fields.disposition : existing.disposition;
  const dispositionReason = fields.dispositionReason !== undefined ? fields.dispositionReason : existing.dispositionReason;
  const alternative = fields.alternative !== undefined ? fields.alternative : existing.alternative;
  const packagingStatus = fields.packagingStatus !== undefined ? fields.packagingStatus : existing.packagingStatus;
  const packageRef = fields.packageRef !== undefined 
    ? (typeof fields.packageRef === 'string' ? fields.packageRef : JSON.stringify(fields.packageRef)) 
    : existing.packageRef;
  const installerSource = fields.installerSource !== undefined
    ? (typeof fields.installerSource === 'string' ? fields.installerSource : JSON.stringify(fields.installerSource))
    : existing.installerSource;

  db.prepare(`
    UPDATE software_versions SET
      version = ?,
      disposition = ?,
      dispositionReason = ?,
      alternative = ?,
      packagingStatus = ?,
      packageRef = ?,
      installerSource = ?,
      updatedAt = ?
    WHERE id = ? AND titleId = ?
  `).run(
    version,
    disposition,
    dispositionReason,
    alternative,
    packagingStatus,
    packageRef,
    installerSource,
    now,
    verId,
    titleId
  );

  return getTitleById(titleId);
}

// Delete Version Record
export function deleteVersion(titleId, verId) {
  const existing = db.prepare(`SELECT * FROM software_versions WHERE id = ? AND titleId = ?`).get(verId, titleId);
  if (!existing) return { deleted: false, reason: 'Version record not found' };

  db.prepare(`DELETE FROM software_versions WHERE id = ? AND titleId = ?`).run(verId, titleId);
  return { deleted: true, title: getTitleById(titleId) };
}

// ── Package CRUD Operations ──────────────────────────────────────────────────
export function getPackagesByTitleId(titleId) {
  const rows = db.prepare(`SELECT * FROM software_packages WHERE titleId = ? ORDER BY version ASC`).all(titleId);
  return rows.map(p => ({
    ...p,
    assignedIntents: p.assignedIntents ? JSON.parse(p.assignedIntents) : [],
    assignedGroupIds: p.assignedGroupIds ? JSON.parse(p.assignedGroupIds) : [],
  }));
}

export function getPackageById(id) {
  const row = db.prepare(`SELECT * FROM software_packages WHERE id = ?`).get(id);
  if (!row) return null;
  return {
    ...row,
    assignedIntents: row.assignedIntents ? JSON.parse(row.assignedIntents) : [],
    assignedGroupIds: row.assignedGroupIds ? JSON.parse(row.assignedGroupIds) : [],
  };
}

export function insertPackage(pkg) {
  const id = pkg.id || ('pkg_' + Buffer.from(`${pkg.titleId}::${pkg.version}::${Date.now()}`).toString('hex').slice(0, 16));
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO software_packages (
      id, titleId, intuneAppId, intuneAppName, version, platform, packagingStatus,
      fileName, setupFilePath, installCommandLine, uninstallCommandLine,
      msiProductCode, detectionSummary, sourceSharePath, sizeInBytes,
      isAssigned, assignedIntents, assignedGroupIds, notes, description,
      createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    pkg.titleId,
    pkg.intuneAppId || null,
    pkg.intuneAppName || null,
    pkg.version,
    pkg.platform || 'windows',
    pkg.packagingStatus || 'Packaged & Ready',
    pkg.fileName || null,
    pkg.setupFilePath || null,
    pkg.installCommandLine || null,
    pkg.uninstallCommandLine || null,
    pkg.msiProductCode || null,
    pkg.detectionSummary || null,
    pkg.sourceSharePath || null,
    pkg.sizeInBytes ?? null,
    pkg.isAssigned ? 1 : 0,
    typeof pkg.assignedIntents === 'string' ? pkg.assignedIntents : JSON.stringify(pkg.assignedIntents || []),
    typeof pkg.assignedGroupIds === 'string' ? pkg.assignedGroupIds : JSON.stringify(pkg.assignedGroupIds || []),
    pkg.notes || null,
    pkg.description || null,
    pkg.createdAt || now,
    pkg.updatedAt || now
  );
  return getPackageById(id);
}

export function updatePackage(id, fields = {}) {
  const existing = getPackageById(id);
  if (!existing) return null;
  const now = new Date().toISOString();

  const intuneAppName = fields.intuneAppName !== undefined ? fields.intuneAppName : existing.intuneAppName;
  const version = fields.version !== undefined ? fields.version : existing.version;
  const platform = fields.platform !== undefined ? fields.platform : existing.platform;
  const packagingStatus = fields.packagingStatus !== undefined ? fields.packagingStatus : existing.packagingStatus;
  const fileName = fields.fileName !== undefined ? fields.fileName : existing.fileName;
  const setupFilePath = fields.setupFilePath !== undefined ? fields.setupFilePath : existing.setupFilePath;
  const installCommandLine = fields.installCommandLine !== undefined ? fields.installCommandLine : existing.installCommandLine;
  const uninstallCommandLine = fields.uninstallCommandLine !== undefined ? fields.uninstallCommandLine : existing.uninstallCommandLine;
  const msiProductCode = fields.msiProductCode !== undefined ? fields.msiProductCode : existing.msiProductCode;
  const detectionSummary = fields.detectionSummary !== undefined ? fields.detectionSummary : existing.detectionSummary;
  const sourceSharePath = fields.sourceSharePath !== undefined ? fields.sourceSharePath : existing.sourceSharePath;
  const sizeInBytes = fields.sizeInBytes !== undefined ? fields.sizeInBytes : existing.sizeInBytes;
  const isAssigned = fields.isAssigned !== undefined ? (fields.isAssigned ? 1 : 0) : existing.isAssigned;
  const assignedIntents = fields.assignedIntents !== undefined
    ? (typeof fields.assignedIntents === 'string' ? fields.assignedIntents : JSON.stringify(fields.assignedIntents))
    : JSON.stringify(existing.assignedIntents);
  const assignedGroupIds = fields.assignedGroupIds !== undefined
    ? (typeof fields.assignedGroupIds === 'string' ? fields.assignedGroupIds : JSON.stringify(fields.assignedGroupIds))
    : JSON.stringify(existing.assignedGroupIds);
  const notes = fields.notes !== undefined ? fields.notes : existing.notes;
  const description = fields.description !== undefined ? fields.description : existing.description;

  db.prepare(`
    UPDATE software_packages SET
      intuneAppName = ?,
      version = ?,
      platform = ?,
      packagingStatus = ?,
      fileName = ?,
      setupFilePath = ?,
      installCommandLine = ?,
      uninstallCommandLine = ?,
      msiProductCode = ?,
      detectionSummary = ?,
      sourceSharePath = ?,
      sizeInBytes = ?,
      isAssigned = ?,
      assignedIntents = ?,
      assignedGroupIds = ?,
      notes = ?,
      description = ?,
      updatedAt = ?
    WHERE id = ?
  `).run(
    intuneAppName,
    version,
    platform,
    packagingStatus,
    fileName,
    setupFilePath,
    installCommandLine,
    uninstallCommandLine,
    msiProductCode,
    detectionSummary,
    sourceSharePath,
    sizeInBytes,
    isAssigned,
    assignedIntents,
    assignedGroupIds,
    notes,
    description,
    now,
    id
  );

  return getPackageById(id);
}

export function deletePackage(id) {
  const existing = getPackageById(id);
  if (!existing) return { deleted: false, reason: 'Package not found' };
  db.prepare(`DELETE FROM software_packages WHERE id = ?`).run(id);
  return { deleted: true, id, titleId: existing.titleId };
}

// Clear all requests & tasks (clean slate reset)
export function clearAllRequests() {
  db.prepare(`DELETE FROM catalog_tasks`).run();
  db.prepare(`DELETE FROM software_requests`).run();
  return { success: true };
}

// Delete single request and its child tasks
export function deleteRequest(id) {
  const existing = getRequestById(id);
  if (!existing) return { deleted: false, reason: 'Request not found' };
  db.prepare(`DELETE FROM catalog_tasks WHERE requestId = ?`).run(existing.id);
  db.prepare(`DELETE FROM software_requests WHERE id = ?`).run(existing.id);
  return { deleted: true, id: existing.id, number: existing.number };
}

// Get Total Title Count
export function getCatalogCount() {
  const row = db.prepare(`SELECT COUNT(*) as count FROM software_titles`).get();
  return row ? row.count : 0;
}

// Get All Requests (with child tasks)
export function getRequests(filterState = null) {
  let stmt;
  let reqs;
  if (filterState && filterState !== 'all') {
    stmt = db.prepare(`SELECT * FROM software_requests WHERE state LIKE ? ORDER BY submittedAt DESC`);
    reqs = stmt.all(`%${filterState}%`);
  } else {
    stmt = db.prepare(`SELECT * FROM software_requests ORDER BY submittedAt DESC`);
    reqs = stmt.all();
  }

  const taskStmt = db.prepare(`SELECT * FROM catalog_tasks WHERE requestId = ? ORDER BY createdAt ASC`);
  return reqs.map(r => ({
    ...r,
    packagingArtifacts: r.packagingArtifacts ? JSON.parse(r.packagingArtifacts) : null,
    tasks: taskStmt.all(r.id),
  }));
}

// Get Request by ID
export function getRequestById(id) {
  const stmt = db.prepare(`SELECT * FROM software_requests WHERE id = ? OR number = ?`);
  const req = stmt.get(id, id);
  if (!req) return null;

  const taskStmt = db.prepare(`SELECT * FROM catalog_tasks WHERE requestId = ? ORDER BY createdAt ASC`);
  return {
    ...req,
    packagingArtifacts: req.packagingArtifacts ? JSON.parse(req.packagingArtifacts) : null,
    tasks: taskStmt.all(req.id),
  };
}

// Create New Request and Child Tasks
export function insertRequest(reqObj, tasksArray = []) {
  const insertReqStmt = db.prepare(`
    INSERT INTO software_requests (
      id, number, shortDescription, titleId, titleName, publisher, version,
      platform, category, installerType, installerSource, requestedBy, requestedFor,
      requesterEmail, beneficiaryEmail, department, targetDevice, installType, deploymentScope,
      businessJustification, disposition, stage, state, priority, isUnlisted,
      licenseRequired, isNewVersion, submittedAt, updatedAt, packagingArtifacts
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?
    )
  `);

  const now = new Date().toISOString();
  const requestedFor = reqObj.requestedFor || reqObj.requestedBy || 'Requester';
  const requestedBy = reqObj.requestedBy || requestedFor;
  const submittedAt = reqObj.submittedAt || now;
  const updatedAt = reqObj.updatedAt || now;

  insertReqStmt.run(
    reqObj.id,
    reqObj.number,
    reqObj.shortDescription || `Software Request: ${reqObj.titleName || ''}`,
    reqObj.titleId || null,
    reqObj.titleName || 'Software Title',
    reqObj.publisher || 'Publisher',
    reqObj.version || '1.0.0',
    reqObj.platform || 'windows',
    reqObj.category || null,
    reqObj.installerType || null,
    reqObj.installerSource || null,
    requestedBy,
    requestedFor,
    reqObj.requesterEmail || null,
    reqObj.beneficiaryEmail || reqObj.requesterEmail || null,
    reqObj.department || 'General',
    reqObj.targetDevice || null,
    reqObj.installType || 'New Install',
    reqObj.deploymentScope || 'Individual',
    reqObj.businessJustification || 'Business need',
    reqObj.disposition || 'Review Required',
    reqObj.stage || 'governance_review',
    reqObj.state || 'In Review',
    reqObj.priority || 'Medium',
    reqObj.isUnlisted ? 1 : 0,
    reqObj.licenseRequired || 'No',
    reqObj.isNewVersion ? 1 : 0,
    submittedAt,
    updatedAt,
    reqObj.packagingArtifacts ? JSON.stringify(reqObj.packagingArtifacts) : null
  );

  const insertTaskStmt = db.prepare(`
    INSERT INTO catalog_tasks (
      id, requestId, number, name, assignmentGroup, state, claimedBy, completedBy, completedAt, notes, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  tasksArray.forEach(t => {
    insertTaskStmt.run(
      t.id,
      t.requestId,
      t.number,
      t.name,
      t.assignmentGroup,
      t.state,
      t.claimedBy || null,
      t.completedBy || null,
      t.completedAt || null,
      t.notes || null,
      t.createdAt || reqObj.submittedAt || now,
      t.updatedAt || reqObj.updatedAt || now
    );
  });

  return getRequestById(reqObj.id);
}

// Update Request Fields
export function updateRequestFields(id, updates = {}) {
  const req = getRequestById(id);
  if (!req) return null;

  const merged = { ...req, ...updates, updatedAt: new Date().toISOString() };
  const stmt = db.prepare(`
    UPDATE software_requests SET
      stage = ?,
      state = ?,
      updatedAt = ?,
      packagingArtifacts = ?
    WHERE id = ?
  `);
  stmt.run(
    merged.stage,
    merged.state,
    merged.updatedAt,
    merged.packagingArtifacts ? JSON.stringify(merged.packagingArtifacts) : null,
    id
  );
  return getRequestById(id);
}

// Get Task by ID
export function getTaskById(taskId) {
  const stmt = db.prepare(`SELECT * FROM catalog_tasks WHERE id = ? OR number = ?`);
  return stmt.get(taskId, taskId);
}

// Update Task
export function updateTaskRecord(taskId, updates = {}) {
  const task = getTaskById(taskId);
  if (!task) return null;

  const merged = { ...task, ...updates, updatedAt: new Date().toISOString() };
  const stmt = db.prepare(`
    UPDATE catalog_tasks SET
      state = ?,
      claimedBy = ?,
      completedBy = ?,
      completedAt = ?,
      notes = ?,
      updatedAt = ?
    WHERE id = ?
  `);
  stmt.run(
    merged.state,
    merged.claimedBy || null,
    merged.completedBy || null,
    merged.completedAt || null,
    merged.notes || null,
    merged.updatedAt,
    taskId
  );
  return getTaskById(taskId);
}

// App Settings (e.g. Teams Webhook URL)
export function getSetting(key, defaultValue = '') {
  const row = db.prepare(`SELECT value FROM app_settings WHERE key = ?`).get(key);
  return row ? row.value : defaultValue;
}

export function setSetting(key, value) {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO app_settings (key, value, updatedAt)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt
  `).run(key, String(value), now);
}

// ── 3. Upsert Software Title & Version (from Governance Workflow) ─────────────
export function upsertCatalogTitleAndVersion(titleData, versionData) {
  const { displayName, publisher, category, supportedPlatforms, licenseRequired } = titleData;
  const { version, disposition, dispositionReason, alternative, packagingStatus } = versionData;
  const now = new Date().toISOString();

  // Search if title exists by publisher & displayName
  let existingTitle = db.prepare(`SELECT * FROM software_titles WHERE LOWER(displayName) = LOWER(?) AND LOWER(publisher) = LOWER(?)`).get(displayName, publisher);

  let titleId;
  if (existingTitle) {
    titleId = existingTitle.id;
  } else {
    titleId = 'title_' + Buffer.from(`${publisher}::${displayName}`).toString('hex').slice(0, 16);
    db.prepare(`
      INSERT INTO software_titles (
        id, displayName, publisher, category, subcategory, supportedPlatforms,
        licenseRequired, isSaaSOrInternetFacing, dataClassification, defaultInstallerType,
        description, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      titleId,
      displayName,
      publisher,
      category || 'Enterprise Application',
      '',
      JSON.stringify(supportedPlatforms || ['windows']),
      licenseRequired || 'No',
      0,
      'Internal',
      JSON.stringify({ windows: 'msi', macos: 'pkg' }),
      `Enterprise software title for ${displayName}`,
      now,
      now
    );
  }

  // Check if version exists
  let existingVer = db.prepare(`SELECT * FROM software_versions WHERE titleId = ? AND version = ?`).get(titleId, version);

  if (existingVer) {
    db.prepare(`
      UPDATE software_versions SET
        disposition = ?,
        dispositionReason = ?,
        alternative = ?,
        packagingStatus = ?,
        updatedAt = ?
      WHERE id = ?
    `).run(
      disposition,
      dispositionReason || '',
      alternative || null,
      packagingStatus || existingVer.packagingStatus,
      now,
      existingVer.id
    );
  } else {
    const verId = 'ver_' + Buffer.from(`${titleId}::${version}::${Date.now()}`).toString('hex').slice(0, 16);
    db.prepare(`
      INSERT INTO software_versions (
        id, titleId, version, disposition, dispositionReason, alternative,
        packagingStatus, packageRef, installerSource, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      verId,
      titleId,
      version,
      disposition,
      dispositionReason || '',
      alternative || null,
      packagingStatus || 'Not Packaged',
      null,
      null,
      now,
      now
    );
  }

  return getTitleById(titleId);
}

// ── 4. NIST Risk Cache Helpers ───────────────────────────────────────────────
export function getCachedNistRisk(titleName, version = '') {
  if (!titleName) return null;
  const cleanTitle = titleName.trim().toLowerCase();
  const row = db.prepare(`
    SELECT * FROM nist_risk_cache 
    WHERE LOWER(titleName) = ?
    ORDER BY fetchedAt DESC 
    LIMIT 1
  `).get(cleanTitle);

  if (!row) return null;

  // Check TTL (24 hours = 86,400,000 ms)
  const ageMs = Date.now() - new Date(row.fetchedAt).getTime();
  if (ageMs > 24 * 60 * 60 * 1000) {
    return null; // Stale cache
  }

  return {
    ...row,
    cves: row.cvesJson ? JSON.parse(row.cvesJson) : [],
    violations: row.violationsJson ? JSON.parse(row.violationsJson) : [],
    isCached: true,
  };
}

export function saveNistRisk(evalObj) {
  const { titleName, version, riskScore, riskLevel, maxCvss, trendingCount, totalCves, cves, violations } = evalObj;
  const id = 'nist_' + Buffer.from(`${titleName}::${version || ''}`).toString('hex').slice(0, 16);
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO nist_risk_cache (
      id, titleName, version, riskScore, riskLevel, maxCvss, trendingCount, totalCves, cvesJson, violationsJson, fetchedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      riskScore = excluded.riskScore,
      riskLevel = excluded.riskLevel,
      maxCvss = excluded.maxCvss,
      trendingCount = excluded.trendingCount,
      totalCves = excluded.totalCves,
      cvesJson = excluded.cvesJson,
      violationsJson = excluded.violationsJson,
      fetchedAt = excluded.fetchedAt
  `).run(
    id,
    titleName.trim(),
    version || '',
    riskScore ?? 0,
    riskLevel || 'LOW',
    maxCvss ?? 0,
    trendingCount ?? 0,
    totalCves ?? 0,
    JSON.stringify(cves || []),
    JSON.stringify(violations || []),
    now
  );

  return getCachedNistRisk(titleName, version);
}

export function clearNistCache(titleName) {
  if (!titleName) {
    db.prepare(`DELETE FROM nist_risk_cache`).run();
  } else {
    db.prepare(`DELETE FROM nist_risk_cache WHERE LOWER(titleName) = ?`).run(titleName.trim().toLowerCase());
  }
}

export function updateTaskRiskEvaluation(taskId, evalData = {}) {
  const task = getTaskById(taskId);
  if (!task) return null;
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE catalog_tasks SET
      riskEvaluation = ?,
      updatedAt = ?
    WHERE id = ?
  `).run(JSON.stringify(evalData), now, taskId);
  return getTaskById(taskId);
}

// Initialize tables immediately on module load
initSchema();
