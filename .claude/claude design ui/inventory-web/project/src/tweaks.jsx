// Settings page + Tweaks panel for in-preview controls
const SettingsPage = () => (
  <div className="fade-in" style={{ padding: '24px 28px 40px' }}>
    <Breadcrumbs items={[{ label: 'Home' }, { label: 'Settings' }]} />
    <div style={{ margin: '14px 0 20px' }}>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 400, letterSpacing: '-0.015em' }}>Settings</h1>
      <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 4 }}>
        System preferences and integrations.
      </div>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      {[
        ['Users & Permissions', 'Invite teammates, assign roles.'],
      ].map(([t, s]) => (
        <Card key={t} style={{ cursor: 'pointer' }}>
          <div style={{ fontSize: 13, color: 'var(--ink)', marginBottom: 4 }}>{t}</div>
          <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{s}</div>
        </Card>
      ))}
    </div>
  </div>
);

const TweaksPanel = ({ open, collapsed, onCollapsed }) => {
  if (!open) return null;
  return (
    <div style={{
      position: 'fixed', bottom: 20, right: 20, width: 260,
      background: 'var(--surface)', border: '1px solid var(--hair-strong)',
      borderRadius: 3, padding: 14, zIndex: 1500,
      boxShadow: '0 12px 32px rgba(26,25,23,0.14)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        paddingBottom: 10, marginBottom: 12, borderBottom: '1px solid var(--hair)' }}>
        <div style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase',
          color: 'var(--ink-3)' }}>Tweaks</div>
        <span className="mono" style={{ fontSize: 10, color: 'var(--ink-4)' }}>WR-UI</span>
      </div>
      <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        fontSize: 12, color: 'var(--ink-2)', cursor: 'pointer' }}>
        <span>Sidebar collapsed</span>
        <span onClick={() => onCollapsed(!collapsed)} style={{
          width: 32, height: 18, borderRadius: 9,
          background: collapsed ? 'var(--ink)' : 'var(--hair-strong)',
          position: 'relative', transition: 'background .15s',
        }}>
          <span style={{ position: 'absolute', top: 2, left: collapsed ? 16 : 2,
            width: 14, height: 14, borderRadius: '50%',
            background: '#fcfbf8', transition: 'left .15s',
            boxShadow: '0 1px 2px rgba(0,0,0,.15)' }}/>
        </span>
      </label>
      <div style={{ fontSize: 10.5, color: 'var(--ink-4)', marginTop: 12, lineHeight: 1.5 }}>
        Toggle the Tweaks button in the toolbar to hide this panel.
      </div>
    </div>
  );
};

Object.assign(window, { SettingsPage, TweaksPanel });
