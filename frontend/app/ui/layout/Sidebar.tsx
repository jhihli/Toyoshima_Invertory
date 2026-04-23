'use client';
import React, { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import Image from 'next/image';

interface NavItem {
  key: string;
  label: string;
  href: string;
  icon: React.FC<{ size?: number }>;
}

const IconDashboard: React.FC<{ size?: number }> = ({ size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
    <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
  </svg>
);

const IconSO: React.FC<{ size?: number }> = ({ size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10 9 9 9 8 9" />
  </svg>
);

const IconVendor: React.FC<{ size?: number }> = ({ size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
);

const IconChip: React.FC<{ size?: number }> = ({ size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="7" y="7" width="10" height="10" rx="1" />
    <path d="M16 2v3M8 2v3M16 19v3M8 19v3M2 16h3M2 8h3M19 16h3M19 8h3" />
  </svg>
);

const IconSettings: React.FC<{ size?: number }> = ({ size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const IconLogout: React.FC<{ size?: number }> = ({ size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

const IconPanelLeft: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <line x1="9" y1="3" x2="9" y2="21" />
  </svg>
);

const IconBell: React.FC<{ size?: number }> = ({ size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);

const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard',    href: '/dashboard',  icon: IconDashboard },
  { key: 'sos',       label: 'Sales Orders', href: '/sos',        icon: IconSO },
  { key: 'vendors',   label: 'Vendors',      href: '/vendors',    icon: IconVendor },
  { key: 'chipbrands',label: 'Chip Brands',  href: '/chipbrands', icon: IconChip },
];

interface SidebarProps { collapsed: boolean; }

export const Sidebar: React.FC<SidebarProps> = ({ collapsed }) => {
  const pathname = usePathname();
  const router = useRouter();
  const W = collapsed ? 64 : 220;

  const isActive = (item: NavItem) => pathname.startsWith(item.href);

  return (
    <aside style={{
      width: W, flexShrink: 0, height: '100vh', position: 'sticky', top: 0,
      borderRight: '1px solid var(--hair)', background: 'var(--bg)',
      display: 'flex', flexDirection: 'column', transition: 'width .18s ease',
      zIndex: 40,
    }}>
      {/* Brand */}
      <div style={{
        padding: collapsed ? '20px 0' : '22px 20px',
        borderBottom: '1px solid var(--hair)',
        display: 'flex', alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'flex-start', gap: 10,
      }}>
        <div style={{ width: 30, height: 30, flexShrink: 0, borderRadius: 3, overflow: 'hidden' }}>
          <Image src="/logo.png" alt="TGT Logo" width={30} height={30}
            style={{ objectFit: 'cover', width: '100%', height: '100%' }} />
        </div>
        {!collapsed && (
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 500, letterSpacing: '-0.01em' }}>Toyoshima</div>
            <div style={{ fontSize: 10.5, color: 'var(--ink-3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 1 }}>
              Inventory
            </div>
          </div>
        )}
      </div>

      {!collapsed && (
        <div style={{ padding: '18px 20px 8px', fontSize: 10, color: 'var(--ink-4)', letterSpacing: '0.18em', textTransform: 'uppercase' }}>
          Menu
        </div>
      )}
      {collapsed && <div style={{ height: 18 }} />}

      {/* Nav items */}
      <nav style={{ padding: '0 10px', display: 'flex', flexDirection: 'column', gap: 1 }}>
        {NAV_ITEMS.map(item => {
          const active = isActive(item);
          const Icon = item.icon;
          return (
            <button key={item.key} onClick={() => router.push(item.href)}
              title={collapsed ? item.label : ''}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: collapsed ? '8px' : '8px 12px',
                justifyContent: collapsed ? 'center' : 'flex-start',
                border: 0, background: active ? 'var(--surface)' : 'transparent',
                color: active ? 'var(--ink)' : 'var(--ink-2)',
                borderRadius: 3, cursor: 'pointer', fontSize: 12.5,
                position: 'relative', textAlign: 'left', transition: 'background .1s',
                fontFamily: 'inherit',
              }}
              onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--surface)'; }}
              onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
              {active && (
                <span style={{
                  position: 'absolute', left: 0, top: 6, bottom: 6,
                  width: 2, background: 'var(--ink)', borderRadius: 1,
                }} />
              )}
              <Icon size={15} />
              {!collapsed && <span style={{ whiteSpace: 'nowrap' }}>{item.label}</span>}
            </button>
          );
        })}
      </nav>

      <div style={{ flex: 1 }} />

      {/* Footer user + logout */}
      <button
        onClick={() => signOut({ callbackUrl: '/login' })}
        title={collapsed ? 'Logout' : ''}
        style={{
          padding: collapsed ? 14 : '14px 16px',
          display: 'flex', alignItems: 'center', gap: 10,
          justifyContent: collapsed ? 'center' : 'flex-start',
          width: '100%', border: 0, borderTop: '1px solid var(--hair)',
          background: 'transparent', cursor: 'pointer', fontFamily: 'inherit',
          transition: 'background .1s', textAlign: 'left',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
        <div style={{ width: 28, height: 28, flexShrink: 0 }}>
          <Image src="/logout.png" alt="Logout" width={28} height={28}
            style={{ objectFit: 'contain', width: '100%', height: '100%' }} />
        </div>
        {!collapsed && (
          <div style={{ fontSize: 13.5, color: 'var(--ink-2)', minWidth: 0 }}>Logout</div>
        )}
      </button>
    </aside>
  );
};

// ─────────────────────────────────────────────────────────── TopBar
interface TopBarProps { onToggleSidebar: () => void; }

export const TopBar: React.FC<TopBarProps> = ({ onToggleSidebar }) => {
  const { data: session } = useSession();
  const username = session?.user?.name ?? session?.user?.email ?? '';
  return (
  <div style={{
    height: 56, borderBottom: '1px solid var(--hair)', background: 'var(--bg)',
    display: 'flex', alignItems: 'center', padding: '0 28px', gap: 16,
    position: 'sticky', top: 0, zIndex: 50,
  }}>
    <button onClick={onToggleSidebar} title="Toggle sidebar" style={{
      background: 'none', border: 0, cursor: 'pointer', color: 'var(--ink-3)',
      padding: 6, display: 'inline-flex', borderRadius: 3,
    }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
      <IconPanelLeft size={16} />
    </button>
    <div style={{ flex: 1 }} />
    {username && (
      <div className="mono" style={{ fontSize: 11, color: 'var(--ink-4)', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
        {username}
      </div>
    )}
    <div style={{ width: 1, height: 20, background: 'var(--hair)' }} />
    <button style={{
      background: 'none', border: 0, cursor: 'pointer',
      color: 'var(--ink-3)', padding: 6, position: 'relative', display: 'inline-flex',
    }}>
      <IconBell size={15} />
      <span style={{
        position: 'absolute', top: 4, right: 4, width: 5, height: 5,
        background: 'var(--ink)', borderRadius: '50%',
      }} />
    </button>
  </div>
  );
};
