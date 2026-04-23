// Shared UI primitives — Japanese-minimal style
const { useState, useEffect, useRef, useMemo, createContext, useContext } = React;

/* ---------- Button ---------- */
const Button = ({ variant = 'default', size = 'md', children, icon, onClick, disabled, style, type = 'button', title }) => {
  const base = {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    border: '1px solid', borderRadius: 3, cursor: disabled ? 'not-allowed' : 'pointer',
    fontWeight: 400, letterSpacing: '-0.005em',
    transition: 'all .12s ease', whiteSpace: 'nowrap', userSelect: 'none',
    opacity: disabled ? 0.4 : 1,
  };
  const sizes = {
    sm: { padding: '4px 10px', fontSize: 12, height: 26 },
    md: { padding: '6px 12px', fontSize: 13, height: 30 },
    lg: { padding: '8px 16px', fontSize: 13, height: 36 },
  };
  const variants = {
    default:  { background: 'var(--surface)', borderColor: 'var(--hair-strong)', color: 'var(--ink)' },
    primary:  { background: 'var(--ink)', borderColor: 'var(--ink)', color: '#fcfbf8' },
    ghost:    { background: 'transparent', borderColor: 'transparent', color: 'var(--ink-2)' },
    danger:   { background: 'transparent', borderColor: 'var(--hair-strong)', color: 'var(--err)' },
    outline:  { background: 'transparent', borderColor: 'var(--hair-strong)', color: 'var(--ink)' },
  };
  const [hover, setHover] = useState(false);
  const hoverStyle = hover && !disabled ? {
    default:  { background: 'var(--surface-2)', borderColor: 'var(--ink-4)' },
    primary:  { background: 'var(--ink-2)' },
    ghost:    { background: 'var(--surface-2)' },
    danger:   { background: 'var(--surface-2)' },
    outline:  { background: 'var(--surface-2)' },
  }[variant] : {};
  return (
    <button type={type} disabled={disabled} onClick={onClick} title={title}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ ...base, ...sizes[size], ...variants[variant], ...hoverStyle, ...style }}>
      {icon && <span style={{ display: 'inline-flex' }}>{icon}</span>}
      {children}
    </button>
  );
};

/* ---------- Input ---------- */
const Input = ({ value, onChange, placeholder, icon, type = 'text', style, onKeyDown, autoFocus, size = 'md', disabled = false }) => {
  const ref = useRef();
  useEffect(() => { if (autoFocus && ref.current) ref.current.focus(); }, [autoFocus]);
  const h = size === 'sm' ? 26 : 30;
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6,
      border: '1px solid var(--hair-strong)', borderRadius: 3,
      background: disabled ? 'var(--surface-2)' : 'var(--surface)', padding: `0 10px`, height: h,
      color: 'var(--ink-3)', opacity: disabled ? 0.75 : 1, ...style }}>
      {icon && <span style={{ display: 'inline-flex' }}>{icon}</span>}
      <input ref={ref} type={type} value={value} disabled={disabled}
        onChange={e => onChange && onChange(e.target.value)}
        placeholder={placeholder} onKeyDown={onKeyDown}
        style={{ border: 0, outline: 0, background: 'transparent',
          color: disabled ? 'var(--ink-3)' : 'var(--ink)',
          width: '100%', padding: 0, fontSize: size === 'sm' ? 12 : 13, lineHeight: 1,
          cursor: disabled ? 'not-allowed' : 'text' }} />
    </div>
  );
};

/* ---------- Select ---------- */
const Select = ({ value, onChange, options, placeholder, style, size = 'md' }) => {
  const h = size === 'sm' ? 26 : 30;
  return (
    <div style={{ position: 'relative', display: 'inline-block', ...style }}>
      <select value={value} onChange={e => onChange(e.target.value)}
        style={{ appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none',
          border: '1px solid var(--hair-strong)', borderRadius: 3, background: 'var(--surface)',
          height: h, padding: '0 28px 0 10px', color: 'var(--ink)',
          fontSize: size === 'sm' ? 12 : 13, cursor: 'pointer', outline: 'none', width: '100%' }}>
        {placeholder && <option value="">{placeholder}</option>}
        {options.map(o => typeof o === 'string'
          ? <option key={o} value={o}>{o}</option>
          : <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
        pointerEvents: 'none', color: 'var(--ink-3)', display: 'inline-flex' }}>
        <Icons.ChevronDown size={12} />
      </span>
    </div>
  );
};

/* ---------- Badge / Pill ---------- */
const Badge = ({ children, tone = 'neutral', style }) => {
  const tones = {
    neutral: { background: 'var(--surface-2)', color: 'var(--ink-2)', border: 'var(--hair)' },
    ok:      { background: '#eef2ea', color: '#4a6b3f', border: '#d5dcce' },
    warn:    { background: '#f5eedf', color: '#a87a2b', border: '#e4d9b6' },
    err:     { background: '#f3e2dd', color: '#a8402b', border: '#e4c4bb' },
    ink:     { background: 'var(--ink)', color: '#fcfbf8', border: 'var(--ink)' },
  };
  const t = tones[tone];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '1px 7px', borderRadius: 3, border: `1px solid ${t.border}`,
      background: t.background, color: t.color, fontSize: 11,
      letterSpacing: '0.02em', lineHeight: 1.6, whiteSpace: 'nowrap', ...style }}>
      {children}
    </span>
  );
};

/* ---------- Card / Surface ---------- */
const Card = ({ children, style, pad = 20 }) => (
  <div style={{ background: 'var(--surface)', border: '1px solid var(--hair)',
    borderRadius: 3, padding: pad, ...style }}>
    {children}
  </div>
);

/* ---------- Section header ---------- */
const SectionHeader = ({ label, count, action, style }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    paddingBottom: 10, borderBottom: '1px solid var(--hair)', marginBottom: 14, ...style }}>
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
      <span style={{ fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase',
        color: 'var(--ink-3)' }}>{label}</span>
      {count != null && <span className="num" style={{ fontSize: 11, color: 'var(--ink-4)' }}>
        {String(count).padStart(2, '0')}
      </span>}
    </div>
    {action}
  </div>
);

/* ---------- Modal ---------- */
const Modal = ({ open, onClose, title, children, width = 480, footer }) => {
  useEffect(() => {
    if (!open) return;
    const h = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(26,25,23,0.28)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div className="modal-in" onClick={e => e.stopPropagation()}
        style={{ background: 'var(--surface)', border: '1px solid var(--hair-strong)',
          borderRadius: 3, width, maxWidth: '92vw', maxHeight: '90vh',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(26,25,23,0.12)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--hair)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 13, fontWeight: 500 }}>{title}</div>
          <button onClick={onClose} style={{ background: 'none', border: 0, cursor: 'pointer',
            color: 'var(--ink-3)', display: 'inline-flex', padding: 4 }}>
            <Icons.Close size={14} />
          </button>
        </div>
        <div style={{ padding: 20, overflow: 'auto', flex: 1 }}>{children}</div>
        {footer && <div style={{ padding: '12px 20px', borderTop: '1px solid var(--hair)',
          display: 'flex', justifyContent: 'flex-end', gap: 8 }}>{footer}</div>}
      </div>
    </div>
  );
};

/* ---------- Toast ---------- */
const ToastContext = createContext(null);
const useToast = () => useContext(ToastContext);

const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);
  const push = (msg, tone = 'neutral') => {
    const id = Math.random().toString(36).slice(2);
    setToasts(t => [...t, { id, msg, tone }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 2800);
  };
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div style={{ position: 'fixed', bottom: 20, right: 20, display: 'flex',
        flexDirection: 'column', gap: 8, zIndex: 2000 }}>
        {toasts.map(t => (
          <div key={t.id} className="toast-in" style={{
            background: 'var(--ink)', color: '#fcfbf8',
            padding: '10px 14px', borderRadius: 3, fontSize: 12,
            minWidth: 220, display: 'flex', alignItems: 'center', gap: 8,
            boxShadow: '0 8px 24px rgba(26,25,23,0.18)' }}>
            <Icons.Check size={14} />
            {t.msg}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

/* ---------- Pagination ---------- */
const Pagination = ({ page, pageCount, onChange, total, pageSize }) => {
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const pages = [];
  const push = (p) => pages.push(p);
  push(1);
  if (page > 3) push('…');
  for (let p = Math.max(2, page - 1); p <= Math.min(pageCount - 1, page + 1); p++) push(p);
  if (page < pageCount - 2) push('…');
  if (pageCount > 1) push(pageCount);
  const unique = pages.filter((v, i, a) => v === '…' || a.indexOf(v) === i);

  const btn = (label, p, active, disabled) => (
    <button key={label + '_' + p} disabled={disabled}
      onClick={() => !disabled && typeof p === 'number' && onChange(p)}
      style={{
        minWidth: 28, height: 28, padding: '0 8px',
        border: '1px solid ' + (active ? 'var(--ink)' : 'var(--hair)'),
        background: active ? 'var(--ink)' : 'var(--surface)',
        color: active ? '#fcfbf8' : 'var(--ink-2)',
        cursor: disabled ? 'default' : 'pointer', borderRadius: 3,
        fontSize: 12, opacity: disabled ? 0.4 : 1,
      }}>{label}</button>
  );

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '14px 16px', borderTop: '1px solid var(--hair)' }}>
      <div style={{ fontSize: 12, color: 'var(--ink-3)' }} className="num">
        {from}–{to} of {total}
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        {btn('‹', page - 1, false, page === 1)}
        {unique.map((p, i) =>
          p === '…'
            ? <span key={'e' + i} style={{ padding: '0 4px', color: 'var(--ink-4)', alignSelf: 'center' }}>…</span>
            : btn(p, p, p === page)
        )}
        {btn('›', page + 1, false, page === pageCount)}
      </div>
    </div>
  );
};

/* ---------- Breadcrumbs ---------- */
const Breadcrumbs = ({ items }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink-3)' }}>
    {items.map((it, i) => (
      <React.Fragment key={i}>
        {i > 0 && <span style={{ color: 'var(--ink-5)' }}>/</span>}
        {it.onClick ? (
          <button onClick={it.onClick} style={{ background: 'none', border: 0, padding: 0,
            cursor: 'pointer', color: i === items.length - 1 ? 'var(--ink)' : 'var(--ink-3)',
            fontSize: 12 }}>
            {it.label}
          </button>
        ) : (
          <span style={{ color: i === items.length - 1 ? 'var(--ink)' : 'var(--ink-3)' }}>{it.label}</span>
        )}
      </React.Fragment>
    ))}
  </div>
);

/* ---------- Tabs ---------- */
const Tabs = ({ value, onChange, tabs }) => (
  <div style={{ display: 'flex', borderBottom: '1px solid var(--hair)', gap: 0 }}>
    {tabs.map(t => {
      const active = t.value === value;
      return (
        <button key={t.value} onClick={() => onChange(t.value)}
          style={{
            background: 'none', border: 0, padding: '10px 0',
            marginRight: 24, cursor: 'pointer',
            color: active ? 'var(--ink)' : 'var(--ink-3)',
            borderBottom: active ? '1.5px solid var(--ink)' : '1.5px solid transparent',
            marginBottom: -1, fontSize: 13,
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
          {t.label}
          {t.count != null && <span className="num" style={{
            fontSize: 11, color: 'var(--ink-4)',
            background: 'var(--surface-2)', padding: '0 6px', borderRadius: 2,
          }}>{t.count}</span>}
        </button>
      );
    })}
  </div>
);

/* ---------- Empty state ---------- */
const Empty = ({ label = "No data", sub }) => (
  <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--ink-3)' }}>
    <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>{label}</div>
    {sub && <div style={{ fontSize: 12, marginTop: 6 }}>{sub}</div>}
  </div>
);

/* ---------- Inline-editable cell ---------- */
const EditableCell = ({ value, onSave, type = 'text', width = '100%', align = 'left' }) => {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const commit = () => { setEditing(false); if (v !== value) onSave(v); };
  if (editing) {
    return (
      <input autoFocus value={v} type={type}
        onChange={e => setV(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setV(value); setEditing(false); } }}
        style={{ width, padding: '2px 6px', border: '1px solid var(--ink)',
          borderRadius: 2, background: 'var(--surface)', color: 'var(--ink)',
          fontSize: 12, textAlign: align, fontVariantNumeric: 'tabular-nums' }} />
    );
  }
  return (
    <div onDoubleClick={() => setEditing(true)}
      title="Double-click to edit"
      style={{ width, padding: '2px 6px', borderRadius: 2,
        cursor: 'text', textAlign: align,
        border: '1px solid transparent' }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
      {value || <span style={{ color: 'var(--ink-4)' }}>—</span>}
    </div>
  );
};

/* ---------- Photo placeholder thumbnail ---------- */
const PhotoThumb = ({ caption, size = 120, seed = 1, onClick, src }) => {
  // Deterministic soft gradient via seed
  const hues = [30, 45, 15, 60, 90, 200, 20, 40];
  const h1 = hues[seed % hues.length];
  const h2 = hues[(seed + 3) % hues.length];
  return (
    <div onClick={onClick} style={{
      width: size, height: size, border: '1px solid var(--hair-strong)', borderRadius: 3,
      background: src ? 'var(--surface-2)'
        : `linear-gradient(135deg, oklch(92% 0.02 ${h1}) 0%, oklch(85% 0.015 ${h2}) 100%)`,
      position: 'relative', overflow: 'hidden', cursor: onClick ? 'pointer' : 'default',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {src
        ? <img src={src} alt={caption || ''} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        : <div className="mono" style={{ fontSize: 9, color: 'var(--ink-3)',
            letterSpacing: '0.05em', opacity: 0.6 }}>PHOTO</div>}
      {caption && <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0,
        padding: '4px 6px', fontSize: 10, color: 'var(--ink-2)',
        background: 'rgba(252,251,248,0.85)', borderTop: '1px solid var(--hair)' }}>{caption}</div>}
    </div>
  );
};

Object.assign(window, {
  Button, Input, Select, Badge, Card, SectionHeader, Modal,
  ToastProvider, useToast, Pagination, Breadcrumbs, Tabs, Empty,
  EditableCell, PhotoThumb,
});
