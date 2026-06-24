import { useState, useMemo } from 'react';
import { compareIntuneState } from '../../lib/compareIntuneState';
import './IntuneSyncComparison.css';

/**
 * Friendly Intune sync comparison.
 * Shows only builder-owned fields (via compareIntuneState), grouped by category,
 * with a dedicated logo row showing actual images.
 */
export default function IntuneSyncComparison({
  builderState,
  rawIntuneData,
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

  // Group diffs by category
  const grouped = useMemo(() => {
    const visible = filterDiffs ? diffs.filter(d => !d.match) : diffs;
    const map = {};
    for (const d of visible) {
      if (!map[d.category]) map[d.category] = [];
      map[d.category].push(d);
    }
    return map;
  }, [diffs, filterDiffs]);

  const totalDiffs = diffCount + (logoMatch ? 0 : 1);
  const showLogo = !filterDiffs || !logoMatch;

  // Map compareIntuneState field keys → builder state field to pull into
  const FIELD_TO_STATE_MAP = {
    displayName:      (val) => onPullField('displayName', val),
    description:      (val) => onPullField('appDescription', val),
    publisher:        (val) => onPullField('publisher', val),
    displayVersion:   (val) => onPullField('version', val),
    owner:            (val) => onPullField('appOwner', val),
    developer:        (val) => onPullField('appDeveloper', val),
    informationUrl:   (val) => onPullField('informationUrl', val),
    privacyUrl:       (val) => onPullField('privacyUrl', val),
    notes:            (val) => onPullField('appNotes', val),
    isFeatured:       (val) => onPullField('isFeatured', val),
    allowAvailableUninstall: (val) => onPullField('allowAvailableUninstall', val),
  };

  const handlePull = (field, intuneVal) => {
    if (FIELD_TO_STATE_MAP[field]) {
      FIELD_TO_STATE_MAP[field](intuneVal);
    } else {
      // fallback: let parent decide via generic pull
      onPullField(field, intuneVal);
    }
  };

  const handlePullLogo = () => {
    if (intuneLogo) onPullField('logoDataUrl', intuneLogo);
  };

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
        <button
          className="btn btn-sm btn-primary"
          onClick={onPullAll}
          disabled={totalDiffs === 0}
        >
          ← Pull All from Intune
        </button>
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
          <div className={`isync-row ${!logoMatch ? 'isync-row--diff' : ''}`}>
            <div className="isync-col-label">App Logo</div>
            <div className="isync-col-builder isync-logo-cell">
              {builderLogo
                ? <img src={builderLogo} alt="Builder logo" className="isync-logo-img" />
                : <span className="isync-empty">Not set</span>}
            </div>
            <div className="isync-col-action">
              {!logoMatch && intuneLogo && (
                <button className="isync-pull-btn" onClick={handlePullLogo} title="Use Intune logo">
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
          {grouped[category].map(row => (
            <div key={row.field} className={`isync-row ${!row.match ? 'isync-row--diff' : ''}`}>
              <div className="isync-col-label">{row.label}</div>
              <div className="isync-col-builder">
                <FieldValue val={row.builder} />
              </div>
              <div className="isync-col-action">
                {!row.match && (
                  <button
                    className="isync-pull-btn"
                    onClick={() => handlePull(row.field, row.intune)}
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
          ))}
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
