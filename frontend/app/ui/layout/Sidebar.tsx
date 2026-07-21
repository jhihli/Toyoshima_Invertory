'use client';
import React, { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { signOut, useSession, getSession } from 'next-auth/react';
import Image from 'next/image';
import { useIsMobile } from '@/app/ui/hooks/useIsMobile';
import { crumbCache } from '@/app/lib/crumbCache';

interface NavItem {
  key: string;
  label: string;
  href: string;
  icon: React.FC<{ size?: number }>;
  disabled?: boolean;
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

const IconMPN: React.FC<{ size?: number }> = ({ size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="7" width="20" height="10" rx="1" />
    <path d="M6 7V4M10 7V4M14 7V4M18 7V4M6 17v3M10 17v3M14 17v3M18 17v3" />
    <line x1="8" y1="12" x2="16" y2="12" />
  </svg>
);

const IconPanelLeft: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <line x1="9" y1="3" x2="9" y2="21" />
  </svg>
);

const IconMenu: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <line x1="3" y1="6" x2="21" y2="6" />
    <line x1="3" y1="12" x2="21" y2="12" />
    <line x1="3" y1="18" x2="21" y2="18" />
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
  { key: 'dashboard',    label: 'Dashboard',    href: '/dashboard',     icon: IconDashboard },
  { key: 'sales-orders', label: 'Sales Orders', href: '/sales-orders',  icon: IconSO },
  { key: 'vendors',      label: 'Vendors',      href: '/vendors',       icon: IconVendor },
  { key: 'sos',          label: 'MSFT Order',   href: '/sos',           icon: IconSO },
  { key: 'mpns',         label: 'MPN',          href: '/mpns',          icon: IconMPN },
  { key: 'chipbrands',   label: 'Chip Brands',  href: '/chipbrands',    icon: IconChip },
];

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrator',
  manager: 'Floor Manager',
  vz_user: 'VZ User',
  r2_user: 'R2 User',
  n_user: 'User',
};

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

interface SidebarProps {
  collapsed: boolean;
  isMobileOpen?: boolean;
  onMobileClose?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ collapsed, isMobileOpen = false, onMobileClose }) => {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const isMobile = useIsMobile();
  const W = collapsed ? 64 : 220;

  const username = session?.user?.name ?? session?.user?.email ?? '';
  const roleLabel = ROLE_LABELS[session?.user?.role ?? ''] ?? (session?.user?.role ?? '');
  const initials = username ? getInitials(username) : '??';

  const isActive = (item: NavItem) => pathname.startsWith(item.href);

  const handleNav = (href: string) => {
    if (isMobile && onMobileClose) onMobileClose();
    router.push(href);
  };

  const sidebarContent = (mobileMode: boolean) => (
    <aside style={{
      width: mobileMode ? 268 : W,
      flexShrink: 0,
      height: '100vh',
      position: mobileMode ? 'relative' : 'sticky',
      top: 0,
      borderRight: '1px solid rgba(255,255,255,0.08)',
      background: '#30523b',
      display: 'flex',
      flexDirection: 'column',
      transition: mobileMode ? 'none' : 'width .18s ease',
      zIndex: mobileMode ? 'auto' : 40,
    }}>
      {/* Brand */}
      <div style={{
        padding: (!mobileMode && collapsed) ? '20px 0' : '22px 20px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        display: 'flex', alignItems: 'center',
        justifyContent: (!mobileMode && collapsed) ? 'center' : 'flex-start', gap: 10,
      }}>
        <div style={{ width: 30, height: 30, flexShrink: 0, borderRadius: 3, overflow: 'hidden' }}>
          <Image src="/logo.png" alt="TGT Logo" width={30} height={30}
            style={{ objectFit: 'cover', width: '100%', height: '100%' }} />
        </div>
        {(mobileMode || !collapsed) && (
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 500, letterSpacing: '-0.01em', color: '#fff' }}>Toyoshima</div>
            <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 1 }}>
              Inventory
            </div>
          </div>
        )}
      </div>

      {(mobileMode || !collapsed) && (
        <div style={{ padding: '18px 20px 8px', fontSize: 10, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.18em', textTransform: 'uppercase' }}>
          Menu
        </div>
      )}
      {!mobileMode && collapsed && <div style={{ height: 18 }} />}

      {/* Nav items */}
      <nav style={{ padding: '0 10px', display: 'flex', flexDirection: 'column', gap: 1 }}>
        {NAV_ITEMS.map(item => {
          const active = isActive(item);
          const Icon = item.icon;
          const showLabel = mobileMode || !collapsed;
          const disabled = item.disabled;
          return (
            <button key={item.key}
              onClick={disabled ? undefined : () => handleNav(item.href)}
              title={(!mobileMode && collapsed) ? item.label : ''}
              disabled={disabled}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: (!mobileMode && collapsed) ? '8px' : '8px 12px',
                justifyContent: (!mobileMode && collapsed) ? 'center' : 'flex-start',
                border: 0, background: active ? '#d4a820' : 'transparent',
                color: disabled ? 'rgba(255,255,255,0.25)' : active ? '#fff' : 'rgba(255,255,255,0.7)',
                borderRadius: 6, cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 12.5,
                textAlign: 'left', transition: 'background .1s',
                fontFamily: 'inherit', fontWeight: active ? 500 : 400,
                minHeight: mobileMode ? 44 : 'auto',
              }}
              onMouseEnter={e => { if (!active && !disabled) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.07)'; }}
              onMouseLeave={e => { if (!active && !disabled) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
              <Icon size={mobileMode ? 17 : 15} />
              {showLabel && <span style={{ whiteSpace: 'nowrap' }}>{item.label}</span>}
            </button>
          );
        })}
      </nav>

      <div style={{ flex: 1 }} />

      {/* Footer user info — click to logout */}
      <button
        onClick={() => signOut({ callbackUrl: '/login' })}
        title={(!mobileMode && collapsed) ? 'Logout' : ''}
        style={{
          padding: (!mobileMode && collapsed) ? '14px 0' : '14px 16px',
          display: 'flex', alignItems: 'center', gap: 10,
          justifyContent: (!mobileMode && collapsed) ? 'center' : 'flex-start',
          width: '100%', border: 0, borderTop: '1px solid rgba(255,255,255,0.08)',
          background: 'transparent', cursor: 'pointer', fontFamily: 'inherit',
          transition: 'background .1s', textAlign: 'left',
          minHeight: mobileMode ? 56 : 'auto',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
        <div style={{
          width: 30, height: 30, flexShrink: 0, borderRadius: '50%',
          background: '#8b6914', display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: 11, fontWeight: 600, color: '#fff',
          letterSpacing: '0.02em',
        }}>
          {initials}
        </div>
        {(mobileMode || !collapsed) && (
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12.5, color: '#fff', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {username || 'User'}
            </div>
            {roleLabel && (
              <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.45)', marginTop: 1 }}>{roleLabel}</div>
            )}
          </div>
        )}
      </button>
    </aside>
  );

  if (isMobile) {
    return (
      <>
        {/* Scrim */}
        <div
          onClick={onMobileClose}
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(26,25,23,0.45)',
            opacity: isMobileOpen ? 1 : 0,
            pointerEvents: isMobileOpen ? 'auto' : 'none',
            transition: 'opacity .18s ease',
          }}
        />
        {/* Drawer panel */}
        <div style={{
          position: 'fixed', left: 0, top: 0, height: '100vh', zIndex: 101,
          transform: isMobileOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform .22s cubic-bezier(.2,.7,.3,1)',
        }}>
          {sidebarContent(true)}
        </div>
      </>
    );
  }

  return sidebarContent(false);
};

// ─────────────────────────────────────────────────────────── TopBar
interface TopBarProps {
  onToggleSidebar: () => void;
  onToggleMobile?: () => void;
}

const SEGMENT_LABELS: Record<string, string> = {
  'dashboard': 'Dashboard',
  'sales-orders': 'Sales Orders',
  'sos': 'MSFT Order',
  'vendors': 'Vendors',
  'chipbrands': 'Chip Brands',
  'mpns': 'MPN',
  'boards': 'Boards',
  'pallets': 'Pallets',
};

const API = process.env.NEXT_PUBLIC_Django_API_URL || 'http://localhost:8000';

function TopBreadcrumb() {
  const pathname = usePathname();
  const router = useRouter();
  const segments = pathname.split('/').filter(Boolean);

  // Resolve SO number (and pallet label) when on /sales-orders/[id] or /sos/[id][/pallets/[palletId]].
  // Labels come from the shared crumbCache, which source pages (SO list, SO detail) prime as they
  // load — so navigating from a row shows the real label immediately, no raw-id flash. Subscribe so
  // a later fill (or this component's own fallback fetch) re-renders the crumb.
  const [, bump] = useState(0);
  useEffect(() => crumbCache.subscribe(() => bump(n => n + 1)), []);

  const soId = (segments[0] === 'sales-orders' || segments[0] === 'sos') && segments[1] && /^\d+$/.test(segments[1]) ? segments[1] : null;
  const palletId = soId && segments[2] === 'pallets' && segments[3] && /^\d+$/.test(segments[3]) ? segments[3] : null;

  useEffect(() => {
    if (!soId) return;
    if (crumbCache.getSo(soId) && (!palletId || crumbCache.getPallet(palletId))) return;  // already primed
    let cancelled = false;
    getSession().then((session: any) => {
      const token = session?.accessToken;
      return fetch(`${API}/product/sos/${soId}/`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    }).then(r => r.ok ? r.json() : null)
      .then(d => {
        if (cancelled || !d) return;
        if (d.so_number) crumbCache.setSo(soId, d.so_number);
        if (palletId && Array.isArray(d.pallets)) {
          const p = d.pallets.find((pp: any) => String(pp.id) === palletId);
          if (p) crumbCache.setPallet(palletId, p.licence_number || `Pallet #${p.pallet_seq}`);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [soId, palletId]);

  const soLabel = soId ? crumbCache.getSo(soId) : null;
  const palletLabel = palletId ? crumbCache.getPallet(palletId) : null;

  const crumbs: { label: string; href: string; loading?: boolean }[] = [{ label: 'Home', href: '/dashboard' }];
  let path = '';
  segments.forEach((seg, idx) => {
    path += '/' + seg;
    // Collapse the "Pallets" segment on a pallet detail route — the pallet crumb follows.
    if (palletId && seg === 'pallets' && idx === 2) return;
    // An id segment whose label hasn't resolved yet renders as a skeleton, never the raw number.
    if (palletId && idx === 3) { crumbs.push({ label: palletLabel ?? '', href: path, loading: palletLabel == null }); return; }
    if (soId && idx === 1) { crumbs.push({ label: soLabel ?? '', href: path, loading: soLabel == null }); return; }
    crumbs.push({ label: SEGMENT_LABELS[seg] ?? seg, href: path });
  });

  if (crumbs.length <= 1) return null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 4 }}>
      {crumbs.map((c, i) => {
        const isLast = i === crumbs.length - 1;
        return (
          <React.Fragment key={i}>
            {i > 0 && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>}
            {c.loading
              ? <span aria-hidden style={{ display: 'inline-block', width: 44, height: 12, borderRadius: 4, background: 'var(--hair-strong)', opacity: 0.5 }} />
              : <span onClick={isLast ? undefined : () => router.push(c.href)}
                  style={{ fontSize: 13, fontWeight: isLast ? 700 : 500, color: isLast ? 'var(--ink)' : 'var(--ink-4)', cursor: isLast ? 'default' : 'pointer', whiteSpace: 'nowrap' }}>
                  {c.label}
                </span>}
          </React.Fragment>
        );
      })}
    </div>
  );
}

export const TopBar: React.FC<TopBarProps> = ({ onToggleSidebar, onToggleMobile }) => {
  const { data: session } = useSession();
  const isMobile = useIsMobile();
  const username = session?.user?.name ?? session?.user?.email ?? '';
  return (
  <div style={{
    height: 56, borderBottom: '1px solid var(--hair)', background: 'var(--bg)',
    display: 'flex', alignItems: 'center', padding: '0 16px', gap: 12,
    position: 'sticky', top: 0, zIndex: 50,
  }}>
    <button
      onClick={isMobile ? onToggleMobile : onToggleSidebar}
      title={isMobile ? 'Open menu' : 'Toggle sidebar'}
      style={{
        background: 'none', border: 0, cursor: 'pointer', color: 'var(--ink-3)',
        padding: 6, display: 'inline-flex', borderRadius: 3,
      }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
      {isMobile ? <IconMenu size={18} /> : <IconPanelLeft size={16} />}
    </button>
    <TopBreadcrumb />
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
        background: 'var(--err)', borderRadius: '50%',
      }} />
    </button>
  </div>
  );
};
