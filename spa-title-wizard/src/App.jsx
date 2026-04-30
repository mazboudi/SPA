import { useState } from 'react';
import useWizardState from './hooks/useWizardState';
import WizardStepper from './components/WizardStepper';
import BasicInfoStep from './components/steps/BasicInfoStep';
import PlatformStep from './components/steps/PlatformStep';
import PsadtLifecycleStep from './components/steps/PsadtLifecycleStep';
import InstallerDetectionStep from './components/steps/InstallerDetectionStep';
import IntuneConfigStep from './components/steps/IntuneConfigStep';
import MacConfigStep from './components/steps/MacConfigStep';
import ReviewStep from './components/steps/ReviewStep';
import { parsePsadtFile, toWizardState } from './lib/parsePsadt';

export default function App() {
  const wizard = useWizardState();
  const currentStepId = wizard.steps[wizard.currentStep]?.id;
  const [showModeSelector, setShowModeSelector] = useState(true);
  const [psadtParsing, setPsadtParsing] = useState(false);
  const [psadtError, setPsadtError] = useState(null);
  const [psadtResult, setPsadtResult] = useState(null);

  // ── PSADT file/folder upload handler (Refactor mode) ─────────────────
  const handlePsadtUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setPsadtParsing(true);
    setPsadtError(null);
    setPsadtResult(null);
    try {
      // Find the .ps1 script (Deploy-Application.ps1 or Invoke-AppDeployToolkit.ps1)
      const psFile = files.find(f => /Deploy-Application\.ps1$/i.test(f.name) || /Invoke-AppDeployToolkit\.ps1$/i.test(f.name))
        || files.find(f => f.name.endsWith('.ps1'));
      if (!psFile) throw new Error('No .ps1 script found in upload. Upload a Deploy-Application.ps1 or Invoke-AppDeployToolkit.ps1 file.');

      // Parse in refactor mode (variables only, no phase parsing)
      const parsed = await parsePsadtFile(psFile, 'refactor');
      const wizardFields = toWizardState(parsed);

      // Collect supplementary files (Files/, SupportFiles/, config) for scaffolding
      // Must be attached BEFORE setPsadtResult so React state has the complete object
      const packageFiles = files.filter(f => f !== psFile).map(f => ({
        name: f.webkitRelativePath || f.name,
        file: f,
      }));
      parsed.packageFiles = packageFiles;

      setPsadtResult(parsed);
      wizard.importPsadtState(parsed, wizardFields);
      setShowModeSelector(false);
    } catch (err) {
      setPsadtError(err.message);
    } finally {
      setPsadtParsing(false);
    }
  };

  const handleNewTitle = () => {
    setShowModeSelector(false);
  };

  const handleStartOver = () => {
    wizard.reset();
    setShowModeSelector(true);
    setPsadtResult(null);
    setPsadtError(null);
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
        return <InstallerDetectionStep state={wizard.state} updateField={wizard.updateField} />;
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
        {!showModeSelector && (
          <button className="btn btn-ghost" onClick={handleStartOver}>
            ↻ Start Over
          </button>
        )}
      </header>

      {/* Mode Selector (pre-step gate) */}
      {showModeSelector ? (
        <main className="app-main glass-panel">
          <div className="mode-selector">
            <h2 className="mode-selector__title">What would you like to do?</h2>
            <p className="mode-selector__subtitle">Create a new title or refactor an existing PSADT package.</p>
            <div className="mode-selector__cards">
              <button className="mode-card" onClick={handleNewTitle} id="mode-new-title">
                <span className="mode-card__icon">🆕</span>
                <h3 className="mode-card__title">New Title</h3>
                <p className="mode-card__desc">Start from scratch — define app metadata, detection, and lifecycle phases interactively.</p>
              </button>

              <label className="mode-card mode-card--refactor" id="mode-refactor-title">
                <span className="mode-card__icon">🔄</span>
                <h3 className="mode-card__title">Refactor Existing</h3>
                <p className="mode-card__desc">Upload a PSADT package folder or script &mdash; we&apos;ll extract metadata and pass the script to the pipeline.</p>
                <input
                  type="file"
                  multiple
                  webkitdirectory=""
                  onChange={handlePsadtUpload}
                  style={{ display: 'none' }}
                />
                {psadtParsing && <span className="mode-card__status">⏳ Parsing script...</span>}
                {psadtError && <span className="mode-card__status mode-card__status--err">❌ {psadtError}</span>}
              </label>
            </div>
            <p className="mode-selector__hint">
              Upload a folder or <code>.ps1</code> file &bull; Supported: <code>Deploy-Application.ps1</code> (v3) and <code>Invoke-AppDeployToolkit.ps1</code> (v4)
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

