import { useState, useEffect, useMemo, useRef } from 'react';
import { parseIntuneExport } from '../../lib/parseIntuneExport';
import './IntuneExportPicker.css';

/**
 * IntuneExportPicker — searchable modal for selecting an existing Intune
 * Win32 app export to pre-populate wizard fields.
 *
 * @param {{ onImport, onClose, catalogData?, exportsData?, fetchDetail? }} props
 * fetchDetail: async (appId) => exportJSON — optional function to fetch full app detail from Graph API
 */
export default function IntuneExportPicker({ onImport, onClose, catalogData, exportsData, fetchDetail }) {
  const [catalog, setCatalog] = useState(catalogData || []);
  const [loading, setLoading] = useState(!catalogData);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [importing, setImporting] = useState(null); // appId being imported
  const [importResult, setImportResult] = useState(null);
  const searchRef = useRef(null);

  // ── Load catalog index (only if not provided via props) ────────────────
  useEffect(() => {
    if (catalogData) {
      setCatalog(catalogData);
      setLoading(false);
      return;
    }
    // Fallback: fetch from static build
    fetch('/intune-catalog-index.json')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(data => {
        setCatalog(data);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [catalogData]);

  // Auto-focus search input
  useEffect(() => {
    if (!loading && searchRef.current) searchRef.current.focus();
  }, [loading]);

  // ── Filtered list ─────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!search.trim()) return catalog;
    const q = search.toLowerCase();
    return catalog.filter(app =>
      (app.displayName || '').toLowerCase().includes(q) ||
      (app.publisher || '').toLowerCase().includes(q) ||
      (app.version || app.displayVersion || '').toLowerCase().includes(q) ||
      (app.appId || app.id || '').toLowerCase().includes(q)
    );
  }, [catalog, search]);

  // ── Select an app ─────────────────────────────────────────────────────
  const handleSelect = async (app) => {
    setImporting(app.appId || app.id);
    setImportResult(null);
    try {
      let exportData;
      if (fetchDetail) {
        // Graph API: fetch full detail on demand
        exportData = await fetchDetail(app.appId || app.id);
      } else if (exportsData && exportsData.has(app.fileName)) {
        // Use pre-loaded data from folder selection
        exportData = exportsData.get(app.fileName);
      } else {
        // Fallback: fetch from static build
        const encodedName = encodeURIComponent(app.fileName);
        const res = await fetch(`/intune-exports/${encodedName}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        exportData = await res.json();
      }
      const { fields, warnings } = parseIntuneExport(exportData);
      onImport(fields);
      setImportResult({
        success: true,
        appName: app.displayName,
        fieldCount: Object.keys(fields).length,
        warnings,
      });
    } catch (err) {
      setImportResult({ success: false, error: err.message });
    } finally {
      setImporting(null);
    }
  };

  // ── Close on Escape ───────────────────────────────────────────────────
  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div className="iep-overlay" onClick={onClose}>
      <div className="iep-modal" onClick={e => e.stopPropagation()}>
        <div className="iep-header">
          <div>
            <h2 className="iep-title">📥 Import from Intune Catalog</h2>
            <p className="iep-subtitle">Select an existing Intune Win32 app to pre-populate wizard fields</p>
          </div>
          <button className="iep-close" onClick={onClose} title="Close">✕</button>
        </div>

        {/* Success / Error Banner */}
        {importResult && (
          <div className={`iep-result ${importResult.success ? 'iep-result--success' : 'iep-result--error'}`}>
            {importResult.success ? (
              <>
                <span className="iep-result__icon">✅</span>
                <div>
                  <strong>Imported "{importResult.appName}"</strong>
                  <span className="iep-result__detail"> — {importResult.fieldCount} fields populated</span>
                  {importResult.warnings.length > 0 && (
                    <ul className="iep-result__warnings">
                      {importResult.warnings.map((w, i) => <li key={i}>⚠️ {w}</li>)}
                    </ul>
                  )}
                </div>
                <button className="btn btn-sm btn-primary" onClick={onClose}>Continue →</button>
              </>
            ) : (
              <>
                <span className="iep-result__icon">❌</span>
                <span>Import failed: {importResult.error}</span>
              </>
            )}
          </div>
        )}

        {/* Search */}
        <div className="iep-search">
          <span className="iep-search__icon">🔍</span>
          <input
            ref={searchRef}
            className="iep-search__input"
            type="text"
            placeholder="Search by app name, publisher, version, or ID..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className="iep-search__clear" onClick={() => setSearch('')}>✕</button>
          )}
        </div>

        {/* Results info */}
        <div className="iep-info">
          {loading ? 'Loading catalog...' : error ? `Error: ${error}` : `${filtered.length} of ${catalog.length} apps`}
        </div>

        {/* App List */}
        <div className="iep-list">
          {loading && <div className="iep-empty">⏳ Loading Intune catalog...</div>}
          {error && <div className="iep-empty iep-empty--error">❌ Failed to load catalog: {error}</div>}
          {!loading && !error && filtered.length === 0 && (
            <div className="iep-empty">No apps match "{search}"</div>
          )}
          {filtered.map(app => {
            const uid = app.appId || app.id;
            return (
            <button
              key={uid}
              className={`iep-item ${importing === uid ? 'iep-item--loading' : ''} ${importResult?.success && importResult.appName === app.displayName ? 'iep-item--imported' : ''}`}
              onClick={() => handleSelect(app)}
              disabled={!!importing}
            >
              <div className="iep-item__main">
                <span className="iep-item__name">{app.displayName}</span>
                <span className="iep-item__publisher">{app.publisher || 'Unknown publisher'}</span>
              </div>
              <div className="iep-item__meta">
                <span className="iep-item__version">{app.version || app.displayVersion || '—'}</span>
                {importing === uid && <span className="iep-item__spinner">⏳</span>}
                {importResult?.success && importResult.appName === app.displayName && (
                  <span className="iep-item__check">✅</span>
                )}
              </div>
            </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
