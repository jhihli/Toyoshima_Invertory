'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import {
  Button, Breadcrumbs, useToast, thS, tdS, Empty,
} from '@/app/ui/components';
import { api } from '@/app/lib/api';
import type { MPN, Chip, PalletChipContainer } from '@/interface/IDatatable';
import { useIsMobile } from '@/app/ui/hooks/useIsMobile';

export default function SOContextMPNDetailPage() {
  const router = useRouter();
  const { id: soId, mpnId } = useParams<{ id: string; mpnId: string }>();
  const searchParams = useSearchParams();
  const soNumber = searchParams.get('so') || soId;
  const palletLabel = searchParams.get('palletLabel') || '';
  const palletId = searchParams.get('palletId') ? Number(searchParams.get('palletId')) : null;
  const mpnIdNum = Number(mpnId);
  const toast = useToast();
  const isMobile = useIsMobile();

  const [mpn, setMpn] = useState<MPN | null>(null);
  const [containers, setContainers] = useState<Map<number, PalletChipContainer>>(new Map());
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState<{ src: string; title: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const [m, ctrs] = await Promise.all([
        api.mpns.get(mpnIdNum),
        palletId != null ? api.pallets.chipContainers.list(palletId, mpnIdNum) : Promise.resolve([] as PalletChipContainer[]),
      ]);
      setMpn(m);
      const map = new Map<number, PalletChipContainer>();
      for (const c of ctrs) map.set(c.chip, c);
      setContainers(map);
    } catch { toast('Failed to load MPN'); }
    finally { setLoading(false); }
  }, [mpnIdNum, palletId]);

  useEffect(() => { load(); }, [load]);

  if (loading || !mpn) {
    return <div className="page-pad" style={{ color: 'var(--ink-3)', fontSize: 13 }}>Loading…</div>;
  }

  const chips = mpn.chips ?? [];
  const totalActual = chips.reduce((s, c) => {
    const ctr = containers.get(c.id);
    return s + (ctr?.actual_qty ?? c.qty);
  }, 0);

  const handleSaveContainer = async (chipId: number, uid: string, qty: number | null) => {
    if (palletId == null) return;
    try {
      const updated = await api.pallets.chipContainers.upsert(palletId, chipId, uid, qty);
      setContainers(prev => new Map(prev).set(chipId, updated));
    } catch { toast('Failed to save'); }
  };

  const subtitle = [mpn.part_type || null, palletLabel || soNumber, `Created ${mpn.created_at?.slice(0, 10) || '—'}`].filter(Boolean).join(' · ');

  return (
    <div className="fade-in page-pad">
      <Breadcrumbs items={[
        { label: 'Home', onClick: () => router.push('/dashboard') },
        { label: 'Sales Orders', onClick: () => router.push('/sos') },
        { label: soNumber, onClick: () => router.push(`/sos/${soId}`) },
        ...(palletLabel ? [{ label: palletLabel, onClick: () => router.push(`/sos/${soId}`) }] : []),
        { label: mpn.name },
      ]} />

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', margin: '8px 0 16px', gap: 10 }}>
        <div>
          <h1 className="mono" style={{ margin: 0, fontSize: 20, fontWeight: 400, letterSpacing: '-0.01em' }}>{mpn.name}</h1>
          <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 3 }}>{subtitle}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* Left: Photos */}
        <div style={{ width: isMobile ? '100%' : 280, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <PhotoCard
            label="Before Cut Photo"
            photoUrl={mpn.beforecut_photo_url}
            onView={() => mpn.beforecut_photo_url && setLightbox({ src: mpn.beforecut_photo_url, title: 'Before Cut Photo' })}
          />
          <PhotoCard
            label="After Cut Photo"
            photoUrl={mpn.aftercut_photo_url}
            onView={() => mpn.aftercut_photo_url && setLightbox({ src: mpn.aftercut_photo_url, title: 'After Cut Photo' })}
          />
        </div>

        {/* Right: Meta + Chips */}
        <div style={{ flex: 1, minWidth: 320 }}>
          {/* Stats bar */}
          <div style={{ border: '1px solid var(--hair)', borderRadius: 3, background: 'var(--surface)', marginBottom: 14, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'stretch', flexWrap: 'wrap' }}>
              {[
                { label: 'Before Cut Wt', value: mpn.beforecut_weight ?? '—', flex: '0 0 112px' },
                { label: 'After Cut Wt',  value: mpn.aftercut_weight ?? '—',  flex: '0 0 112px' },
                { label: 'Chip Qty',       value: mpn.chip_qty ?? '—',          flex: '0 0 90px'  },
                { label: 'Cutboard Cost',  value: mpn.cutboard_cost ?? '—',     flex: '0 0 110px' },
                { label: 'Boards (Scanned)', value: mpn.board_count ?? 0,       flex: '0 0 120px' },
                { label: 'Part Type',      value: mpn.part_type || '—',         flex: '0 0 120px' },
              ].map(item => (
                <div key={item.label} style={{ flex: item.flex, padding: '8px 14px', borderRight: '1px solid var(--hair)' }}>
                  <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-4)', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</div>
                  <div className="num" style={{ fontSize: 13, color: 'var(--ink)' }}>{item.value}</div>
                </div>
              ))}
              <div style={{ flex: '1 1 160px', padding: '8px 14px' }}>
                <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-4)', marginBottom: 2 }}>Note</div>
                <div style={{ fontSize: 13, color: mpn.note ? 'var(--ink-2)' : 'var(--ink-5)', whiteSpace: 'pre-wrap', lineHeight: 1.5, fontStyle: mpn.note ? 'normal' : 'italic' }}>
                  {mpn.note || '—'}
                </div>
              </div>
            </div>
          </div>

          {/* Chips header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-4)', fontWeight: 500 }}>Chips</span>
            <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
              {chips.length} type{chips.length !== 1 ? 's' : ''} · {totalActual} total
            </span>
            {palletId == null && (
              <span style={{ fontSize: 11, color: 'var(--ink-4)', marginLeft: 8 }}>
                — open from a pallet to assign container UIDs
              </span>
            )}
          </div>

          {/* Chip table */}
          <div style={{ border: '1px solid var(--hair)', borderRadius: 3, background: 'var(--surface)' }}>
            <div className="table-scroll">
              <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: 680 }}>
                <colgroup>
                  <col style={{ width: '20%' }} />
                  <col style={{ width: 72 }} />
                  <col style={{ width: '15%' }} />
                  <col style={{ width: '13%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: 60 }} />
                  <col style={{ width: '8%' }} />
                  <col style={{ width: '9%' }} />
                  <col />
                </colgroup>
                <thead>
                  <tr>
                    <th style={thS}>Container UID {palletLabel && <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--ink-4)' }}>({palletLabel})</span>}</th>
                    <th style={{ ...thS, textAlign: 'right' }}>Qty</th>
                    <th style={thS}>Brand</th>
                    <th style={thS}>Chip MPN</th>
                    <th style={thS}>Type</th>
                    <th style={thS}>Photo</th>
                    <th style={{ ...thS, textAlign: 'right' }}>Cut Fail</th>
                    <th style={{ ...thS, textAlign: 'right' }}>Chip Cost</th>
                    <th style={thS}>Description</th>
                  </tr>
                </thead>
                <tbody>
                  {chips.length === 0 && (
                    <tr><td colSpan={9}><Empty label="No chips defined" sub="Add chips from the MPN page." /></td></tr>
                  )}
                  {chips.map(chip => {
                    const ctr = containers.get(chip.id);
                    return (
                      <tr key={chip.id} style={{ borderTop: '1px solid var(--hair)' }}>
                        <td style={{ ...tdS, padding: '6px 12px' }}>
                          <ContainerUIDCell
                            value={ctr?.container_uid ?? ''}
                            disabled={palletId == null}
                            onSave={uid => handleSaveContainer(chip.id, uid, ctr?.actual_qty ?? null)}
                          />
                        </td>
                        <td style={{ ...tdS, padding: '6px 12px' }}>
                          <QtyCell
                            value={ctr?.actual_qty ?? null}
                            disabled={palletId == null}
                            onSave={qty => handleSaveContainer(chip.id, ctr?.container_uid ?? '', qty)}
                          />
                        </td>
                        <td style={{ ...tdS, fontSize: 13, fontWeight: 500 }}>
                          {chip.brand_name || <span style={{ color: 'var(--ink-4)' }}>—</span>}
                        </td>
                        <td style={{ ...tdS, fontSize: 12 }} className="mono">
                          {chip.chip_mpn || <span style={{ color: 'var(--ink-4)' }}>—</span>}
                        </td>
                        <td style={{ ...tdS, fontSize: 12, color: 'var(--ink-2)' }}>
                          {chip.chip_type || <span style={{ color: 'var(--ink-4)' }}>—</span>}
                        </td>
                        <td style={{ ...tdS, padding: '8px 12px' }}>
                          <ChipPhotoCell
                            src={chip.chip_photo_url}
                            onView={() => chip.chip_photo_url && setLightbox({ src: chip.chip_photo_url, title: [chip.brand_name, chip.chip_mpn].filter(Boolean).join(' · ') || 'Chip Photo' })}
                          />
                        </td>
                        <td style={{ ...tdS, textAlign: 'right' }} className="num">
                          {chip.cut_fail != null ? chip.cut_fail : 0}
                        </td>
                        <td style={{ ...tdS, textAlign: 'right' }} className="num">
                          {mpn.cutboard_cost != null && chips.length > 0
                            ? (Number(mpn.cutboard_cost) / chips.length).toFixed(3)
                            : <span style={{ color: 'var(--ink-4)' }}>—</span>}
                        </td>
                        <td style={{ ...tdS, fontSize: 12, color: 'var(--ink-3)' }}>
                          {chip.description || <span style={{ color: 'var(--ink-4)' }}>—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <Lightbox src={lightbox?.src ?? null} title={lightbox?.title} onClose={() => setLightbox(null)} />
    </div>
  );
}

// ─── Inline container UID cell ────────────────────────────────────────────────
function ContainerUIDCell({ value, disabled, onSave }: {
  value: string; disabled: boolean; onSave: (uid: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setDraft(value); }, [value]);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const commit = async () => {
    setEditing(false);
    if (draft === value) return;
    setSaving(true);
    try { await onSave(draft); }
    finally { setSaving(false); }
  };

  if (disabled) {
    return <span style={{ color: 'var(--ink-5)', fontSize: 12 }}>—</span>;
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); }
          if (e.key === 'Escape') { setEditing(false); setDraft(value); }
        }}
        style={{
          width: '100%', boxSizing: 'border-box',
          padding: '3px 6px', fontSize: 12, fontFamily: 'ui-monospace, monospace',
          border: '1px solid var(--accent)', borderRadius: 3,
          background: 'var(--surface)', color: 'var(--ink)', outline: 'none',
        }}
      />
    );
  }

  return (
    <div
      onClick={() => !saving && setEditing(true)}
      title="Click to edit"
      style={{
        fontSize: 12, fontFamily: 'ui-monospace, monospace',
        cursor: saving ? 'default' : 'text',
        padding: '3px 6px',
        borderRadius: 3,
        border: '1px solid transparent',
        minHeight: 26,
        display: 'flex', alignItems: 'center',
        color: value ? 'var(--ink)' : 'var(--ink-5)',
        background: saving ? 'var(--surface-2)' : 'transparent',
        transition: 'border-color .1s, background .1s',
      }}
      onMouseEnter={e => { if (!saving) (e.currentTarget as HTMLElement).style.borderColor = 'var(--hair-strong)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'transparent'; }}
    >
      {saving ? <span style={{ color: 'var(--ink-4)' }}>saving…</span> : (value || <span style={{ color: 'var(--ink-5)' }}>—</span>)}
    </div>
  );
}

// ─── Inline qty cell ─────────────────────────────────────────────────────────
function QtyCell({ value, disabled, onSave }: {
  value: number | null; disabled: boolean; onSave: (qty: number | null) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value != null ? String(value) : '');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setDraft(value != null ? String(value) : ''); }, [value]);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const commit = async () => {
    setEditing(false);
    const parsed = draft.trim() === '' ? null : parseInt(draft, 10);
    if (isNaN(parsed as number) && parsed !== null) { setDraft(value != null ? String(value) : ''); return; }
    if (parsed === value) return;
    setSaving(true);
    try { await onSave(parsed); }
    finally { setSaving(false); }
  };

  if (disabled) return <span style={{ color: 'var(--ink-5)', fontSize: 12, display: 'block', textAlign: 'right' }}>—</span>;

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        type="number"
        min={0}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); }
          if (e.key === 'Escape') { setEditing(false); setDraft(value != null ? String(value) : ''); }
        }}
        style={{
          width: '100%', boxSizing: 'border-box',
          padding: '3px 6px', fontSize: 12, textAlign: 'right',
          border: '1px solid var(--accent)', borderRadius: 3,
          background: 'var(--surface)', color: 'var(--ink)', outline: 'none',
        }}
      />
    );
  }

  return (
    <div
      onClick={() => !saving && setEditing(true)}
      title="Click to edit"
      className="num"
      style={{
        fontSize: 12, textAlign: 'right',
        cursor: saving ? 'default' : 'text',
        padding: '3px 6px', borderRadius: 3,
        border: '1px solid transparent', minHeight: 26,
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
        color: value != null ? 'var(--ink)' : 'var(--ink-5)',
        background: saving ? 'var(--surface-2)' : 'transparent',
        transition: 'border-color .1s, background .1s',
      }}
      onMouseEnter={e => { if (!saving) (e.currentTarget as HTMLElement).style.borderColor = 'var(--hair-strong)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'transparent'; }}
    >
      {saving ? <span style={{ color: 'var(--ink-4)' }}>…</span> : (value != null ? value : <span style={{ color: 'var(--ink-5)' }}>—</span>)}
    </div>
  );
}

// ─── Read-only photo card (view only, no upload/delete in this context) ────────
function PhotoCard({ label, photoUrl, onView }: {
  label: string; photoUrl?: string | null; onView: () => void;
}) {
  return (
    <div style={{ border: '1px solid var(--hair)', borderRadius: 6, background: 'var(--surface)', overflow: 'hidden' }}>
      <div style={{ padding: '6px 10px 6px 12px', display: 'flex', alignItems: 'center', gap: 7, borderBottom: '1px solid var(--hair)' }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: photoUrl ? '#4caf50' : 'var(--hair)', flexShrink: 0 }} />
        <span style={{ fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-3)', fontWeight: 500 }}>{label}</span>
      </div>
      {photoUrl ? (
        <div onClick={onView} title="Click to enlarge" style={{ background: 'var(--surface-2)', cursor: 'zoom-in', position: 'relative', overflow: 'hidden' }}
          onMouseEnter={e => { const ov = e.currentTarget.querySelector('.photo-overlay') as HTMLElement; if (ov) ov.style.opacity = '1'; }}
          onMouseLeave={e => { const ov = e.currentTarget.querySelector('.photo-overlay') as HTMLElement; if (ov) ov.style.opacity = '0'; }}>
          <img src={photoUrl} alt={label} style={{ width: '100%', height: 180, objectFit: 'cover', display: 'block' }} />
          <div className="photo-overlay" style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: 'opacity .15s' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              <line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
            </svg>
          </div>
        </div>
      ) : (
        <div style={{ minHeight: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-5)', fontSize: 12 }}>No photo</div>
      )}
    </div>
  );
}

function ChipPhotoCell({ src, onView }: { src: string | null; onView: () => void; }) {
  if (!src) return <span style={{ color: 'var(--ink-4)', fontSize: 13 }}>—</span>;
  return (
    <div onClick={onView} title="Click to view" style={{ width: 44, height: 44, borderRadius: 3, overflow: 'hidden', border: '1px solid var(--hair)', background: '#000', cursor: 'zoom-in', flexShrink: 0 }}>
      <img src={src} alt="chip" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
    </div>
  );
}

function Lightbox({ src, title, onClose }: { src: string | null; title?: string; onClose: () => void; }) {
  useEffect(() => {
    if (!src) return;
    document.body.style.overflow = 'hidden';
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', h);
    };
  }, [src, onClose]);
  if (!src) return null;
  return createPortal(
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(20,18,14,0.78)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#000', borderRadius: 6, overflow: 'hidden', maxWidth: '90%', maxHeight: '90%', boxShadow: '0 24px 80px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <span className="mono" style={{ fontSize: 12, color: '#fff' }}>{title || ''}</span>
          <span style={{ flex: 1 }} />
          <button onClick={onClose} style={{ width: 24, height: 24, border: 0, borderRadius: 3, background: 'rgba(255,255,255,0.12)', color: '#fff', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit' }}>
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
          </button>
        </div>
        <img src={src} alt="chip" style={{ display: 'block', maxWidth: '80vw', maxHeight: '70vh', objectFit: 'contain' }} />
      </div>
    </div>,
    document.body
  );
}
