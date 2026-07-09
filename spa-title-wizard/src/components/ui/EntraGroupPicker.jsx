import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * EntraGroupPicker
 *
 * Replaces the raw GUID text input in the Intune Assignments section.
 * - Loads configured prefixes from /api/entra/groups/prefixes
 * - Renders prefix filter chips; clicking one sets the active search prefix
 * - Debounced search calls /api/entra/groups?prefix=&search=
 * - On selection: stores group.id (GUID) via onChange, shows display name + lazy member count
 * - Falls back to a plain text GUID input if Graph is not configured (501)
 *
 * @param {{ value: string, onChange: (guid: string) => void, error?: string, index: number }} props
 */
export default function EntraGroupPicker({ value, onChange, error, index }) {
  const [prefixes, setPrefixes]             = useState([]);
  const [activePrefix, setActivePrefix]     = useState(null);
  const [search, setSearch]                 = useState('');
  const [groups, setGroups]                 = useState([]);
  const [loadingGroups, setLoadingGroups]   = useState(false);
  const [groupsError, setGroupsError]       = useState(null);
  const [graphAvailable, setGraphAvailable] = useState(true);
  const [dropdownOpen, setDropdownOpen]     = useState(false);

  const [selectedGroup, setSelectedGroup]   = useState(null);
  const [memberCount, setMemberCount]       = useState(null);
  const [loadingCount, setLoadingCount]     = useState(false);

  const wrapperRef  = useRef(null);
  const searchRef   = useRef(null);
  const debounceRef = useRef(null);

  // ── Load configured prefixes once ─────────────────────────────────────────
  useEffect(() => {
    fetch('/api/entra/groups/prefixes')
      .then(r => r.json())
      .then(data => setPrefixes(data.prefixes || []))
      .catch(() => {});
  }, []);

  // ── Close dropdown on outside click ───────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Fetch groups from server ───────────────────────────────────────────────
  const fetchGroups = useCallback(async (prefix, searchText) => {
    setLoadingGroups(true);
    setGroupsError(null);
    try {
      const params = new URLSearchParams();
      if (prefix)     params.set('prefix', prefix);
      if (searchText) params.set('search', searchText);
      const res = await fetch(`/api/entra/groups?${params}`);
      if (res.status === 501) {
        setGraphAvailable(false);
        setDropdownOpen(false);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setGroups(data.groups || []);
      setDropdownOpen(true);
    } catch (err) {
      setGroupsError(err.message);
    } finally {
      setLoadingGroups(false);
    }
  }, []);

  // Debounce search
  useEffect(() => {
    if (!dropdownOpen && !search && activePrefix === null) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchGroups(activePrefix, search);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [activePrefix, search]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Lazy member count ──────────────────────────────────────────────────────
  const fetchMemberCount = useCallback(async (groupId) => {
    if (!groupId) return;
    setLoadingCount(true);
    setMemberCount(null);
    try {
      const res = await fetch(`/api/entra/groups/${groupId}/members/count`);
      if (res.ok) {
        const data = await res.json();
        setMemberCount(data.count ?? null);
      }
    } catch { /* silent */ } finally {
      setLoadingCount(false);
    }
  }, []);

  const handleSelectGroup = (group) => {
    setSelectedGroup(group);
    setSearch('');
    setDropdownOpen(false);
    onChange(group.id);
    fetchMemberCount(group.id);
  };

  const handleClear = () => {
    setSelectedGroup(null);
    setMemberCount(null);
    setSearch('');
    setGroups([]);
    onChange('');
    setTimeout(() => searchRef.current?.focus(), 0);
  };

  const handleOpen = () => {
    fetchGroups(activePrefix, search);
    setTimeout(() => searchRef.current?.focus(), 50);
  };

  // Fallback if Graph not configured
  if (!graphAvailable) {
    return (
      <div>
        <input
          id={`assign-group-${index}`}
          type="text"
          placeholder="00000000-0000-0000-0000-000000000000"
          value={value}
          onChange={e => onChange(e.target.value)}
          className={error ? 'input--error' : ''}
          style={{ width: '100%' }}
        />
        <span className="egp-not-configured">⚠️ Entra group search unavailable (Graph not configured)</span>
      </div>
    );
  }

  return (
    <div className="egp-root" ref={wrapperRef}>

      {selectedGroup ? (
        /* ── Selected state ── */
        <div className="egp-selected">
          <div className="egp-selected__info">
            <span className="egp-selected__name">👥 {selectedGroup.displayName}</span>
            <span className="egp-selected__guid">{selectedGroup.id}</span>
            <span className="egp-selected__count">
              {loadingCount
                ? '⏳ counting members…'
                : memberCount !== null
                  ? `${memberCount.toLocaleString()} member${memberCount !== 1 ? 's' : ''}`
                  : null}
            </span>
          </div>
          <button
            type="button"
            className="egp-selected__change"
            onClick={handleClear}
            title="Change group"
          >
            ✕ Change
          </button>
        </div>
      ) : (
        /* ── Picker state ── */
        <div className="egp-search-wrapper">
          <div className="egp-input-row">
            <span className="egp-input-icon">🔍</span>
            <input
              ref={searchRef}
              id={`assign-group-${index}`}
              type="text"
              className={`egp-input${error ? ' input--error' : ''}`}
              placeholder="Search Entra groups by name…"
              value={search}
              onChange={e => { setSearch(e.target.value); setDropdownOpen(true); }}
              onFocus={handleOpen}
              autoComplete="off"
            />
            {loadingGroups && <span className="egp-spinner">⏳</span>}
          </div>

          {prefixes.length > 0 && (
            <div className="egp-prefixes">
              <button
                type="button"
                className={`egp-chip${!activePrefix ? ' egp-chip--active' : ''}`}
                onClick={() => { setActivePrefix(null); fetchGroups(null, search); }}
              >
                All
              </button>
              {prefixes.map(p => (
                <button
                  key={p}
                  type="button"
                  className={`egp-chip${activePrefix === p ? ' egp-chip--active' : ''}`}
                  onClick={() => { setActivePrefix(p); fetchGroups(p, search); }}
                >
                  {p}
                </button>
              ))}
            </div>
          )}

          {dropdownOpen && (
            <div className="egp-dropdown">
              {groupsError && (
                <div className="egp-dropdown__msg egp-dropdown__msg--error">❌ {groupsError}</div>
              )}
              {!groupsError && !loadingGroups && groups.length === 0 && (
                <div className="egp-dropdown__msg">
                  {search || activePrefix
                    ? 'No groups found — try a different search'
                    : 'Start typing or select a prefix filter above'}
                </div>
              )}
              {groups.map(g => (
                <button
                  key={g.id}
                  type="button"
                  className="egp-dropdown__item"
                  onClick={() => handleSelectGroup(g)}
                >
                  <span className="egp-item__name">👥 {g.displayName}</span>
                  {g.description && (
                    <span className="egp-item__desc">{g.description}</span>
                  )}
                  <span className="egp-item__id">{g.id}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <style>{`
        .egp-root { width: 100%; position: relative; }

        /* Selected */
        .egp-selected {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: var(--space-sm);
          padding: 10px 12px;
          background: rgba(52,211,153,0.07);
          border: 1px solid rgba(52,211,153,0.25);
          border-radius: var(--radius-sm);
        }
        .egp-selected__info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .egp-selected__name { font-size: 0.87rem; font-weight: 600; color: var(--text-primary); }
        .egp-selected__guid { font-family: var(--font-mono,monospace); font-size: 0.7rem; color: var(--text-muted); word-break: break-all; }
        .egp-selected__count { font-size: 0.78rem; color: #34d399; font-weight: 500; margin-top: 2px; }
        .egp-selected__change {
          flex-shrink: 0;
          background: transparent;
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: var(--radius-sm);
          color: var(--text-muted);
          font-size: 0.75rem;
          padding: 3px 8px;
          cursor: pointer;
          transition: all 0.15s;
        }
        .egp-selected__change:hover { border-color: rgba(239,68,68,0.4); color: #ef4444; }

        /* Search input */
        .egp-search-wrapper { position: relative; width: 100%; }
        .egp-input-row {
          display: flex;
          align-items: center;
          gap: 6px;
          background: var(--bg-input, rgba(255,255,255,0.05));
          border: 1px solid var(--border-subtle, rgba(255,255,255,0.1));
          border-radius: var(--radius-sm);
          padding: 0 10px;
        }
        .egp-input-icon { font-size: 0.85rem; flex-shrink: 0; }
        .egp-input {
          flex: 1;
          background: transparent !important;
          border: none !important;
          outline: none !important;
          padding: 9px 0;
          font-size: 0.87rem;
          color: var(--text-primary);
        }
        .egp-spinner { font-size: 0.8rem; }

        /* Prefix chips */
        .egp-prefixes { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 6px; }
        .egp-chip {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 20px;
          color: var(--text-muted);
          font-size: 0.72rem;
          padding: 2px 10px;
          cursor: pointer;
          transition: all 0.15s;
          white-space: nowrap;
        }
        .egp-chip:hover { border-color: rgba(99,140,255,0.35); color: var(--text-primary); }
        .egp-chip--active {
          background: rgba(99,140,255,0.15);
          border-color: rgba(99,140,255,0.45);
          color: var(--text-accent,#7c8aff);
          font-weight: 600;
        }

        /* Dropdown */
        .egp-dropdown {
          position: absolute;
          top: calc(100% + 4px);
          left: 0; right: 0;
          background: var(--bg-elevated,#161b33);
          border: 1px solid var(--border-subtle,rgba(255,255,255,0.08));
          border-radius: var(--radius-md,8px);
          max-height: 260px;
          overflow-y: auto;
          z-index: 200;
          box-shadow: 0 12px 32px rgba(0,0,0,0.5);
        }
        .egp-dropdown__msg { padding: 14px 16px; font-size: 0.82rem; color: var(--text-muted); text-align: center; }
        .egp-dropdown__msg--error { color: #ef4444; }
        .egp-dropdown__item {
          width: 100%;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 2px;
          padding: 10px 14px;
          background: transparent;
          border: none;
          border-bottom: 1px solid rgba(255,255,255,0.03);
          text-align: left;
          cursor: pointer;
          transition: background 0.15s;
        }
        .egp-dropdown__item:last-child { border-bottom: none; }
        .egp-dropdown__item:hover { background: rgba(99,140,255,0.1); }
        .egp-item__name { font-size: 0.87rem; font-weight: 600; color: var(--text-primary); }
        .egp-item__desc { font-size: 0.74rem; color: var(--text-secondary); }
        .egp-item__id { font-family: var(--font-mono,monospace); font-size: 0.67rem; color: var(--text-muted); }

        /* Fallback */
        .egp-not-configured { display: block; margin-top: 4px; font-size: 0.75rem; color: #f59e0b; }
      `}</style>
    </div>
  );
}
