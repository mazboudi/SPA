import {
  AppBar, Toolbar, Typography, IconButton, Chip, Box, Tooltip, Divider,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import MenuOpenIcon from '@mui/icons-material/MenuOpen';
import HomeIcon from '@mui/icons-material/Home';
import WindowsIcon from '@mui/icons-material/Window';
import AppleIcon from '@mui/icons-material/Apple';
import logo from '../../assets/Logo.png';

export const TOPBAR_HEIGHT = 60;

const PLATFORM_ICON = {
  windows: <WindowsIcon sx={{ fontSize: 13 }} />,
  macos:   <AppleIcon   sx={{ fontSize: 13 }} />,
};

export default function TopBar({
  sidebarOpen,
  onToggleSidebar,
  platform,
  activePkg,
  onGoHome,
}) {
  const pkgLabel = activePkg
    ? `${activePkg.displayName || 'Unnamed'}${activePkg.version ? ` v${activePkg.version}` : ''}`
    : null;

  return (
    <AppBar
      position="fixed"
      elevation={0}
      sx={{
        height: TOPBAR_HEIGHT,
        zIndex: (theme) => theme.zIndex.drawer + 1,
        backgroundColor: '#000000',
        borderBottom: '1px solid #1a1a1a',
        color: '#ffffff',
      }}
    >
      <Toolbar
        variant="dense"
        disableGutters
        sx={{ height: TOPBAR_HEIGHT, px: 0, display: 'flex', alignItems: 'center' }}
      >
        {/* ── Left: Logo block (matches sidebar width) ───────────── */}
        <Box
          sx={{
            width: sidebarOpen ? 240 : 58,
            flexShrink: 0,
            transition: 'width 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: sidebarOpen ? 'flex-start' : 'center',
            px: sidebarOpen ? 2 : 0,
            gap: 1.5,
            borderRight: '1px solid #1f1f1f',
            height: '100%',
            bgcolor: '#000000',
          }}
        >
          <Box
            component="img"
            src={logo}
            alt="Fiserv"
            sx={{ height: 28, width: 'auto', objectFit: 'contain', display: 'block' }}
          />
          {sidebarOpen && (
            <>
              <Box sx={{ width: '1px', height: 24, bgcolor: '#333333', flexShrink: 0 }} />
              <Typography
                variant="caption"
                sx={{
                  color: '#9ca3af',
                  fontWeight: 600,
                  fontSize: '0.68rem',
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                }}
              >
                Workbench
              </Typography>
            </>
          )}
        </Box>

        {/* ── Center: Hamburger + breadcrumb + context chips ──────── */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, flexGrow: 1, minWidth: 0 }}>
          <IconButton
            edge="start"
            aria-label="toggle sidebar"
            onClick={onToggleSidebar}
            sx={{
              p: 0.75,
              borderRadius: 1.5,
              color: '#9ca3af',
              '&:hover': { backgroundColor: '#1f1f1f', color: '#ffffff' },
            }}
          >
            {sidebarOpen ? <MenuOpenIcon fontSize="small" /> : <MenuIcon fontSize="small" />}
          </IconButton>

          {/* Breadcrumb */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 500, color: '#6b7280', fontSize: '0.82rem', flexShrink: 0 }}>
              SPA Workbench
            </Typography>
            {platform && (
              <>
                <Typography variant="body2" sx={{ color: '#374151', fontSize: '0.82rem', flexShrink: 0 }}>/</Typography>
                <Chip
                  icon={PLATFORM_ICON[platform]}
                  label={platform === 'windows' ? 'Windows' : 'macOS'}
                  size="small"
                  sx={{
                    height: 22,
                    bgcolor: platform === 'windows' ? '#0d1b3e' : '#052e1c',
                    color: platform === 'windows' ? '#638cff' : '#34d399',
                    border: `1px solid ${platform === 'windows' ? '#638cff44' : '#34d39944'}`,
                    fontWeight: 600,
                    fontSize: '0.68rem',
                  }}
                />
              </>
            )}
            {pkgLabel && (
              <>
                <Typography variant="body2" sx={{ color: '#374151', fontSize: '0.82rem', flexShrink: 0 }}>/</Typography>
                <Typography
                  variant="body2"
                  sx={{
                    fontWeight: 700,
                    color: '#f97316',
                    fontSize: '0.82rem',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {pkgLabel}
                </Typography>
              </>
            )}
          </Box>
        </Box>

        {/* ── Right: Home ─────────────────────────────────────────── */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 2, flexShrink: 0 }}>
          {onGoHome && (
            <>
              <Divider orientation="vertical" flexItem sx={{ height: 24, my: 'auto', borderColor: '#2d2d2d' }} />
              <Tooltip title="Return to home" arrow>
                <IconButton
                  size="small"
                  onClick={onGoHome}
                  sx={{
                    p: 0.75,
                    borderRadius: 1.5,
                    color: '#6b7280',
                    '&:hover': { backgroundColor: '#1f1f1f', color: '#f97316' },
                  }}
                >
                  <HomeIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </Tooltip>
            </>
          )}
        </Box>
      </Toolbar>
    </AppBar>
  );
}
