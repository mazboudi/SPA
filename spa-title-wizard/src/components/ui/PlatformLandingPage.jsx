/**
 * PlatformLandingPage.jsx
 * Landing page shown after the user selects a platform from the Home screen.
 */

const WIN_ACTIONS = [
  {
    id: 'queue',
    icon: '📋',
    title: 'New from Queue',
    desc: 'Pick a request from the ServiceNow queue and the workbench pre-fills with the ticket details.',
    cta: 'Browse Queue →',
    primary: true,
  },
  {
    id: 'blank',
    icon: '📄',
    title: 'New Blank Title',
    desc: 'Start from scratch. Enter all title metadata manually and build the full deployment.',
    cta: 'Create Blank →',
  },
  {
    id: 'edit',
    icon: '✏️',
    title: 'Edit Title',
    desc: 'Load an existing title from GitLab to modify metadata, lifecycle scripts, or Intune settings.',
    cta: 'Browse Titles →',
  },
  {
    id: 'refactor',
    icon: '🔄',
    title: 'Intune Import',
    desc: 'Import a Win32 app from Intune and optionally upload a legacy PSADT script to migrate it.',
    cta: 'Import from Intune →',
  },
];

const MAC_ACTIONS = [
  {
    id: 'queue',
    icon: '📋',
    title: 'New from Queue',
    desc: 'Pick a request from the ServiceNow queue and the workbench pre-fills with the ticket details.',
    cta: 'Browse Queue →',
    primary: true,
  },
  {
    id: 'blank',
    icon: '📄',
    title: 'New Blank Title',
    desc: 'Start from scratch. Enter all title metadata manually and build the full macOS deployment.',
    cta: 'Create Blank →',
  },
  {
    id: 'edit',
    icon: '✏️',
    title: 'Edit Title',
    desc: 'Load an existing macOS title from GitLab to modify metadata or deployment configuration.',
    cta: 'Browse Titles →',
  },
];

const WIN_TIPS = [
  <>Use <strong>New from Queue</strong> whenever a ServiceNow request exists — it pre-fills all ticket fields automatically.</>,
  <>The <strong>PSADT stage</strong> lets you visually build install/uninstall lifecycle actions without writing PowerShell by hand.</>,
  <>The <strong>Intune Config stage</strong> generates detection rules, requirement rules, and the Win32 app manifest for you.</>,
  <>Publishing to GitLab triggers the CI/CD pipeline automatically — no manual pipeline run needed.</>,
];

const MAC_TIPS = [
  <>Use <strong>New from Queue</strong> whenever a ServiceNow request exists — it pre-fills all ticket fields automatically.</>,
  <>The <strong>Mac Installer stage</strong> supports local PKG/DMG files as well as SMB network share sources.</>,
  <>The <strong>macOS Config stage</strong> generates the Jamf package manifest and application detection script.</>,
  <>Publishing to GitLab triggers the CI/CD pipeline automatically — no manual pipeline run needed.</>,
];

export default function PlatformLandingPage({ platform, onQueue, onBlank, onEdit, onRefactor }) {
  const isWindows = platform === 'windows';
  const actions   = isWindows ? WIN_ACTIONS : MAC_ACTIONS;
  const tips      = isWindows ? WIN_TIPS    : MAC_TIPS;

  const handleAction = (id) => {
    if (id === 'queue')    onQueue?.();
    if (id === 'blank')    onBlank?.();
    if (id === 'edit')     onEdit?.();
    if (id === 'refactor') onRefactor?.();
  };

  return (
    <div className="platform-landing">
      {/* ── Header ── */}
      <div className="platform-landing__header">
        <div className="platform-landing__badge">
          <span className="platform-landing__badge-icon">{isWindows ? '⊞' : ''}</span>
          <span className="platform-landing__badge-label">
            {isWindows ? 'Windows' : 'macOS'}
          </span>
        </div>
        <div className="platform-landing__header-text">
          <h1 className="platform-landing__title">
            {isWindows ? 'Windows Title Automation' : 'macOS Title Automation'}
          </h1>
          <p className="platform-landing__subtitle">
            {isWindows
              ? 'Build, package, and publish Win32 applications to Microsoft Intune via GitLab CI/CD and PSADT.'
              : 'Build and publish macOS packages to Jamf Pro via GitLab CI/CD using PKG or DMG installers.'}
          </p>
        </div>
      </div>

      {/* ── Action cards ── */}
      <h2 className="platform-landing__section-title">Where would you like to start?</h2>
      <div className="platform-landing__cards">
        {actions.map(action => (
          <button
            key={action.id}
            className={`platform-landing__card${action.primary ? ' platform-landing__card--primary' : ''}`}
            onClick={() => handleAction(action.id)}
          >
            <span className="platform-landing__card-icon">{action.icon}</span>
            <span className="platform-landing__card-title">{action.title}</span>
            <p className="platform-landing__card-desc">{action.desc}</p>
            <span className="platform-landing__card-cta">{action.cta}</span>
          </button>
        ))}
      </div>

      {/* ── Tips ── */}
      <div className="platform-landing__tips">
        <h3 className="platform-landing__tips-title">💡 Quick Tips</h3>
        <ul className="platform-landing__tips-list">
          {tips.map((tip, i) => (
            <li key={i}>{tip}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
