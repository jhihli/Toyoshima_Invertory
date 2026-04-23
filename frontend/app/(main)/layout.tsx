'use client';
import React, { useState, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { Sidebar, TopBar } from '@/app/ui/layout/Sidebar';
import { ToastProvider } from '@/app/ui/components';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const [collapsed, setCollapsed] = useState(false);

  // If the session exists but has no JWT accessToken, the user logged in with
  // an old session before the JWT changes. Force a re-login.
  useEffect(() => {
    if (status === 'authenticated' && !(session as any)?.accessToken) {
      signOut({ callbackUrl: '/login' });
    }
  }, [session, status]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('wh_sidebar_collapsed');
      if (saved !== null) setCollapsed(JSON.parse(saved));
    } catch {}
  }, []);

  const toggle = () => {
    setCollapsed(c => {
      const next = !c;
      try { localStorage.setItem('wh_sidebar_collapsed', JSON.stringify(next)); } catch {}
      return next;
    });
  };

  return (
    <ToastProvider>
      <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
        <Sidebar collapsed={collapsed} />
        <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <TopBar onToggleSidebar={toggle} />
          <div style={{ flex: 1 }}>
            {children}
          </div>
        </main>
      </div>
    </ToastProvider>
  );
}
