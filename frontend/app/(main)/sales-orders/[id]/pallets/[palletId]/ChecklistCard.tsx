'use client';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '@/app/lib/api';
import type { Checklist } from '@/interface/IDatatable';
import { printLabels } from '@/app/lib/printLabels';
import {
  IPlus, IEdit, ITrash, IPrint,
  BtnPrimary, BtnGhost, FieldLabel, InputSty, Th, ThR, Td, TdR,
  CardSty, ModalSty, ErrorSty, OptionalSty,
  Overlay, ModalHead, ModalFoot, RowActions, ConfirmDelete, ToastFn,
} from './parts';

/** The checklist (清單) produced after this pallet's boards are cut. One row per label,
 *  barcoded {pallet barcode}-{n}. Numbers are allocated by the server — this card asks
 *  for N labels and renders whatever comes back. */

const MAX_PER_BATCH = 500;

function clampCount(raw: string) {
  return Math.max(1, Math.min(parseInt(raw) || 1, MAX_PER_BATCH));
}

/** qty is optional: blank stays null rather than becoming 0. */
function parseQty(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = parseInt(t);
  return Number.isFinite(n) ? n : null;
}

// ── Add modal ───────────────────────────────────────────────────────────────────
function AddModal({ open, palletBarcode, nextSeq, onClose, onSubmit }: {
  open: boolean; palletBarcode: string; nextSeq: number; onClose: () => void;
  onSubmit: (d: { count: number; brand: string; model: string; qty: number | null }) => Promise<void>;
}) {
  const [count, setCount] = useState('1');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [qty, setQty] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) { setCount('1'); setBrand(''); setModel(''); setQty(''); setError(''); }
  }, [open]);

  const n = clampCount(count);
  const preview = n === 1
    ? `${palletBarcode}-${nextSeq}`
    : `${palletBarcode}-${nextSeq}  …  ${palletBarcode}-${nextSeq + n - 1}`;

  const handleSubmit = async () => {
    setSaving(true); setError('');
    try {
      await onSubmit({ count: n, brand: brand.trim(), model: model.trim(), qty: parseQty(qty) });
      onClose();
    } catch (e: any) { setError(e.message || 'Failed to save'); }
    finally { setSaving(false); }
  };

  if (!open) return null;
  return (
    <Overlay onClose={onClose}>
      <div style={ModalSty}>
        <ModalHead title="Add checklist labels" onClose={onClose} />
        <div style={{ padding: '18px 20px' }}>
          {error && <div style={ErrorSty}>{error}</div>}
          <div style={{ marginBottom: 14 }}>
            <div style={FieldLabel}>How many</div>
            <input type="number" min="1" max={MAX_PER_BATCH} value={count} onChange={e => setCount(e.target.value)} autoFocus style={InputSty} />
            <div style={{ marginTop: 5, fontSize: 11.5, color: 'var(--ink-4)' }}>
              Numbering continues across the whole pallet — next up is <b className="mono" style={{ color: 'var(--ink-3)' }}>{nextSeq}</b>.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
            <div style={{ flex: 1 }}>
              <div style={FieldLabel}>Brand <span style={OptionalSty}>optional</span></div>
              <input value={brand} onChange={e => setBrand(e.target.value)} placeholder="Dell" style={InputSty} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={FieldLabel}>Model <span style={OptionalSty}>optional</span></div>
              <input value={model} onChange={e => setModel(e.target.value)} placeholder="OptiPlex 7010" style={InputSty} />
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <div style={FieldLabel}>Qty <span style={OptionalSty}>optional</span></div>
            <input type="number" value={qty} onChange={e => setQty(e.target.value)} placeholder="Applied to all created rows…" style={InputSty} />
          </div>
          <div>
            <div style={FieldLabel}>Barcode{n > 1 ? 's' : ''} preview</div>
            <div className="mono" style={{ padding: '10px 12px', borderRadius: 9, background: 'var(--surface-2)', border: '1px solid var(--hair)', fontSize: 12.5, color: 'var(--accent-2)', fontWeight: 600, wordBreak: 'break-all', lineHeight: 1.5 }}>
              {preview}
            </div>
          </div>
        </div>
        <ModalFoot onClose={onClose} onSubmit={handleSubmit} saving={saving}
          label={`Add ${n} label${n > 1 ? 's' : ''}`} savingLabel="Adding…" />
      </div>
    </Overlay>
  );
}

// ── Edit modal ──────────────────────────────────────────────────────────────────
function EditModal({ row, onClose, onSubmit }: {
  row: Checklist | null; onClose: () => void;
  onSubmit: (d: { brand: string; model: string; qty: number | null }) => Promise<void>;
}) {
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [qty, setQty] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (row) {
      setBrand(row.brand || ''); setModel(row.model || '');
      setQty(row.qty == null ? '' : String(row.qty)); setError('');
    }
  }, [row]);

  const handleSubmit = async () => {
    setSaving(true); setError('');
    try {
      await onSubmit({ brand: brand.trim(), model: model.trim(), qty: parseQty(qty) });
      onClose();
    } catch (e: any) { setError(e.message || 'Failed to save'); }
    finally { setSaving(false); }
  };

  if (!row) return null;
  return (
    <Overlay onClose={onClose}>
      <div style={ModalSty}>
        <ModalHead title="Edit checklist line" onClose={onClose} />
        <div style={{ padding: '18px 20px' }}>
          {error && <div style={ErrorSty}>{error}</div>}
          <div style={{ marginBottom: 14 }}>
            <div style={FieldLabel}>Barcode</div>
            <div className="mono" style={{ padding: '10px 12px', borderRadius: 9, background: 'var(--surface-2)', border: '1px solid var(--hair)', fontSize: 12.5, color: 'var(--ink-3)', fontWeight: 600, wordBreak: 'break-all' }}>{row.barcode}</div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
            <div style={{ flex: 1 }}>
              <div style={FieldLabel}>Brand</div>
              <input value={brand} onChange={e => setBrand(e.target.value)} autoFocus style={InputSty} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={FieldLabel}>Model</div>
              <input value={model} onChange={e => setModel(e.target.value)} style={InputSty} />
            </div>
          </div>
          <div>
            <div style={FieldLabel}>Qty</div>
            <input type="number" value={qty} onChange={e => setQty(e.target.value)} style={InputSty} />
          </div>
        </div>
        <ModalFoot onClose={onClose} onSubmit={handleSubmit} saving={saving}
          label="Save changes" savingLabel="Saving…" />
      </div>
    </Overlay>
  );
}

// ── Card ────────────────────────────────────────────────────────────────────────
export default function ChecklistCard({ palletId, soNumber, palletLabel, palletBarcode, isMobile, showToast }: {
  palletId: number; soNumber: string; palletLabel: string; palletBarcode: string;
  isMobile: boolean; showToast: ToastFn;
}) {
  const [rows, setRows] = useState<Checklist[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Checklist | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Checklist | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    try {
      setRows((await api.pallets.checklists.list(palletId)) || []);
      setSelected(new Set());
    } catch { showToast('Failed to load checklist', 'err'); }
    // showToast is recreated every render by the parent; depending on it would reload in a loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [palletId]);

  useEffect(() => { load(); }, [load]);

  // Mirrors Checklist.next_index on the server: highest trailing -{n} on this pallet, + 1.
  const nextSeq = useMemo(() => {
    let mx = 0;
    for (const r of rows) {
      const tail = (r.barcode || '').split('-').pop() || '';
      if (/^\d+$/.test(tail)) mx = Math.max(mx, parseInt(tail));
    }
    return mx + 1;
  }, [rows]);

  const handleAdd = async (d: { count: number; brand: string; model: string; qty: number | null }) => {
    const items = Array.from({ length: d.count }, () => ({ brand: d.brand, model: d.model, qty: d.qty }));
    const created = await api.pallets.checklists.create(palletId, { items });
    const n = created?.length ?? d.count;
    await load();
    showToast(`Added ${n} checklist label${n > 1 ? 's' : ''}`);
  };

  const handleEdit = async (d: { brand: string; model: string; qty: number | null }) => {
    if (!editTarget) return;
    await api.pallets.checklists.update(palletId, editTarget.id, d);
    await load(); showToast('Checklist line saved');
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await api.pallets.checklists.delete(palletId, deleteTarget.id);
    await load(); setDeleteTarget(null); showToast('Checklist line deleted', 'err');
  };

  const toggleSel = (id: number) => setSelected(s => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const allSelected = rows.length > 0 && rows.every(r => selected.has(r.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rows.map(r => r.id)));

  const handlePrint = () => {
    const chosen = rows.filter(r => selected.has(r.id));
    if (!chosen.length) return;
    printLabels(chosen.map(r => ({
      qr: r.barcode,
      context: `${soNumber} · ${palletLabel}`,
      code: r.barcode,
      note: [r.brand, r.model, r.qty == null ? '' : `×${r.qty}`].filter(Boolean).join(' '),
    })));
  };

  const describe = (r: Checklist) => [r.brand, r.model].filter(Boolean).join(' ');

  return (
    <div style={{ ...CardSty, marginTop: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '12px 16px', borderBottom: rows.length ? '1px solid var(--hair)' : 'none' }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Checklist</h2>
        <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: 'var(--accent-light)', color: 'var(--accent-2)' }}>{rows.length}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {selected.size > 0 && (
            <button style={BtnGhost} onClick={handlePrint}><IPrint /> Print ({selected.size})</button>
          )}
          <button style={BtnPrimary} onClick={() => setAddOpen(true)}><IPlus /> Add labels</button>
        </div>
      </div>

      {rows.length === 0 ? null : isMobile ? (
        /* Mobile: card list */
        <div>
          {rows.map(r => (
            <div key={r.id} style={{ padding: '14px 16px', borderBottom: '1px solid var(--hair)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9, minWidth: 0 }}>
                  <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSel(r.id)}
                    aria-label={`Select ${r.barcode}`} style={{ cursor: 'pointer', accentColor: 'var(--accent)', marginTop: 3, flexShrink: 0 }} />
                  <span className="mono" style={{ fontWeight: 700, fontSize: 13.5, wordBreak: 'break-all', lineHeight: 1.4 }}>{r.barcode}</span>
                </div>
                {r.qty != null && (
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', whiteSpace: 'nowrap', flexShrink: 0 }}>×{r.qty}</span>
                )}
              </div>
              {describe(r) && <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--ink-3)' }}>{describe(r)}</div>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setEditTarget(r)} style={{ flex: 1, height: 38, borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--hair)', color: 'var(--ink-2)', fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer', fontFamily: 'inherit' }}><IEdit /> Edit</button>
                <button onClick={() => setDeleteTarget(r)} style={{ flex: 1, height: 38, borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--hair)', color: 'var(--ink-3)', fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer', fontFamily: 'inherit' }}><ITrash /> Delete</button>
              </div>
            </div>
          ))}
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
                <th style={Th}>Brand</th>
                <th style={Th}>Model</th>
                <th style={ThR}>Qty</th>
                <th style={ThR}>Date</th>
                <th style={{ ...Th, width: 84 }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}
                  onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = '#eef5f0'}
                  onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'}>
                  <td style={{ ...Td, width: 40 }}>
                    <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSel(r.id)}
                      aria-label={`Select ${r.barcode}`} style={{ cursor: 'pointer', accentColor: 'var(--accent)' }} />
                  </td>
                  <td style={Td}><span className="mono" style={{ fontWeight: 600, fontSize: 13.5 }}>{r.barcode}</span></td>
                  <td style={{ ...Td, color: r.brand ? 'var(--ink-2)' : 'var(--ink-5)' }}>{r.brand || '—'}</td>
                  <td style={{ ...Td, color: r.model ? 'var(--ink-2)' : 'var(--ink-5)' }}>{r.model || '—'}</td>
                  <td style={{ ...TdR, color: r.qty == null ? 'var(--ink-5)' : 'var(--ink-2)', fontVariantNumeric: 'tabular-nums' }}>{r.qty ?? '—'}</td>
                  <td style={{ ...TdR, color: 'var(--ink-3)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                    {r.created_at ? new Date(r.created_at).toLocaleDateString('en-CA') : '—'}
                  </td>
                  <td style={TdR}>
                    <RowActions onEdit={() => setEditTarget(r)} onDelete={() => setDeleteTarget(r)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AddModal open={addOpen} palletBarcode={palletBarcode} nextSeq={nextSeq}
        onClose={() => setAddOpen(false)} onSubmit={handleAdd} />
      <EditModal row={editTarget} onClose={() => setEditTarget(null)} onSubmit={handleEdit} />
      <ConfirmDelete open={!!deleteTarget} title="Delete checklist line?"
        barcode={deleteTarget?.barcode || ''}
        onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} />
    </div>
  );
}
