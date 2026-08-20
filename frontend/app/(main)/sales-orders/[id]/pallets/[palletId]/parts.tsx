'use client';
import React, { useEffect } from 'react';

/** Icons, styles and the two chrome components shared by the Boxes card (page.tsx)
 *  and the Checklist card (ChecklistCard.tsx). Extracted when the second card
 *  arrived so neither file has to own the other's presentation. */

// ── Icons ──────────────────────────────────────────────────────────────────────
export const IBack = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>;
export const IPlus = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>;
export const IEdit = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>;
export const ITrash = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6M9 6V4h6v2"/></svg>;
export const IClose = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>;
export const IPrint = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>;

// ── Shared styles ──────────────────────────────────────────────────────────────
export const BtnPrimary: React.CSSProperties = { height: 38, padding: '0 14px', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7, border: 'none', background: 'var(--accent)', color: '#fff', whiteSpace: 'nowrap', fontFamily: 'inherit' };
export const BtnGhost: React.CSSProperties = { ...BtnPrimary, background: 'var(--surface)', color: 'var(--ink-2)', border: '1px solid var(--hair-strong)' };
export const BtnDanger: React.CSSProperties = { ...BtnPrimary, background: '#b0432b' };
export const FieldLabel: React.CSSProperties = { fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 6 };
export const InputSty: React.CSSProperties = { width: '100%', height: 40, padding: '0 12px', border: '1px solid var(--hair-strong)', borderRadius: 9, background: 'var(--surface)', fontFamily: 'inherit', fontSize: 14, color: 'var(--ink)', outline: 'none', boxSizing: 'border-box' };
export const Th: React.CSSProperties = { textAlign: 'left', padding: '11px 18px', fontWeight: 600, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-3)', borderBottom: '1px solid var(--hair)', whiteSpace: 'nowrap' };
export const ThR: React.CSSProperties = { ...Th, textAlign: 'right' };
export const Td: React.CSSProperties = { padding: '12px 18px', borderBottom: '1px solid var(--surface-2)', verticalAlign: 'middle', fontSize: 14 };
export const TdR: React.CSSProperties = { ...Td, textAlign: 'right' };
export const CardSty: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--hair)', borderRadius: 12, overflow: 'hidden' };
export const ModalSty: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--hair-strong)', borderRadius: 14, boxShadow: '0 24px 60px rgba(20,30,20,0.3)', overflow: 'hidden' };
export const ErrorSty: React.CSSProperties = { padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#b91c1c', fontSize: 12.5, marginBottom: 14 };
export const OptionalSty: React.CSSProperties = { fontWeight: 500, letterSpacing: 0, textTransform: 'none', fontSize: 11, color: 'var(--ink-4)' };

export type ToastFn = (msg: string, type?: 'ok' | 'err') => void;

// ── Toast ───────────────────────────────────────────────────────────────────────
export function Toast({ msg, type, onDone }: { msg: string; type: 'ok' | 'err'; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 2800); return () => clearTimeout(t); }, [onDone]);
  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 400, padding: '10px 16px', borderRadius: 9, background: type === 'ok' ? 'var(--accent)' : '#991b1b', color: '#fff', fontSize: 13, boxShadow: '0 4px 24px rgba(0,0,0,0.2)', fontWeight: 500 }}>
      {msg}
    </div>
  );
}

// ── Overlay ─────────────────────────────────────────────────────────────────────
export function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,30,20,0.45)', zIndex: 200, overflowY: 'auto' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ margin: '80px auto 40px', width: 'calc(100% - 40px)', maxWidth: 460 }}>{children}</div>
    </div>
  );
}

// ── Modal header ────────────────────────────────────────────────────────────────
export function ModalHead({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--hair)' }}>
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{title}</h2>
      <button onClick={onClose} style={{ marginLeft: 'auto', width: 28, height: 28, borderRadius: 7, background: 'var(--surface-2)', border: '1px solid var(--hair)', color: 'var(--ink-3)', display: 'grid', placeItems: 'center', cursor: 'pointer' }}><IClose /></button>
    </div>
  );
}

// ── Modal footer ────────────────────────────────────────────────────────────────
export function ModalFoot({ onClose, onSubmit, saving, label, savingLabel }: {
  onClose: () => void; onSubmit: () => void; saving: boolean; label: string; savingLabel: string;
}) {
  return (
    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '14px 20px', borderTop: '1px solid var(--hair)', background: 'var(--surface-2)' }}>
      <button onClick={onClose} style={BtnGhost}>Cancel</button>
      <button onClick={onSubmit} disabled={saving} style={{ ...BtnPrimary, opacity: saving ? 0.6 : 1, cursor: saving ? 'not-allowed' : 'pointer' }}>
        {saving ? savingLabel : label}
      </button>
    </div>
  );
}

// ── Row action buttons (desktop tables) ─────────────────────────────────────────
export function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  const base: React.CSSProperties = { width: 30, height: 30, borderRadius: 7, background: 'var(--surface-2)', border: '1px solid var(--hair)', color: 'var(--ink-3)', display: 'grid', placeItems: 'center', cursor: 'pointer' };
  return (
    <div style={{ display: 'flex', gap: 5, justifyContent: 'flex-end' }}>
      <button title="Edit" onClick={onEdit} style={base}><IEdit /></button>
      <button title="Delete" onClick={onDelete} style={base}
        onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.color = '#b0432b'; el.style.background = '#fef2f2'; el.style.borderColor = '#fecaca'; }}
        onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.color = 'var(--ink-3)'; el.style.background = 'var(--surface-2)'; el.style.borderColor = 'var(--hair)'; }}><ITrash /></button>
    </div>
  );
}

// ── Delete confirmation ─────────────────────────────────────────────────────────
export function ConfirmDelete({ open, title, barcode, onClose, onConfirm }: {
  open: boolean; title: string; barcode: string; onClose: () => void; onConfirm: () => void;
}) {
  if (!open) return null;
  return (
    <Overlay onClose={onClose}>
      <div style={{ ...ModalSty, maxWidth: 400, margin: '0 auto' }}>
        <div style={{ padding: '24px 24px 12px', textAlign: 'center' }}>
          <div style={{ width: 46, height: 46, borderRadius: 12, background: '#fef2f2', border: '1px solid #fecaca', color: '#b0432b', display: 'grid', placeItems: 'center', margin: '0 auto 12px' }}><ITrash /></div>
          <h2 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 700 }}>{title}</h2>
          <p style={{ margin: 0, fontSize: 13.5, color: 'var(--ink-3)', lineHeight: 1.5 }}><b className="mono">{barcode}</b> will be permanently removed.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', padding: '12px 24px 20px' }}>
          <button onClick={onClose} style={BtnGhost}>Cancel</button>
          <button onClick={onConfirm} style={BtnDanger}><ITrash /> Delete</button>
        </div>
      </div>
    </Overlay>
  );
}
