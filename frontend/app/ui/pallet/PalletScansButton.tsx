'use client';
import React, { useState } from 'react';
import { useSession } from 'next-auth/react';
import { Modal, Badge, Button, useToast } from '@/app/ui/components';
import { apiErrorMessage } from '@/app/lib/api';
import { scanApi, type ChecklistScan } from '@/app/lib/checklistScanApi';
import ChecklistScanReview from './ChecklistScanReview';

/**
 * Camera icon on a pallet row (Pallets tab), shown when the pallet has checklist photos.
 * Opens that pallet's photos; each opens full size, or the review screen (review / view).
 * Admin / manager only, like the upload itself.
 */
export default function PalletScansButton({ soId, palletId, count, label, style, onApplied }: {
  soId: number; palletId: number; count?: number; label: string;
  style?: React.CSSProperties;
  /** A scan was confirmed from here — reload the order. */
  onApplied: () => void;
}) {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role ?? '';
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [scans, setScans] = useState<ChecklistScan[] | null>(null);
  const [reviewId, setReviewId] = useState<number | null>(null);

  if (!count || !(role === 'admin' || role === 'manager')) return null;

  const load = async () => {
    try {
      const all = await scanApi.list(soId, palletId);
      setScans(all.filter(s => s.pallet_id === palletId && s.status !== 'discarded'));
    } catch (e) {
      toast(apiErrorMessage(e) || 'Could not load the photos');
    }
  };

  const show = (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(true);
    setScans(null);
    load();
  };

  return (
    <>
      <button onClick={show} style={{ ...style, position: 'relative' }} title={`${count} checklist photo${count === 1 ? '' : 's'}`}>
        <CameraIcon />
        {count > 1 && (
          <span style={{
            position: 'absolute', top: 0, right: 0, background: 'var(--accent-2)', color: '#fff',
            fontSize: 9, fontWeight: 700, borderRadius: 6, padding: '0 3px', lineHeight: 1.5,
          }}>{count}</span>
        )}
      </button>

      {/* Stop clicks inside the modal from reaching the row (rows navigate on click). */}
      <span onClick={e => e.stopPropagation()}>
        <Modal open={open && reviewId == null} onClose={() => setOpen(false)} title={`Checklist photos · ${label}`} width={560}>
          {scans == null ? (
            <div style={{ fontSize: 13, color: 'var(--ink-4)', padding: 8 }}>Loading…</div>
          ) : scans.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--ink-4)', padding: 8 }}>No photos.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {scans.map(s => (
                <div key={s.id} style={{
                  display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
                  padding: 10, border: '1px solid var(--hair)', borderRadius: 4,
                }}>
                  {s.image_url && (
                    <a href={s.image_url} target="_blank" rel="noreferrer" title="Open full size" style={{ lineHeight: 0 }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={s.image_url} alt="" style={{ width: 72, height: 90, objectFit: 'cover', borderRadius: 3, border: '1px solid var(--hair)' }} />
                    </a>
                  )}
                  <div style={{ flex: '1 1 140px', minWidth: 0 }}>
                    <StatusBadge s={s} />
                    <div style={{ fontSize: 11.5, color: 'var(--ink-4)', marginTop: 4 }}>
                      #{s.id} · {new Date(s.created_at).toLocaleString()}
                    </div>
                  </div>
                  {(s.status === 'ready' || s.status === 'confirmed') && (
                    <Button variant={s.status === 'ready' ? 'primary' : 'outline'} style={{ height: 40 }}
                      onClick={() => setReviewId(s.id)}>
                      {s.status === 'ready' ? 'Review' : 'View'}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </Modal>

        {reviewId != null && (
          <ChecklistScanReview scanId={reviewId}
            onClose={() => { setReviewId(null); load(); }}
            onConfirmed={() => { setReviewId(null); setOpen(false); onApplied(); }} />
        )}
      </span>
    </>
  );
}

function StatusBadge({ s }: { s: ChecklistScan }) {
  if (s.status === 'processing') return <Badge tone={s.is_stale ? 'err' : 'blue'}>{s.is_stale ? 'Stuck' : 'Reading…'}</Badge>;
  if (s.status === 'ready') return <Badge tone="warn">To review</Badge>;
  if (s.status === 'failed') return <Badge tone="err">Failed</Badge>;
  return <Badge tone="ok">Confirmed</Badge>;
}

const CameraIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
);
