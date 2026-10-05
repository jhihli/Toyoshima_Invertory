'use client';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/app/lib/api';
import type { MpnBoardsBySo } from '@/interface/IDatatable';
import { Modal, Button, Empty, thS, tdS } from '@/app/ui/components';

/** Opened from an MPN's BOARDS count: how many of its boards sit in each SO.
 *  A row opens that SO's Boards tab on the first pallet holding this MPN. */
export default function BoardsBySoModal({ mpn, highlightSoId, onClose }: {
  mpn: { id: number; name: string } | null;
  /** The SO picked in "Count by SO…", if any — its row is highlighted. */
  highlightSoId?: number | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [data, setData] = useState<MpnBoardsBySo | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!mpn) return;
    let cancelled = false;
    setData(null); setError('');
    api.mpns.boardsBySo(mpn.id)
      .then(d => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setError('Failed to load boards by SO'); });
    return () => { cancelled = true; };
  }, [mpn]);

  const open = (so: MpnBoardsBySo['sos'][number]) => {
    const pallet = so.first_pallet_id ? `&pallet=${so.first_pallet_id}` : '';
    router.push(`/sos/${so.so_id}?tab=boards${pallet}`);
  };

  return (
    <Modal open={!!mpn} onClose={onClose} width={640}
      title={<span>
        <span className="mono">{mpn?.name}</span>
        {data && <span style={{ fontWeight: 400, color: 'var(--ink-3)', fontSize: 13 }}>
          {' '}· {data.total} board{data.total === 1 ? '' : 's'} in {data.sos.length} SO{data.sos.length === 1 ? '' : 's'}
        </span>}
      </span>}
      footer={<Button variant="ghost" onClick={onClose}>Close</Button>}>
      {error && <div style={{ color: 'var(--err)', fontSize: 13 }}>{error}</div>}
      {!error && !data && <div style={{ color: 'var(--ink-4)', fontSize: 13 }}>Loading…</div>}
      {data && data.sos.length === 0 && <Empty label="Not on any pallet yet" sub="Assign it on an MSFT order's Boards tab." />}
      {data && data.sos.length > 0 && (
        <div style={{ overflowX: 'auto', maxHeight: '55vh', overflowY: 'auto', border: '1px solid var(--hair)', borderRadius: 3 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--hair)' }}>
                <th style={thS}>SO number</th>
                <th style={thS}>Vendor</th>
                <th style={thS}>Inbound</th>
                <th style={{ ...thS, textAlign: 'right' }}>Pallets</th>
                <th style={{ ...thS, textAlign: 'right' }}>Boards</th>
              </tr>
            </thead>
            <tbody>
              {data.sos.map(so => (
                <tr key={so.so_id} onClick={() => open(so)} title="Open this SO's Boards tab"
                  className="bbs-row"
                  style={{ borderBottom: '1px solid var(--hair)', cursor: 'pointer',
                    background: so.so_id === highlightSoId ? 'var(--accent-light)' : undefined }}>
                  <td style={{ ...tdS, color: 'var(--accent-2)', fontWeight: 600 }} className="mono">{so.so_number}</td>
                  <td style={{ ...tdS, color: 'var(--ink-3)' }}>{so.vendor_name || '—'}</td>
                  <td style={{ ...tdS, color: 'var(--ink-3)' }} className="num">{so.inbound_date || '—'}</td>
                  <td style={{ ...tdS, textAlign: 'right' }} className="num">{so.pallet_count}</td>
                  <td style={{ ...tdS, textAlign: 'right', fontWeight: 600 }} className="num">{so.board_qty}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <style>{`.bbs-row:hover{background:var(--accent-light)}`}</style>
        </div>
      )}
    </Modal>
  );
}
