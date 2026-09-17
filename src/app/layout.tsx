import type { ReactNode } from 'react';
import './globals.css';

export const metadata = {
  title: 'Meridian',
  description: 'Internal OS — clients, projects, timelines, and notes in one place.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
