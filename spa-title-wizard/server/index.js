/**
 * server/index.js — GitLab Publish API
 *
 * Lightweight Express server that sits between the SPA Workbench and
 * the GitLab API. Uses a shared service-account PAT for all operations.
 *
 * Endpoints:
 *   POST /api/publish   — Create project or open MR with scaffolded files
 *   GET  /api/health    — Health check
 */

import 'dotenv/config';
import express from 'express';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';
import multer from 'multer';
import CFB from 'cfb';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Allow self-signed / internal CA certificates (common with corporate GitLab)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const app = express();
app.use(express.json({ limit: '10mb' }));

// ── Config ──────────────────────────────────────────────────────────────────
const GITLAB_URL = process.env.GITLAB_URL || 'https://gitlab.onefiserv.net';
const GITLAB_TOKEN = process.env.GITLAB_TOKEN || '';
const PORT = Number(process.env.PORT) || 3001;

// Azure / Microsoft Graph (Intune)
const AZURE_TENANT_ID = process.env.AZURE_TENANT_ID || '';
const AZURE_CLIENT_ID = process.env.AZURE_CLIENT_ID || '';
const AZURE_CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET || '';

if (!GITLAB_TOKEN) {
  console.error('⚠️  GITLAB_TOKEN not set — publish will fail. Copy server/.env.example → server/.env');
}

const API = `${GITLAB_URL}/api/v4`;
const headers = {
  'PRIVATE-TOKEN': GITLAB_TOKEN,
  'Content-Type': 'application/json',
};

// ── GitLab helpers ──────────────────────────────────────────────────────────

/** URL-encode a GitLab path for use in API calls */
const encPath = (p) => encodeURIComponent(p);

/** Generic GitLab API call with error forwarding */
async function gitlab(method, path, body) {
  const url = `${API}${path}`;
  const opts = { method, headers: { ...headers } };
  if (body) opts.body = JSON.stringify(body);
  let res;
  try {
    res = await fetch(url, opts);
  } catch (netErr) {
    // Network-level failure (DNS, TLS, timeout, connection refused)
    console.error(`  ❌ Network error: ${method} ${url}`, netErr.message);
    throw Object.assign(new Error(`Cannot reach GitLab: ${netErr.message}`), { status: 502 });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.message || data.error || JSON.stringify(data);
    console.error(`  ❌ GitLab ${res.status}: ${msg}`);
    throw Object.assign(new Error(`GitLab ${res.status}: ${msg}`), { status: res.status, data });
  }
  return data;
}

/**
 * Ensure a group/subgroup path exists, creating missing levels.
 * Returns the final group's ID.
 * e.g. "euc/software-package-automation/software-titles"
 */
async function ensureGroupPath(fullPath) {
  const parts = fullPath.split('/');
  let parentId = null;

  for (let i = 0; i < parts.length; i++) {
    const currentPath = parts.slice(0, i + 1).join('/');
    try {
      const group = await gitlab('GET', `/groups/${encPath(currentPath)}`);
      parentId = group.id;
    } catch (err) {
      if (err.status !== 404) throw err;
      // Create the missing subgroup
      const payload = {
        name: parts[i],
        path: parts[i],
        visibility: 'private',
        ...(parentId ? { parent_id: parentId } : {}),
      };
      const created = await gitlab('POST', '/groups', payload);
      parentId = created.id;
      console.log(`  ✅ Created subgroup: ${currentPath} (id: ${parentId})`);
    }
  }
  return parentId;
}

/**
 * Search for a project by slug as a direct child of a group.
 * Does NOT search subgroups — ensures projects are at the correct level.
 * Returns the project object or null.
 */
async function findProject(groupId, slug) {
  const projects = await gitlab('GET',
    `/groups/${groupId}/projects?search=${encodeURIComponent(slug)}&per_page=100`
  );
  // Exact slug match (search is fuzzy)
  return projects.find(p => p.path === slug) || null;
}

/**
 * Build the commit actions array from a file map.
 * Each entry: { action: 'create', file_path, content }
 * Binary content (data: URLs) is base64-encoded.
 */
function buildCommitActions(files, action = 'create') {
  return Object.entries(files).map(([filePath, content]) => {
    if (typeof content === 'string' && content.startsWith('data:')) {
      // Binary file — extract base64 payload
      const base64 = content.split(',')[1] || '';
      return { action, file_path: filePath, content: base64, encoding: 'base64' };
    }
    return { action, file_path: filePath, content };
  });
}

// ── Slug validation ─────────────────────────────────────────────────────────
const SLUG_RE = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;
function validateSlug(slug) {
  if (!slug || slug.length < 2 || slug.length > 100) {
    return 'Package ID must be 2–100 characters';
  }
  if (!SLUG_RE.test(slug)) {
    return 'Package ID must be lowercase alphanumeric with hyphens (no leading/trailing hyphens)';
  }
  return null;
}

// ── POST /api/publish ───────────────────────────────────────────────────────
app.post('/api/publish', async (req, res) => {
  try {
    const { packageId, gitLabGroup, category, displayName, version, files, pipelineAction } = req.body;
    // pipelineAction: 'none' | 'build' | 'publish' | 'assign' | 'deploy' (default: 'none')
    const triggerPipeline = pipelineAction && pipelineAction !== 'none';

    // Validate required fields
    if (!packageId || !gitLabGroup || !files || !Object.keys(files).length) {
      return res.status(400).json({ message: 'Missing required fields: packageId, gitLabGroup, files' });
    }
    const slugError = validateSlug(packageId);
    if (slugError) {
      return res.status(400).json({ message: slugError });
    }

    console.log(`\n📦 Publishing "${displayName || packageId}" → ${gitLabGroup}/software-titles/${packageId}`);

    // 1. Resolve the group path (creates subgroups if needed)
    const fullGroupPath = `${gitLabGroup}/software-titles`;
    const groupId = await ensureGroupPath(fullGroupPath);
    console.log(`  📂 Group resolved: ${fullGroupPath} (id: ${groupId})`);

    // 2. Check if project already exists
    const existing = await findProject(groupId, packageId);

    if (existing) {
      // ── Existing project → commit to main + version tag ────────────
      const defaultBranch = existing.default_branch || 'main';
      const tagName = version ? `v${version.replace(/^v/i, '')}` : `v${Date.now()}`;
      console.log(`  🔄 Project exists (id: ${existing.id}) — updating with tag ${tagName}`);

      // Determine create vs update per file
      let existingFiles = [];
      try {
        const tree = await gitlab('GET',
          `/projects/${existing.id}/repository/tree?ref=${encPath(defaultBranch)}&recursive=true&per_page=1000`
        );
        existingFiles = tree.map(f => f.path);
      } catch { /* empty repo */ }

      const actions = Object.entries(files).map(([filePath, content]) => {
        const action = existingFiles.includes(filePath) ? 'update' : 'create';
        if (typeof content === 'string' && content.startsWith('data:')) {
          const base64 = content.split(',')[1] || '';
          return { action, file_path: filePath, content: base64, encoding: 'base64' };
        }
        return { action, file_path: filePath, content };
      });

      // Commit directly to default branch ([skip ci] prevents auto-trigger)
      await gitlab('POST', `/projects/${existing.id}/repository/commits`, {
        branch: defaultBranch,
        commit_message: `release: ${displayName || packageId} ${tagName} [skip ci]\n\nUpdated by SPA Packaging Workbench`,
        actions,
      });
      console.log(`  💾 Committed ${actions.length} files to ${defaultBranch}`);

      // Create version tag
      let tagUrl = null;
      try {
        const tag = await gitlab('POST', `/projects/${existing.id}/repository/tags`, {
          tag_name: tagName,
          ref: defaultBranch,
          message: `Release ${tagName} — ${displayName || packageId}\n\nPublished via SPA Packaging Workbench`,
        });
        tagUrl = `${existing.web_url}/-/tags/${tagName}`;
        console.log(`  🏷️  Tag created: ${tagName}`);
      } catch (tagErr) {
        console.warn(`  ⚠️  Tag creation failed (may already exist): ${tagErr.message}`);
      }

      // Optionally trigger pipeline via API
      let pipelineUrl = null;
      if (triggerPipeline) {
        try {
          const pipelineVars = [{ key: 'SPA_STAGE_LIMIT', variable_type: 'env_var', value: pipelineAction }];
          const pipeline = await gitlab('POST', `/projects/${existing.id}/pipeline`, {
            ref: defaultBranch,
            variables: pipelineVars,
          });
          pipelineUrl = pipeline.web_url || `${existing.web_url}/-/pipelines/${pipeline.id}`;
          console.log(`  🚀 Pipeline triggered: ${pipelineUrl} (SPA_STAGE_LIMIT=${pipelineAction})`);
        } catch (pipeErr) {
          console.warn(`  ⚠️  Pipeline trigger failed: ${pipeErr.message}`);
        }
      }

      console.log(`  ✅ Done: ${existing.web_url}`);

      return res.json({
        action: 'updated',
        projectUrl: existing.web_url,
        tagName,
        tagUrl,
        pipelineUrl,
        pipelineAction: pipelineAction || 'none',
        webIdeUrl: `${existing.web_url}/-/ide/project/${existing.path_with_namespace}/edit/${defaultBranch}`,
        vsCodeUrl: `vscode://vscode.git/clone?url=${encodeURIComponent(`${GITLAB_URL}/${existing.path_with_namespace}.git`)}`,
      });

    } else {
      // ── New project → create + initial commit + tag ────────────────
      const tagName = version ? `v${version.replace(/^v/i, '')}` : 'v1.0.0';
      console.log(`  🆕 Creating new project in group ${groupId}`);

      const project = await gitlab('POST', '/projects', {
        name: displayName || packageId,
        path: packageId,
        namespace_id: groupId,
        visibility: 'private',
        initialize_with_readme: false,
        description: `SPA packaging project for ${displayName || packageId}`,
      });
      console.log(`  📁 Project created: ${project.path_with_namespace} (id: ${project.id})`);

      // Initial commit with all scaffolded files
      const actions = buildCommitActions(files, 'create');
      await gitlab('POST', `/projects/${project.id}/repository/commits`, {
        branch: 'main',
        commit_message: `feat: initial scaffolding for ${displayName || packageId} ${tagName} [skip ci]\n\nGenerated by SPA Packaging Workbench`,
        actions,
      });
      console.log(`  💾 Committed ${actions.length} files to main`);

      // Set default branch to main
      try {
        await gitlab('PUT', `/projects/${project.id}`, { default_branch: 'main' });
      } catch { /* non-critical */ }

      // Create version tag
      let tagUrl = null;
      try {
        await gitlab('POST', `/projects/${project.id}/repository/tags`, {
          tag_name: tagName,
          ref: 'main',
          message: `Release ${tagName} — ${displayName || packageId}\n\nPublished via SPA Packaging Workbench`,
        });
        tagUrl = `${project.web_url}/-/tags/${tagName}`;
        console.log(`  🏷️  Tag created: ${tagName}`);
      } catch (tagErr) {
        console.warn(`  ⚠️  Tag creation failed: ${tagErr.message}`);
      }

      // Optionally trigger pipeline via API
      let pipelineUrl = null;
      if (triggerPipeline) {
        try {
          const pipelineVars = [{ key: 'SPA_STAGE_LIMIT', variable_type: 'env_var', value: pipelineAction }];
          const pipeline = await gitlab('POST', `/projects/${project.id}/pipeline`, {
            ref: 'main',
            variables: pipelineVars,
          });
          pipelineUrl = pipeline.web_url || `${project.web_url}/-/pipelines/${pipeline.id}`;
          console.log(`  🚀 Pipeline triggered: ${pipelineUrl} (SPA_STAGE_LIMIT=${pipelineAction})`);
        } catch (pipeErr) {
          console.warn(`  ⚠️  Pipeline trigger failed: ${pipeErr.message}`);
        }
      }

      console.log(`  ✅ Done: ${project.web_url}`);

      return res.json({
        action: 'created',
        projectUrl: project.web_url,
        tagName,
        tagUrl,
        pipelineUrl,
        pipelineAction: pipelineAction || 'none',
        webIdeUrl: `${project.web_url}/-/ide/project/${project.path_with_namespace}/edit/main`,
        vsCodeUrl: `vscode://vscode.git/clone?url=${encodeURIComponent(`${GITLAB_URL}/${project.path_with_namespace}.git`)}`,
      });
    }

  } catch (err) {
    console.error('❌ Publish failed:', err.message);
    const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
    res.status(status).json({ message: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ██  Project Browser — Edit Existing Packages
// ═══════════════════════════════════════════════════════════════════════════

/** Files to fetch when loading an existing project for editing */
const EDITABLE_FILES = [
  'spa-wizard-state.json',
  'app.json',
  'windows/package.yaml',
  'windows/lifecycle.yaml',
  'windows/intune/app.json',
  'windows/intune/requirements.json',
  'windows/intune/assignments.json',
  'windows/intune/supersedence.json',
  'windows/intune/dependencies.json',
  'windows/detection/detection-config.json',
  'macos/package.yaml',
  'macos/jamf/package-inputs.json',
  'macos/jamf/policy-inputs.json',
  'macos/jamf/scope-inputs.json',
];

// ── GET /api/projects — list all title projects ─────────────────────────────
app.get('/api/projects', async (req, res) => {
  try {
    const groupPath = req.query.group || 'euc/software-package-automation/software-titles';
    console.log(`\n📂 Listing projects under: ${groupPath}`);

    // Resolve group ID from path
    const groupData = await gitlab('GET', `/groups/${encPath(groupPath)}?with_projects=false`);
    const groupId = groupData.id;

    // Paginate through all projects in this group (direct children only)
    let page = 1;
    const allProjects = [];
    while (true) {
      const batch = await gitlab('GET',
        `/groups/${groupId}/projects?per_page=100&page=${page}&order_by=name&sort=asc&include_subgroups=false`
      );
      if (batch.length === 0) break;
      allProjects.push(...batch);
      if (batch.length < 100) break;
      page++;
    }

    // Fetch tags for each project (for version selection)
    const projects = await Promise.all(allProjects.map(async p => {
      let tags = [];
      try {
        const tagData = await gitlab('GET', `/projects/${p.id}/repository/tags?per_page=20&order_by=version`);
        tags = tagData.map(t => ({ name: t.name, message: t.message || '' }));
      } catch { /* no tags */ }

      return {
        id: p.id,
        name: p.name,
        path: p.path,
        path_with_namespace: p.path_with_namespace,
        description: p.description || '',
        web_url: p.web_url,
        updated_at: p.last_activity_at || p.updated_at,
        default_branch: p.default_branch || 'main',
        tags,
      };
    }));

    console.log(`  📋 Found ${projects.length} projects`);
    res.json({ projects, count: projects.length });
  } catch (err) {
    console.error('❌ Project listing failed:', err.message);
    res.status(err.status || 500).json({ message: err.message });
  }
});

// ── GET /api/projects/:id/files — fetch config files for editing ────────────
app.get('/api/projects/:id/files', async (req, res) => {
  try {
    const projectId = req.params.id;
    console.log(`\n📄 Fetching config files for project ${projectId}`);

    // Get project metadata
    const project = await gitlab('GET', `/projects/${projectId}`);
    // Allow caller to specify a ref (tag/branch) — defaults to default branch
    const ref = req.query.ref || project.default_branch || 'main';
    console.log(`  📌 Using ref: ${ref}`);

    // Fetch each known config file (silently skip missing files)
    const files = {};
    for (const filePath of EDITABLE_FILES) {
      try {
        const fileData = await gitlab('GET',
          `/projects/${projectId}/repository/files/${encPath(filePath)}?ref=${encPath(ref)}`
        );
        // GitLab returns base64-encoded content
        files[filePath] = Buffer.from(fileData.content, 'base64').toString('utf8');
      } catch {
        // File doesn't exist in this project — skip
      }
    }

    console.log(`  📄 Loaded ${Object.keys(files).length} config files from ${project.path_with_namespace} @ ${ref}`);
    res.json({
      files,
      projectMeta: {
        id: project.id,
        name: project.name,
        path: project.path,
        path_with_namespace: project.path_with_namespace,
        web_url: project.web_url,
        default_branch: project.default_branch || 'main',
        loadedRef: ref,
      },
    });
  } catch (err) {
    console.error('❌ File fetch failed:', err.message);
    res.status(err.status || 500).json({ message: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ██  Microsoft Graph — Intune Win32 App Catalog
// ═══════════════════════════════════════════════════════════════════════════

const GRAPH_BASE = 'https://graph.microsoft.com/beta';
const graphConfigured = !!(AZURE_TENANT_ID && AZURE_CLIENT_ID && AZURE_CLIENT_SECRET);

// ── Token cache ─────────────────────────────────────────────────────────────
let graphToken = null;
let graphTokenExpiry = 0;

async function getGraphToken() {
  if (graphToken && Date.now() < graphTokenExpiry) return graphToken;
  const tokenUrl = `https://login.microsoftonline.com/${AZURE_TENANT_ID}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: AZURE_CLIENT_ID,
    client_secret: AZURE_CLIENT_SECRET,
    scope: 'https://graph.microsoft.com/.default',
  });
  const res = await fetch(tokenUrl, { method: 'POST', body });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Azure token error (${res.status}): ${err}`);
  }
  const data = await res.json();
  graphToken = data.access_token;
  graphTokenExpiry = Date.now() + (data.expires_in - 120) * 1000; // refresh 2 min early
  return graphToken;
}

async function graphApi(path) {
  const token = await getGraphToken();
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw Object.assign(new Error(`Graph ${res.status}: ${err}`), { status: res.status });
  }
  return res.json();
}

// ── App list cache ──────────────────────────────────────────────────────────
let appCache = null;
let appCacheTime = 0;

async function fetchAllWin32Apps() {
  const apps = [];
  let url = `/deviceAppManagement/mobileApps?$filter=isof('microsoft.graph.win32LobApp')&$top=999`;
  while (url) {
    const data = await graphApi(url);
    if (data.value) apps.push(...data.value);
    // Handle pagination
    url = data['@odata.nextLink'] ? data['@odata.nextLink'].replace(GRAPH_BASE, '') : null;
  }
  apps.sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));
  return apps;
}

async function getCachedApps() {
  if (appCache && Date.now() - appCacheTime < 30 * 60 * 1000) return appCache; // 30 min cache
  console.log('  📡 Fetching Win32 apps from Intune...');
  appCache = await fetchAllWin32Apps();
  appCacheTime = Date.now();
  console.log(`  ✅ Cached ${appCache.length} Win32 apps`);
  return appCache;
}

// ── GET /api/intune/apps — cached catalog ───────────────────────────────────
app.get('/api/intune/apps', async (req, res) => {
  if (!graphConfigured) return res.status(501).json({ message: 'Intune integration not configured. Set AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET in server/.env' });
  try {
    const apps = await getCachedApps();
    res.json({ apps, cachedAt: appCacheTime, count: apps.length });
  } catch (err) {
    console.error('❌ Intune catalog fetch failed:', err.message);
    res.status(err.status || 500).json({ message: err.message });
  }
});

// ── GET /api/intune/apps/:id — full app detail ──────────────────────────────
app.get('/api/intune/apps/:id', async (req, res) => {
  if (!graphConfigured) return res.status(501).json({ message: 'Intune integration not configured' });
  try {
    const appId = req.params.id;
    // Fetch app detail + assignments in parallel
    const [appData, assignData] = await Promise.all([
      graphApi(`/deviceAppManagement/mobileApps/${appId}`),
      graphApi(`/deviceAppManagement/mobileApps/${appId}/assignments`),
    ]);
    // Shape it like an Intune export JSON so parseIntuneExport() works unchanged
    const exportShape = {
      appId,
      displayName: appData.displayName,
      app: appData,
      assignments: (assignData.value || []).map(a => ({
        intent: a.intent,
        target: a.target || {},
        settings: a.settings || {},
      })),
    };
    res.json(exportShape);
  } catch (err) {
    console.error(`❌ Intune app detail failed (${req.params.id}):`, err.message);
    res.status(err.status || 500).json({ message: err.message });
  }
});

// ── POST /api/intune/refresh — clear cache ──────────────────────────────────
app.post('/api/intune/refresh', async (req, res) => {
  if (!graphConfigured) return res.status(501).json({ message: 'Intune integration not configured' });
  try {
    appCache = null;
    appCacheTime = 0;
    const apps = await getCachedApps();
    res.json({ apps, cachedAt: appCacheTime, count: apps.length });
  } catch (err) {
    console.error('❌ Intune refresh failed:', err.message);
    res.status(err.status || 500).json({ message: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ██  ServiceNow Queue — Packaging Requests
// ═══════════════════════════════════════════════════════════════════════════

const QUEUE_CSV_PATH = join(__dirname, 'data', 'servicenow-queue.csv');

function parseQueueCsv() {
  const raw = readFileSync(QUEUE_CSV_PATH, 'utf8');
  const lines = raw.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    // Simple CSV parse — handles commas inside fields if not quoted
    const values = [];
    let current = '';
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === ',' && !inQuotes) { values.push(current.trim()); current = ''; continue; }
      current += ch;
    }
    values.push(current.trim());

    const row = {};
    headers.forEach((h, i) => { row[h] = values[i] || ''; });
    return row;
  });
}

// ── GET /api/queue — return all packaging requests ──────────────────────────
app.get('/api/queue', (req, res) => {
  try {
    const items = parseQueueCsv();
    res.json({ items, count: items.length });
  } catch (err) {
    console.error('❌ Queue load failed:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ── PATCH /api/queue/:id — mark a request as claimed ────────────────────────
app.patch('/api/queue/:id', (req, res) => {
  try {
    const items = parseQueueCsv();
    const item = items.find(i => i.RequestID === req.params.id);
    if (!item) return res.status(404).json({ message: `Request ${req.params.id} not found` });
    // Return the item data so the client can pre-populate wizard fields
    res.json({ item });
  } catch (err) {
    console.error('❌ Queue claim failed:', err.message);
    res.status(500).json({ message: err.message });
  }
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    gitlab: GITLAB_URL,
    hasToken: !!GITLAB_TOKEN,
    intune: graphConfigured,
  });
});

// ── MSI Metadata Extraction ─────────────────────────────────────────────────

/** Parse an MSI file buffer and return property metadata */
function extractMsiProperties(buffer) {
  const cfb = CFB.read(buffer, { type: 'buffer' });
  const result = {};

  // Find _StringData — the concatenated string pool of the MSI database
  const decoder = new TextDecoder('utf-8', { fatal: false });
  const markers = ['ProductCode', 'ProductName', 'Manufacturer', 'ProductVersion'];
  let bestEntry = null, bestScore = 0;
  for (const entry of cfb.FileIndex) {
    if (!entry.content) continue;
    const bytes = Buffer.isBuffer(entry.content) ? entry.content : Buffer.from(entry.content);
    if (bytes.length < 100 || bytes.length > 500000) continue;
    const text = decoder.decode(bytes);
    const score = markers.filter(m => text.includes(m)).length;
    if (score > bestScore) { bestScore = score; bestEntry = entry; }
  }

  if (!bestEntry || bestScore < 2) {
    // Fallback: binary scan for GUIDs, versions, and ProductName
    const all = decoder.decode(buffer);
    const utf16 = new TextDecoder('utf-16le', { fatal: false }).decode(buffer);
    const guidRe = /\{[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}\}/g;
    const guids = utf16.match(guidRe) || all.match(guidRe) || [];
    if (guids[0]) result.productCode = guids[0];
    if (guids[1]) result.upgradeCode = guids[1];
    const vm = utf16.match(/(\d+\.\d+\.\d+[.\d]*)/);
    if (vm) result.productVersion = vm[1];
    // Scan for ProductName and Manufacturer — they appear right after their key string in UTF-16LE
    const pnMatch = utf16.match(/ProductName\0([^\0]{2,128})/);
    if (pnMatch && pnMatch[1].trim()) result.productName = pnMatch[1].trim();
    const mfMatch = utf16.match(/Manufacturer\0([^\0]{2,128})/);
    if (mfMatch && mfMatch[1].trim()) result.manufacturer = mfMatch[1].trim();
    return result;
  }

  const stringDataBytes = Buffer.isBuffer(bestEntry.content) ? bestEntry.content : Buffer.from(bestEntry.content);
  const stringDataSize = stringDataBytes.length;

  // Find _StringPool (4-byte-aligned, entries sum to stringDataSize)
  let poolEntry = null;
  for (const entry of cfb.FileIndex) {
    if (!entry.content || entry === bestEntry) continue;
    const bytes = Buffer.isBuffer(entry.content) ? entry.content : Buffer.from(entry.content);
    if (bytes.length < 8 || bytes.length % 4 !== 0 || bytes.length === stringDataSize) continue;
    let total = 0;
    for (let i = 4; i + 3 < bytes.length; i += 4) total += bytes.readUInt16LE(i);
    if (total === stringDataSize) { poolEntry = entry; break; }
  }

  if (!poolEntry) return result;

  // Decode string pool
  const poolBytes = Buffer.isBuffer(poolEntry.content) ? poolEntry.content : Buffer.from(poolEntry.content);
  const strings = [''];
  let offset = 0;
  for (let i = 4; i + 3 < poolBytes.length; i += 4) {
    const len = poolBytes.readUInt16LE(i);
    if (len > 0 && offset + len <= stringDataSize) {
      strings.push(decoder.decode(stringDataBytes.slice(offset, offset + len)));
      offset += len;
    } else {
      strings.push('');
    }
  }

  // Find Property table and decode it (2-column, column-major layout)
  const knownKeys = new Set(['ProductCode', 'ProductVersion', 'ProductName', 'Manufacturer', 'UpgradeCode']);
  let bestProps = {}, bestPropScore = 0;
  for (const entry of cfb.FileIndex) {
    if (!entry.content) continue;
    const bytes = Buffer.isBuffer(entry.content) ? entry.content : Buffer.from(entry.content);
    const rowSize = 4; // 2 x u16
    if (bytes.length < rowSize * 2 || bytes.length % rowSize !== 0) continue;
    const numRows = bytes.length / rowSize;
    if (numRows < 2 || numRows > 5000) continue;
    const colSize = numRows * 2;
    const props = {};
    let score = 0;
    for (let r = 0; r < numRows; r++) {
      const ki = bytes.readUInt16LE(r * 2);
      const vi = bytes.readUInt16LE(colSize + r * 2);
      if (ki > 0 && ki < strings.length) {
        const k = strings[ki];
        const v = vi > 0 && vi < strings.length ? strings[vi] : '';
        if (k && /^[A-Za-z_]/.test(k)) { props[k] = v; if (knownKeys.has(k)) score++; }
      }
    }
    if (score > bestPropScore) { bestPropScore = score; bestProps = props; }
  }

  if (bestProps.ProductCode) result.productCode = bestProps.ProductCode;
  if (bestProps.ProductName) result.productName = bestProps.ProductName;
  if (bestProps.ProductVersion) result.productVersion = bestProps.ProductVersion;
  if (bestProps.Manufacturer) result.manufacturer = bestProps.Manufacturer;
  if (bestProps.UpgradeCode) result.upgradeCode = bestProps.UpgradeCode;

  // Last-resort: if string-pool path didn't yield ProductName or Manufacturer, try UTF-16LE scan
  if (!result.productName || !result.manufacturer) {
    const utf16 = new TextDecoder('utf-16le', { fatal: false }).decode(buffer);
    if (!result.productName) {
      const pnMatch = utf16.match(/ProductName\0([^\0]{2,128})/);
      if (pnMatch && pnMatch[1].trim()) result.productName = pnMatch[1].trim();
    }
    if (!result.manufacturer) {
      const mfMatch = utf16.match(/Manufacturer\0([^\0]{2,128})/);
      if (mfMatch && mfMatch[1].trim()) result.manufacturer = mfMatch[1].trim();
    }
  }

  return result;
}

// Multer — store upload in memory (MSI files are typically < 200MB; fine for metadata extraction)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } });

/** POST /api/msi-info — extract MSI metadata from uploaded file */
app.post('/api/msi-info', upload.single('msi'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const meta = extractMsiProperties(req.file.buffer);
    meta.fileName = req.file.originalname;
    res.json(meta);
  } catch (err) {
    console.error('MSI parse error:', err);
    res.status(500).json({ error: `Failed to parse MSI: ${err.message}` });
  }
});

/** POST /api/msi-info-path — extract MSI metadata from a local file path (no upload) */
app.post('/api/msi-info-path', express.json(), (req, res) => {
  try {
    const { path: filePath } = req.body || {};
    if (!filePath) return res.status(400).json({ error: 'path is required' });
    if (!existsSync(filePath)) return res.status(404).json({ error: `File not found: ${filePath}` });
    const buffer = readFileSync(filePath);
    const meta = extractMsiProperties(buffer);
    meta.fileName = filePath.split(/[\\/]/).pop();
    res.json(meta);
  } catch (err) {
    console.error('MSI path parse error:', err);
    res.status(500).json({ error: `Failed to parse MSI: ${err.message}` });
  }
});

/** Parse winget installer yaml manifests to extract installer info */
function parseWingetYaml(yamlText) {
  const result = {
    packageIdentifier: '',
    packageVersion: '',
    publisher: '',
    packageName: '',
    installerType: 'exe',
    installerUrl: '',
    installerSha256: '',
    productCode: '',
    silentArgs: '',
  };

  // Match top-level keys
  const idMatch = yamlText.match(/PackageIdentifier\s*:\s*["']?([^"'\r\n]+)/i);
  if (idMatch) result.packageIdentifier = idMatch[1].trim();

  const verMatch = yamlText.match(/PackageVersion\s*:\s*["']?([^"'\r\n]+)/i);
  if (verMatch) result.packageVersion = verMatch[1].trim();

  const pubMatch = yamlText.match(/Publisher\s*:\s*["']?([^"'\r\n]+)/i);
  if (pubMatch) result.publisher = pubMatch[1].trim();

  const nameMatch = yamlText.match(/PackageName\s*:\s*["']?([^"'\r\n]+)/i);
  if (nameMatch) result.packageName = nameMatch[1].trim();

  // Find x64 installer block first, or fallback to first installer block
  const installerBlocks = yamlText.split(/-\s*Architecture\s*:\s*/gi);
  let selectedBlock = yamlText;
  
  if (installerBlocks.length > 1) {
    const x64Block = installerBlocks.find(b => b.trim().startsWith('x64'));
    if (x64Block) {
      selectedBlock = x64Block;
    } else {
      selectedBlock = installerBlocks[1];
    }
  }

  // 1. Try global InstallerType first
  const globalTypeMatch = yamlText.match(/InstallerType\s*:\s*["']?([^"'\r\n]+)/i);
  if (globalTypeMatch) result.installerType = globalTypeMatch[1].trim().toLowerCase();

  // 2. Try overriding local block InstallerType
  const localTypeMatch = selectedBlock.match(/InstallerType\s*:\s*["']?([^"'\r\n]+)/i);
  if (localTypeMatch) result.installerType = localTypeMatch[1].trim().toLowerCase();

  // 3. Extract URL
  const urlMatch = selectedBlock.match(/InstallerUrl\s*:\s*["']?([^"'\r\n]+)/i);
  if (urlMatch) result.installerUrl = urlMatch[1].trim();

  // 4. Extract SHA256 and productCode
  const shaMatch = selectedBlock.match(/InstallerSha256\s*:\s*["']?([^"'\r\n]+)/i);
  if (shaMatch) result.installerSha256 = shaMatch[1].trim();

  const prodCodeMatch = selectedBlock.match(/ProductCode\s*:\s*["']?([^"'\r\n]+)/i);
  if (prodCodeMatch) result.productCode = prodCodeMatch[1].trim();

  // 5. Force validation check based on the resolved download URL file extension
  if (result.installerUrl && result.installerUrl.toLowerCase().endsWith('.msi')) {
    result.installerType = 'msi';
  }

  // Find switches
  const silentMatch = yamlText.match(/Silent\s*:\s*["']?([^"'\r\n]+)/i);
  if (silentMatch) result.silentArgs = silentMatch[1].trim();
  
  if (!result.silentArgs) {
    if (result.installerType === 'msi' || result.installerType === 'wix') {
      result.silentArgs = '/qn /norestart';
    } else if (result.installerType === 'nullsoft') {
      result.silentArgs = '/S';
    } else if (result.installerType === 'inno') {
      result.silentArgs = '/VERYSILENT /SUPPRESSMSGBOXES /NORESTART';
    }
  }

  return result;
}

/** POST /api/winget-info — resolve package metadata from public microsoft/winget-pkgs repository */
app.post('/api/winget-info', express.json(), async (req, res) => {
  try {
    const { packageId, version } = req.body || {};
    if (!packageId) return res.status(400).json({ error: 'packageId is required' });

    const parts = packageId.trim().split('.');
    if (parts.length < 2) {
      return res.status(400).json({ error: 'Package ID must follow the Publisher.Application format (e.g. Google.Chrome)' });
    }

    const publisher = parts[0];
    const appName = parts.slice(1).join('.');
    const letter = publisher[0].toLowerCase();

    // Query versions folder from public GitHub API
    const versionsUrl = `https://api.github.com/repos/microsoft/winget-pkgs/contents/manifests/${letter}/${publisher}/${appName}`;
    const versionsRes = await fetch(versionsUrl, { headers: { 'User-Agent': 'SPA-Workbench' } });
    if (!versionsRes.ok) {
      return res.status(404).json({ error: `WinGet package not found: ${packageId}` });
    }

    const versionsJson = await versionsRes.json();
    const versionDirs = versionsJson.filter(v => v.type === 'dir').map(v => v.name);

    if (versionDirs.length === 0) {
      return res.status(404).json({ error: `No versions found for package: ${packageId}` });
    }

    // Sort versions descending (newest first)
    const sortedVersions = [...versionDirs].sort((a, b) => {
      const parse = (v) => v.split('.').map(x => parseInt(x) || 0);
      const pa = parse(a);
      const pb = parse(b);
      for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const na = pa[i] || 0;
        const nb = pb[i] || 0;
        if (na !== nb) return nb - na;
      }
      return b.localeCompare(a);
    });

    // Determine target version: either the requested version, or the latest (first in descending sorted list)
    let targetVersion = version;
    if (!targetVersion || !versionDirs.includes(targetVersion)) {
      targetVersion = sortedVersions[0];
    }

    // Fetch the installer manifest file
    const installerManifestUrl = `https://raw.githubusercontent.com/microsoft/winget-pkgs/master/manifests/${letter}/${publisher}/${appName}/${targetVersion}/${publisher}.${appName}.installer.yaml`;
    let manifestRes = await fetch(installerManifestUrl, { headers: { 'User-Agent': 'SPA-Workbench' } });
    if (!manifestRes.ok) {
      // Fallback to unified single-file manifest
      const singleManifestUrl = `https://raw.githubusercontent.com/microsoft/winget-pkgs/master/manifests/${letter}/${publisher}/${appName}/${targetVersion}/${publisher}.${appName}.yaml`;
      manifestRes = await fetch(singleManifestUrl, { headers: { 'User-Agent': 'SPA-Workbench' } });
    }

    if (!manifestRes.ok) {
      return res.status(404).json({ error: `Manifest file not found for version ${targetVersion}` });
    }

    const yamlText = await manifestRes.text();
    const parsedData = parseWingetYaml(yamlText);

    // Make sure we have the correct version in the parsed data if not set
    if (!parsedData.packageVersion) parsedData.packageVersion = targetVersion;
    if (!parsedData.packageIdentifier) parsedData.packageIdentifier = packageId;
    parsedData.versions = sortedVersions;

    res.json(parsedData);
  } catch (err) {
    console.error('WinGet info fetch error:', err);
    res.status(500).json({ error: `Failed to resolve WinGet package: ${err.message}` });
  }
});

/** POST /api/winget-download — download direct installer binary file into the local workspace source directory */
app.post('/api/winget-download', express.json(), async (req, res) => {
  try {
    const { url, filename, targetDir } = req.body || {};
    if (!url) return res.status(400).json({ error: 'url is required' });
    if (!filename) return res.status(400).json({ error: 'filename is required' });
    if (!targetDir) return res.status(400).json({ error: 'targetDir is required' });

    if (!existsSync(targetDir)) {
      return res.status(400).json({ error: `Target directory does not exist: ${targetDir}` });
    }

    const destPath = join(targetDir, filename);
    const fetchRes = await fetch(url);
    if (!fetchRes.ok) throw new Error(`Server returned status ${fetchRes.status}`);

    const arrayBuffer = await fetchRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    writeFileSync(destPath, buffer);

    res.json({ success: true, path: destPath });
  } catch (err) {
    console.error('WinGet download error:', err);
    res.status(500).json({ error: `Failed to download installer binary: ${err.message}` });
  }
});

// ── Start ───────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 SPA Publish API running on http://localhost:${PORT}`);
  console.log(`   GitLab: ${GITLAB_URL}`);
  console.log(`   Token:  ${GITLAB_TOKEN ? '✅ configured' : '❌ NOT SET'}`);
  console.log(`   Intune: ${graphConfigured ? '✅ configured' : '⚠️  NOT SET (set AZURE_* vars)'}\n`);
});
