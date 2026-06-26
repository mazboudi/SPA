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
    description: 'Moody dark · Neon accent',
    swatch: ['#0E1013', '#1F242B', '#3E4652', '#A0A9B5', '#39FF14'],
    vars: {
      '--bg-base':        '#0E1013',
      '--bg-surface':     '#1F242B',
      '--bg-card':        'rgba(255,255,255,0.03)',
      '--bg-elevated':    '#2A3040',
      '--bg-hover':       'rgba(255,255,255,0.06)',
      '--border-subtle':  '#3E4652',
      '--border-default': '#3E4652',
      '--text-primary':   '#E9EDF2',
      '--text-secondary': '#A0A9B5',
      '--text-muted':     '#5A6370',
      '--accent-primary': '#39FF14',
      '--accent-gradient':'linear-gradient(135deg, #39FF14 0%, #00cc0e 100%)',
      '--color-accent':   '#39FF14',
    },
  },
];

const STORAGE_KEY = 'spa-workbench-color-theme';

function applyTheme(theme) {
  const root = document.documentElement;
  // Reset every var from every theme first to avoid leakage between palettes
  COLOR_THEMES.forEach(t => {
    Object.keys(t.vars).forEach(prop => root.style.removeProperty(prop));
  });
  // Apply selected theme
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
