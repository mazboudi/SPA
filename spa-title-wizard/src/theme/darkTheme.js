import { createTheme } from '@mui/material/styles';

/**
 * SPA Packaging Workbench — MUI Dark Theme
 * Colors mirror the existing CSS custom properties in index.css
 */
const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#638cff',       // --accent-primary
      light: '#8aaeff',
      dark: '#3d63e0',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#34d399',       // --color-success
      light: '#6ee7b7',
      dark: '#059669',
      contrastText: '#000000',
    },
    error: {
      main: '#f87171',       // --color-error
    },
    warning: {
      main: '#f59e0b',
    },
    info: {
      main: '#60a5fa',
    },
    success: {
      main: '#34d399',
    },
    background: {
      default: '#0d0f1a',    // --bg-base
      paper: '#12151f',      // --bg-surface
    },
    text: {
      primary: '#e8eaf0',    // --text-primary
      secondary: '#a0a8c0',  // --text-secondary
      disabled: '#5a6080',   // --text-muted
    },
    divider: 'rgba(255,255,255,0.08)',
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica Neue", Arial, sans-serif',
    h1: { fontWeight: 700 },
    h2: { fontWeight: 600 },
    h3: { fontWeight: 600 },
    h4: { fontWeight: 600 },
    h5: { fontWeight: 600 },
    h6: { fontWeight: 600 },
    body1: { fontSize: '0.875rem' },
    body2: { fontSize: '0.8rem' },
    caption: { fontSize: '0.72rem' },
  },
  shape: {
    borderRadius: 8,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundImage: 'radial-gradient(ellipse at top left, rgba(99,140,255,0.06) 0%, transparent 60%), radial-gradient(ellipse at bottom right, rgba(52,211,153,0.04) 0%, transparent 60%)',
          minHeight: '100vh',
          scrollbarWidth: 'thin',
          scrollbarColor: '#2a2f45 transparent',
          '&::-webkit-scrollbar': { width: 6 },
          '&::-webkit-scrollbar-track': { background: 'transparent' },
          '&::-webkit-scrollbar-thumb': { background: '#2a2f45', borderRadius: 3 },
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: '#0f1120',
          borderRight: '1px solid rgba(255,255,255,0.06)',
          backgroundImage: 'none',
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: '#0f1120',
          backgroundImage: 'none',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          boxShadow: 'none',
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          margin: '1px 8px',
          '&.Mui-selected': {
            backgroundColor: 'rgba(99,140,255,0.12)',
            borderLeft: '2px solid #638cff',
            '&:hover': { backgroundColor: 'rgba(99,140,255,0.18)' },
          },
          '&:hover': {
            backgroundColor: 'rgba(255,255,255,0.05)',
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundColor: '#12151f',
          backgroundImage: 'none',
          border: '1px solid rgba(255,255,255,0.06)',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 500,
          borderRadius: 6,
        },
        contained: {
          background: 'linear-gradient(135deg, #638cff 0%, #8aaeff 100%)',
          boxShadow: '0 2px 12px rgba(99,140,255,0.25)',
          '&:hover': {
            boxShadow: '0 4px 20px rgba(99,140,255,0.4)',
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 500,
          fontSize: '0.7rem',
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: '#1e2235',
          border: '1px solid rgba(255,255,255,0.1)',
          fontSize: '0.72rem',
        },
      },
    },
    MuiTextField: {
      defaultProps: {
        variant: 'outlined',
        size: 'small',
      },
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            '& fieldset': { borderColor: 'rgba(255,255,255,0.12)' },
            '&:hover fieldset': { borderColor: 'rgba(99,140,255,0.5)' },
            '&.Mui-focused fieldset': { borderColor: '#638cff' },
          },
        },
      },
    },
  },
});

export default darkTheme;
