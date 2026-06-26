import { useState } from 'react';
import {
  AppBar, Toolbar, Typography, IconButton, Chip, Box,
  Tooltip, ButtonGroup, Button,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import HomeIcon from '@mui/icons-material/Home';
import WindowsIcon from '@mui/icons-material/Window';
import AppleIcon from '@mui/icons-material/Apple';
import ViewSidebarIcon from '@mui/icons-material/ViewSidebar';
import AspectRatioIcon from '@mui/icons-material/AspectRatio';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import FitScreenIcon from '@mui/icons-material/FitScreen';

const PLATFORM_ICON = {
  windows: <WindowsIcon sx={{ fontSize: 14 }} />,
  macos: <AppleIcon sx={{ fontSize: 14 }} />,
};
const PLATFORM_COLOR = {
  windows: '#638cff',
  macos: '#34d399',
};

export default function TopBar({
  sidebarOpen,
  onToggleSidebar,
  platform,
  activePkg,
  workbenchWidth,
  onWidthChange,
  onGoHome,
}) {
  const pkgLabel = activePkg
    ? `${activePkg.displayName || 'Unnamed'}${activePkg.version ? ` v${activePkg.version}` : ''}`
    : null;

  return (
    <AppBar
      position="fixed"
      sx={{
        zIndex: (theme) => theme.zIndex.drawer + 1,
        width: '100%',
      }}
    >
      <Toolbar sx={{ gap: 1.5, minHeight: '56px !important' }}>
        {/* Sidebar toggle */}
        <Tooltip title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}>
          <IconButton
            edge="start"
            color="inherit"
            onClick={onToggleSidebar}
            size="small"
            sx={{ color: 'text.secondary', '&:hover': { color: 'primary.main' } }}
          >
            <MenuIcon />
          </IconButton>
        </Tooltip>

        {/* Logo + brand */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography
            variant="h6"
            sx={{
              fontWeight: 700,
              fontSize: '0.95rem',
              background: 'linear-gradient(135deg, #638cff, #34d399)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              letterSpacing: '-0.02em',
              whiteSpace: 'nowrap',
            }}
          >
            SPA Workbench
          </Typography>
        </Box>

        {/* Platform chip */}
        {platform && (
          <Chip
            icon={PLATFORM_ICON[platform]}
            label={platform === 'windows' ? 'Windows' : 'macOS'}
            size="small"
            sx={{
              backgroundColor: `${PLATFORM_COLOR[platform]}22`,
              color: PLATFORM_COLOR[platform],
              border: `1px solid ${PLATFORM_COLOR[platform]}44`,
              fontWeight: 600,
              fontSize: '0.68rem',
            }}
          />
        )}

        {/* Active package context */}
        {pkgLabel && (
          <Chip
            label={pkgLabel}
            size="small"
            variant="outlined"
            sx={{
              color: 'text.secondary',
              borderColor: 'divider',
              fontSize: '0.68rem',
              maxWidth: 240,
              '& .MuiChip-label': {
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              },
            }}
          />
        )}

        <Box sx={{ flex: 1 }} />

        {/* Width controller */}
        <Tooltip title="Workbench width">
          <ButtonGroup size="small" variant="text" sx={{ '& .MuiButton-root': { minWidth: 36, px: 0.5 } }}>
            {[
              { key: 'standard', icon: <ViewSidebarIcon sx={{ fontSize: 16 }} />, title: 'Standard (1100px)' },
              { key: 'wide', icon: <AspectRatioIcon sx={{ fontSize: 16 }} />, title: 'Wide (1500px)' },
              { key: 'full', icon: <OpenInFullIcon sx={{ fontSize: 16 }} />, title: 'Full width' },
            ].map(({ key, icon, title }) => (
              <Tooltip title={title} key={key}>
                <Button
                  onClick={() => onWidthChange(key)}
                  sx={{
                    color: workbenchWidth === key ? 'primary.main' : 'text.disabled',
                    backgroundColor: workbenchWidth === key ? 'rgba(99,140,255,0.1)' : 'transparent',
                  }}
                >
                  {icon}
                </Button>
              </Tooltip>
            ))}
          </ButtonGroup>
        </Tooltip>

        {/* Home */}
        {onGoHome && (
          <Tooltip title="Return to home">
            <IconButton size="small" onClick={onGoHome} sx={{ color: 'text.secondary', '&:hover': { color: 'primary.main' } }}>
              <HomeIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        )}
      </Toolbar>
    </AppBar>
  );
}
