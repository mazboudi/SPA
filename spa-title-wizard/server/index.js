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
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, readdirSync, statSync } from 'fs';
import { join, dirname, extname } from 'path';
import { fileURLToPath } from 'url';
import { exec, execSync } from 'child_process';
import { tmpdir, homedir } from 'os';
import zlib from 'zlib';
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
const GITLAB_DEFAULT_GROUP = process.env.GITLAB_DEFAULT_GROUP || 'euc/software-package-automation';
// Platform-specific GitLab groups (fall back to legacy GITLAB_DEFAULT_GROUP for testing)
const GITLAB_WIN_GROUP = process.env.GITLAB_WIN_GROUP || GITLAB_DEFAULT_GROUP;
const GITLAB_MAC_GROUP = process.env.GITLAB_MAC_GROUP || GITLAB_DEFAULT_GROUP;
// Full project path for the shared CI templates repo (used for pipeline access checks)
const GITLAB_CI_TEMPLATES_PROJECT = process.env.GITLAB_CI_TEMPLATES_PROJECT || '';

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

// ── Startup diagnostic: verify token scope ──────────────────────────────────
if (GITLAB_TOKEN) {
  (async () => {
    try {
      const res = await fetch(`${API}/personal_access_tokens/self`, { headers: { 'PRIVATE-TOKEN': GITLAB_TOKEN } });
      if (res.ok) {
        const info = await res.json();
        console.log(`🔑 GitLab token: name="${info.name}", scopes=[${info.scopes?.join(', ')}], expires=${info.expires_at || 'never'}`);
      }
      // Also check access to CI templates project (only if path is configured)
      if (GITLAB_CI_TEMPLATES_PROJECT) {
        const tplRes = await fetch(`${API}/projects/${encodeURIComponent(GITLAB_CI_TEMPLATES_PROJECT)}`, { headers: { 'PRIVATE-TOKEN': GITLAB_TOKEN } });
        if (!tplRes.ok) {
          console.warn(`⚠️  Token cannot access CI templates project: ${GITLAB_CI_TEMPLATES_PROJECT} (HTTP ${tplRes.status}). Pipeline triggers will fail.`);
          console.warn(`   → Ensure GITLAB_TOKEN has read access, or set GITLAB_CI_TEMPLATES_PROJECT correctly in server/.env`);
        } else {
          console.log(`✅ CI templates project accessible: ${GITLAB_CI_TEMPLATES_PROJECT}`);
        }
      }
    } catch (e) {
      console.warn(`⚠️  Token diagnostic check failed: ${e.message}`);
    }
  })();
}

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
    // GitLab returns errors in various shapes: string, { message: string }, { message: { base: [...] } }
    let msg;
    if (typeof data.message === 'string') {
      msg = data.message;
    } else if (data.message) {
      msg = JSON.stringify(data.message);
    } else if (typeof data.error === 'string') {
      msg = data.error;
    } else {
      msg = JSON.stringify(data);
    }
    console.error(`  ❌ GitLab ${res.status} ${method} ${path}: ${msg}`);
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

// ── Local Git Clone helpers ─────────────────────────────────────────────────

/** Base directory for local repo clones */
const CLONE_BASE = join(homedir(), 'spa-workbench', 'titles');

/** Build an authenticated HTTPS clone URL */
function cloneUrl(projectPath) {
  const gitlabHost = GITLAB_URL.replace(/^https?:\/\//, '');
  return `https://oauth2:${GITLAB_TOKEN}@${gitlabHost}/${projectPath}.git`;
}

/** Run a git command in a directory. Returns stdout. Throws on error. */
function git(args, cwd, opts = {}) {
  // Use -c credential.helper= to forcefully disable all credential helpers
  const cmd = `git -c credential.helper= ${args}`;
  try {
    return execSync(cmd, {
      cwd,
      encoding: 'utf8',
      stdio: opts.silent ? 'pipe' : ['pipe', 'pipe', 'pipe'],
      timeout: 120_000, // 2 min max
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
        // Bypass system credential helpers (fixes 'credential-manager-core' errors on Windows)
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_ASKPASS: '',
      },
    }).trim();
  } catch (err) {
    const stderr = err.stderr?.toString().trim() || err.message;
    if (!opts.ignoreError) {
      console.error(`  ❌ git ${args.split(' ')[0]} failed: ${stderr}`);
    }
    throw new Error(`git error: ${stderr}`);
  }
}

/**
 * Ensure a local clone exists and is checked out to the desired ref.
 * - If the directory exists: fetch + checkout
 * - If not: fresh clone
 * Returns the absolute path to the cloned repo.
 */
function ensureLocalClone(projectPath, ref = 'main') {
  const slug = projectPath.split('/').pop();
  const repoDir = join(CLONE_BASE, slug);
  const url = cloneUrl(projectPath);

  if (existsSync(join(repoDir, '.git'))) {
    // Existing clone — ensure remote URL uses current token, then fetch
    console.log(`  📂 Existing clone found: ${repoDir}`);
    git(`remote set-url origin ${url}`, repoDir, { silent: true });
    git('fetch origin --tags --prune', repoDir);
    try {
      git(`checkout ${ref}`, repoDir, { silent: true });
    } catch {
      // ref might be a remote branch not yet tracked
      git(`checkout -B ${ref} origin/${ref}`, repoDir, { silent: true });
    }
    git(`reset --hard origin/${ref}`, repoDir, { ignoreError: true, silent: true });
    console.log(`  📌 Checked out: ${ref}`);
  } else {
    // Fresh clone — remove stale directory if it exists without .git
    if (existsSync(repoDir)) {
      console.log(`  🧹 Removing corrupted directory (no .git): ${repoDir}`);
      rmSync(repoDir, { recursive: true, force: true });
    }
    if (!existsSync(CLONE_BASE)) {
      mkdirSync(CLONE_BASE, { recursive: true });
    }
    console.log(`  📥 Cloning ${projectPath} → ${repoDir}`);
    git(`clone --branch ${ref} ${url} ${repoDir}`, CLONE_BASE);
    console.log(`  ✅ Clone complete`);
  }

  return repoDir;
}

/**
 * Walk a directory tree and read all text files into a { relativePath: content } map.
 * Skips: .git/, node_modules/, and common binary extensions.
 */
const BINARY_EXTENSIONS = new Set([
  '.exe', '.msi', '.msp', '.mst', '.cab', '.dll', '.sys',
  '.pkg', '.dmg', '.app', '.zip', '.tar', '.gz', '.7z', '.rar',
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.svg',
  '.woff', '.woff2', '.ttf', '.eot',
  '.intunewin', '.bin', '.dat',
]);
const SKIP_DIRS = new Set(['.git', 'node_modules', '.DS_Store']);

function walkDir(dir, baseDir = dir) {
  const files = {};
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const abs = join(dir, entry);
    const rel = abs.slice(baseDir.length + 1).replace(/\\/g, '/'); // normalize to forward slashes
    const stat = statSync(abs);
    if (stat.isDirectory()) {
      Object.assign(files, walkDir(abs, baseDir));
    } else if (!BINARY_EXTENSIONS.has(extname(entry).toLowerCase())) {
      try {
        files[rel] = readFileSync(abs, 'utf8');
      } catch {
        // Skip unreadable files
      }
    }
  }
  return files;
}

/**
 * Write a { relativePath: content } file map into a directory.
 * Creates subdirectories as needed. Handles PowerShell BOM + CRLF.
 */
function writeFilesToDir(dir, files) {
  for (const [relPath, content] of Object.entries(files)) {
    const absPath = join(dir, relPath);
    const absDir = dirname(absPath);
    if (!existsSync(absDir)) {
      mkdirSync(absDir, { recursive: true });
    }
    // Binary file (data URL) — decode and write as raw bytes
    if (typeof content === 'string' && content.startsWith('data:')) {
      const base64 = content.split(',')[1] || '';
      writeFileSync(absPath, Buffer.from(base64, 'base64'));
    } else {
      const isPowerShell = relPath.endsWith('.ps1');
      const BOM = '\uFEFF';
      const fileContent = isPowerShell
        ? BOM + content.replace(/\r?\n/g, '\r\n')
        : content;
      writeFileSync(absPath, fileContent, 'utf8');
    }
  }
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

// ── POST /api/publish/stream — SSE progress streaming ────────────────────────
// Emits newline-delimited JSON events as the publish progresses.
// Format: data: {"step":"...","message":"...","status":"running"|"ok"|"warn"|"error"}\n\n
app.post('/api/publish/stream', async (req, res) => {
  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const emit = (step, message, status = 'running') => {
    const payload = JSON.stringify({ step, message, status });
    res.write(`data: ${payload}\n\n`);
  };

  try {
    const { packageId, gitLabGroup, category, displayName, version, files, pipelineAction, editProjectPath } = req.body;
    const triggerPipeline = pipelineAction && pipelineAction !== 'none';

    if (!packageId || !gitLabGroup || !files || !Object.keys(files).length) {
      emit('error', 'Missing required fields: packageId, gitLabGroup, files', 'error');
      return res.end();
    }
    const slugError = validateSlug(packageId);
    if (slugError) {
      emit('error', slugError, 'error');
      return res.end();
    }

    emit('init', `Publishing "${displayName || packageId}" → ${gitLabGroup}/${packageId}`);

    // 1. Resolve group
    emit('group', 'Resolving GitLab group…');
    const fullGroupPath = gitLabGroup;
    const groupId = await ensureGroupPath(fullGroupPath);
    emit('group', `Group resolved: ${fullGroupPath}`, 'ok');

    // 2. Check if project exists
    // In Edit mode the client sends editProjectPath (the exact path_with_namespace).
    // Use a direct lookup to avoid the group-search miss when the project lives
    // in a different subgroup than the one currently in Settings.
    emit('check', 'Checking if project exists in GitLab…');
    let existing = null;
    if (editProjectPath) {
      // Direct lookup by exact path — always accurate regardless of group config
      try {
        const qs = new URLSearchParams({ search: packageId, per_page: '20', simple: 'true' });
        const results = await gitlab('GET', `/projects?${qs}`);
        if (Array.isArray(results)) {
          existing = results.find(p => p.path_with_namespace === editProjectPath) || null;
        }
        if (!existing) {
          // Broader search with search_namespaces
          const qs2 = new URLSearchParams({ search: packageId, search_namespaces: 'true', per_page: '50', simple: 'true' });
          const results2 = await gitlab('GET', `/projects?${qs2}`);
          if (Array.isArray(results2)) {
            existing = results2.find(p => p.path_with_namespace === editProjectPath) || null;
          }
        }
      } catch (lookupErr) {
        console.warn(`  ⚠️ Direct project lookup failed: ${lookupErr.message} — falling back to group search`);
      }
    }
    // Fallback to group search for new titles or when direct lookup doesn't find the project
    if (!existing) {
      existing = await findProject(groupId, packageId);
    }

    if (existing) {
      // ── Existing project path ──────────────────────────────────────
      const defaultBranch = existing.default_branch || 'main';
      const tagName = version ? `v${version.replace(/^v/i, '')}` : `v${Date.now()}`;
      emit('check', `Project exists — updating with tag ${tagName}`, 'ok');

      emit('clone', 'Syncing local clone…');
      const repoDir = ensureLocalClone(existing.path_with_namespace, defaultBranch);
      emit('clone', 'Local clone up to date', 'ok');

      emit('files', `Writing ${Object.keys(files).length} files to workspace…`);
      writeFilesToDir(repoDir, files);
      emit('files', `${Object.keys(files).length} files written`, 'ok');

      emit('git', 'Staging changes…');
      git('add -A', repoDir);
      const status = git('status --porcelain', repoDir, { silent: true });
      if (status) {
        emit('git', 'Committing changes…');
        git(`commit -m "release: ${displayName || packageId} ${tagName} [skip ci]\n\nUpdated by SPA Packaging Workbench"`, repoDir);
        emit('git', 'Changes committed', 'ok');
      } else {
        emit('git', 'No file changes — tag update only', 'warn');
      }

      emit('tag', `Creating tag ${tagName}…`);
      git(`tag -f -a ${tagName} -m "Release ${tagName} — ${displayName || packageId}"`, repoDir);
      emit('tag', `Tag ${tagName} created`, 'ok');

      emit('push', `Pushing to origin/${defaultBranch}…`);
      git(`push origin ${defaultBranch} --force`, repoDir);
      git(`push origin ${tagName} --force`, repoDir);
      emit('push', 'Pushed to GitLab', 'ok');

      const tagUrl = `${existing.web_url}/-/tags/${tagName}`;
      let pipelineUrl = null, pipelineError = null, pipelineId = null;

      if (triggerPipeline) {
        emit('pipeline', `Triggering pipeline (${pipelineAction})…`);
        try {
          await new Promise(r => setTimeout(r, 1500));
          const pipelineVars = [{ key: 'SPA_STAGE_LIMIT', variable_type: 'env_var', value: pipelineAction }];
          const pipeline = await gitlab('POST', `/projects/${existing.id}/pipeline`, { ref: defaultBranch, variables: pipelineVars });
          pipelineUrl = pipeline.web_url || `${existing.web_url}/-/pipelines/${pipeline.id}`;
          pipelineId = pipeline.id;
          emit('pipeline', `Pipeline triggered (#${pipeline.id})`, 'ok');
        } catch (pipeErr) {
          pipelineError = pipeErr.message;
          emit('pipeline', `Pipeline trigger failed: ${pipeErr.message}`, 'warn');
        }
      }

      emit('done', `Published successfully`, 'ok');
      res.write(`data: ${JSON.stringify({ step: 'result', status: 'ok', result: {
        action: 'updated', projectUrl: existing.web_url, projectId: existing.id,
        tagName, tagUrl, pipelineUrl, pipelineId, pipelineAction: pipelineAction || 'none',
        pipelineError, localPath: repoDir,
        vsCodeUrl: `vscode://file${repoDir.replace(/\\/g, '/')}`,
      }})}\n\n`);

    } else {
      // ── New project path ───────────────────────────────────────────
      const tagName = version ? `v${version.replace(/^v/i, '')}` : 'v1.0.0';
      emit('check', 'Project not found — creating new project', 'ok');

      emit('create', `Creating GitLab project "${displayName || packageId}"…`);
      const project = await gitlab('POST', '/projects', {
        name: displayName || packageId,
        path: packageId,
        namespace_id: groupId,
        visibility: 'private',
        initialize_with_readme: false,
        description: `SPA packaging project for ${displayName || packageId}`,
      });
      emit('create', `Project created: ${project.path_with_namespace}`, 'ok');

      emit('files', `Committing ${Object.keys(files).length} files…`);
      const actions = buildCommitActions(files, 'create');
      await gitlab('POST', `/projects/${project.id}/repository/commits`, {
        branch: 'main',
        commit_message: `feat: initial scaffolding for ${displayName || packageId} ${tagName} [skip ci]\n\nGenerated by SPA Packaging Workbench`,
        actions,
      });
      emit('files', `${actions.length} files committed to main`, 'ok');

      try { await gitlab('PUT', `/projects/${project.id}`, { default_branch: 'main' }); } catch { /* non-critical */ }

      emit('tag', `Creating tag ${tagName}…`);
      let tagUrl = null;
      try {
        await gitlab('POST', `/projects/${project.id}/repository/tags`, {
          tag_name: tagName, ref: 'main',
          message: `Release ${tagName} — ${displayName || packageId}\n\nPublished via SPA Packaging Workbench`,
        });
        tagUrl = `${project.web_url}/-/tags/${tagName}`;
        emit('tag', `Tag ${tagName} created`, 'ok');
      } catch (tagErr) {
        emit('tag', `Tag creation failed (non-critical): ${tagErr.message}`, 'warn');
      }

      emit('clone', 'Cloning project locally for VS Code…');
      let repoDir = null;
      try {
        repoDir = ensureLocalClone(project.path_with_namespace, 'main');
        emit('clone', 'Local clone ready', 'ok');
      } catch (cloneErr) {
        emit('clone', `Local clone failed (non-critical): ${cloneErr.message}`, 'warn');
      }

      let pipelineUrl = null, pipelineError = null, pipelineId = null;
      if (triggerPipeline) {
        emit('pipeline', `Triggering pipeline (${pipelineAction})…`);
        try {
          await new Promise(r => setTimeout(r, 1500));
          const pipelineVars = [{ key: 'SPA_STAGE_LIMIT', variable_type: 'env_var', value: pipelineAction }];
          const pipeline = await gitlab('POST', `/projects/${project.id}/pipeline`, { ref: 'main', variables: pipelineVars });
          pipelineUrl = pipeline.web_url || `${project.web_url}/-/pipelines/${pipeline.id}`;
          pipelineId = pipeline.id;
          emit('pipeline', `Pipeline triggered (#${pipeline.id})`, 'ok');
        } catch (pipeErr) {
          pipelineError = pipeErr.message;
          emit('pipeline', `Pipeline trigger failed: ${pipeErr.message}`, 'warn');
        }
      }

      emit('done', 'Published successfully', 'ok');
      res.write(`data: ${JSON.stringify({ step: 'result', status: 'ok', result: {
        action: 'created', projectUrl: project.web_url, projectId: project.id,
        tagName, tagUrl, pipelineUrl, pipelineId, pipelineAction: pipelineAction || 'none',
        pipelineError, localPath: repoDir,
        vsCodeUrl: repoDir
          ? `vscode://file${repoDir.replace(/\\/g, '/')}`
          : `vscode://vscode.git/clone?url=${encodeURIComponent(`${GITLAB_URL}/${project.path_with_namespace}.git`)}`,
      }})}\n\n`);
    }

  } catch (err) {
    console.error('❌ Publish stream failed:', err.message);
    emit('error', err.message, 'error');
  } finally {
    res.end();
  }
});

// ── POST /api/publish ───────────────────────────────────────────────────────
app.post('/api/publish', async (req, res) => {
  try {
    const { packageId, gitLabGroup, category, displayName, version, files, pipelineAction, editProjectPath } = req.body;
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

    console.log(`\n📦 Publishing "${displayName || packageId}" → ${gitLabGroup}/${packageId}`);

    // 1. Resolve the group path (creates subgroups if needed)
    const fullGroupPath = gitLabGroup;
    const groupId = await ensureGroupPath(fullGroupPath);
    console.log(`  📂 Group resolved: ${fullGroupPath} (id: ${groupId})`);

    // 2. Check if project already exists
    // In Edit mode the client sends editProjectPath (exact path_with_namespace).
    // Use a direct path lookup so we find the project regardless of which group
    // it actually lives in (avoids mismatch when Settings group differs from the
    // group the title was originally created in).
    let existing = null;
    if (editProjectPath) {
      try {
        const qs = new URLSearchParams({ search: packageId, per_page: '20', simple: 'true' });
        const results = await gitlab('GET', `/projects?${qs}`);
        if (Array.isArray(results)) {
          existing = results.find(p => p.path_with_namespace === editProjectPath) || null;
        }
        if (!existing) {
          const qs2 = new URLSearchParams({ search: packageId, search_namespaces: 'true', per_page: '50', simple: 'true' });
          const results2 = await gitlab('GET', `/projects?${qs2}`);
          if (Array.isArray(results2)) {
            existing = results2.find(p => p.path_with_namespace === editProjectPath) || null;
          }
        }
        if (existing) {
          console.log(`  ✅ Found project by path: ${existing.path_with_namespace} (id: ${existing.id})`);
        }
      } catch (lookupErr) {
        console.warn(`  ⚠️ Direct project lookup failed: ${lookupErr.message} — falling back to group search`);
      }
    }
    if (!existing) {
      existing = await findProject(groupId, packageId);
    }

    if (existing) {
      // ── Existing project → write to local clone + git push ────────
      const defaultBranch = existing.default_branch || 'main';
      const tagName = version ? `v${version.replace(/^v/i, '')}` : `v${Date.now()}`;
      console.log(`  🔄 Project exists (id: ${existing.id}) — updating with tag ${tagName}`);

      // Ensure local clone is up-to-date
      const repoDir = ensureLocalClone(existing.path_with_namespace, defaultBranch);

      // Write all generated files into the local clone
      writeFilesToDir(repoDir, files);
      console.log(`  📝 Wrote ${Object.keys(files).length} files to ${repoDir}`);

      // Git add + commit + tag + push
      git('add -A', repoDir);

      // Check if there are changes to commit
      const status = git('status --porcelain', repoDir, { silent: true });
      if (status) {
        git(`commit -m "release: ${displayName || packageId} ${tagName} [skip ci]\n\nUpdated by SPA Packaging Workbench"`, repoDir);
        console.log(`  💾 Committed changes`);
      } else {
        console.log(`  ℹ️  No changes detected — forcing tag update only`);
      }

      // Force-update the version tag and push
      git(`tag -f -a ${tagName} -m "Release ${tagName} — ${displayName || packageId}"`, repoDir);
      console.log(`  🏷️  Tag set: ${tagName}`);

      git(`push origin ${defaultBranch} --force`, repoDir);
      git(`push origin ${tagName} --force`, repoDir);
      console.log(`  🚀 Pushed to origin/${defaultBranch}`);

      const tagUrl = `${existing.web_url}/-/tags/${tagName}`;

      // Optionally trigger pipeline via API
      let pipelineUrl = null;
      let pipelineError = null;
      let pipelineId = null;
      if (triggerPipeline) {
        try {
          // Small delay to let GitLab process the push before triggering
          await new Promise(r => setTimeout(r, 1500));
          const pipelineVars = [{ key: 'SPA_STAGE_LIMIT', variable_type: 'env_var', value: pipelineAction }];
          const pipeline = await gitlab('POST', `/projects/${existing.id}/pipeline`, {
            ref: defaultBranch,
            variables: pipelineVars,
          });
          pipelineUrl = pipeline.web_url || `${existing.web_url}/-/pipelines/${pipeline.id}`;
          pipelineId = pipeline.id;
          console.log(`  🚀 Pipeline triggered: ${pipelineUrl} (SPA_STAGE_LIMIT=${pipelineAction})`);
        } catch (pipeErr) {
          pipelineError = pipeErr.message;
          console.warn(`  ⚠️  Pipeline trigger failed: ${pipeErr.message}`);
        }
      }

      console.log(`  ✅ Done: ${existing.web_url}`);

      return res.json({
        action: 'updated',
        projectUrl: existing.web_url,
        projectId: existing.id,
        tagName,
        tagUrl,
        pipelineUrl,
        pipelineId,
        pipelineAction: pipelineAction || 'none',
        pipelineError,
        localPath: repoDir,
        vsCodeUrl: `vscode://file${repoDir.replace(/\\/g, '/')}`,
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

      // Clone the new project locally so VS Code can open it
      let repoDir = null;
      try {
        repoDir = ensureLocalClone(project.path_with_namespace, 'main');
        console.log(`  📂 Local clone ready: ${repoDir}`);
      } catch (cloneErr) {
        console.warn(`  ⚠️  Local clone failed (non-critical): ${cloneErr.message}`);
      }

      // Optionally trigger pipeline via API
      let pipelineUrl = null;
      let pipelineError = null;
      let pipelineId = null;
      if (triggerPipeline) {
        try {
          // Small delay to let GitLab process the commit before triggering
          await new Promise(r => setTimeout(r, 1500));
          const pipelineVars = [{ key: 'SPA_STAGE_LIMIT', variable_type: 'env_var', value: pipelineAction }];
          const pipeline = await gitlab('POST', `/projects/${project.id}/pipeline`, {
            ref: 'main',
            variables: pipelineVars,
          });
          pipelineUrl = pipeline.web_url || `${project.web_url}/-/pipelines/${pipeline.id}`;
          pipelineId = pipeline.id;
          console.log(`  🚀 Pipeline triggered: ${pipelineUrl} (SPA_STAGE_LIMIT=${pipelineAction})`);
        } catch (pipeErr) {
          pipelineError = pipeErr.message;
          console.warn(`  ⚠️  Pipeline trigger failed: ${pipeErr.message}`);
        }
      }

      console.log(`  ✅ Done: ${project.web_url}`);

      return res.json({
        action: 'created',
        projectUrl: project.web_url,
        projectId: project.id,          // ← required for pipeline polling
        tagName,
        tagUrl,
        pipelineUrl,
        pipelineId,                     // ← required for pipeline polling
        pipelineAction: pipelineAction || 'none',
        pipelineError,
        localPath: repoDir,
        vsCodeUrl: repoDir ? `vscode://file${repoDir.replace(/\\/g, '/')}` : `vscode://vscode.git/clone?url=${encodeURIComponent(`${GITLAB_URL}/${project.path_with_namespace}.git`)}`,
      });
    }

  } catch (err) {
    console.error('❌ Publish failed:', err.message);
    const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
    res.status(status).json({ message: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ██  Pipeline Status & Artifact Endpoints
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/pipeline/:projectId/:pipelineId/status
// Returns the overall pipeline status and a flat list of its jobs grouped by stage.
app.get('/api/pipeline/:projectId/:pipelineId/status', async (req, res) => {
  const { projectId, pipelineId } = req.params;
  try {
    if (!GITLAB_TOKEN || GITLAB_TOKEN === 'mock-token-or-empty') {
      // Offline mock — simulate stages progressing
      const now = Date.now();
      const age = now - Number(pipelineId.slice(-6));  // crude age from id suffix
      const mockStatus = age > 30000 ? 'success' : age > 10000 ? 'running' : 'pending';
      return res.json({
        id: pipelineId,
        status: mockStatus,
        webUrl: `https://gitlab.example.com/group/project/-/pipelines/${pipelineId}`,
        jobs: [
          { id: 1, name: 'build-intunewin', stage: 'build', status: mockStatus === 'pending' ? 'pending' : 'success', webUrl: null, allowFailure: false, artifactsAvailable: mockStatus === 'success' },
          { id: 2, name: 'publish-intune',  stage: 'publish', status: mockStatus === 'success' ? 'success' : 'pending', webUrl: null, allowFailure: false, artifactsAvailable: false },
        ],
      });
    }

    const [pipeline, jobs] = await Promise.all([
      gitlab('GET', `/projects/${projectId}/pipelines/${pipelineId}`),
      gitlab('GET', `/projects/${projectId}/pipelines/${pipelineId}/jobs?per_page=50`),
    ]);

    res.json({
      id: pipeline.id,
      status: pipeline.status,
      duration: pipeline.duration,
      webUrl: pipeline.web_url,
      ref: pipeline.ref,
      jobs: (jobs || []).map(j => ({
        id: j.id,
        name: j.name,
        stage: j.stage,
        status: j.status,
        duration: j.duration,
        webUrl: j.web_url,
        allowFailure: j.allow_failure,
        // artifacts_file is present when the job produced downloadable artifacts
        artifactsAvailable: !!(j.artifacts_file && j.artifacts_file.filename),
        artifactsExpireAt: j.artifacts_expire_at || null,
      })),
    });
  } catch (err) {
    console.error(`❌ Pipeline status fetch failed: ${err.message}`);
    res.status(err.status || 500).json({ message: err.message });
  }
});

// GET /api/pipeline/:projectId/:pipelineId/artifacts?jobName=build-intunewin
// Proxies a GitLab artifact archive download for a specific job.
// Returns a redirect to the GitLab artifact download URL (the browser handles the download).
app.get('/api/pipeline/:projectId/:pipelineId/artifacts', async (req, res) => {
  const { projectId, pipelineId } = req.params;
  const jobName = req.query.jobName || '';
  try {
    if (!GITLAB_TOKEN || GITLAB_TOKEN === 'mock-token-or-empty') {
      return res.status(503).json({ message: 'Artifact download not available in offline/mock mode.' });
    }
    // GitLab API: GET /projects/:id/jobs/artifacts/:ref/download?job=<name>
    // We use the pipeline jobs endpoint to find the job id, then redirect.
    const jobs = await gitlab('GET', `/projects/${projectId}/pipelines/${pipelineId}/jobs?per_page=50`);
    const job = jobName
      ? (jobs || []).find(j => j.name === jobName)
      : (jobs || []).find(j => j.artifacts_file && j.artifacts_file.filename);

    if (!job) return res.status(404).json({ message: `No matching job found (jobName=${jobName})` });

    // Redirect the browser to GitLab's artifact download endpoint (with auth token in header is not possible via redirect).
    // Instead return the URL so the frontend can open it.
    const artifactUrl = `${GITLAB_URL}/api/v4/projects/${projectId}/jobs/${job.id}/artifacts?private_token=${GITLAB_TOKEN}`;
    res.json({ url: artifactUrl, jobId: job.id, jobName: job.name, filename: job.artifacts_file?.filename || 'artifacts.zip' });
  } catch (err) {
    console.error(`❌ Artifact URL fetch failed: ${err.message}`);
    res.status(err.status || 500).json({ message: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ██  Project Browser — Edit Existing Packages
// ═══════════════════════════════════════════════════════════════════════════

// ── Mock GitLab Helpers for Offline Development ──────────────────────────
function getMockProjects() {
  return {
    projects: [
      {
        id: 101,
        name: 'Google Chrome',
        path: 'google-chrome',
        path_with_namespace: 'euc/software-package-automation/software-titles/google-chrome',
        description: 'Google Chrome Enterprise installer package',
        web_url: 'https://gitlab.onefiserv.net/euc/software-package-automation/software-titles/google-chrome',
        updated_at: new Date().toISOString(),
        default_branch: 'main',
        tags: [{ name: 'v120.0.6099.109', message: 'Release v120.0.6099.109' }, { name: 'v119.0.6045.105', message: 'Release v119.0.6045.105' }]
      },
      {
        id: 102,
        name: '7-Zip',
        path: '7-zip',
        path_with_namespace: 'euc/software-package-automation/software-titles/7-zip',
        description: '7-Zip file archiver utility',
        web_url: 'https://gitlab.onefiserv.net/euc/software-package-automation/software-titles/7-zip',
        updated_at: new Date().toISOString(),
        default_branch: 'main',
        tags: [{ name: 'v23.01', message: 'Release v23.01' }]
      },
      {
        id: 103,
        name: 'Notepad++',
        path: 'notepad-plus-plus',
        path_with_namespace: 'euc/software-package-automation/software-titles/notepad-plus-plus',
        description: 'Notepad++ text and source code editor',
        web_url: 'https://gitlab.onefiserv.net/euc/software-package-automation/software-titles/notepad-plus-plus',
        updated_at: new Date().toISOString(),
        default_branch: 'main',
        tags: []
      }
    ],
    count: 3
  };
}

function getMockProjectFiles(projectId) {
  let projectMeta = {};
  let stateSnapshot = {};
  
  if (projectId === '101' || projectId === 101) {
    projectMeta = {
      id: 101,
      name: 'Google Chrome',
      path: 'google-chrome',
      path_with_namespace: 'euc/software-package-automation/software-titles/google-chrome',
      web_url: 'https://gitlab.onefiserv.net/euc/software-package-automation/software-titles/google-chrome',
      default_branch: 'main',
      loadedRef: 'main'
    };
    stateSnapshot = {
      displayName: 'Google Chrome',
      packageId: 'google-chrome',
      publisher: 'Google LLC',
      version: '120.0.6099.109',
      category: 'browsers',
      platform: 'windows',
      installerType: 'msi',
      msiProductCode: '{A98B7C6D-E5F4-3A2B-1C0D-9E8F7A6B5C4D}',
      msiProductVersion: '120.0.6099.109'
    };
  } else if (projectId === '102' || projectId === 102) {
    projectMeta = {
      id: 102,
      name: '7-Zip',
      path: '7-zip',
      path_with_namespace: 'euc/software-package-automation/software-titles/7-zip',
      web_url: 'https://gitlab.onefiserv.net/euc/software-package-automation/software-titles/7-zip',
      default_branch: 'main',
      loadedRef: 'main'
    };
    stateSnapshot = {
      displayName: '7-Zip',
      packageId: '7-zip',
      publisher: 'Igor Pavlov',
      version: '23.01',
      category: 'utilities',
      platform: 'windows',
      installerType: 'msi',
      msiProductCode: '{23010000-0000-0000-0000-000000000000}',
      msiProductVersion: '23.01'
    };
  } else {
    projectMeta = {
      id: 103,
      name: 'Notepad++',
      path: 'notepad-plus-plus',
      path_with_namespace: 'euc/software-package-automation/software-titles/notepad-plus-plus',
      web_url: 'https://gitlab.onefiserv.net/euc/software-package-automation/software-titles/notepad-plus-plus',
      default_branch: 'main',
      loadedRef: 'main'
    };
    stateSnapshot = {
      displayName: 'Notepad++',
      packageId: 'notepad-plus-plus',
      publisher: 'Don Ho',
      version: '8.6',
      category: 'developer-tools',
      platform: 'windows',
      installerType: 'exe',
      exeSourceFilename: 'npp.8.6.Installer.x64.exe',
      exeInstallArgs: '/S'
    };
  }

  return {
    files: {
      'spa-wizard-state.json': JSON.stringify(stateSnapshot, null, 2),
      'app.json': JSON.stringify({ name: projectMeta.name, package_id: projectMeta.path }, null, 2)
    },
    projectMeta
  };
}

// ── GET /api/projects — list all title projects ─────────────────────────────
app.get('/api/projects', async (req, res) => {
  try {
    const groupPath = req.query.group || 'euc/software-package-automation/software-titles';
    console.log(`\n📂 Listing projects under: ${groupPath}`);

    // Offline / Mock fallback if token is not set
    if (!GITLAB_TOKEN || GITLAB_TOKEN === 'mock-token-or-empty') {
      console.log('  ⚠️ Using MOCK projects because GITLAB_TOKEN is not configured');
      return res.json(getMockProjects());
    }

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
    // Graceful fallback to mock data on network errors/unreachable GitLab host
    if (err.status === 502 || err.message.includes('Cannot reach GitLab') || err.message.includes('fetch failed')) {
      console.log('  ⚠️ Unreachable GitLab. Falling back to mock projects.');
      return res.json(getMockProjects());
    }
    res.status(err.status || 500).json({ message: err.message });
  }
});

// ── GET /api/projects/check — check if a project path already exists in GitLab ──
// Uses group + project slug lookup to avoid %2F encoding issues across environments.
app.get('/api/projects/check', async (req, res) => {
  try {
    const { path } = req.query;
    if (!path) return res.status(400).json({ error: 'path is required' });

    // Normalise: strip any accidental %2F that came through double-encoded
    const normalizedPath = path.replace(/%2F/gi, '/');
    console.log(`\n🔍 Checking if GitLab project exists: ${normalizedPath}`);

    // Offline / Mock fallback if token is not set
    if (!GITLAB_TOKEN || GITLAB_TOKEN === 'mock-token-or-empty') {
      console.log('  ⚠️ Using MOCK check because GITLAB_TOKEN is not configured');
      const slug = normalizedPath.split('/').pop();
      const mockProj = getMockProjects().projects.find(p => p.path === slug);
      if (mockProj) {
        return res.json({ exists: true, project: mockProj });
      }
      return res.json({ exists: false });
    }

    // Split path into namespace group + project slug
    // e.g. 'euc/software-package-automation/software-titles/google-chrome'
    //   → namespace = 'euc/software-package-automation/software-titles'
    //   → slug      = 'google-chrome'
    const parts = normalizedPath.split('/');
    const slug = parts.pop();
    const namespace = parts.join('/');

    try {
      // Strategy: use /projects with search + namespace as QUERY PARAMS only.
      // This means zero %2F in the URL path segment — completely proxy-safe on Windows.
      //
      // GitLab API: GET /projects?search=slug&search_namespaces=true
      // Then filter client-side by path_with_namespace to get an exact match.
      let project = null;

      // Primary: search by slug within the exact namespace (query params only)
      try {
        const qs = new URLSearchParams({
          search: slug,
          search_namespaces: 'false',  // search project names/paths only
          per_page: '20',
          simple: 'true',
        });
        const searchResults = await gitlab('GET', `/projects?${qs}`);
        if (Array.isArray(searchResults)) {
          // Exact match on full path
          project = searchResults.find(p => p.path_with_namespace === normalizedPath) || null;
        }
      } catch (searchErr) {
        console.warn(`  ⚠️ Project search failed: ${searchErr.message}`);
      }

      // Fallback: broader search with search_namespaces=true in case slug alone didn't surface it
      if (!project) {
        try {
          const qs2 = new URLSearchParams({
            search: slug,
            search_namespaces: 'true',
            per_page: '50',
            simple: 'true',
          });
          const broadResults = await gitlab('GET', `/projects?${qs2}`);
          if (Array.isArray(broadResults)) {
            project = broadResults.find(p => p.path_with_namespace === normalizedPath) || null;
          }
        } catch (broadErr) {
          console.warn(`  ⚠️ Broad project search fallback failed: ${broadErr.message}`);
        }
      }

      if (!project) {
        console.log(`  ℹ️  Project not found: ${normalizedPath}`);
        return res.json({ exists: false });
      }

      // Enrich with tags (non-critical — swallow errors)
      let tags = [];
      try {
        const tagData = await gitlab('GET', `/projects/${project.id}/repository/tags?per_page=20&order_by=version`);
        tags = tagData.map(t => ({ name: t.name, message: t.message || '' }));
      } catch { /* no tags */ }

      return res.json({
        exists: true,
        project: {
          id: project.id,
          name: project.name,
          path: project.path,
          path_with_namespace: project.path_with_namespace,
          web_url: project.web_url,
          default_branch: project.default_branch || 'main',
          tags
        }
      });
    } catch (err) {
      if (err.status === 404) {
        return res.json({ exists: false });
      }
      // Graceful fallback to mock check on network errors/unreachable GitLab host
      if (err.status === 502 || err.message.includes('Cannot reach GitLab') || err.message.includes('fetch failed')) {
        console.log('  ⚠️ Unreachable GitLab for project check. Returning mock check.');
        const slug2 = normalizedPath.split('/').pop();
        const mockProj = getMockProjects().projects.find(p => p.path === slug2);
        if (mockProj) {
          return res.json({ exists: true, project: mockProj });
        }
        return res.json({ exists: false });
      }
      throw err;
    }
  } catch (err) {
    console.error('❌ Project check failed:', err.message);
    res.status(err.status || 500).json({ message: err.message });
  }
});

// ── POST /api/projects/:id/clone — clone repo locally and return files ──────
app.post('/api/projects/:id/clone', async (req, res) => {
  try {
    const projectId = req.params.id;
    const { ref } = req.body || {};
    console.log(`\n📥 Clone request for project ${projectId}` + (ref ? ` @ ${ref}` : ''));

    // Offline / Mock fallback if token is not set or using mock ID
    if (!GITLAB_TOKEN || GITLAB_TOKEN === 'mock-token-or-empty' || ['101', '102', '103'].includes(projectId.toString())) {
      console.log(`  ⚠️ Using MOCK files for project ${projectId}`);
      const mockResult = getMockProjectFiles(projectId);
      return res.json(mockResult);
    }

    // Get project metadata
    const project = await gitlab('GET', `/projects/${projectId}`);
    const targetRef = ref || project.default_branch || 'main';

    // Clone or update local repo
    const localPath = ensureLocalClone(project.path_with_namespace, targetRef);

    // Walk the directory and read all text files
    const files = walkDir(localPath);
    console.log(`  📄 Read ${Object.keys(files).length} files from ${localPath}`);

    res.json({
      files,
      localPath,
      projectMeta: {
        id: project.id,
        name: project.name,
        path: project.path,
        path_with_namespace: project.path_with_namespace,
        web_url: project.web_url,
        default_branch: project.default_branch || 'main',
        loadedRef: targetRef,
      },
    });
  } catch (err) {
    if (err.status === 502 || err.message.includes('Cannot reach GitLab') || err.message.includes('fetch failed')) {
      console.log(`  ⚠️ Unreachable GitLab for clone (${req.params.id}). Returning mock files.`);
      return res.json(getMockProjectFiles(req.params.id));
    }
    console.error('❌ Clone failed:', err.message);
    res.status(err.status || 500).json({ message: err.message });
  }
});

// Keep GET /api/projects/:id/files as backward-compat alias
app.get('/api/projects/:id/files', async (req, res) => {
  try {
    const projectId = req.params.id;

    // Offline / Mock fallback
    if (!GITLAB_TOKEN || GITLAB_TOKEN === 'mock-token-or-empty' || ['101', '102', '103'].includes(projectId.toString())) {
      const mockResult = getMockProjectFiles(projectId);
      return res.json(mockResult);
    }

    const project = await gitlab('GET', `/projects/${projectId}`);
    const ref = req.query.ref || project.default_branch || 'main';
    const localPath = ensureLocalClone(project.path_with_namespace, ref);
    const files = walkDir(localPath);

    res.json({
      files,
      localPath,
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
    if (err.status === 502 || err.message.includes('Cannot reach GitLab') || err.message.includes('fetch failed')) {
      console.log(`  ⚠️ Unreachable GitLab for files fetch (${req.params.id}). Returning mock files.`);
      return res.json(getMockProjectFiles(req.params.id));
    }
    console.error('❌ File fetch failed:', err.message);
    res.status(err.status || 500).json({ message: err.message });
  }
});

// ── POST /api/projects/:id/intune-sync-snapshot — save live data to windows/intune/live_app.json ──────
app.post('/api/projects/:id/intune-sync-snapshot', express.json(), async (req, res) => {
  try {
    const projectId = req.params.id;
    const { liveData } = req.body;
    
    if (!liveData) {
      return res.status(400).json({ message: 'Missing liveData payload' });
    }

    if (!GITLAB_TOKEN || GITLAB_TOKEN === 'mock-token-or-empty' || ['101', '102', '103'].includes(projectId.toString())) {
      // Mock mode, just pretend it succeeded
      return res.json({ success: true, path: 'windows/intune/live_app.json' });
    }

    const project = await gitlab('GET', `/projects/${projectId}`);
    const localPath = ensureLocalClone(project.path_with_namespace, project.default_branch || 'main');
    
    const targetDir = path.join(localPath, 'windows', 'intune');
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    
    const targetFile = path.join(targetDir, 'live_app.json');
    fs.writeFileSync(targetFile, JSON.stringify(liveData, null, 2), 'utf-8');
    
    console.log(`✅ Saved live Intune snapshot to ${targetFile}`);
    res.json({ success: true, path: 'windows/intune/live_app.json' });
  } catch (err) {
    if (err.status === 502 || err.message.includes('Cannot reach GitLab') || err.message.includes('fetch failed')) {
      console.log(`  ⚠️ Unreachable GitLab for Intune snapshot (${req.params.id}). Pretending success.`);
      return res.json({ success: true, path: 'windows/intune/live_app.json', offline: true });
    }
    console.error('❌ Failed to save Intune snapshot:', err.message);
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

// ── GET /api/entra/groups/prefixes ─────────────────────────────────────────
// Returns the configured INTUNE_GROUP_PREFIXES as an array.
// Must be registered BEFORE /api/entra/groups/:id routes (static path wins).
app.get('/api/entra/groups/prefixes', (req, res) => {
  const raw = process.env.INTUNE_GROUP_PREFIXES || readEnvFile()['INTUNE_GROUP_PREFIXES'] || '';
  const prefixes = raw.split(',').map(s => s.trim()).filter(Boolean);
  res.json({ prefixes });
});

// ── GET /api/entra/groups?prefix=<text>&search=<text> ──────────────────────
// Searches Entra ID groups whose displayName starts with the given prefix
// (or any configured prefix if none supplied), filtered further by optional
// search text. Returns [{ id, displayName, description }].
app.get('/api/entra/groups', async (req, res) => {
  if (!graphConfigured) {
    return res.status(501).json({ message: 'Graph not configured. Set AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET.' });
  }
  try {
    const prefix  = (req.query.prefix  || '').trim();
    const search  = (req.query.search  || '').trim();

    // Determine which prefix(es) to search
    const raw = process.env.INTUNE_GROUP_PREFIXES || readEnvFile()['INTUNE_GROUP_PREFIXES'] || '';
    const configuredPrefixes = raw.split(',').map(s => s.trim()).filter(Boolean);

    // If caller specified a prefix use it; else fan-out across all configured prefixes
    const prefixesToSearch = prefix ? [prefix] : configuredPrefixes;

    if (!prefixesToSearch.length) {
      return res.json({ groups: [] });
    }

    // Build $filter clauses — one startswith per prefix (OR-joined, up to 10)
    const filterClauses = prefixesToSearch
      .slice(0, 10)
      .map(p => `startswith(displayName,'${p.replace(/'/g, "''")}')`);
    const filter = filterClauses.join(' or ');

    // Fetch from Graph — select minimal fields, $top=100
    // NOTE: $orderby is NOT used here — it is incompatible with startswith() filters
    // when ConsistencyLevel: eventual is active. Sort client-side instead.
    const token = await getGraphToken();
    const url = `https://graph.microsoft.com/v1.0/groups?$filter=${encodeURIComponent(filter)}&$select=id,displayName,description&$top=100`;
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, ConsistencyLevel: 'eventual' },
    });
    if (!r.ok) {
      const err = await r.text().catch(() => r.statusText);
      throw new Error(`Graph ${r.status}: ${err}`);
    }
    let { value: groups = [] } = await r.json();

    // Client-side filter by additional search text (case-insensitive)
    if (search) {
      const q = search.toLowerCase();
      groups = groups.filter(g =>
        (g.displayName || '').toLowerCase().includes(q) ||
        (g.description || '').toLowerCase().includes(q)
      );
    }

    // Client-side alphabetical sort (replaces removed $orderby)
    groups.sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));

    res.json({ groups: groups.map(g => ({ id: g.id, displayName: g.displayName, description: g.description || '' })) });
  } catch (err) {
    console.error('❌ Entra group search failed:', err.message);
    res.status(err.status || 500).json({ message: err.message });
  }
});

// ── GET /api/entra/groups/:id/members/count ────────────────────────────────
// Returns the transitive member count for the given group ID.
// Uses ConsistencyLevel: eventual + $count header as required by Graph.
app.get('/api/entra/groups/:id/members/count', async (req, res) => {
  if (!graphConfigured) {
    return res.status(501).json({ message: 'Graph not configured.' });
  }
  try {
    const { id } = req.params;
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
      return res.status(400).json({ message: 'Invalid group ID format.' });
    }
    const token = await getGraphToken();
    const r = await fetch(`https://graph.microsoft.com/v1.0/groups/${id}/transitiveMembers/$count`, {
      headers: { Authorization: `Bearer ${token}`, ConsistencyLevel: 'eventual' },
    });
    if (!r.ok) {
      const err = await r.text().catch(() => r.statusText);
      throw new Error(`Graph ${r.status}: ${err}`);
    }
    const count = Number(await r.text());
    res.json({ count });
  } catch (err) {
    console.error('❌ Entra member count failed:', err.message);
    res.status(err.status || 500).json({ message: err.message });
  }
});

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
    // Fetch app detail + assignments + relationships + categories in parallel
    const [appData, assignData, relData, categoriesData] = await Promise.all([
      graphApi(`/deviceAppManagement/mobileApps/${appId}`),
      graphApi(`/deviceAppManagement/mobileApps/${appId}/assignments`),
      graphApi(`/deviceAppManagement/mobileApps/${appId}/relationships`).catch(() => ({ value: [] })),
      graphApi(`/deviceAppManagement/mobileApps/${appId}/categories`).catch(() => ({ value: [] })),
    ]);

    // Separate relationships into supersedence vs dependencies
    const relationships = relData.value || [];
    const supersedence = relationships
      .filter(r => (r['@odata.type'] || '').includes('Supersedence'))
      .map(r => ({ supersededAppId: r.targetId, supersedenceType: r.supersedenceType || 'update' }));
    const dependencies = relationships
      .filter(r => (r['@odata.type'] || '').includes('Dependency'))
      .map(r => ({ appId: r.targetId, dependencyType: r.dependencyType || 'autoInstall' }));

    // Append categories to appData so parseIntuneExport can pick it up
    appData.categories = categoriesData.value || [];

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
      supersedence,
      dependencies,
    };
    res.json(exportShape);
  } catch (err) {
    console.error(`❌ Intune app detail failed (${req.params.id}):`, err.message);
    res.status(err.status || 500).json({ message: err.message });
  }
});

// ── Graph API write helper ──────────────────────────────────────────────────
async function graphApiWrite(path, method, body) {
  const token = await getGraphToken();
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw Object.assign(new Error(`Graph ${res.status}: ${err}`), { status: res.status });
  }
  // Some Graph endpoints return 204 No Content
  if (res.status === 204) return {};
  return res.json();
}

// ── PATCH /api/intune/apps/:id — push metadata updates to Intune ────────────
app.patch('/api/intune/apps/:id', async (req, res) => {
  if (!graphConfigured) return res.status(501).json({ message: 'Intune integration not configured' });
  try {
    const appId = req.params.id;
    const updates = req.body;
    console.log(`  🔄 Pushing metadata update to Intune app ${appId}:`, Object.keys(updates));
    const result = await graphApiWrite(`/deviceAppManagement/mobileApps/${appId}`, 'PATCH', {
      '@odata.type': '#microsoft.graph.win32LobApp',
      ...updates,
    });
    // Invalidate cache since the app was updated
    appCache = null;
    res.json({ success: true, result });
  } catch (err) {
    console.error(`❌ Intune app update failed (${req.params.id}):`, err.message);
    res.status(err.status || 500).json({ message: err.message });
  }
});

// ── POST /api/intune/apps/:id/relationships — push relationship updates ─────
app.post('/api/intune/apps/:id/relationships', async (req, res) => {
  if (!graphConfigured) return res.status(501).json({ message: 'Intune integration not configured' });
  try {
    const appId = req.params.id;
    const { relationships } = req.body; // Array of relationship objects
    console.log(`  🔄 Pushing ${relationships.length} relationship(s) to Intune app ${appId}`);
    const result = await graphApiWrite(
      `/deviceAppManagement/mobileApps/${appId}/updateRelationships`,
      'POST',
      { relationships }
    );
    res.json({ success: true, result });
  } catch (err) {
    console.error(`❌ Intune relationship update failed (${req.params.id}):`, err.message);
    res.status(err.status || 500).json({ message: err.message });
  }
});

// ── POST /api/intune/apps/:id/assignments — push assignments update ──────────
app.post('/api/intune/apps/:id/assignments', async (req, res) => {
  if (!graphConfigured) return res.status(501).json({ message: 'Intune integration not configured' });
  try {
    const appId = req.params.id;
    const { assignments } = req.body; // Array of assignment objects
    console.log(`  🔄 Pushing ${assignments.length} assignment(s) to Intune app ${appId}`);
    // Graph API uses assign action for bulk assignment update
    const result = await graphApiWrite(
      `/deviceAppManagement/mobileApps/${appId}/assign`,
      'POST',
      { mobileAppAssignments: assignments }
    );
    res.json({ success: true, result });
  } catch (err) {
    console.error(`❌ Intune assignment update failed (${req.params.id}):`, err.message);
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

// ── VS Code Integration — local filesystem round-trip ───────────────────────

/**
 * DELETE /api/scaffold/:packageId — Removes the entire temp scaffold directory for a package.
 * Called before each PSADT import to ensure no stale files interfere with fresh conversions.
 */
app.delete('/api/scaffold/:packageId', (req, res) => {
  try {
    const { packageId } = req.params;
    if (!packageId) {
      return res.status(400).json({ error: 'Missing packageId' });
    }
    const scratchRoot = join(tmpdir(), 'spa-workbench', 'titles');
    const scaffoldDir = join(scratchRoot, packageId);
    if (existsSync(scaffoldDir)) {
      rmSync(scaffoldDir, { recursive: true, force: true });
      console.log(`🧹 Cleaned up scaffold directory: ${scaffoldDir}`);
      return res.json({ success: true, cleaned: true });
    }
    res.json({ success: true, cleaned: false, message: 'No scaffold directory found' });
  } catch (err) {
    console.error('❌ Scaffold cleanup failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/** 
 * POST /api/open-vscode — Writes content to local file and opens in local VS Code
 */
app.post('/api/open-vscode', express.json(), (req, res) => {
  try {
    const { packageId, relativePath, content, writeOnly } = req.body || {};
    if (!packageId || !relativePath) {
      return res.status(400).json({ error: 'Missing packageId or relativePath' });
    }

    // Resolve absolute path under local clone directory
    const absoluteDir = join(CLONE_BASE, packageId, dirname(relativePath));
    const absolutePath = join(CLONE_BASE, packageId, relativePath);

    // Write content locally
    if (content) {
      if (!existsSync(absoluteDir)) {
        mkdirSync(absoluteDir, { recursive: true });
      }
      // PowerShell on Windows requires UTF-8 with BOM for proper parsing.
      // Also normalize line endings to CRLF for Windows compatibility.
      const isPowerShell = relativePath.endsWith('.ps1');
      const BOM = '\uFEFF';
      const fileContent = isPowerShell
        ? BOM + content.replace(/\r?\n/g, '\r\n')
        : content;
      writeFileSync(absolutePath, fileContent, 'utf8');
      console.log(`💾 Saved local file: ${absolutePath}${isPowerShell ? ' (UTF-8 BOM + CRLF)' : ''}`);
    } else if (!existsSync(absolutePath)) {
      if (!existsSync(absoluteDir)) {
        mkdirSync(absoluteDir, { recursive: true });
      }
      writeFileSync(absolutePath, '# Customized script template\n', 'utf8');
      console.log(`💾 Saved default local file: ${absolutePath}`);
    }

    // writeOnly mode: just save the file without opening VS Code
    if (writeOnly) {
      return res.json({ success: true, method: 'write-only' });
    }

    console.log(`💻 Opening in VS Code: ${absolutePath}`);

    // Determine the project root (clone dir) for opening as workspace
    const projectRoot = join(CLONE_BASE, packageId);
    const hasClone = existsSync(join(projectRoot, '.git'));

    // Fallback deep link for browser (cross-platform format)
    let uriPath = (hasClone ? projectRoot : absolutePath).replace(/\\/g, '/');
    if (!uriPath.startsWith('/')) {
      uriPath = '/' + uriPath;
    }
    const vsCodeUrl = `vscode://file${uriPath}`;

    // Execute local 'code' command in background
    // If a local clone exists, open the project folder + navigate to the file
    const codeCmd = hasClone
      ? `code "${projectRoot}" -g "${absolutePath}"`
      : `code "${absolutePath}"`;
    exec(codeCmd, (err) => {
      if (err) {
        console.warn('⚠️ code CLI command failed (might not be in PATH). Falling back to vscode:// URL protocol.', err.message);
        return res.json({ success: true, method: 'protocol', url: vsCodeUrl });
      }
      res.json({ success: true, method: 'cli', url: vsCodeUrl });
    });
  } catch (err) {
    console.error('❌ VS Code open failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/read-local-file — Reads content from local title file
 */
app.get('/api/read-local-file', (req, res) => {
  try {
    // Prevent browser caching of local files (critical for VS Code sync)
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    const { packageId, relativePath } = req.query || {};
    if (!packageId || !relativePath) {
      return res.status(400).json({ error: 'Missing packageId or relativePath' });
    }

    // Read from local clone directory (matches where /api/open-vscode writes)
    const absolutePath = join(CLONE_BASE, packageId, relativePath);

    if (!existsSync(absolutePath)) {
      return res.status(404).json({ error: `Local file not found at ${absolutePath}` });
    }

    let content = readFileSync(absolutePath, 'utf8');
    // Strip UTF-8 BOM and normalize CRLF→LF for browser consumption
    content = content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
    res.json({ content });
  } catch (err) {
    console.error('❌ Local file read failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    gitlab: GITLAB_URL,
    hasToken: !!GITLAB_TOKEN,
    intune: graphConfigured,
    gitLabGroup: GITLAB_DEFAULT_GROUP,
    gitLabWinGroup: GITLAB_WIN_GROUP,
    gitLabMacGroup: GITLAB_MAC_GROUP,
    gitLabCiTemplatesProject: GITLAB_CI_TEMPLATES_PROJECT,
  });
});

// ── Settings API ─────────────────────────────────────────────────────────────
const ENV_PATH = join(__dirname, '.env');
const SENSITIVE_KEYS = new Set(['GITLAB_TOKEN', 'AZURE_CLIENT_SECRET']);
const ALLOWED_KEYS = new Set([
  'GITLAB_URL', 'GITLAB_TOKEN', 'GITLAB_DEFAULT_GROUP',
  'GITLAB_WIN_GROUP', 'GITLAB_MAC_GROUP', 'GITLAB_CI_TEMPLATES_PROJECT',
  'AZURE_TENANT_ID', 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET',
  'INTUNE_GROUP_PREFIXES',
  'PORT',
]);

/** Read .env file and parse into key/value map */
function readEnvFile() {
  if (!existsSync(ENV_PATH)) return {};
  const lines = readFileSync(ENV_PATH, 'utf8').split('\n');
  const result = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    result[key] = val;
  }
  return result;
}

/** Write key/value map back to .env file, preserving comments */
function writeEnvFile(updates) {
  const existing = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, 'utf8') : '';
  const lines = existing.split('\n');
  const written = new Set();

  const newLines = lines.map(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return line;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 1) return line;
    const key = trimmed.slice(0, eqIdx).trim();
    if (key in updates) {
      written.add(key);
      return `${key}=${updates[key]}`;
    }
    return line;
  });

  // Append any new keys not previously in file
  for (const [key, val] of Object.entries(updates)) {
    if (!written.has(key)) {
      newLines.push(`${key}=${val}`);
    }
  }

  writeFileSync(ENV_PATH, newLines.join('\n'), 'utf8');
}

/** GET /api/settings — return current config values (secrets masked) */
app.get('/api/settings', (req, res) => {
  try {
    const envVals = readEnvFile();
    const result = {};
    for (const key of ALLOWED_KEYS) {
      if (SENSITIVE_KEYS.has(key)) {
        // Return a sentinel so the UI knows it is set, without exposing value
        result[key] = envVals[key] ? '__SET__' : '';
      } else {
        result[key] = envVals[key] || process.env[key] || '';
      }
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: `Failed to read settings: ${err.message}` });
  }
});

/** POST /api/settings — update .env file with provided key/value pairs */
app.post('/api/settings', (req, res) => {
  try {
    const body = req.body || {};
    const updates = {};
    for (const [key, val] of Object.entries(body)) {
      if (!ALLOWED_KEYS.has(key)) continue; // ignore unknown keys
      // Skip sentinel values — those mean the user didn't change the secret
      if (val === '__SET__') continue;
      updates[key] = String(val);
    }
    writeEnvFile(updates);
    console.log('⚙️  Settings updated via API. Restart server to apply.');
    res.json({ ok: true, message: 'Settings saved. Server restart required for changes to take effect.', restartRequired: true });
  } catch (err) {
    res.status(500).json({ message: `Failed to write settings: ${err.message}` });
  }
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

// ─────────────────────────────────────────────────────────────────────────────
//  macOS .pkg (XAR archive) — pure Node.js parser, no pkgutil required
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract metadata from a flat macOS .pkg file (XAR format).
 * XAR: 28-byte header → zlib-compressed TOC XML → heap of files.
 */
function extractPkgMetadata(filePath) {
  const buf = readFileSync(filePath);
  if (buf.length < 28) throw new Error('File too small to be a .pkg');

  // 1. Validate XAR magic ('xar!' = 0x78617221)
  const magic = buf.readUInt32BE(0);
  if (magic !== 0x78617221) throw new Error('Not a valid .pkg file (expected XAR magic)');

  const headerSize    = buf.readUInt16BE(4);
  const tocSizeHigh   = buf.readUInt32BE(8);
  const tocSizeLow    = buf.readUInt32BE(12);
  const tocCompressed = tocSizeHigh * 0x100000000 + tocSizeLow;

  // 2. Decompress the TOC (plain zlib deflate)
  const tocBuf = buf.slice(headerSize, headerSize + tocCompressed);
  let tocXml;
  try { tocXml = zlib.inflateSync(tocBuf).toString('utf8'); }
  catch { tocXml = zlib.gunzipSync(tocBuf).toString('utf8'); }

  const heapStart = headerSize + tocCompressed;

  // 3. Parse TOC to find Distribution or PackageInfo file entries
  const fileBlocks = [];
  const fileRe = /<file[^>]*>([\s\S]*?)<\/file>/g;
  let fm;
  while ((fm = fileRe.exec(tocXml)) !== null) {
    const blk  = fm[1];
    const nameM = blk.match(/<name>([^<]+)<\/name>/);
    const offM  = blk.match(/<offset>(\d+)<\/offset>/);
    const lenM  = blk.match(/<length>(\d+)<\/length>/);
    const encM  = blk.match(/style="([^"]+)"/);
    if (!nameM) continue;
    fileBlocks.push({
      name:     nameM[1].trim(),
      offset:   offM ? parseInt(offM[1]) : 0,
      length:   lenM ? parseInt(lenM[1]) : 0,
      encoding: encM ? encM[1] : 'application/octet-stream',
    });
  }

  const target =
    fileBlocks.find(f => f.name === 'Distribution') ||
    fileBlocks.find(f => f.name === 'PackageInfo')  ||
    fileBlocks.find(f => f.name.toLowerCase().endsWith('.xml'));

  if (!target) throw new Error('No Distribution or PackageInfo found inside .pkg');

  // 4. Read and decompress the target file from the heap
  const slice = buf.slice(heapStart + target.offset, heapStart + target.offset + target.length);
  let xml;
  try {
    if (target.encoding === 'application/x-gzip')  xml = zlib.gunzipSync(slice).toString('utf8');
    else if (target.encoding === 'application/zlib') xml = zlib.inflateSync(slice).toString('utf8');
    else xml = slice.toString('utf8');
  } catch { xml = slice.toString('utf8'); }

  return parsePkgXml(xml);
}

/** Parse Distribution or PackageInfo XML to extract installer metadata */
function parsePkgXml(xml) {
  const result = {};

  // <title>App Name</title>
  const titleM = xml.match(/<title>([^<]+)<\/title>/i);
  if (titleM) result.name = titleM[1].trim();

  // <pkg-ref id="com.vendor.App" version="1.2.3">  (Distribution XML)
  const pkgRefBoth = xml.match(/<pkg-ref[^>]+\bid="([^"]+)"[^>]+\bversion="([^"]+)"/);
  if (pkgRefBoth) { result.bundleId = pkgRefBoth[1]; result.version = pkgRefBoth[2]; }
  else {
    const idM  = xml.match(/<pkg-ref[^>]+\bid="([^"]+)"/);
    const verM = xml.match(/<pkg-ref[^>]+\bversion="([^"]+)"/);
    if (idM)  result.bundleId = idM[1];
    if (verM) result.version  = verM[1];
  }

  // <pkg-info identifier="..." version="...">  (PackageInfo XML)
  const pkgInfoM = xml.match(/<pkg-info[^>]+\bidentifier="([^"]+)"[^>]*\bversion="([^"]+)"/);
  if (pkgInfoM) {
    result.bundleId = result.bundleId || pkgInfoM[1];
    result.version  = result.version  || pkgInfoM[2];
  }

  // Fallback: CFBundle keys in embedded plist
  if (!result.bundleId) {
    const m = xml.match(/CFBundleIdentifier[\s\S]{0,40}?<string>([^<]+)<\/string>/i);
    if (m) result.bundleId = m[1].trim();
  }
  if (!result.version) {
    const m = xml.match(/CFBundleShortVersionString[\s\S]{0,40}?<string>([^<]+)<\/string>/i);
    if (m) result.version = m[1].trim();
  }

  // receiptId == bundleId for pkgutil lookups
  if (result.bundleId) result.receiptId = result.bundleId;
  return result;
}

/** POST /api/pkg-info-path — extract macOS .pkg metadata from a local path (no pkgutil) */
app.post('/api/pkg-info-path', express.json(), (req, res) => {
  try {
    const { path: filePath } = req.body || {};
    if (!filePath) return res.status(400).json({ error: 'path is required' });
    if (!existsSync(filePath)) return res.status(404).json({ error: `File not found: ${filePath}` });
    const ext = filePath.split('.').pop().toLowerCase();
    if (ext !== 'pkg' && ext !== 'mpkg') {
      return res.status(400).json({ error: 'Only .pkg and .mpkg files are supported' });
    }
    const meta = extractPkgMetadata(filePath);
    meta.fileName = filePath.split(/[/\\]/).pop();
    res.json(meta);
  } catch (err) {
    console.error('PKG path parse error:', err);
    res.status(500).json({ error: `Failed to parse PKG: ${err.message}` });
  }
});

/**
 * POST /api/read-local-file
 * Reads a file at a server-local path and returns it as a base64 data URL.
 * Used by MacInstallerStep to "stage" the installer binary for inclusion
 * in the GitLab publish commit as macos/src/Files/<filename>.
 *
 * Body: { path: string }
 * Returns: { dataUrl: string, fileName: string, sizeBytes: number }
 */
app.post('/api/read-local-file', express.json(), (req, res) => {
  try {
    const { path: filePath } = req.body || {};
    if (!filePath) return res.status(400).json({ error: 'path is required' });
    if (!existsSync(filePath)) return res.status(404).json({ error: `File not found: ${filePath}` });

    const stat = statSync(filePath);
    const MAX_BYTES = 500 * 1024 * 1024; // 500 MB guard
    if (stat.size > MAX_BYTES) {
      return res.status(413).json({ error: `File is too large (${(stat.size / 1024 / 1024).toFixed(0)} MB). Maximum is 500 MB.` });
    }

    const ext = filePath.split('.').pop().toLowerCase();
    const mimeMap = { pkg: 'application/octet-stream', dmg: 'application/octet-stream', mpkg: 'application/octet-stream' };
    const mime = mimeMap[ext] || 'application/octet-stream';

    const buf = readFileSync(filePath);
    const base64 = buf.toString('base64');
    const dataUrl = `data:${mime};base64,${base64}`;
    const fileName = filePath.split(/[/\\]/).pop();

    console.log(`  📦 Staged installer: ${fileName} (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
    res.json({ dataUrl, fileName, sizeBytes: stat.size });
  } catch (err) {
    console.error('read-local-file error:', err);
    res.status(500).json({ error: `Failed to read file: ${err.message}` });
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
