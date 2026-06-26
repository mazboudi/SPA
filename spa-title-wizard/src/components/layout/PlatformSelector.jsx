import {
  Box, Card, CardActionArea, CardContent, Typography, Grid, Chip,
} from '@mui/material';
import WindowIcon from '@mui/icons-material/Window';
import AppleIcon from '@mui/icons-material/Apple';

const PLATFORMS = [
  {
    id: 'windows',
    label: 'Windows',
    icon: <WindowIcon sx={{ fontSize: 52, color: '#638cff' }} />,
    description: 'Package Win32 apps for Intune. Configure PSADT lifecycle, detection rules, requirements, assignments, and supersedence.',
    tags: ['PSADT v3/v4', 'Intune Win32', '.intunewin', 'MSIX', 'MSI', 'EXE'],
    color: '#638cff',
    gradient: 'linear-gradient(135deg, rgba(99,140,255,0.12) 0%, rgba(99,140,255,0.04) 100%)',
    border: 'rgba(99,140,255,0.3)',
  },
  {
    id: 'macos',
    label: 'macOS',
    icon: <AppleIcon sx={{ fontSize: 52, color: '#34d399' }} />,
    description: 'Package macOS apps for Jamf Pro. Configure pkg/dmg installers, Jamf policies, scripts, and deployment targets.',
    tags: ['Jamf Pro', '.pkg', '.dmg', 'Shell Scripts', 'Smart Groups'],
    color: '#34d399',
    gradient: 'linear-gradient(135deg, rgba(52,211,153,0.12) 0%, rgba(52,211,153,0.04) 100%)',
    border: 'rgba(52,211,153,0.3)',
  },
];

export default function PlatformSelector({ onSelect }) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 'calc(100vh - 56px)',
        px: 4,
        py: 6,
        gap: 4,
      }}
    >
      {/* Header */}
      <Box sx={{ textAlign: 'center', mb: 2 }}>
        <Typography
          variant="h4"
          sx={{
            fontWeight: 700,
            background: 'linear-gradient(135deg, #638cff, #34d399)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            mb: 1,
          }}
        >
          Select Platform
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', maxWidth: 480 }}>
          Choose the target deployment platform. Each platform has its own packaging pipeline, GitLab group, and configuration.
        </Typography>
      </Box>

      {/* Platform cards */}
      <Grid container spacing={3} sx={{ maxWidth: 720, justifyContent: 'center' }}>
        {PLATFORMS.map((p) => (
          <Grid key={p.id} size={{ xs: 12, sm: 6 }}>
            <Card
              sx={{
                background: p.gradient,
                border: `1px solid ${p.border}`,
                borderRadius: 3,
                transition: 'all 0.2s ease',
                '&:hover': {
                  transform: 'translateY(-4px)',
                  boxShadow: `0 12px 40px ${p.color}22`,
                  border: `1px solid ${p.color}66`,
                },
              }}
            >
              <CardActionArea
                onClick={() => onSelect(p.id)}
                sx={{ p: 0.5 }}
              >
                <CardContent sx={{ p: 3 }}>
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, textAlign: 'center' }}>
                    {/* Icon */}
                    <Box
                      sx={{
                        width: 88,
                        height: 88,
                        borderRadius: '50%',
                        background: `${p.color}15`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: `2px solid ${p.color}30`,
                      }}
                    >
                      {p.icon}
                    </Box>

                    {/* Label */}
                    <Typography
                      variant="h5"
                      sx={{ fontWeight: 700, color: p.color, letterSpacing: '-0.02em' }}
                    >
                      {p.label}
                    </Typography>

                    {/* Description */}
                    <Typography
                      variant="body2"
                      sx={{ color: 'text.secondary', lineHeight: 1.6, minHeight: 52 }}
                    >
                      {p.description}
                    </Typography>

                    {/* Tags */}
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, justifyContent: 'center' }}>
                      {p.tags.map((tag) => (
                        <Chip
                          key={tag}
                          label={tag}
                          size="small"
                          sx={{
                            backgroundColor: `${p.color}18`,
                            color: p.color,
                            border: `1px solid ${p.color}33`,
                            fontSize: '0.65rem',
                            height: 20,
                          }}
                        />
                      ))}
                    </Box>
                  </Box>
                </CardContent>
              </CardActionArea>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Typography variant="caption" sx={{ color: 'text.disabled', mt: 2 }}>
        You can switch platforms at any time from the sidebar. Unsaved package data will be cleared.
      </Typography>
    </Box>
  );
}
