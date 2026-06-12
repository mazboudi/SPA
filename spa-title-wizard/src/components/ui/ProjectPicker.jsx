import { useState, useEffect, useMemo, useRef } from 'react';
import './ProjectPicker.css';

/**
 * ProjectPicker — modal to browse and select an existing SPA project
 * from GitLab for editing in the workbench.
 *
 * @param {{ onSelect: (files: Object, projectMeta: Object) => void, onClose: () => void }} props
 */
export default function ProjectPicker({ onSelect, onClose }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [loadingProject, setLoadingProject] = useState(null);
  const [expandedProject, setExpandedProject] = useState(null);
  const searchRef = useRef(null);

  // ── Load project list ─────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/projects')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(data => {
        setProjects(data.projects || []);
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

  // ── Filtered list ─────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!search.trim()) return projects;
    const q = search.toLowerCase();
    return projects.filter(p =>
      (p.name || '').toLowerCase().includes(q) ||
      (p.path || '').toLowerCase().includes(q) ||
      (p.description || '').toLowerCase().includes(q)
    );
  }, [projects, search]);

  // ── Select a project version ──────────────────────────────────────────
  const handleLoad = async (project, ref) => {
    setLoadingProject(project.id);
    try {
      const res = await fetch(`/api/projects/${project.id}/clone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: ref || undefined }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      // Enrich projectMeta with tags (for staleness detection) from the list we already have
      const enrichedMeta = { ...data.projectMeta, tags: project.tags || [], localPath: data.localPath };
      onSelect(data.files, enrichedMeta);
    } catch (err) {
      alert(`Failed to load project: ${err.message}`);
    } finally {
      setLoadingProject(null);
    }
  };

  // ── Toggle version list ───────────────────────────────────────────────
  const handleItemClick = (project) => {
    if (project.tags && project.tags.length > 0) {
      // Has versions — expand to show picker
      setExpandedProject(expandedProject === project.id ? null : project.id);
    } else {
      // No tags — load from default branch directly
      handleLoad(project, null);
    }
  };

  // ── Close on Escape ───────────────────────────────────────────────────
  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const formatDate = (iso) => {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
      });
    } catch { return iso; }
  };

  return (
    <div className="pp-overlay" onClick={onClose}>
      <div className="pp-modal" onClick={e => e.stopPropagation()}>
        <div className="pp-header">
          <div>
            <h2 className="pp-title">✏️ Edit Existing Package</h2>
            <p className="pp-subtitle">Select a project from GitLab to load into the workbench</p>
          </div>
          <button className="pp-close" onClick={onClose} title="Close">✕</button>
        </div>

        {/* Search */}
        <div className="pp-search-bar">
          <span className="pp-search__icon">🔍</span>
          <input
            ref={searchRef}
            className="pp-search__input"
            type="text"
            placeholder="Search by name or description..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className="pp-search__clear" onClick={() => setSearch('')}>✕</button>
          )}
        </div>

        {/* Results info */}
        <div className="pp-info">
          {loading ? 'Loading projects...' : error ? `Error: ${error}` : `${filtered.length} of ${projects.length} projects`}
        </div>

        {/* Project List */}
        <div className="pp-list">
          {loading && <div className="pp-empty">⏳ Loading projects from GitLab...</div>}
          {error && <div className="pp-empty pp-empty--error">❌ {error}</div>}
          {!loading && !error && filtered.length === 0 && (
            <div className="pp-empty">No projects match your search</div>
          )}
          {filtered.map(project => (
            <div key={project.id} className="pp-item-wrapper">
              <button
                className={`pp-item ${loadingProject === project.id ? 'pp-item--loading' : ''} ${expandedProject === project.id ? 'pp-item--expanded' : ''}`}
                onClick={() => handleItemClick(project)}
                disabled={!!loadingProject}
              >
                <div className="pp-item__icon">📦</div>
                <div className="pp-item__main">
                  <div className="pp-item__top">
                    <span className="pp-item__name">{project.name}</span>
                    {project.tags?.length > 0 && (
                      <span className="pp-item__tag-badge">{project.tags[0].name}</span>
                    )}
                  </div>
                  <div className="pp-item__bottom">
                    <span className="pp-item__path">{project.path_with_namespace}</span>
                    <span className="pp-item__dot">•</span>
                    <span className="pp-item__date">Updated {formatDate(project.updated_at)}</span>
                    {project.tags?.length > 1 && (
                      <>
                        <span className="pp-item__dot">•</span>
                        <span className="pp-item__versions">{project.tags.length} versions</span>
                      </>
                    )}
                  </div>
                  {project.description && (
                    <p className="pp-item__desc">{project.description}</p>
                  )}
                </div>
                <div className="pp-item__action">
                  {loadingProject === project.id ? '⏳' : project.tags?.length > 0 ? '▾' : '→'}
                </div>
              </button>

              {/* Version selector — expanded */}
              {expandedProject === project.id && project.tags?.length > 0 && (
                <div className="pp-versions">
                  <div className="pp-versions__header">Select version to load:</div>
                  <button
                    className="pp-version-btn pp-version-btn--latest"
                    onClick={() => handleLoad(project, null)}
                    disabled={!!loadingProject}
                  >
                    <span className="pp-version-btn__name">📌 Latest ({project.default_branch})</span>
                    <span className="pp-version-btn__hint">Head of default branch</span>
                  </button>
                  {project.tags.map(tag => (
                    <button
                      key={tag.name}
                      className="pp-version-btn"
                      onClick={() => handleLoad(project, tag.name)}
                      disabled={!!loadingProject}
                    >
                      <span className="pp-version-btn__name">🏷️ {tag.name}</span>
                      {tag.message && <span className="pp-version-btn__hint">{tag.message.split('\n')[0]}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
