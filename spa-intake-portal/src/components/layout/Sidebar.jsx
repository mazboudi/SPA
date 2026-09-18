import React from 'react';
import {
  Drawer, Box, List, ListItemButton, ListItemIcon, ListItemText,
  Divider, Typography, Tooltip, Chip,
} from '@mui/material';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import SecurityOutlinedIcon from '@mui/icons-material/SecurityOutlined';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import LaunchOutlinedIcon from '@mui/icons-material/LaunchOutlined';

export const SIDEBAR_WIDTH = 240;
export const SIDEBAR_COLLAPSED_WIDTH = 68;

const NAV_ITEMS = [
  {
    id: 'request',
    label: 'Software Request',
    subtitle: 'Service catalog item',
    icon: <Inventory2OutlinedIcon sx={{ fontSize: 20 }} />,
  },
  {
    id: 'governance',
    label: 'Governance Center',
    subtitle: 'Approvals & reviews',
    icon: <SecurityOutlinedIcon sx={{ fontSize: 20 }} />,
    showBadge: true,
  },
  {
    id: 'tracker',
    label: 'Request Tracker',
    subtitle: 'RITM execution tree',
    icon: <FormatListBulletedIcon sx={{ fontSize: 20 }} />,
  },
  {
    id: 'catalog',
    label: 'Software Catalog',
    subtitle: 'Authoritative models',
    icon: <MenuBookOutlinedIcon sx={{ fontSize: 20 }} />,
  },
];

export default function Sidebar({
  sidebarOpen,
  onToggleSidebar,
  activeTab,
  onSelectTab,
  openTasksCount = 0,
}) {
  return (
    <Drawer
      variant="permanent"
      sx={{
        width: sidebarOpen ? SIDEBAR_WIDTH : SIDEBAR_COLLAPSED_WIDTH,
        flexShrink: 0,
        whiteSpace: 'nowrap',
        boxSizing: 'border-box',
        transition: 'width 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        '& .MuiDrawer-paper': {
          width: sidebarOpen ? SIDEBAR_WIDTH : SIDEBAR_COLLAPSED_WIDTH,
          transition: 'width 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          overflowX: 'hidden',
          top: 60,
          height: 'calc(100% - 60px)',
          backgroundColor: '#0f0f0f',
          borderRight: '1px solid #1f1f1f',
          display: 'flex',
          flexDirection: 'column',
        },
      }}
    >
      {/* Section label */}
      {sidebarOpen && (
        <Box sx={{ px: 2.5, pt: 2, pb: 0.5 }}>
          <Typography
            variant="caption"
            sx={{
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: '#4b5563',
              fontSize: '0.65rem',
            }}
          >
            Navigation
          </Typography>
        </Box>
      )}

      {/* Nav items */}
      <List sx={{ pt: sidebarOpen ? 0.5 : 2, px: 0.75, flexGrow: 1 }}>
        {NAV_ITEMS.map((item) => {
          const isSelected = activeTab === item.id;

          const button = (
            <ListItemButton
              key={item.id}
              selected={isSelected}
              onClick={() => onSelectTab(item.id)}
              sx={{
                minHeight: 44,
                px: sidebarOpen ? 1.5 : 0,
                py: 1,
                justifyContent: sidebarOpen ? 'initial' : 'center',
                borderRadius: 1.5,
                mb: 0.25,
                backgroundColor: isSelected ? '#1a1a1a' : 'transparent',
                '&:hover': { backgroundColor: '#1a1a1a' },
                '&.Mui-selected': { backgroundColor: '#1a1a1a' },
                '&.Mui-selected:hover': { backgroundColor: '#222222' },
                // Fiserv orange left accent bar on selected
                borderLeft: isSelected ? '3px solid #f97316' : '3px solid transparent',
              }}
            >
              <ListItemIcon
                sx={{
                  minWidth: 0,
                  mr: sidebarOpen ? 1.5 : 'auto',
                  justifyContent: 'center',
                  color: isSelected ? '#f97316' : '#6b7280',
                }}
              >
                {item.icon}
              </ListItemIcon>

              {sidebarOpen && (
                <>
                  <ListItemText
                    primary={item.label}
                    secondary={item.subtitle}
                    primaryTypographyProps={{
                      fontSize: '0.84rem',
                      fontWeight: isSelected ? 700 : 500,
                      color: isSelected ? '#f9fafb' : '#9ca3af',
                    }}
                    secondaryTypographyProps={{
                      fontSize: '0.68rem',
                      color: '#4b5563',
                      lineHeight: 1.1,
                    }}
                  />
                  {item.showBadge && openTasksCount > 0 && (
                    <Chip
                      label={openTasksCount}
                      size="small"
                      sx={{
                        height: 20,
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        bgcolor: isSelected ? '#f97316' : '#1c1007',
                        color: isSelected ? '#ffffff' : '#f97316',
                        border: '1px solid #f97316',
                      }}
                    />
                  )}
                </>
              )}
            </ListItemButton>
          );

          if (!sidebarOpen) {
            return (
              <Tooltip
                key={item.id}
                title={`${item.label}${item.showBadge && openTasksCount > 0 ? ` (${openTasksCount})` : ''}`}
                placement="right"
                arrow
              >
                {button}
              </Tooltip>
            );
          }
          return button;
        })}
      </List>

      {/* Bottom: workbench link */}
      <Box>
        <Divider sx={{ borderColor: '#1f1f1f', mb: 1 }} />
        <List sx={{ px: 0.75, pb: 1.5 }}>
          <Tooltip title={!sidebarOpen ? 'Open SPA Packaging Workbench' : ''} placement="right" arrow>
            <ListItemButton
              onClick={() => window.open('http://localhost:5173', '_blank')}
              sx={{
                minHeight: 40,
                px: sidebarOpen ? 1.5 : 0,
                justifyContent: sidebarOpen ? 'initial' : 'center',
                borderRadius: 1.5,
                backgroundColor: '#1a1a1a',
                border: '1px solid #2d2d2d',
                '&:hover': { backgroundColor: '#222222', borderColor: '#f97316' },
              }}
            >
              <ListItemIcon sx={{ minWidth: 0, mr: sidebarOpen ? 1.5 : 'auto', color: '#f97316' }}>
                <LaunchOutlinedIcon sx={{ fontSize: 18 }} />
              </ListItemIcon>
              {sidebarOpen && (
                <ListItemText
                  primary="SPA Workbench ↗"
                  primaryTypographyProps={{ fontSize: '0.8rem', fontWeight: 600, color: '#f97316' }}
                />
              )}
            </ListItemButton>
          </Tooltip>
        </List>
      </Box>
    </Drawer>
  );
}
