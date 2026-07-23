import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import generateScaffolding from '../../lib/generateScaffolding';
import { validateGeneratedFiles } from '../../lib/validateSchemas';
import { publishToGitLab, publishToGitLabStreamed, checkPublishHealth } from '../../lib/gitlabPublish';
import { pushIntuneMetadata } from '../../lib/intuneApi';
import FileTreePreview from '../FileTreePreview';
import CodePreview from '../ui/CodePreview';

// ── Pipeline Tracker Component ────────────────────────────────────────────
const JOB_STATUS_META = {
  created: { icon: '⬜', color: 'var(--text-muted)', label: 'Created' },
  pending: { icon: '🟡', color: '#f59e0b', label: 'Pending' },
  running: { icon: '🔵', color: '#60a5fa', label: 'Running' },
  success: { icon: '🟢', color: '#34d399', label: 'Success' },
  failed: { icon: '🔴', color: '#f87171', label: 'Failed' },
  canceled: { icon: '⚫', color: 'var(--text-muted)', label: 'Canceled' },
  skipped: { icon: '⬜', color: 'var(--text-muted)', label: 'Skipped' },
  manual: { icon: '⚙️', color: '#a78bfa', label: 'Manual' },
};

const PIPELINE_STATUS_META = {
  pending: { icon: '🟡', label: 'Pending', color: '#f59e0b' },
  running: { icon: '⏳', label: 'Running', color: '#60a5fa' },
  success: { icon: '✅', label: 'Succeeded', color: '#34d399' },
  failed: { icon: '❌', label: 'Failed', color: '#f87171' },
  canceled: { icon: '⛔', label: 'Canceled', color: '#9ca3af' },
};

function PipelineTracker({ pipelineStatus, polling, pipelineUrl, projectId, pipelineId, onDownloadArtifact }) {
  const overall = PIPELINE_STATUS_META[pipelineStatus?.status] || PIPELINE_STATUS_META.pending;

  // Group jobs by stage for display
  const stages = useMemo(() => {
    if (!pipelineStatus?.jobs) return [];
    const map = {};
    for (const job of pipelineStatus.jobs) {
      if (!map[job.stage]) map[job.stage] = [];
      map[job.stage].push(job);
    }
    return Object.entries(map).map(([stage, jobs]) => ({ stage, jobs }));
  }, [pipelineStatus?.jobs]);

  return (
    <div className="pipeline-tracker">
      <div className="pipeline-tracker__header">
        <span className="pipeline-tracker__status-icon">{overall.icon}</span>
        <span className="pipeline-tracker__label" style={{ color: overall.color }}>
          Pipeline {overall.label}
        </span>
        {polling && (
          <span className="pipeline-tracker__polling">
            <span className="pipeline-spinner" /> Live
          </span>
        )}
        {pipelineUrl && (
          <a href={pipelineUrl} target="_blank" rel="noreferrer" className="pipeline-tracker__link">
            Open in GitLab →
          </a>
        )}
      </div>

      {/* Stage grid */}
      {stages.length > 0 ? (
        <div className="pipeline-stages">
          {stages.map(({ stage, jobs }) => (
            <div key={stage} className="pipeline-stage">
              <div className="pipeline-stage__name">{stage}</div>
              <div className="pipeline-stage__jobs">
                {jobs.map(job => {
                  const meta = JOB_STATUS_META[job.status] || JOB_STATUS_META.created;
                  return (
                    <div key={job.id} className={`pipeline-job pipeline-job--${job.status}`} title={`${job.name}: ${meta.label}`}>
                      <span className="pipeline-job__icon">{meta.icon}</span>
                      <span className="pipeline-job__name">{job.name}</span>
                      <span className="pipeline-job__status">{meta.label}</span>
                      {/* Only show artifact download for build-stage jobs */}
                      {job.stage === 'build' && job.artifactsAvailable && job.status === 'success' && (
                        <button
                          className="pipeline-job__download"
                          onClick={() => onDownloadArtifact(projectId, pipelineId, job.name)}
                          title={`Download build artifacts for ${job.name}`}
                        >
                          ⬇️ Download
                        </button>
                      )}
                      {job.webUrl && (
                        <a href={job.webUrl} target="_blank" rel="noreferrer" className="pipeline-job__link">
                          View log →
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="pipeline-tracker__placeholder">
          {polling ? 'Fetching pipeline stages…' : 'Waiting for jobs to appear…'}
        </div>
      )}

      {/* Download build artifacts — only shown when a build-stage job has artifacts */}
      {(() => {
        const buildJob = pipelineStatus?.jobs?.find(
          j => j.stage === 'build' && j.artifactsAvailable && j.status === 'success'
        );
        return buildJob ? (
          <button
            className="btn btn-secondary btn-sm pipeline-tracker__dl-all"
            onClick={() => onDownloadArtifact(projectId, pipelineId, buildJob.name)}
            title={`Download artifacts from the build stage (${buildJob.name})`}
          >
            ⬇️ Download Build Artifacts
          </button>
        ) : null;
      })()}
    </div>
  );
}

export default function ReviewStep({ state, updateField, allStepsValid = true, markClean }) {
  const files = useMemo(() => generateScaffolding(state), [state]);
  const filePaths = Object.keys(files).sort();
  const [selectedFile, setSelectedFile] = useState(filePaths[0] || '');

  // Publish state
  const [publishing, setPublishing] = useState(false);
  const [publishPhase, setPublishPhase] = useState('');
  const [publishError, setPublishError] = useState(null);
  const [publishLog, setPublishLog] = useState([]); // live activity entries
  const [apiAvailable, setApiAvailable] = useState(null);
  const [pipelineAction, setPipelineAction] = useState('none');

  // Live pipeline tracking state
  const [pipelineStatus, setPipelineStatus] = useState(null);  // { status, jobs, webUrl }
  const [pipelinePolling, setPipelinePolling] = useState(false);
  const pipelineTimerRef = useRef(null);

  // Intune mandatory field validation — blocks Build+Publish and Build+Publish+Assign
  const intuneReady = useMemo(() => {
    const intuneAppName = state.intuneAppName || `${state.displayName || ''} ${state.version || ''}`.trim().replace(/\s+/g, ' ');
    if (!intuneAppName) return false;
    if (!(state.appDescription || '').trim()) return false;
    if (!(state.publisher || '').trim()) return false;
    const detRules = state.detectionRules || [];
    if (state.detectionMethod === 'script') {
      if (!(state.scriptContent || '').trim()) return false;
    } else {
      if (detRules.length === 0) return false;
    }
    return true;
  }, [state.intuneAppName, state.displayName, state.version, state.appDescription, state.publisher, state.detectionRules, state.detectionMethod, state.scriptContent]);

  // Auto-reset pipeline action if the current selection is no longer valid
  useEffect(() => {
    // If intune fields are missing, drop back from publish/assign to build
    if (!intuneReady && (pipelineAction === 'publish' || pipelineAction === 'assign')) {
      setPipelineAction('build');
    }
    // If required fields across ALL steps are missing, drop any pipeline action back to 'none'
    if (!allStepsValid && pipelineAction !== 'none') {
      setPipelineAction('none');
    }
  }, [intuneReady, allStepsValid, pipelineAction]);

  // Persist publish result in wizard state so it survives navigation
  const publishResult = state._lastPublishResult || null;
  const setPublishResult = (result) => updateField('_lastPublishResult', result);

  // Check if publish API is reachable on mount
  useEffect(() => { checkPublishHealth().then(setApiAvailable); }, []);

  const handlePublish = async () => {
    setPublishing(true);
    setPublishError(null);
    setPublishResult(null);
    setPipelineStatus(null);
    setPublishLog([]);
    if (pipelineTimerRef.current) clearInterval(pipelineTimerRef.current);
    try {
      const result = await publishToGitLabStreamed(
        {
          packageId: state.packageId,
          gitLabGroup: state.gitLabGroup,
          category: state.category,
          displayName: state.displayName,
          version: state.version,
          files,
          pipelineAction,
          // In Edit/Clone mode, pass the exact project path so the server can
          // find the project by path_with_namespace rather than a group search.
          // This fixes "Not Found" when the project lives in a different group.
          editProjectPath: state._editProjectPath || undefined,
        },
        (event) => {
          setPublishPhase(event.message);
          setPublishLog(prev => {
            // Update last entry if same step, otherwise append
            if (prev.length > 0 && prev[prev.length - 1].step === event.step) {
              return [...prev.slice(0, -1), event];
            }
            return [...prev, event];
          });
        }
      );
      setPublishResult(result);
      if (markClean) markClean();
      if (result.pipelineId && result.projectId) {
        startPipelinePolling(result.projectId, result.pipelineId);
      }
    } catch (err) {
      setPublishError(err.message);
      setPublishLog(prev => [...prev, { step: 'error', message: err.message, status: 'error' }]);
    } finally {
      setPublishing(false);
      setPublishPhase('');
    }
  };

  // ── Pipeline status polling ─────────────────────────────────────────────
  const TERMINAL_STATUSES = new Set(['success', 'failed', 'canceled', 'skipped']);

  const fetchPipelineStatus = useCallback(async (projectId, pipelineId) => {
    try {
      const res = await fetch(`/api/pipeline/${projectId}/${pipelineId}/status`);
      if (!res.ok) return;
      const data = await res.json();
      setPipelineStatus(data);
      return data.status;
    } catch (e) {
      console.warn('[PipelinePoller] fetch failed:', e);
    }
  }, []);

  const startPipelinePolling = useCallback((projectId, pipelineId) => {
    setPipelinePolling(true);
    // Immediate first fetch
    fetchPipelineStatus(projectId, pipelineId);
    // Then poll every 8 seconds
    pipelineTimerRef.current = setInterval(async () => {
      const status = await fetchPipelineStatus(projectId, pipelineId);
      if (TERMINAL_STATUSES.has(status)) {
        clearInterval(pipelineTimerRef.current);
        setPipelinePolling(false);
      }
    }, 8000);
  }, [fetchPipelineStatus]);

  // Cleanup polling on unmount
  useEffect(() => () => { if (pipelineTimerRef.current) clearInterval(pipelineTimerRef.current); }, []);

  // Resume polling if navigating back to review with an in-flight pipeline
  useEffect(() => {
    const result = state._lastPublishResult;
    if (result?.pipelineId && result?.projectId && !pipelineStatus && !pipelinePolling) {
      startPipelinePolling(result.projectId, result.pipelineId);
    }
  }, []); // run once on mount

  const handleDownloadArtifact = async (projectId, pipelineId, jobName) => {
    try {
      const params = jobName ? `?jobName=${encodeURIComponent(jobName)}` : '';
      const res = await fetch(`/api/pipeline/${projectId}/${pipelineId}/artifacts${params}`);
      const data = await res.json();
      if (!res.ok) { alert(`Artifact download error: ${data.message}`); return; }

      // Determine a safe filename — always ensure it ends with .zip
      let filename = data.filename || (jobName ? `${jobName}-artifacts.zip` : 'artifacts.zip');
      if (!filename.endsWith('.zip')) filename += '.zip';

      // Fetch the binary through the server proxy so we can force the correct
      // filename via a synthetic <a download> click. window.open() loses the
      // filename because the browser ignores Content-Disposition on cross-origin
      // redirects and on blob: URLs opened in new tabs.
      const fileRes = await fetch(data.url);
      if (!fileRes.ok) { alert(`Artifact download failed (HTTP ${fileRes.status})`); return; }
      const blob = await fileRes.blob();
      const blobUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = blobUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      // Release object URL after a short delay to let the download start
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
    } catch (e) {
      alert(`Failed to download artifact: ${e.message}`);
    }
  };


  // Schema validation
  const validationResults = useMemo(() => validateGeneratedFiles(files), [files]);
  const allValid = validationResults.length > 0 && validationResults.every(r => r.valid);
  const hasErrors = validationResults.some(r => !r.valid);

  // ── Push to Intune state ────────────────────────────────────────────────
  const [pushPushing, setPushPushing] = useState(false);
  const [pushError, setPushError] = useState(null);
  const [pushSuccess, setPushSuccess] = useState(false);
  const [pushConfirm, setPushConfirm] = useState(false);

  // Maps compareIntuneState field key → wizard state key (for reading current builder value)
  const FIELD_TO_STATE_KEY = {
    displayName: 'intuneAppName',
    description: 'appDescription',
    publisher: 'publisher',
    owner: 'appOwner',
    developer: 'appDeveloper',
    informationUrl: 'informationUrl',
    privacyUrl: 'privacyUrl',
    notes: 'appNotes',
    isFeatured: 'isFeatured',
    allowAvailableUninstall: 'allowAvailableUninstall',
    logoDataUrl: 'logoDataUrl',
    minWinRelease: 'minWinRelease',
    minDiskSpaceMB: 'minDiskSpaceMB',
    minMemoryMB: 'minMemoryMB',
    minCpuSpeedMHz: 'minCpuSpeedMHz',
    minProcessors: 'minLogicalProcessors',
  };

  // Maps compareIntuneState field key → human label
  const FIELD_LABEL = {
    displayName: 'Display Name',
    description: 'Description',
    publisher: 'Publisher',
    owner: 'Owner',
    developer: 'Developer',
    informationUrl: 'Information URL',
    privacyUrl: 'Privacy URL',
    notes: 'Notes',
    isFeatured: 'Featured',
    allowAvailableUninstall: 'Allow Uninstall',
    logoDataUrl: 'Logo',
    minWinRelease: 'Min Windows Release',
    minDiskSpaceMB: 'Min Disk Space (MB)',
    minMemoryMB: 'Min Memory (MB)',
    minCpuSpeedMHz: 'Min CPU Speed (MHz)',
    minProcessors: 'Min Processors',
  };

  // Maps compareIntuneState field key → Graph API property (for PATCH payload)
  const GRAPH_FIELD_MAP = {
    displayName: 'displayName',
    description: 'description',
    publisher: 'publisher',
    owner: 'owner',
    developer: 'developer',
    informationUrl: 'informationUrl',
    privacyUrl: 'privacyInformationUrl',
    notes: 'notes',
    isFeatured: 'isFeatured',
    allowAvailableUninstall: 'allowAvailableUninstall',
    minWinRelease: 'minimumSupportedWindowsRelease',
    minDiskSpaceMB: 'minimumFreeDiskSpaceInMB',
    minMemoryMB: 'minimumMemoryInMB',
    minCpuSpeedMHz: 'minimumCpuSpeedInMHz',
    minProcessors: 'minimumNumberOfProcessors',
  };

  // Derive push preview from syncPendingFields (fields explicitly pulled in Sync tab)
  // This is the ONLY source of truth for what gets pushed — NOT a re-comparison.
  const pushDiffs = useMemo(() => {
    const pending = state.syncPendingFields || [];
    if (!state.syncIntuneAppId || pending.length === 0) return [];
    return pending
      .filter(field => GRAPH_FIELD_MAP[field] || field === 'logoDataUrl')
      .map(field => ({
        field,
        label: FIELD_LABEL[field] || field,
        value: state[FIELD_TO_STATE_KEY[field] ?? field],
        graphKey: GRAPH_FIELD_MAP[field],
      }))
      .filter(item => item.value !== undefined);
  }, [state.syncPendingFields, state.syncIntuneAppId,
  state.intuneAppName, state.appDescription, state.publisher,
  state.appOwner, state.appDeveloper, state.informationUrl, state.privacyUrl,
  state.appNotes, state.isFeatured, state.allowAvailableUninstall,
  state.logoDataUrl, state.minWinRelease, state.minDiskSpaceMB,
  state.minMemoryMB, state.minCpuSpeedMHz, state.minLogicalProcessors]);

  const handlePushToIntune = useCallback(async () => {
    if (!pushDiffs || pushDiffs.length === 0) return;
    setPushPushing(true);
    setPushError(null);
    setPushSuccess(false);
    try {
      // Build PATCH payload from pulled fields
      const updates = {};
      for (const item of pushDiffs) {
        if (item.graphKey && item.field !== 'logoDataUrl') {
          updates[item.graphKey] = item.value;
        }
      }
      if (Object.keys(updates).length > 0) {
        await pushIntuneMetadata(state.syncIntuneAppId, updates);
      }

      // After successful push, clear the pending fields
      updateField('syncPendingFields', []);



      // Also commit files to GitLab WITHOUT triggering pipeline
      try {
        await publishToGitLab({
          packageId: state.packageId,
          gitLabGroup: state.gitLabGroup,
          category: state.category,
          displayName: state.displayName,
          version: state.version,
          files,
          pipelineAction: 'none', // don't trigger pipeline
        });
      } catch (gitErr) {
        console.warn('GitLab commit after push failed:', gitErr.message);
        // Non-fatal — Intune push succeeded
      }

      setPushSuccess(true);
      setPushConfirm(false);
      // Refresh the diff
      // syncPendingFields was cleared by updateField above — no refresh needed
    } catch (err) {
      setPushError(err.message);
    } finally {
      setPushPushing(false);
    }
  }, [pushDiffs, state, files, updateField]);


  return (
    <div className="step-content animate-in">
      <div className="step-header">
        <h2>🚀 Review & Export</h2>
        <p>Review the generated scaffolding files and export them.</p>
      </div>

      {/* Summary cards */}
      <div className="review-summary">
        <div className="summary-card">
          <span className="summary-card__icon">📦</span>
          <div>
            <div className="summary-card__label">Package</div>
            <div className="summary-card__value">{state.displayName} {state.version}</div>
          </div>
        </div>
        <div className="summary-card">
          <span className="summary-card__icon">🏢</span>
          <div>
            <div className="summary-card__label">Publisher</div>
            <div className="summary-card__value">{state.publisher}</div>
          </div>
        </div>
        <div className="summary-card">
          <span className="summary-card__icon">🖥️</span>
          <div>
            <div className="summary-card__label">Platform</div>
            <div className="summary-card__value">{state.platform === 'both' ? 'Windows + macOS' : state.platform === 'windows' ? 'Windows' : 'macOS'}</div>
          </div>
        </div>
        <div className="summary-card">
          <span className="summary-card__icon">📄</span>
          <div>
            <div className="summary-card__label">Files</div>
            <div className="summary-card__value">{filePaths.length} files</div>
          </div>
        </div>
      </div>


      {/* Publish to GitLab */}
      <div className="publish-section">
        <h3 className="publish-section__title">{state.wizardMode === 'edit' ? '✏️ Update on GitLab' : '🚀 Publish to GitLab'}</h3>
        {state.wizardMode === 'edit' && state._editProjectUrl && (
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 'var(--space-sm)', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            Source: <a href={state._editProjectUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--text-accent)' }}>{state._editProjectPath}</a>
            {state._editLoadedRef && (
              <code style={{
                fontSize: '0.72rem',
                padding: '2px 8px',
                borderRadius: '99px',
                background: state._editLoadedRef.startsWith('v') ? 'rgba(124,138,255,0.12)' : 'rgba(52,211,153,0.12)',
                color: state._editLoadedRef.startsWith('v') ? '#a78bfa' : '#34d399',
              }}>
                {state._editLoadedRef.startsWith('v') ? '🏷️' : '📌'} Loaded from {state._editLoadedRef}
              </code>
            )}
          </p>
        )}
        <p className="publish-section__path">
          <code>{state.gitLabGroup}/{state.packageId}</code>
        </p>


        {/* ── Publish result / error — shown above the options when present ── */}
        {publishResult && (
          <div className="publish-result publish-result--success">
            <div className="publish-result__header">
              <span className="publish-result__icon">✅</span>
              <strong>{publishResult.action === 'created' ? 'Project Created' : 'Project Updated'}</strong>
              {publishResult.tagName && <code className="publish-tag">🏷️ {publishResult.tagName}</code>}
            </div>

            {/* Pipeline tracker — shown whenever a pipeline was triggered */}
            {publishResult.pipelineId ? (
              <PipelineTracker
                pipelineStatus={pipelineStatus}
                polling={pipelinePolling}
                pipelineUrl={publishResult.pipelineUrl}
                projectId={publishResult.projectId}
                pipelineId={publishResult.pipelineId}
                onDownloadArtifact={handleDownloadArtifact}
              />
            ) : (
              <div className="publish-result__pipeline publish-result__pipeline--skip">
                ⏸️ Committed to GitLab — no pipeline triggered
              </div>
            )}

            <div className="publish-result__links">
              <a href={publishResult.projectUrl} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">🔗 Open Project</a>
              {publishResult.tagUrl && <a href={publishResult.tagUrl} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">🏷️ View Tag</a>}

              <button className="btn btn-secondary btn-sm" onClick={async () => {
                try {
                  const resp = await fetch('/api/open-vscode', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      packageId: state.packageId,
                      relativePath: 'windows/src/Invoke-AppDeployToolkit.ps1',
                      writeOnly: false,
                    })
                  });
                  const data = await resp.json();
                  if (data.method === 'protocol' && data.url) {
                    window.location.href = data.url;
                  }
                } catch {
                  const fallbackPath = (state._localRepoPath || '').replace(/\\/g, '/');
                  const prefix = fallbackPath.startsWith('/') ? '' : '/';
                  window.location.href = `vscode://file${prefix}${fallbackPath}`;
                }
              }}>🖥️ Open in VS Code</button>
            </div>
          </div>
        )}

        {publishError && !publishResult && (
          <div className="publish-result publish-result--error">
            <span className="publish-result__icon">❌</span>
            <span>{publishError}</span>
            <button className="btn btn-secondary btn-sm" onClick={handlePublish}>Retry</button>
          </div>
        )}

        {/* ── Live Activity Log ── */}
        {publishLog.length > 0 && (
          <div className="publish-activity-log">
            <div className="publish-activity-log__header">
              <span>📋 Publish Activity</span>
              {publishing && <span className="pipeline-spinner" style={{ width: 10, height: 10 }} />}
            </div>
            <div className="publish-activity-log__entries">
              {publishLog.map((entry, i) => {
                const icon =
                  entry.status === 'ok' ? '✅' :
                    entry.status === 'warn' ? '⚠️' :
                      entry.status === 'error' ? '❌' :
                        i === publishLog.length - 1 && publishing ? '⏳' : '▸';
                return (
                  <div key={i} className={`pal-entry pal-entry--${entry.status}`}>
                    <span className="pal-icon">{icon}</span>
                    <span className="pal-msg">{entry.message}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Options panel — always visible so user can publish again or choose a different action ── */}
        <div className="publish-actions">
          {/* Pipeline control */}
          <div className="pipeline-control">
            <div className="pipeline-control__label">Pipeline Action</div>
            {!allStepsValid && (
              <div className="pipeline-incomplete-banner">
                ⚠️ <strong>Required fields are missing.</strong> Complete all highlighted steps to enable Build and Publish actions. Commit Only is still available.
              </div>
            )}
            <div className="pipeline-control__options">
              {(() => {
                const isWin = state.platform === 'windows' || state.platform === 'both';
                const isMac = state.platform === 'macos' || state.platform === 'both';
                // 'none' = commit only — always available
                const options = [{ value: 'none', label: "⏸️ Save Project", desc: 'Commit changes to Gitlab' }];
                if (isWin) {
                  options.push(
                    { value: 'build', label: '📦 Build PSADT', desc: 'Build Package - Don;t publish to Intune', disabled: !allStepsValid },
                    { value: 'publish', label: '📦 Build .intunewin + Publish', desc: 'Package, upload to Intune, and apply supersedence/dependencies', disabled: !allStepsValid || !intuneReady },
                    { value: 'assign', label: '📦 Build + Publish + Assign', desc: 'Full pipeline — includes group assignments', disabled: !allStepsValid || !intuneReady },
                  );
                }
                if (isMac && !isWin) {
                  options.push(
                    { value: 'deploy', label: '🍎 Deploy', desc: 'Terraform apply to Jamf', disabled: !allStepsValid },
                  );
                }
                if (isMac && isWin) {
                  options.push(
                    { value: 'deploy', label: '🍎 macOS Deploy', desc: 'Also triggers Jamf Terraform deploy', disabled: !allStepsValid },
                  );
                }

                return options.map(opt => {
                  const isDisabledBySteps = opt.value !== 'none' && !allStepsValid;
                  const isDisabledByIntune = (opt.value === 'publish' || opt.value === 'assign') && !intuneReady;
                  const tooltip = isDisabledBySteps
                    ? 'Complete all required fields across all stages first'
                    : isDisabledByIntune
                      ? 'Complete required Intune fields first (App Name, Description, Publisher, Detection Rules)'
                      : '';
                  return (
                    <label
                      key={opt.value}
                      className={`pipeline-option ${pipelineAction === opt.value ? 'pipeline-option--active' : ''} ${opt.disabled ? 'pipeline-option--disabled' : ''}`}
                      title={tooltip}
                    >
                      <input
                        type="radio"
                        name="pipelineAction"
                        value={opt.value}
                        checked={pipelineAction === opt.value}
                        onChange={() => setPipelineAction(opt.value)}
                        disabled={opt.disabled}
                      />
                      <span className="pipeline-option__label">{opt.label}</span>
                      <span className="pipeline-option__desc">
                        {opt.desc}
                        {isDisabledBySteps ? ' ⚠️ Required fields missing' : ''}
                        {!isDisabledBySteps && isDisabledByIntune ? ' ⚠️ Intune fields incomplete' : ''}
                      </span>
                    </label>
                  );
                });
              })()}
            </div>
          </div>
          <button
            className="btn btn-primary"
            onClick={handlePublish}
            disabled={publishing || hasErrors || apiAvailable === false}
          >
            {publishing ? `⏳ ${publishPhase || 'Publishing...'}` : state.wizardMode === 'edit' ? '✏️ Update Project' : '🚀 Publish to GitLab'}
          </button>
          {apiAvailable === false && <span className="publish-hint">⚠️ Publish API not reachable — start with <code>npm run server</code></span>}
          {hasErrors && <span className="publish-hint">⚠️ Fix schema errors before publishing</span>}
          {!intuneReady && (pipelineAction === 'publish' || pipelineAction === 'assign') && <span className="publish-hint">🚫 Complete required Intune fields to enable Build + Publish</span>}
        </div>

      </div>

      {/* ═══ Push to Intune ═══ */}
      {state.wizardMode === 'edit' && state.syncIntuneAppId && (
        <div className="publish-section" style={{ borderColor: 'rgba(99, 102, 241, 0.25)' }}>
          <h3 className="publish-section__title">🔄 Push Changes to Intune</h3>
          <p className="publish-section__desc" style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            Push metadata changes from the builder directly to the linked Intune app.
            Also commits updated files to GitLab (without triggering the pipeline).
          </p>



          {pushError && (
            <div className="publish-result publish-result--error">
              <span>❌ {pushError}</span>
              <button className="btn btn-sm btn-ghost" onClick={() => setPushError(null)}>Dismiss</button>
            </div>
          )}

          {pushSuccess && (
            <div className="publish-result publish-result--success">
              <span>✅ Changes pushed to Intune and committed to GitLab successfully.</span>
            </div>
          )}

          {pushDiffs && pushDiffs.length === 0 && !pushSuccess && (
            <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
              ✅ No pushable metadata differences found. Builder and Intune are in sync.
            </div>
          )}

          {pushDiffs && pushDiffs.length > 0 && !pushSuccess && (
            <div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', padding: '0 16px', margin: '8px 0' }}>
                The following <strong>{pushDiffs.length}</strong> field{pushDiffs.length !== 1 ? 's' : ''} will be updated in Intune:
              </p>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', margin: '0 0 12px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    <th style={{ textAlign: 'left', padding: '4px 12px', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.68rem', textTransform: 'uppercase' }}>Field</th>
                    <th style={{ textAlign: 'left', padding: '4px 12px', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.68rem', textTransform: 'uppercase' }}>Value to Push</th>
                  </tr>
                </thead>
                <tbody>
                  {pushDiffs.map(d => (
                    <tr key={d.field} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                      <td style={{ padding: '4px 12px', color: '#f59e0b', fontWeight: 500 }}>⚠️ {d.label}</td>
                      <td style={{ padding: '4px 12px' }}>
                        <code style={{ fontSize: '0.7rem', color: '#4ade80' }}>
                          {d.value === null ? '(clear)' : d.value === '' ? '(empty)' : String(d.value)}
                        </code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {!pushConfirm ? (
                <div style={{ padding: '0 12px 12px', textAlign: 'right' }}>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => setPushConfirm(true)}
                    disabled={pushPushing}
                  >
                    Review & Confirm Push
                  </button>
                </div>
              ) : (
                <div style={{ padding: '8px 12px 12px', background: 'rgba(239,68,68,0.05)', borderTop: '1px solid rgba(239,68,68,0.15)' }}>
                  <p style={{ fontSize: '0.78rem', color: '#f59e0b', margin: '0 0 8px', fontWeight: 600 }}>
                    ⚠️ This will modify the live Intune app. Are you sure?
                  </p>
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button className="btn btn-sm btn-ghost" onClick={() => setPushConfirm(false)} disabled={pushPushing}>Cancel</button>
                    <button
                      className="btn btn-sm"
                      style={{ background: 'rgba(239,68,68,0.2)', color: '#f87171', border: '1px solid rgba(239,68,68,0.4)' }}
                      onClick={handlePushToIntune}
                      disabled={pushPushing}
                    >
                      {pushPushing ? '⏳ Pushing…' : `🔄 Push ${pushDiffs.length} Change${pushDiffs.length !== 1 ? 's' : ''} to Intune`}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Schema Validation */}
      <div className={`validation-panel ${hasErrors ? 'validation-panel--error' : 'validation-panel--ok'}`}>
        <div className="validation-panel__header">
          <span className="validation-panel__icon">{hasErrors ? '⚠️' : '✅'}</span>
          <span className="validation-panel__title">
            {validationResults.length === 0
              ? 'No JSON schemas to validate'
              : hasErrors
                ? 'Schema Validation Failed'
                : `All ${validationResults.length} schema checks passed`}
          </span>
        </div>
        {validationResults.map(r => (
          <div key={r.file} className={`validation-item ${r.valid ? 'validation-item--ok' : 'validation-item--err'}`}>
            <span className="validation-item__icon">{r.valid ? '✓' : '✗'}</span>
            <span className="validation-item__file">{r.file}</span>
            {!r.valid && (
              <ul className="validation-item__errors">
                {r.errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            )}
          </div>
        ))}
      </div>

      {/* File browser */}
      <div className="review-browser">
        <FileTreePreview
          files={files}
          selectedFile={selectedFile}
          onSelectFile={setSelectedFile}
        />
        <div className="review-preview">
          {selectedFile && files[selectedFile] ? (
            <CodePreview
              code={files[selectedFile]}
              filename={selectedFile.split('/').pop()}
            />
          ) : (
            <div className="review-empty">Select a file to preview</div>
          )}
        </div>
      </div>

      {/* Next steps */}
      <div className="review-next">
        <h3>📋 After Publishing</h3>
        <ol>
          <li>Search <code>TODO</code> in the generated files and fill in all placeholders</li>
          {(state.platform === 'windows' || state.platform === 'both') && (
            <>
              <li>Drop the installer binary into <code>windows/src/Files/</code></li>
              <li>Replace Entra ID group IDs in <code>windows/intune/assignments.json</code></li>
            </>
          )}
          {(state.platform === 'macos' || state.platform === 'both') && (
            <>
              <li>Drop the <code>.{state.macInstallerType}</code> installer into <code>macos/src/Files/</code></li>
              <li>Replace Jamf group IDs in <code>macos/jamf/scope-inputs.json</code></li>
            </>
          )}
          <li>Push your changes and let the CI/CD pipeline run</li>
        </ol>
      </div>

      <style>{`
        .review-summary {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: var(--space-md);
          margin-bottom: var(--space-xl);
        }
        @media (max-width: 900px) {
          .review-summary { grid-template-columns: repeat(2, 1fr); }
        }
        .summary-card {
          display: flex;
          align-items: center;
          gap: var(--space-md);
          padding: var(--space-md);
          background: var(--bg-elevated);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
        }
        .summary-card__icon { font-size: 1.5rem; }
        .summary-card__label {
          font-size: 0.7rem;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .summary-card__value {
          font-size: 0.9rem;
          font-weight: 600;
          color: var(--text-primary);
        }
        .review-actions {
          display: flex;
          align-items: center;
          gap: var(--space-md);
          margin-bottom: var(--space-xl);
        }
        .export-success {
          font-size: 0.85rem;
          color: var(--color-success);
          font-weight: 500;
        }
        .review-browser {
          display: grid;
          grid-template-columns: 260px 1fr;
          gap: var(--space-lg);
          margin-bottom: var(--space-xl);
          min-height: 400px;
        }
        @media (max-width: 900px) {
          .review-browser { grid-template-columns: 1fr; }
        }
        .review-preview {
          min-width: 0;
        }
        .review-empty {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: var(--text-muted);
          font-size: 0.9rem;
        }
        .review-next {
          padding: var(--space-lg);
          background: var(--bg-elevated);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
        }
        .review-next h3 {
          font-size: 1rem;
          margin-bottom: var(--space-md);
        }
        .review-next ol {
          padding-left: var(--space-lg);
          color: var(--text-secondary);
          font-size: 0.85rem;
        }
        .review-next li {
          margin-bottom: var(--space-sm);
        }
        .review-next code {
          font-family: var(--font-mono);
          font-size: 0.8rem;
          color: var(--text-accent);
          background: var(--bg-input);
          padding: 2px 6px;
          border-radius: 3px;
        }

        /* Validation panel */
        .validation-panel {
          padding: var(--space-md) var(--space-lg);
          border-radius: var(--radius-md);
          margin-bottom: var(--space-xl);
          border: 1px solid;
        }
        .validation-panel--ok {
          background: rgba(34, 197, 94, 0.08);
          border-color: rgba(34, 197, 94, 0.3);
        }
        .validation-panel--error {
          background: rgba(239, 68, 68, 0.08);
          border-color: rgba(239, 68, 68, 0.3);
        }
        .validation-panel__header {
          display: flex;
          align-items: center;
          gap: var(--space-sm);
          margin-bottom: var(--space-sm);
        }
        .validation-panel__icon { font-size: 1.1rem; }
        .validation-panel__title {
          font-size: 0.85rem;
          font-weight: 600;
          color: var(--text-primary);
        }
        .validation-item {
          display: flex;
          flex-wrap: wrap;
          align-items: baseline;
          gap: var(--space-sm);
          padding: 4px 0;
          font-size: 0.8rem;
        }
        .validation-item--ok .validation-item__icon { color: var(--color-success); }
        .validation-item--err .validation-item__icon { color: var(--color-error); font-weight: bold; }
        .validation-item__file {
          font-family: var(--font-mono);
          color: var(--text-secondary);
        }
        .validation-item__errors {
          width: 100%;
          margin: 4px 0 4px 24px;
          padding-left: var(--space-md);
          color: var(--color-error);
          font-size: 0.75rem;
          font-family: var(--font-mono);
        }
        .validation-item__errors li { margin-bottom: 2px; }

        /* Publish section */
        .publish-section {
          padding: var(--space-lg);
          background: var(--bg-elevated);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          margin-bottom: var(--space-xl);
        }
        .publish-section__title {
          font-size: 1rem;
          margin: 0 0 4px;
        }
        .publish-section__path {
          font-size: 0.78rem;
          color: var(--text-muted);
          margin: 0 0 var(--space-md);
        }
        .publish-section__path code {
          color: var(--text-accent);
          background: var(--bg-input);
          padding: 2px 6px;
          border-radius: 3px;
          font-size: 0.75rem;
        }
        .publish-actions {
          display: flex;
          align-items: center;
          gap: var(--space-md);
          flex-wrap: wrap;
        }
        .publish-hint {
          font-size: 0.78rem;
          color: var(--text-muted);
        }
        .publish-hint code {
          background: var(--bg-input);
          padding: 1px 5px;
          border-radius: 3px;
          font-size: 0.73rem;
        }
        .publish-result {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: var(--space-sm);
          padding: 12px var(--space-md);
          border-radius: var(--radius-sm);
          font-size: 0.85rem;
        }
        .publish-result--success {
          background: rgba(34, 197, 94, 0.08);
          border: 1px solid rgba(34, 197, 94, 0.25);
          flex-direction: column;
          align-items: flex-start;
        }
        .publish-result--error {
          background: rgba(239, 68, 68, 0.08);
          border: 1px solid rgba(239, 68, 68, 0.25);
          color: #ef4444;
        }
        .publish-result__header {
          display: flex;
          align-items: center;
          gap: var(--space-sm);
          color: #4ade80;
          font-size: 0.9rem;
        }
        .publish-result__icon { font-size: 1rem; }
        .publish-tag {
          font-size: 0.75rem;
          background: rgba(124, 138, 255, 0.12);
          color: #a78bfa;
          padding: 2px 8px;
          border-radius: 99px;
          margin-left: var(--space-sm);
        }
        .publish-result__links {
          display: flex;
          flex-wrap: wrap;
          gap: var(--space-sm);
          margin-top: var(--space-sm);
        }
        .publish-result__pipeline {
          font-size: 0.8rem;
          color: var(--text-secondary);
          margin-top: 4px;
        }
        .publish-result__pipeline a {
          color: var(--text-accent);
          text-decoration: none;
          font-weight: 600;
        }
        .publish-result__pipeline a:hover { text-decoration: underline; }
        .publish-result__pipeline--skip {
          color: var(--text-muted);
          font-style: italic;
        }

        /* Pipeline control */
        .pipeline-control {
          width: 100%;
          margin-bottom: var(--space-md);
        }
        .pipeline-control__label {
          font-size: 0.78rem;
          font-weight: 600;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.04em;
          margin-bottom: var(--space-sm);
        }
        .pipeline-control__options {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .pipeline-option {
          display: flex;
          flex-direction: column;
          gap: 2px;
          padding: 10px 14px;
          background: var(--bg-card, rgba(255,255,255,0.03));
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
          cursor: pointer;
          transition: all 0.15s ease;
          flex: 1;
          min-width: 130px;
        }
        .pipeline-option:hover {
          border-color: var(--text-accent, #7c8aff);
          background: rgba(124, 138, 255, 0.04);
        }
        .pipeline-option--active {
          border-color: var(--text-accent, #7c8aff);
          background: rgba(124, 138, 255, 0.08);
          box-shadow: 0 0 0 1px var(--text-accent, #7c8aff);
        }
        .pipeline-option input[type="radio"] {
          display: none;
        }
        .pipeline-option__label {
          font-size: 0.82rem;
          font-weight: 600;
          color: var(--text-primary);
        }
        .pipeline-option__desc {
          font-size: 0.7rem;
          color: var(--text-muted);
          line-height: 1.3;
        }
        .pipeline-option--disabled {
          opacity: 0.4;
          cursor: not-allowed;
          pointer-events: none;
          border-color: rgba(239, 68, 68, 0.2);
        }
        .pipeline-incomplete-banner {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          margin-bottom: 10px;
          background: rgba(245, 158, 11, 0.08);
          border: 1px solid rgba(245, 158, 11, 0.35);
          border-radius: var(--radius-sm);
          font-size: 0.78rem;
          color: #f59e0b;
          line-height: 1.4;
        }
        .pipeline-incomplete-banner strong {
          color: #fbbf24;
        }

        /* ── Pipeline Tracker ── */
        .pipeline-tracker {
          margin: var(--space-md) 0 var(--space-sm);
          padding: var(--space-md);
          background: rgba(255,255,255,0.02);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
        }
        .pipeline-tracker__header {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: var(--space-md);
          flex-wrap: wrap;
        }
        .pipeline-tracker__status-icon { font-size: 1.1rem; }
        .pipeline-tracker__label {
          font-size: 0.85rem;
          font-weight: 700;
        }
        .pipeline-tracker__polling {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.72rem;
          color: #60a5fa;
          margin-left: auto;
        }
        .pipeline-spinner {
          display: inline-block;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #60a5fa;
          animation: pulse-dot 1.2s ease-in-out infinite;
        }
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.3; transform: scale(0.7); }
        }
        .pipeline-tracker__link {
          font-size: 0.75rem;
          color: var(--text-accent);
          text-decoration: none;
          margin-left: auto;
        }
        .pipeline-tracker__link:hover { text-decoration: underline; }
        .pipeline-tracker__placeholder {
          font-size: 0.78rem;
          color: var(--text-muted);
          font-style: italic;
          padding: var(--space-sm) 0;
        }
        .pipeline-stages {
          display: flex;
          gap: 16px;
          flex-wrap: wrap;
          margin-bottom: var(--space-sm);
        }
        .pipeline-stage {
          flex: 1;
          min-width: 140px;
        }
        .pipeline-stage__name {
          font-size: 0.68rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--text-muted);
          margin-bottom: 6px;
          padding-bottom: 4px;
          border-bottom: 1px solid var(--border-subtle);
        }
        .pipeline-stage__jobs { display: flex; flex-direction: column; gap: 6px; }
        .pipeline-job {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 8px;
          border-radius: var(--radius-sm);
          background: rgba(255,255,255,0.02);
          border: 1px solid var(--border-subtle);
          flex-wrap: wrap;
          min-width: 0;
        }
        .pipeline-job--running  { border-color: rgba(96,165,250,0.35); background: rgba(96,165,250,0.06); }
        .pipeline-job--success  { border-color: rgba(52,211,153,0.35); background: rgba(52,211,153,0.04); }
        .pipeline-job--failed   { border-color: rgba(248,113,113,0.35); background: rgba(248,113,113,0.04); }
        .pipeline-job__icon     { font-size: 0.85rem; flex-shrink: 0; }
        .pipeline-job__name     { font-size: 0.78rem; font-weight: 600; color: var(--text-primary); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
        .pipeline-job__status   { font-size: 0.68rem; color: var(--text-muted); }
        .pipeline-job__download {
          font-size: 0.7rem;
          padding: 2px 8px;
          border-radius: 99px;
          background: rgba(52,211,153,0.12);
          border: 1px solid rgba(52,211,153,0.35);
          color: #34d399;
          cursor: pointer;
          transition: background 0.15s;
        }
        .pipeline-job__download:hover { background: rgba(52,211,153,0.2); }
        .pipeline-job__link {
          font-size: 0.68rem;
          color: var(--text-accent);
          text-decoration: none;
        }
        .pipeline-job__link:hover { text-decoration: underline; }
        .pipeline-tracker__dl-all {
          margin-top: var(--space-sm);
          width: 100%;
          justify-content: center;
        }

        /* ── Script Editor CSS ── */
        .script-editor {
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          overflow: hidden;
          margin-bottom: var(--space-md);
          background: var(--bg-elevated);
        }
        .script-editor__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--space-md);
          background: rgba(255,255,255,0.02);
          border-bottom: 1px solid var(--border-subtle);
          gap: var(--space-md);
        }
        .script-editor__info {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 4px;
        }
        .badge {
          display: inline-block;
          font-size: 0.72rem;
          font-weight: 600;
          padding: 2px 8px;
          border-radius: 99px;
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }
        .badge--sync {
          background: rgba(59, 130, 246, 0.12);
          color: #60a5fa;
        }
        .badge--custom {
          background: rgba(245, 158, 11, 0.12);
          color: #fbbf24;
        }
        .script-editor__desc {
          font-size: 0.75rem;
          color: var(--text-muted);
        }
        .textarea-editor-container {
          display: flex;
          background: rgba(8, 10, 20, 0.9);
          min-height: 450px;
          max-height: 650px;
          overflow-y: auto;
          font-family: var(--font-mono);
          font-size: 0.8rem;
          line-height: 1.7;
        }
        .line-numbers {
          display: flex;
          flex-direction: column;
          text-align: right;
          padding: var(--space-md) var(--space-sm);
          color: rgba(255,255,255,0.25);
          background: rgba(0, 0, 0, 0.2);
          border-right: 1px solid var(--border-subtle);
          user-select: none;
          min-width: 32px;
        }
        .line-numbers span {
          height: 1.7em;
        }
        .textarea-editor {
          flex: 1;
          background: transparent;
          color: var(--text-primary);
          border: none;
          resize: none;
          font-family: inherit;
          font-size: inherit;
          line-height: inherit;
          padding: var(--space-md);
          outline: none;
          white-space: pre;
          overflow-x: auto;
          tab-size: 4;
        }
        /* ── Publish Activity Log ── */
        .publish-activity-log {
          margin: var(--space-md) 0;
          background: rgba(0, 0, 0, 0.35);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          overflow: hidden;
          font-family: var(--font-mono, monospace);
          font-size: 0.78rem;
        }
        .publish-activity-log__header {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 14px;
          background: rgba(255,255,255,0.04);
          border-bottom: 1px solid var(--border-subtle);
          font-size: 0.7rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--text-muted);
        }
        .publish-activity-log__entries {
          padding: 8px 0;
          max-height: 220px;
          overflow-y: auto;
        }
        .pal-entry {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          padding: 4px 14px;
          color: var(--text-secondary);
          transition: background 0.15s;
        }
        .pal-entry--ok    { color: #4ade80; }
        .pal-entry--warn  { color: #fbbf24; }
        .pal-entry--error { color: #f87171; }
        .pal-icon { flex-shrink: 0; width: 1.2em; text-align: center; }
        .pal-msg  { flex: 1; line-height: 1.5; }
      `}</style>
    </div>
  );
}
