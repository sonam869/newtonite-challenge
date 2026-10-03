import type { Metadata } from 'next';
import { AuthProvider } from '@/lib/auth-context';
import './globals.css';

export const metadata: Metadata = {
  title: 'Newtonite | Operations Hub',
  description: 'Coordinate and manage operational work reliably',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
