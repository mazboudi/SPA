/**
 * useColorTheme — manages app colour palette via CSS custom properties.
 *
 * Themes are applied by writing to :root CSS vars so the entire existing
 * CSS variable system (--bg-base, --bg-surface, etc.) picks them up
 * automatically, affecting both legacy CSS and MUI components.
 */
import { useState, useEffect, useCallback } from 'react';

// ── Palette definitions ────────────────────────────────────────────────────
export const COLOR_THEMES = [
  {
    id: 'default',
    label: 'Default',
    description: 'Deep navy dark mode',
    swatch: ['#0d0f1a', '#12151f', '#1e2235', '#a0a8c0', '#e8eaf0'],
    vars: {
      '--bg-base':       '#0d0f1a',
      '--bg-surface':    '#12151f',
      '--bg-card':       'rgba(255,255,255,0.02)',
      '--bg-elevated':   '#1e2235',
      '--bg-hover':      'rgba(255,255,255,0.05)',
      '--border-subtle': 'rgba(255,255,255,0.08)',
      '--text-primary':  '#e8eaf0',
      '--text-secondary':'#a0a8c0',
      '--text-muted':    '#5a6080',
    },
  },
  {
    id: 'graphite',
    label: 'Graphite',
    description: 'Warm charcoal tones',
    swatch: ['#111315', '#2A2D30', '#4A4F55', '#B8BDC3', '#F4F5F7'],
    vars: {
      '--bg-base':       '#111315',
      '--bg-surface':    '#2A2D30',
      '--bg-card':       'rgba(255,255,255,0.03)',
      '--bg-elevated':   '#3A3F45',
      '--bg-hover':      'rgba(255,255,255,0.06)',
      '--border-subtle': 'rgba(255,255,255,0.10)',
      '--text-primary':  '#F4F5F7',
      '--text-secondary':'#B8BDC3',
      '--text-muted':    '#4A4F55',
    },
  },
];

const STORAGE_KEY = 'spa-workbench-color-theme';

function applyTheme(theme) {
  const root = document.documentElement;
  Object.entries(theme.vars).forEach(([prop, value]) => {
    root.style.setProperty(prop, value);
  });
  root.setAttribute('data-theme', theme.id);
}

export function useColorTheme() {
  const [themeId, setThemeId] = useState(() => {
    return localStorage.getItem(STORAGE_KEY) || 'default';
  });

  const currentTheme = COLOR_THEMES.find(t => t.id === themeId) ?? COLOR_THEMES[0];

  // Apply on mount and whenever themeId changes
  useEffect(() => {
    applyTheme(currentTheme);
  }, [currentTheme]);

  const selectTheme = useCallback((id) => {
    localStorage.setItem(STORAGE_KEY, id);
    setThemeId(id);
  }, []);

  return { themeId, currentTheme, selectTheme, themes: COLOR_THEMES };
}
