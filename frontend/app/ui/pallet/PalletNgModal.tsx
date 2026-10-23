'use client';
import React, { useState, useEffect } from 'react';
import { api } from '@/app/lib/api';
import type { PalletNgGroup } from '@/interface/IDatatable';
import { Modal, Button, Empty } from '@/app/ui/components';

/** Failed (NG) chip counts for one pallet, per chip of its boards — read only.
 *
 *  NG is entered on the pallet's checklist lines now (flag a line as NG on the Checklist
 *  page); this view just reports the resulting per-chip totals, which feed the Inventory
 *  sheet's failure-rate formulas. `onSaved` is accepted for call-site compatibility but
 *  nothing here writes. */
export default function PalletNgModal({ pallet, onClose }: {
  pallet: { id: number; label: string } | null;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [groups, setGroups] = useState<PalletNgGroup[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!pallet) return;
    let cancelled = false;
    setGroups(null); setError('');
    api.pallets.ng.get(pallet.id)
      .then(g => { if (!cancelled) setGroups(g); })
      .catch(() => { if (!cancelled) setError('Failed to load chips'); });
    return () => { cancelled = true; };
  }, [pallet]);

  const total = (groups ?? []).reduce((n, g) => n + g.chips.reduce((m, c) => m + (c.qty || 0), 0), 0);
  const hasChips = !!groups && groups.some(g => g.chips.length);

  return (
    <Modal open={!!pallet} onClose={onClose} width={520}
      title={<span>NG · <span className="mono">{pallet?.label}</span>
        <span style={{ fontWeight: 400, color: 'var(--ink-3)', fontSize: 13 }}> · {total} failed</span></span>}
      footer={<Button variant="ghost" onClick={onClose}>Close</Button>}>
      {error && <div style={{ marginBottom: 10, color: 'var(--err)', fontSize: 12.5 }}>{error}</div>}
      {!groups && !error && <div style={{ color: 'var(--ink-4)', fontSize: 13 }}>Loading…</div>}
      {groups && !hasChips && (
        <Empty label="No chips on this pallet yet" sub="Add its boards (MPNs) on the Boards tab first." />
      )}
      {groups && hasChips && (
        <>
          <div style={{ marginBottom: 10, fontSize: 12, color: 'var(--ink-4)' }}>
            NG is set per checklist line — flag a line as NG on the Checklist page. These are the per-chip totals.
          </div>
          <div style={{ border: '1px solid var(--hair)', borderRadius: 3, maxHeight: '55vh', overflowY: 'auto' }}>
            {groups.map(g => (
              <div key={g.mpn_id}>
                <div className="mono" style={{ padding: '7px 12px', fontSize: 11.5, fontWeight: 600, color: 'var(--ink-3)', background: 'var(--surface-2)', borderBottom: '1px solid var(--hair)' }}>
                  {g.mpn_name}
                </div>
                {g.chips.map(c => (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px', borderBottom: '1px solid var(--hair)' }}>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13 }}>
                      {c.brand_name && <span style={{ color: 'var(--ink-3)' }}>{c.brand_name} · </span>}
                      <span className="mono">{c.chip_mpn || `Chip #${c.id}`}</span>
                    </span>
                    <span className="num" style={{ fontSize: 12.5, fontVariantNumeric: 'tabular-nums', color: c.qty ? 'var(--err)' : 'var(--ink-5)' }}>
                      {c.qty || 0}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}
