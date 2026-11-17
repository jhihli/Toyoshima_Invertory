'use client';
import React, { useEffect, useState } from 'react';
import { Badge } from '@/app/ui/components';
import type { ChecklistScan } from '@/app/lib/checklistScanApi';

/**
 * Progress of checklist photos being read by the office GPU server (image-analyzer).
 * Shared by the upload list (ChecklistScans) and a pallet's photo dialog (PalletScansButton),
 * on desktop and phone alike. Timing comes from the server's queue info when it has it.
 */

const DEFAULT_SECONDS_PER_IMAGE = 25;

/** Re-render every second while `active` (for the elapsed-time clocks). */
export function useTick(active: boolean) {
  const [, setN] = useState(0);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setN(n => n + 1), 1000);
    return () => clearInterval(t);
  }, [active]);
}

export const isReading = (s: ChecklistScan) => s.status === 'processing' && !s.is_stale;

function clock(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function about(sec: number) {
  if (sec < 60) return `~${Math.max(10, Math.round(sec / 5) * 5)}s`;
  return `~${Math.round(sec / 60)} min`;
}

function elapsed(s: ChecklistScan) {
  const since = s.processing_started_at || s.created_at;
  return (Date.now() - new Date(since).getTime()) / 1000;
}

export function StatusBadge({ s }: { s: ChecklistScan }) {
  if (s.status === 'processing') {
    if (s.is_stale) return <Badge tone="err">Stuck</Badge>;
    if (s.queue?.status === 'waiting') return <Badge tone="warn">Waiting</Badge>;
    if (s.queue && s.queue.position > 1) return <Badge tone="blue">In line</Badge>;
    return <Badge tone="blue">Reading…</Badge>;
  }
  if (s.status === 'ready') return <Badge tone="warn">To review</Badge>;
  if (s.status === 'failed') return <Badge tone="err">Failed</Badge>;
  if (s.status === 'confirmed') return <Badge tone="ok">Confirmed</Badge>;
  return <Badge>Discarded</Badge>;
}

/** One line under a scan being read: elapsed time, place in line, estimate. */
export function ReadingLine({ s }: { s: ChecklistScan }) {
  if (s.status !== 'processing') return null;
  if (s.is_stale) {
    return <span style={{ color: 'var(--err)' }}>Not finished after 35 min — the office reader may be off. Retry it.</span>;
  }
  const q = s.queue;
  const spi = q?.seconds_per_image || DEFAULT_SECONDS_PER_IMAGE;
  const t = clock(elapsed(s));
  let detail: string;
  if (q?.status === 'waiting') {
    detail = /training/i.test(q.wait_reason || '')
      ? 'GPU busy (training) — waiting in line, starts automatically'
      : 'Reader temporarily unavailable — retrying automatically';
  } else if (q && q.position > 1) {
    detail = `#${q.position} in line · ready in ${about((q.images_ahead + 1) * spi)}`;
  } else if (q) {
    detail = `being read now · usually ${spi}s (the first photo after a break ~1 min)`;
  } else {
    detail = elapsed(s) < 20 ? 'sending to the reader…' : 'reading…';
  }
  return <span>{t} · {detail}</span>;
}

/** Bar above the list: upload progress, then reading progress of the open scans. */
export function ReadingProgress({ scans, upload }: {
  scans: ChecklistScan[];
  upload: { done: number; total: number } | null;
}) {
  const open = scans.filter(s => s.status !== 'confirmed' && s.status !== 'discarded');
  const reading = open.filter(isReading);
  if (!upload && reading.length === 0) return null;

  let label: string, done: number, total: number;
  if (upload) {
    ({ done, total } = upload);
    label = `Uploading ${Math.min(done + 1, total)} / ${total}…`;
  } else {
    total = open.length;
    done = total - reading.length;
    const spi = reading.find(s => s.queue)?.queue?.seconds_per_image || DEFAULT_SECONDS_PER_IMAGE;
    const left = Math.max(...reading.map(s => (s.queue ? s.queue.images_ahead + 1 : 1)));
    label = `Read ${done} / ${total} · about ${about(left * spi)} left`;
  }
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div style={{ marginTop: 10 }} aria-live="polite">
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '2px 8px', fontSize: 12, color: 'var(--ink-3)', marginBottom: 4 }}>
        <span>{label}</span>
        {!upload && <span style={{ color: 'var(--ink-4)' }}>You can leave this page — reading continues.</span>}
      </div>
      <div style={{ height: 6, borderRadius: 3, background: 'var(--hair)', overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${Math.max(pct, 4)}%`, background: 'var(--accent-2)',
          transition: 'width .4s ease',
        }} />
      </div>
    </div>
  );
}
