export default function ToggleSwitch({ label, checked, onChange, id }) {
  return (
    <div className="toggle-wrap">
      <button
        type="button"
        role="switch"
        id={id}
        aria-checked={checked}
        className={`toggle-switch ${checked ? 'toggle-switch--on' : ''}`}
        onClick={() => onChange(!checked)}
      >
        <span className="toggle-switch__thumb" />
      </button>
      {label && (
        <label htmlFor={id} className="toggle-switch__label" onClick={() => onChange(!checked)}>
          {label}
        </label>
      )}

      <style>{`
        .toggle-wrap {
          display: flex;
          align-items: center;
          gap: var(--space-sm);
          margin-bottom: var(--space-md);
        }
        .toggle-switch {
          position: relative;
          width: 44px;
          height: 24px;
          background: var(--bg-hover);
          border: 1px solid var(--border-default);
          border-radius: 12px;
          cursor: pointer;
          transition: all var(--transition-fast);
          flex-shrink: 0;
        }
        .toggle-switch--on {
          background: var(--accent-primary);
          border-color: var(--accent-primary);
        }
        .toggle-switch__thumb {
          position: absolute;
          top: 2px;
          left: 2px;
          width: 18px;
          height: 18px;
          background: #fff;
          border-radius: 50%;
          transition: transform var(--transition-fast);
          box-shadow: 0 1px 3px rgba(0,0,0,0.3);
        }
        .toggle-switch--on .toggle-switch__thumb {
          transform: translateX(20px);
        }
        .toggle-switch__label {
          font-size: 0.85rem;
          color: var(--text-secondary);
          cursor: pointer;
          user-select: none;
        }
      `}</style>
    </div>
  );
}
