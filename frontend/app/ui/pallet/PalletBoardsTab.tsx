'use client';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { api, apiErrorMessage } from '@/app/lib/api';
import type { MPN, PalletMPN } from '@/interface/IDatatable';
import { Button, Select, Modal, Input, Empty, thS, tdS, ghostBtn, useToast } from '@/app/ui/components';

/** Boards tab of an MSFT order: which board types (MPNs) sit on each pallet, and how many.
 *  Replaces barcode scanning. A pallet's rows here are what its checklist chip dropdown
 *  offers, and their board_qty sum is the pallet's board count on the server
 *  (Pallet.effective_board_qty) — so every change calls onChanged() to refresh the SO. */

const LABEL: React.CSSProperties = { fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-4)' };
const DASH = <span style={{ color: 'var(--ink-5)' }}>—</span>;

/** '' → null; otherwise a non-negative integer, or undefined when invalid. */
function parseBoardQty(raw: string): number | null | undefined {
  const t = raw.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isInteger(n) && n >= 0 ? n : undefined;
}

export default function PalletBoardsTab({ palletOptions, palletId, onPalletChange, onChanged }: {
  palletOptions: { value: string; label: string }[];
  palletId: number | null;
  onPalletChange: (id: number) => void;
  onChanged: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [rows, setRows] = useState<PalletMPN[]>([]);
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PalletMPN | null>(null);

  const load = useCallback(async () => {
    if (palletId == null) { setRows([]); return; }
    setLoading(true);
    try { setRows(await api.pallets.mpns.list(palletId)); }
    catch { toast('Failed to load boards'); }
    finally { setLoading(false); }
    // toast is a fresh function each render; depending on it would reload in a loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [palletId]);
  useEffect(() => { load(); }, [load]);

  const totalBoards = rows.reduce((s, r) => s + (r.board_qty ?? 0), 0);
  const palletLabel = palletOptions.find(o => o.value === String(palletId))?.label ?? '';
  const existingMpnIds = useMemo(() => new Set(rows.map(r => r.mpn)), [rows]);

  /** Returns false when the value was rejected, so the cell can revert. */
  const saveQty = async (row: PalletMPN, raw: string): Promise<boolean> => {
    const next = parseBoardQty(raw);
    if (next === undefined) { toast('Board qty must be a whole number, 0 or more'); return false; }
    if (next === row.board_qty) return true;
    try {
      const updated = await api.pallets.mpns.update(row.pallet, row.id, { board_qty: next });
      setRows(rs => rs.map(r => r.id === row.id ? updated : r));
      onChanged();
      return true;
    } catch (e) { toast(apiErrorMessage(e) || 'Failed to save board qty'); return false; }
  };

  const handleDelete = async () => {
    const target = deleteTarget;
    if (!target) return;
    try {
      await api.pallets.mpns.delete(target.pallet, target.id);
      setRows(rs => rs.filter(r => r.id !== target.id));
      onChanged();
      toast('Board removed from pallet');
    } catch (e) { toast(apiErrorMessage(e) || 'Failed to remove board'); }
    finally { setDeleteTarget(null); }
  };

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <span style={LABEL}>Pallet</span>
        <div style={{ minWidth: 200 }}>
          <Select value={palletId == null ? '' : String(palletId)} onChange={v => onPalletChange(Number(v))} options={palletOptions} />
        </div>
        <span className="num" style={{ fontSize: 12, color: 'var(--ink-3)' }}>
          {rows.length} MPN{rows.length === 1 ? '' : 's'} · {totalBoards} board{totalBoards === 1 ? '' : 's'}
        </span>
        <div style={{ flex: 1 }} />
        <Button size="sm" variant="primary" icon={<PlusIcon />} onClick={() => setAddOpen(true)} disabled={palletId == null}>
          Add board
        </Button>
      </div>

      <div style={{ overflowX: 'auto', border: '1px solid var(--hair)', borderRadius: 4, background: 'var(--surface)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--hair)' }}>
              <th style={thS}>MPN</th>
              <th style={thS}>Part type</th>
              <th style={{ ...thS, textAlign: 'right' }}>Chips / board</th>
              <th style={{ ...thS, textAlign: 'right' }}>Board qty</th>
              <th style={{ ...thS, textAlign: 'right' }}>Checklist lines</th>
              <th style={{ ...thS, width: 48 }} />
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} style={{ borderBottom: '1px solid var(--hair)' }}>
                <td style={tdS}>
                  <button className="mono"
                    onClick={() => router.push(`/mpns/${r.mpn}`)}
                    style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', color: 'var(--accent-2)', fontWeight: 600, fontSize: 12.5, fontFamily: 'inherit' }}>
                    {r.mpn_name}
                  </button>
                </td>
                <td style={tdS}>{r.part_type || DASH}</td>
                <td style={{ ...tdS, textAlign: 'right' }} className="num">{r.chips_per_board}</td>
                <td style={{ ...tdS, textAlign: 'right' }}><QtyCell row={r} onSave={saveQty} /></td>
                <td style={{ ...tdS, textAlign: 'right' }} className="num">{r.checklist_use_count || DASH}</td>
                <td style={{ ...tdS, textAlign: 'right' }}>
                  <button onClick={() => setDeleteTarget(r)} style={ghostBtn} title="Remove from pallet"><TrashIcon /></button>
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={6}>
                <Empty label={palletId == null ? 'No pallets yet' : 'No boards on this pallet yet'}
                  sub={palletId == null ? 'Add a pallet first.' : "Click 'Add board' to assign MPNs."} />
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <AddBoardsModal open={addOpen} palletId={palletId} existingMpnIds={existingMpnIds}
        onClose={() => setAddOpen(false)}
        onAdded={n => { load(); onChanged(); toast(`${n} board type${n === 1 ? '' : 's'} added`); }} />

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Remove board from pallet"
        footer={<>
          <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button variant="danger" onClick={handleDelete}>Remove</Button>
        </>}>
        <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.6 }}>
          Remove <b className="mono">{deleteTarget?.mpn_name}</b> from <b>{palletLabel}</b>?
          {(deleteTarget?.checklist_use_count ?? 0) > 0 && (
            <div style={{ marginTop: 8, color: 'var(--err)' }}>
              {deleteTarget!.checklist_use_count} checklist line(s) use its chips — change them first.
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}

function QtyCell({ row, onSave }: { row: PalletMPN; onSave: (r: PalletMPN, raw: string) => Promise<boolean> }) {
  const shown = row.board_qty == null ? '' : String(row.board_qty);
  const [v, setV] = useState(shown);
  const cancelled = useRef(false);   // Escape: the blur that follows must not save
  useEffect(() => { setV(shown); }, [shown]);
  return (
    // Text, not type="number": a number input reports malformed text ('1e') as '',
    // which would save as a blank qty instead of being rejected.
    <input type="text" inputMode="numeric" value={v} placeholder="—"
      onChange={e => setV(e.target.value)}
      onBlur={async () => {
        if (cancelled.current) { cancelled.current = false; setV(shown); return; }
        if (!(await onSave(row, v))) setV(shown);
      }}
      onKeyDown={e => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') { cancelled.current = true; e.currentTarget.blur(); }
      }}
      style={{ width: 84, height: 28, textAlign: 'right', border: '1px solid var(--hair-strong)', borderRadius: 3,
        padding: '0 8px', fontSize: 12.5, background: 'var(--surface)', color: 'var(--ink)', fontFamily: 'inherit' }} />
  );
}

function AddBoardsModal({ open, palletId, existingMpnIds, onClose, onAdded }: {
  open: boolean; palletId: number | null; existingMpnIds: Set<number>;
  onClose: () => void; onAdded: (n: number) => void;
}) {
  const [mpns, setMpns] = useState<MPN[]>([]);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Map<number, string>>(new Map());   // mpn id → qty text
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setQ(''); setPicked(new Map()); setError('');
    // Current MPNs only — Finished ones are hidden, as in the old Add-board dropdown.
    api.mpns.list({ status: 'current' }).then(setMpns).catch(() => setError('Failed to load MPNs'));
  }, [open]);

  const candidates = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return mpns
      .filter(m => !existingMpnIds.has(m.id) && (!needle || m.name.toLowerCase().includes(needle)))
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));   // newest first
  }, [mpns, q, existingMpnIds]);

  const toggle = (id: number) => setPicked(p => {
    const n = new Map(p);
    if (n.has(id)) n.delete(id); else n.set(id, '');
    return n;
  });

  const submit = async () => {
    if (palletId == null || picked.size === 0) return;
    const items: { mpn: number; board_qty: number | null }[] = [];
    for (const [mpn, raw] of picked) {
      const board_qty = parseBoardQty(raw);
      if (board_qty === undefined) { setError('Board qty must be a whole number, 0 or more'); return; }
      items.push({ mpn, board_qty });
    }
    setSaving(true); setError('');
    try {
      await api.pallets.mpns.create(palletId, items);
      onAdded(items.length);
      onClose();
    } catch (e) { setError(apiErrorMessage(e) || 'Failed to add boards'); }
    finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add boards to pallet" width={560}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={submit} disabled={saving || picked.size === 0}>
          {saving ? 'Adding…' : `Add ${picked.size || ''} board type${picked.size === 1 ? '' : 's'}`}
        </Button>
      </>}>
      {error && <div style={{ marginBottom: 10, color: 'var(--err)', fontSize: 12.5 }}>{error}</div>}
      <Input value={q} onChange={setQ} placeholder="Search MPN…" autoFocus style={{ width: '100%', marginBottom: 10 }} />
      <div style={{ maxHeight: 340, overflowY: 'auto', border: '1px solid var(--hair)', borderRadius: 3 }}>
        {candidates.map(m => {
          const on = picked.has(m.id);
          return (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderBottom: '1px solid var(--hair)', background: on ? 'var(--accent-light)' : 'transparent' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, cursor: 'pointer' }}>
                <input type="checkbox" checked={on} onChange={() => toggle(m.id)} style={{ accentColor: 'var(--accent)' }} />
                <span className="mono" style={{ fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
                {m.part_type && <span style={{ fontSize: 11.5, color: 'var(--ink-4)' }}>{m.part_type}</span>}
              </label>
              {on && (
                <input type="text" inputMode="numeric" placeholder="Board qty" value={picked.get(m.id) ?? ''}
                  onChange={e => { const v = e.target.value; setPicked(p => new Map(p).set(m.id, v)); }}
                  style={{ width: 96, height: 28, textAlign: 'right', border: '1px solid var(--hair-strong)', borderRadius: 3, padding: '0 8px', fontSize: 12.5, fontFamily: 'inherit' }} />
              )}
            </div>
          );
        })}
        {candidates.length === 0 && (
          <div style={{ padding: 16, fontSize: 12.5, color: 'var(--ink-4)', textAlign: 'center' }}>No matching MPNs.</div>
        )}
      </div>
    </Modal>
  );
}

const PlusIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
);
const TrashIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
  </svg>
);
