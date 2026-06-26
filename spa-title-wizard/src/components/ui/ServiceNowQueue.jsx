import { useState, useEffect, useMemo, useRef } from 'react';
import './ServiceNowQueue.css';

const PRIORITY_ORDER = { Critical: 0, High: 1, Medium: 2, Low: 3 };
const PRIORITY_COLORS = {
  Critical: '#ef4444',
  High: '#f97316',
  Medium: '#eab308',
  Low: '#22c55e',
};

/**
 * ServiceNowQueue — searchable panel showing packaging requests
 * from the ServiceNow intake queue. User picks one to pre-populate
 * wizard fields for a new title.
 *
 * @param {{ onSelect: (item: Object) => void, onClose: () => void, platform?: string }} props
 */
export default function ServiceNowQueue({ onSelect, onClose, platform }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [filterPriority, setFilterPriority] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [claiming, setClaiming] = useState(null);
  const searchRef = useRef(null);

  // ── Load queue ────────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/queue')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(data => {
        setItems(data.items || []);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!loading && searchRef.current) searchRef.current.focus();
  }, [loading]);

  // ── Derived data ──────────────────────────────────────────────────────
  // Platform-scoped base (when platform prop is provided)
  const platformItems = useMemo(() => {
    if (!platform) return items;
    return items.filter(i => (i.Platform || '').toLowerCase() === platform.toLowerCase());
  }, [items, platform]);

  const categories = useMemo(() => {
    const cats = new Set(platformItems.map(i => i.Category).filter(Boolean));
    return [...cats].sort();
  }, [platformItems]);

  const filtered = useMemo(() => {
    let result = platformItems;
    if (filterPriority !== 'all') {
      result = result.filter(i => i.Priority === filterPriority);
    }
    if (filterCategory !== 'all') {
      result = result.filter(i => i.Category === filterCategory);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(i =>
        (i.DisplayName || '').toLowerCase().includes(q) ||
        (i.Publisher || '').toLowerCase().includes(q) ||
        (i.RequestID || '').toLowerCase().includes(q) ||
        (i.Requestor || '').toLowerCase().includes(q) ||
        (i.Description || '').toLowerCase().includes(q)
      );
    }
    // Sort by priority then date
    return result.sort((a, b) => {
      const pa = PRIORITY_ORDER[a.Priority] ?? 9;
      const pb = PRIORITY_ORDER[b.Priority] ?? 9;
      if (pa !== pb) return pa - pb;
      return (a.RequestDate || '').localeCompare(b.RequestDate || '');
    });
  }, [platformItems, search, filterPriority, filterCategory]);

  // ── Claim a request ───────────────────────────────────────────────────
  const handleClaim = async (item) => {
    setClaiming(item.RequestID);
    try {
      const res = await fetch(`/api/queue/${encodeURIComponent(item.RequestID)}`, { method: 'PATCH' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Map CSV fields → wizard fields
      const wizardFields = {
        displayName: item.DisplayName || '',
        publisher: item.Publisher || '',
        version: item.Version || '',
        platform: (item.Platform || 'windows').toLowerCase(),
        softwareCategory: item.Category || '',
        appDescription: item.Description || '',
        installerType: (item.InstallerType || 'exe').toLowerCase(),
        ...(() => {
          // Split InstallerSource into dir + filename
          const raw = item.InstallerSource || '';
          if (raw.includes('\\') || raw.includes('/')) {
            const parts = raw.replace(/\\/g, '/').split('/');
            return { installerSourceFile: parts.pop(), installerSourceDir: parts.join('\\') };
          }
          return raw ? { installerSourceFile: raw } : {};
        })(),
        appOwner: item.Requestor || 'EUC Packaging',
        _serviceNowRequestId: item.RequestID,
        _serviceNowPriority: item.Priority,
      };
      onSelect(wizardFields);
    } catch (err) {
      alert(`Failed to claim request: ${err.message}`);
    } finally {
      setClaiming(null);
    }
  };

  // No Escape listener needed — navigation handled by parent view state

  return (
    <div className="snq-page">
      <div className="snq-header">
        <div>
          <h2 className="snq-title">📋 ServiceNow Packaging Queue</h2>
          <p className="snq-subtitle">Pick a request to begin packaging</p>
        </div>
        <button className="snq-close" onClick={onClose} title="Back">← Back</button>
      </div>

        {/* Filters */}
        <div className="snq-filters">
          <div className="snq-search">
            <span className="snq-search__icon">🔍</span>
            <input
              ref={searchRef}
              className="snq-search__input"
              type="text"
              placeholder="Search by title, publisher, requestor, or ID..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button className="snq-search__clear" onClick={() => setSearch('')}>✕</button>
            )}
          </div>
          <div className="snq-filter-pills">
            <select className="snq-filter-select" value={filterPriority} onChange={e => setFilterPriority(e.target.value)}>
              <option value="all">All Priorities</option>
              <option value="Critical">🔴 Critical</option>
              <option value="High">🟠 High</option>
              <option value="Medium">🟡 Medium</option>
              <option value="Low">🟢 Low</option>
            </select>
            <select className="snq-filter-select" value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
              <option value="all">All Categories</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        {/* Results info */}
        <div className="snq-info">
          {loading ? 'Loading queue...' : error ? `Error: ${error}` : `${filtered.length} of ${platformItems.length} requests`}
        </div>

        {/* Request List */}
        <div className="snq-list">
          {loading && <div className="snq-empty">⏳ Loading packaging queue...</div>}
          {error && <div className="snq-empty snq-empty--error">❌ {error}</div>}
          {!loading && !error && filtered.length === 0 && (
            <div className="snq-empty">No requests match your filters</div>
          )}
          {filtered.map(item => (
            <button
              key={item.RequestID}
              className={`snq-item ${claiming === item.RequestID ? 'snq-item--loading' : ''}`}
              onClick={() => handleClaim(item)}
              disabled={!!claiming}
            >
              <div className="snq-item__priority" style={{ background: PRIORITY_COLORS[item.Priority] || '#666' }}
                title={item.Priority}>{item.Priority?.[0]}</div>
              <div className="snq-item__main">
                <div className="snq-item__top">
                  <span className="snq-item__name">{item.DisplayName}</span>
                  <span className="snq-item__version">{item.Version}</span>
                </div>
                <div className="snq-item__bottom">
                  <span className="snq-item__publisher">{item.Publisher}</span>
                  <span className="snq-item__dot">•</span>
                  <span className="snq-item__id">{item.RequestID}</span>
                  <span className="snq-item__dot">•</span>
                  <span className="snq-item__date">{item.RequestDate}</span>
                  <span className="snq-item__dot">•</span>
                  <span className="snq-item__cat">{item.Category}</span>
                </div>
                {item.Description && (
                  <p className="snq-item__desc">{item.Description}</p>
                )}
              </div>
              <div className="snq-item__action">
                {claiming === item.RequestID ? '⏳' : '→'}
              </div>
            </button>
          ))}
        </div>
    </div>
  );
}
