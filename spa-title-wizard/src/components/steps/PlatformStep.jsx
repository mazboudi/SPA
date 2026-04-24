export default function PlatformStep({ state, updateField }) {
  const platforms = [
    {
      value: 'windows',
      icon: '🪟',
      label: 'Windows',
      description: 'Intune + PSADT deployment',
      features: ['MSI / EXE packaging', 'Intune Win32 app', 'Registry / File / Script detection'],
    },
    {
      value: 'macos',
      icon: '🍎',
      label: 'macOS',
      description: 'Jamf Pro + Terraform deployment',
      features: ['PKG / DMG packaging', 'Jamf policy & scope', 'Extension attribute tracking'],
    },
    {
      value: 'both',
      icon: '🔀',
      label: 'Both Platforms',
      description: 'Dual-platform deployment',
      features: ['Windows + macOS configs', 'Separate CI pipelines', 'Unified title scaffolding'],
    },
  ];

  return (
    <div className="step-content animate-in">
      <div className="step-header">
        <h2>🖥️ Target Platform</h2>
        <p>Select the deployment target(s). This determines which configuration files are generated.</p>
      </div>

      <div className="platform-cards">
        {platforms.map(p => (
          <button
            key={p.value}
            className={`platform-card ${state.platform === p.value ? 'platform-card--selected' : ''}`}
            onClick={() => updateField('platform', p.value)}
            type="button"
          >
            <div className="platform-card__icon">{p.icon}</div>
            <h3 className="platform-card__title">{p.label}</h3>
            <p className="platform-card__desc">{p.description}</p>
            <ul className="platform-card__features">
              {p.features.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
            {state.platform === p.value && (
              <div className="platform-card__check">✓</div>
            )}
          </button>
        ))}
      </div>

      <style>{`
        .platform-cards {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: var(--space-lg);
        }
        @media (max-width: 900px) {
          .platform-cards { grid-template-columns: 1fr; }
        }
        .platform-card {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          padding: var(--space-xl) var(--space-lg);
          background: var(--bg-card);
          border: 2px solid var(--border-subtle);
          border-radius: var(--radius-lg);
          cursor: pointer;
          transition: all var(--transition-base);
          font-family: var(--font-sans);
          color: var(--text-primary);
        }
        .platform-card:hover {
          border-color: var(--border-focus);
          transform: translateY(-4px);
          box-shadow: 0 8px 30px rgba(99, 140, 255, 0.1);
        }
        .platform-card--selected {
          border-color: var(--accent-primary);
          background: rgba(99, 140, 255, 0.08);
          box-shadow: 0 0 30px rgba(99, 140, 255, 0.15), inset 0 0 30px rgba(99, 140, 255, 0.05);
        }
        .platform-card__icon {
          font-size: 3rem;
          margin-bottom: var(--space-md);
          filter: drop-shadow(0 2px 8px rgba(0,0,0,0.3));
        }
        .platform-card__title {
          font-size: 1.15rem;
          font-weight: 700;
          margin-bottom: var(--space-xs);
        }
        .platform-card__desc {
          font-size: 0.8rem;
          color: var(--text-secondary);
          margin-bottom: var(--space-md);
        }
        .platform-card__features {
          list-style: none;
          text-align: left;
          width: 100%;
        }
        .platform-card__features li {
          font-size: 0.78rem;
          color: var(--text-muted);
          padding: 3px 0;
        }
        .platform-card__features li::before {
          content: '→ ';
          color: var(--accent-primary);
        }
        .platform-card__check {
          position: absolute;
          top: 12px;
          right: 12px;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: var(--accent-gradient);
          color: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.8rem;
          font-weight: 700;
          animation: fadeInUp 0.2s ease;
        }
      `}</style>
    </div>
  );
}
