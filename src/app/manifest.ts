import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Meridian',
    short_name: 'Meridian',
    description: 'Internal OS — clients, projects, timelines, and notes in one place.',
    start_url: '/today',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#F6F4FE',
    theme_color: '#5F3DEB',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      {
        name: 'Today',
        short_name: 'Today',
        url: '/today',
        icons: [{ src: '/icons/shortcut-today.png', sizes: '192x192', type: 'image/png' }],
      },
      {
        name: 'Notes',
        short_name: 'Notes',
        url: '/notes',
        icons: [{ src: '/icons/shortcut-notes.png', sizes: '192x192', type: 'image/png' }],
      },
      {
        name: 'Calendar',
        short_name: 'Calendar',
        url: '/calendar',
        icons: [{ src: '/icons/shortcut-calendar.png', sizes: '192x192', type: 'image/png' }],
      },
      {
        name: 'Dashboard',
        short_name: 'Dashboard',
        url: '/dashboard',
        icons: [{ src: '/icons/shortcut-dashboard.png', sizes: '192x192', type: 'image/png' }],
      },
    ],
  };
}
