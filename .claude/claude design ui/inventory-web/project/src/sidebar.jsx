const Sidebar = ({ page, onNav, collapsed }) => {
  const items = [
    { key: 'dashboard', label: 'Dashboard', icon: Icons.Dashboard },
    { key: 'sos',       label: 'Sales Orders', icon: Icons.SO },
    { key: 'vendors',   label: 'Vendors', icon: Icons.Vendor },
    { key: 'chipbrands',label: 'Chip Brands', icon: Icons.Chip },
    { key: 'settings',  label: 'Settings', icon: Icons.Settings },
  ];
  const W = collapsed ? 64 : 220;
  return (
    <aside style={{
      width: W, flexShrink: 0, height: '100vh', position: 'sticky', top: 0,
      borderRight: '1px solid var(--hair)', background: 'var(--bg)',
      display: 'flex', flexDirection: 'column', transition: 'width .18s ease',
    }}>
      {/* Brand */}
      <div style={{ padding: collapsed ? '20px 0' : '22px 20px', borderBottom: '1px solid var(--hair)',
        display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start', gap: 10 }}>
        <div style={{ width: 22, height: 22, border: '1.5px solid var(--ink)', borderRadius: 2,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 600, letterSpacing: '-0.02em' }}>W</div>
        {!collapsed && <div>
          <div style={{ fontSize: 12.5, fontWeight: 500, letterSpacing: '-0.01em' }}>Toyoshima</div>
          <div style={{ fontSize: 10.5, color: 'var(--ink-3)', letterSpacing: '0.08em',
            textTransform: 'uppercase', marginTop: 1 }}>Inventory</div>
        </div>}
      </div>

      {/* Section label */}
      {!collapsed && <div style={{ padding: '18px 20px 8px', fontSize: 10,
        color: 'var(--ink-4)', letterSpacing: '0.18em', textTransform: 'uppercase' }}>
        Menu
      </div>}
      {collapsed && <div style={{ height: 18 }} />}

      {/* Items */}
      <nav style={{ padding: collapsed ? '0 10px' : '0 10px', display: 'flex', flexDirection: 'column', gap: 1 }}>
        {items.map(it => {
          const active = it.key === page || (it.key === 'sos' && ['sos','so_detail','board_detail'].includes(page));
          return (
            <button key={it.key} onClick={() => onNav(it.key)}
              title={collapsed ? it.label : ''}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: collapsed ? '8px' : '8px 12px',
                justifyContent: collapsed ? 'center' : 'flex-start',
                border: 0, background: active ? 'var(--surface)' : 'transparent',
                color: active ? 'var(--ink)' : 'var(--ink-2)',
                borderRadius: 3, cursor: 'pointer', fontSize: 12.5,
                position: 'relative', textAlign: 'left',
                transition: 'background .1s',
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--surface)'; }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}>
              {active && <span style={{ position: 'absolute', left: 0, top: 6, bottom: 6,
                width: 2, background: 'var(--ink)', borderRadius: 1 }}/>}
              <it.icon size={15} />
              {!collapsed && <span style={{ whiteSpace: 'nowrap' }}>{it.label}</span>}
            </button>
          );
        })}
      </nav>

      <div style={{ flex: 1 }} />

      {/* Footer */}
      <div style={{ borderTop: '1px solid var(--hair)', padding: collapsed ? 14 : '14px 16px',
        display: 'flex', alignItems: 'center', gap: 10, justifyContent: collapsed ? 'center' : 'flex-start' }}>
        <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--ink-2)',
          color: '#fcfbf8', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, letterSpacing: '0.05em' }}>LK</div>
        {!collapsed && <div style={{ lineHeight: 1.3, minWidth: 0 }}>
          <div style={{ fontSize: 12, color: 'var(--ink)' }}>Lin Kai</div>
          <div style={{ fontSize: 11, color: 'var(--ink-4)' }}>Floor Manager</div>
        </div>}
      </div>
    </aside>
  );
};

const TopBar = ({ onToggleSidebar }) => {
  return (
    <div style={{
      height: 56, borderBottom: '1px solid var(--hair)', background: 'var(--bg)',
      display: 'flex', alignItems: 'center', padding: '0 28px', gap: 16,
      position: 'sticky', top: 0, zIndex: 50,
    }}>
      <button onClick={onToggleSidebar} title="Toggle sidebar"
        style={{ background: 'none', border: 0, cursor: 'pointer', color: 'var(--ink-3)',
          padding: 6, display: 'inline-flex', borderRadius: 3 }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--surface)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
        <Icons.PanelLeft size={16} />
      </button>
      <div style={{ flex: 1 }} />
      <div className="mono" style={{ fontSize: 11, color: 'var(--ink-4)', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
        WH-01 · BAY 3
      </div>
      <div style={{ width: 1, height: 20, background: 'var(--hair)' }} />
      <button style={{ background: 'none', border: 0, cursor: 'pointer',
        color: 'var(--ink-3)', padding: 6, position: 'relative', display: 'inline-flex' }}>
        <Icons.Bell size={15} />
        <span style={{ position: 'absolute', top: 4, right: 4, width: 5, height: 5,
          background: 'var(--ink)', borderRadius: '50%' }} />
      </button>
    </div>
  );
};

Object.assign(window, { Sidebar, TopBar });
