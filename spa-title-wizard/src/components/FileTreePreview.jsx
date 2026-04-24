import { useState } from 'react';

export default function FileTreePreview({ files, selectedFile, onSelectFile }) {
  // Build tree structure from flat paths
  const tree = buildTree(files);

  return (
    <div className="file-tree">
      <div className="file-tree__header">
        <span className="file-tree__icon">📁</span>
        <span className="file-tree__title">Generated Files</span>
        <span className="file-tree__count">{Object.keys(files).length} files</span>
      </div>
      <div className="file-tree__list">
        {renderNode(tree, '', selectedFile, onSelectFile, 0)}
      </div>

      <style>{`
        .file-tree {
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          overflow: hidden;
          background: var(--bg-surface);
          min-width: 240px;
        }
        .file-tree__header {
          display: flex;
          align-items: center;
          gap: var(--space-sm);
          padding: var(--space-sm) var(--space-md);
          background: var(--bg-elevated);
          border-bottom: 1px solid var(--border-subtle);
          font-size: 0.8rem;
          font-weight: 600;
        }
        .file-tree__icon { font-size: 0.9rem; }
        .file-tree__count {
          margin-left: auto;
          font-weight: 400;
          color: var(--text-muted);
          font-size: 0.7rem;
        }
        .file-tree__list {
          max-height: 550px;
          overflow-y: auto;
          padding: var(--space-xs) 0;
        }
        .tree-item {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 4px var(--space-md);
          font-size: 0.78rem;
          color: var(--text-secondary);
          cursor: pointer;
          transition: all var(--transition-fast);
          border: none;
          background: none;
          width: 100%;
          text-align: left;
          font-family: var(--font-mono);
          white-space: nowrap;
        }
        .tree-item:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }
        .tree-item--selected {
          background: rgba(99, 140, 255, 0.1);
          color: var(--text-accent);
          border-left: 2px solid var(--accent-primary);
        }
        .tree-item--dir {
          font-family: var(--font-sans);
          font-weight: 600;
          color: var(--text-muted);
          cursor: default;
          font-size: 0.72rem;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          padding-top: 8px;
        }
        .tree-item--dir:hover { background: transparent; }
        .tree-item__icon { font-size: 0.85rem; flex-shrink: 0; }
      `}</style>
    </div>
  );
}

function buildTree(files) {
  const tree = {};
  for (const path of Object.keys(files).sort()) {
    const parts = path.split('/');
    let node = tree;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!node[parts[i]]) node[parts[i]] = {};
      node = node[parts[i]];
    }
    node[parts[parts.length - 1]] = path; // leaf = full path
  }
  return tree;
}

function getFileIcon(name) {
  if (name.endsWith('.json')) return '📄';
  if (name.endsWith('.yaml') || name.endsWith('.yml')) return '⚙️';
  if (name.endsWith('.sh') || name === 'preinstall' || name === 'postinstall') return '🔧';
  if (name.endsWith('.ps1')) return '💠';
  if (name === '.gitignore') return '🚫';
  if (name === '.gitkeep') return '📌';
  return '📄';
}

function renderNode(node, prefix, selectedFile, onSelectFile, depth) {
  const elements = [];
  const dirs = [];
  const leafs = [];

  for (const [key, val] of Object.entries(node)) {
    if (typeof val === 'string') {
      leafs.push({ name: key, path: val });
    } else {
      dirs.push({ name: key, children: val });
    }
  }

  // Directories first
  for (const dir of dirs) {
    elements.push(
      <div key={`dir-${prefix}${dir.name}`}>
        <div className="tree-item tree-item--dir" style={{ paddingLeft: `${12 + depth * 16}px` }}>
          <span className="tree-item__icon">📂</span>
          {dir.name}/
        </div>
        {renderNode(dir.children, `${prefix}${dir.name}/`, selectedFile, onSelectFile, depth + 1)}
      </div>
    );
  }

  // Then files
  for (const leaf of leafs) {
    const isSelected = selectedFile === leaf.path;
    elements.push(
      <button
        key={leaf.path}
        className={`tree-item ${isSelected ? 'tree-item--selected' : ''}`}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
        onClick={() => onSelectFile(leaf.path)}
      >
        <span className="tree-item__icon">{getFileIcon(leaf.name)}</span>
        {leaf.name}
      </button>
    );
  }

  return elements;
}
