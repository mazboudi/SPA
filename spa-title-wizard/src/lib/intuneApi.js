/**
 * intuneApi.js — Client-side wrapper for the Intune Graph API endpoints.
 */

/**
 * Fetch the cached catalog of Win32 apps from Intune.
 * @returns {Promise<{ apps: Array, cachedAt: number, count: number }>}
 */
export async function fetchIntuneCatalog() {
  const res = await fetch('/api/intune/apps');
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || `Failed to load Intune catalog (HTTP ${res.status})`);
  }
  return res.json();
}

/**
 * Fetch full app detail for a specific Win32 app.
 * Returns data shaped like an Intune export JSON (compatible with parseIntuneExport).
 * @param {string} appId
 * @returns {Promise<Object>}
 */
export async function fetchIntuneAppDetail(appId) {
  const res = await fetch(`/api/intune/apps/${encodeURIComponent(appId)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || `Failed to fetch app detail (HTTP ${res.status})`);
  }
  return res.json();
}

/**
 * Clear the server-side cache and re-fetch the full app list from Intune.
 * @returns {Promise<{ apps: Array, cachedAt: number, count: number }>}
 */
export async function refreshIntuneCatalog() {
  const res = await fetch('/api/intune/refresh', { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || `Failed to refresh catalog (HTTP ${res.status})`);
  }
  return res.json();
}
