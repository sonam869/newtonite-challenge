'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { getSocket } from '@/lib/socket';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: '⊡' },
  { href: '/work-items', label: 'Work Items', icon: '☰' },
  { href: '/teams', label: 'Teams', icon: '◎' },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [socketConnected, setSocketConnected] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [user, loading, router]);

  useEffect(() => {
    const socket = getSocket();
    const onConnect = () => setSocketConnected(true);
    const onDisconnect = () => setSocketConnected(false);

    if (socket.connected) setSocketConnected(true);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, []);

  if (loading || !user) {
    return (
      <div className="loading" style={{ paddingTop: 80, textAlign: 'center' }}>
        Loading Newtonite...
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-logo">
          Newton<span>ite</span>
          <span style={{ fontSize: '0.65rem', padding: '2px 6px', background: 'var(--border)', borderRadius: 4, marginLeft: 'auto', fontWeight: 'normal' }}>
            Ops Hub
          </span>
        </div>

        <nav className="sidebar-nav">
          {NAV.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`sidebar-link ${isActive ? 'active' : ''}`}
              >
                <span style={{ fontSize: '1.1rem', width: 20, textAlign: 'center' }}>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-bottom">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, fontSize: '0.75rem', color: socketConnected ? '#06d6a0' : '#8b90a7' }}>
            <span style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: socketConnected ? '#06d6a0' : '#8b90a7',
              boxShadow: socketConnected ? '0 0 8px #06d6a0' : 'none'
            }} />
            {socketConnected ? 'Real-time Live' : 'Connecting live...'}
          </div>

          <div style={{ padding: '0 0 12px', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{user.name}</div>
            <div style={{ fontSize: '0.75rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.email}</div>
            <div style={{ marginTop: 6 }}>
              <span className="badge badge-open" style={{ textTransform: 'capitalize', fontSize: '0.7rem' }}>
                {user.globalRole}
              </span>
            </div>
          </div>
          <button
            id="logout-btn"
            className="btn btn-ghost"
            style={{ width: '100%', justifyContent: 'center', fontSize: '0.8125rem' }}
            onClick={() => {
              logout();
              router.replace('/login');
            }}
          >
            Sign Out
          </button>
        </div>
      </aside>

      <main className="main-content">
        {children}
      </main>
    </div>
  );
}
