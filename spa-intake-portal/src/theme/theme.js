import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#2563eb',
      dark: '#1d4ed8',
      light: '#60a5fa',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#475569',
      dark: '#334155',
      light: '#94a3b8',
      contrastText: '#ffffff',
    },
    success: {
      main: '#16a34a',
      light: '#dcfce7',
      dark: '#15803d',
    },
    warning: {
      main: '#d97706',
      light: '#fef3c7',
      dark: '#b45309',
    },
    error: {
      main: '#dc2626',
      light: '#fee2e2',
      dark: '#b91c1c',
    },
    info: {
      main: '#0284c7',
      light: '#e0f2fe',
      dark: '#0369a1',
    },
    background: {
      default: '#f8fafc',
      paper: '#ffffff',
    },
    text: {
      primary: '#0f172a',
      secondary: '#475569',
      disabled: '#94a3b8',
    },
    divider: '#e2e8f0',
  },
  typography: {
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    h1: { fontSize: '1.85rem', fontWeight: 700, letterSpacing: '-0.02em', color: '#0f172a' },
    h2: { fontSize: '1.45rem', fontWeight: 700, letterSpacing: '-0.02em', color: '#0f172a' },
    h3: { fontSize: '1.2rem', fontWeight: 700, letterSpacing: '-0.01em', color: '#0f172a' },
    h4: { fontSize: '1rem', fontWeight: 600, color: '#0f172a' },
    h5: { fontSize: '0.875rem', fontWeight: 600, color: '#0f172a' },
    h6: { fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b' },
    body1: { fontSize: '0.875rem', lineHeight: 1.5, color: '#0f172a' },
    body2: { fontSize: '0.8125rem', lineHeight: 1.45, color: '#475569' },
    button: { textTransform: 'none', fontWeight: 600, fontSize: '0.875rem' },
    caption: { fontSize: '0.75rem', color: '#64748b' },
  },
  shape: {
    borderRadius: 8,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: '#f8fafc',
          color: '#0f172a',
        },
      },
    },
    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
      styleOverrides: {
        root: {
          borderRadius: 8,
          textTransform: 'none',
          fontWeight: 600,
        },
        containedPrimary: {
          '&:hover': {
            backgroundColor: '#1d4ed8',
            boxShadow: '0 2px 4px rgba(37, 99, 235, 0.2)',
          },
        },
      },
    },
    MuiCard: {
      defaultProps: {
        elevation: 0,
      },
      styleOverrides: {
        root: {
          borderRadius: 12,
          border: '1px solid #e2e8f0',
          backgroundColor: '#ffffff',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03), 0 1px 2px rgba(0, 0, 0, 0.02)',
        },
      },
    },
    MuiCardHeader: {
      styleOverrides: {
        root: {
          padding: '18px 24px 12px',
        },
        title: {
          fontSize: '1.05rem',
          fontWeight: 700,
          color: '#0f172a',
        },
        subheader: {
          fontSize: '0.8125rem',
          color: '#64748b',
          marginTop: 2,
        },
      },
    },
    MuiCardContent: {
      styleOverrides: {
        root: {
          padding: '16px 24px 24px',
          '&:last-child': { paddingBottom: 24 },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          fontWeight: 600,
          fontSize: '0.75rem',
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          borderRight: '1px solid #e2e8f0',
          backgroundColor: '#ffffff',
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          margin: '2px 8px',
          padding: '8px 12px',
          '&.Mui-selected': {
            backgroundColor: '#eff6ff',
            color: '#2563eb',
            '&:hover': {
              backgroundColor: '#dbeafe',
            },
            '& .MuiListItemIcon-root': {
              color: '#2563eb',
            },
          },
        },
      },
    },
  },
});

export default theme;
