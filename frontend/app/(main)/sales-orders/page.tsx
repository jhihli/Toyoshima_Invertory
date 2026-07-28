'use client';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/app/lib/api';
import { Pagination } from '@/app/ui/components';
import type { SO, Vendor } from '@/interface/IDatatable';
import { useIsMobile } from '@/app/ui/hooks/useIsMobile';
import { crumbCache } from '@/app/lib/crumbCache';

// ── Note popover ────────────────────────────────────────────────────────────────
const INoteIcon = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>;

function NoteCell({ note }: { note: string }) {
  const [open, setOpen] = useState(false);
  const SHORT = 36;
  const isLong = note.length > SHORT;
  const preview = isLong ? note.slice(0, SHORT).trimEnd() + '…' : note;
  return (
    <>
      <span onClick={e => { e.stopPropagation(); setOpen(true); }}
        style={{ fontSize: 12.5, color: 'var(--ink-3)', fontStyle: 'italic', cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 5, maxWidth: 200,
          overflow: 'hidden', whiteSpace: 'nowrap', float: 'right' }}>
        <span style={{ color: 'var(--ink-4)', flexShrink: 0 }}><INoteIcon /></span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{preview}</span>
      </span>
      {open && (
        <div onClick={() => setOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(15,22,15,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(2px)' }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: 'var(--surface)', border: '1px solid var(--hair-strong)', borderRadius: 14, maxWidth: 460, width: '90vw', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.22)' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '13px 18px', borderBottom: '1px solid var(--hair)', background: 'var(--surface-2)' }}>
              <span style={{ color: 'var(--accent)' }}><INoteIcon /></span>
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-2)' }}>Note</span>
              <button onClick={() => setOpen(false)}
                style={{ marginLeft: 'auto', width: 28, height: 28, borderRadius: 7, border: '1px solid var(--hair-strong)', background: 'var(--surface)', color: 'var(--ink-3)', cursor: 'pointer', display: 'grid', placeItems: 'center', fontSize: 15, lineHeight: 1, fontFamily: 'inherit' }}>×</button>
            </div>
            {/* Body */}
            <div style={{ padding: '18px 20px' }}>
              <p style={{ margin: 0, fontSize: 14, color: 'var(--ink)', lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word', textAlign: 'left' }}>{note}</p>
            </div>
            {/* Footer */}
            <div style={{ padding: '10px 20px 14px', display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setOpen(false)}
                style={{ height: 34, padding: '0 16px', borderRadius: 8, border: '1px solid var(--hair-strong)', background: 'var(--surface-2)', color: 'var(--ink-2)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Icons ──────────────────────────────────────────────────────────────────────
const IPlus = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>;
const ISearch = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>;
const IScan = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/></svg>;
const ICalendar = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
const IEdit = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>;
const ITrash = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6M9 6V4h6v2"/></svg>;
const IShip = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 16.2A4.5 4.5 0 0 1 17.5 17h-11a4.5 4.5 0 0 1-2.5-.8"/><path d="M2 17l2-8 4 2 4-10 4 10 4-2 2 8"/><path d="M2 21h20"/></svg>;
const IRevert = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.51"/></svg>;
const IChevR = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>;
const IBox = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>;

// ── Shared styles ──────────────────────────────────────────────────────────────
const BtnPrimary: React.CSSProperties = { height: 40, padding: '0 16px', borderRadius: 9, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, border: 'none', background: 'var(--accent)', color: '#fff', whiteSpace: 'nowrap', fontFamily: 'inherit' };
const BtnGhost: React.CSSProperties = { ...BtnPrimary, background: 'var(--surface)', color: 'var(--ink-2)', border: '1px solid var(--hair-strong)' };
const BtnDanger: React.CSSProperties = { ...BtnPrimary, background: '#b0432b' };
const Card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--hair)', borderRadius: 12, overflow: 'hidden' };
const FieldLabel: React.CSSProperties = { fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 };
const InputSty: React.CSSProperties = { width: '100%', height: 40, padding: '0 12px', border: '1px solid var(--hair-strong)', borderRadius: 9, background: 'var(--surface)', fontFamily: 'inherit', fontSize: 14, color: 'var(--ink)', outline: 'none', boxSizing: 'border-box' };
const Th: React.CSSProperties = { textAlign: 'left', padding: '9px 16px', fontWeight: 600, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-3)', borderBottom: '1px solid var(--hair)', whiteSpace: 'nowrap' };
const ThR: React.CSSProperties = { ...Th, textAlign: 'right' };
const Td: React.CSSProperties = { padding: '9px 16px', borderBottom: '1px solid var(--surface-2)', verticalAlign: 'middle', fontSize: 13.5 };

// ── Toast ───────────────────────────────────────────────────────────────────────
function Toast({ msg, type, onDone }: { msg: string; type: 'ok' | 'err'; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 2800); return () => clearTimeout(t); }, [onDone]);
  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 400, padding: '10px 16px', borderRadius: 9, background: type === 'ok' ? 'var(--accent)' : '#991b1b', color: '#fff', fontSize: 13, boxShadow: '0 4px 24px rgba(0,0,0,0.2)', fontWeight: 500 }}>
      {msg}
    </div>
  );
}

// ── Overlay ─────────────────────────────────────────────────────────────────────
function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(20,30,20,0.45)', zIndex: 200, overflowY: 'auto' }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ margin: '60px auto 40px', width: 'calc(100% - 40px)', maxWidth: 600 }}>{children}</div>
    </div>
  );
}

// ── ModalShell ──────────────────────────────────────────────────────────────────
function ModalShell({ title, width = 560, children, footer, onClose }: {
  title: React.ReactNode; width?: number; children: React.ReactNode;
  footer: React.ReactNode; onClose: () => void;
}) {
  return (
    <div style={{ width, maxWidth: '96vw', background: 'var(--surface)', border: '1px solid var(--hair-strong)', borderRadius: 14, boxShadow: '0 24px 60px rgba(20,30,20,0.3)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '17px 20px', borderBottom: '1px solid var(--hair)' }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{title}</h2>
        <button onClick={onClose} style={{ marginLeft: 'auto', width: 30, height: 30, borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--hair)', color: 'var(--ink-3)', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>×</button>
      </div>
      <div style={{ padding: 20 }}>{children}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-end', padding: '14px 20px', borderTop: '1px solid var(--hair)', background: 'var(--surface-2)' }}>
        {footer}
      </div>
    </div>
  );
}

// ── Confirm modal ───────────────────────────────────────────────────────────────
function ConfirmModal({ open, title, message, confirmLabel, tone = 'danger', onClose, onConfirm }: {
  open: boolean; title: string; message: React.ReactNode; confirmLabel?: string;
  tone?: 'danger' | 'neutral'; onClose: () => void; onConfirm: () => void;
}) {
  if (!open) return null;
  return (
    <Overlay onClose={onClose}>
      <div style={{ width: 420, maxWidth: '96vw', background: 'var(--surface)', border: '1px solid var(--hair-strong)', borderRadius: 14, boxShadow: '0 24px 60px rgba(20,30,20,0.3)', overflow: 'hidden' }}>
        <div style={{ padding: '24px 24px 12px', textAlign: 'center' }}>
          <div style={{ width: 50, height: 50, borderRadius: 14, background: tone === 'danger' ? '#fef2f2' : 'var(--accent-light)', border: `1px solid ${tone === 'danger' ? '#fecaca' : '#cfe2d6'}`, color: tone === 'danger' ? '#b0432b' : 'var(--accent)', display: 'grid', placeItems: 'center', margin: '0 auto 14px' }}>
            {tone === 'danger' ? <ITrash /> : <IRevert />}
          </div>
          <h2 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 700 }}>{title}</h2>
          <p style={{ margin: 0, fontSize: 13.5, color: 'var(--ink-3)', lineHeight: 1.5 }}>{message}</p>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', padding: '12px 24px 20px' }}>
          <button onClick={onClose} style={BtnGhost}>Cancel</button>
          <button onClick={onConfirm} style={tone === 'danger' ? BtnDanger : BtnPrimary}>
            {tone === 'danger' ? <ITrash /> : <IRevert />} {confirmLabel || 'Delete'}
          </button>
        </div>
      </div>
    </Overlay>
  );
}

// ── SO Modal ────────────────────────────────────────────────────────────────────
function SOModal({ open, mode, initial, vendors, onClose, onSubmit }: {
  open: boolean; mode: 'add' | 'edit'; initial?: Partial<SO>; vendors: Vendor[];
  onClose: () => void; onSubmit: (d: any) => Promise<void>;
}) {
  const [soNumber, setSoNumber] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [inboundDate, setInboundDate] = useState('');
  const [outboundDate, setOutboundDate] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setSoNumber(initial?.so_number || '');
    setVendorId(String(initial?.vendor || ''));
    setInboundDate(initial?.inbound_date || new Date().toISOString().slice(0, 10));
    setOutboundDate(initial?.outbound_date || '');
    setNote(initial?.note || '');
    setError('');
  }, [open, initial]);

  const handleSubmit = async () => {
    if (!soNumber.trim() || !vendorId) return;
    setSaving(true); setError('');
    try {
      await onSubmit({ so_number: soNumber.trim(), vendor: Number(vendorId), inbound_date: inboundDate, note });
      onClose();
    } catch (e: any) { setError(e.message || 'Failed to save'); }
    finally { setSaving(false); }
  };

  if (!open) return null;
  const valid = soNumber.trim() && vendorId;
  return (
    <Overlay onClose={onClose}>
      <ModalShell title={mode === 'edit' ? 'Edit Sales Order' : 'New Sales Order'} onClose={onClose}
        footer={<>
          <button onClick={onClose} style={BtnGhost}>Cancel</button>
          <button onClick={handleSubmit} disabled={!valid || saving} style={{ ...BtnPrimary, opacity: !valid || saving ? 0.6 : 1, cursor: !valid || saving ? 'not-allowed' : 'pointer' }}>
            {saving ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Create SO'}
          </button>
        </>}>
        {error && <div style={{ padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#b91c1c', fontSize: 12.5, marginBottom: 14 }}>{error}</div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 12 }}>
          <div><div style={FieldLabel}>SO Number</div><input className="mono" value={soNumber} onChange={e => setSoNumber(e.target.value)} placeholder="e.g. SO162655" autoFocus style={InputSty} /></div>
          <div><div style={FieldLabel}>Vendor</div>
            <select value={vendorId} onChange={e => setVendorId(e.target.value)} style={InputSty}>
              <option value="">Select vendor…</option>
              {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <div style={FieldLabel}>Inbound Date</div>
          <input type="date" value={inboundDate} onChange={e => setInboundDate(e.target.value)} style={InputSty} />
        </div>
        <div>
          <div style={FieldLabel}>Note <span style={{ fontWeight: 500, letterSpacing: 0, textTransform: 'none', fontSize: 11, color: 'var(--ink-4)' }}>optional</span></div>
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="Internal note…" style={InputSty} />
        </div>
      </ModalShell>
    </Overlay>
  );
}

// ── Ship Out modal ──────────────────────────────────────────────────────────────
function ShipModal({ open, order, onClose, onConfirm }: {
  open: boolean; order: SO | null; onClose: () => void;
  onConfirm: (date: string) => Promise<void>;
}) {
  const [date, setDate] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) setDate(order?.outbound_date || new Date().toISOString().slice(0, 10)); }, [open, order]);

  const handle = async () => {
    if (!date) return;
    setSaving(true); await onConfirm(date); setSaving(false);
  };

  if (!open || !order) return null;
  return (
    <Overlay onClose={onClose}>
      <ModalShell title={<>Mark <span className="mono" style={{ fontSize: 15, color: 'var(--accent-2)' }}>{order.so_number}</span> as 出庫?</>}
        width={460} onClose={onClose}
        footer={<>
          <button onClick={onClose} style={BtnGhost}>Cancel</button>
          <button onClick={handle} disabled={!date || saving} style={{ ...BtnPrimary, opacity: !date || saving ? 0.6 : 1 }}>
            <IShip /> {saving ? 'Confirming…' : 'Confirm 出庫'}
          </button>
        </>}>
        <div style={{ marginBottom: 12 }}>
          <div style={FieldLabel}>Outbound Date</div>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={InputSty} autoFocus />
        </div>
        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-4)', lineHeight: 1.5 }}>
          This moves the order into the 出庫 (Outbound) tab. You can revert it later.
        </p>
      </ModalShell>
    </Overlay>
  );
}

// ── Cargo barcode search ─────────────────────────────────────────────────────────
function CargoSearch({ isMobile }: { isMobile: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [searching, setSearching] = useState(false);
  const [msg, setMsg] = useState<{ text: string; fading: boolean } | null>(null);
  const timers = React.useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);

  // Not-found message: hold ~2.6s, fade over 0.4s, remove at 3s.
  const flash = (text: string) => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setMsg({ text, fading: false });
    timers.current.push(setTimeout(() => setMsg(m => (m ? { ...m, fading: true } : null)), 2600));
    timers.current.push(setTimeout(() => setMsg(null), 3000));
  };

  const handleSearch = async () => {
    const term = q.trim();
    if (!term || searching) return;
    setQ('');  // clear so the next scan starts clean (scanners type into the focused field)
    setSearching(true);
    try {
      const res = await api.cargos.search(term);
      if (res.length > 0) {
        const r = res[0];
        router.push(`/sales-orders/${r.so_id}/pallets/${r.pallet_id}?highlight=${encodeURIComponent(r.barcode)}`);
      } else {
        flash(`Cargo barcode “${term}” not found`);
      }
    } catch {
      flash('Search failed — please try again');
    } finally {
      setSearching(false);
    }
  };

  return (
    <form onSubmit={e => { e.preventDefault(); handleSearch(); }}
      style={{ position: 'relative', ...(isMobile ? { width: '100%' } : { flex: 1, minWidth: 200, maxWidth: 320 }) }}>
      <div style={{ height: 42, background: 'var(--surface)', border: '1px solid var(--hair-strong)', borderRadius: 9, display: 'flex', alignItems: 'center', gap: 10, padding: '0 13px', color: 'var(--ink-4)' }}>
        <IScan />
        <input value={q} onChange={e => setQ(e.target.value)} enterKeyHint="search"
          placeholder="Scan or enter cargo barcode…"
          style={{ border: 0, background: 'transparent', outline: 'none', flex: 1, fontFamily: 'inherit', fontSize: 13.5, color: 'var(--ink)', minWidth: 0 }} />
        {q && <button type="button" onClick={() => setQ('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-4)', display: 'flex', padding: 0, fontSize: 16, lineHeight: 1 }}>×</button>}
      </div>
      {msg && (
        <div style={{ position: 'absolute', top: 46, left: 0, right: 0, zIndex: 60, background: '#991b1b', color: '#fff', fontSize: 12.5, fontWeight: 500, padding: '9px 13px', borderRadius: 9, boxShadow: '0 8px 24px rgba(0,0,0,0.18)', opacity: msg.fading ? 0 : 1, transition: 'opacity 0.4s ease', pointerEvents: 'none' }}>
          {msg.text}
        </div>
      )}
    </form>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────────
export default function SalesOrdersPage() {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [orders, setOrders] = useState<SO[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'all' | 'inbound' | 'outbound'>('inbound');
  const [q, setQ] = useState('');
  const [vendorFilter, setVendorFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  const [soModal, setSoModal] = useState<{ mode: 'add' | 'edit'; item?: SO } | null>(null);
  const [shipModal, setShipModal] = useState<SO | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'delete' | 'revert'; item: SO } | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);

  const showToast = (msg: string, type: 'ok' | 'err' = 'ok') => setToast({ msg, type });

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [soRes, vendorData] = await Promise.all([
        api.sos.list({ page_size: 500 }),
        api.vendors.list(),
      ]);
      const rows = soRes.results || [];
      rows.forEach(o => crumbCache.setSo(o.id, o.so_number));  // warm breadcrumb before any row click
      setOrders(rows);
      setVendors(vendorData);
    } catch { showToast('Failed to load', 'err'); }
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const inboundCount = orders.filter(o => !o.outbound_date).length;
  const outboundCount = orders.filter(o => !!o.outbound_date).length;
  const allCount = orders.length;

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return orders.filter(o => {
      if (tab === 'inbound' && o.outbound_date) return false;
      if (tab === 'outbound' && !o.outbound_date) return false;
      if (n && !o.so_number.toLowerCase().includes(n)) return false;
      if (vendorFilter && String(o.vendor) !== vendorFilter) return false;
      if (dateFrom && o.inbound_date < dateFrom) return false;
      if (dateTo && o.inbound_date > dateTo) return false;
      return true;
    });
  }, [orders, tab, q, vendorFilter, dateFrom, dateTo]);

  // MSFT SOs use the board workflow (/sos/[id]); everyone else uses the cargo/pallet
  // workflow (/sales-orders/[id]). Vendor detection mirrors the MSFT Order page (/sos).
  const isMsft = (vendorName?: string) => (vendorName || '').toUpperCase().includes('MSFT');
  const soDetailHref = (o: SO) => (isMsft(o.vendor_name) ? `/sos/${o.id}` : `/sales-orders/${o.id}`);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleCreate = async (d: any) => { await api.sos.create(d); await reload(); showToast('Sales order created'); setPage(1); };
  const handleEdit = async (d: any) => { if (!soModal?.item) return; await api.sos.update(soModal.item.id, d); await reload(); showToast('Saved'); };
  const handleDelete = async () => { if (!confirm?.item) return; await api.sos.delete(confirm.item.id); await reload(); setConfirm(null); showToast('Deleted', 'err'); };
  const handleShipOut = async (date: string) => { if (!shipModal) return; await api.sos.update(shipModal.id, { outbound_date: date } as any); await reload(); setShipModal(null); showToast('Marked as 出庫'); };
  const handleRevert = async () => { if (!confirm?.item) return; await api.sos.update(confirm.item.id, { outbound_date: null } as any); await reload(); setConfirm(null); showToast('Reverted to 入庫'); };

  const hasFilter = q || vendorFilter || dateFrom || dateTo;

  return (
    <div style={{ padding: isMobile ? '12px 12px 40px' : '22px 28px 40px' }}>

      {/* Filter bar */}
      {isMobile ? (
        /* Mobile: stacked layout */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {/* Row 1: Tab toggle */}
          <div style={{ display: 'flex', background: 'var(--surface)', border: '1px solid var(--hair-strong)', borderRadius: 9, overflow: 'hidden', height: 42 }}>
            {(['all', 'inbound', 'outbound'] as const).map((v, i) => (
              <button key={v} onClick={() => { setTab(v); setPage(1); }}
                style={{ flex: 1, height: '100%', border: 'none', borderLeft: i > 0 ? '1px solid var(--hair-strong)' : 'none', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer', background: tab === v ? 'var(--accent)' : 'transparent', color: tab === v ? '#fff' : 'var(--ink-3)' }}>
                {v === 'all' ? 'All' : v === 'inbound' ? '入庫' : '出庫'}
              </button>
            ))}
          </div>
          {/* Row 2: Search */}
          <div style={{ height: 42, background: 'var(--surface)', border: '1px solid var(--hair-strong)', borderRadius: 9, display: 'flex', alignItems: 'center', gap: 10, padding: '0 13px', color: 'var(--ink-4)' }}>
            <ISearch />
            <input value={q} onChange={e => { setQ(e.target.value); setPage(1); }} placeholder="Filter by SO number…"
              style={{ border: 0, background: 'transparent', outline: 'none', flex: 1, fontFamily: 'inherit', fontSize: 13.5, color: 'var(--ink)' }} />
          </div>
          {/* Row 2b: Cargo barcode search */}
          <CargoSearch isMobile={true} />
          {/* Row 3: Vendor + New SO */}
          <div style={{ display: 'flex', gap: 8 }}>
            <select value={vendorFilter} onChange={e => { setVendorFilter(e.target.value); setPage(1); }}
              style={{ flex: 1, height: 42, padding: '0 12px', background: 'var(--surface)', border: '1px solid var(--hair-strong)', borderRadius: 9, color: 'var(--ink-2)', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 500, cursor: 'pointer' }}>
              <option value="">All vendors</option>
              {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
            <button style={BtnPrimary} onClick={() => setSoModal({ mode: 'add' })}><IPlus /> New SO</button>
          </div>
          {/* Row 4: Date range */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 42, padding: '0 12px', background: 'var(--surface)', border: '1px solid var(--hair-strong)', borderRadius: 9, color: 'var(--ink-4)' }}>
            <ICalendar />
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ border: 0, background: 'transparent', outline: 'none', fontFamily: 'inherit', fontSize: 13, color: 'var(--ink-2)', flex: 1, minWidth: 0 }} />
            <span style={{ color: 'var(--ink-5)', fontSize: 12, flexShrink: 0 }}>→</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ border: 0, background: 'transparent', outline: 'none', fontFamily: 'inherit', fontSize: 13, color: 'var(--ink-2)', flex: 1, minWidth: 0 }} />
          </div>
          {hasFilter && <button onClick={() => { setQ(''); setVendorFilter(''); setDateFrom(''); setDateTo(''); setPage(1); }} style={{ ...BtnGhost, width: '100%', justifyContent: 'center' }}>Clear filters</button>}
        </div>
      ) : (
        /* Desktop: existing single-row layout */
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* All / Inbound / Outbound toggle pills */}
          <div style={{ display: 'flex', background: 'var(--surface)', border: '1px solid var(--hair-strong)', borderRadius: 9, overflow: 'hidden', height: 42, flexShrink: 0 }}>
            {(['all', 'inbound', 'outbound'] as const).map((v, i) => (
              <button key={v} onClick={() => { setTab(v); setPage(1); }}
                style={{ height: '100%', padding: '0 16px', border: 'none', borderLeft: i > 0 ? '1px solid var(--hair-strong)' : 'none', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer', background: tab === v ? 'var(--accent)' : 'transparent', color: tab === v ? '#fff' : 'var(--ink-3)', whiteSpace: 'nowrap' }}>
                {v === 'all' ? 'All' : v === 'inbound' ? '入庫 Inbound' : '出庫 Outbound'}
              </button>
            ))}
          </div>
          <div style={{ flex: 1, minWidth: 200, maxWidth: 340, height: 42, background: 'var(--surface)', border: '1px solid var(--hair-strong)', borderRadius: 9, display: 'flex', alignItems: 'center', gap: 10, padding: '0 13px', color: 'var(--ink-4)' }}>
            <ISearch />
            <input value={q} onChange={e => { setQ(e.target.value); setPage(1); }} placeholder="Filter by SO number…"
              style={{ border: 0, background: 'transparent', outline: 'none', flex: 1, fontFamily: 'inherit', fontSize: 13.5, color: 'var(--ink)' }} />
          </div>
          <CargoSearch isMobile={false} />
          <select value={vendorFilter} onChange={e => { setVendorFilter(e.target.value); setPage(1); }}
            style={{ height: 42, padding: '0 12px', background: 'var(--surface)', border: '1px solid var(--hair-strong)', borderRadius: 9, color: 'var(--ink-2)', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 500, cursor: 'pointer' }}>
            <option value="">All vendors</option>
            {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 42, padding: '0 12px', background: 'var(--surface)', border: '1px solid var(--hair-strong)', borderRadius: 9, color: 'var(--ink-4)' }}>
            <ICalendar />
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ border: 0, background: 'transparent', outline: 'none', fontFamily: 'inherit', fontSize: 13, color: 'var(--ink-2)' }} />
            <span style={{ color: 'var(--ink-5)', fontSize: 12 }}>→</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ border: 0, background: 'transparent', outline: 'none', fontFamily: 'inherit', fontSize: 13, color: 'var(--ink-2)' }} />
          </div>
          {hasFilter && <button onClick={() => { setQ(''); setVendorFilter(''); setDateFrom(''); setDateTo(''); setPage(1); }} style={BtnGhost}>Clear</button>}
          <div style={{ marginLeft: 'auto' }}>
            <button style={BtnPrimary} onClick={() => setSoModal({ mode: 'add' })}><IPlus /> New SO</button>
          </div>
        </div>
      )}

      {/* Table or Mobile Cards */}
      <div style={Card}>
        {isMobile ? (
          <div>
            {loading && <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--ink-4)', fontSize: 13 }}>Loading…</div>}
            {!loading && pageRows.length === 0 && (
              <div style={{ padding: '52px 20px', textAlign: 'center' }}>
                <div style={{ width: 56, height: 56, borderRadius: 15, background: 'var(--surface-2)', border: '1px solid var(--hair)', display: 'grid', placeItems: 'center', color: 'var(--ink-4)', margin: '0 auto 14px' }}><IBox /></div>
                <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700 }}>No orders found</h3>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)' }}>{hasFilter ? 'Nothing matches your filter.' : 'Create a sales order to get started.'}</p>
              </div>
            )}
            {pageRows.map(o => {
              const totWt = Number(o.total_pallet_weight || 0);
              return (
                <div key={o.id} onClick={() => router.push(soDetailHref(o))}
                  style={{ padding: '14px 16px', borderBottom: '1px solid var(--hair)', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                    <span className="mono" title={o.so_number} style={{ fontWeight: 700, fontSize: 15, flex: 1, minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{o.so_number}</span>
                    <span style={{ fontSize: 12, color: 'var(--ink-4)', whiteSpace: 'nowrap', flexShrink: 0 }}>{o.inbound_date}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>{o.vendor_name}</span>
                    <span style={{ fontSize: 12, color: 'var(--ink-4)' }}>·</span>
                    <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{o.pallet_record_count ?? 0} pallets</span>
                    {totWt > 0 && <><span style={{ fontSize: 12, color: 'var(--ink-4)' }}>·</span><span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{totWt.toFixed(2)} kg</span></>}
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                    {o.outbound_date
                      ? <button onClick={() => setConfirm({ kind: 'revert', item: o })}
                          style={{ height: 40, padding: '0 12px', borderRadius: 8, background: 'var(--surface-2)', color: 'var(--ink-2)', border: '1px solid var(--hair-strong)', fontSize: 12.5, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontFamily: 'inherit' }}>
                          <IRevert /> Revert
                        </button>
                      : <button onClick={() => setShipModal(o)}
                          style={{ height: 40, padding: '0 12px', borderRadius: 8, background: 'var(--accent-light)', color: 'var(--accent-2)', border: '1px solid #cfe2d6', fontSize: 12.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontFamily: 'inherit' }}>
                          <IShip /> 出庫
                        </button>
                    }
                    <button onClick={() => setSoModal({ mode: 'edit', item: o })}
                      style={{ width: 40, height: 40, borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--hair)', color: 'var(--ink-3)', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
                      <IEdit />
                    </button>
                    <button onClick={() => setConfirm({ kind: 'delete', item: o })}
                      style={{ width: 40, height: 40, borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--hair)', color: 'var(--ink-3)', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
                      <ITrash />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: tab !== 'inbound' ? 900 : 800 }}>
              <colgroup>
                <col style={{ width: tab !== 'inbound' ? '12%' : '13%' }} /> {/* SO Number */}
                <col style={{ width: tab !== 'inbound' ? '12%' : '15%' }} /> {/* Vendor */}
                <col style={{ width: tab !== 'inbound' ? '12%' : '14%' }} /> {/* Inbound Date */}
                {tab !== 'inbound' && <col style={{ width: '12%' }} />}      {/* Outbound Date */}
                <col style={{ width: tab !== 'inbound' ? '9%' : '10%' }} />  {/* Pallets */}
                <col style={{ width: tab !== 'inbound' ? '12%' : '15%' }} /> {/* Total WT Gross */}
                <col style={{ width: tab !== 'inbound' ? '15%' : '17%' }} /> {/* Note */}
                <col style={{ width: tab !== 'inbound' ? '16%' : '16%' }} /> {/* Actions */}
              </colgroup>
              <thead>
                <tr>
                  <th style={Th}>SO Number</th>
                  <th style={Th}>Vendor</th>
                  <th style={Th}>Inbound Date</th>
                  {tab !== 'inbound' && <th style={Th}>Outbound Date</th>}
                  <th style={ThR}>Pallets</th>
                  <th style={ThR}>Total WT Gross</th>
                  <th style={ThR}>Note</th>
                  <th style={ThR}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={tab !== 'inbound' ? 8 : 7} style={{ ...Td, textAlign: 'center', color: 'var(--ink-4)' }}>Loading…</td></tr>
                )}
                {!loading && pageRows.length === 0 && (
                  <tr><td colSpan={tab !== 'inbound' ? 8 : 7}>
                    <div style={{ padding: '52px 20px', textAlign: 'center' }}>
                      <div style={{ width: 56, height: 56, borderRadius: 15, background: 'var(--surface-2)', border: '1px solid var(--hair)', display: 'grid', placeItems: 'center', color: 'var(--ink-4)', margin: '0 auto 14px' }}><IBox /></div>
                      <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700 }}>No orders found</h3>
                      <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)' }}>{hasFilter ? 'Nothing matches your filter.' : 'Create a sales order to get started.'}</p>
                    </div>
                  </td></tr>
                )}
                {pageRows.map(o => {
                  const totWt = Number(o.total_pallet_weight || 0);
                  return (
                    <tr key={o.id}
                      style={{ cursor: 'pointer' }}
                      onClick={() => router.push(soDetailHref(o))}
                      onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = '#eef5f0'}
                      onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'}>
                      <td style={Td} title={o.so_number}><span className="mono" style={{ fontWeight: 600, display: 'block', maxWidth: '100%', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{o.so_number}</span></td>
                      <td style={{ ...Td, color: 'var(--ink-2)' }}>{o.vendor_name}</td>
                      <td style={{ ...Td, color: 'var(--ink-3)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{o.inbound_date}</td>
                      {tab !== 'inbound' && (
                        <td style={{ ...Td, fontVariantNumeric: 'tabular-nums', color: 'var(--accent-2)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                          {o.outbound_date || <span style={{ color: 'var(--ink-5)' }}>—</span>}
                        </td>
                      )}
                      <td style={{ ...Td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{o.pallet_record_count ?? 0}</td>
                      <td style={{ ...Td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {totWt ? totWt.toFixed(2) : <span style={{ color: 'var(--ink-5)' }}>—</span>}
                      </td>
                      <td style={{ ...Td, textAlign: 'right', maxWidth: 220 }} onClick={e => e.stopPropagation()}>
                        {o.note ? <NoteCell note={o.note} /> : <span style={{ color: 'var(--ink-5)' }}>—</span>}
                      </td>
                      <td style={{ ...Td, textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                          {o.outbound_date
                            ? <button title="Revert to 入庫" onClick={() => setConfirm({ kind: 'revert', item: o })}
                                style={{ height: 32, padding: '0 11px', borderRadius: 8, background: 'var(--surface-2)', color: 'var(--ink-2)', border: '1px solid var(--hair-strong)', fontSize: 12.5, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontFamily: 'inherit' }}>
                                <IRevert /> Revert
                              </button>
                            : <button title="Ship out" onClick={() => setShipModal(o)}
                                style={{ height: 32, padding: '0 11px', borderRadius: 8, background: 'var(--accent-light)', color: 'var(--accent-2)', border: '1px solid #cfe2d6', fontSize: 12.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontFamily: 'inherit' }}>
                                <IShip /> 出庫
                              </button>
                          }
                          <button title="Edit" onClick={() => setSoModal({ mode: 'edit', item: o })}
                            style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--hair)', color: 'var(--ink-3)', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
                            <IEdit />
                          </button>
                          <button title="Delete" onClick={() => setConfirm({ kind: 'delete', item: o })}
                            style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--hair)', color: 'var(--ink-3)', display: 'grid', placeItems: 'center', cursor: 'pointer' }}
                            onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.color = '#b0432b'; el.style.background = '#fef2f2'; el.style.borderColor = '#fecaca'; }}
                            onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.color = 'var(--ink-3)'; el.style.background = 'var(--surface-2)'; el.style.borderColor = 'var(--hair)'; }}>
                            <ITrash />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {filtered.length > 0 && (
          <Pagination page={page} pageCount={pageCount} onChange={setPage} total={filtered.length} pageSize={PAGE_SIZE} />
        )}
      </div>

      {/* Modals */}
      <SOModal open={!!soModal} mode={soModal?.mode || 'add'} initial={soModal?.item} vendors={vendors}
        onClose={() => setSoModal(null)} onSubmit={soModal?.mode === 'edit' ? handleEdit : handleCreate} />
      <ShipModal open={!!shipModal} order={shipModal} onClose={() => setShipModal(null)} onConfirm={handleShipOut} />
      <ConfirmModal open={!!confirm}
        tone={confirm?.kind === 'revert' ? 'neutral' : 'danger'}
        title={confirm?.kind === 'delete' ? 'Delete sales order?' : 'Move back to 入庫?'}
        message={confirm?.kind === 'delete'
          ? <><b>{confirm.item.so_number}</b> and all its pallets will be permanently removed.</>
          : <><b>{confirm?.item.so_number}</b> will return to the 入庫 list and its outbound date will be cleared.</>}
        confirmLabel={confirm?.kind === 'revert' ? 'Revert to 入庫' : 'Delete'}
        onClose={() => setConfirm(null)}
        onConfirm={confirm?.kind === 'delete' ? handleDelete : handleRevert} />
      {toast && <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  );
}
