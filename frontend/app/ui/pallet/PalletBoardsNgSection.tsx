'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { api, apiErrorMessage } from '@/app/lib/api';
import type { PalletMPN, PalletNgGroup } from '@/interface/IDatatable';
import { Field, Input } from '@/app/ui/components';

/** Board Qty + NG of the Edit pallet dialog.
 *
 *  The pallet's Board Qty and NG are sums (Pallet.effective_board_qty / ng_qty) of board
 *  qty per MPN and NG per chip, so that is where they are edited — but they show as
 *  ordinary one-line fields. A single-MPN pallet edits Board Qty in place; otherwise the
 *  breakdown opens in a full-width panel below the fields (so the two-column grid never
 *  leaves a hole), and the same goes for NG by chip.
 *
 *  Grid usage: <BoardQtyField/> <NgField/> then <BoardsNgPanels/> (spans both columns).
 *  The dialog calls `save()` before saving the pallet itself. */

const WHOLE = /^\d+$/;
const num = (v: string) => (WHOLE.test(v.trim()) ? +v.trim() : 0);

type Chip = PalletNgGroup['chips'][number];
interface Row { pm: PalletMPN; chips: Chip[] }

export function usePalletBoardsNg(palletId: number, open: boolean) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [boardQty, setBoardQty] = useState<Record<number, string>>({});   // PalletMPN id → text
  const [ng, setNg] = useState<Record<number, string>>({});               // chip id → text
  const [boardsOpen, setBoardsOpen] = useState(false);
  const [ngOpen, setNgOpen] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setRows(null); setLoadError(''); setBoardsOpen(false); setNgOpen(false);
    Promise.all([api.pallets.mpns.list(palletId), api.pallets.ng.get(palletId)])
      .then(([pms, groups]) => {
        if (cancelled) return;
        const chipsByMpn = new Map(groups.map(g => [g.mpn_id, g.chips]));
        setRows(pms.map(pm => ({ pm, chips: chipsByMpn.get(pm.mpn) ?? [] })));
        setBoardQty(Object.fromEntries(pms.map(pm => [pm.id, pm.board_qty == null ? '' : String(pm.board_qty)])));
        setNg(Object.fromEntries(groups.flatMap(g => g.chips.map(c => [c.id, c.qty ? String(c.qty) : '']))));
      })
      .catch(() => { if (!cancelled) setLoadError('Failed to load Board Qty / NG'); });
    return () => { cancelled = true; };
  }, [palletId, open]);

  /** Saves only what changed. Returns an error message, or '' on success. */
  const save = useCallback(async (): Promise<string> => {
    if (!rows) return '';
    for (const v of [...Object.values(boardQty), ...Object.values(ng)]) {
      if (v.trim() && !WHOLE.test(v.trim())) return 'Board Qty and NG must be whole numbers, 0 or more';
    }
    try {
      for (const { pm } of rows) {
        const t = (boardQty[pm.id] ?? '').trim();
        const next = t ? +t : null;
        if (next !== pm.board_qty) await api.pallets.mpns.update(palletId, pm.id, { board_qty: next });
      }
      const original = new Map(rows.flatMap(r => r.chips.map(c => [c.id, c.qty])));
      const items = [...original.keys()].map(id => {
        const t = (ng[id] ?? '').trim();
        return { chip: id, qty: t ? +t : null };
      });
      if (items.some(i => (i.qty ?? 0) !== (original.get(i.chip) ?? 0))) await api.pallets.ng.save(palletId, items);
      return '';
    } catch (e) {
      return apiErrorMessage(e) || 'Failed to save Board Qty / NG';
    }
  }, [rows, boardQty, ng, palletId]);

  return { rows, boardQty, setBoardQty, ng, setNg, boardsOpen, setBoardsOpen, ngOpen, setNgOpen, loadError, save };
}

type State = ReturnType<typeof usePalletBoardsNg>;

const hint: React.CSSProperties = { fontSize: 11.5, color: 'var(--ink-4)' };
const toggleSty: React.CSSProperties = {
  background: 'none', border: 0, padding: 0, cursor: 'pointer', fontFamily: 'inherit',
  fontSize: 11.5, color: 'var(--accent-2)', fontWeight: 600,
};
const cellInput: React.CSSProperties = {
  width: 64, height: 28, flexShrink: 0, textAlign: 'right', border: '1px solid var(--hair-strong)', borderRadius: 3,
  padding: '0 8px', fontSize: 12.5, background: 'var(--surface)', color: 'var(--ink)', fontFamily: 'inherit',
};
const chipLabel = (c: Chip) => [c.brand_name, c.chip_mpn].filter(Boolean).join(' · ') || `Chip #${c.id}`;

/** A field label with an optional toggle link on its right. The toggle sits outside the
 *  <label> so clicking it does not also focus the field's input. */
function FieldHead({ label, toggle }: { label: string; toggle?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 5 }}>
      <span style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>{label}</span>
      {toggle}
    </div>
  );
}

export function BoardQtyField({ state }: { state: State }) {
  const { rows, boardQty, setBoardQty, boardsOpen, setBoardsOpen, loadError } = state;
  if (loadError || !rows) {
    return <Field label="Board Qty"><Input value="" disabled placeholder={loadError ? '—' : 'Loading…'} /></Field>;
  }
  if (rows.length === 0) {
    return <Field label="Board Qty"><Input value="" disabled placeholder="Add boards on the Boards tab" /></Field>;
  }
  if (rows.length === 1) {
    const pm = rows[0].pm;
    return (
      <div>
        <FieldHead label="Board Qty" toggle={<span className="mono" style={hint}>{pm.mpn_name}</span>} />
        <Input value={boardQty[pm.id] ?? ''} onChange={v => setBoardQty(s => ({ ...s, [pm.id]: v }))} placeholder="0" style={{ width: '100%' }} />
      </div>
    );
  }
  const total = rows.reduce((n, r) => n + num(boardQty[r.pm.id] ?? ''), 0);
  return (
    <div>
      <FieldHead label="Board Qty" toggle={
        <button type="button" style={toggleSty} onClick={() => setBoardsOpen(o => !o)}>
          {boardsOpen ? 'Done' : `Edit per MPN (${rows.length})`}
        </button>} />
      <Input value={String(total)} disabled style={{ width: '100%' }} />
    </div>
  );
}

export function NgField({ state }: { state: State }) {
  const { rows, ng, ngOpen, setNgOpen, loadError } = state;
  const chips = rows?.flatMap(r => r.chips) ?? [];
  if (loadError || !rows || chips.length === 0) {
    return (
      <Field label="NG (failed chips)">
        <Input value="" disabled placeholder={loadError ? '—' : !rows ? 'Loading…' : 'Add boards first'} />
      </Field>
    );
  }
  const total = chips.reduce((n, c) => n + num(ng[c.id] ?? ''), 0);
  return (
    <div>
      <FieldHead label="NG (failed chips)" toggle={
        <button type="button" style={toggleSty} onClick={() => setNgOpen(o => !o)}>
          {ngOpen ? 'Done' : 'Edit by chip'}
        </button>} />
      <Input value={String(total)} disabled style={{ width: '100%', ...(total ? { color: 'var(--err)' } : {}) }} />
    </div>
  );
}

/** Full-width breakdowns, opened from the fields' toggles. Spans both grid columns. */
export function BoardsNgPanels({ state }: { state: State }) {
  const { rows, boardQty, setBoardQty, ng, setNg, boardsOpen, ngOpen } = state;
  if (!rows) return null;
  const panel: React.CSSProperties = { gridColumn: 'span 2', border: '1px solid var(--hair)', borderRadius: 3, background: 'var(--surface-2)', padding: '8px 10px' };
  const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: '6px 16px' };
  const cell = (label: React.ReactNode, title: string, input: React.ReactNode, key: number) => (
    <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }} title={title}>
      <span style={{ flex: 1, minWidth: 0, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      {input}
    </label>
  );
  return (
    <>
      {boardsOpen && rows.length > 1 && (
        <div style={panel}>
          <div style={{ ...hint, marginBottom: 6 }}>Board qty per MPN</div>
          <div style={grid}>
            {rows.map(({ pm }) => cell(<span className="mono">{pm.mpn_name}</span>, pm.mpn_name,
              <input type="text" inputMode="numeric" placeholder="0" value={boardQty[pm.id] ?? ''}
                onChange={e => { const v = e.target.value; setBoardQty(s => ({ ...s, [pm.id]: v })); }} style={cellInput} />, pm.id))}
          </div>
        </div>
      )}
      {ngOpen && (
        <div style={panel}>
          {rows.filter(r => r.chips.length).map(({ pm, chips }) => (
            <div key={pm.id} style={{ marginBottom: 6 }}>
              {rows.length > 1 && <div className="mono" style={{ ...hint, fontWeight: 600, margin: '2px 0 6px' }}>{pm.mpn_name}</div>}
              <div style={grid}>
                {chips.map(c => cell(chipLabel(c), chipLabel(c),
                  <input type="text" inputMode="numeric" placeholder="0" value={ng[c.id] ?? ''}
                    onChange={e => { const v = e.target.value; setNg(s => ({ ...s, [c.id]: v })); }} style={cellInput} />, c.id))}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
