'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/app/lib/api';
import type { Pallet } from '@/interface/IDatatable';

// ── Icons ──────────────────────────────────────────────────────────────────────
const IChevR = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>;
const IBack = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>;
const IImage = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>;
const IPackage = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>;

// ── Shared styles ──────────────────────────────────────────────────────────────
const BtnGhost: React.CSSProperties = { height: 38, padding: '0 14px', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7, border: '1px solid var(--hair-strong)', background: 'var(--surface)', color: 'var(--ink-2)', whiteSpace: 'nowrap', fontFamily: 'inherit' };
const Th: React.CSSProperties = { textAlign: 'left', padding: '13px 18px', fontWeight: 600, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-3)', borderBottom: '1px solid var(--hair)', whiteSpace: 'nowrap' };
const Td: React.CSSProperties = { padding: '13px 18px', borderBottom: '1px solid var(--surface-2)', verticalAlign: 'middle', fontSize: 14 };

// ── Main Page ───────────────────────────────────────────────────────────────────
export default function CargoPage() {
  const { id, palletId } = useParams<{ id: string; palletId: string }>();
  const soId = Number(id);
  const pId = Number(palletId);
  const router = useRouter();

  const [pallet, setPallet] = useState<Pallet | null>(null);
  const [soNumber, setSoNumber] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const soData = await api.sos.get(soId);
      setSoNumber(soData.so_number);
      const found = soData.pallets?.find((p: Pallet) => p.id === pId);
      setPallet(found || null);
    } catch { /* silently handled */ }
    setLoading(false);
  }, [soId, pId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div style={{ padding: 40, color: 'var(--ink-4)' }}>Loading…</div>;
  if (!pallet) return <div style={{ padding: 40, color: '#b91c1c' }}>Pallet not found.</div>;

  const inWt = pallet.in_weight_gross ? Number(pallet.in_weight_gross).toFixed(2) : '—';

  return (
    <div style={{ padding: '22px 28px 40px' }}>

      {/* Breadcrumb */}
      <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
        <span style={{ cursor: 'pointer' }} onClick={() => router.push('/dashboard')}>Home</span>
        <IChevR />
        <span style={{ cursor: 'pointer' }} onClick={() => router.push('/sales-orders')}>Sales Orders</span>
        <IChevR />
        <span className="mono" style={{ cursor: 'pointer', color: 'var(--ink-2)' }} onClick={() => router.push(`/sales-orders/${soId}`)}>{soNumber}</span>
        <IChevR />
        <b style={{ color: 'var(--ink-2)', fontWeight: 600 }} className="mono">{pallet.licence_number || `Pallet #${pallet.pallet_seq}`}</b>
      </div>

      {/* Hero card */}
      <div style={{ display: 'flex', background: 'var(--surface)', border: '1px solid var(--hair)', borderRadius: 14, overflow: 'hidden', marginBottom: 20 }}>
        {/* Green accent bar */}
        <div style={{ width: 6, flexShrink: 0, background: 'linear-gradient(180deg, #2f7d50, #256b43)' }} />
        {/* Body */}
        <div style={{ flex: 1, minWidth: 0, padding: '18px 22px', display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-4)', marginBottom: 4 }}>Pallet</div>
            <div className="mono" style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--ink)' }}>
              {pallet.licence_number || `#${pallet.pallet_seq}`}
            </div>
            <div style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 2 }}>{soNumber}</div>
          </div>
          {/* Facts */}
          <div style={{ marginLeft: 'auto', display: 'grid', gridTemplateColumns: 'repeat(5, auto)', gap: '6px 24px', textAlign: 'right' }}>
            {[
              ['Material', pallet.material_type || '—'],
              ['Location', '—'],
              ['Gateload', pallet.gateload_number || '—'],
              ['Cargo Items', String(pallet.board_qty ?? 0)],
              ['In Wt Gross', inWt !== '—' ? `${inWt} lb` : '—'],
            ].map(([label, val], i) => (
              <div key={i}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-4)', marginBottom: 3 }}>{label}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{val}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Cargo card */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--hair)', borderRadius: 12, overflow: 'hidden' }}>

        {/* Card header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '14px 18px', borderBottom: '1px solid var(--hair)' }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Cargo Items</h2>
          <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: 'var(--accent-light)', color: 'var(--accent-2)' }}>{pallet.board_qty ?? 0}</span>
        </div>

        {/* Cargo table (placeholder — boards linked to pallets via Board.pallet FK) */}
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={Th}>Image</th>
              <th style={Th}>Barcode</th>
              <th style={Th}>Date</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={3}>
                <div style={{ padding: '52px 20px', textAlign: 'center' }}>
                  <div style={{ width: 60, height: 60, borderRadius: 16, background: 'var(--surface-2)', border: '1px solid var(--hair)', display: 'grid', placeItems: 'center', color: 'var(--ink-4)', margin: '0 auto 14px' }}>
                    <IPackage />
                  </div>
                  <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700, color: 'var(--ink-2)' }}>No cargo items yet</h3>
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-4)', lineHeight: 1.6, maxWidth: 300, marginLeft: 'auto', marginRight: 'auto' }}>
                    Cargo items (boards) scanned to this pallet will appear here once the scanner integration is connected to this view.
                  </p>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Back link */}
      <button onClick={() => router.push(`/sales-orders/${soId}`)} style={{ ...BtnGhost, marginTop: 18 }}>
        <IBack /> Back to {soNumber}
      </button>
    </div>
  );
}
