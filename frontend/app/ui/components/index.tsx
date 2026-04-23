'use client';
import React, {
  useState, useEffect, useRef, useContext, createContext,
  ReactNode, CSSProperties, KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';

// ─────────────────────────────────────────────────────────── Button
type ButtonVariant = 'default' | 'primary' | 'ghost' | 'danger' | 'outline';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children?: ReactNode;
  icon?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  style?: CSSProperties;
  type?: 'button' | 'submit' | 'reset';
  title?: string;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'default', size = 'md', children, icon, onClick,
  disabled, style, type = 'button', title,
}) => {
  const [hover, setHover] = useState(false);
  const sizes: Record<ButtonSize, CSSProperties> = {
    sm: { padding: '4px 10px', fontSize: 12, height: 26 },
    md: { padding: '6px 12px', fontSize: 13, height: 30 },
    lg: { padding: '8px 16px', fontSize: 13, height: 36 },
  };
  const variants: Record<ButtonVariant, CSSProperties> = {
    default: { background: 'var(--surface)', borderColor: 'var(--hair-strong)', color: 'var(--ink)' },
    primary: { background: 'var(--ink)', borderColor: 'var(--ink)', color: '#fcfbf8' },
    ghost:   { background: 'transparent', borderColor: 'transparent', color: 'var(--ink-2)' },
    danger:  { background: 'transparent', borderColor: 'var(--hair-strong)', color: 'var(--err)' },
    outline: { background: 'transparent', borderColor: 'var(--hair-strong)', color: 'var(--ink)' },
  };
  const hovers: Record<ButtonVariant, CSSProperties> = {
    default: { background: 'var(--surface-2)', borderColor: 'var(--ink-4)' },
    primary: { background: 'var(--ink-2)' },
    ghost:   { background: 'var(--surface-2)' },
    danger:  { background: 'var(--surface-2)' },
    outline: { background: 'var(--surface-2)' },
  };
  const base: CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    border: '1px solid', borderRadius: 3, cursor: disabled ? 'not-allowed' : 'pointer',
    fontWeight: 400, letterSpacing: '-0.005em', transition: 'all .12s ease',
    whiteSpace: 'nowrap', userSelect: 'none', opacity: disabled ? 0.4 : 1,
    fontFamily: 'inherit',
  };
  return (
    <button type={type} disabled={disabled} onClick={onClick} title={title}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ ...base, ...sizes[size], ...variants[variant], ...(hover && !disabled ? hovers[variant] : {}), ...style }}>
      {icon && <span style={{ display: 'inline-flex' }}>{icon}</span>}
      {children}
    </button>
  );
};

// ─────────────────────────────────────────────────────────── Input
interface InputProps {
  value: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  icon?: ReactNode;
  type?: string;
  style?: CSSProperties;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  autoFocus?: boolean;
  size?: 'sm' | 'md';
  disabled?: boolean;
}

export const Input: React.FC<InputProps> = ({
  value, onChange, placeholder, icon, type = 'text', style,
  onKeyDown, autoFocus, size = 'md', disabled = false,
}) => {
  const ref = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (autoFocus && ref.current) ref.current.focus(); }, [autoFocus]);
  const h = size === 'sm' ? 26 : 30;
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      border: `1px solid ${focused ? 'var(--ink-4)' : 'var(--hair-strong)'}`,
      borderRadius: 3,
      background: disabled ? 'var(--surface-2)' : 'var(--surface)',
      padding: '0 10px', height: h, color: 'var(--ink-3)', opacity: disabled ? 0.75 : 1,
      ...style,
    }}>
      {icon && <span style={{ display: 'inline-flex' }}>{icon}</span>}
      <input ref={ref} type={type} value={value} disabled={disabled}
        onChange={e => onChange?.(e.target.value)}
        placeholder={placeholder} onKeyDown={onKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          border: 0, outline: 0, boxShadow: 'none', background: 'transparent',
          color: disabled ? 'var(--ink-3)' : 'var(--ink)',
          width: '100%', padding: 0,
          fontSize: size === 'sm' ? 12 : 13, lineHeight: 1,
          cursor: disabled ? 'not-allowed' : 'text', fontFamily: 'inherit',
        }} />
    </div>
  );
};

// ─────────────────────────────────────────────────────────── Select
interface SelectOption { value: string; label: string; }
interface SelectProps {
  value: string;
  onChange: (v: string) => void;
  options: SelectOption[];
  placeholder?: string;
  style?: CSSProperties;
  size?: 'sm' | 'md';
}

export const Select: React.FC<SelectProps> = ({
  value, onChange, options, placeholder, style, size = 'md',
}) => {
  const h = size === 'sm' ? 26 : 30;
  return (
    <div style={{ position: 'relative', display: 'inline-block', ...style }}>
      <select value={value} onChange={e => onChange(e.target.value)}
        style={{
          appearance: 'none', WebkitAppearance: 'none',
          border: '1px solid var(--hair-strong)', borderRadius: 3,
          background: 'var(--surface)', height: h,
          padding: '0 28px 0 10px', color: 'var(--ink)',
          fontSize: size === 'sm' ? 12 : 13, cursor: 'pointer',
          outline: 'none', width: '100%', fontFamily: 'inherit',
        }}>
        {placeholder && <option value="">{placeholder}</option>}
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <span style={{
        position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
        pointerEvents: 'none', color: 'var(--ink-3)', display: 'inline-flex',
      }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </span>
    </div>
  );
};

// ─────────────────────────────────────────────────────────── Badge
type BadgeTone = 'neutral' | 'ok' | 'warn' | 'err' | 'ink';
interface BadgeProps { children: ReactNode; tone?: BadgeTone; style?: CSSProperties; }

export const Badge: React.FC<BadgeProps> = ({ children, tone = 'neutral', style }) => {
  const tones: Record<BadgeTone, { background: string; color: string; border: string }> = {
    neutral: { background: 'var(--surface-2)', color: 'var(--ink-2)', border: 'var(--hair)' },
    ok:      { background: '#eef2ea', color: '#4a6b3f', border: '#d5dcce' },
    warn:    { background: '#f5eedf', color: '#a87a2b', border: '#e4d9b6' },
    err:     { background: '#f3e2dd', color: '#a8402b', border: '#e4c4bb' },
    ink:     { background: 'var(--ink)', color: '#fcfbf8', border: 'var(--ink)' },
  };
  const t = tones[tone];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '1px 7px', borderRadius: 3, border: `1px solid ${t.border}`,
      background: t.background, color: t.color, fontSize: 11,
      letterSpacing: '0.02em', lineHeight: 1.6, whiteSpace: 'nowrap', ...style,
    }}>
      {children}
    </span>
  );
};

// ─────────────────────────────────────────────────────────── Card
interface CardProps { children: ReactNode; style?: CSSProperties; pad?: number; }

export const Card: React.FC<CardProps> = ({ children, style, pad = 20 }) => (
  <div style={{
    background: 'var(--surface)', border: '1px solid var(--hair)',
    borderRadius: 3, padding: pad, ...style,
  }}>
    {children}
  </div>
);

// ─────────────────────────────────────────────────────────── SectionHeader
interface SectionHeaderProps {
  label: string; count?: number; action?: ReactNode; style?: CSSProperties;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({ label, count, action, style }) => (
  <div style={{
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    paddingBottom: 10, borderBottom: '1px solid var(--hair)', marginBottom: 14, ...style,
  }}>
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
      <span style={{ fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>
        {label}
      </span>
      {count != null && (
        <span className="num" style={{ fontSize: 11, color: 'var(--ink-4)' }}>
          {String(count).padStart(2, '0')}
        </span>
      )}
    </div>
    {action}
  </div>
);

// ─────────────────────────────────────────────────────────── Modal
interface ModalProps {
  open: boolean; onClose: () => void; title: string;
  children: ReactNode; width?: number; footer?: ReactNode;
}

export const Modal: React.FC<ModalProps> = ({ open, onClose, title, children, width = 480, footer }) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    if (!open) return;
    const h = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open || !mounted) return null;
  return createPortal(
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(26,25,23,0.28)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: '72px 0 24px',
    }}>
      <div className="modal-in" onClick={e => e.stopPropagation()} style={{
        background: 'var(--surface)', border: '1px solid var(--hair-strong)',
        borderRadius: 3, width, maxWidth: '92vw', maxHeight: 'calc(100vh - 96px)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: '0 20px 60px rgba(26,25,23,0.12)',
      }}>
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid var(--hair)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ fontSize: 13, fontWeight: 500 }}>{title}</div>
          <button onClick={onClose} style={{
            background: 'none', border: 0, cursor: 'pointer',
            color: 'var(--ink-3)', display: 'inline-flex', padding: 4,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div style={{ padding: 20, overflow: 'auto', flex: 1 }}>{children}</div>
        {footer && (
          <div style={{
            padding: '12px 20px', borderTop: '1px solid var(--hair)',
            display: 'flex', justifyContent: 'flex-end', gap: 8,
          }}>
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

// ─────────────────────────────────────────────────────────── Toast
type ToastFn = (msg: string, tone?: BadgeTone) => void;
const ToastContext = createContext<ToastFn | null>(null);
export const useToast = () => useContext(ToastContext)!;

interface Toast { id: string; msg: string; }

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push: ToastFn = (msg) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(t => [...t, { id, msg }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 2800);
  };
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div style={{ position: 'fixed', bottom: 20, right: 20, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 2000 }}>
        {toasts.map(t => (
          <div key={t.id} className="toast-in" style={{
            background: 'var(--ink)', color: '#fcfbf8',
            padding: '10px 14px', borderRadius: 3, fontSize: 12,
            minWidth: 220, display: 'flex', alignItems: 'center', gap: 8,
            boxShadow: '0 8px 24px rgba(26,25,23,0.18)',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            {t.msg}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

// ─────────────────────────────────────────────────────────── Pagination
interface PaginationProps {
  page: number; pageCount: number; onChange: (p: number) => void;
  total: number; pageSize: number;
}

export const Pagination: React.FC<PaginationProps> = ({ page, pageCount, onChange, total, pageSize }) => {
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const pages: (number | '…')[] = [];
  pages.push(1);
  if (page > 3) pages.push('…');
  for (let p = Math.max(2, page - 1); p <= Math.min(pageCount - 1, page + 1); p++) pages.push(p);
  if (page < pageCount - 2) pages.push('…');
  if (pageCount > 1) pages.push(pageCount);
  const unique = pages.filter((v, i, a) => v === '…' || a.indexOf(v) === i);

  const btn = (label: ReactNode, p: number | null, active: boolean, disabled: boolean) => (
    <button key={String(label) + String(p)} disabled={disabled}
      onClick={() => { if (!disabled && p !== null) onChange(p); }}
      style={{
        minWidth: 28, height: 28, padding: '0 8px',
        border: '1px solid ' + (active ? 'var(--ink)' : 'var(--hair)'),
        background: active ? 'var(--ink)' : 'var(--surface)',
        color: active ? '#fcfbf8' : 'var(--ink-2)',
        cursor: disabled ? 'default' : 'pointer', borderRadius: 3,
        fontSize: 12, opacity: disabled ? 0.4 : 1, fontFamily: 'inherit',
      }}>{label}</button>
  );

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '14px 16px', borderTop: '1px solid var(--hair)',
    }}>
      <div style={{ fontSize: 12, color: 'var(--ink-3)' }} className="num">{from}–{to} of {total}</div>
      <div style={{ display: 'flex', gap: 4 }}>
        {btn('‹', page - 1, false, page === 1)}
        {unique.map((p, i) =>
          p === '…'
            ? <span key={'e' + i} style={{ padding: '0 4px', color: 'var(--ink-4)', alignSelf: 'center' }}>…</span>
            : btn(p, p, p === page, false)
        )}
        {btn('›', page + 1, false, page === pageCount)}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────── Breadcrumbs
interface BreadcrumbItem { label: string; onClick?: () => void; }
interface BreadcrumbsProps { items: BreadcrumbItem[]; }

export const Breadcrumbs: React.FC<BreadcrumbsProps> = ({ items }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink-3)' }}>
    {items.map((it, i) => (
      <React.Fragment key={i}>
        {i > 0 && <span style={{ color: 'var(--ink-5)' }}>/</span>}
        {it.onClick ? (
          <button onClick={it.onClick} style={{
            background: 'none', border: 0, padding: 0, cursor: 'pointer',
            color: i === items.length - 1 ? 'var(--ink)' : 'var(--ink-3)', fontSize: 12,
            fontFamily: 'inherit',
          }}>{it.label}</button>
        ) : (
          <span style={{ color: i === items.length - 1 ? 'var(--ink)' : 'var(--ink-3)' }}>{it.label}</span>
        )}
      </React.Fragment>
    ))}
  </div>
);

// ─────────────────────────────────────────────────────────── Tabs
interface TabItem { value: string; label: string; count?: number; }
interface TabsProps { value: string; onChange: (v: string) => void; tabs: TabItem[]; }

export const Tabs: React.FC<TabsProps> = ({ value, onChange, tabs }) => (
  <div style={{ display: 'flex', borderBottom: '1px solid var(--hair)' }}>
    {tabs.map(t => {
      const active = t.value === value;
      return (
        <button key={t.value} onClick={() => onChange(t.value)} style={{
          background: 'none', border: 0, padding: '10px 0',
          marginRight: 24, cursor: 'pointer',
          color: active ? 'var(--ink)' : 'var(--ink-3)',
          borderBottom: active ? '1.5px solid var(--ink)' : '1.5px solid transparent',
          marginBottom: -1, fontSize: 13,
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontFamily: 'inherit',
        }}>
          {t.label}
          {t.count != null && (
            <span className="num" style={{
              fontSize: 11, color: 'var(--ink-4)',
              background: 'var(--surface-2)', padding: '0 6px', borderRadius: 2,
            }}>{t.count}</span>
          )}
        </button>
      );
    })}
  </div>
);

// ─────────────────────────────────────────────────────────── Empty
interface EmptyProps { label?: string; sub?: string; }
export const Empty: React.FC<EmptyProps> = ({ label = 'No data', sub }) => (
  <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--ink-3)' }}>
    <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>{label}</div>
    {sub && <div style={{ fontSize: 12, marginTop: 6 }}>{sub}</div>}
  </div>
);

// ─────────────────────────────────────────────────────────── EditableCell
interface EditableCellProps {
  value: string | number; onSave: (v: string) => void;
  type?: 'text' | 'number'; align?: 'left' | 'right'; width?: string | number;
}

export const EditableCell: React.FC<EditableCellProps> = ({
  value, onSave, type = 'text', align = 'left', width = '100%',
}) => {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);
  const commit = () => { setEditing(false); if (v !== String(value)) onSave(v); };
  if (editing) {
    return (
      <input autoFocus value={v} type={type}
        onChange={e => setV(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') { setV(String(value)); setEditing(false); }
        }}
        style={{
          width, padding: '2px 6px', border: '1px solid var(--ink)',
          borderRadius: 2, background: 'var(--surface)', color: 'var(--ink)',
          fontSize: 12, textAlign: align, fontVariantNumeric: 'tabular-nums',
          fontFamily: 'inherit', outline: 'none', boxShadow: 'none',
        }} />
    );
  }
  return (
    <div onDoubleClick={() => setEditing(true)} title="Double-click to edit" style={{
      width, padding: '2px 6px', borderRadius: 2, cursor: 'text',
      textAlign: align, border: '1px solid transparent',
    }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
      {value || <span style={{ color: 'var(--ink-4)' }}>—</span>}
    </div>
  );
};

// ─────────────────────────────────────────────────────────── Field label
interface FieldProps { label: string; children: ReactNode; span?: number; }
export const Field: React.FC<FieldProps> = ({ label, children, span = 1 }) => (
  <label style={{ gridColumn: `span ${span}`, display: 'flex', flexDirection: 'column', gap: 5 }}>
    <span style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>
      {label}
    </span>
    {children}
  </label>
);

// ─────────────────────────────────────────────────────────── Table style helpers
export const thS: CSSProperties = {
  textAlign: 'left', padding: '10px 14px', fontWeight: 400,
  fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase',
  color: 'var(--ink-3)', borderBottom: '1px solid var(--hair)',
};
export const tdS: CSSProperties = { padding: '10px 14px', fontSize: 12.5, verticalAlign: 'middle' };
export const ghostBtn: CSSProperties = {
  background: 'none', border: 0, cursor: 'pointer', color: 'var(--ink-3)',
  padding: 4, borderRadius: 3, display: 'inline-flex',
};
