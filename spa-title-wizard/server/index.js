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

// Allow self-signed / internal CA certificates (common with corporate GitLab)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const app = express();
app.use(express.json({ limit: '10mb' }));

// ── Config ──────────────────────────────────────────────────────────────────
const GITLAB_URL      = process.env.GITLAB_URL      || 'https://gitlab.fiserv.com';
const GITLAB_TOKEN    = process.env.GITLAB_TOKEN    || '';
const PORT            = Number(process.env.PORT)    || 3001;

// Azure / Microsoft Graph (Intune)
const AZURE_TENANT_ID     = process.env.AZURE_TENANT_ID     || '';
const AZURE_CLIENT_ID     = process.env.AZURE_CLIENT_ID     || '';
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
    const { packageId, gitLabGroup, category, displayName, version, files } = req.body;

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

      // Commit directly to default branch
      await gitlab('POST', `/projects/${existing.id}/repository/commits`, {
        branch: defaultBranch,
        commit_message: `release: ${displayName || packageId} ${tagName}\n\nUpdated by SPA Packaging Workbench`,
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

      console.log(`  ✅ Done: ${existing.web_url}`);

      return res.json({
        action: 'updated',
        projectUrl: existing.web_url,
        tagName,
        tagUrl,
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
        commit_message: `feat: initial scaffolding for ${displayName || packageId} ${tagName}\n\nGenerated by SPA Packaging Workbench`,
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

      console.log(`  ✅ Done: ${project.web_url}`);

      return res.json({
        action: 'created',
        projectUrl: project.web_url,
        tagName,
        tagUrl,
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
  let url = `/deviceAppManagement/mobileApps?$filter=isof('microsoft.graph.win32LobApp')&$select=id,displayName,publisher,displayVersion,description&$top=999`;
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

// ── Health check ────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    gitlab: GITLAB_URL,
    hasToken: !!GITLAB_TOKEN,
    intune: graphConfigured,
  });
});

// ── Start ───────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 SPA Publish API running on http://localhost:${PORT}`);
  console.log(`   GitLab: ${GITLAB_URL}`);
  console.log(`   Token:  ${GITLAB_TOKEN ? '✅ configured' : '❌ NOT SET'}`);
  console.log(`   Intune: ${graphConfigured ? '✅ configured' : '⚠️  NOT SET (set AZURE_* vars)'}\n`);
});
