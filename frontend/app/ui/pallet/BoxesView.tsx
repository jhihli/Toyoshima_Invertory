'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter, usePathname } from 'next/navigation';
import { api } from '@/app/lib/api';
import type { Box } from '@/interface/IDatatable';
import { useIsMobile } from '@/app/ui/hooks/useIsMobile';
import { printLabels } from '@/app/lib/printLabels';
import { usePalletContext } from './usePalletContext';
import {
  IBack, IPlus, IEdit, ITrash, IPrint, IForward,
  BtnPrimary, BtnGhost, FieldLabel, InputSty, Th, ThR, Td, TdR,
  CardSty, ModalSty, ErrorSty, OptionalSty,
  Toast, Overlay, ModalHead, ModalFoot, RowActions, ConfirmDelete,
} from './parts';

// ── Add Box modal ─────────────────────────────────────────────────────────────
function AddBoxModal({ open, barcode, onClose, onSubmit }: {
  open: boolean; barcode: string;
  onClose: () => void; onSubmit: (d: { count: number; note: string }) => Promise<void>;
}) {
  const [count, setCount] = useState('1');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { if (open) { setCount('1'); setNote(''); setError(''); } }, [open]);

  const n = Math.max(1, Math.min(parseInt(count) || 1, 500));

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
      <div style={ModalSty}>
        <ModalHead title="Add Box" onClose={onClose} />
        <div style={{ padding: '18px 20px' }}>
          {error && <div style={ErrorSty}>{error}</div>}
          <div style={{ marginBottom: 14 }}>
            <div style={FieldLabel}>How many</div>
            <input type="number" min="1" max="500" value={count} onChange={e => setCount(e.target.value)} autoFocus style={InputSty} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <div style={FieldLabel}>Note <span style={OptionalSty}>optional</span></div>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="Applied to all created items…" style={InputSty} />
          </div>
          {/* Every box on a pallet carries the pallet's own barcode — there is one label to preview,
              however many boxes you add. */}
          <div>
            <div style={FieldLabel}>Barcode preview</div>
            <div className="mono" style={{ padding: '10px 12px', borderRadius: 9, background: 'var(--surface-2)', border: '1px solid var(--hair)', fontSize: 12.5, color: 'var(--accent-2)', fontWeight: 600, wordBreak: 'break-all', lineHeight: 1.5 }}>
              {barcode}
            </div>
            <div style={{ marginTop: 5, fontSize: 11.5, color: 'var(--ink-4)' }}>
              All {n} box{n > 1 ? 'es' : ''} share this barcode — it is the pallet&apos;s own label.
            </div>
          </div>
        </div>
        <ModalFoot onClose={onClose} onSubmit={handleSubmit} saving={saving}
          label={`Add ${n} box${n > 1 ? 'es' : ''}`} savingLabel="Adding…" />
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
      <div style={ModalSty}>
        <ModalHead title="Edit Box" onClose={onClose} />
        <div style={{ padding: '18px 20px' }}>
          {error && <div style={ErrorSty}>{error}</div>}
          <div style={{ marginBottom: 14 }}>
            <div style={FieldLabel}>Barcode</div>
            <div className="mono" style={{ padding: '10px 12px', borderRadius: 9, background: 'var(--surface-2)', border: '1px solid var(--hair)', fontSize: 12.5, color: 'var(--ink-3)', fontWeight: 600, wordBreak: 'break-all' }}>{box.barcode}</div>
          </div>
          <div>
            <div style={FieldLabel}>Note <span style={OptionalSty}>optional</span></div>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="Internal note…" autoFocus style={InputSty} />
          </div>
        </div>
        <ModalFoot onClose={onClose} onSubmit={handleSubmit} saving={saving}
          label="Save changes" savingLabel="Saving…" />
      </div>
    </Overlay>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────────
export default function BoxesView() {
  const { id, palletId } = useParams<{ id: string; palletId: string }>();
  const soId = Number(id);
  const pId = Number(palletId);
  const router = useRouter();
  const isMobile = useIsMobile();

  // Both order types hang off the same pallet screens: /sales-orders/… for the general
  // flow and /sos/… for MSFT. Links are built from whichever tree the user came in
  // through, so Back and the Checklist link never bounce them into the other one.
  const base = usePathname().split('/').filter(Boolean)[0] || 'sales-orders';
  // box barcode to highlight (from the box search's ?highlight= param); read client-side to
  // avoid needing a Suspense boundary around useSearchParams.
  const [highlight, setHighlight] = useState<string | null>(null);
  useEffect(() => { setHighlight(new URLSearchParams(window.location.search).get('highlight')); }, []);
  const scrolledRef = React.useRef(false);
  const attachHighlight = (el: HTMLElement | null) => {
    if (el && !scrolledRef.current) { scrolledRef.current = true; el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  };

  const [boxes, setBoxes] = useState<Box[]>([]);
  const [boxesLoading, setBoxesLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [editTarget, setEditTarget] = useState<Box | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Box | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);
  const showToast = useCallback((msg: string, type: 'ok' | 'err' = 'ok') => setToast({ msg, type }), []);

  const { pallet, soNumber, palletLabel, palletBarcode, loading: palletLoading, error: palletError }
    = usePalletContext(soId, pId);

  const loadBoxes = useCallback(async () => {
    try {
      setBoxes((await api.pallets.boxes.list(pId)) || []);
      setSelected(new Set());
    } catch { showToast('Failed to load boxes', 'err'); }
    setBoxesLoading(false);
  }, [pId, showToast]);

  useEffect(() => { loadBoxes(); }, [loadBoxes]);

  const handleAdd = async (d: { count: number; note: string }) => {
    const created = await api.pallets.boxes.create(pId, d);
    const n = created?.length ?? d.count;
    await loadBoxes();
    showToast(`Added ${n} box${n > 1 ? 'es' : ''}`);
  };
  const handleEdit = async (d: { note: string }) => {
    if (!editTarget) return;
    await api.pallets.boxes.update(pId, editTarget.id, d);
    await loadBoxes(); showToast('Box saved');
  };
  const handleDelete = async () => {
    if (!deleteTarget) return;
    await api.pallets.boxes.delete(pId, deleteTarget.id);
    await loadBoxes(); setDeleteTarget(null); showToast('Box deleted', 'err');
  };

  const toggleSel = (id: number) => setSelected(s => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const allSelected = boxes.length > 0 && boxes.every(c => selected.has(c.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(boxes.map(c => c.id)));

  const handlePrint = () => {
    const chosen = boxes.filter(c => selected.has(c.id));
    if (!chosen.length || !pallet) return;
    printLabels(chosen.map(c => ({ qr: c.barcode, context: `${soNumber} · ${palletLabel}`, code: c.barcode, note: c.note })));
  };

  if (palletLoading || boxesLoading) return <div style={{ padding: 40, color: 'var(--ink-4)' }}>Loading…</div>;
  if (palletError) return <div style={{ padding: 40, color: '#b91c1c' }}>Couldn&apos;t load this pallet.</div>;
  if (!pallet) return <div style={{ padding: 40, color: '#b91c1c' }}>Pallet not found.</div>;

  return (
    <div style={{ padding: isMobile ? '12px 12px 40px' : '22px 28px 40px' }}>

      {/* Box card */}
      <div style={CardSty}>

        {/* Card header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '12px 16px', borderBottom: boxes.length ? '1px solid var(--hair)' : 'none' }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Boxes</h2>
          <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: 'var(--accent-light)', color: 'var(--accent-2)' }}>{boxes.length}</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            {selected.size > 0 && (
              <button style={BtnGhost} onClick={handlePrint}><IPrint /> Print ({selected.size})</button>
            )}
            <button style={BtnPrimary} onClick={() => setAddOpen(true)}><IPlus /> Add Box</button>
            {/* Through to the 清單 for this pallet — its own route, so the breadcrumb
                can reach … > tgt1 > Checklist. */}
            <button style={BtnGhost} onClick={() => router.push(`/${base}/${soId}/pallets/${pId}/checklist`)}>
              Checklist
              <span style={{ fontSize: 11.5, fontWeight: 700, padding: '1px 7px', borderRadius: 99, background: 'var(--accent-light)', color: 'var(--accent-2)' }}>{pallet.checklist_count ?? 0}</span>
              <IForward />
            </button>
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
                      <RowActions onEdit={() => setEditTarget(c)} onDelete={() => setDeleteTarget(c)} />
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
      <button onClick={() => router.push(`/${base}/${soId}`)} style={{ ...BtnGhost, marginTop: 18 }}>
        <IBack /> Back to {soNumber}
      </button>

      {/* Modals */}
      <AddBoxModal open={addOpen} barcode={palletBarcode}
        onClose={() => setAddOpen(false)} onSubmit={handleAdd} />
      <EditBoxModal box={editTarget} onClose={() => setEditTarget(null)} onSubmit={handleEdit} />
      <ConfirmDelete open={!!deleteTarget} title="Delete box?" barcode={deleteTarget?.barcode || ''}
        onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} />
      {toast && <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  );
}
