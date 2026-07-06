import { useState, useRef, useCallback, useEffect } from 'react';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { Box, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Button, Alert } from '@mui/material';


import TopBar, { } from './components/layout/TopBar';
import Sidebar, { DRAWER_WIDTH, DRAWER_COLLAPSED_WIDTH } from './components/layout/Sidebar';
import PlatformSelector from './components/layout/PlatformSelector';
import PlatformLandingPage from './components/ui/PlatformLandingPage';
import SettingsPage from './components/pages/SettingsPage';

import useWizardState from './hooks/useWizardState';
import { useColorTheme } from './hooks/useColorTheme';
import BasicInfoStep from './components/steps/BasicInfoStep';
import PsadtLifecycleStep from './components/steps/PsadtLifecycleStep';
import InstallerStep from './components/steps/InstallerStep';
import IntuneConfigStep from './components/steps/IntuneConfigStep';
import MacInstallerStep from './components/steps/MacInstallerStep';
import MacConfigStep from './components/steps/MacConfigStep';
import ReviewStep from './components/steps/ReviewStep';

import IntuneExportPicker from './components/ui/IntuneExportPicker';
import ServiceNowQueue from './components/ui/ServiceNowQueue';
import ProjectPicker from './components/ui/ProjectPicker';

import { parsePsadtFile, toWizardState } from './lib/parsePsadt';
import { fetchIntuneCatalog, fetchIntuneAppDetail, refreshIntuneCatalog } from './lib/intuneApi';

// ── Views ─────────────────────────────────────────────────────────────────────
const VIEW = {
  HOME:    'home',     // Platform selector (no platform chosen yet)
  LANDING: 'landing',  // Per-platform landing page (shown after platform selection)
  PACKAGE: 'package',  // Active package wizard
  QUEUE:   'queue',    // ServiceNow queue — inline page
  EDIT:    'edit',     // Edit existing — inline page
  SETTINGS: 'settings',
  REFACTOR: 'refactor',
};

export default function App() {
  const wizard = useWizardState();

  // ── Color theme ────────────────────────────────────────────────
  const { themeId, muiTheme, selectTheme, themes } = useColorTheme();

  // ── Layout state ─────────────────────────────────────────────────────────
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [view, setView] = useState(VIEW.HOME);

  const [workbenchWidth, setWorkbenchWidth] = useState(() =>
    localStorage.getItem('spa-workbench-width') || 'standard'
  );
  const handleWidthChange = (w) => {
    setWorkbenchWidth(w);
    localStorage.setItem('spa-workbench-width', w);
  };

  // ── Platform switch confirmation ──────────────────────────────────────────
  const [pendingPlatform, setPendingPlatform] = useState(null);
  const [platformSwitchDialog, setPlatformSwitchDialog] = useState(false);

  // ── Load-project warning (discard unsaved work?) ──────────────────────────
  const [loadWarningDialog, setLoadWarningDialog] = useState(false);
  const [pendingProjectLoad, setPendingProjectLoad] = useState(null); // raw callback fn

  // ── Modals ────────────────────────────────────────────────────────────────
  // IntuneExportPicker remains a modal (it's triggered from within the wizard step)
  const [showIntunePicker, setShowIntunePicker] = useState(false);

  // ── Intune catalog ────────────────────────────────────────────────────────
  const [intuneCatalog, setIntuneCatalog] = useState(null);
  const [intuneCatalogLoading, setIntuneCatalogLoading] = useState(false);
  const [intuneCatalogError, setIntuneCatalogError] = useState(null);
  const [intuneRefreshing, setIntuneRefreshing] = useState(false);

  // ── PSADT refactor state ──────────────────────────────────────────────────
  const [psadtParsing, setPsadtParsing] = useState(false);
  const [psadtError, setPsadtError] = useState(null);
  const [psadtResult, setPsadtResult] = useState(null);
  const refactorInputRef = useRef(null);

  // ── Server config (survives wizard resets) ────────────────────────────────
  const serverConfig = useRef({});

  // ── Load server config on mount (platform groups + gitLabGroup) ───────────
  useEffect(() => {
    fetch('/api/health')
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(data => {
        // Store in ref so values survive wizard.reset() calls
        serverConfig.current = {
          gitLabWinGroup: data.gitLabWinGroup || '',
          gitLabMacGroup: data.gitLabMacGroup || '',
          gitLabGroup: data.gitLabGroup || '',
        };
        // Apply to wizard state
        applyServerGroups();
      })
      .catch(err => console.warn('Failed to load server config:', err));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-apply server group fields into wizard state (call after every reset)
  const applyServerGroups = () => {
    const cfg = serverConfig.current;
    if (cfg.gitLabWinGroup) wizard.updateField('gitLabWinGroup', cfg.gitLabWinGroup);
    if (cfg.gitLabMacGroup) wizard.updateField('gitLabMacGroup', cfg.gitLabMacGroup);
    if (cfg.gitLabGroup && !cfg.gitLabWinGroup) wizard.updateField('gitLabGroup', cfg.gitLabGroup);
  };

  // ── Platform selection ────────────────────────────────────────────────────
  const handleSelectPlatform = (platformId) => {
    const hasActivePackage = wizard.state.displayName || wizard.state.packageId;
    if (hasActivePackage && wizard.state.platform && wizard.state.platform !== platformId) {
      // Warn user before switching — will reset wizard state
      setPendingPlatform(platformId);
      setPlatformSwitchDialog(true);
    } else {
      applyPlatformSelect(platformId);
    }
  };

  const applyPlatformSelect = (platformId) => {
    if (wizard.state.platform !== platformId) {
      wizard.reset();
      // reset() resets platform and group fields — restore from server config and set platform
      setTimeout(() => {
        applyServerGroups();
        wizard.updateField('platform', platformId);
      }, 0);
    }
    setView(VIEW.LANDING);
    setPlatformSwitchDialog(false);
    setPendingPlatform(null);
  };

  const confirmPlatformSwitch = () => {
    applyPlatformSelect(pendingPlatform);
  };

  // ── Sidebar action handlers ───────────────────────────────────────────────
  const handleGoHome = () => {
    setView(VIEW.HOME);
  };

  // ── Unsaved-work guard ────────────────────────────────────────────────────
  // Wraps any navigation/load action. Shows a warning only when the user has
  // actually edited something since the last load/reset (wizard.isDirty).
  // wizard.isDirty is a ref-based flag: false on load/reset, true on any real
  // user edit. System-managed fields (group config, lookups) do NOT set it.
  const hasUnsavedWork = () => wizard.isDirty;

  const withUnsavedWorkGuard = (action) => {
    if (hasUnsavedWork()) {
      // Wrap in object — if we passed the fn directly, React's useState would
      // treat it as an updater function and execute it immediately, losing data.
      setPendingProjectLoad({ fn: action });
      setLoadWarningDialog(true);
    } else {
      action();
    }
  };

  // ── New blank package ─────────────────────────────────────────────────────
  const handleNewBlank = () => withUnsavedWorkGuard(() => {
    const platform = wizard.state.platform;
    wizard.reset();
    setTimeout(() => {
      applyServerGroups();
      if (platform) wizard.updateField('platform', platform);
    }, 0);
    setView(VIEW.PACKAGE);
  });

  // ── New from queue ────────────────────────────────────────────────────────
  const handleNewFromQueue = () => withUnsavedWorkGuard(() => setView(VIEW.QUEUE));

  // ── Refactor ──────────────────────────────────────────────────────────────
  const handleRefactor = () => withUnsavedWorkGuard(() => setView(VIEW.REFACTOR));

  // ── Edit packages ─────────────────────────────────────────────────────────
  const handleEditPackages = () => withUnsavedWorkGuard(() => setView(VIEW.EDIT));

  // ── ServiceNow queue item selected ────────────────────────────────────────
  const handleQueueSelect = (fields) => withUnsavedWorkGuard(() => {
    const platform = wizard.state.platform;
    wizard.reset();
    setTimeout(() => {
      applyServerGroups();
      if (platform) wizard.updateField('platform', platform);
      Object.entries(fields).forEach(([key, value]) => {
        if (value !== undefined && value !== '') wizard.updateField(key, value);
      });
      wizard.goToStep(0);
    }, 0);
    setView(VIEW.PACKAGE);
  });

  // ── Edit existing project selected ────────────────────────────────────────
  const handleProjectSelect = (files, projectMeta) => withUnsavedWorkGuard(() => {
    wizard.importProjectForEdit(files, projectMeta);
    wizard.goToStep(0);
    setView(VIEW.PACKAGE);
  });

  const handleLoadExistingProject = async (projectPath) => {
    try {
      const checkRes = await fetch(`/api/projects/check?path=${encodeURIComponent(projectPath)}`);
      if (!checkRes.ok) throw new Error(`Server returned ${checkRes.status}`);
      const checkData = await checkRes.json();
      if (!checkData.exists) throw new Error('Project no longer exists in GitLab.');
      const project = checkData.project;
      const cloneRes = await fetch(`/api/projects/${project.id}/clone`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
      });
      if (!cloneRes.ok) throw new Error(`HTTP ${cloneRes.status} trying to clone project.`);
      const cloneData = await cloneRes.json();
      const enrichedMeta = { ...cloneData.projectMeta, tags: project.tags || [], localPath: cloneData.localPath };
      wizard.importProjectForEdit(cloneData.files, enrichedMeta);
    } catch (err) {
      alert(`Failed to transition to existing project: ${err.message}`);
    }
  };

  // ── Intune ────────────────────────────────────────────────────────────────
  const handleIntuneImport = (fields) => { wizard.importIntuneExport(fields); };

  const loadIntuneCatalog = useCallback(async (refresh = false) => {
    if (refresh) setIntuneRefreshing(true);
    else setIntuneCatalogLoading(true);
    setIntuneCatalogError(null);
    try {
      const data = refresh ? await refreshIntuneCatalog() : await fetchIntuneCatalog();
      setIntuneCatalog(data.apps || []);
    } catch (err) {
      setIntuneCatalogError(err.message);
    } finally {
      setIntuneCatalogLoading(false);
      setIntuneRefreshing(false);
    }
  }, []);

  // ── PSADT upload (refactor flow) ──────────────────────────────────────────
  const handlePsadtUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (e.target) e.target.value = '';
    if (!files.length) return;
    setPsadtParsing(true);
    setPsadtError(null);
    setPsadtResult(null);
    try {
      const psFile = files.find(f => /Deploy-Application\.ps1$/i.test(f.name) || /Invoke-AppDeployToolkit\.ps1$/i.test(f.name))
        || files.find(f => f.name.endsWith('.ps1'));
      if (!psFile) throw new Error('No .ps1 script found. Please upload a Deploy-Application.ps1 or Invoke-AppDeployToolkit.ps1 file.');
      const fullParsed = await parsePsadtFile(psFile, 'refactor-convert');
      const wizardFields = toWizardState(fullParsed);
      setPsadtResult(fullParsed);
      const derivedPackageId = wizardFields.displayName
        ? wizardFields.displayName.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9._-]/g, '').toLowerCase()
        : (wizard.state.packageId || '');
      if (derivedPackageId) {
        try { await fetch(`/api/scaffold/${encodeURIComponent(derivedPackageId)}`, { method: 'DELETE' }); } catch { }
      }
      const intuneDisplayName = wizard.state.displayName;
      const psadtDisplayName = fullParsed.fields?.displayName || '';
      if (intuneDisplayName && psadtDisplayName) {
        const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (normalize(intuneDisplayName) !== normalize(psadtDisplayName)) {
          alert(`⚠️ Title mismatch:\n\nIntune: "${intuneDisplayName}"\nPSADT: "${psadtDisplayName}"\n\nVerify these belong to the same application.`);
        }
      }
      wizard.importPsadtState(fullParsed, wizardFields, true);
      setView(VIEW.PACKAGE);
    } catch (err) {
      setPsadtError(err.message);
    } finally {
      setPsadtParsing(false);
    }
  };

  // ── Step renderer ─────────────────────────────────────────────────────────
  const currentStepId = wizard.steps[wizard.currentStep]?.id;

  const renderStep = () => {
    switch (currentStepId) {
      case 'basic':
        return <BasicInfoStep state={wizard.state} updateField={wizard.updateField} CATEGORIES={wizard.CATEGORIES} onLoadExistingProject={handleLoadExistingProject} />;
      case 'psadt':
        return <PsadtLifecycleStep state={wizard.state} updateField={wizard.updateField} updateFields={wizard.updateFields} addAction={wizard.addAction} removeAction={wizard.removeAction} updateAction={wizard.updateAction} moveAction={wizard.moveAction} updateLifecycleRoot={wizard.updateLifecycleRoot} psadtResult={psadtResult} />;
      case 'installer':
        return <InstallerStep state={wizard.state} updateField={wizard.updateField} updateFields={wizard.updateFields} />;
      case 'intune':
        return <IntuneConfigStep state={wizard.state} updateField={wizard.updateField} intuneCatalog={intuneCatalog} loadIntuneCatalog={loadIntuneCatalog} fetchAppDetail={fetchIntuneAppDetail} />;
      case 'mac-installer':
        return <MacInstallerStep state={wizard.state} updateField={wizard.updateField} updateFields={wizard.updateFields} />;
      case 'macos':
        return <MacConfigStep state={wizard.state} updateField={wizard.updateField} />;
      case 'review':
        return <ReviewStep state={wizard.state} updateField={wizard.updateField} allStepsValid={wizard.allStepsValid} markClean={wizard.markClean} />;
      default:
        return null;
    }
  };

  // ── Refactor flow panel (inline page) ────────────────────────────────────
  const renderRefactorFlow = () => {
    const intuneImported = wizard.state._intuneExportImported;
    const psadtImported = !!psadtResult;
    const canContinue = intuneImported || psadtImported;
    return (
      <>
        {/* Page header — matches Queue/Edit style */}
        <div className="snq-header" style={{ marginBottom: 'var(--space-lg)' }}>
          <div>
            <h2 className="snq-title">🔄 Refactor Existing Package</h2>
            <p className="snq-subtitle">Import from Intune and upload a PSADT script to pre-populate the workbench.</p>
          </div>
          <button className="snq-close" onClick={() => setView(VIEW.QUEUE)} title="Back">← Back</button>
        </div>

        <div className="refactor-flow">
          {/* Step 1: Intune Import */}
          <div className={`refactor-step ${intuneImported ? 'refactor-step--done' : ''}`}>
            <div className="refactor-step__header">
              <span className="refactor-step__number">{intuneImported ? '✅' : '1'}</span>
              <div>
                <h3 className="refactor-step__title">Import from Intune</h3>
                <p className="refactor-step__desc">Select an existing Win32 app from Intune to pre-populate the workbench fields.</p>
              </div>
            </div>
            <div className="refactor-step__folder">
              {!intuneCatalog && !intuneCatalogLoading && !intuneCatalogError && (
                <button className="btn btn-secondary" onClick={() => loadIntuneCatalog()}>📡 Load Intune Catalog</button>
              )}
              {intuneCatalogLoading && (
                <div className="refactor-step__progress">
                  <div className="progress-bar progress-bar--indeterminate" />
                  <span className="refactor-step__folder-info">Loading Win32 apps from Intune...</span>
                </div>
              )}
              {intuneCatalogError && (
                <div className="refactor-step__error">
                  <span>❌ {intuneCatalogError}</span>
                  <button className="btn btn-secondary btn-sm" onClick={() => loadIntuneCatalog()}>Retry</button>
                </div>
              )}
              {intuneCatalog && !intuneCatalogLoading && (
                <span className="refactor-step__folder-info">
                  📡 <strong>{intuneCatalog.length}</strong> Win32 app{intuneCatalog.length !== 1 ? 's' : ''} loaded
                  <button className="btn btn-ghost btn-sm" style={{ marginLeft: 8 }} onClick={() => loadIntuneCatalog(true)} disabled={intuneRefreshing}>
                    {intuneRefreshing ? '⏳ Refreshing...' : '🔄 Refresh'}
                  </button>
                </span>
              )}
            </div>
            {intuneImported ? (
              <div className="refactor-step__result">
                <span className="refactor-step__check">✅ Imported — {wizard.state.displayName}</span>
                <button className="btn btn-ghost btn-sm" onClick={() => setShowIntunePicker(true)}>Change</button>
              </div>
            ) : intuneCatalog && intuneCatalog.length > 0 ? (
              <button className="btn btn-secondary" onClick={() => setShowIntunePicker(true)}>
                📥 Browse Intune Catalog ({intuneCatalog.length} apps)
              </button>
            ) : null}
            {!intuneImported && (
              <div className="refactor-step__fallback">
                <span className="refactor-step__optional">
                  or <label className="link-btn" style={{ cursor: 'pointer' }}>
                    upload a JSON export
                    <input type="file" accept=".json" style={{ display: 'none' }} onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        const text = await file.text();
                        const data = JSON.parse(text);
                        const { parseIntuneExport } = await import('./lib/parseIntuneExport');
                        const { fields } = parseIntuneExport(data);
                        handleIntuneImport(fields);
                      } catch (err) { alert(`Failed to parse JSON: ${err.message}`); }
                      e.target.value = '';
                    }} />
                  </label>
                </span>
              </div>
            )}
          </div>

          {/* Step 2: PSADT Upload */}
          <div className={`refactor-step ${psadtImported ? 'refactor-step--done' : ''}`}>
            <div className="refactor-step__header">
              <span className="refactor-step__number">{psadtImported ? '✅' : '2'}</span>
              <div>
                <h3 className="refactor-step__title">Upload PSADT Script</h3>
                <p className="refactor-step__desc">Upload your <code>Deploy-Application.ps1</code> or <code>Invoke-AppDeployToolkit.ps1</code> to extract lifecycle actions.</p>
              </div>
            </div>
            <button className="btn btn-secondary" onClick={() => refactorInputRef.current?.click()} disabled={psadtParsing}>
              📄 {psadtParsing ? 'Analyzing script...' : 'Upload .ps1 Script'}
            </button>
            {psadtParsing && (
              <div className="refactor-step__progress">
                <div className="progress-bar progress-bar--indeterminate" />
                <span className="refactor-step__folder-info">Parsing PSADT script...</span>
              </div>
            )}
            <input ref={refactorInputRef} type="file" accept=".ps1" onChange={handlePsadtUpload} style={{ display: 'none' }} />
            {psadtError && <span className="mode-card__status mode-card__status--err">❌ {psadtError}</span>}
            <span className="refactor-step__optional">Supported: v3 and v4 PSADT scripts</span>
          </div>
        </div>

        {/* Continue action */}
        {canContinue && (
          <div style={{ marginTop: 'var(--space-lg)' }}>
            <button className="btn btn-primary" onClick={() => setView(VIEW.PACKAGE)}>Continue →</button>
          </div>
        )}
      </>
    );
  };

  // ── Layout dimensions ─────────────────────────────────────────────────────
  const sidebarWidth = sidebarOpen ? DRAWER_WIDTH : DRAWER_COLLAPSED_WIDTH;
  const maxContentWidth = workbenchWidth === 'standard' ? 1100 : workbenchWidth === 'wide' ? 1500 : '100%';

  // ── Determine active group for ProjectPicker ──────────────────────────────
  const activeProjectGroup = wizard.state.platform === 'windows'
    ? wizard.state.gitLabWinGroup
    : wizard.state.platform === 'macos'
      ? wizard.state.gitLabMacGroup
      : undefined;

  return (
    <ThemeProvider theme={muiTheme}>

      <CssBaseline />

      {/* ── Top Bar ── */}
      <TopBar
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen(o => !o)}
        platform={wizard.state.platform || null}
        activePkg={view === VIEW.PACKAGE ? { displayName: wizard.state.displayName, version: wizard.state.version } : null}
        workbenchWidth={workbenchWidth}
        onWidthChange={handleWidthChange}
        onGoHome={handleGoHome}
      />

      {/* ── Sidebar ── */}
      <Sidebar
        open={sidebarOpen}
        platform={wizard.state.platform || null}
        activeView={view}
        activeStepId={currentStepId}
        steps={wizard.steps}
        currentStep={wizard.currentStep}
        stepValidation={wizard.stepValidation}
        onGoToStep={wizard.goToStep}
        onQueueOpen={() => setView(VIEW.QUEUE)}
        onNewBlank={() => {
          if (!wizard.state.platform) { setView(VIEW.HOME); return; }
          handleNewBlank();
        }}
        onNewFromQueue={handleNewFromQueue}
        onRefactor={() => {
          if (!wizard.state.platform) { setView(VIEW.HOME); return; }
          handleRefactor();
        }}
        onEditPackages={handleEditPackages}
        onSettings={() => setView(VIEW.SETTINGS)}
      />

      {/* ── Main content area ── */}
      <Box
        component="main"
        sx={{
          ml: `${sidebarWidth}px`,
          mt: '56px',
          transition: 'margin-left 0.2s ease',
          minHeight: 'calc(100vh - 56px)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Box
          sx={{
            mx: 'auto',
            width: '100%',
            maxWidth: maxContentWidth,
            px: { xs: 2, md: 4 },
            py: 3,
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* ── HOME: Platform Selector ── */}
          {view === VIEW.HOME && (
            <PlatformSelector onSelect={handleSelectPlatform} />
          )}

          {/* ── SETTINGS ── */}
          {view === VIEW.SETTINGS && (
            <SettingsPage
              workbenchWidth={workbenchWidth}
              onWidthChange={handleWidthChange}
              colorThemeId={themeId}
              colorThemes={themes}
              onColorThemeChange={selectTheme}
            />
          )}

          {/* ── PLATFORM LANDING ── */}
          {view === VIEW.LANDING && (
            <PlatformLandingPage
              platform={wizard.state.platform}
              onQueue={() => setView(VIEW.QUEUE)}
              onBlank={handleNewBlank}
              onEdit={handleEditPackages}
              onRefactor={handleRefactor}
            />
          )}

          {/* ── REFACTOR FLOW ── */}
          {view === VIEW.REFACTOR && renderRefactorFlow()}

          {/* ── QUEUE: ServiceNow inline page ── */}
          {view === VIEW.QUEUE && (
            <ServiceNowQueue
              onSelect={handleQueueSelect}
              onClose={() => setView(wizard.state.displayName || wizard.state.packageId ? VIEW.PACKAGE : wizard.state.platform ? VIEW.LANDING : VIEW.HOME)}
              platform={wizard.state.platform}
            />
          )}

          {/* ── EDIT: Project picker inline page ── */}
          {view === VIEW.EDIT && (
            <ProjectPicker
              onSelect={handleProjectSelect}
              onClose={() => setView(wizard.state.displayName || wizard.state.packageId ? VIEW.PACKAGE : wizard.state.platform ? VIEW.LANDING : VIEW.HOME)}
              groupPath={activeProjectGroup}
            />
          )}

          {view === VIEW.PACKAGE && (
            <>
              {/* Main step content */}
              <main className="app-main glass-panel">
                {renderStep()}
              </main>

              {/* Bottom navigation */}
              <div className="app-nav">
                <button
                  className="btn btn-secondary"
                  onClick={wizard.currentStep === 0 ? () => setView(VIEW.LANDING) : wizard.prevStep}
                >
                  ← Back
                </button>
                <div className="app-nav__info">
                  Step {wizard.currentStep + 1} of {wizard.steps.length}
                </div>
                {currentStepId !== 'review' ? (
                  <button
                    className="btn btn-primary"
                    onClick={wizard.nextStep}
                  >
                    Next →
                  </button>
                ) : <div />}
              </div>
            </>
          )}
        </Box>
      </Box>

      {/* ── Platform Switch Confirmation Dialog ── */}
      <Dialog open={platformSwitchDialog} onClose={() => setPlatformSwitchDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Switch Platform?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Switching from <strong>{wizard.state.platform === 'windows' ? 'Windows' : 'macOS'}</strong> to <strong>{pendingPlatform === 'windows' ? 'Windows' : 'macOS'}</strong> will clear the current package data.
          </DialogContentText>
          <Alert severity="warning" sx={{ mt: 2, fontSize: '0.8rem' }}>
            All unsaved progress will be lost.
          </Alert>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setPlatformSwitchDialog(false)} variant="outlined" size="small">Cancel</Button>
          <Button onClick={confirmPlatformSwitch} variant="contained" color="warning" size="small">Switch &amp; Reset</Button>
        </DialogActions>
      </Dialog>

      {/* ── Unsaved Work Warning Dialog ── */}
      <Dialog open={loadWarningDialog} onClose={() => { setLoadWarningDialog(false); setPendingProjectLoad(null); }} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Unsaved Progress</DialogTitle>
        <DialogContent>
          <DialogContentText>
            You have an active package —{' '}
            <strong>{wizard.state.displayName || wizard.state.packageId || 'Unnamed package'}</strong>
            {' '}— with unpublished changes.
          </DialogContentText>
          <Alert severity="warning" sx={{ mt: 2, fontSize: '0.8rem' }}>
            This action will discard all unsaved progress. Continue?
          </Alert>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => { setLoadWarningDialog(false); setPendingProjectLoad(null); }}
            variant="outlined" size="small"
          >
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (pendingProjectLoad?.fn) {
                const fn = pendingProjectLoad.fn;
                setLoadWarningDialog(false);
                setPendingProjectLoad(null);
                fn();
              }
            }}
            variant="contained" color="warning" size="small"
          >
            Discard &amp; Continue
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Modals ── */}
      {showIntunePicker && (
        <IntuneExportPicker
          onImport={handleIntuneImport}
          onClose={() => setShowIntunePicker(false)}
          catalogData={intuneCatalog}
          fetchDetail={fetchIntuneAppDetail}
        />
      )}


      {/* ── Legacy CSS (for existing step components) ── */}
      <style>{`
        .app-main {
          flex: 1;
          padding: var(--space-xl) 0;
          margin-bottom: var(--space-lg);
        }
        .app-nav {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--space-md) 0 var(--space-xl);
        }
        .app-nav__info {
          font-size: 0.8rem;
          color: var(--text-muted);
        }
        .refactor-flow {
          display: flex;
          flex-direction: column;
          gap: var(--space-md);
          margin: 0 auto var(--space-lg);
          text-align: left;
        }
        .refactor-step {
          display: flex;
          flex-direction: column;
          gap: var(--space-sm);
          padding: var(--space-lg);
          background: var(--bg-card, rgba(255,255,255,0.03));
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-lg, 12px);
          transition: border-color 0.2s;
        }
        .refactor-step--done { border-color: rgba(34,197,94,0.3); background: rgba(34,197,94,0.04); }
        .refactor-step__header { display: flex; align-items: flex-start; gap: var(--space-md); }
        .refactor-step__number { display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 50%; background: rgba(124,138,255,0.12); color: var(--text-accent, #7c8aff); font-weight: 700; font-size: 0.85rem; flex-shrink: 0; }
        .refactor-step__title { font-size: 0.95rem; font-weight: 600; color: var(--text-primary); margin: 0; }
        .refactor-step__desc { font-size: 0.78rem; color: var(--text-muted); margin: 2px 0 0; line-height: 1.5; }
        .refactor-step__desc code { background: var(--bg-hover); padding: 1px 4px; border-radius: 3px; font-size: 0.73rem; }
        .refactor-step__result { display: flex; align-items: center; gap: var(--space-sm); }
        .refactor-step__check { font-size: 0.82rem; color: #4ade80; font-weight: 500; }
        .refactor-step__optional { font-size: 0.7rem; color: var(--text-muted); opacity: 0.6; }
        .refactor-step__folder { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-sm); }
        .refactor-step__folder-info { font-size: 0.78rem; color: var(--text-secondary); }
        .refactor-step__folder-info strong { color: #4ade80; }
        .refactor-step__error { display: flex; align-items: center; gap: var(--space-sm); color: var(--color-error); font-size: 0.85rem; }
        .refactor-step__fallback { margin-top: 4px; }
        .refactor-step__progress { display: flex; flex-direction: column; gap: 6px; width: 100%; }
        .progress-bar--indeterminate { height: 6px; background: rgba(124,138,255,0.12); border-radius: 3px; overflow: hidden; position: relative; }
        .progress-bar--indeterminate::after { content: ''; position: absolute; top: 0; left: -40%; width: 40%; height: 100%; background: linear-gradient(90deg, transparent, #7c8aff, #a78bfa, transparent); border-radius: 3px; animation: progress-shimmer 1.2s ease-in-out infinite; }
        @keyframes progress-shimmer { 0% { left: -40%; } 100% { left: 100%; } }
        .refactor-flow__actions { display: flex; flex-direction: column; align-items: center; gap: var(--space-sm); margin-top: var(--space-md); }
        .mode-selector { padding: var(--space-xl); text-align: center; }
        .mode-selector__title { font-size: 1.5rem; font-weight: 700; background: var(--accent-gradient); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; margin-bottom: var(--space-sm); }
        .mode-selector__subtitle { color: var(--text-secondary); font-size: 0.95rem; margin-bottom: var(--space-xl); }
        .mode-card__status--err { color: var(--color-error, #ef4444); font-size: 0.8rem; }
      `}</style>
    </ThemeProvider>
  );
}
