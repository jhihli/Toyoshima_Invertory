'use client';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { api, apiErrorMessage } from '@/app/lib/api';
import type { Checklist, ChipOptionGroup } from '@/interface/IDatatable';
import { printLabels } from '@/app/lib/printLabels';
import {
  IPlus, IEdit, ITrash, IPrint,
  BtnPrimary, BtnGhost, BtnDanger, FieldLabel, InputSty, Th, ThR, Td, TdR,
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

// ── Chip picker (MSFT orders) ───────────────────────────────────────────────────
/** The pallet's chips as one flat list, sorted by brand then part number. The same part
 *  on several of the pallet's boards is a separate Chip row per board, so it is listed
 *  once (under its first row's id); a line saved with one of the other rows still shows
 *  as selected. Picking a chip sets both brand and model — the server copies them. */
function flatChipOptions(groups: ChipOptionGroup[]) {
  const key = (c: ChipOptionGroup['chips'][number]) =>
    `${(c.brand_name || '').trim().toLowerCase()}|${(c.chip_mpn || '').trim().toLowerCase()}`;
  const options: { id: number; label: string }[] = [];
  const canonical = new Map<number, number>();   // any chip id → the id its option uses
  const byKey = new Map<string, number>();
  for (const g of groups) {
    for (const c of g.chips) {
      const k = key(c);
      const first = byKey.get(k);
      if (first === undefined) {
        byKey.set(k, c.id);
        canonical.set(c.id, c.id);
        options.push({ id: c.id, label: [c.brand_name, c.chip_mpn].filter(Boolean).join(' · ') || `Chip #${c.id}` });
      } else {
        canonical.set(c.id, first);
      }
    }
  }
  options.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
  return { options, canonical };
}

function ChipSelect({ groups, value, onChange, boardsHref }: {
  /** 'error' = the chip list failed to load (distinct from a pallet with no boards). */
  groups: ChipOptionGroup[] | 'error'; value: string; onChange: (v: string) => void; boardsHref?: string;
}) {
  if (groups === 'error') {
    return (
      <div style={{ ...InputSty, display: 'flex', alignItems: 'center', color: 'var(--err)', fontSize: 13, height: 'auto', minHeight: 40 }}>
        Couldn&apos;t load the chip list — close this and try again.
      </div>
    );
  }
  if (groups.length === 0) {
    return (
      <div style={{ ...InputSty, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4, color: 'var(--ink-4)', fontSize: 13, height: 'auto', minHeight: 40 }}>
        No boards assigned to this pallet yet.
        {boardsHref && <Link href={boardsHref} style={{ color: 'var(--accent-2)', fontWeight: 600 }}>Add them on the Boards tab</Link>}
      </div>
    );
  }
  const { options, canonical } = flatChipOptions(groups);
  const shown = value ? String(canonical.get(+value) ?? value) : '';
  return (
    <select value={shown} onChange={e => onChange(e.target.value)} style={{ ...InputSty, cursor: 'pointer' }}>
      <option value="">— Select a chip —</option>
      {options.map(o => <option key={o.id} value={String(o.id)}>{o.label}</option>)}
    </select>
  );
}

// ── Add modal ───────────────────────────────────────────────────────────────────
type AddPayload = { count: number; brand: string; model: string; chip: number | null; qty: number | null };

function AddModal({ open, palletBarcode, nextSeq, chipGroups, boardsHref, onClose, onSubmit }: {
  open: boolean; palletBarcode: string; nextSeq: number;
  /** null = free-text Brand/Model (Sales Orders); an array = chip dropdown (MSFT). */
  chipGroups: ChipOptionGroup[] | 'error' | null; boardsHref?: string;
  onClose: () => void;
  onSubmit: (d: AddPayload) => Promise<void>;
}) {
  const [count, setCount] = useState('1');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [chip, setChip] = useState('');
  const [qty, setQty] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) { setCount('1'); setBrand(''); setModel(''); setChip(''); setQty(''); setError(''); }
  }, [open]);

  const n = clampCount(count);
  const preview = n === 1
    ? `${palletBarcode}-${nextSeq}`
    : `${palletBarcode}-${nextSeq}  …  ${palletBarcode}-${nextSeq + n - 1}`;

  const handleSubmit = async () => {
    setSaving(true); setError('');
    try {
      await onSubmit(chipGroups !== null
        ? { count: n, brand: '', model: '', chip: chip ? +chip : null, qty: parseQty(qty) }
        : { count: n, brand: brand.trim(), model: model.trim(), chip: null, qty: parseQty(qty) });
      onClose();
    } catch (e: any) { setError(apiErrorMessage(e) || e.message || 'Failed to save'); }
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
          {chipGroups !== null ? (
            <div style={{ marginBottom: 14 }}>
              <div style={FieldLabel}>Chip <span style={OptionalSty}>optional</span></div>
              <ChipSelect groups={chipGroups} value={chip} onChange={setChip} boardsHref={boardsHref} />
            </div>
          ) : (
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
          )}
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
type EditPayload = { brand?: string; model?: string; chip?: number | null; qty: number | null };

function EditModal({ row, chipGroups, boardsHref, onClose, onSubmit }: {
  row: Checklist | null;
  /** null = free-text Brand/Model (Sales Orders); an array = chip dropdown (MSFT). */
  chipGroups: ChipOptionGroup[] | 'error' | null; boardsHref?: string;
  onClose: () => void; onSubmit: (d: EditPayload) => Promise<void>;
}) {
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [chip, setChip] = useState('');
  const [qty, setQty] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const chipMode = chipGroups !== null;

  useEffect(() => {
    if (row) {
      setBrand(row.brand || ''); setModel(row.model || '');
      setChip(row.chip == null ? '' : String(row.chip));
      setQty(row.qty == null ? '' : String(row.qty)); setError('');
    }
  }, [row]);

  const handleSubmit = async () => {
    setSaving(true); setError('');
    try {
      await onSubmit(chipMode
        // No chip picked: send nothing for it, so a legacy row keeps its text.
        ? { ...(chip ? { chip: +chip } : {}), qty: parseQty(qty) }
        : { brand: brand.trim(), model: model.trim(), qty: parseQty(qty) });
      onClose();
    } catch (e: any) { setError(apiErrorMessage(e) || e.message || 'Failed to save'); }
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
          {chipMode ? (
            <div style={{ marginBottom: 14 }}>
              <div style={FieldLabel}>Chip (brand · model)</div>
              {row.chip == null && (row.brand || row.model) && (
                <div style={{ marginBottom: 6, fontSize: 11.5, color: 'var(--ink-4)' }}>
                  Original: {[row.brand, row.model].filter(Boolean).join(' / ')}
                </div>
              )}
              <ChipSelect groups={chipGroups!} value={chip} onChange={setChip} boardsHref={boardsHref} />
            </div>
          ) : (
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
          )}
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
export default function ChecklistCard({ palletId, soNumber, palletLabel, palletBarcode, isMobile, showToast, chipMode = false, boardsHref }: {
  palletId: number; soNumber: string; palletLabel: string; palletBarcode: string;
  isMobile: boolean; showToast: ToastFn;
  /** MSFT orders: brand/model come from a chip of the pallet's boards, not free text. */
  chipMode?: boolean;
  /** Where "add boards" points when the pallet has none (MSFT Boards tab). */
  boardsHref?: string;
}) {
  const [rows, setRows] = useState<Checklist[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Checklist | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Checklist | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [chipGroups, setChipGroups] = useState<ChipOptionGroup[] | 'error' | null>(null);

  const load = useCallback(async () => {
    try {
      setRows((await api.pallets.checklists.list(palletId)) || []);
      setSelected(new Set());
    } catch { showToast('Failed to load checklist', 'err'); }
    // Separate from the rows: a chip-list failure must not read as "no boards on this pallet".
    if (chipMode) {
      try { setChipGroups(await api.pallets.chipOptions(palletId)); }
      catch { setChipGroups('error'); showToast('Failed to load the chip list', 'err'); }
    }
    // showToast is recreated every render by the parent; depending on it would reload in a loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [palletId, chipMode]);

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

  const handleAdd = async (d: AddPayload) => {
    const items = Array.from({ length: d.count }, () => ({ brand: d.brand, model: d.model, chip: d.chip, qty: d.qty }));
    const created = await api.pallets.checklists.create(palletId, { items });
    const n = created?.length ?? d.count;
    await load();
    showToast(`Added ${n} checklist label${n > 1 ? 's' : ''}`);
  };

  const handleEdit = async (d: EditPayload) => {
    if (!editTarget) return;
    await api.pallets.checklists.update(palletId, editTarget.id, d);
    await load(); showToast('Checklist line saved');
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await api.pallets.checklists.delete(palletId, deleteTarget.id);
    await load(); setDeleteTarget(null); showToast('Checklist line deleted', 'err');
  };


  // One request per row — there is no batch endpoint, and a pallet's checklist is small
  // enough that it does not need one. allSettled so one failure does not hide the rest.
  const handleBulkDelete = async () => {
    const ids = [...selected];
    const results = await Promise.allSettled(ids.map(id => api.pallets.checklists.delete(palletId, id)));
    const failed = results.filter(r => r.status === 'rejected').length;
    setBulkOpen(false);
    await load();
    if (failed) showToast(`${ids.length - failed} deleted, ${failed} failed`, 'err');
    else showToast(`${ids.length} checklist line${ids.length > 1 ? 's' : ''} deleted`, 'err');
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
    <div style={CardSty}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, flexWrap: 'wrap', padding: '12px 16px', borderBottom: rows.length ? '1px solid var(--hair)' : 'none' }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Checklist</h2>
        <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: 'var(--accent-light)', color: 'var(--accent-2)' }}>{rows.length}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {selected.size > 0 && (
            <>
              <button style={BtnGhost} onClick={handlePrint}><IPrint /> Print ({selected.size})</button>
              <button style={BtnDanger} onClick={() => setBulkOpen(true)}><ITrash /> Delete ({selected.size})</button>
            </>
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
        chipGroups={chipMode ? (chipGroups ?? []) : null} boardsHref={boardsHref}
        onClose={() => setAddOpen(false)} onSubmit={handleAdd} />
      <EditModal row={editTarget} chipGroups={chipMode ? (chipGroups ?? []) : null} boardsHref={boardsHref}
        onClose={() => setEditTarget(null)} onSubmit={handleEdit} />
      <ConfirmDelete open={!!deleteTarget} title="Delete checklist line?"
        body={<><b className="mono">{deleteTarget?.barcode}</b> will be permanently removed.</>}
        onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} />
      <ConfirmDelete open={bulkOpen} title={`Delete ${selected.size} checklist line${selected.size > 1 ? 's' : ''}?`}
        body={<>The <b>{selected.size}</b> selected checklist line{selected.size > 1 ? 's' : ''} will be permanently removed.</>}
        onClose={() => setBulkOpen(false)} onConfirm={handleBulkDelete} />
    </div>
  );
}
