/**
 * useColorTheme — manages app colour palette across BOTH layers:
 *
 *  1. CSS custom properties on :root  →  all hand-written CSS picks them up
 *  2. A MUI theme object returned to the caller  →  ThemeProvider uses it
 *
 * This ensures MUI components (Drawer, AppBar, buttons…) AND custom CSS
 * all respond to the selected palette simultaneously.
 */
import { useState, useEffect, useCallback } from 'react';
import { createTheme } from '@mui/material/styles';

// ── Shared typography / shape / component overrides ────────────────────────
const COMMON_TYPOGRAPHY = {
  fontFamily: '"Inter", "Roboto", "Helvetica Neue", Arial, sans-serif',
  h1: { fontWeight: 700 }, h2: { fontWeight: 600 }, h3: { fontWeight: 600 },
  h4: { fontWeight: 600 }, h5: { fontWeight: 600 }, h6: { fontWeight: 600 },
  body1: { fontSize: '0.875rem' },
  body2: { fontSize: '0.8rem' },
  caption: { fontSize: '0.72rem' },
};
const COMMON_SHAPE = { borderRadius: 8 };

const buildComponents = (accent) => ({
  MuiCssBaseline: { styleOverrides: { body: { scrollbarWidth: 'thin' } } },
  MuiPaper:      { styleOverrides: { root: { backgroundImage: 'none' } } },
  MuiListItemButton: {
    styleOverrides: {
      root: {
        borderRadius: 6, margin: '1px 8px',
        '&.Mui-selected': {
          backgroundColor: `${accent}20`,
          borderLeft: `2px solid ${accent}`,
          '&:hover': { backgroundColor: `${accent}30` },
        },
        '&:hover': { backgroundColor: 'rgba(128,128,128,0.08)' },
      },
    },
  },
  MuiButton: {
    styleOverrides: {
      root: { textTransform: 'none', fontWeight: 500, borderRadius: 6 },
      contained: {
        background: `linear-gradient(135deg, ${accent} 0%, ${accent}cc 100%)`,
        boxShadow: `0 2px 12px ${accent}40`,
        '&:hover': { boxShadow: `0 4px 20px ${accent}60` },
      },
    },
  },
  MuiChip:    { styleOverrides: { root: { fontWeight: 500, fontSize: '0.7rem' } } },
  MuiTooltip: {
    styleOverrides: {
      tooltip: { fontSize: '0.72rem' },
    },
  },
  MuiTextField: {
    defaultProps: { variant: 'outlined', size: 'small' },
    styleOverrides: {
      root: {
        '& .MuiOutlinedInput-root': {
          '& fieldset': { borderColor: 'rgba(128,128,128,0.2)' },
          '&:hover fieldset': { borderColor: `${accent}80` },
          '&.Mui-focused fieldset': { borderColor: accent },
        },
      },
    },
  },
});

// ── Palette definitions ────────────────────────────────────────────────────
export const COLOR_THEMES = [
  // ── 1. Default — deep navy ─────────────────────────────────────────────
  {
    id: 'default',
    label: 'Default',
    description: 'Deep navy dark mode',
    swatch: ['#0d0f1a', '#12151f', '#1e2235', '#a0a8c0', '#e8eaf0'],
    cssVars: {
      '--bg-base':        '#0d0f1a',
      '--bg-surface':     '#12151f',
      '--bg-card':        'rgba(255,255,255,0.02)',
      '--bg-elevated':    '#1e2235',
      '--bg-hover':       'rgba(255,255,255,0.05)',
      '--bg-input':       'rgba(12,16,32,0.9)',
      '--border-subtle':  'rgba(255,255,255,0.08)',
      '--border-default': 'rgba(100,120,180,0.25)',
      '--text-primary':   '#e8eaf0',
      '--text-secondary': '#a0a8c0',
      '--text-muted':     '#5a6080',
      '--text-accent':    '#638cff',
      '--accent-primary': '#638cff',
      '--accent-gradient':'linear-gradient(135deg, #638cff 0%, #a78bfa 100%)',
      '--color-accent':   '#638cff',
    },
    muiTheme: createTheme({
      palette: {
        mode: 'dark',
        primary:    { main: '#638cff', light: '#8aaeff', dark: '#3d63e0', contrastText: '#fff' },
        secondary:  { main: '#34d399' },
        error:      { main: '#f87171' },
        warning:    { main: '#f59e0b' },
        background: { default: '#0d0f1a', paper: '#12151f' },
        text:       { primary: '#e8eaf0', secondary: '#a0a8c0', disabled: '#5a6080' },
        divider:    'rgba(255,255,255,0.08)',
      },
      typography: COMMON_TYPOGRAPHY,
      shape: COMMON_SHAPE,
      components: {
        ...buildComponents('#638cff'),
        MuiDrawer: {
          styleOverrides: { paper: { backgroundColor: '#0f1120', borderRight: '1px solid rgba(255,255,255,0.06)', backgroundImage: 'none' } },
        },
        MuiAppBar: {
          styleOverrides: { root: { backgroundColor: '#0f1120', backgroundImage: 'none', borderBottom: '1px solid rgba(255,255,255,0.06)', boxShadow: 'none' } },
        },
      },
    }),
  },

  // ── 2. Graphite — moody dark + teal accent ─────────────────────────────
  {
    id: 'graphite',
    label: 'Graphite',
    description: 'Moody dark · Teal accent',
    swatch: ['#0E1013', '#1F242B', '#3E4652', '#A0A9B5', '#00ADB5'],
    cssVars: {
      '--bg-base':        '#0E1013',
      '--bg-surface':     '#1F242B',
      '--bg-card':        'rgba(255,255,255,0.03)',
      '--bg-elevated':    '#2A3040',
      '--bg-hover':       'rgba(255,255,255,0.06)',
      '--bg-input':       'rgba(15,20,25,0.9)',
      '--border-subtle':  '#3E4652',
      '--border-default': '#3E4652',
      '--text-primary':   '#E9EDF2',
      '--text-secondary': '#A0A9B5',
      '--text-muted':     '#5A6370',
      '--text-accent':    '#00ADB5',
      '--accent-primary': '#00ADB5',
      '--accent-gradient':'linear-gradient(135deg, #00ADB5 0%, #007f8a 100%)',
      '--color-accent':   '#00ADB5',
    },
    muiTheme: createTheme({
      palette: {
        mode: 'dark',
        primary:    { main: '#00ADB5', light: '#33bec5', dark: '#007f8a', contrastText: '#fff' },
        secondary:  { main: '#34d399' },
        error:      { main: '#f87171' },
        warning:    { main: '#f59e0b' },
        background: { default: '#0E1013', paper: '#1F242B' },
        text:       { primary: '#E9EDF2', secondary: '#A0A9B5', disabled: '#5A6370' },
        divider:    '#3E4652',
      },
      typography: COMMON_TYPOGRAPHY,
      shape: COMMON_SHAPE,
      components: {
        ...buildComponents('#00ADB5'),
        MuiDrawer: {
          styleOverrides: { paper: { backgroundColor: '#161B20', borderRight: '1px solid #3E4652', backgroundImage: 'none' } },
        },
        MuiAppBar: {
          styleOverrides: { root: { backgroundColor: '#161B20', backgroundImage: 'none', borderBottom: '1px solid #3E4652', boxShadow: 'none' } },
        },
      },
    }),
  },

  // ── 3. Light — clean white ─────────────────────────────────────────────
  {
    id: 'light',
    label: 'Light',
    description: 'Clean light mode',
    swatch: ['#F5F7FA', '#FFFFFF', '#E2E8F0', '#4A5568', '#638cff'],
    cssVars: {
      '--bg-base':        '#F5F7FA',
      '--bg-surface':     '#FFFFFF',
      '--bg-card':        'rgba(0,0,0,0.02)',
      '--bg-elevated':    '#EDF2F7',
      '--bg-hover':       'rgba(0,0,0,0.04)',
      '--bg-input':       '#FFFFFF',
      '--border-subtle':  'rgba(0,0,0,0.10)',
      '--border-default': 'rgba(0,0,0,0.18)',
      '--border-focus':   'rgba(99,140,255,0.6)',
      '--text-primary':   '#1A202C',
      '--text-secondary': '#4A5568',
      '--text-muted':     '#A0AEC0',
      '--text-accent':    '#638cff',
      '--accent-primary': '#638cff',
      '--accent-gradient':'linear-gradient(135deg, #638cff 0%, #a78bfa 100%)',
      '--color-accent':   '#638cff',
      '--color-success':  '#38a169',
      '--color-warning':  '#d69e2e',
      '--color-error':    '#e53e3e',
    },
    muiTheme: createTheme({
      palette: {
        mode: 'light',
        primary:    { main: '#638cff', light: '#8aaeff', dark: '#3d63e0', contrastText: '#fff' },
        secondary:  { main: '#38a169' },
        error:      { main: '#e53e3e' },
        warning:    { main: '#d69e2e' },
        background: { default: '#F5F7FA', paper: '#FFFFFF' },
        text:       { primary: '#1A202C', secondary: '#4A5568', disabled: '#A0AEC0' },
        divider:    'rgba(0,0,0,0.10)',
      },
      typography: COMMON_TYPOGRAPHY,
      shape: COMMON_SHAPE,
      components: {
        ...buildComponents('#638cff'),
        MuiDrawer: {
          styleOverrides: { paper: { backgroundColor: '#FFFFFF', borderRight: '1px solid rgba(0,0,0,0.10)', backgroundImage: 'none' } },
        },
        MuiAppBar: {
          styleOverrides: { root: { backgroundColor: '#FFFFFF', backgroundImage: 'none', borderBottom: '1px solid rgba(0,0,0,0.10)', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', color: '#1A202C' } },
        },
        MuiListItemButton: {
          styleOverrides: {
            root: {
              borderRadius: 6, margin: '1px 8px',
              '&.Mui-selected': {
                backgroundColor: 'rgba(99,140,255,0.10)',
                borderLeft: '2px solid #638cff',
                '&:hover': { backgroundColor: 'rgba(99,140,255,0.16)' },
              },
              '&:hover': { backgroundColor: 'rgba(0,0,0,0.05)' },
            },
          },
        },
      },
    }),
  },
];

const STORAGE_KEY = 'spa-workbench-color-theme';

function applyTheme(theme) {
  const root = document.documentElement;
  // Reset every CSS var from every theme first to prevent leakage
  COLOR_THEMES.forEach(t => {
    Object.keys(t.cssVars).forEach(prop => root.style.removeProperty(prop));
  });
  // Apply selected theme CSS vars
  Object.entries(theme.cssVars).forEach(([prop, value]) => {
    root.style.setProperty(prop, value);
  });
  // data-theme attribute lets CSS target body::before gradient etc.
  root.setAttribute('data-theme', theme.id);
}

export function useColorTheme() {
  const [themeId, setThemeId] = useState(() => {
    return localStorage.getItem(STORAGE_KEY) || 'default';
  });

  const currentTheme = COLOR_THEMES.find(t => t.id === themeId) ?? COLOR_THEMES[0];

  // Apply CSS vars on mount and whenever themeId changes
  useEffect(() => {
    applyTheme(currentTheme);
  }, [currentTheme]);

  const selectTheme = useCallback((id) => {
    localStorage.setItem(STORAGE_KEY, id);
    setThemeId(id);
  }, []);

  return {
    themeId,
    currentTheme,
    muiTheme: currentTheme.muiTheme,
    selectTheme,
    themes: COLOR_THEMES,
  };
}
