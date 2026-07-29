/**
 * preflightApi.js
 * Client-side wrapper for calling the backend proxy endpoints for Mac pre-flight checks.
 */

export async function checkAppStore(term) {
  if (!term) return { results: [] };
  const res = await fetch(`/api/appstore/search?term=${encodeURIComponent(term)}`);
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `App Store search failed with status ${res.status}`);
  }
  return await res.json();
}

export async function checkJamfPackage(name) {
  if (!name) return { results: [] };
  const res = await fetch(`/api/jamf/packages?name=${encodeURIComponent(name)}`);
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Jamf package lookup failed with status ${res.status}`);
  }
  return await res.json();
}
