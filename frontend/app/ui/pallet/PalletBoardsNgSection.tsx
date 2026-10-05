'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { api, apiErrorMessage } from '@/app/lib/api';
import type { PalletMPN, PalletNgGroup } from '@/interface/IDatatable';

/** "Boards & NG" block of the Edit pallet dialog: board qty per MPN and NG per chip.
 *
 *  The pallet's Board Qty and NG are sums of these (Pallet.effective_board_qty / ng_qty),
 *  so they are edited at that level. Adding or removing an MPN stays on the Boards tab.
 *  The dialog calls `save()` from the hook before saving the pallet itself. */

const WHOLE = /^\d+$/;

interface Row { pm: PalletMPN; chips: PalletNgGroup['chips'] }

export function usePalletBoardsNg(palletId: number, open: boolean) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [boardQty, setBoardQty] = useState<Record<number, string>>({});   // PalletMPN id → text
  const [ng, setNg] = useState<Record<number, string>>({});               // chip id → text
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
        setNg(Object.fromEntries(groups.flatMap(g => g.chips.map(c => [c.id, c.qty ? String(c.qty) : '']))));
      })
      .catch(() => { if (!cancelled) setLoadError('Failed to load boards & NG'); });
    return () => { cancelled = true; };
  }, [palletId, open]);

  /** Saves only what changed. Returns an error message, or '' on success. */
  const save = useCallback(async (): Promise<string> => {
    if (!rows) return '';
    for (const v of [...Object.values(boardQty), ...Object.values(ng)]) {
      if (v.trim() && !WHOLE.test(v.trim())) return 'Board qty and NG must be whole numbers, 0 or more';
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
      return apiErrorMessage(e) || 'Failed to save boards & NG';
    }
  }, [rows, boardQty, ng, palletId]);

  return { rows, boardQty, setBoardQty, ng, setNg, loadError, save };
}

const num = (v: string) => (WHOLE.test(v.trim()) ? +v.trim() : 0);

const inputSty: React.CSSProperties = {
  width: 76, height: 28, textAlign: 'right', border: '1px solid var(--hair-strong)', borderRadius: 3,
  padding: '0 8px', fontSize: 12.5, background: 'var(--surface)', color: 'var(--ink)', fontFamily: 'inherit',
};

export default function PalletBoardsNgSection({ state, listMaxHeight = 280, flush = false }: {
  state: ReturnType<typeof usePalletBoardsNg>;
  /** Height cap of the MPN/chip list before it scrolls. */
  listMaxHeight?: number | string;
  /** No top margin (when the block heads its own column). */
  flush?: boolean;
}) {
  const { rows, boardQty, setBoardQty, ng, setNg, loadError } = state;
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});
  const totalBoards = Object.values(boardQty).reduce((n, v) => n + num(v), 0);
  const totalNg = Object.values(ng).reduce((n, v) => n + num(v), 0);

  return (
    <div style={{ marginTop: flush ? 0 : 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-4)' }}>
          Boards &amp; NG
        </span>
        {rows && rows.length > 0 && (
          <span className="num" style={{ fontSize: 12, color: 'var(--ink-3)' }}>
            Boards {totalBoards} · NG <span style={{ color: totalNg ? 'var(--err)' : undefined }}>{totalNg}</span>
          </span>
        )}
      </div>
      {loadError && <div style={{ color: 'var(--err)', fontSize: 12.5 }}>{loadError}</div>}
      {!rows && !loadError && <div style={{ color: 'var(--ink-4)', fontSize: 12.5 }}>Loading…</div>}
      {rows && rows.length === 0 && (
        <div style={{ fontSize: 12.5, color: 'var(--ink-4)', padding: '10px 12px', border: '1px dashed var(--hair-strong)', borderRadius: 3 }}>
          No boards on this pallet yet — add MPNs on the Boards tab.
        </div>
      )}
      {rows && rows.length > 0 && (
        <div style={{ border: '1px solid var(--hair)', borderRadius: 3, maxHeight: listMaxHeight, overflowY: 'auto' }}>
          {rows.map(({ pm, chips }) => {
            const open = !collapsed[pm.id];
            return (
              <div key={pm.id} style={{ borderBottom: '1px solid var(--hair)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--surface-2)' }}>
                  <button type="button" onClick={() => setCollapsed(c => ({ ...c, [pm.id]: open }))}
                    title={open ? 'Hide chips' : 'Show chips'}
                    style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', color: 'var(--ink-3)', width: 14, fontSize: 11 }}>
                    {open ? '▾' : '▸'}
                  </button>
                  <span className="mono" style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {pm.mpn_name}
                  </span>
                  <span style={{ fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-4)' }}>Board qty</span>
                  <input type="text" inputMode="numeric" placeholder="—" value={boardQty[pm.id] ?? ''}
                    onChange={e => { const v = e.target.value; setBoardQty(s => ({ ...s, [pm.id]: v })); }}
                    style={inputSty} />
                </div>
                {open && chips.map(c => (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 10px 3px 32px', borderTop: '1px solid var(--hair)' }}>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.brand_name && <span style={{ color: 'var(--ink-3)' }}>{c.brand_name} · </span>}
                      <span className="mono">{c.chip_mpn || `Chip #${c.id}`}</span>
                    </span>
                    <span style={{ fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-4)' }}>NG</span>
                    <input type="text" inputMode="numeric" placeholder="0" value={ng[c.id] ?? ''}
                      onChange={e => { const v = e.target.value; setNg(s => ({ ...s, [c.id]: v })); }}
                      style={inputSty} />
                  </div>
                ))}
                {open && chips.length === 0 && (
                  <div style={{ padding: '5px 10px 5px 32px', fontSize: 12, color: 'var(--ink-4)', borderTop: '1px solid var(--hair)' }}>
                    No chips defined for this MPN.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
