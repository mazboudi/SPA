/**
 * gitlabPublish.js — Client-side wrapper for the SPA Publish API
 *
 * Sends scaffolded files to the backend publish endpoint,
 * which handles GitLab project creation or MR creation.
 */

/**
 * Publish scaffolded files to GitLab via the backend API.
 *
 * @param {Object} params
 * @param {string} params.packageId   — kebab-case slug (e.g. "7-zip")
 * @param {string} params.gitLabGroup — root group path
 * @param {string} params.category    — app category for subgroup
 * @param {string} params.displayName — human-readable app name
 * @param {string} params.version     — app version for tag (e.g. "4.8.1")
 * @param {Object} params.files       — { relativePath: content } map
 * @param {string} [params.pipelineAction='none'] — 'none' | 'build' | 'publish' | 'assign' | 'deploy'
 * @returns {Promise<{
 *   action: 'created' | 'updated',
 *   projectUrl: string,
 *   tagName: string,
 *   tagUrl?: string,
 *   pipelineUrl?: string,
 *   pipelineAction: string,
 *   webIdeUrl: string,
 *   vsCodeUrl: string,
 * }>}
 */
export async function publishToGitLab({ packageId, gitLabGroup, category, displayName, version, files, pipelineAction = 'none' }) {
  const res = await fetch('/api/publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ packageId, gitLabGroup, category, displayName, version, files, pipelineAction }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || `Publish failed (HTTP ${res.status})`);
  }

  return res.json();
}

/**
 * Check if the publish API is reachable.
 * @returns {Promise<boolean>}
 */
export async function checkPublishHealth() {
  try {
    const res = await fetch('/api/health');
    if (!res.ok) return false;
    const data = await res.json();
    return data.status === 'ok' && data.hasToken;
  } catch {
    return false;
  }
}
