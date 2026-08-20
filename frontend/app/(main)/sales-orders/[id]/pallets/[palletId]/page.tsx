'use client';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/app/lib/api';
import type { Pallet, Box } from '@/interface/IDatatable';
import { useIsMobile } from '@/app/ui/hooks/useIsMobile';
import { crumbCache } from '@/app/lib/crumbCache';
import { printLabels } from '@/app/lib/printLabels';

// ── Icons ──────────────────────────────────────────────────────────────────────
const IBack = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>;
const IPlus = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>;
const IEdit = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>;
const ITrash = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6M9 6V4h6v2"/></svg>;
const IClose = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>;
const IPrint = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>;

// ── Shared styles ──────────────────────────────────────────────────────────────
const BtnPrimary: React.CSSProperties = { height: 38, padding: '0 14px', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7, border: 'none', background: 'var(--accent)', color: '#fff', whiteSpace: 'nowrap', fontFamily: 'inherit' };
const BtnGhost: React.CSSProperties = { ...BtnPrimary, background: 'var(--surface)', color: 'var(--ink-2)', border: '1px solid var(--hair-strong)' };
const BtnDanger: React.CSSProperties = { ...BtnPrimary, background: '#b0432b' };
const FieldLabel: React.CSSProperties = { fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 6 };
const InputSty: React.CSSProperties = { width: '100%', height: 40, padding: '0 12px', border: '1px solid var(--hair-strong)', borderRadius: 9, background: 'var(--surface)', fontFamily: 'inherit', fontSize: 14, color: 'var(--ink)', outline: 'none', boxSizing: 'border-box' };
const Th: React.CSSProperties = { textAlign: 'left', padding: '11px 18px', fontWeight: 600, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-3)', borderBottom: '1px solid var(--hair)', whiteSpace: 'nowrap' };
const ThR: React.CSSProperties = { ...Th, textAlign: 'right' };
const Td: React.CSSProperties = { padding: '12px 18px', borderBottom: '1px solid var(--surface-2)', verticalAlign: 'middle', fontSize: 14 };
const TdR: React.CSSProperties = { ...Td, textAlign: 'right' };

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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,30,20,0.45)', zIndex: 200, overflowY: 'auto' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ margin: '80px auto 40px', width: 'calc(100% - 40px)', maxWidth: 460 }}>{children}</div>
    </div>
  );
}

// ── Add Box modal ─────────────────────────────────────────────────────────────
function AddBoxModal({ open, nextSeq, composeBarcode, onClose, onSubmit }: {
  open: boolean; nextSeq: number; composeBarcode: (seq: number) => string;
  onClose: () => void; onSubmit: (d: { count: number; note: string }) => Promise<void>;
}) {
  const [count, setCount] = useState('1');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { if (open) { setCount('1'); setNote(''); setError(''); } }, [open]);

  const n = Math.max(1, Math.min(parseInt(count) || 1, 500));
  const preview = n === 1
    ? composeBarcode(nextSeq)
    : `${composeBarcode(nextSeq)}  …  ${composeBarcode(nextSeq + n - 1)}`;

  const handleSubmit = async () => {
    setSaving(true); setError('');
    try {
      await onSubmit({ count: n, note: note.trim() });
      onClose();
    } catch (e: any) { setError(e.message || 'Failed to save'); }
    finally { setSaving(false); }
  };

  if (!open) return null;
  return (
    <Overlay onClose={onClose}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--hair-strong)', borderRadius: 14, boxShadow: '0 24px 60px rgba(20,30,20,0.3)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--hair)' }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Add Box</h2>
          <button onClick={onClose} style={{ marginLeft: 'auto', width: 28, height: 28, borderRadius: 7, background: 'var(--surface-2)', border: '1px solid var(--hair)', color: 'var(--ink-3)', display: 'grid', placeItems: 'center', cursor: 'pointer' }}><IClose /></button>
        </div>
        <div style={{ padding: '18px 20px' }}>
          {error && <div style={{ padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#b91c1c', fontSize: 12.5, marginBottom: 14 }}>{error}</div>}
          <div style={{ marginBottom: 14 }}>
            <div style={FieldLabel}>How many</div>
            <input type="number" min="1" max="500" value={count} onChange={e => setCount(e.target.value)} autoFocus style={InputSty} />
            <div style={{ marginTop: 5, fontSize: 11.5, color: 'var(--ink-4)' }}>Continues from the last barcode — next up is <b className="mono" style={{ color: 'var(--ink-3)' }}>C{nextSeq}</b>.</div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <div style={FieldLabel}>Note <span style={{ fontWeight: 500, letterSpacing: 0, textTransform: 'none', fontSize: 11, color: 'var(--ink-4)' }}>optional</span></div>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="Applied to all created items…" style={InputSty} />
          </div>
          {/* Barcode preview */}
          <div>
            <div style={FieldLabel}>Barcode{n > 1 ? 's' : ''} preview</div>
            <div className="mono" style={{ padding: '10px 12px', borderRadius: 9, background: 'var(--surface-2)', border: '1px solid var(--hair)', fontSize: 12.5, color: 'var(--accent-2)', fontWeight: 600, wordBreak: 'break-all', lineHeight: 1.5 }}>
              {preview}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '14px 20px', borderTop: '1px solid var(--hair)', background: 'var(--surface-2)' }}>
          <button onClick={onClose} style={BtnGhost}>Cancel</button>
          <button onClick={handleSubmit} disabled={saving} style={{ ...BtnPrimary, opacity: saving ? 0.6 : 1, cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saving ? 'Adding…' : `Add ${n} box${n > 1 ? 'es' : ''}`}
          </button>
        </div>
      </div>
    </Overlay>
  );
}

// ── Edit Box modal ────────────────────────────────────────────────────────────
function EditBoxModal({ box, onClose, onSubmit }: {
  box: Box | null; onClose: () => void; onSubmit: (d: { note: string }) => Promise<void>;
}) {
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { if (box) { setNote(box.note || ''); setError(''); } }, [box]);

  const handleSubmit = async () => {
    setSaving(true); setError('');
    try {
      await onSubmit({ note: note.trim() });
      onClose();
    } catch (e: any) { setError(e.message || 'Failed to save'); }
    finally { setSaving(false); }
  };

  if (!box) return null;
  return (
    <Overlay onClose={onClose}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--hair-strong)', borderRadius: 14, boxShadow: '0 24px 60px rgba(20,30,20,0.3)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--hair)' }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Edit Box</h2>
          <button onClick={onClose} style={{ marginLeft: 'auto', width: 28, height: 28, borderRadius: 7, background: 'var(--surface-2)', border: '1px solid var(--hair)', color: 'var(--ink-3)', display: 'grid', placeItems: 'center', cursor: 'pointer' }}><IClose /></button>
        </div>
        <div style={{ padding: '18px 20px' }}>
          {error && <div style={{ padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#b91c1c', fontSize: 12.5, marginBottom: 14 }}>{error}</div>}
          <div style={{ marginBottom: 14 }}>
            <div style={FieldLabel}>Barcode</div>
            <div className="mono" style={{ padding: '10px 12px', borderRadius: 9, background: 'var(--surface-2)', border: '1px solid var(--hair)', fontSize: 12.5, color: 'var(--ink-3)', fontWeight: 600, wordBreak: 'break-all' }}>{box.barcode}</div>
          </div>
          <div>
            <div style={FieldLabel}>Note <span style={{ fontWeight: 500, letterSpacing: 0, textTransform: 'none', fontSize: 11, color: 'var(--ink-4)' }}>optional</span></div>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="Internal note…" autoFocus style={InputSty} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '14px 20px', borderTop: '1px solid var(--hair)', background: 'var(--surface-2)' }}>
          <button onClick={onClose} style={BtnGhost}>Cancel</button>
          <button onClick={handleSubmit} disabled={saving} style={{ ...BtnPrimary, opacity: saving ? 0.6 : 1, cursor: saving ? 'not-allowed' : 'pointer' }}>{saving ? 'Saving…' : 'Save changes'}</button>
        </div>
      </div>
    </Overlay>
  );
}

// ── Confirm modal ───────────────────────────────────────────────────────────────
function ConfirmModal({ target, onClose, onConfirm }: {
  target: Box | null; onClose: () => void; onConfirm: () => void;
}) {
  if (!target) return null;
  return (
    <Overlay onClose={onClose}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--hair-strong)', borderRadius: 14, boxShadow: '0 24px 60px rgba(20,30,20,0.3)', overflow: 'hidden', maxWidth: 400, margin: '0 auto' }}>
        <div style={{ padding: '24px 24px 12px', textAlign: 'center' }}>
          <div style={{ width: 46, height: 46, borderRadius: 12, background: '#fef2f2', border: '1px solid #fecaca', color: '#b0432b', display: 'grid', placeItems: 'center', margin: '0 auto 12px' }}><ITrash /></div>
          <h2 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 700 }}>Delete box?</h2>
          <p style={{ margin: 0, fontSize: 13.5, color: 'var(--ink-3)', lineHeight: 1.5 }}>Box <b className="mono">{target.barcode}</b> will be permanently removed.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', padding: '12px 24px 20px' }}>
          <button onClick={onClose} style={BtnGhost}>Cancel</button>
          <button onClick={onConfirm} style={BtnDanger}><ITrash /> Delete</button>
        </div>
      </div>
    </Overlay>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────────
export default function BoxPage() {
  const { id, palletId } = useParams<{ id: string; palletId: string }>();
  const soId = Number(id);
  const pId = Number(palletId);
  const router = useRouter();
  const isMobile = useIsMobile();
  // box barcode to highlight (from the box search's ?highlight= param); read client-side to
  // avoid needing a Suspense boundary around useSearchParams.
  const [highlight, setHighlight] = useState<string | null>(null);
  useEffect(() => { setHighlight(new URLSearchParams(window.location.search).get('highlight')); }, []);
  const scrolledRef = React.useRef(false);
  const attachHighlight = (el: HTMLElement | null) => {
    if (el && !scrolledRef.current) { scrolledRef.current = true; el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  };

  const [pallet, setPallet] = useState<Pallet | null>(null);
  const [soNumber, setSoNumber] = useState('');
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [editTarget, setEditTarget] = useState<Box | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Box | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);
  const showToast = (msg: string, type: 'ok' | 'err' = 'ok') => setToast({ msg, type });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [soData, boxData] = await Promise.all([
        api.sos.get(soId),
        api.pallets.boxes.list(pId),
      ]);
      setSoNumber(soData.so_number);
      const thisPallet = soData.pallets?.find((p: Pallet) => p.id === pId) || null;
      crumbCache.setSo(soData.id, soData.so_number);
      if (thisPallet) crumbCache.setPallet(thisPallet.id, thisPallet.licence_number || `Pallet #${thisPallet.pallet_seq}`);
      setPallet(thisPallet);
      setBoxes(boxData || []);
      setSelected(new Set());
    } catch { showToast('Failed to load', 'err'); }
    setLoading(false);
  }, [soId, pId]);

  useEffect(() => { load(); }, [load]);

  // Next C-number: max trailing -C{n} across existing box barcodes, + 1 (matches the backend).
  const nextSeq = useMemo(() => {
    let mx = 0;
    for (const c of boxes) {
      const m = /-C(\d+)$/.exec(c.barcode || '');
      if (m) mx = Math.max(mx, parseInt(m[1]));
    }
    return mx + 1;
  }, [boxes]);

  const composeBarcode = useCallback((seq: number) => {
    const segs = [soNumber];
    if (pallet?.licence_number) segs.push(pallet.licence_number);
    if (pallet?.gateload_number) segs.push(pallet.gateload_number);
    segs.push(`C${seq}`);
    return segs.join('-');
  }, [soNumber, pallet]);

  const handleAdd = async (d: { count: number; note: string }) => {
    const created = await api.pallets.boxes.create(pId, d);
    const n = created?.length ?? d.count;
    await load();
    showToast(`Added ${n} box${n > 1 ? 'es' : ''}`);
  };
  const handleEdit = async (d: { note: string }) => {
    if (!editTarget) return;
    await api.pallets.boxes.update(pId, editTarget.id, d);
    await load(); showToast('Box saved');
  };
  const handleDelete = async () => {
    if (!deleteTarget) return;
    await api.pallets.boxes.delete(pId, deleteTarget.id);
    await load(); setDeleteTarget(null); showToast('Box deleted', 'err');
  };

  const toggleSel = (id: number) => setSelected(s => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const allSelected = boxes.length > 0 && boxes.every(c => selected.has(c.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(boxes.map(c => c.id)));

  const handlePrint = () => {
    const chosen = boxes.filter(c => selected.has(c.id));
    if (!chosen.length || !pallet) return;
    const palletLabel = pallet.licence_number || `Pallet #${pallet.pallet_seq}`;
    printLabels(chosen.map(c => ({ qr: c.barcode, context: `${soNumber} · ${palletLabel}`, code: c.barcode, note: c.note })));
  };

  if (loading) return <div style={{ padding: 40, color: 'var(--ink-4)' }}>Loading…</div>;
  if (!pallet) return <div style={{ padding: 40, color: '#b91c1c' }}>Pallet not found.</div>;

  return (
    <div style={{ padding: isMobile ? '12px 12px 40px' : '22px 28px 40px' }}>

      {/* Box card */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--hair)', borderRadius: 12, overflow: 'hidden' }}>

        {/* Card header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '12px 16px', borderBottom: boxes.length ? '1px solid var(--hair)' : 'none' }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Boxes</h2>
          <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: 'var(--accent-light)', color: 'var(--accent-2)' }}>{boxes.length}</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            {selected.size > 0 && (
              <button style={BtnGhost} onClick={handlePrint}><IPrint /> Print ({selected.size})</button>
            )}
            <button style={BtnPrimary} onClick={() => setAddOpen(true)}><IPlus /> Add Box</button>
          </div>
        </div>

        {boxes.length === 0 ? null : isMobile ? (
          /* Mobile: card list */
          <div>
            {boxes.map(c => {
              const isHi = !!highlight && c.barcode === highlight;
              return (
              <div key={c.id} ref={isHi ? attachHighlight : undefined}
                style={{ padding: '14px 16px', borderBottom: '1px solid var(--hair)', background: isHi ? 'var(--accent-light)' : 'transparent', boxShadow: isHi ? 'inset 3px 0 0 var(--accent)' : 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9, minWidth: 0 }}>
                    <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSel(c.id)}
                      aria-label={`Select ${c.barcode}`} style={{ cursor: 'pointer', accentColor: 'var(--accent)', marginTop: 3, flexShrink: 0 }} />
                    <span className="mono" style={{ fontWeight: 700, fontSize: 13.5, wordBreak: 'break-all', lineHeight: 1.4 }}>{c.barcode}</span>
                  </div>
                  <span style={{ fontSize: 11.5, color: 'var(--ink-4)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {c.created_at ? new Date(c.created_at).toLocaleDateString('en-CA') : '—'}
                  </span>
                </div>
                {c.note && <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--ink-3)', fontStyle: 'italic' }}>{c.note}</div>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setEditTarget(c)} style={{ flex: 1, height: 38, borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--hair)', color: 'var(--ink-2)', fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer', fontFamily: 'inherit' }}><IEdit /> Edit</button>
                  <button onClick={() => setDeleteTarget(c)} style={{ flex: 1, height: 38, borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--hair)', color: 'var(--ink-3)', fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer', fontFamily: 'inherit' }}><ITrash /> Delete</button>
                </div>
              </div>
              );
            })}
          </div>
        ) : (
          /* Desktop: table */
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 680 }}>
              <thead>
                <tr>
                  <th style={{ ...Th, width: 40 }}>
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all"
                      style={{ cursor: 'pointer', accentColor: 'var(--accent)' }} />
                  </th>
                  <th style={Th}>Barcode</th>
                  <th style={Th}>Note</th>
                  <th style={ThR}>Date</th>
                  <th style={{ ...Th, width: 84 }}></th>
                </tr>
              </thead>
              <tbody>
                {boxes.map(c => {
                  const isHi = !!highlight && c.barcode === highlight;
                  const baseBg = isHi ? 'var(--accent-light)' : 'transparent';
                  return (
                  <tr key={c.id} ref={isHi ? attachHighlight : undefined}
                    style={{ background: baseBg, boxShadow: isHi ? 'inset 3px 0 0 var(--accent)' : 'none' }}
                    onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = '#eef5f0'}
                    onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = baseBg}>
                    <td style={{ ...Td, width: 40 }}>
                      <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSel(c.id)}
                        aria-label={`Select ${c.barcode}`} style={{ cursor: 'pointer', accentColor: 'var(--accent)' }} />
                    </td>
                    <td style={Td}><span className="mono" style={{ fontWeight: 600, fontSize: 13.5 }}>{c.barcode}</span></td>
                    <td style={{ ...Td, color: c.note ? 'var(--ink-3)' : 'var(--ink-5)', fontStyle: c.note ? 'italic' : 'normal' }}>{c.note || '—'}</td>
                    <td style={{ ...TdR, color: 'var(--ink-3)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                      {c.created_at ? new Date(c.created_at).toLocaleDateString('en-CA') : '—'}
                    </td>
                    <td style={TdR}>
                      <div style={{ display: 'flex', gap: 5, justifyContent: 'flex-end' }}>
                        <button title="Edit" onClick={() => setEditTarget(c)}
                          style={{ width: 30, height: 30, borderRadius: 7, background: 'var(--surface-2)', border: '1px solid var(--hair)', color: 'var(--ink-3)', display: 'grid', placeItems: 'center', cursor: 'pointer' }}><IEdit /></button>
                        <button title="Delete" onClick={() => setDeleteTarget(c)}
                          style={{ width: 30, height: 30, borderRadius: 7, background: 'var(--surface-2)', border: '1px solid var(--hair)', color: 'var(--ink-3)', display: 'grid', placeItems: 'center', cursor: 'pointer' }}
                          onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.color = '#b0432b'; el.style.background = '#fef2f2'; el.style.borderColor = '#fecaca'; }}
                          onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.color = 'var(--ink-3)'; el.style.background = 'var(--surface-2)'; el.style.borderColor = 'var(--hair)'; }}><ITrash /></button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Back link */}
      <button onClick={() => router.push(`/sales-orders/${soId}`)} style={{ ...BtnGhost, marginTop: 18 }}>
        <IBack /> Back to {soNumber}
      </button>

      {/* Modals */}
      <AddBoxModal open={addOpen} nextSeq={nextSeq} composeBarcode={composeBarcode}
        onClose={() => setAddOpen(false)} onSubmit={handleAdd} />
      <EditBoxModal box={editTarget} onClose={() => setEditTarget(null)} onSubmit={handleEdit} />
      <ConfirmModal target={deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} />
      {toast && <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  );
}
