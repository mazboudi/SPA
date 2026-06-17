import { useState, useMemo } from 'react';
import { isEqual, isObject, isArray } from 'lodash';
import './JsonDiffPicker.css';

// Flatten an object into dot-notation paths for easy row-by-row comparison
const flattenObject = (obj, prefix = '') => {
  let result = {};
  if (!obj) return result;
  
  for (const key of Object.keys(obj)) {
    // Ignore private/internal UI state keys starting with underscore
    if (key.startsWith('_')) continue;
    
    const val = obj[key];
    const newKey = prefix ? `${prefix}.${key}` : key;
    
    if (isObject(val) && !isArray(val) && val !== null) {
      Object.assign(result, flattenObject(val, newKey));
    } else {
      result[newKey] = val;
    }
  }
  return result;
};

/**
 * Structural JSON diff viewer and cherry-picker.
 * Displays two JSON objects side-by-side. Highlights differences and
 * provides buttons to pull values from the right (source) to the left (target).
 */
export default function JsonDiffPicker({ targetObj, sourceObj, onPullField, onPullAll, titleLeft = 'Target', titleRight = 'Source' }) {
  const [filterDiffs, setFilterDiffs] = useState(true);

  const rows = useMemo(() => {
    const flatTarget = flattenObject(targetObj);
    const flatSource = flattenObject(sourceObj);
    
    const allKeys = Array.from(new Set([...Object.keys(flatTarget), ...Object.keys(flatSource)])).sort();
    
    return allKeys.map(key => {
      const targetVal = flatTarget[key];
      const sourceVal = flatSource[key];
      
      // Strict equality for primitives, deep equal for arrays/objects
      const isMatch = isEqual(targetVal, sourceVal);
      
      return {
        key,
        targetVal,
        sourceVal,
        isMatch
      };
    });
  }, [targetObj, sourceObj]);

  const visibleRows = filterDiffs ? rows.filter(r => !r.isMatch) : rows;
  const diffCount = rows.filter(r => !r.isMatch).length;

  const renderValue = (val) => {
    if (val === undefined || val === null) return <span className="jdp-val-empty">null</span>;
    if (typeof val === 'boolean') return <span className="jdp-val-bool">{val ? 'true' : 'false'}</span>;
    if (typeof val === 'number') return <span className="jdp-val-num">{val}</span>;
    if (isArray(val)) return <span className="jdp-val-arr">[{val.length} items]</span>;
    if (typeof val === 'string' && val.trim() === '') return <span className="jdp-val-empty">""</span>;
    return <span className="jdp-val-str">"{String(val)}"</span>;
  };

  return (
    <div className="json-diff-picker">
      <div className="jdp-toolbar">
        <div className="jdp-filter">
          <button 
            className={`jdp-btn ${filterDiffs ? 'jdp-btn--active' : ''}`}
            onClick={() => setFilterDiffs(true)}
          >
            Differences ({diffCount})
          </button>
          <button 
            className={`jdp-btn ${!filterDiffs ? 'jdp-btn--active' : ''}`}
            onClick={() => setFilterDiffs(false)}
          >
            All Fields ({rows.length})
          </button>
        </div>
        <div className="jdp-actions">
          <button 
            className="btn btn-sm btn-primary"
            onClick={onPullAll}
            disabled={diffCount === 0}
          >
            ← Pull All Differences
          </button>
        </div>
      </div>

      <div className="jdp-table-container">
        <table className="jdp-table">
          <thead>
            <tr>
              <th className="jdp-col-key">JSON Path</th>
              <th className="jdp-col-target">{titleLeft}</th>
              <th className="jdp-col-action"></th>
              <th className="jdp-col-source">{titleRight}</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 && (
              <tr>
                <td colSpan="4" className="jdp-empty-state">
                  No differences found.
                </td>
              </tr>
            )}
            {visibleRows.map(row => (
              <tr key={row.key} className={`jdp-row ${!row.isMatch ? 'jdp-row--diff' : ''}`}>
                <td className="jdp-cell-key"><code>{row.key}</code></td>
                <td className="jdp-cell-val jdp-cell-val--target">{renderValue(row.targetVal)}</td>
                <td className="jdp-cell-action">
                  {!row.isMatch && (
                    <button 
                      className="jdp-pull-btn" 
                      onClick={() => onPullField(row.key, row.sourceVal)}
                      title="Pull this value"
                    >
                      ← Pull
                    </button>
                  )}
                </td>
                <td className="jdp-cell-val jdp-cell-val--source">{renderValue(row.sourceVal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
