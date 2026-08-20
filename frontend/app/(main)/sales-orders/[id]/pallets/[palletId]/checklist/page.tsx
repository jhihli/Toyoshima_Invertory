'use client';
import React, { useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useIsMobile } from '@/app/ui/hooks/useIsMobile';
import ChecklistCard from '../ChecklistCard';
import { usePalletContext } from '../usePalletContext';
import { IBack, BtnGhost, Toast } from '../parts';

/** The 清單 for one pallet, on its own route so the breadcrumb reads
 *  Home > Sales Orders > SO123 > tgt1 > Checklist. */
export default function ChecklistPage() {
  const { id, palletId } = useParams<{ id: string; palletId: string }>();
  const soId = Number(id);
  const pId = Number(palletId);
  const router = useRouter();
  const isMobile = useIsMobile();

  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);
  const showToast = useCallback((msg: string, type: 'ok' | 'err' = 'ok') => setToast({ msg, type }), []);

  const { pallet, soNumber, palletLabel, palletBarcode, loading, error } = usePalletContext(soId, pId);

  if (loading) return <div style={{ padding: 40, color: 'var(--ink-4)' }}>Loading…</div>;
  if (error) return <div style={{ padding: 40, color: '#b91c1c' }}>Couldn&apos;t load this pallet.</div>;
  if (!pallet) return <div style={{ padding: 40, color: '#b91c1c' }}>Pallet not found.</div>;

  return (
    <div style={{ padding: isMobile ? '12px 12px 40px' : '22px 28px 40px' }}>
      <ChecklistCard palletId={pId} soNumber={soNumber} palletLabel={palletLabel}
        palletBarcode={palletBarcode} isMobile={isMobile} showToast={showToast} />

      <button onClick={() => router.push(`/sales-orders/${soId}/pallets/${pId}`)} style={{ ...BtnGhost, marginTop: 18 }}>
        <IBack /> Back to {palletLabel}
      </button>

      {toast && <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  );
}
