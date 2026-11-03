import type { MetadataRoute } from 'next';

/** Lets staff "Add to Home screen" so the tracker opens like an app on their phones. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'UDHAY Project Tracker',
    short_name: 'UDHAY',
    description: 'Project tracking for UDHAY Hospitality Equipment & Service',
    start_url: '/queue',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    categories: ['business', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'My Queue', url: '/queue' },
      { name: 'Projects', url: '/projects' },
      { name: 'Notifications', url: '/notifications' },
    ],
  };
}
