import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import RegisterServiceWorker from '@/components/RegisterServiceWorker';
import './globals.css';

export const metadata: Metadata = {
  title: 'Meridian',
  description: 'Internal OS — clients, projects, timelines, and notes in one place.',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Meridian',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#5F3DEB',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <RegisterServiceWorker />
        {children}
      </body>
    </html>
  );
}
