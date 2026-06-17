import { useState, useMemo } from 'react';
import './intune-sync.css';

/**
 * IntuneSyncPanel — Bi-directional comparison of builder state vs live Intune data.
 * Shows diffs grouped by category with per-field "Use Builder" / "Use Intune" actions.
 *
 * Props:
 *   diffs       — Array from compareIntuneState()
 *   matchCount  — number of matching fields
 *   diffCount   — number of differing fields
 *   loading     — boolean, true while fetching
 *   error       — error message string
 *   onPullField(field, intuneValue) — set builder field to Intune value
 *   onPullAll()  — set all differing fields to Intune values
 *   onKeepField(field) — keep builder value (no-op, just marks resolved)
 *   onKeepAll()  — keep all builder values
 *   onRefresh()  — re-fetch and re-compare
 *   onDismiss() — close the panel
 */
export default function IntuneSyncPanel({
  diffs = [],
  matchCount = 0,
  diffCount = 0,
  loading = false,
  error = null,
  onPullField,
  onPullAll,
  onKeepField,
  onKeepAll,
  onRefresh,
  onDismiss,
}) {
  const [filterMode, setFilterMode] = useState('diffs'); // 'all' | 'diffs'
  const [expandedCategories, setExpandedCategories] = useState({});

  const visibleDiffs = useMemo(() => {
    if (filterMode === 'diffs') return diffs.filter(d => !d.match);
    return diffs;
  }, [diffs, filterMode]);

  // Group by category
  const grouped = useMemo(() => {
    const groups = {};
    for (const d of visibleDiffs) {
      const cat = d.category || 'Other';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(d);
    }
    return groups;
  }, [visibleDiffs]);

  const toggleCategory = (cat) => {
    setExpandedCategories(prev => ({ ...prev, [cat]: !prev[cat] }));
  };

  if (loading) {
    return (
      <div className="sync-panel">
        <div className="sync-panel__header">
          <h3 className="sync-panel__title">🔄 Syncing with Intune…</h3>
        </div>
        <div className="sync-panel__loading">
          <div className="sync-panel__spinner" />
          <p>Fetching live data from Intune…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="sync-panel sync-panel--error">
        <div className="sync-panel__header">
          <h3 className="sync-panel__title">⚠️ Sync Error</h3>
          <button className="sync-panel__close" onClick={onDismiss}>✕</button>
        </div>
        <div className="sync-panel__error-body">
          <p>{error}</p>
          <button className="sync-panel__btn sync-panel__btn--secondary" onClick={onDismiss}>Dismiss</button>
        </div>
      </div>
    );
  }

  if (diffs.length > 0 && diffCount === 0) {
    return (
      <div className="sync-panel sync-panel--ok">
        <div className="sync-panel__header">
          <h3 className="sync-panel__title">✅ In Sync</h3>
          <div className="sync-panel__header-actions">
            {onRefresh && <button className="sync-panel__btn sync-panel__btn--secondary" onClick={onRefresh}>↻ Re-check</button>}
          </div>
        </div>
        <div className="sync-panel__ok-body">
          <p>All {matchCount} comparable fields match between the builder and Intune.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="sync-panel">
      <div className="sync-panel__header">
        <h3 className="sync-panel__title">
          🔄 Intune Sync — <span className="sync-panel__diff-count">{diffCount} difference{diffCount !== 1 && 's'}</span>
          {matchCount > 0 && <span className="sync-panel__match-count">, {matchCount} matching</span>}
        </h3>
        <div className="sync-panel__header-actions">
          {onRefresh && <button className="sync-panel__btn sync-panel__btn--secondary" onClick={onRefresh}>↻ Re-check</button>}
        </div>
      </div>

      <div className="sync-panel__toolbar">
        <div className="sync-panel__filter">
          <button
            className={`sync-panel__filter-btn ${filterMode === 'diffs' ? 'sync-panel__filter-btn--active' : ''}`}
            onClick={() => setFilterMode('diffs')}
          >
            Differences ({diffCount})
          </button>
          <button
            className={`sync-panel__filter-btn ${filterMode === 'all' ? 'sync-panel__filter-btn--active' : ''}`}
            onClick={() => setFilterMode('all')}
          >
            All Fields ({diffs.length})
          </button>
        </div>
        <div className="sync-panel__bulk-actions">
          {onKeepAll && (
            <button
              className="sync-panel__btn sync-panel__btn--keep"
              onClick={onKeepAll}
              title="Keep all builder values (no changes)"
            >
              Use All Builder →
            </button>
          )}
          <button
            className="sync-panel__btn sync-panel__btn--pull"
            onClick={onPullAll}
            title="Update builder with all Intune values"
          >
            ← Use All Intune
          </button>
        </div>
      </div>

      <div className="sync-panel__body">
        {Object.entries(grouped).map(([category, items]) => {
          const isExpanded = expandedCategories[category] !== false; // default open
          const catDiffCount = items.filter(d => !d.match).length;
          return (
            <div key={category} className="sync-panel__category">
              <button className="sync-panel__category-header" onClick={() => toggleCategory(category)}>
                <span className="sync-panel__category-toggle">{isExpanded ? '▾' : '▸'}</span>
                <span className="sync-panel__category-name">{category}</span>
                {catDiffCount > 0 && (
                  <span className="sync-panel__category-badge">{catDiffCount}</span>
                )}
              </button>
              {isExpanded && (
                <table className="sync-panel__table">
                  <thead>
                    <tr>
                      <th className="sync-panel__th sync-panel__th--field">Field</th>
                      <th className="sync-panel__th sync-panel__th--builder">Builder (GitLab)</th>
                      <th className="sync-panel__th sync-panel__th--intune">Intune (Live)</th>
                      <th className="sync-panel__th sync-panel__th--actions">Resolve</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(d => (
                      <tr key={d.field} className={`sync-panel__row ${d.match ? 'sync-panel__row--match' : 'sync-panel__row--diff'}`}>
                        <td className="sync-panel__td sync-panel__td--field">
                          {d.match ? '✅' : '⚠️'} {d.label}
                        </td>
                        <td className="sync-panel__td sync-panel__td--builder">
                          <code className="sync-panel__value">{d.builderDisplay || '(empty)'}</code>
                        </td>
                        <td className="sync-panel__td sync-panel__td--intune">
                          <code className="sync-panel__value">{d.intuneDisplay || '(empty)'}</code>
                        </td>
                        <td className="sync-panel__td sync-panel__td--actions">
                          {!d.match ? (
                            <div className="sync-panel__action-group">
                              {onKeepField && (
                                <button
                                  className="sync-panel__action-btn sync-panel__action-btn--keep"
                                  onClick={() => onKeepField(d.field)}
                                  title="Keep the builder value"
                                >
                                  Builder →
                                </button>
                              )}
                              <button
                                className="sync-panel__action-btn sync-panel__action-btn--pull"
                                onClick={() => onPullField(d.field, d.intune)}
                                title="Use Intune value in builder"
                              >
                                ← Intune
                              </button>
                            </div>
                          ) : (
                            <span className="sync-panel__resolved">✓</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
