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
    CREATE INDEX IF NOT EXISTS idx_requests_stage ON software_requests(stage);
    CREATE INDEX IF NOT EXISTS idx_tasks_request ON catalog_tasks(requestId);
    CREATE INDEX IF NOT EXISTS idx_tasks_group ON catalog_tasks(assignmentGroup);
    CREATE INDEX IF NOT EXISTS idx_tasks_state ON catalog_tasks(state);
  `);

  // Safe idempotent column additions
  try { db.exec(`ALTER TABLE software_requests ADD COLUMN requestedBy TEXT;`); } catch (_) {}
  try { db.exec(`ALTER TABLE software_requests ADD COLUMN beneficiaryEmail TEXT;`); } catch (_) {}
  try { db.exec(`ALTER TABLE software_requests ADD COLUMN isUnlisted INTEGER DEFAULT 0;`); } catch (_) {}
}

// ── 2. Helper Queries ─────────────────────────────────────────────────────────

// Search Software Titles with optional filters
export function searchCatalog(query = '', limit = 100, filters = {}) {
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
    conditions.push('id IN (SELECT titleId FROM software_versions WHERE disposition = ?)');
    params.push(filters.disposition);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  let orderBy = 'ORDER BY displayName ASC';

  if (query && query.trim() !== '') {
    const qPrefix = `${query.trim()}%`;
    params.push(qPrefix); // for CASE WHEN displayName LIKE ?
    orderBy = `ORDER BY CASE WHEN displayName LIKE ? THEN 1 ELSE 2 END, displayName ASC`;
  }

  const sql = `SELECT * FROM software_titles ${whereClause} ${orderBy} LIMIT ?`;
  params.push(limit);

  const stmt = db.prepare(sql);
  const rows = stmt.all(...params);

  // Hydrate versions for each title
  const verStmt = db.prepare(`SELECT * FROM software_versions WHERE titleId = ? ORDER BY version ASC`);
  return rows.map(r => {
    const versions = verStmt.all(r.id).map(v => ({
      ...v,
      packageRef: v.packageRef ? JSON.parse(v.packageRef) : null,
      installerSource: v.installerSource ? JSON.parse(v.installerSource) : null,
    }));
    return {
      ...r,
      supportedPlatforms: r.supportedPlatforms ? JSON.parse(r.supportedPlatforms) : ['windows'],
      defaultInstallerType: r.defaultInstallerType ? JSON.parse(r.defaultInstallerType) : { windows: 'msi' },
      versions,
    };
  });
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

  const verStmt = db.prepare(`SELECT * FROM software_versions WHERE titleId = ? ORDER BY version ASC`);
  const versions = verStmt.all(id).map(v => ({
    ...v,
    packageRef: v.packageRef ? JSON.parse(v.packageRef) : null,
    installerSource: v.installerSource ? JSON.parse(v.installerSource) : null,
  }));

  return {
    ...title,
    supportedPlatforms: title.supportedPlatforms ? JSON.parse(title.supportedPlatforms) : ['windows'],
    defaultInstallerType: title.defaultInstallerType ? JSON.parse(title.defaultInstallerType) : { windows: 'msi' },
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

  // Delete versions & title
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
      businessJustification, disposition, stage, state, priority, isUnlisted, submittedAt, updatedAt, packagingArtifacts
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
  `);

  insertReqStmt.run(
    reqObj.id,
    reqObj.number,
    reqObj.shortDescription,
    reqObj.titleId || null,
    reqObj.titleName,
    reqObj.publisher,
    reqObj.version,
    reqObj.platform,
    reqObj.category || null,
    reqObj.installerType || null,
    reqObj.installerSource || null,
    reqObj.requestedBy || reqObj.requestedFor,
    reqObj.requestedFor,
    reqObj.requesterEmail || null,
    reqObj.beneficiaryEmail || reqObj.requesterEmail || null,
    reqObj.department,
    reqObj.targetDevice || null,
    reqObj.installType,
    reqObj.deploymentScope,
    reqObj.businessJustification,
    reqObj.disposition,
    reqObj.stage,
    reqObj.state,
    reqObj.priority || 'Medium',
    reqObj.isUnlisted ? 1 : 0,
    reqObj.submittedAt,
    reqObj.updatedAt,
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
      t.createdAt || reqObj.submittedAt,
      t.updatedAt || reqObj.updatedAt
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

// Initialize tables immediately on module load
initSchema();
