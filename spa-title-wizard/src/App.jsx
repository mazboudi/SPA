import useWizardState from './hooks/useWizardState';
import WizardStepper from './components/WizardStepper';
import BasicInfoStep from './components/steps/BasicInfoStep';
import PlatformStep from './components/steps/PlatformStep';
import WindowsConfigStep from './components/steps/WindowsConfigStep';
import MacConfigStep from './components/steps/MacConfigStep';
import ReviewStep from './components/steps/ReviewStep';

export default function App() {
  const wizard = useWizardState();
  const currentStepId = wizard.steps[wizard.currentStep]?.id;

  const renderStep = () => {
    switch (currentStepId) {
      case 'basic':
        return <BasicInfoStep state={wizard.state} updateField={wizard.updateField} CATEGORIES={wizard.CATEGORIES} />;
      case 'platform':
        return <PlatformStep state={wizard.state} updateField={wizard.updateField} />;
      case 'windows':
        return <WindowsConfigStep state={wizard.state} updateField={wizard.updateField} updateLifecycle={wizard.updateLifecycle} updateLifecycleRoot={wizard.updateLifecycleRoot} />;
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
            <h1 className="app-header__title">SPA Title Wizard</h1>
            <p className="app-header__subtitle">Software Package Automation — New Title Scaffolding</p>
          </div>
        </div>
        {wizard.currentStep > 0 && (
          <button className="btn btn-ghost" onClick={wizard.reset}>
            ↻ Start Over
          </button>
        )}
      </header>

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
      `}</style>
    </div>
  );
}
