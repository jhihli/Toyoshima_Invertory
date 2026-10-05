'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { api, apiErrorMessage } from '@/app/lib/api';
import type { PalletMPN, PalletNgGroup } from '@/interface/IDatatable';
import { Field, Input, Button } from '@/app/ui/components';

/** Board Qty + NG fields of the Edit pallet dialog.
 *
 *  The pallet's Board Qty and NG are sums (Pallet.effective_board_qty / ng_qty) of board
 *  qty per MPN and NG per chip, so they are edited at that level — but shown as ordinary
 *  fields: one Board Qty input when the pallet has a single MPN (the usual case), and an
 *  NG total with only the chips that actually failed listed under it.
 *  The dialog calls `save()` from the hook before saving the pallet itself. */

const WHOLE = /^\d+$/;
const num = (v: string) => (WHOLE.test(v.trim()) ? +v.trim() : 0);

type Chip = PalletNgGroup['chips'][number];
interface Row { pm: PalletMPN; chips: Chip[] }

export function usePalletBoardsNg(palletId: number, open: boolean) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [boardQty, setBoardQty] = useState<Record<number, string>>({});   // PalletMPN id → text
  const [ng, setNg] = useState<Record<number, string>>({});               // chip id → text
  const [ngShown, setNgShown] = useState<number[]>([]);                   // chips listed under NG
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setRows(null); setLoadError('');
    Promise.all([api.pallets.mpns.list(palletId), api.pallets.ng.get(palletId)])
      .then(([pms, groups]) => {
        if (cancelled) return;
        const chipsByMpn = new Map(groups.map(g => [g.mpn_id, g.chips]));
        setRows(pms.map(pm => ({ pm, chips: chipsByMpn.get(pm.mpn) ?? [] })));
        setBoardQty(Object.fromEntries(pms.map(pm => [pm.id, pm.board_qty == null ? '' : String(pm.board_qty)])));
        const all = groups.flatMap(g => g.chips);
        setNg(Object.fromEntries(all.map(c => [c.id, c.qty ? String(c.qty) : ''])));
        setNgShown(all.filter(c => c.qty > 0).map(c => c.id));
      })
      .catch(() => { if (!cancelled) setLoadError('Failed to load boards & NG'); });
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

  return { rows, boardQty, setBoardQty, ng, setNg, ngShown, setNgShown, loadError, save };
}

type State = ReturnType<typeof usePalletBoardsNg>;

const hint: React.CSSProperties = { marginTop: 5, fontSize: 11.5, color: 'var(--ink-4)' };
const linkBtn: React.CSSProperties = {
  background: 'none', border: 0, padding: 0, cursor: 'pointer', fontFamily: 'inherit',
  fontSize: 11.5, color: 'var(--accent-2)', fontWeight: 600,
};
const smallInput: React.CSSProperties = {
  width: 76, height: 28, textAlign: 'right', border: '1px solid var(--hair-strong)', borderRadius: 3,
  padding: '0 8px', fontSize: 12.5, background: 'var(--surface)', color: 'var(--ink)', fontFamily: 'inherit',
};
const chipLabel = (c: Chip) => [c.brand_name, c.chip_mpn].filter(Boolean).join(' · ') || `Chip #${c.id}`;

/** Board Qty: a plain input for a single-MPN pallet; the total (+ per-MPN inputs on demand) otherwise. */
export function BoardQtyField({ state }: { state: State }) {
  const { rows, boardQty, setBoardQty, loadError } = state;
  const [perMpn, setPerMpn] = useState(false);

  if (loadError) return <Field label="Board Qty"><Input value="" disabled placeholder="—" /></Field>;
  if (!rows) return <Field label="Board Qty"><Input value="" disabled placeholder="Loading…" /></Field>;
  if (rows.length === 0) {
    return (
      <Field label="Board Qty">
        <Input value="" disabled placeholder="—" />
        <div style={hint}>Add boards (MPNs) on the Boards tab.</div>
      </Field>
    );
  }
  if (rows.length === 1) {
    const pm = rows[0].pm;
    return (
      <Field label="Board Qty">
        <Input value={boardQty[pm.id] ?? ''} onChange={v => setBoardQty(s => ({ ...s, [pm.id]: v }))} placeholder="0" />
        <div style={hint}><span className="mono">{pm.mpn_name}</span></div>
      </Field>
    );
  }
  const total = rows.reduce((n, r) => n + num(boardQty[r.pm.id] ?? ''), 0);
  return (
    <Field label="Board Qty">
      <Input value={String(total)} disabled />
      <div style={hint}>
        Sum of {rows.length} boards ·{' '}
        <button type="button" style={linkBtn} onClick={() => setPerMpn(o => !o)}>{perMpn ? 'Hide' : 'Edit per MPN'}</button>
      </div>
      {perMpn && (
        <div style={{ marginTop: 6, border: '1px solid var(--hair)', borderRadius: 3 }}>
          {rows.map(({ pm }) => (
            <div key={pm.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderBottom: '1px solid var(--hair)' }}>
              <span className="mono" style={{ flex: 1, minWidth: 0, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pm.mpn_name}</span>
              <input type="text" inputMode="numeric" placeholder="0" value={boardQty[pm.id] ?? ''}
                onChange={e => { const v = e.target.value; setBoardQty(s => ({ ...s, [pm.id]: v })); }}
                style={smallInput} />
            </div>
          ))}
        </div>
      )}
    </Field>
  );
}

/** NG: the total as a field; only failed chips listed under it, more added from a picker. */
export function NgField({ state }: { state: State }) {
  const { rows, ng, setNg, ngShown, setNgShown, loadError } = state;
  const [pick, setPick] = useState('');

  if (loadError || !rows) return <Field label="NG"><Input value="" disabled placeholder={loadError ? '—' : 'Loading…'} /></Field>;
  const chips = rows.flatMap(r => r.chips);
  if (chips.length === 0) {
    return (
      <Field label="NG">
        <Input value="" disabled placeholder="—" />
        <div style={hint}>NG is entered per chip — add this pallet&apos;s boards first.</div>
      </Field>
    );
  }
  const byId = new Map(chips.map(c => [c.id, c]));
  const total = ngShown.reduce((n, id) => n + num(ng[id] ?? ''), 0);
  const addable = chips.filter(c => !ngShown.includes(c.id));
  const add = () => {
    const id = +pick;
    if (!id) return;
    setNgShown(s => [...s, id]);
    setPick('');
  };
  const remove = (id: number) => {
    setNg(s => ({ ...s, [id]: '' }));
    setNgShown(s => s.filter(x => x !== id));
  };

  return (
    <Field label="NG (failed chips)">
      <Input value={String(total)} disabled />
      {ngShown.length > 0 && (
        <div style={{ marginTop: 6, border: '1px solid var(--hair)', borderRadius: 3 }}>
          {ngShown.map(id => {
            const c = byId.get(id);
            if (!c) return null;
            return (
              <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderBottom: '1px solid var(--hair)' }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={chipLabel(c)}>
                  {chipLabel(c)}
                </span>
                <input type="text" inputMode="numeric" placeholder="0" value={ng[id] ?? ''} autoFocus={!c.qty && !ng[id]}
                  onChange={e => { const v = e.target.value; setNg(s => ({ ...s, [id]: v })); }}
                  style={smallInput} />
                <button type="button" onClick={() => remove(id)} title="Remove"
                  style={{ background: 'none', border: 0, cursor: 'pointer', color: 'var(--ink-4)', padding: 2, lineHeight: 0 }}>
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
                </button>
              </div>
            );
          })}
        </div>
      )}
      {addable.length > 0 && (
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <select value={pick} onChange={e => setPick(e.target.value)}
            style={{ flex: 1, minWidth: 0, height: 30, border: '1px solid var(--hair-strong)', borderRadius: 3, padding: '0 6px', fontSize: 12, background: 'var(--surface)', color: 'var(--ink)', fontFamily: 'inherit' }}>
            <option value="">+ Add a failed chip…</option>
            {rows.map(r => r.chips.some(c => !ngShown.includes(c.id)) && (
              <optgroup key={r.pm.id} label={r.pm.mpn_name}>
                {r.chips.filter(c => !ngShown.includes(c.id)).map(c => (
                  <option key={c.id} value={String(c.id)}>{chipLabel(c)}</option>
                ))}
              </optgroup>
            ))}
          </select>
          <Button size="sm" variant="outline" onClick={add} disabled={!pick}>Add</Button>
        </div>
      )}
    </Field>
  );
}
