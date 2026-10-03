import type { Metadata, Viewport } from 'next';
import { Suspense, type ReactNode } from 'react';
import RegisterServiceWorker from '@/components/RegisterServiceWorker';
import { NavProgress } from '@/components/NavProgress';
import { Toaster } from '@/components/Toaster';
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
        <Suspense fallback={null}><NavProgress /></Suspense>
        <Toaster />
        {children}
      </body>
    </html>
  );
}
