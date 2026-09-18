import express from 'express';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  db,
  searchCatalog,
  getTitleById,
  getCatalogCount,
  getCatalogStats,
  getCatalogCategories,
  updateTitle,
  deleteTitle,
  updateVersion,
  deleteVersion,
  getPackagesByTitleId,
  getPackageById,
  insertPackage,
  updatePackage,
  deletePackage,
  getRequests,
  getRequestById,
  insertRequest,
  deleteRequest,
  updateRequestFields,
  getTaskById,
  updateTaskRecord,
  updateTaskRiskEvaluation,
  getSetting,
  setSetting,
  upsertCatalogTitleAndVersion,
} from './db/database.js';
import {
  notifyNewRequest,
  notifyTaskAction,
  notifyPackagingComplete,
  sendTeamsCard,
} from './lib/teamsNotifier.js';
import { evaluateNistRisk } from './services/nistService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = process.env.PORT || 3002;
const app = express();

// ── Native CORS Middleware ────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.json());

// Helper for generating sequential numbers
// ── Per-table in-memory counters (initialized from DB max on first use) ───
// This guarantees uniqueness even when multiple numbers are generated in a
// single request before any inserts have been committed to disk.
const _counters = new Map();
function generateNextNumber(prefix, table, col = 'number') {
  const key = `${table}:${prefix}`;
  if (!_counters.has(key)) {
    // Seed from the highest number already in the database
    const row = db.prepare(
      `SELECT MAX(CAST(SUBSTR(${col}, LENGTH(?) + 1) AS INTEGER)) AS n FROM ${table} WHERE ${col} LIKE ?`
    ).get(prefix, `${prefix}%`);
    _counters.set(key, (row && row.n) ? row.n : 10000);
  }
  const next = _counters.get(key) + 1;
  _counters.set(key, next);
  return `${prefix}${String(next).padStart(7, '0')}`;
}

// ═════════════════════════════════════════════════════════════════════════════
// 0. Identity / Logged-on User API (Windows security context via env vars)
// ═════════════════════════════════════════════════════════════════════════════

// GET /api/intake/whoami — returns the Windows logged-on user from env vars
app.get('/api/intake/whoami', (req, res) => {
  // Windows env vars set automatically by the OS / AD login:
  //   USERNAME      = SAM account (e.g. F7NXPWL)
  //   USERDOMAIN    = NetBIOS domain (e.g. CORP)
  //   USERDNSDOMAIN = DNS domain (e.g. corp.company.com)
  //   USERPROFILE   = profile path (e.g. C:\Users\F7NXPWL)
  //   DISPLAYNAME   = full display name (set by some AD environments)
  const username       = process.env.USERNAME      || process.env.USER        || '';
  const domain         = process.env.USERDOMAIN    || process.env.COMPUTERNAME || '';
  const dnsDomain      = process.env.USERDNSDOMAIN || '';
  const userprofile    = process.env.USERPROFILE   || '';
  const envDisplayName = process.env.DISPLAYNAME   || '';

  // SAM account: prefer USERNAME, fall back to last segment of USERPROFILE path
  let samAccount = username;
  if (!samAccount && userprofile) {
    samAccount = userprofile.split(/[/\\\\]/).filter(Boolean).pop() || '';
  }

  // Display name: use DISPLAYNAME env var if set by AD, otherwise SAM account
  const displayName = envDisplayName || samAccount;

  // Email domain: CORP_EMAIL_DOMAIN override > USERDNSDOMAIN > USERDOMAIN.com
  let emailDomain = process.env.CORP_EMAIL_DOMAIN || '';
  if (!emailDomain && dnsDomain) emailDomain = dnsDomain.toLowerCase();
  if (!emailDomain && domain)    emailDomain = domain.toLowerCase() + '.com';
  if (!emailDomain)              emailDomain = 'company.com';

  const email = samAccount ? samAccount.toLowerCase() + '@' + emailDomain : '';

  res.json({ username: samAccount, displayName, domain, dnsDomain, email, source: 'windows-env' });
});

// ═════════════════════════════════════════════════════════════════════════════
// 1. Authoritative Software Catalog API (SQLite Powered)
// ═════════════════════════════════════════════════════════════════════════════

// GET /api/intake/catalog — search and list software titles & versions with pagination
app.get('/api/intake/catalog', (req, res) => {
  try {
    const { search, limit, page, category, platform, disposition } = req.query;
    const pageNum = page ? Math.max(1, parseInt(page, 10)) : 1;
    const pageSize = limit === 'all' ? 'all' : (limit ? parseInt(limit, 10) : 250);
    const offset = pageSize === 'all' ? 0 : (pageNum - 1) * pageSize;

    const titles = searchCatalog(search || '', pageSize, { category, platform, disposition }, offset);
    const totalCount = getCatalogCount();
    const totalMatching = titles.totalMatching ?? titles.length;
    const totalPages = pageSize === 'all' || pageSize <= 0 ? 1 : Math.ceil(totalMatching / pageSize);

    res.json({
      titles,
      count: titles.length,
      totalMatching,
      totalInDatabase: totalCount,
      page: pageNum,
      pageSize: pageSize === 'all' ? totalMatching : pageSize,
      totalPages,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/intake/catalog/stats — get authoritative catalog metrics
app.get('/api/intake/catalog/stats', (req, res) => {
  try {
    const stats = getCatalogStats();
    res.json({ stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/intake/catalog/categories — get distinct software categories
app.get('/api/intake/catalog/categories', (req, res) => {
  try {
    const categories = getCatalogCategories();
    res.json({ categories });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/intake/catalog/titles/:id — get specific software title model
app.get('/api/intake/catalog/titles/:id', (req, res) => {
  try {
    const title = getTitleById(req.params.id);
    if (!title) return res.status(404).json({ error: 'Software title not found' });
    res.json({ title });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/intake/catalog/titles — register new software model
app.post('/api/intake/catalog/titles', (req, res) => {
  try {
    const { displayName, publisher, category, subcategory, supportedPlatforms, licenseRequired, isSaaSOrInternetFacing, dataClassification, howToObtain, defaultInstallerType, description } = req.body;
    if (!displayName || !publisher) {
      return res.status(400).json({ error: 'displayName and publisher are required' });
    }

    const id = 'title_' + Buffer.from(`${publisher}::${displayName}`).toString('hex').slice(0, 16);
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO software_titles (
        id, displayName, publisher, category, subcategory, supportedPlatforms,
        licenseRequired, isSaaSOrInternetFacing, dataClassification, howToObtain,
        classification, defaultInstallerType, description, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      displayName,
      publisher,
      category || 'Business',
      subcategory || '',
      JSON.stringify(supportedPlatforms || ['windows']),
      licenseRequired || 'No',
      isSaaSOrInternetFacing ? 1 : 0,
      dataClassification || 'Internal',
      howToObtain || 'Intune',
      'Commercial',
      JSON.stringify(defaultInstallerType || { windows: 'msi', macos: 'pkg' }),
      description || `Software title for ${displayName}`,
      now,
      now
    );

    const newTitle = getTitleById(id);
    res.status(201).json({ message: 'Software title registered', title: newTitle });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/intake/catalog/titles/:id — update software model metadata
app.put('/api/intake/catalog/titles/:id', (req, res) => {
  try {
    const { id } = req.params;
    const updated = updateTitle(id, req.body);
    if (!updated) return res.status(404).json({ error: 'Software title not found' });
    res.json({ message: 'Software title updated', title: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/intake/catalog/titles/:id — remove software model
app.delete('/api/intake/catalog/titles/:id', (req, res) => {
  try {
    const { id } = req.params;
    const result = deleteTitle(id);
    if (!result.deleted) {
      return res.status(400).json({ error: result.reason, activeRequestCount: result.activeRequestCount });
    }
    res.json({ message: 'Software title deleted successfully', id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/intake/catalog/titles/:id/versions — add version record
app.post('/api/intake/catalog/titles/:id/versions', (req, res) => {
  try {
    const { id } = req.params;
    const title = getTitleById(id);
    if (!title) return res.status(404).json({ error: 'Software title not found' });

    const { version, disposition, dispositionReason, alternative, packagingStatus, packageRef, installerSource } = req.body;
    if (!version || !disposition) {
      return res.status(400).json({ error: 'version and disposition are required' });
    }

    const verId = 'ver_' + Buffer.from(`${id}::${version}::${Date.now()}`).toString('hex').slice(0, 16);
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO software_versions (
        id, titleId, version, disposition, dispositionReason, alternative, packagingStatus,
        packageRef, installerSource, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      verId,
      id,
      version,
      disposition,
      dispositionReason || '',
      alternative || null,
      packagingStatus || 'Not Packaged',
      packageRef ? JSON.stringify(packageRef) : null,
      installerSource ? JSON.stringify(installerSource) : null,
      now,
      now
    );

    const updated = getTitleById(id);
    res.status(201).json({ message: 'Version record added', title: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/intake/catalog/titles/:id/versions/:verId — update version record
app.put('/api/intake/catalog/titles/:id/versions/:verId', (req, res) => {
  try {
    const { id, verId } = req.params;
    const updated = updateVersion(id, verId, req.body);
    if (!updated) return res.status(404).json({ error: 'Version record or title not found' });
    res.json({ message: 'Version record updated', title: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/intake/catalog/titles/:id/versions/:verId — delete version record
app.delete('/api/intake/catalog/titles/:id/versions/:verId', (req, res) => {
  try {
    const { id, verId } = req.params;
    const result = deleteVersion(id, verId);
    if (!result.deleted) return res.status(404).json({ error: result.reason });
    res.json({ message: 'Version record deleted', title: result.title });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/intake/catalog/titles/:id/packages — get all packaged releases
app.get('/api/intake/catalog/titles/:id/packages', (req, res) => {
  try {
    const { id } = req.params;
    const title = getTitleById(id);
    if (!title) return res.status(404).json({ error: 'Software title not found' });
    const packages = getPackagesByTitleId(id);
    res.json({ packages });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/intake/catalog/titles/:id/packages — register new packaged release
app.post('/api/intake/catalog/titles/:id/packages', (req, res) => {
  try {
    const { id } = req.params;
    const title = getTitleById(id);
    if (!title) return res.status(404).json({ error: 'Software title not found' });

    const { version, platform, packagingStatus, intuneAppId, installCommandLine, uninstallCommandLine, msiProductCode, detectionSummary, sourceSharePath, fileName, setupFilePath, notes, description } = req.body;
    if (!version) return res.status(400).json({ error: 'Version is required' });

    const newPkg = insertPackage({
      titleId: id,
      version: version.trim(),
      platform: platform || 'windows',
      packagingStatus: packagingStatus || 'Packaged & Ready',
      intuneAppId: intuneAppId?.trim() || null,
      installCommandLine: installCommandLine?.trim() || null,
      uninstallCommandLine: uninstallCommandLine?.trim() || null,
      msiProductCode: msiProductCode?.trim() || null,
      detectionSummary: detectionSummary?.trim() || null,
      sourceSharePath: sourceSharePath?.trim() || null,
      fileName: fileName?.trim() || null,
      setupFilePath: setupFilePath?.trim() || null,
      notes: notes?.trim() || null,
      description: description?.trim() || null,
    });

    const updatedTitle = getTitleById(id);
    res.status(201).json({ message: 'Package registered', package: newPkg, title: updatedTitle });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/intake/catalog/titles/:id/packages/:packageId — update package details
app.put('/api/intake/catalog/titles/:id/packages/:packageId', (req, res) => {
  try {
    const { id, packageId } = req.params;
    const updated = updatePackage(packageId, req.body);
    if (!updated) return res.status(404).json({ error: 'Package not found' });
    const updatedTitle = getTitleById(id);
    res.json({ message: 'Package updated', package: updated, title: updatedTitle });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/intake/catalog/titles/:id/packages/:packageId — delete package
app.delete('/api/intake/catalog/titles/:id/packages/:packageId', (req, res) => {
  try {
    const { id, packageId } = req.params;
    const result = deletePackage(packageId);
    if (!result.deleted) return res.status(404).json({ error: result.reason });
    const updatedTitle = getTitleById(id);
    res.json({ message: 'Package deleted', title: updatedTitle });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. Software Request Intake & State Machine API
// ═════════════════════════════════════════════════════════════════════════════

// POST /api/intake/requests — submit a new software request (Service Catalog)
app.post('/api/intake/requests', async (req, res) => {
  try {
    const {
      titleId,
      titleName,
      publisher,
      version,
      platform,
      category,
      installerType,
      installerSource,
      requestedBy,
      requestedFor,
      requesterEmail,
      beneficiaryEmail,
      department,
      targetDevice,
      installType,
      deploymentScope,
      businessJustification,
      priority,
      isUnlisted,
      isNewVersion,
      licenseRequired: licenseRequiredInput,
    } = req.body;

    if (!titleName || !version || !requestedFor || !businessJustification) {
      return res.status(400).json({
        error: 'Missing required fields: titleName, version, requestedFor, and businessJustification are required.',
      });
    }

    const titleModel = titleId ? getTitleById(titleId) : null;
    let versionEntry = null;
    let evaluatedDisposition = 'Approved';

    if (titleModel && !isUnlisted) {
      versionEntry = (titleModel.versions || []).find(v => v.version === version);
      if (versionEntry) {
        evaluatedDisposition = versionEntry.disposition || titleModel.defaultDisposition || 'Approved';
      } else {
        // Unvetted new version request for existing model
        evaluatedDisposition = 'Review Required';
      }
    } else {
      evaluatedDisposition = 'Review Required';
    }

    // Determine license requirement
    const requiresLicense = isUnlisted
      ? (licenseRequiredInput === 'Yes')
      : (titleModel?.licenseRequired === 'Yes');

    // ── USE CASE 1: Approved & Already Packaged and Available in Intune ──────
    const existingPackage = (titleModel?.packages || []).find(p =>
      p.version === version &&
      (p.packagingStatus === 'Packaged & Ready' || p.intuneAppId)
    );

    const isAlreadyAvailable =
      !isUnlisted &&
      !isNewVersion &&
      evaluatedDisposition === 'Approved' &&
      Boolean(existingPackage);

    if (isAlreadyAvailable) {
      // Refer user directly to Intune Company Portal; bypass/delete request
      const appDisplayName = existingPackage.intuneAppName || titleModel.displayName;
      return res.status(200).json({
        instantAvailable: true,
        deleted: true,
        intuneAppName: appDisplayName,
        version: existingPackage.version,
        intuneAppId: existingPackage.intuneAppId,
        message: `Software "${appDisplayName}" (v${version}) is already approved, packaged, and available in Microsoft Intune Company Portal for instant self-service installation. No approval request is required.`,
        instructions: [
          'Open the Windows Start Menu and launch "Company Portal".',
          `Search for "${appDisplayName}".`,
          'Click "Install" to begin immediate deployment to your workstation.',
        ],
      });
    }

    // Prepare Request Record
    const now = new Date().toISOString();
    const reqNumber = generateNextNumber('RITM', 'software_requests');
    const reqId = 'REQ_' + reqNumber;

    let initialStage = 'governance_review';
    let initialState = 'In Review';
    let requestInstallType = installType || 'New Install';
    const tasks = [];

    const addTask = (name, group, notes, state = 'Pending') => {
      const num = generateNextNumber('SCTASK', 'catalog_tasks');
      tasks.push({
        id: 'TASK_' + num, requestId: reqId, number: num,
        name, assignmentGroup: group, state, notes, createdAt: now, updatedAt: now,
      });
    };

    // ── USE CASE 3: Denied Software Title / Version (Exception Request) ─────
    if (evaluatedDisposition === 'Denied' || titleModel?.defaultDisposition === 'Denied') {
      requestInstallType = 'Exception';
      evaluatedDisposition = 'Denied';

      addTask(
        'Risk Review', 'Enterprise Risk',
        `EXCEPTION REQUEST: Assess architectural waiver and operational risk acceptance for prohibited software "${titleName}" v${version}. Business Justification: ${businessJustification}`,
        'Open'
      );

      if (requiresLicense) {
        addTask(
          'Licensing Review', 'Software Asset Management',
          `Confirm software license model, seat availability, and SAM compliance for exception request of "${titleName}".`,
          'Open'
        );
      }

      addTask(
        'Packaging Review & Execution', 'EUC Software Packaging Team',
        `Build and validate package via SPA Workbench upon exception and governance clearance. Scope: ${deploymentScope}.`,
        'Pending'
      );

    // ── USE CASE 2: Approved Title, but User Requests a NEW Version ─────────
    } else if (titleModel && (isNewVersion || !versionEntry)) {
      evaluatedDisposition = 'Review Required';

      addTask(
        'Risk Review', 'Enterprise Risk',
        `New version intake for approved title "${titleName}": Assess operational, security, and compatibility risk of v${version}.`,
        'Open'
      );

      if (requiresLicense) {
        addTask(
          'Licensing Review', 'Software Asset Management',
          `Confirm software license entitlement and seat availability for new version "${titleName}" v${version}.`,
          'Open'
        );
      }

      addTask(
        'Packaging Review & Execution', 'EUC Software Packaging Team',
        `Package and publish ${platform.toUpperCase()} release via SPA Workbench upon risk and licensing clearance. Scope: ${deploymentScope}.`,
        'Pending'
      );

    // ── USE CASE 4: Net New Title / Version (Unlisted Software) ─────────────
    } else if (isUnlisted) {
      evaluatedDisposition = 'Review Required';

      addTask(
        'Risk Review', 'Enterprise Risk',
        `Net new software intake: Assess third-party, architecture, and cybersecurity risk for unlisted title "${titleName}" v${version}. Category: ${category || 'General'}.`,
        'Open'
      );

      if (requiresLicense) {
        addTask(
          'Licensing Review', 'Software Asset Management',
          `Commercial software licensing review: Verify vendor license terms, cost allocation, and SAM compliance for "${titleName}".`,
          'Open'
        );
      }

      addTask(
        'Packaging Review & Execution', 'EUC Software Packaging Team',
        `Build and validate package upon full governance approval. Platform: ${platform.toUpperCase()}. Scope: ${deploymentScope}.`,
        'Pending'
      );

    // ── Standard Approved Title (existing model and version) ────────────────
    } else {
      if (evaluatedDisposition === 'Approved' && requiresLicense && existingPackage) {
        // Already approved and packaged in Intune, only commercial license assignment required
        addTask(
          'Licensing Review', 'Software Asset Management',
          `Commercial license assignment & seat allocation for approved title "${titleName}" v${version}.`,
          'Open'
        );
      } else {
        addTask(
          'Risk Review', 'Enterprise Risk',
          `Operational risk validation for ${titleName} v${version} deployment in ${department} environment.`,
          'Open'
        );

        if (requiresLicense) {
          addTask(
            'Licensing Review', 'Software Asset Management',
            `Validate license entitlement and seat allocation for ${titleName}.`,
            'Open'
          );
        }

        addTask(
          'Packaging Review & Execution', 'EUC Software Packaging Team',
          `Package and publish ${platform.toUpperCase()} release via SPA Workbench.`,
          'Pending'
        );
      }
    }

    let nistRiskScore = 0;
    let nistRiskLevel = 'CLEAN';
    let nistSummary = null;

    try {
      const nistEval = await evaluateNistRisk(titleName, version, false);
      nistRiskScore = nistEval.riskScore || 0;
      nistRiskLevel = nistEval.riskLevel || 'CLEAN';
      nistSummary = JSON.stringify({
        maxCvss: nistEval.maxCvss,
        trendingCount: nistEval.trendingCount,
        totalCves: nistEval.totalCves,
        violations: nistEval.violations || [],
      });
    } catch (nistErr) {
      console.warn('NIST pre-evaluation skipped:', nistErr.message);
    }

    const newRequest = {
      id: reqId,
      number: reqNumber,
      shortDescription: `Software Request: ${titleName} ${version}`,
      titleId: titleId || null,
      titleName,
      publisher: publisher || (titleModel ? titleModel.publisher : 'Unknown Publisher'),
      version,
      platform: platform || 'windows',
      category: category || (titleModel ? titleModel.category : 'General Application'),
      installerType: installerType || (titleModel ? (titleModel.defaultInstallerType?.[platform] || 'msi') : 'msi'),
      installerSource: installerSource || '',
      requestedBy: requestedBy || requestedFor,
      requestedFor,
      requesterEmail: requesterEmail || `${(requestedBy || requestedFor).toLowerCase().replace(/\s+/g, '.')}@fiserv.com`,
      beneficiaryEmail: beneficiaryEmail || requesterEmail || `${requestedFor.toLowerCase().replace(/\s+/g, '.')}@fiserv.com`,
      department: department || 'General',
      targetDevice: targetDevice || 'Workstation',
      installType: requestInstallType,
      deploymentScope: deploymentScope || 'Individual',
      businessJustification,
      disposition: evaluatedDisposition,
      stage: initialStage,
      state: initialState,
      priority: priority || 'Medium',
      isUnlisted: isUnlisted ? true : false,
      licenseRequired: requiresLicense ? 'Yes' : 'No',
      isNewVersion: isNewVersion ? true : false,
      nistRiskScore,
      nistRiskLevel,
      nistSummary,
      submittedAt: now,
      updatedAt: now,
      packagingArtifacts: null,
    };

    const createdRecord = insertRequest(newRequest, tasks);

    // If NIST summary is available, attach to initial Risk Review task
    if (nistSummary) {
      const riskTask = (createdRecord.tasks || []).find(t => t.name.includes('Risk'));
      if (riskTask) {
        updateTaskRiskEvaluation(riskTask.id, JSON.parse(nistSummary));
      }
    }

    // Asynchronously notify Microsoft Teams
    notifyNewRequest(createdRecord).catch(err => console.error('Teams notify error:', err));

    const hasRiskTask = tasks.some(t => t.name.includes('Risk'));
    const hasLicenseTask = tasks.some(t => t.name.includes('Licens'));
    const targetQueue = hasRiskTask ? 'Enterprise Risk' : 'Software Asset Management';

    res.status(201).json({
      message: `Software request submitted successfully and moved to ${targetQueue} Review Queue`,
      request: createdRecord,
      initialQueue: targetQueue,
      hasRiskTask,
      hasLicenseTask,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/intake/requests — list all requests
app.get('/api/intake/requests', (req, res) => {
  try {
    const { state } = req.query;
    const requests = getRequests(state);
    res.json({ requests, count: requests.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/intake/requests/:id — get specific request
app.get('/api/intake/requests/:id', (req, res) => {
  try {
    const request = getRequestById(req.params.id);
    if (!request) return res.status(404).json({ error: 'Request not found' });
    res.json({ request });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/intake/requests/:id — delete a request
app.delete('/api/intake/requests/:id', (req, res) => {
  try {
    const result = deleteRequest(req.params.id);
    if (!result.deleted) return res.status(404).json({ error: result.reason });
    res.json({ message: `Request ${result.number || result.id} deleted successfully`, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/intake/security/nist-risk — evaluate NIST NVD 2.0 vulnerability metrics & risk score
app.get('/api/intake/security/nist-risk', async (req, res) => {
  try {
    const { title, version, refresh } = req.query;
    if (!title) {
      return res.status(400).json({ error: 'Title parameter is required' });
    }
    const forceRefresh = refresh === 'true' || refresh === '1';
    const riskData = await evaluateNistRisk(title, version || '', forceRefresh);
    res.json({ risk: riskData });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/intake/tasks/:taskId — approve or complete a task
app.patch('/api/intake/tasks/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const { action, completedBy, notes, dispositionDecision, recommendedAlternative, riskEvaluation } = req.body;

    const task = getTaskById(taskId);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const parentReq = getRequestById(task.requestId);
    if (!parentReq) return res.status(404).json({ error: 'Parent request not found' });

    // Store checklist / risk evaluation if provided
    if (riskEvaluation) {
      updateTaskRiskEvaluation(task.id, riskEvaluation);
    }

    const now = new Date().toISOString();
    const reviewerName = completedBy || 'Reviewer';

    if (action === 'reject' || dispositionDecision === 'Denied') {
      updateTaskRecord(task.id, {
        state: 'Closed Incomplete',
        completedBy: reviewerName,
        completedAt: now,
        notes: notes || 'Rejected by reviewer.',
      });

      // Mark any remaining open or pending tasks on this request as Closed Incomplete
      (parentReq.tasks || []).forEach(t => {
        if (t.id !== task.id && (t.state === 'Open' || t.state === 'Pending')) {
          updateTaskRecord(t.id, {
            state: 'Closed Incomplete',
            completedBy: reviewerName,
            completedAt: now,
            notes: `Automatically closed due to rejection of ${task.name}.`,
          });
        }
      });

      // If this was an unlisted title or new version, enroll/update as Denied in catalog
      if (parentReq.isUnlisted || parentReq.isNewVersion) {
        upsertCatalogTitleAndVersion(
          {
            displayName: parentReq.titleName,
            publisher: parentReq.publisher || 'Unknown Publisher',
            category: parentReq.category || 'Enterprise Application',
            supportedPlatforms: [parentReq.platform || 'windows'],
            licenseRequired: parentReq.licenseRequired || 'No',
          },
          {
            version: parentReq.version,
            disposition: 'Denied',
            dispositionReason: notes || `Rejected during ${task.name}.`,
            alternative: recommendedAlternative || null,
            packagingStatus: 'Prohibited',
          }
        );
      }

      const updatedReq = updateRequestFields(parentReq.id, {
        state: 'Closed Denied',
        stage: 'closed_denied',
        disposition: 'Denied',
      });
      notifyTaskAction(task, updatedReq, 'reject', reviewerName, notes).catch(() => {});
      return res.json({ message: 'Task rejected and request closed as Denied', request: updatedReq });
    }

    // Mark task complete (Approved)
    updateTaskRecord(task.id, {
      state: 'Closed Complete',
      completedBy: reviewerName,
      completedAt: now,
      notes: notes || 'Approved.',
    });

    let nextStage = parentReq.stage;
    let nextState = parentReq.state;
    let nextDisposition = parentReq.disposition;

    // Check sibling tasks on the parent request
    const freshReq = getRequestById(parentReq.id);
    const riskTask = (freshReq.tasks || []).find(t => t.name.includes('Risk'));
    const licenseTask = (freshReq.tasks || []).find(t => t.name.includes('Licens'));
    const pkgTask = (freshReq.tasks || []).find(t => t.name.includes('Packaging'));

    if (task.name.includes('Risk')) {
      if (licenseTask && licenseTask.state === 'Pending') {
        // Unlock Licensing Review
        updateTaskRecord(licenseTask.id, { state: 'Open' });
        nextStage = 'governance_review';
      }
    }

    // Check if ALL governance reviews (Risk + Licensing) are completed
    const isRiskDone = !riskTask || riskTask.state === 'Closed Complete';
    const isLicenseDone = !licenseTask || licenseTask.state === 'Closed Complete';

    if (isRiskDone && isLicenseDone) {
      if (pkgTask) {
        if (pkgTask.state === 'Pending') {
          updateTaskRecord(pkgTask.id, { state: 'Open' });
        }
        nextStage = 'packaging';
        nextState = 'In Packaging';
        nextDisposition = 'Approved';
      } else {
        nextStage = 'completed';
        nextState = 'Closed Complete';
        nextDisposition = 'Approved';
      }

      // If unlisted or new version, enroll/update into Authoritative Catalog as Approved
      if (parentReq.isUnlisted || parentReq.isNewVersion) {
        const enrolledTitle = upsertCatalogTitleAndVersion(
          {
            displayName: parentReq.titleName,
            publisher: parentReq.publisher || 'General Vendor',
            category: parentReq.category || 'Enterprise Application',
            supportedPlatforms: [parentReq.platform || 'windows'],
            licenseRequired: parentReq.licenseRequired || 'No',
          },
          {
            version: parentReq.version,
            disposition: 'Approved',
            dispositionReason: notes || 'Approved through Enterprise Risk & Licensing Governance clearance.',
            alternative: null,
            packagingStatus: 'Approved - Pending Packaging',
          }
        );
        if (!parentReq.titleId && enrolledTitle) {
          db.prepare(`UPDATE software_requests SET titleId = ? WHERE id = ?`).run(enrolledTitle.id, parentReq.id);
        }
      }
    }

    if (task.name.includes('Packaging')) {
      nextStage = 'completed';
      nextState = 'Closed Complete';
    }

    const updatedReq = updateRequestFields(parentReq.id, {
      stage: nextStage,
      state: nextState,
      disposition: nextDisposition,
    });

    notifyTaskAction(task, updatedReq, 'approve', reviewerName, notes).catch(() => {});
    res.json({ message: 'Task approved and workflow advanced', request: updatedReq });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. Packaging Workbench Queue API & Complete Callback
// ═════════════════════════════════════════════════════════════════════════════

// GET /api/intake/queue — returns packaging-ready items for SPA Workbench
app.get('/api/intake/queue', (req, res) => {
  try {
    const { platform } = req.query;
    const requests = getRequests();

    const packagingReady = requests.filter(r => {
      if (r.state === 'Closed Complete' || r.state === 'Closed Denied') return false;
      if (platform && r.platform !== platform.toLowerCase()) return false;
      return r.stage === 'packaging' || (r.tasks || []).some(t => t.name.includes('Packaging') && (t.state === 'Open' || t.state === 'In Progress'));
    });

    const items = packagingReady.map(r => {
      const pkgTask = (r.tasks || []).find(t => t.name.includes('Packaging')) || {};
      return {
        RequestID: r.number,
        DisplayName: r.titleName,
        Version: r.version,
        Vendor: r.publisher,
        Platform: r.platform === 'windows' ? 'Windows' : 'macOS',
        Category: r.category || 'General',
        Status: pkgTask.state === 'In Progress' ? 'In Progress' : 'Pending',
        Source: 'ServiceNow Intake Hub (SQLite)',
        RequestedFor: r.requestedFor,
        Department: r.department,
        BusinessJustification: r.businessJustification,
        _intakeRecordId: r.id,
        _taskId: pkgTask.id,
      };
    });

    res.json({ items, count: items.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/intake/requests/:id/complete-packaging — publish callback from Workbench
app.post('/api/intake/requests/:id/complete-packaging', async (req, res) => {
  try {
    const { id } = req.params;
    const { gitRepoUrl, commitSha, pipelineId, platform, packageId, packageVersion, notes } = req.body;

    const targetReq = getRequestById(id);
    if (!targetReq) return res.status(404).json({ error: 'Request not found' });

    const now = new Date().toISOString();

    // 1. Mark packaging task complete
    const pkgTask = (targetReq.tasks || []).find(t => t.name.includes('Packaging'));
    if (pkgTask) {
      updateTaskRecord(pkgTask.id, {
        state: 'Closed Complete',
        completedBy: 'SPA Packaging Workbench',
        completedAt: now,
        notes: notes || `Packaged and published to GitLab CI/CD (Pipeline #${pipelineId || 'N/A'}).`,
      });
    }

    // 2. Record packaging artifacts and close request
    const artifacts = {
      gitRepoUrl: gitRepoUrl || '',
      commitSha: commitSha || '',
      pipelineId: pipelineId || '',
      packageId: packageId || '',
      platform: platform || targetReq.platform,
      version: packageVersion || targetReq.version,
      packagedAt: now,
    };

    const updatedReq = updateRequestFields(targetReq.id, {
      state: 'Closed Complete',
      stage: 'completed',
      packagingArtifacts: artifacts,
    });

    // 3. Update software catalog version status
    if (targetReq.titleId) {
      db.prepare(`
        UPDATE software_versions
        SET packagingStatus = 'Packaged & Ready'
        WHERE titleId = ? AND version = ?
      `).run(targetReq.titleId, targetReq.version);
    }

    // 4. Notify Microsoft Teams
    notifyPackagingComplete(updatedReq, artifacts).catch(err => console.error(err));

    res.json({ message: 'Request packaging completed and closed', request: updatedReq });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. Microsoft Teams Integration Configuration
// ═════════════════════════════════════════════════════════════════════════════

app.get('/api/intake/integrations/teams', (req, res) => {
  const webhookUrl = process.env.TEAMS_WEBHOOK_URL || getSetting('teams_webhook_url');
  res.json({
    configured: !!webhookUrl,
    webhookUrl: webhookUrl ? webhookUrl.replace(/^(https:\/\/.*?\/).*$/, '$1...') : '',
  });
});

app.post('/api/intake/integrations/teams', async (req, res) => {
  try {
    const { webhookUrl, test } = req.body;
    if (webhookUrl) {
      setSetting('teams_webhook_url', webhookUrl);
    }

    if (test) {
      const testCard = {
        type: 'message',
        attachments: [
          {
            contentType: 'application/vnd.microsoft.card.adaptive',
            content: {
              $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
              type: 'AdaptiveCard',
              version: '1.4',
              body: [
                {
                  type: 'TextBlock',
                  text: '🔔 Microsoft Teams Integration Connected!',
                  weight: 'Bolder',
                  size: 'Medium',
                  color: 'Good',
                },
                {
                  type: 'TextBlock',
                  text: 'The Standalone Software Request & Governance Hub is now connected to this Teams channel.',
                },
              ],
            },
          },
        ],
      };
      const result = await sendTeamsCard(testCard);
      return res.json({ message: 'Test message sent', result });
    }

    res.json({ message: 'Teams webhook configuration saved' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Serve Production Frontend ───────────────────────────────────────────────
const DIST_PATH = join(__dirname, '..', 'dist');
if (existsSync(DIST_PATH)) {
  app.use(express.static(DIST_PATH));
}

// ── Health Check ────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'SPA-Intake-Portal',
    port: PORT,
    database: 'SQLite (intake.db)',
    catalogCount: getCatalogCount(),
  });
});

// ── Fallback to index.html for SPA client routing ────────────────────────────
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  const indexFile = join(__dirname, '..', 'dist', 'index.html');
  if (existsSync(indexFile)) {
    res.sendFile(indexFile);
  } else {
    res.send('SPA Intake Portal Server active. Database: SQLite.');
  }
});

// ── Start Server ────────────────────────────────────────────────────────────
// Normalize path separators for cross-platform compatibility (Windows uses backslashes)
const entryScript = process.argv[1] ? process.argv[1].replace(/\\/g, '/') : '';
if (entryScript.endsWith('server/index.js')) {
  app.listen(PORT, () => {
    console.log(`\n🚀 Standalone Software Request & Intake API running on http://localhost:${PORT}`);
    console.log(`   Database: SQLite (server/data/intake.db) [${getCatalogCount()} Software Models]`);
    console.log(`   Catalog:  http://localhost:${PORT}/api/intake/catalog`);
    console.log(`   Requests: http://localhost:${PORT}/api/intake/requests`);
    console.log(`   Queue:    http://localhost:${PORT}/api/intake/queue\n`);
  });
}

export default app;
