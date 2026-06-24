import { useState, useMemo } from 'react';
import { compareIntuneState } from '../../lib/compareIntuneState';
import './IntuneSyncComparison.css';

/**
 * Friendly Intune sync comparison.
 * Shows only builder-owned fields (via compareIntuneState), grouped by category.
 * - "Pulled" fields (in pendingFields) are highlighted in green — these are
 *   the ones that will be pushed in Review & Export.
 * - Differences count reflects actual field mismatches (excluding logo).
 */
export default function IntuneSyncComparison({
  builderState,
  rawIntuneData,
  pendingFields = [],   // array of compareIntuneState field keys that were pulled
  onPullField,
  onPullAll,
}) {
  const [filterDiffs, setFilterDiffs] = useState(true);

  // Run the structured comparison
  const { diffs, diffCount } = useMemo(
    () => compareIntuneState(builderState, rawIntuneData),
    [builderState, rawIntuneData]
  );

  // Extract logos
  const builderLogo = builderState.logoDataUrl || null;
  const intuneLogo = useMemo(() => {
    const icon = rawIntuneData?.app?.largeIcon;
    if (!icon?.value) return null;
    const mime = icon.type || 'image/png';
    return `data:${mime};base64,${icon.value}`;
  }, [rawIntuneData]);
  const logoMatch = builderLogo === intuneLogo || (!builderLogo && !intuneLogo);

  // Group diffs by category (only show diffs when filterDiffs=true)
  const grouped = useMemo(() => {
    const visible = filterDiffs ? diffs.filter(d => !d.match) : diffs;
    const map = {};
    for (const d of visible) {
      if (!map[d.category]) map[d.category] = [];
      map[d.category].push(d);
    }
    return map;
  }, [diffs, filterDiffs]);

  // Differences = only non-matching fields (logo shown separately in its category)
  const totalDiffs = diffCount + (logoMatch ? 0 : 1);
  const showLogo = !filterDiffs || !logoMatch;
  const pendingCount = pendingFields.length + (!logoMatch && pendingFields.includes('logoDataUrl') ? 0 : 0);

  // Fields that cannot be meaningfully pulled back via a single field update
  const NO_PULL = new Set([
    'detectionRules', 'returnCodes', 'assignments',
    'installCommandLine', 'uninstallCommandLine',
    'applicableArchitectures',
    'restartBehavior', 'maxInstallTime',
    'supersedence', 'dependencies',
    'displayVersion',
  ]);

  const categoryOrder = ['Metadata', 'Commands', 'Install Experience', 'Requirements', 'Detection', 'Assignments', 'Relationships'];

  const orderedCategories = [
    ...categoryOrder.filter(c => grouped[c]),
    ...Object.keys(grouped).filter(c => !categoryOrder.includes(c)),
  ];

  return (
    <div className="isync">
      {/* Toolbar */}
      <div className="isync-toolbar">
        <div className="isync-filter">
          <button
            className={`isync-btn ${filterDiffs ? 'isync-btn--active' : ''}`}
            onClick={() => setFilterDiffs(true)}
          >
            Differences ({totalDiffs})
          </button>
          <button
            className={`isync-btn ${!filterDiffs ? 'isync-btn--active' : ''}`}
            onClick={() => setFilterDiffs(false)}
          >
            All Fields
          </button>
        </div>

        <div className="isync-toolbar-right">
          {pendingFields.length > 0 && (
            <span className="isync-pending-badge">
              ✅ {pendingFields.length} field{pendingFields.length !== 1 ? 's' : ''} staged for push
            </span>
          )}
          <button
            className="btn btn-sm btn-primary"
            onClick={onPullAll}
            disabled={totalDiffs === 0}
          >
            ← Pull All from Intune
          </button>
        </div>
      </div>

      {/* Column headers */}
      <div className="isync-header-row">
        <div className="isync-col-label">Field</div>
        <div className="isync-col-builder">Builder</div>
        <div className="isync-col-action" />
        <div className="isync-col-intune">Live (Intune)</div>
      </div>

      {/* Logo row */}
      {showLogo && (
        <div className="isync-category">
          <div className="isync-category-label">Logo</div>
          <div className={`isync-row ${!logoMatch ? 'isync-row--diff' : ''} ${pendingFields.includes('logoDataUrl') ? 'isync-row--pulled' : ''}`}>
            <div className="isync-col-label">
              App Logo
              {pendingFields.includes('logoDataUrl') && <span className="isync-pulled-tag">pulled</span>}
            </div>
            <div className="isync-col-builder isync-logo-cell">
              {builderLogo
                ? <img src={builderLogo} alt="Builder logo" className="isync-logo-img" />
                : <span className="isync-empty">Not set</span>}
            </div>
            <div className="isync-col-action">
              {!logoMatch && intuneLogo && !pendingFields.includes('logoDataUrl') && (
                <button className="isync-pull-btn" onClick={() => onPullField('logoDataUrl', intuneLogo)} title="Use Intune logo">
                  ← Pull
                </button>
              )}
            </div>
            <div className="isync-col-intune isync-logo-cell">
              {intuneLogo
                ? <img src={intuneLogo} alt="Intune logo" className="isync-logo-img" />
                : <span className="isync-empty">Not set</span>}
            </div>
          </div>
        </div>
      )}

      {/* Field diff rows by category */}
      {orderedCategories.map(category => (
        <div key={category} className="isync-category">
          <div className="isync-category-label">{category}</div>
          {grouped[category].map(row => {
            const isPulled = pendingFields.includes(row.field);
            const canPull = !row.match && !NO_PULL.has(row.field);
            return (
              <div
                key={row.field}
                className={[
                  'isync-row',
                  !row.match ? 'isync-row--diff' : '',
                  isPulled ? 'isync-row--pulled' : '',
                ].filter(Boolean).join(' ')}
              >
                <div className="isync-col-label">
                  {row.label}
                  {isPulled && <span className="isync-pulled-tag">pulled</span>}
                </div>
                <div className="isync-col-builder">
                  <FieldValue val={row.builder} />
                </div>
                <div className="isync-col-action">
                  {canPull && !isPulled && (
                    <button
                      className="isync-pull-btn"
                      onClick={() => onPullField(row.field, row.intune)}
                      title={`Pull "${row.label}" from Intune`}
                    >
                      ← Pull
                    </button>
                  )}
                </div>
                <div className="isync-col-intune">
                  <FieldValue val={row.intune} />
                </div>
              </div>
            );
          })}
        </div>
      ))}

      {/* Empty state */}
      {orderedCategories.length === 0 && !showLogo && (
        <div className="isync-empty-state">
          ✅ All fields match — builder and Intune are in sync.
        </div>
      )}
    </div>
  );
}

function FieldValue({ val }) {
  if (val === null || val === undefined || val === '')
    return <span className="isync-empty">—</span>;
  if (typeof val === 'boolean')
    return <span className="isync-bool">{val ? 'Yes' : 'No'}</span>;
  if (typeof val === 'number')
    return <span className="isync-num">{val}</span>;
  const str = String(val);
  if (str.length > 120)
    return <span className="isync-str isync-str--long" title={str}>{str.slice(0, 120)}…</span>;
  return <span className="isync-str">{str}</span>;
}
