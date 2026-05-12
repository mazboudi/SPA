import { useState, useRef } from 'react';
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
import { parsePsadtFile, toWizardState } from './lib/parsePsadt';

export default function App() {
  const wizard = useWizardState();
  const currentStepId = wizard.steps[wizard.currentStep]?.id;
  const [showModeSelector, setShowModeSelector] = useState(true);
  const [showRefactorFlow, setShowRefactorFlow] = useState(false);
  const [psadtParsing, setPsadtParsing] = useState(false);
  const [psadtError, setPsadtError] = useState(null);
  const [psadtResult, setPsadtResult] = useState(null);
  const refactorInputRef = useRef(null);
  const intuneFolderInputRef = useRef(null);

  // Pending state for the conversion choice panel
  const [pendingPsadtFile, setPendingPsadtFile] = useState(null);
  const [pendingParsed, setPendingParsed] = useState(null);
  const [showConversionChoice, setShowConversionChoice] = useState(false);
  const [convertParsing, setConvertParsing] = useState(false);
  const [showIntunePicker, setShowIntunePicker] = useState(false);

  // Intune export catalog — loaded from user-selected folder
  const [intuneCatalog, setIntuneCatalog] = useState(null);   // [{appId, displayName, publisher, version, fileName}]
  const [intuneExports, setIntuneExports] = useState(null);   // Map<fileName, parsedJSON>
  const [intuneSourceLoading, setIntuneSourceLoading] = useState(false);
  const [intuneSourcePath, setIntuneSourcePath] = useState('');

  // ── PSADT file upload — parse metadata, then show conversion choice ────
  const handlePsadtUpload = async (e) => {
    const files = Array.from(e.target.files || []);
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
      setShowConversionChoice(true);
      setShowRefactorFlow(false);
    } catch (err) {
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

  const handleStartOver = () => {
    wizard.reset();
    setShowModeSelector(true);
    setShowRefactorFlow(false);
    setShowConversionChoice(false);
    setPsadtResult(null);
    setPsadtError(null);
    setPendingPsadtFile(null);
    setPendingParsed(null);
    setIntuneCatalog(null);
    setIntuneExports(null);
    setIntuneSourcePath('');
  };

  // ── Intune Export import handler ───────────────────────────────────────
  const handleIntuneImport = (fields) => {
    wizard.importIntuneExport(fields);
  };

  // ── Intune export folder selection ──────────────────────────────────────
  const handleIntuneFolderSelect = async (e) => {
    const files = Array.from(e.target.files || []);
    const jsonFiles = files.filter(f => f.name.endsWith('.json'));
    if (!jsonFiles.length) return;

    setIntuneSourceLoading(true);
    setIntuneCatalog(null);
    setIntuneExports(null);

    // Derive the folder path from the first file's webkitRelativePath
    const firstPath = jsonFiles[0].webkitRelativePath || '';
    const folderName = firstPath.split('/')[0] || 'Selected folder';
    setIntuneSourcePath(folderName);

    try {
      const catalog = [];
      const exports = new Map();

      for (const file of jsonFiles) {
        try {
          const text = await file.text();
          const data = JSON.parse(text);
          const app = data.app || {};
          const entry = {
            appId: data.appId || app.id || '',
            displayName: data.displayName || app.displayName || file.name.replace('.json', ''),
            publisher: app.publisher || '',
            version: app.displayVersion || '',
            description: app.description || '',
            fileName: file.name,
          };
          catalog.push(entry);
          exports.set(file.name, data);
        } catch {
          // Skip malformed JSON files
        }
      }

      catalog.sort((a, b) => a.displayName.localeCompare(b.displayName));
      setIntuneCatalog(catalog);
      setIntuneExports(exports);
    } finally {
      setIntuneSourceLoading(false);
    }
  };

  const renderStep = () => {
    switch (currentStepId) {
      case 'basic':
        return <BasicInfoStep state={wizard.state} updateField={wizard.updateField} CATEGORIES={wizard.CATEGORIES} />;
      case 'platform':
        return <PlatformStep state={wizard.state} updateField={wizard.updateField} />;
      case 'psadt':
        return <PsadtLifecycleStep state={wizard.state} updateField={wizard.updateField} addAction={wizard.addAction} removeAction={wizard.removeAction} updateAction={wizard.updateAction} moveAction={wizard.moveAction} updateLifecycleRoot={wizard.updateLifecycleRoot} psadtResult={psadtResult} />;
      case 'installer':
        return <InstallerStep state={wizard.state} updateField={wizard.updateField} />;
      case 'detection':
        return <DetectionStep state={wizard.state} updateField={wizard.updateField} />;
      case 'intune':
        return <IntuneConfigStep state={wizard.state} updateField={wizard.updateField} />;
      case 'macos':
        return <MacConfigStep state={wizard.state} updateField={wizard.updateField} />;
      case 'review':
        return <ReviewStep state={wizard.state} />;
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
              <h3 className="mode-card__title">Convert to Lifecycle</h3>
              <p className="mode-card__desc">
                Extract all lifecycle actions into <code>lifecycle.yaml</code> for full control. Edit, reorder, and manage actions through the workbench.
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
                  <h3 className="refactor-step__title">Import from Intune Catalog</h3>
                  <p className="refactor-step__desc">
                    Select the folder containing your Intune export JSON files, then choose an app to import.
                  </p>
                </div>
              </div>

              {/* Folder selector */}
              <div className="refactor-step__folder">
                <button
                  className="btn btn-secondary"
                  onClick={() => intuneFolderInputRef.current?.click()}
                  disabled={intuneSourceLoading}
                >
                  📁 {intuneSourceLoading ? 'Loading...' : intuneCatalog ? 'Change Folder' : 'Select Export Folder'}
                </button>
                <input
                  ref={intuneFolderInputRef}
                  type="file"
                  webkitdirectory="true"
                  onChange={handleIntuneFolderSelect}
                  style={{ display: 'none' }}
                />
                {intuneCatalog && (
                  <span className="refactor-step__folder-info">
                    📂 <strong>{intuneSourcePath}</strong> — {intuneCatalog.length} app{intuneCatalog.length !== 1 ? 's' : ''} found
                  </span>
                )}
                {intuneSourceLoading && (
                  <span className="refactor-step__folder-info">⏳ Reading JSON files...</span>
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
              <span className="refactor-step__optional">Optional — but recommended for full field coverage</span>
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
                📄 {psadtParsing ? 'Parsing...' : 'Upload .ps1 Script'}
              </button>
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
              <button className="mode-card" onClick={handleNewTitle} id="mode-new-title">
                <span className="mode-card__icon">🆕</span>
                <h3 className="mode-card__title">New Application</h3>
                <p className="mode-card__desc">Start from scratch — define app metadata, detection, and lifecycle phases interactively.</p>
              </button>

              <button className="mode-card mode-card--refactor" onClick={() => setShowRefactorFlow(true)} id="mode-refactor-title">
                <span className="mode-card__icon">🔄</span>
                <h3 className="mode-card__title">Refactor Existing</h3>
                <p className="mode-card__desc">Import from your Intune catalog and PSADT script to pre-populate the workbench with existing configuration.</p>
                <span className="mode-card__upload-hint">Intune export + PSADT script import</span>
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
          exportsData={intuneExports}
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
          grid-template-columns: 1fr 1fr;
          gap: var(--space-lg);
          max-width: 700px;
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
        .refactor-flow__actions {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: var(--space-sm);
          margin-top: var(--space-md);
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
