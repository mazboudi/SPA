import { useState, useRef, useCallback } from 'react';
import useWizardState from './hooks/useWizardState';
import WizardStepper from './components/WizardStepper';
import BasicInfoStep from './components/steps/BasicInfoStep';
import PlatformStep from './components/steps/PlatformStep';
import PsadtLifecycleStep from './components/steps/PsadtLifecycleStep';
import InstallerStep from './components/steps/InstallerStep';
import DetectionStep from './components/steps/DetectionStep';
import IntuneConfigStep from './components/steps/IntuneConfigStep';
import MacConfigStep from './components/steps/MacConfigStep';
import ReviewStep from './components/steps/ReviewStep';
import IntuneExportPicker from './components/ui/IntuneExportPicker';
import ServiceNowQueue from './components/ui/ServiceNowQueue';
import ProjectPicker from './components/ui/ProjectPicker';
import { parsePsadtFile, toWizardState } from './lib/parsePsadt';
import { fetchIntuneCatalog, fetchIntuneAppDetail, refreshIntuneCatalog } from './lib/intuneApi';

export default function App() {
  const wizard = useWizardState();
  const currentStepId = wizard.steps[wizard.currentStep]?.id;
  const [showModeSelector, setShowModeSelector] = useState(true);
  const [showRefactorFlow, setShowRefactorFlow] = useState(false);
  const [psadtParsing, setPsadtParsing] = useState(false);
  const [psadtError, setPsadtError] = useState(null);
  const [psadtResult, setPsadtResult] = useState(null);
  const refactorInputRef = useRef(null);


  // Pending state for the conversion choice panel
  const [pendingPsadtFile, setPendingPsadtFile] = useState(null);
  const [pendingParsed, setPendingParsed] = useState(null);
  const [showConversionChoice, setShowConversionChoice] = useState(false);
  const [convertParsing, setConvertParsing] = useState(false);
  const [showIntunePicker, setShowIntunePicker] = useState(false);
  const [titleMismatchWarning, setTitleMismatchWarning] = useState(null);

  // Intune catalog — loaded from Graph API
  const [intuneCatalog, setIntuneCatalog] = useState(null);
  const [intuneCatalogLoading, setIntuneCatalogLoading] = useState(false);
  const [intuneCatalogError, setIntuneCatalogError] = useState(null);
  const [intuneRefreshing, setIntuneRefreshing] = useState(false);

  // ServiceNow queue
  const [showServiceNowQueue, setShowServiceNowQueue] = useState(false);

  // Project picker (edit existing)
  const [showProjectPicker, setShowProjectPicker] = useState(false);

  // ── PSADT file upload — parse metadata, then show conversion choice ────
  const handlePsadtUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    // Reset the file input so re-selecting the same file triggers onChange
    if (e.target) e.target.value = '';
    if (!files.length) return;
    setPsadtParsing(true);
    setPsadtError(null);
    setPsadtResult(null);
    try {
      const psFile = files.find(f => /Deploy-Application\.ps1$/i.test(f.name) || /Invoke-AppDeployToolkit\.ps1$/i.test(f.name))
        || files.find(f => f.name.endsWith('.ps1'));
      if (!psFile) throw new Error('No .ps1 script found. Please upload a Deploy-Application.ps1 or Invoke-AppDeployToolkit.ps1 file.');

      // Quick parse for metadata + variables only
      const parsed = await parsePsadtFile(psFile, 'refactor');
      setPendingPsadtFile(psFile);
      setPendingParsed(parsed);

      // ── Title mismatch check ─────────────────────────────────────────
      const intuneDisplayName = wizard.state.displayName;
      const psadtDisplayName = parsed.fields?.displayName || '';
      if (intuneDisplayName && psadtDisplayName) {
        const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (normalize(intuneDisplayName) !== normalize(psadtDisplayName)) {
          setTitleMismatchWarning({
            intuneName: intuneDisplayName,
            psadtName: psadtDisplayName,
          });
        } else {
          setTitleMismatchWarning(null);
        }
      } else {
        setTitleMismatchWarning(null);
      }

      setShowConversionChoice(true);
      setShowRefactorFlow(false);
    } catch (err) {
      // Keep refactor flow visible so the error message is shown
      setPsadtError(err.message);
    } finally {
      setPsadtParsing(false);
    }
  };

  // ── User chose Passthrough ─────────────────────────────────────────────
  const handlePassthrough = () => {
    const wizardFields = toWizardState(pendingParsed);
    setPsadtResult(pendingParsed);
    wizard.importPsadtState(pendingParsed, wizardFields, false);
    setShowConversionChoice(false);
    setShowModeSelector(false);
  };

  // ── User chose Convert to Lifecycle ────────────────────────────────────
  const handleConvertToLifecycle = async () => {
    setConvertParsing(true);
    setPsadtError(null);
    try {
      const fullParsed = await parsePsadtFile(pendingPsadtFile, 'refactor-convert');
      const wizardFields = toWizardState(fullParsed);
      setPsadtResult(fullParsed);
      wizard.importPsadtState(fullParsed, wizardFields, true);
      setShowConversionChoice(false);
      setShowModeSelector(false);
    } catch (err) {
      setPsadtError(err.message);
    } finally {
      setConvertParsing(false);
    }
  };

  const handleNewTitle = () => {
    setShowModeSelector(false);
  };

  // ── ServiceNow queue selection ──────────────────────────────────────
  const handleQueueSelect = (fields) => {
    // Pre-populate wizard with ServiceNow request data
    Object.entries(fields).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        wizard.updateField(key, value);
      }
    });
    setShowServiceNowQueue(false);
    setShowModeSelector(false);
  };

  // ── Edit Existing project selection ────────────────────────────────
  const handleProjectSelect = (files, projectMeta) => {
    wizard.importProjectForEdit(files, projectMeta);
    setShowProjectPicker(false);
    setShowModeSelector(false);
  };

  const handleStartOver = () => {
    wizard.reset();
    setShowModeSelector(true);
    setShowRefactorFlow(false);
    setShowConversionChoice(false);
    setPsadtResult(null);
    setPsadtError(null);
    setPendingPsadtFile(null);
    setPendingParsed(null);
    setTitleMismatchWarning(null);
    // Keep intuneCatalog cached — don't clear it on restart
  };

  // ── Intune Export import handler ───────────────────────────────────────
  const handleIntuneImport = (fields) => {
    wizard.importIntuneExport(fields);
  };

  // ── Load Intune catalog from Graph API ─────────────────────────────────
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



  const renderStep = () => {
    switch (currentStepId) {
      case 'basic':
        return <BasicInfoStep state={wizard.state} updateField={wizard.updateField} CATEGORIES={wizard.CATEGORIES} />;
      case 'platform':
        return <PlatformStep state={wizard.state} updateField={wizard.updateField} />;
      case 'psadt':
        return <PsadtLifecycleStep state={wizard.state} updateField={wizard.updateField} updateFields={wizard.updateFields} addAction={wizard.addAction} removeAction={wizard.removeAction} updateAction={wizard.updateAction} moveAction={wizard.moveAction} updateLifecycleRoot={wizard.updateLifecycleRoot} psadtResult={psadtResult} />;
      case 'installer':
        return <InstallerStep state={wizard.state} updateField={wizard.updateField} />;
      case 'detection':
        return <DetectionStep state={wizard.state} updateField={wizard.updateField} />;
      case 'intune':
        return <IntuneConfigStep state={wizard.state} updateField={wizard.updateField} />;
      case 'macos':
        return <MacConfigStep state={wizard.state} updateField={wizard.updateField} />;
      case 'review':
        return <ReviewStep state={wizard.state} updateField={wizard.updateField} />;
      default:
        return null;
    }
  };

  // ── Conversion choice panel ─────────────────────────────────────────────
  const renderConversionChoice = () => {
    const ver = pendingParsed?.psadtVersion || 'v3';
    const name = pendingParsed?.fields?.displayName || pendingParsed?.fileName || 'Script';

    return (
      <main className="app-main glass-panel">
        <div className="mode-selector">
          <h2 className="mode-selector__title">Script Parsed Successfully</h2>
          <p className="mode-selector__subtitle">
            <strong>{name}</strong> — detected as <code>{ver.toUpperCase()}</code>.
            How would you like to proceed?
          </p>

          {/* Title mismatch warning */}
          {titleMismatchWarning && (
            <div className="title-mismatch-warning">
              <span className="title-mismatch-warning__icon">⚠️</span>
              <div>
                <strong>Title mismatch detected</strong>
                <p className="title-mismatch-warning__detail">
                  Intune export: <strong>{titleMismatchWarning.intuneName}</strong><br />
                  PSADT script: <strong>{titleMismatchWarning.psadtName}</strong>
                </p>
                <p className="title-mismatch-warning__hint">
                  Verify these files belong to the same application, or choose a different script.
                </p>
                <button className="btn btn-secondary btn-sm" style={{ marginTop: '6px' }} onClick={() => {
                  setShowConversionChoice(false);
                  setShowRefactorFlow(true);
                  setPendingPsadtFile(null);
                  setPendingParsed(null);
                  setTitleMismatchWarning(null);
                }}>📄 Choose different .ps1</button>
              </div>
            </div>
          )}

          <div className="mode-selector__cards">
            <button className="mode-card" onClick={handlePassthrough} id="choice-passthrough">
              <span className="mode-card__icon">📋</span>
              <h3 className="mode-card__title">Passthrough</h3>
              <p className="mode-card__desc">
                Commit the script as-is. Metadata is extracted for Intune configuration, but lifecycle actions remain in the .ps1 file.
              </p>
              <span className="mode-card__upload-hint">Best for scripts you don't plan to edit through the workbench</span>
            </button>

            <button
              className="mode-card mode-card--refactor"
              onClick={handleConvertToLifecycle}
              disabled={convertParsing}
              id="choice-convert"
            >
              <span className="mode-card__icon">🔄</span>
              <h3 className="mode-card__title">Extract Actions</h3>
              <p className="mode-card__desc">
                Extract all actions into the interactive visual workbench. Edit, reorder, and manage actions with forms and cards.
              </p>
              <span className="mode-card__upload-hint">Original script is archived as a .bak reference file</span>
              {convertParsing && <span className="mode-card__status">⏳ Extracting actions...</span>}
            </button>
          </div>
          {psadtError && <p className="mode-card__status mode-card__status--err" style={{ marginBottom: 'var(--space-md)' }}>❌ {psadtError}</p>}
          <p className="mode-selector__hint">
            <button className="link-btn" onClick={handleStartOver}>← Choose a different file</button>
          </p>
        </div>
      </main>
    );
  };

  // ── Refactor flow panel ─────────────────────────────────────────────────
  const renderRefactorFlow = () => {
    const intuneImported = wizard.state._intuneExportImported;
    const psadtImported = !!psadtResult;
    const canContinue = intuneImported || psadtImported;

    return (
      <main className="app-main glass-panel">
        <div className="mode-selector">
          <h2 className="mode-selector__title">Refactor Existing Package</h2>
          <p className="mode-selector__subtitle">
            Import data from your existing Intune configuration and PSADT script to pre-populate the workbench.
          </p>

          <div className="refactor-flow">
            {/* Step 1: Intune Import */}
            <div className={`refactor-step ${intuneImported ? 'refactor-step--done' : ''}`}>
              <div className="refactor-step__header">
                <span className="refactor-step__number">{intuneImported ? '✅' : '1'}</span>
                <div>
                  <h3 className="refactor-step__title">Import from Intune</h3>
                  <p className="refactor-step__desc">
                    Select an existing Win32 app from Intune to pre-populate the workbench fields.
                  </p>
                </div>
              </div>

              {/* Graph API catalog actions */}
              <div className="refactor-step__folder">
                {!intuneCatalog && !intuneCatalogLoading && !intuneCatalogError && (
                  <button className="btn btn-secondary" onClick={() => loadIntuneCatalog()}>
                    📡 Load Intune Catalog
                  </button>
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
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ marginLeft: '8px' }}
                      onClick={() => loadIntuneCatalog(true)}
                      disabled={intuneRefreshing}
                    >
                      {intuneRefreshing ? '⏳ Refreshing...' : '🔄 Refresh'}
                    </button>
                  </span>
                )}
              </div>

              {/* Import button / result */}
              {intuneImported ? (
                <div className="refactor-step__result">
                  <span className="refactor-step__check">✅ Imported &mdash; {wizard.state.displayName}</span>
                  <button className="btn btn-ghost btn-sm" onClick={() => setShowIntunePicker(true)}>Change</button>
                </div>
              ) : intuneCatalog && intuneCatalog.length > 0 ? (
                <button className="btn btn-secondary" onClick={() => setShowIntunePicker(true)}>
                  📥 Browse Intune Catalog ({intuneCatalog.length} apps)
                </button>
              ) : null}

              {/* Manual JSON upload fallback */}
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
                        } catch (err) {
                          alert(`Failed to parse JSON: ${err.message}`);
                        }
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
                  <p className="refactor-step__desc">
                    Upload your <code>Deploy-Application.ps1</code> or <code>Invoke-AppDeployToolkit.ps1</code> to extract lifecycle actions and variables.
                  </p>
                </div>
              </div>
              <button
                className="btn btn-secondary"
                onClick={() => refactorInputRef.current?.click()}
                disabled={psadtParsing}
              >
                📄 {psadtParsing ? 'Analyzing script...' : 'Upload .ps1 Script'}
              </button>
              {psadtParsing && (
                <div className="refactor-step__progress">
                  <div className="progress-bar progress-bar--indeterminate" />
                  <span className="refactor-step__folder-info">Parsing PSADT script — extracting metadata and variables...</span>
                </div>
              )}
              <input
                ref={refactorInputRef}
                type="file"
                accept=".ps1"
                onChange={handlePsadtUpload}
                style={{ display: 'none' }}
              />
              {psadtError && <span className="mode-card__status mode-card__status--err">❌ {psadtError}</span>}
              <span className="refactor-step__optional">Supported: v3 and v4 PSADT scripts</span>
            </div>
          </div>

          {/* Continue / Back */}
          <div className="refactor-flow__actions">
            {canContinue && (
              <button className="btn btn-primary" onClick={() => { setShowRefactorFlow(false); setShowModeSelector(false); }}>
                Continue to Wizard →
              </button>
            )}
            <button className="link-btn" onClick={handleStartOver}>← Back to mode selection</button>
          </div>
        </div>
      </main>
    );
  };

  return (
    <div className="app">
      {/* Header */}
      <header className="app-header">
        <div className="app-header__brand">
          <span className="app-header__logo">📦</span>
          <div>
            <h1 className="app-header__title">SPA Packaging Workbench</h1>
            <p className="app-header__subtitle">Software Package Automation — Title Scaffolding</p>
          </div>
        </div>
        {!showModeSelector && !showConversionChoice && !showRefactorFlow && (
          <button className="btn btn-ghost" onClick={handleStartOver}>
            ↻ Start Over
          </button>
        )}
      </header>

      {/* Flow: Mode Selector → Refactor Flow / Conversion Choice → Wizard */}
      {showConversionChoice ? (
        renderConversionChoice()
      ) : showRefactorFlow ? (
        renderRefactorFlow()
      ) : showModeSelector ? (
        <main className="app-main glass-panel">
          <div className="mode-selector">
            <h2 className="mode-selector__title">What would you like to do?</h2>
            <p className="mode-selector__subtitle">Create a new application package or refactor an existing one.</p>
            <div className="mode-selector__cards">
              <button className="mode-card" onClick={() => setShowServiceNowQueue(true)} id="mode-new-title">
                <span className="mode-card__icon">📥</span>
                <h3 className="mode-card__title">New from Queue</h3>
                <p className="mode-card__desc">Pick a packaging request from the ServiceNow intake queue to pre-populate the workbench.</p>
                <span className="mode-card__upload-hint">ServiceNow request → Workbench</span>
              </button>

              <button className="mode-card" onClick={handleNewTitle} id="mode-blank-title">
                <span className="mode-card__icon">🆕</span>
                <h3 className="mode-card__title">New (Blank)</h3>
                <p className="mode-card__desc">Start from scratch — define app metadata, detection, and PSADT actions interactively.</p>
              </button>

              <button className="mode-card mode-card--refactor" onClick={() => setShowRefactorFlow(true)} id="mode-refactor-title">
                <span className="mode-card__icon">🔄</span>
                <h3 className="mode-card__title">Refactor Existing</h3>
                <p className="mode-card__desc">Import from your Intune catalog and PSADT script to pre-populate the workbench with existing configuration.</p>
                <span className="mode-card__upload-hint">Intune export + PSADT script import</span>
              </button>

              <button className="mode-card mode-card--edit" onClick={() => setShowProjectPicker(true)} id="mode-edit-title">
                <span className="mode-card__icon">✏️</span>
                <h3 className="mode-card__title">Edit Existing</h3>
                <p className="mode-card__desc">Open a published SPA project from GitLab, edit its configuration, and push updates.</p>
                <span className="mode-card__upload-hint">GitLab project → Workbench</span>
              </button>
            </div>

            <p className="mode-selector__hint">
              Supported: <code>Deploy-Application.ps1</code> (v3) and <code>Invoke-AppDeployToolkit.ps1</code> (v4)
            </p>
          </div>
        </main>
      ) : (
        <>
          {/* Stepper */}
          <WizardStepper
            steps={wizard.steps}
            currentStep={wizard.currentStep}
            onStepClick={wizard.goToStep}
          />

          {/* Main content */}
          <main className="app-main glass-panel">
            {renderStep()}
          </main>

          {/* Navigation */}
          <div className="app-nav">
            <button
              className="btn btn-secondary"
              onClick={wizard.prevStep}
              disabled={wizard.currentStep === 0}
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
                disabled={!wizard.canProceed}
              >
                Next →
              </button>
            ) : (
              <div />
            )}
          </div>
        </>
      )}

      {/* Intune Export Picker Modal */}
      {showIntunePicker && (
        <IntuneExportPicker
          onImport={handleIntuneImport}
          onClose={() => setShowIntunePicker(false)}
          catalogData={intuneCatalog}
          fetchDetail={fetchIntuneAppDetail}
        />
      )}

      {/* ServiceNow Queue Modal */}
      {showServiceNowQueue && (
        <ServiceNowQueue
          onSelect={handleQueueSelect}
          onClose={() => setShowServiceNowQueue(false)}
        />
      )}

      {/* Project Picker Modal (Edit Existing) */}
      {showProjectPicker && (
        <ProjectPicker
          onSelect={handleProjectSelect}
          onClose={() => setShowProjectPicker(false)}
        />
      )}

      <style>{`
        .app {
          max-width: 1100px;
          margin: 0 auto;
          padding: var(--space-lg) var(--space-xl);
          min-height: 100vh;
          display: flex;
          flex-direction: column;
        }
        .app-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--space-lg) 0;
          margin-bottom: var(--space-sm);
        }
        .app-header__brand {
          display: flex;
          align-items: center;
          gap: var(--space-md);
        }
        .app-header__logo {
          font-size: 2.2rem;
          filter: drop-shadow(0 2px 10px rgba(99, 140, 255, 0.3));
        }
        .app-header__title {
          font-size: 1.4rem;
          font-weight: 700;
          background: var(--accent-gradient);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          letter-spacing: -0.01em;
        }
        .app-header__subtitle {
          font-size: 0.78rem;
          color: var(--text-muted);
          margin-top: 2px;
        }
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

        /* ── Mode Selector ── */
        .mode-selector {
          padding: var(--space-xl);
          text-align: center;
        }
        .mode-selector__title {
          font-size: 1.5rem;
          font-weight: 700;
          background: var(--accent-gradient);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          margin-bottom: var(--space-sm);
        }
        .mode-selector__subtitle {
          color: var(--text-secondary);
          font-size: 0.95rem;
          margin-bottom: var(--space-xl);
        }
        .mode-selector__cards {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: var(--space-lg);
          max-width: 800px;
          margin: 0 auto var(--space-lg);
        }
        @media (max-width: 640px) {
          .mode-selector__cards { grid-template-columns: 1fr; }
        }
        .mode-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: var(--space-sm);
          padding: var(--space-xl) var(--space-lg);
          background: var(--bg-card, rgba(255,255,255,0.03));
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-lg, 12px);
          cursor: pointer;
          transition: all 0.2s ease;
          text-align: center;
          font-family: inherit;
          color: inherit;
        }
        .mode-card:hover {
          border-color: var(--text-accent, #7c8aff);
          background: var(--bg-hover, rgba(255,255,255,0.06));
          transform: translateY(-2px);
          box-shadow: 0 8px 32px rgba(99, 140, 255, 0.12);
        }
        .mode-card__icon {
          font-size: 2.5rem;
          margin-bottom: var(--space-sm);
        }
        .mode-card__title {
          font-size: 1.1rem;
          font-weight: 600;
          color: var(--text-primary);
        }
        .mode-card__desc {
          font-size: 0.82rem;
          color: var(--text-muted);
          line-height: 1.5;
        }
        .mode-card__status {
          font-size: 0.8rem;
          color: var(--text-secondary);
          margin-top: var(--space-sm);
        }
        .mode-card__status--err {
          color: var(--color-error, #ef4444);
        }
        .mode-card__upload-btn {
          cursor: pointer;
          font-size: 0.82rem;
          padding: 8px 16px;
          margin-top: var(--space-md);
        }
        .mode-card__upload-hint {
          font-size: 0.72rem;
          color: var(--text-muted);
          opacity: 0.7;
          margin-top: var(--space-xs, 4px);
        }
        .mode-card--edit:hover {
          border-color: rgba(52, 211, 153, 0.35);
          background: rgba(52, 211, 153, 0.04);
        }
        /* ── Refactor Flow Panel ── */
        .refactor-flow {
          display: flex;
          flex-direction: column;
          gap: var(--space-md);
          max-width: 600px;
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
        .refactor-step--done {
          border-color: rgba(34, 197, 94, 0.3);
          background: rgba(34, 197, 94, 0.04);
        }
        .refactor-step__header {
          display: flex;
          align-items: flex-start;
          gap: var(--space-md);
        }
        .refactor-step__number {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: rgba(124, 138, 255, 0.12);
          color: var(--text-accent, #7c8aff);
          font-weight: 700;
          font-size: 0.85rem;
          flex-shrink: 0;
        }
        .refactor-step--done .refactor-step__number {
          background: rgba(34, 197, 94, 0.12);
          font-size: 1rem;
        }
        .refactor-step__title {
          font-size: 0.95rem;
          font-weight: 600;
          color: var(--text-primary);
          margin: 0;
        }
        .refactor-step__desc {
          font-size: 0.78rem;
          color: var(--text-muted);
          margin: 2px 0 0;
          line-height: 1.5;
        }
        .refactor-step__desc code {
          background: var(--bg-hover);
          padding: 1px 4px;
          border-radius: 3px;
          font-size: 0.73rem;
        }
        .refactor-step__result {
          display: flex;
          align-items: center;
          gap: var(--space-sm);
        }
        .refactor-step__check {
          font-size: 0.82rem;
          color: #4ade80;
          font-weight: 500;
        }
        .refactor-step__optional {
          font-size: 0.7rem;
          color: var(--text-muted);
          opacity: 0.6;
        }
        .refactor-step__folder {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: var(--space-sm);
        }
        .refactor-step__folder-info {
          font-size: 0.78rem;
          color: var(--text-secondary);
        }
        .refactor-step__folder-info strong {
          color: #4ade80;
        }
        .refactor-step__error {
          display: flex;
          align-items: center;
          gap: var(--space-sm);
          color: var(--color-error);
          font-size: 0.85rem;
        }
        .refactor-step__fallback {
          margin-top: 4px;
        }
        .refactor-step__progress {
          display: flex;
          flex-direction: column;
          gap: 6px;
          width: 100%;
        }
        .progress-bar {
          height: 6px;
          background: rgba(124, 138, 255, 0.12);
          border-radius: 3px;
          overflow: hidden;
          position: relative;
        }
        .progress-bar__fill {
          height: 100%;
          background: linear-gradient(90deg, #7c8aff, #a78bfa);
          border-radius: 3px;
          transition: width 0.15s ease-out;
        }
        .progress-bar--indeterminate {
          height: 6px;
          background: rgba(124, 138, 255, 0.12);
          border-radius: 3px;
          overflow: hidden;
          position: relative;
        }
        .progress-bar--indeterminate::after {
          content: '';
          position: absolute;
          top: 0;
          left: -40%;
          width: 40%;
          height: 100%;
          background: linear-gradient(90deg, transparent, #7c8aff, #a78bfa, transparent);
          border-radius: 3px;
          animation: progress-shimmer 1.2s ease-in-out infinite;
        }
        @keyframes progress-shimmer {
          0%   { left: -40%; }
          100% { left: 100%; }
        }
        .refactor-flow__actions {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: var(--space-sm);
          margin-top: var(--space-md);
        }

        .title-mismatch-warning {
          display: flex;
          align-items: flex-start;
          gap: var(--space-md);
          padding: 12px var(--space-md);
          margin-bottom: var(--space-lg);
          background: rgba(245, 158, 11, 0.08);
          border: 1px solid rgba(245, 158, 11, 0.25);
          border-left: 3px solid #f59e0b;
          border-radius: var(--radius-sm);
          font-size: 0.82rem;
          color: var(--text-primary);
          line-height: 1.5;
        }
        .title-mismatch-warning__icon {
          font-size: 1.2rem;
          flex-shrink: 0;
          margin-top: 1px;
        }
        .title-mismatch-warning__detail {
          margin: 4px 0 6px;
          font-size: 0.8rem;
          color: var(--text-secondary);
        }
        .title-mismatch-warning__detail strong {
          color: #fbbf24;
        }
        .title-mismatch-warning__hint {
          font-size: 0.75rem;
          color: var(--text-muted);
          margin: 0;
        }

        .mode-selector__hint {
          font-size: 0.75rem;
          color: var(--text-muted);
        }
        .mode-selector__hint code {
          background: var(--bg-hover);
          padding: 1px 5px;
          border-radius: var(--radius-sm);
          font-size: 0.73rem;
        }
      `}</style>
    </div>
  );
}
