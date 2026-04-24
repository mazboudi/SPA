export default function WizardStepper({ steps, currentStep, onStepClick }) {
  return (
    <nav className="wizard-stepper" aria-label="Wizard progress">
      <div className="wizard-stepper__track">
        {steps.map((step, i) => {
          const isActive = i === currentStep;
          const isCompleted = i < currentStep;
          const classes = [
            'wizard-stepper__step',
            isActive && 'wizard-stepper__step--active',
            isCompleted && 'wizard-stepper__step--completed',
          ].filter(Boolean).join(' ');

          return (
            <button
              key={step.id}
              className={classes}
              onClick={() => isCompleted && onStepClick(i)}
              disabled={!isCompleted && !isActive}
              aria-current={isActive ? 'step' : undefined}
            >
              <span className="wizard-stepper__icon">
                {isCompleted ? '✓' : step.icon}
              </span>
              <span className="wizard-stepper__label">{step.label}</span>
              {i < steps.length - 1 && <span className="wizard-stepper__connector" />}
            </button>
          );
        })}
      </div>

      <style>{`
        .wizard-stepper {
          padding: var(--space-lg) var(--space-xl);
          margin-bottom: var(--space-lg);
        }
        .wizard-stepper__track {
          display: flex;
          align-items: center;
          gap: 0;
          position: relative;
        }
        .wizard-stepper__step {
          display: flex;
          align-items: center;
          gap: var(--space-sm);
          background: none;
          border: none;
          color: var(--text-muted);
          font-family: var(--font-sans);
          font-size: 0.8rem;
          font-weight: 500;
          cursor: default;
          padding: var(--space-sm) var(--space-md);
          border-radius: var(--radius-sm);
          transition: all var(--transition-fast);
          white-space: nowrap;
          position: relative;
        }
        .wizard-stepper__step--completed {
          color: var(--color-success);
          cursor: pointer;
        }
        .wizard-stepper__step--completed:hover {
          background: var(--bg-hover);
        }
        .wizard-stepper__step--active {
          color: var(--text-primary);
          background: var(--bg-elevated);
          border: 1px solid var(--border-focus);
          box-shadow: 0 0 12px rgba(99, 140, 255, 0.15);
        }
        .wizard-stepper__icon {
          font-size: 1rem;
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          background: var(--bg-surface);
          flex-shrink: 0;
        }
        .wizard-stepper__step--active .wizard-stepper__icon {
          background: var(--accent-gradient);
        }
        .wizard-stepper__step--completed .wizard-stepper__icon {
          background: rgba(52, 211, 153, 0.15);
          color: var(--color-success);
          font-size: 0.75rem;
          font-weight: 700;
        }
        .wizard-stepper__connector {
          display: block;
          width: 32px;
          height: 1px;
          background: var(--border-default);
          margin-left: var(--space-sm);
          flex-shrink: 0;
        }
        .wizard-stepper__step--completed .wizard-stepper__connector {
          background: var(--color-success);
        }
        .wizard-stepper__label {
          display: none;
        }
        @media (min-width: 768px) {
          .wizard-stepper__label { display: inline; }
        }
      `}</style>
    </nav>
  );
}
