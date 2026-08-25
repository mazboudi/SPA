import express from 'express';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

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

// ── Database File Paths ───────────────────────────────────────────────────────
const CATALOG_PATH = join(__dirname, 'data', 'software-catalog.json');
const REQUESTS_PATH = join(__dirname, 'data', 'software-requests.json');

// ── Helpers for persistent JSON storage ───────────────────────────────────────
function getCatalog() {
  if (!existsSync(CATALOG_PATH)) return [];
  return JSON.parse(readFileSync(CATALOG_PATH, 'utf8'));
}

function saveCatalog(data) {
  writeFileSync(CATALOG_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function getRequests() {
  if (!existsSync(REQUESTS_PATH)) return [];
  return JSON.parse(readFileSync(REQUESTS_PATH, 'utf8'));
}

function saveRequests(data) {
  writeFileSync(REQUESTS_PATH, JSON.stringify(data, null, 2), 'utf8');
}

// Generate unique sequential ticket numbers (RITM & SCTASK)
function getNextRequestNumber(requests) {
  const count = requests.length + 1;
  return `RITM${String(count).padStart(7, '0')}`;
}

function getNextTaskId(requests) {
  let maxNum = 0;
  requests.forEach(r => {
    (r.tasks || []).forEach(t => {
      const match = (t.number || '').match(/SCTASK(\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    });
  });
  const nextNum = maxNum + 1;
  return {
    id: `TASK${String(nextNum).padStart(7, '0')}`,
    number: `SCTASK${String(nextNum).padStart(7, '0')}`,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. Authoritative Software Catalog API
// ═════════════════════════════════════════════════════════════════════════════

// GET /api/intake/catalog — list software titles & versions
app.get('/api/intake/catalog', (req, res) => {
  try {
    const catalog = getCatalog();
    const { search, platform, category } = req.query;
    let results = catalog;

    if (search) {
      const q = search.toLowerCase();
      results = results.filter(item =>
        item.displayName.toLowerCase().includes(q) ||
        item.publisher.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q)
      );
    }
    if (platform) {
      results = results.filter(item =>
        item.supportedPlatforms.includes(platform.toLowerCase())
      );
    }
    if (category) {
      results = results.filter(item => item.category === category);
    }

    res.json({ titles: results, count: results.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/intake/catalog/titles — add new authoritative software model
app.post('/api/intake/catalog/titles', (req, res) => {
  try {
    const { displayName, publisher, category, supportedPlatforms, licenseRequired, isSaaSOrInternetFacing, dataClassification, defaultInstallerType, description, versions } = req.body;
    if (!displayName || !publisher) {
      return res.status(400).json({ error: 'displayName and publisher are required' });
    }

    const catalog = getCatalog();
    const id = `model_${displayName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;

    const newTitle = {
      id,
      displayName,
      publisher,
      category: category || 'General',
      supportedPlatforms: supportedPlatforms || ['windows'],
      licenseRequired: licenseRequired || 'No',
      isSaaSOrInternetFacing: Boolean(isSaaSOrInternetFacing),
      dataClassification: dataClassification || 'Internal',
      defaultInstallerType: defaultInstallerType || { windows: 'msi', macos: 'pkg' },
      description: description || '',
      versions: versions || [],
    };

    catalog.push(newTitle);
    saveCatalog(catalog);
    res.status(201).json({ message: 'Title created', title: newTitle });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/intake/catalog/titles/:id/versions — add or update version record
app.post('/api/intake/catalog/titles/:id/versions', (req, res) => {
  try {
    const { id } = req.params;
    const { version, disposition, dispositionReason, packagingStatus, installerSource } = req.body;
    if (!version || !disposition) {
      return res.status(400).json({ error: 'version and disposition are required' });
    }

    const catalog = getCatalog();
    const title = catalog.find(t => t.id === id);
    if (!title) return res.status(404).json({ error: `Title ${id} not found` });

    let existingVer = (title.versions || []).find(v => v.version === version);
    if (existingVer) {
      existingVer.disposition = disposition;
      if (dispositionReason !== undefined) existingVer.dispositionReason = dispositionReason;
      if (packagingStatus !== undefined) existingVer.packagingStatus = packagingStatus;
      if (installerSource !== undefined) existingVer.installerSource = installerSource;
    } else {
      if (!title.versions) title.versions = [];
      title.versions.push({
        version,
        disposition,
        dispositionReason: dispositionReason || '',
        packagingStatus: packagingStatus || 'Not Packaged',
        installerSource: installerSource || {},
      });
    }

    saveCatalog(catalog);
    res.json({ message: 'Version updated', title });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. Request Intake & Workflow Engine API
// ═════════════════════════════════════════════════════════════════════════════

// GET /api/intake/requests — list all requests
app.get('/api/intake/requests', (req, res) => {
  try {
    const requests = getRequests();
    const { state, stage, platform, search } = req.query;
    let results = requests;

    if (state && state !== 'all') {
      results = results.filter(r => r.state.toLowerCase() === state.toLowerCase());
    }
    if (stage && stage !== 'all') {
      results = results.filter(r => r.stage.toLowerCase() === stage.toLowerCase());
    }
    if (platform && platform !== 'all') {
      results = results.filter(r => (r.platform || '').toLowerCase() === platform.toLowerCase());
    }
    if (search) {
      const q = search.toLowerCase();
      results = results.filter(r =>
        (r.number || '').toLowerCase().includes(q) ||
        (r.titleName || '').toLowerCase().includes(q) ||
        (r.requestedFor || '').toLowerCase().includes(q) ||
        (r.businessJustification || '').toLowerCase().includes(q)
      );
    }

    // Sort newest first
    results.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
    res.json({ requests: results, count: results.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/intake/requests/:id — get request details by ID or Number
app.get('/api/intake/requests/:id', (req, res) => {
  try {
    const requests = getRequests();
    const reqItem = requests.find(r => r.id === req.params.id || r.number === req.params.id);
    if (!reqItem) return res.status(404).json({ error: `Request ${req.params.id} not found` });
    res.json(reqItem);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/intake/requests — submit a new software request
app.post('/api/intake/requests', (req, res) => {
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
      requestedFor,
      requesterEmail,
      department,
      targetDevice,
      installType,
      deploymentScope,
      businessJustification,
      priority,
    } = req.body;

    if (!requestedFor || (!titleId && !titleName) || !businessJustification) {
      return res.status(400).json({ error: 'requestedFor, title, and businessJustification are required' });
    }

    const catalog = getCatalog();
    const requests = getRequests();

    // Resolve software model & version disposition
    const titleModel = catalog.find(t => t.id === titleId || t.displayName.toLowerCase() === (titleName || '').toLowerCase());
    let disposition = 'Review Required';
    let resolvedTitleName = titleName || (titleModel ? titleModel.displayName : 'Custom Software');
    let resolvedPublisher = publisher || (titleModel ? titleModel.publisher : 'Unknown');
    let resolvedCategory = category || (titleModel ? titleModel.category : 'General');
    let resolvedPlatform = platform || (titleModel && titleModel.supportedPlatforms[0]) || 'windows';
    let resolvedInstallerType = installerType || 'msi';
    let resolvedInstallerSource = installerSource || '';

    if (titleModel) {
      const verObj = (titleModel.versions || []).find(v => v.version === version);
      if (verObj) {
        disposition = verObj.disposition;
        if (verObj.installerSource && verObj.installerSource[resolvedPlatform]) {
          resolvedInstallerSource = verObj.installerSource[resolvedPlatform];
        }
      } else {
        disposition = 'Review Required'; // Unlisted version
      }
    } else {
      disposition = 'Not Found'; // New Software onboarding
    }

    const number = getNextRequestNumber(requests);
    const id = `REQ${number.replace('RITM', '')}`;
    const now = new Date().toISOString();

    // ── Workflow State Machine: Branch based on disposition ─────────────────
    const tasks = [];
    let initialStage = 'manager_approval';
    let initialState = 'In Review';

    if (disposition === 'Approved') {
      // Step 1: Manager Approval
      const t1 = getNextTaskId(requests);
      tasks.push({
        id: t1.id,
        number: t1.number,
        name: 'Manager Approval',
        assignmentGroup: 'Management',
        state: 'Open',
        notes: 'Please review and approve the business justification for this software request.',
      });

      // Step 2: SAM License Check (if license required)
      const licenseNeeded = titleModel ? (titleModel.licenseRequired !== 'No') : true;
      if (licenseNeeded) {
        tasks.push({
          id: `TASK${String(parseInt(t1.id.replace('TASK',''),10)+1).padStart(7,'0')}`,
          number: `SCTASK${String(parseInt(t1.number.replace('SCTASK',''),10)+1).padStart(7,'0')}`,
          name: 'SAM License Review',
          assignmentGroup: 'Software Asset Management',
          state: 'Pending',
          notes: 'Verify software license entitlement quota.',
        });
      }

      // Step 3: Packaging Task
      tasks.push({
        id: `TASK${String(parseInt(t1.id.replace('TASK',''),10)+2).padStart(7,'0')}`,
        number: `SCTASK${String(parseInt(t1.number.replace('SCTASK',''),10)+2).padStart(7,'0')}`,
        name: 'Packaging Review & Execution',
        assignmentGroup: 'EUC Software Packaging Team',
        state: 'Pending',
        claimedBy: null,
        notes: 'Ready for packaging in SPA Workbench.',
      });

    } else if (disposition === 'Denied') {
      initialStage = 'exception_review';
      initialState = 'In Review';

      const t1 = getNextTaskId(requests);
      tasks.push({
        id: t1.id,
        number: t1.number,
        name: 'Software Exception Review',
        assignmentGroup: 'Software Governance / Security',
        state: 'Open',
        notes: 'Requested version is categorized as DENIED / UNSUPPORTED. Exception justification required.',
      });

    } else {
      // Review Required or Not Found
      initialStage = 'governance_review';
      initialState = 'In Review';

      const t1 = getNextTaskId(requests);
      tasks.push({
        id: t1.id,
        number: t1.number,
        name: 'Software Disposition Review',
        assignmentGroup: 'Software Governance / SAM',
        state: 'Open',
        notes: 'Evaluate software title / version disposition before downstream fulfillment.',
      });

      tasks.push({
        id: `TASK${String(parseInt(t1.id.replace('TASK',''),10)+1).padStart(7,'0')}`,
        number: `SCTASK${String(parseInt(t1.number.replace('SCTASK',''),10)+1).padStart(7,'0')}`,
        name: 'Security & Risk Assessment',
        assignmentGroup: 'Cybersecurity / AppSec',
        state: 'Open',
        notes: 'Review data classification and vendor architecture.',
      });
    }

    const newRequest = {
      id,
      number,
      shortDescription: `Software Request: ${resolvedTitleName} ${version || ''}`.trim(),
      titleId: titleModel ? titleModel.id : null,
      titleName: resolvedTitleName,
      publisher: resolvedPublisher,
      version: version || 'Latest',
      platform: resolvedPlatform,
      category: resolvedCategory,
      installerType: resolvedInstallerType,
      installerSource: resolvedInstallerSource,
      requestedFor,
      requesterEmail: requesterEmail || `${requestedFor.toLowerCase().replace(/[^a-z0-9]/g, '.')}@fiserv.com`,
      department: department || 'Technology',
      targetDevice: targetDevice || 'Corporate Standard Device',
      installType: installType || 'New Install',
      deploymentScope: deploymentScope || 'Individual',
      businessJustification,
      disposition,
      stage: initialStage,
      state: initialState,
      priority: priority || 'Medium',
      submittedAt: now,
      updatedAt: now,
      tasks,
      packagingArtifacts: null,
    };

    requests.push(newRequest);
    saveRequests(requests);

    res.status(201).json({
      message: 'Software request submitted successfully',
      request: newRequest,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. Task Approvals & Governance Actions API
// ═════════════════════════════════════════════════════════════════════════════

// PATCH /api/intake/tasks/:taskId — update / complete / approve a task
app.patch('/api/intake/tasks/:taskId', (req, res) => {
  try {
    const { taskId } = req.params;
    const { action, completedBy, notes } = req.body; // action: 'approve' | 'reject' | 'complete'
    const requests = getRequests();

    let targetReq = null;
    let targetTask = null;

    for (const r of requests) {
      const t = (r.tasks || []).find(task => task.id === taskId || task.number === taskId);
      if (t) {
        targetReq = r;
        targetTask = t;
        break;
      }
    }

    if (!targetTask) return res.status(404).json({ error: `Task ${taskId} not found` });

    const now = new Date().toISOString();
    targetTask.completedBy = completedBy || 'Governance Officer';
    targetTask.completedAt = now;
    if (notes) targetTask.notes = notes;

    if (action === 'reject') {
      targetTask.state = 'Closed Incomplete';
      targetReq.state = 'Closed Denied';
      targetReq.stage = 'closed_denied';
      targetReq.updatedAt = now;
      saveRequests(requests);
      return res.json({ message: 'Task and request rejected', request: targetReq });
    }

    // Mark task complete
    targetTask.state = 'Closed Complete';
    targetReq.updatedAt = now;

    // Check workflow state progression
    const openTasks = targetReq.tasks.filter(t => t.state === 'Open');
    const pendingTasks = targetReq.tasks.filter(t => t.state === 'Pending');

    // If manager approved, activate subsequent pending task (e.g. SAM or Packaging)
    if (targetTask.name === 'Manager Approval') {
      const samTask = targetReq.tasks.find(t => t.name === 'SAM License Review' && t.state === 'Pending');
      if (samTask) {
        samTask.state = 'Open';
        targetReq.stage = 'license_review';
      } else {
        const pkgTask = targetReq.tasks.find(t => t.name === 'Packaging Review & Execution' && t.state === 'Pending');
        if (pkgTask) {
          pkgTask.state = 'Open';
          targetReq.stage = 'packaging';
          targetReq.state = 'In Progress';
        }
      }
    } else if (targetTask.name === 'SAM License Review') {
      const pkgTask = targetReq.tasks.find(t => t.name === 'Packaging Review & Execution' && t.state === 'Pending');
      if (pkgTask) {
        pkgTask.state = 'Open';
        targetReq.stage = 'packaging';
        targetReq.state = 'In Progress';
      }
    } else if (targetTask.name === 'Software Disposition Review' || targetTask.name === 'Security & Risk Assessment') {
      // If all governance tasks are complete, create packaging task
      const remainingGov = targetReq.tasks.filter(t => (t.name.includes('Review') || t.name.includes('Assessment')) && t.state === 'Open');
      if (remainingGov.length === 0) {
        let pkgTask = targetReq.tasks.find(t => t.name.includes('Packaging'));
        if (!pkgTask) {
          const nextT = getNextTaskId(requests);
          pkgTask = {
            id: nextT.id,
            number: nextT.number,
            name: 'Packaging Review & Execution',
            assignmentGroup: 'EUC Software Packaging Team',
            state: 'Open',
            claimedBy: null,
            notes: 'Approved through governance exception.',
          };
          targetReq.tasks.push(pkgTask);
        } else {
          pkgTask.state = 'Open';
        }
        targetReq.stage = 'packaging';
        targetReq.state = 'In Progress';
      }
    }

    saveRequests(requests);
    res.json({ message: 'Task updated', request: targetReq });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. Packaging Queue & Two-Way Workbench Integration
// ═════════════════════════════════════════════════════════════════════════════

// GET /api/intake/queue — return active packaging tasks formatted for SPA Workbench
app.get('/api/intake/queue', (req, res) => {
  try {
    const requests = getRequests();
    const { platform } = req.query;

    // Filter requests that have an Open or In-Progress packaging task
    const packagingRequests = requests.filter(r => {
      const hasOpenPkgTask = (r.tasks || []).some(
        t => t.name.includes('Packaging') && (t.state === 'Open' || t.state === 'In Progress')
      );
      if (!hasOpenPkgTask) return false;
      if (platform && platform !== 'all') {
        return (r.platform || '').toLowerCase() === platform.toLowerCase();
      }
      return true;
    });

    // Format items to match Workbench ServiceNowQueue expectations
    const queueItems = packagingRequests.map(r => ({
      RequestID: r.number,
      DisplayName: r.titleName,
      Publisher: r.publisher,
      Version: r.version,
      Platform: r.platform === 'macos' ? 'macOS' : 'Windows',
      Category: r.category,
      Requestor: r.requestedFor,
      RequestDate: r.submittedAt ? r.submittedAt.split('T')[0] : '',
      Priority: r.priority || 'Medium',
      Description: r.businessJustification,
      InstallerType: r.installerType || (r.platform === 'macos' ? 'pkg' : 'msi'),
      InstallerSource: r.installerSource || '',
      Status: r.state,
      Stage: r.stage,
      _rawRequest: r,
    }));

    res.json({ items: queueItems, count: queueItems.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/intake/tasks/:taskId/claim — claim a packaging task
app.patch('/api/intake/queue/:requestId/claim', (req, res) => {
  try {
    const { requestId } = req.params;
    const { claimedBy } = req.body;
    const requests = getRequests();

    const targetReq = requests.find(r => r.id === requestId || r.number === requestId);
    if (!targetReq) return res.status(404).json({ error: `Request ${requestId} not found` });

    const pkgTask = (targetReq.tasks || []).find(t => t.name.includes('Packaging'));
    if (pkgTask) {
      pkgTask.claimedBy = claimedBy || 'Packaging Engineer';
      pkgTask.state = 'In Progress';
    }
    targetReq.state = 'In Packaging';
    targetReq.updatedAt = new Date().toISOString();

    saveRequests(requests);
    res.json({ message: 'Request claimed', request: targetReq });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/intake/requests/:id/complete-packaging — callback from Workbench on publish
app.post('/api/intake/requests/:id/complete-packaging', (req, res) => {
  try {
    const { id } = req.params;
    const {
      gitRepoUrl,
      commitSha,
      pipelineId,
      platform,
      packageId,
      packageVersion,
      notes,
    } = req.body;

    const requests = getRequests();
    const catalog = getCatalog();
    const targetReq = requests.find(r => r.id === id || r.number === id);

    if (!targetReq) return res.status(404).json({ error: `Request ${id} not found` });

    const now = new Date().toISOString();

    // 1. Close the packaging task
    const pkgTask = (targetReq.tasks || []).find(t => t.name.includes('Packaging'));
    if (pkgTask) {
      pkgTask.state = 'Closed Complete';
      pkgTask.completedAt = now;
      pkgTask.notes = notes || `Packaged and published via SPA Workbench. Repo: ${gitRepoUrl || 'GitLab'}`;
    }

    // 2. Mark Deployment task as complete
    let depTask = (targetReq.tasks || []).find(t => t.name.includes('Deployment'));
    if (depTask) {
      depTask.state = 'Closed Complete';
      depTask.completedAt = now;
      depTask.notes = `Deployed to ${platform === 'macos' ? 'Jamf Pro' : 'Microsoft Intune'}.`;
    }

    // 3. Update Request state to Closed Complete
    targetReq.state = 'Closed Complete';
    targetReq.stage = 'completed';
    targetReq.updatedAt = now;
    targetReq.packagingArtifacts = {
      gitRepoUrl: gitRepoUrl || '',
      commitSha: commitSha || '',
      pipelineId: pipelineId || '',
      packageId: packageId || '',
      platform: platform || targetReq.platform,
      version: packageVersion || targetReq.version,
      packagedAt: now,
    };

    // 4. Update the authoritative software catalog version status
    if (targetReq.titleId) {
      const catTitle = catalog.find(t => t.id === targetReq.titleId);
      if (catTitle) {
        let verEntry = (catTitle.versions || []).find(v => v.version === targetReq.version);
        if (verEntry) {
          verEntry.packagingStatus = 'Packaged & Ready';
          if (!verEntry.packageRef) verEntry.packageRef = {};
          verEntry.packageRef[targetReq.platform] = gitRepoUrl || `titles/${packageId}`;
        }
        saveCatalog(catalog);
      }
    }

    saveRequests(requests);
    console.log(`✅ [INTAKE] Request ${targetReq.number} completed packaging & deployment.`);
    res.json({ message: 'Request packaging completed and closed', request: targetReq });
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
  res.json({ status: 'ok', service: 'SPA-Intake-Portal', port: PORT });
});

// ── Fallback to index.html for SPA client routing ────────────────────────────
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  const indexFile = join(__dirname, '..', 'dist', 'index.html');
  if (existsSync(indexFile)) {
    res.sendFile(indexFile);
  } else {
    res.send('SPA Intake Portal Server active. Please run `npm run build` or start Vite dev server on port 5174.');
  }
});

// ── Start Server ────────────────────────────────────────────────────────────
if (process.argv[1] && process.argv[1].endsWith('server/index.js')) {
  app.listen(PORT, () => {
    console.log(`\n🚀 Standalone Software Request & Intake API running on http://localhost:${PORT}`);
    console.log(`   Catalog:  http://localhost:${PORT}/api/intake/catalog`);
    console.log(`   Requests: http://localhost:${PORT}/api/intake/requests`);
    console.log(`   Queue:    http://localhost:${PORT}/api/intake/queue\n`);
  });
}

export default app;
