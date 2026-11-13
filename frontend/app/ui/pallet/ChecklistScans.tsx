'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Button, Badge, useToast } from '@/app/ui/components';
import { apiErrorMessage } from '@/app/lib/api';
import { scanApi, type ChecklistScan } from '@/app/lib/checklistScanApi';
import ChecklistScanReview from './ChecklistScanReview';
import type { Pallet } from '@/interface/IDatatable';

/**
 * "上传清单 / Upload checklist" on an MSFT order's Pallets tab: photograph the handwritten
 * 清單 sheets, upload several at once, and each becomes a scan the server reads in the
 * background. A ready scan opens the review screen; nothing changes on the pallet until
 * the owner confirms there. Admin / manager only (the endpoints enforce it too).
 */
export default function ChecklistScans({ soId, pallets, onApplied }: {
  soId: number;
  pallets: Pallet[];
  /** A scan was confirmed — reload the order so the pallets table shows the new data. */
  onApplied: () => void;
}) {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role ?? '';
  const allowed = role === 'admin' || role === 'manager';
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [scans, setScans] = useState<ChecklistScan[]>([]);
  const [uploading, setUploading] = useState(false);
  const [reviewId, setReviewId] = useState<number | null>(null);
  const [showDone, setShowDone] = useState(false);

  const load = useCallback(async () => {
    try { setScans(await scanApi.list(soId)); } catch { /* the list is a convenience; keep the last one */ }
  }, [soId]);

  useEffect(() => { if (allowed) load(); }, [allowed, load]);

  // Poll while any photo is still being read.
  const reading = scans.some(s => s.status === 'processing' && !s.is_stale);
  useEffect(() => {
    if (!reading) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [reading, load]);

  if (!allowed) return null;

  const upload = async (list: FileList | null) => {
    const files = Array.from(list ?? []);
    if (!files.length) return;
    setUploading(true);
    try {
      const made = await scanApi.upload(soId, files);
      toast(`${made.length} photo${made.length === 1 ? '' : 's'} uploaded — reading…`);
      await load();
    } catch (e) {
      toast(apiErrorMessage(e) || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); toast(ok); await load(); } catch (e) { toast(apiErrorMessage(e) || 'Failed'); }
  };

  const palletLabel = (s: ChecklistScan) => {
    if (s.pallet_label) return s.pallet_label;
    const p = pallets.find(x => x.id === s.pallet_id);
    return p ? (p.licence_number || `Pallet #${p.pallet_seq}`) : '';
  };

  const open = scans.filter(s => s.status !== 'confirmed' && s.status !== 'discarded');
  const done = scans.filter(s => s.status === 'confirmed' || s.status === 'discarded');
  const shown = showDone ? [...open, ...done] : open;

  return (
    <div style={{ marginBottom: 12 }}>
      <input ref={inputRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
        onChange={e => { upload(e.target.files); e.target.value = ''; }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Button variant="outline" icon={<CameraIcon />} onClick={() => inputRef.current?.click()}
          disabled={uploading} style={{ height: 40, fontSize: 13.5 }}>
          {uploading ? 'Uploading…' : '上传清单 / Upload checklist'}
        </Button>
        <span style={{ fontSize: 11.5, color: 'var(--ink-4)', lineHeight: 1.4, flex: '1 1 200px' }}>
          Photograph the filled-in 清單 sheets (several at once is fine). Nothing changes until you review and confirm.
        </span>
        {done.length > 0 && (
          <button onClick={() => setShowDone(v => !v)} style={linkBtn}>
            {showDone ? 'Hide' : 'Show'} {done.length} finished
          </button>
        )}
      </div>

      {shown.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
          {shown.map(s => (
            <div key={s.id} style={{
              display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
              padding: '8px 10px', border: '1px solid var(--hair)', borderRadius: 4, background: 'var(--surface)',
            }}>
              {s.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.image_url} alt="" style={{ width: 40, height: 48, objectFit: 'cover', borderRadius: 3, border: '1px solid var(--hair)' }} />
              )}
              <div style={{ minWidth: 0, flex: '1 1 160px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <StatusBadge s={s} />
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{palletLabel(s) || (s.status === 'processing' ? 'Reading the sheet…' : 'Pallet not identified')}</span>
                </div>
                <div style={{ fontSize: 11, color: s.status === 'failed' ? 'var(--err)' : 'var(--ink-4)', marginTop: 2 }}>
                  {s.status === 'failed' ? s.error
                    : s.is_stale ? 'The read was interrupted (server restart?). Retry it.'
                    : `#${s.id} · ${new Date(s.created_at).toLocaleString()}${s.cost_usd ? ` · $${Number(s.cost_usd).toFixed(2)}` : ''}`}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {s.status === 'ready' && (
                  <Button variant="primary" onClick={() => setReviewId(s.id)} style={{ height: 40 }}>Review</Button>
                )}
                {s.status === 'confirmed' && (
                  <Button variant="outline" onClick={() => setReviewId(s.id)} style={{ height: 40 }}>View</Button>
                )}
                {(s.status === 'failed' || s.is_stale) && (
                  <Button variant="outline" onClick={() => act(() => scanApi.retry(s.id), 'Reading again…')} style={{ height: 40 }}>Retry</Button>
                )}
                {(s.status === 'ready' || s.status === 'failed' || s.is_stale) && (
                  <Button variant="ghost" onClick={() => act(() => scanApi.discard(s.id), 'Discarded')} style={{ height: 40 }}>Discard</Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {reviewId != null && (
        <ChecklistScanReview scanId={reviewId} onClose={() => { setReviewId(null); load(); }}
          onConfirmed={() => { setReviewId(null); load(); onApplied(); }} />
      )}
    </div>
  );
}

function StatusBadge({ s }: { s: ChecklistScan }) {
  if (s.status === 'processing') return <Badge tone={s.is_stale ? 'err' : 'blue'}>{s.is_stale ? 'Stuck' : 'Reading…'}</Badge>;
  if (s.status === 'ready') return <Badge tone="warn">To review</Badge>;
  if (s.status === 'failed') return <Badge tone="err">Failed</Badge>;
  if (s.status === 'confirmed') return <Badge tone="ok">Confirmed</Badge>;
  return <Badge>Discarded</Badge>;
}

const linkBtn: React.CSSProperties = {
  background: 'none', border: 0, padding: '8px 4px', color: 'var(--accent-2)', fontSize: 12,
  cursor: 'pointer', fontFamily: 'inherit',
};

const CameraIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
);
