import React, { useState, useMemo } from 'react';
import { SNIPPETS, SNIPPET_CATEGORIES, getSnippets } from '../../config/snippets';
import './SnippetPicker.css';

/**
 * SnippetPicker — inline panel that slides in below the Custom PowerShell Monaco editor.
 *
 * Props:
 *   onInsert(code: string)  — called with rendered PS code; parent appends to action.code
 *   onClose()               — called when user dismisses the picker
 */
export default function SnippetPicker({ onInsert, onClose }) {
  const [search, setSearch]               = useState('');
  const [activeCategory, setActiveCategory] = useState(null);
  const [selected, setSelected]           = useState(null);   // snippet object
  const [params, setParams]               = useState({});     // { [key]: value }

  // ── Filtered list ─────────────────────────────────────────────────────────
  const filteredSnippets = useMemo(
    () => getSnippets({ category: activeCategory || undefined, search }),
    [activeCategory, search]
  );

  // ── Param helpers ─────────────────────────────────────────────────────────
  const initParams = (snippet) => {
    const defaults = {};
    snippet.params.forEach(p => {
      defaults[p.key] = p.default !== undefined ? String(p.default) : '';
    });
    return defaults;
  };

  const handleSelectSnippet = (snippet) => {
    setSelected(snippet);
    setParams(initParams(snippet));
  };

  const handleBack = () => {
    setSelected(null);
    setParams({});
  };

  // ── Live preview ──────────────────────────────────────────────────────────
  const preview = useMemo(() => {
    if (!selected) return '';
    try {
      // Build param object: use current param values, falling back to defaults
      const p = {};
      selected.params.forEach(param => {
        const raw = params[param.key];
        if (param.type === 'boolean') {
          p[param.key] = raw === 'true' || raw === true;
        } else if (param.type === 'number') {
          p[param.key] = Number(raw) || param.default || 0;
        } else {
          p[param.key] = raw !== undefined ? raw : (param.default !== undefined ? String(param.default) : '');
        }
      });
      return selected.template(p);
    } catch {
      return '# (preview error)';
    }
  }, [selected, params]);

  const handleInsert = () => {
    if (preview) {
      onInsert(preview);
    }
  };

  // ── Render: browse view ───────────────────────────────────────────────────
  if (!selected) {
    return (
      <div className="snippet-picker">
        <div className="snippet-picker__header">
          <span className="snippet-picker__title">⚡ Insert Snippet</span>
          <button className="snippet-picker__close" onClick={onClose} title="Close">✕</button>
        </div>

        <div className="snippet-picker__search-row">
          <input
            className="snippet-picker__search"
            type="text"
            placeholder="Search snippets…"
            value={search}
            onChange={e => { setSearch(e.target.value); setActiveCategory(null); }}
            autoFocus
          />
        </div>

        <div className="snippet-picker__body">
          {/* Category pills */}
          {!search && (
            <div className="snippet-picker__categories">
              <button
                className={`snippet-cat-pill ${!activeCategory ? 'snippet-cat-pill--active' : ''}`}
                onClick={() => setActiveCategory(null)}
              >
                All
              </button>
              {SNIPPET_CATEGORIES.map(cat => (
                <button
                  key={cat}
                  className={`snippet-cat-pill ${activeCategory === cat ? 'snippet-cat-pill--active' : ''}`}
                  onClick={() => setActiveCategory(cat)}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}

          {/* Snippet list */}
          <div className="snippet-picker__list">
            {filteredSnippets.length === 0 && (
              <div className="snippet-picker__empty">No snippets match your search.</div>
            )}

            {/* Group by category when not searching */}
            {!search
              ? SNIPPET_CATEGORIES
                  .filter(cat => !activeCategory || cat === activeCategory)
                  .map(cat => {
                    const items = filteredSnippets.filter(s => s.category === cat);
                    if (!items.length) return null;
                    return (
                      <div key={cat} className="snippet-group">
                        <div className="snippet-group__label">{cat}</div>
                        {items.map(s => (
                          <SnippetRow key={s.id} snippet={s} onClick={() => handleSelectSnippet(s)} />
                        ))}
                      </div>
                    );
                  })
              : filteredSnippets.map(s => (
                  <SnippetRow key={s.id} snippet={s} onClick={() => handleSelectSnippet(s)} />
                ))
            }
          </div>
        </div>
      </div>
    );
  }

  // ── Render: configure + preview view ─────────────────────────────────────
  return (
    <div className="snippet-picker">
      <div className="snippet-picker__header">
        <button className="snippet-picker__back" onClick={handleBack}>← Back</button>
        <span className="snippet-picker__title">{selected.icon} {selected.label}</span>
        <button className="snippet-picker__close" onClick={onClose} title="Close">✕</button>
      </div>

      <div className="snippet-picker__body snippet-picker__body--configure">
        {/* Param form */}
        {selected.params.length > 0 && (
          <div className="snippet-params">
            {selected.params.map(param => (
              <div key={param.key} className="snippet-param">
                <label className="snippet-param__label">{param.label}</label>
                {param.type === 'select' ? (
                  <select
                    className="snippet-param__input"
                    value={params[param.key] !== undefined ? params[param.key] : (param.default !== undefined ? String(param.default) : '')}
                    onChange={e => setParams(prev => ({ ...prev, [param.key]: e.target.value }))}
                  >
                    {param.options.map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                ) : param.type === 'boolean' ? (
                  <div className="snippet-param__checkbox-row">
                    <input
                      type="checkbox"
                      checked={params[param.key] === 'true' || params[param.key] === true}
                      onChange={e => setParams(prev => ({ ...prev, [param.key]: e.target.checked }))}
                    />
                  </div>
                ) : param.type === 'number' ? (
                  <input
                    type="number"
                    className="snippet-param__input"
                    value={params[param.key] !== undefined ? params[param.key] : (param.default || 0)}
                    onChange={e => setParams(prev => ({ ...prev, [param.key]: e.target.value }))}
                  />
                ) : (
                  <input
                    type="text"
                    className="snippet-param__input"
                    placeholder={param.placeholder || ''}
                    value={params[param.key] !== undefined ? params[param.key] : ''}
                    onChange={e => setParams(prev => ({ ...prev, [param.key]: e.target.value }))}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Live preview */}
        <div className="snippet-preview">
          <div className="snippet-preview__label">Preview</div>
          <pre className="snippet-preview__code">{preview}</pre>
        </div>
      </div>

      <div className="snippet-picker__footer">
        <button className="snippet-picker__cancel" onClick={onClose}>Cancel</button>
        <button className="snippet-picker__insert" onClick={handleInsert} disabled={!preview}>
          ＋ Insert into Editor
        </button>
      </div>
    </div>
  );
}

function SnippetRow({ snippet, onClick }) {
  return (
    <button className="snippet-row" onClick={onClick}>
      <span className="snippet-row__icon">{snippet.icon}</span>
      <span className="snippet-row__info">
        <span className="snippet-row__label">{snippet.label}</span>
        <span className="snippet-row__desc">{snippet.description}</span>
      </span>
      <span className="snippet-row__arrow">›</span>
    </button>
  );
}
