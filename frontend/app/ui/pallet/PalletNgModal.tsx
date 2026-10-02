'use client';
import React, { useState, useEffect } from 'react';
import { api, apiErrorMessage } from '@/app/lib/api';
import type { PalletNgGroup } from '@/interface/IDatatable';
import { Modal, Button, Empty } from '@/app/ui/components';

/** Failed (NG) chip counts for one pallet, per chip of its boards. Exported to the
 *  Inventory sheet as Container UID "NG" rows, which drive the failure-rate formulas. */
export default function PalletNgModal({ pallet, onClose, onSaved }: {
  pallet: { id: number; label: string } | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [groups, setGroups] = useState<PalletNgGroup[] | null>(null);
  const [values, setValues] = useState<Record<number, string>>({});   // chip id → typed qty
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!pallet) return;
    let cancelled = false;
    setGroups(null); setError('');
    api.pallets.ng.get(pallet.id)
      .then(g => {
        if (cancelled) return;
        setGroups(g);
        const v: Record<number, string> = {};
        for (const grp of g) for (const c of grp.chips) v[c.id] = c.qty ? String(c.qty) : '';
        setValues(v);
      })
      .catch(() => { if (!cancelled) setError('Failed to load chips'); });
    return () => { cancelled = true; };
  }, [pallet]);

  const total = Object.values(values).reduce((n, v) => n + (/^\d+$/.test(v.trim()) ? +v.trim() : 0), 0);

  const save = async () => {
    if (!pallet || !groups) return;
    const items: { chip: number; qty: number | null }[] = [];
    for (const [id, raw] of Object.entries(values)) {
      const t = raw.trim();
      if (t && !/^\d+$/.test(t)) { setError('NG qty must be a whole number, 0 or more'); return; }
      items.push({ chip: +id, qty: t ? +t : null });
    }
    setSaving(true); setError('');
    try {
      await api.pallets.ng.save(pallet.id, items);
      onSaved();
      onClose();
    } catch (e) { setError(apiErrorMessage(e) || 'Failed to save NG'); }
    finally { setSaving(false); }
  };

  const hasChips = !!groups && groups.some(g => g.chips.length);

  return (
    <Modal open={!!pallet} onClose={onClose} width={520}
      title={<span>NG · <span className="mono">{pallet?.label}</span>
        <span style={{ fontWeight: 400, color: 'var(--ink-3)', fontSize: 13 }}> · {total} failed</span></span>}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={save} disabled={saving || !hasChips}>{saving ? 'Saving…' : 'Save'}</Button>
      </>}>
      {error && <div style={{ marginBottom: 10, color: 'var(--err)', fontSize: 12.5 }}>{error}</div>}
      {!groups && !error && <div style={{ color: 'var(--ink-4)', fontSize: 13 }}>Loading…</div>}
      {groups && !hasChips && (
        <Empty label="No chips on this pallet yet" sub="Add its boards (MPNs) on the Boards tab first." />
      )}
      {groups && hasChips && (
        <div style={{ maxHeight: '55vh', overflowY: 'auto', border: '1px solid var(--hair)', borderRadius: 3 }}>
          {groups.map(g => (
            <div key={g.mpn_id}>
              <div className="mono" style={{ padding: '7px 12px', fontSize: 11.5, fontWeight: 600, color: 'var(--ink-3)', background: 'var(--surface-2)', borderBottom: '1px solid var(--hair)' }}>
                {g.mpn_name}
              </div>
              {g.chips.map(c => (
                <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px', borderBottom: '1px solid var(--hair)', cursor: 'text' }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13 }}>
                    {c.brand_name && <span style={{ color: 'var(--ink-3)' }}>{c.brand_name} · </span>}
                    <span className="mono">{c.chip_mpn || `Chip #${c.id}`}</span>
                  </span>
                  <input type="text" inputMode="numeric" placeholder="0" value={values[c.id] ?? ''}
                    onChange={e => { const v = e.target.value; setValues(s => ({ ...s, [c.id]: v })); }}
                    style={{ width: 84, height: 28, textAlign: 'right', border: '1px solid var(--hair-strong)', borderRadius: 3,
                      padding: '0 8px', fontSize: 12.5, background: 'var(--surface)', color: 'var(--ink)', fontFamily: 'inherit' }} />
                </label>
              ))}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
