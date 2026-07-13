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
 * Streaming version of publishToGitLab.
 * Calls /api/publish/stream and fires onProgress for each step.
 *
 * @param {Object} params — same as publishToGitLab
 * @param {function} onProgress — called with { step, message, status } for each event
 * @returns {Promise<Object>} — resolves with the final result payload on success
 */
export async function publishToGitLabStreamed({ packageId, gitLabGroup, category, displayName, version, files, pipelineAction = 'none', editProjectPath }, onProgress) {
  const res = await fetch('/api/publish/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ packageId, gitLabGroup, category, displayName, version, files, pipelineAction, editProjectPath }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || `Publish failed (HTTP ${res.status})`);
  }

  return new Promise((resolve, reject) => {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    const pump = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // SSE lines are separated by \n\n; each line is "data: <json>"
          const lines = buffer.split('\n\n');
          buffer = lines.pop(); // keep incomplete chunk

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const event = JSON.parse(line.slice(6));
              if (event.step === 'result') {
                if (event.status === 'ok') {
                  onProgress?.({ step: 'done', message: 'Complete', status: 'ok' });
                  resolve(event.result);
                } else {
                  reject(new Error(event.message || 'Publish failed'));
                }
              } else {
                onProgress?.(event);
                if (event.status === 'error') {
                  reject(new Error(event.message || 'Publish failed'));
                }
              }
            } catch { /* malformed event — skip */ }
          }
        }
      } catch (err) {
        reject(err);
      }
    };

    pump();
  });
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
