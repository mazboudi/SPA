import { useState, useEffect, useMemo, useRef } from 'react';
import './ProjectPicker.css';

/**
 * ProjectPicker — browse and select an existing SPA project for editing or cloning.
 *
 * In clone mode, after the user picks a version an intent overlay appears:
 *   🆕 New Title  — clone config as a brand-new app (user enters new display name)
 *   🔢 New Version — bump version of the same app (display name locked)
 *
 * onSelect is called with (files, enrichedMeta, intent) where intent is
 *   'new_title' | 'new_version' | undefined (edit mode).
 *
 * @param {{ onSelect: Function, onClose: Function, groupPath?: string, mode?: 'edit'|'clone' }} props
 */
export default function ProjectPicker({ onSelect, onClose, groupPath, mode = 'edit' }) {
  const [projects, setProjects]             = useState([]);
  const [loading, setLoading]               = useState(true);
  const [error, setError]                   = useState(null);
  const [search, setSearch]                 = useState('');
  const [loadingProject, setLoadingProject] = useState(null);
  const [expandedProject, setExpandedProject] = useState(null);

  // Clone-mode: store chosen project+ref while waiting for intent selection
  const [pendingLoad, setPendingLoad]       = useState(null); // { project, ref }
  const searchRef = useRef(null);

  // ── Load project list ───────────────────────────────────────────────────
  useEffect(() => {
    const url = groupPath
      ? `/api/projects?group=${encodeURIComponent(groupPath)}`
      : '/api/projects';
    fetch(url)
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
  }, [groupPath]);

  useEffect(() => {
    if (!loading && !pendingLoad && searchRef.current) searchRef.current.focus();
  }, [loading, pendingLoad]);

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

  // ── Fetch files and call onSelect ─────────────────────────────────────
  const handleLoad = async (project, ref, intent) => {
    setLoadingProject(project.id);
    setPendingLoad(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/clone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: ref || undefined }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const enrichedMeta = { ...data.projectMeta, tags: project.tags || [], localPath: data.localPath };
      onSelect(data.files, enrichedMeta, intent);
    } catch (err) {
      alert(`Failed to load project: ${err.message}`);
    } finally {
      setLoadingProject(null);
    }
  };

  // ── In clone mode show intent overlay; in edit mode load directly ─────
  const initiateLoad = (project, ref) => {
    if (mode === 'clone') {
      setPendingLoad({ project, ref });
    } else {
      handleLoad(project, ref, undefined);
    }
  };

  // ── Toggle version list ───────────────────────────────────────────────
  const handleItemClick = (project) => {
    if (project.tags && project.tags.length > 0) {
      setExpandedProject(expandedProject === project.id ? null : project.id);
    } else {
      initiateLoad(project, null);
    }
  };

  const formatDate = (iso) => {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
      });
    } catch { return iso; }
  };

  const isClone = mode === 'clone';

  // ── Clone intent overlay ──────────────────────────────────────────────
  if (pendingLoad) {
    const { project, ref } = pendingLoad;
    const latestTag = project.tags?.[0]?.name;
    const sourceLabel = ref ? `v${ref}` : `latest (${project.default_branch})`;

    return (
      <div className="pp-page">
        <div className="pp-header">
          <div>
            <h2 className="pp-title">📋 What would you like to do?</h2>
            <p className="pp-subtitle">
              Source: <strong>{project.name}</strong> — {sourceLabel}
            </p>
          </div>
          <button className="pp-close" onClick={() => setPendingLoad(null)} title="Back">
            ← Back
          </button>
        </div>

        <div className="pp-intent-grid">
          {/* New Title */}
          <button
            className="pp-intent-card"
            onClick={() => handleLoad(project, ref, 'new_title')}
            disabled={!!loadingProject}
          >
            <div className="pp-intent-card__icon">🆕</div>
            <div className="pp-intent-card__body">
              <div className="pp-intent-card__title">New Title</div>
              <div className="pp-intent-card__desc">
                Clone this config as a brand-new application.
                You'll enter a new display name and all required fields before proceeding.
              </div>
              <div className="pp-intent-card__note">
                Creates a <strong>new GitLab project</strong>
              </div>
            </div>
            {loadingProject && <span className="pp-intent-card__spinner">⏳</span>}
          </button>

          {/* New Version */}
          <button
            className="pp-intent-card"
            onClick={() => handleLoad(project, ref, 'new_version')}
            disabled={!!loadingProject}
          >
            <div className="pp-intent-card__icon">🔢</div>
            <div className="pp-intent-card__body">
              <div className="pp-intent-card__title">New Version</div>
              <div className="pp-intent-card__desc">
                Bump the version of <strong>{project.name}</strong>.
                The display name and package ID are locked — just enter the new version number.
              </div>
              <div className="pp-intent-card__note">
                {latestTag
                  ? <>Current: <code>{latestTag}</code> — pushes to the <strong>same project</strong></>
                  : <>Pushes to the <strong>same project</strong></>}
              </div>
            </div>
            {loadingProject && <span className="pp-intent-card__spinner">⏳</span>}
          </button>
        </div>
      </div>
    );
  }

  // ── Normal project list ───────────────────────────────────────────────
  return (
    <div className="pp-page">
      <div className="pp-header">
        <div>
          <h2 className="pp-title">
            {isClone ? '📋 Clone Existing Title' : '✏️ Edit / Update Existing Title'}
          </h2>
          <p className="pp-subtitle">
            {isClone
              ? 'Select a source title and version to clone from'
              : 'Select a title from GitLab to load into the workbench'}
          </p>
        </div>
        <button className="pp-close" onClick={onClose} title="Back">← Back</button>
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
                <div className="pp-versions__header">
                  {isClone ? 'Select version to clone from:' : 'Select version to load:'}
                </div>
                <button
                  className="pp-version-btn pp-version-btn--latest"
                  onClick={() => initiateLoad(project, null)}
                  disabled={!!loadingProject}
                >
                  <span className="pp-version-btn__name">
                    {isClone ? `📋 Clone from latest (${project.default_branch})` : `📌 Latest (${project.default_branch})`}
                  </span>
                  <span className="pp-version-btn__hint">
                    {isClone ? 'Copies latest config as starting point' : 'Head of default branch'}
                  </span>
                </button>
                {project.tags.map(tag => (
                  <button
                    key={tag.name}
                    className="pp-version-btn"
                    onClick={() => initiateLoad(project, tag.name)}
                    disabled={!!loadingProject}
                  >
                    <span className="pp-version-btn__name">
                      {isClone ? `📋 Clone from ${tag.name}` : `🏷️ ${tag.name}`}
                    </span>
                    {tag.message && <span className="pp-version-btn__hint">{tag.message.split('\n')[0]}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
