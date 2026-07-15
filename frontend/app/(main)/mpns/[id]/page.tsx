'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useRouter, useParams } from 'next/navigation';
import {
  Button, Breadcrumbs, Field, Input, Select, Modal, Badge,
  useToast, thS, tdS, ghostBtn, Empty,
} from '@/app/ui/components';
import { api } from '@/app/lib/api';
import { buildSlots, bomTotalQty, ITEM_GROUP_OPTIONS, MEMORY_SLOT_GROUP } from '@/app/lib/chipSlots';
import type { MPN, Chip, ChipBrand } from '@/interface/IDatatable';
import { useIsMobile } from '@/app/ui/hooks/useIsMobile';

export default function MPNDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const mpnId = Number(id);
  const toast = useToast();
  const isMobile = useIsMobile();

  const [mpn, setMpn] = useState<MPN | null>(null);
  const [chipBrands, setChipBrands] = useState<ChipBrand[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [addChipOpen, setAddChipOpen] = useState(false);
  const [editingChip, setEditingChip] = useState<Chip | null>(null);
  const [deleteChipId, setDeleteChipId] = useState<number | null>(null);
  const [lightbox, setLightbox] = useState<{ src: string; title: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const [m, brands] = await Promise.all([api.mpns.get(mpnId), api.chipBrands.list()]);
      setMpn(m);
      setChipBrands(brands);
    } catch { toast('Failed to load MPN'); }
    finally { setLoading(false); }
  }, [mpnId]);

  useEffect(() => { load(); }, [load]);

  if (loading || !mpn) {
    return <div className="page-pad" style={{ color: 'var(--ink-3)', fontSize: 13 }}>Loading…</div>;
  }

  const chips = mpn.chips ?? [];
  // Slots, not chip rows: interchangeable alternates (5 DRAMs that can fill one socket)
  // are ONE slot. Every derived number — cut cost, chips per board — divides by slots.
  const slots = buildSlots(chips);
  const nSlots = slots.length;
  const chipsPerBoard = bomTotalQty(chips);
  // Slot A / B / C — the same letters the Board BOM sheet uses as its column headers, so a
  // chip's position here lines up with where it lands in the export.
  const slotOf = new Map<number, { letter: string; shared: boolean }>();
  slots.forEach((slot, i) => {
    const letter = String.fromCharCode(65 + i);
    for (const c of slot.chips) slotOf.set(c.id, { letter, shared: slot.chips.length > 1 });
  });

  const handleUpdateMPN = async (patch: Partial<MPN>) => {
    try {
      const updated = await api.mpns.update(mpnId, patch);
      setMpn(m => m ? { ...m, ...updated } : m);
      setEditOpen(false);
      toast('MPN updated');
    } catch { toast('Failed to update MPN'); }
  };


  const handleAddChip = async (data: ChipFormData) => {
    try {
      let chip = await api.mpns.chips.create(mpnId, {
        brand: data.brandId ? +data.brandId : null,
        qty: data.qty !== '' ? +data.qty : null,
        slot_group: data.slotGroup, item_group: data.itemGroup,
        chip_mpn: data.chipMpn, chip_type: data.chipType, description: data.description,
        processed_type: data.processedType, packaging_type: data.packagingType,
      } as any);
      if (data.photoFile) chip = await api.mpns.chips.uploadPhoto(mpnId, chip.id, data.photoFile);
      setMpn(m => m ? { ...m, chips: [...(m.chips ?? []), chip] } : m);
      setAddChipOpen(false);
      toast('Chip added');
    } catch { toast('Failed to add chip'); }
  };

  const handleUpdateChip = async (chipId: number, data: ChipFormData) => {
    try {
      let chip = await api.mpns.chips.update(mpnId, chipId, {
        brand: data.brandId ? +data.brandId : null,
        qty: data.qty !== '' ? +data.qty : null,
        slot_group: data.slotGroup, item_group: data.itemGroup,
        chip_mpn: data.chipMpn, chip_type: data.chipType, description: data.description,
        processed_type: data.processedType, packaging_type: data.packagingType,
      } as any);
      if (data.photoFile) chip = await api.mpns.chips.uploadPhoto(mpnId, chipId, data.photoFile);
      else if (data.clearPhoto) { await api.mpns.chips.deletePhoto(mpnId, chipId); chip = { ...chip, chip_photo_url: null }; }
      setMpn(m => m ? { ...m, chips: (m.chips ?? []).map(c => c.id === chipId ? chip : c) } : m);
      setEditingChip(null);
      toast('Chip updated');
    } catch { toast('Failed to update chip'); }
  };

  const handleDeleteChip = async (chipId: number) => {
    try {
      await api.mpns.chips.delete(mpnId, chipId);
      setMpn(m => m ? { ...m, chips: (m.chips ?? []).filter(c => c.id !== chipId) } : m);
      toast('Chip removed');
    } catch { toast('Failed to delete chip'); }
  };


  const subtitle = [mpn.part_type || null, `Created ${mpn.created_at?.slice(0, 10) || '—'}`].filter(Boolean).join(' · ');

  return (
    <div className="fade-in page-pad">
      <Breadcrumbs items={[
        { label: 'Home', onClick: () => router.push('/dashboard') },
        { label: mpn.name },
      ]} />

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', margin: '8px 0 16px', gap: 10 }}>
        <div>
          <h1 className="mono" style={{ margin: 0, fontSize: 20, fontWeight: 400, letterSpacing: '-0.01em' }}>{mpn.name}</h1>
          <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 3 }}>{subtitle}</div>
        </div>
        <Button variant="outline" onClick={() => setEditOpen(true)}>Edit</Button>
      </div>

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* Left: Photos */}
        <div style={{ width: isMobile ? '100%' : 340, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <PhotoCard
            label="Before Cut Photo"
            photoUrl={mpn.beforecut_photo_url}
            onView={() => mpn.beforecut_photo_url && setLightbox({ src: mpn.beforecut_photo_url, title: 'Before Cut Photo' })}
            onUpload={async (file) => {
              try { const u = await api.mpns.photos.uploadBeforecut(mpnId, file); setMpn(m => m ? { ...m, ...u } : m); toast('Photo uploaded'); }
              catch { toast('Failed to upload photo'); }
            }}
            onDelete={async () => {
              try { await api.mpns.photos.deleteBeforecut(mpnId); setMpn(m => m ? { ...m, beforecut_photo_url: null } : m); toast('Photo deleted'); }
              catch { toast('Failed to delete photo'); }
            }}
          />
          <PhotoCard
            label="After Cut Photo"
            photoUrl={mpn.aftercut_photo_url}
            onView={() => mpn.aftercut_photo_url && setLightbox({ src: mpn.aftercut_photo_url, title: 'After Cut Photo' })}
            onUpload={async (file) => {
              try { const u = await api.mpns.photos.uploadAftercut(mpnId, file); setMpn(m => m ? { ...m, ...u } : m); toast('Photo uploaded'); }
              catch { toast('Failed to upload photo'); }
            }}
            onDelete={async () => {
              try { await api.mpns.photos.deleteAftercut(mpnId); setMpn(m => m ? { ...m, aftercut_photo_url: null } : m); toast('Photo deleted'); }
              catch { toast('Failed to delete photo'); }
            }}
          />
        </div>

        {/* Right: Meta + Chips */}
        <div style={{ flex: 1, minWidth: 320 }}>
          <div style={{ border: '1px solid var(--hair)', borderRadius: 3, background: 'var(--surface)', marginBottom: 14, overflow: 'hidden' }}>
            {isMobile ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                {[
                  { label: 'Before Cut Wt', value: mpn.beforecut_weight ?? '—', mono: false },
                  { label: 'After Cut Wt', value: mpn.aftercut_weight ?? '—', mono: false },
                  { label: 'Slots', value: nSlots, mono: false },
                  { label: 'Chips / Board', value: chipsPerBoard, mono: false },
                  { label: 'Cutboard Cost', value: mpn.cutboard_cost ?? '—', mono: false },
                  { label: 'Boards (Scanned)', value: mpn.board_count ?? 0, mono: false },
                  { label: 'Part Type', value: mpn.part_type || '—', mono: true },
                  { label: 'Created', value: mpn.created_at?.slice(0, 10) || '—', mono: false },
                ].map((item, i) => (
                  <div key={item.label} style={{
                    padding: '10px 14px',
                    borderRight: i % 2 === 0 ? '1px solid var(--hair)' : 'none',
                    borderBottom: '1px solid var(--hair)',
                  }}>
                    <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-4)', marginBottom: 2 }}>{item.label}</div>
                    <div className={item.mono ? 'mono' : 'num'} style={{ fontSize: 13, color: 'var(--ink)' }}>{item.value}</div>
                  </div>
                ))}
                <div style={{ gridColumn: '1 / -1', padding: '10px 14px' }}>
                  <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-4)', marginBottom: 2 }}>Note</div>
                  <div style={{ fontSize: 13, color: mpn.note ? 'var(--ink-2)' : 'var(--ink-5)', whiteSpace: 'pre-wrap', lineHeight: 1.5, fontStyle: mpn.note ? 'normal' : 'italic', fontWeight: mpn.note ? 600 : 400 }}>
                    {mpn.note || '—'}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'stretch', flexWrap: 'wrap' }}>
                {[
                  { label: 'Before Cut Wt', value: mpn.beforecut_weight ?? '—', mono: false, flex: '0 0 112px' },
                  { label: 'After Cut Wt', value: mpn.aftercut_weight ?? '—', mono: false, flex: '0 0 112px' },
                  { label: 'Slots', value: nSlots, mono: false, flex: '0 0 70px' },
                  { label: 'Chips / Board', value: chipsPerBoard, mono: false, flex: '0 0 96px' },
                  { label: 'Cutboard Cost', value: mpn.cutboard_cost ?? '—', mono: false, flex: '0 0 110px' },
                  { label: 'Boards (Scanned)', value: mpn.board_count ?? 0, mono: false, flex: '0 0 120px' },
                  { label: 'Created', value: mpn.created_at?.slice(0, 10) || '—', mono: false, flex: '0 0 100px' },
                  { label: 'Part Type', value: mpn.part_type || '—', mono: true, flex: '0 0 120px' },
                ].map((item, i) => (
                  <div key={item.label} style={{ flex: item.flex, padding: '8px 14px', borderRight: '1px solid var(--hair)' }}>
                    <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-4)', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</div>
                    <div className={item.mono ? 'mono' : 'num'} style={{ fontSize: 13, color: 'var(--ink)' }}>{item.value}</div>
                  </div>
                ))}
                <div style={{ flex: '1 1 160px', padding: '8px 14px' }}>
                  <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-4)', marginBottom: 2 }}>Note</div>
                  <div style={{ fontSize: 13, color: mpn.note ? 'var(--ink-2)' : 'var(--ink-5)', whiteSpace: 'pre-wrap', lineHeight: 1.5, fontStyle: mpn.note ? 'normal' : 'italic', fontWeight: mpn.note ? 600 : 400 }}>
                    {mpn.note || '—'}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-4)', fontWeight: 500 }}>Chips</span>
            <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
              {chips.length} part{chips.length !== 1 ? 's' : ''} in {nSlots} slot{nSlots !== 1 ? 's' : ''}
              {chips.length > nSlots && (
                <span style={{ color: 'var(--ink-4)' }}>
                  {' '}({slots.filter(s => s.chips.length > 1).map(s => `${s.chips.length} alternates share slot ${String.fromCharCode(65 + slots.indexOf(s))}`).join(', ')})
                </span>
              )}
              {' · '}{chips.filter(c => c.chip_photo_url).length}/{chips.length} with photo
            </span>
            <div style={{ flex: 1 }} />
            <Button size="sm" variant="primary" onClick={() => setAddChipOpen(true)}>+ Add chip</Button>
          </div>

          <div style={{ border: '1px solid var(--hair)', borderRadius: 3, background: 'var(--surface)' }}>
            <div className="table-scroll">
            {/* Fixed layout: the px widths below must stay <= minWidth, or the last
                auto-width column collapses and its text spills over its neighbour. */}
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: 1280 }}>
              <colgroup>
                <col style={{ width: 120 }} />{/* Brand */}
                <col style={{ width: 150 }} />{/* Chip MPN */}
                <col style={{ width: 90 }} />{/* Type */}
                <col style={{ width: 80 }} />{/* Slot */}
                <col style={{ width: 64 }} />{/* Photo */}
                <col style={{ width: 96 }} />{/* Qty/Board */}
                <col style={{ width: 92 }} />{/* Chip Cost */}
                <col style={{ width: 124 }} />{/* Processed Type */}
                <col style={{ width: 124 }} />{/* Packaging Type */}
                <col />{/* Description — takes the remainder */}
                <col style={{ width: 96 }} />{/* actions */}
              </colgroup>
              <thead>
                <tr>
                  <th style={chipThS}>Brand</th>
                  <th style={chipThS}>Chip MPN</th>
                  <th style={chipThS}>Type</th>
                  <th style={chipThS}>Slot</th>
                  <th style={chipThS}>Photo</th>
                  <th style={{ ...chipThS, textAlign: 'right' }}>Qty/Board</th>
                  <th style={{ ...chipThS, textAlign: 'right' }}>Chip Cost</th>
                  <th style={chipThS}>Processed Type</th>
                  <th style={chipThS}>Packaging Type</th>
                  <th style={chipThS}>Description</th>
                  <th style={{ ...chipThS, textAlign: 'right' }}></th>
                </tr>
              </thead>
              <tbody>
                {chips.length === 0 && (
                  <tr><td colSpan={12}><Empty label="No chips yet" sub="Click '+ Add chip' to start." /></td></tr>
                )}
                {chips.map(chip => (
                  <tr key={chip.id} className="chip-row" style={{ borderTop: '1px solid var(--hair)' }}>
                    <td style={{ ...chipTdS, fontSize: 13, fontWeight: 500 }}>
                      {chip.brand_name || <span style={{ color: 'var(--ink-4)' }}>—</span>}
                    </td>
                    <td style={{ ...chipTdS, fontSize: 12 }} className="mono">
                      {chip.chip_mpn || <span style={{ color: 'var(--ink-4)' }}>—</span>}
                    </td>
                    <td style={{ ...chipTdS, fontSize: 12, color: 'var(--ink-2)' }}>
                      {chip.chip_type || <span style={{ color: 'var(--ink-4)' }}>—</span>}
                    </td>
                    <td style={{ ...chipTdS, fontSize: 12 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5 }}>
                        <Badge>{slotOf.get(chip.id)?.letter ?? '—'}</Badge>
                        {slotOf.get(chip.id)?.shared && (
                          <span
                            title={`Shares slot ${slotOf.get(chip.id)!.letter} with the other "${chip.slot_group}" chips — only one is on any given board`}
                            style={{ fontSize: 10.5, color: 'var(--ink-4)', whiteSpace: 'nowrap' }}
                          >
                            {chip.slot_group}
                          </span>
                        )}
                      </span>
                    </td>
                    <td style={{ ...chipTdS, padding: '8px 10px' }}>
                      <ChipPhotoCell
                        src={chip.chip_photo_url}
                        onView={() => chip.chip_photo_url && setLightbox({ src: chip.chip_photo_url, title: [chip.brand_name, chip.chip_mpn].filter(Boolean).join(' · ') || 'Chip Photo' })}
                      />
                    </td>
                    <td style={{ ...chipTdS, textAlign: 'right' }} className="num">
                      {chip.qty != null ? chip.qty : <span style={{ color: 'var(--ink-4)' }}>—</span>}
                    </td>
                    <td style={{ ...chipTdS, textAlign: 'right' }} className="num">
                      {mpn.cutboard_cost != null && nSlots > 0
                        ? (Number(mpn.cutboard_cost) / nSlots).toFixed(3)
                        : <span style={{ color: 'var(--ink-4)' }}>—</span>}
                    </td>
                    <td style={{ ...chipTdS, fontSize: 12, color: 'var(--ink-2)' }}>
                      {chip.processed_type || 'harvested'}
                    </td>
                    <td style={{ ...chipTdS, fontSize: 12, color: 'var(--ink-2)' }}>
                      {chip.packaging_type || 'tray'}
                    </td>
                    <td style={{ ...chipTdS, fontSize: 12, color: 'var(--ink-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={chip.description || undefined}>
                      {chip.description || <span style={{ color: 'var(--ink-4)' }}>—</span>}
                    </td>
                    <td style={{ ...chipTdS, textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 6 }}>
                        <button onClick={e => { e.stopPropagation(); setEditingChip(chip); }} style={chipIconBtn} title="Edit"><EditIcon /></button>
                        <button onClick={e => { e.stopPropagation(); setDeleteChipId(chip.id); }} style={{ ...chipIconBtn, color: 'var(--err)' }} title="Delete"><TrashIcon /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      </div>

      <style>{`.chip-row:hover{background:var(--accent-tint)}.chip-photo-cell:hover .chip-photo-overlay{opacity:1}.chip-photo-empty:hover{border-color:var(--accent);color:var(--accent);background:var(--accent-tint)}`}</style>
      <Modal open={deleteChipId !== null} onClose={() => setDeleteChipId(null)} title="Delete Chip" width={420}
        footer={<>
          <Button variant="ghost" onClick={() => setDeleteChipId(null)}>Cancel</Button>
          <Button variant="primary" style={{ background: '#c0392b', borderColor: '#c0392b' }}
            onClick={() => { handleDeleteChip(deleteChipId!); setDeleteChipId(null); }}>Delete</Button>
        </>}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.6 }}>Are you sure you want to delete this chip? This action cannot be undone.</p>
      </Modal>
      <EditMPNModal open={editOpen} mpn={mpn} onClose={() => setEditOpen(false)} onSave={handleUpdateMPN} />
      <AddChipModal open={addChipOpen} chipBrands={chipBrands} onClose={() => setAddChipOpen(false)} onAdd={handleAddChip} />
      {editingChip && <AddChipModal open={true} mode="edit" initial={editingChip} chipBrands={chipBrands} onClose={() => setEditingChip(null)} onAdd={data => handleUpdateChip(editingChip.id, data)} />}
      <Lightbox src={lightbox?.src ?? null} title={lightbox?.title} onClose={() => setLightbox(null)} />
    </div>
  );
}

function PhotoCard({ label, photoUrl, onView, onUpload, onDelete }: {
  label: string; photoUrl?: string | null;
  onView: () => void; onUpload: (file: File) => void; onDelete: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const filename = photoUrl ? photoUrl.split('/').pop() : null;

  return (
    <div style={{ border: '1px solid var(--hair)', borderRadius: 6, background: 'var(--surface)', overflow: 'hidden' }}>
      <div style={{ padding: '6px 10px 6px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--hair)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: photoUrl ? '#4caf50' : 'var(--hair)', flexShrink: 0 }} />
          <span style={{ fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-3)', fontWeight: 500 }}>{label}</span>
        </div>
        {photoUrl && (
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => inputRef.current?.click()} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'transparent', border: '1px solid var(--hair)', borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: 11.5, color: 'var(--ink-2)', fontFamily: 'inherit', lineHeight: 1 }}>
              <IconRefresh /> Replace
            </button>
            <button onClick={onDelete} title="Remove" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, background: 'transparent', border: '1px solid var(--hair)', borderRadius: 4, cursor: 'pointer', fontSize: 16, color: 'var(--ink-3)', fontFamily: 'inherit', lineHeight: 1 }}>×</button>
          </div>
        )}
      </div>

      {photoUrl ? (
        <>
          <div onClick={onView} title="Click to enlarge" style={{ background: 'var(--surface-2)', cursor: 'zoom-in', position: 'relative', overflow: 'hidden' }}
            onMouseEnter={e => { const ov = e.currentTarget.querySelector('.photo-overlay') as HTMLElement; if (ov) ov.style.opacity = '1'; }}
            onMouseLeave={e => { const ov = e.currentTarget.querySelector('.photo-overlay') as HTMLElement; if (ov) ov.style.opacity = '0'; }}>
            <img src={photoUrl} alt={label} style={{ width: '100%', height: 220, objectFit: 'cover', display: 'block' }} />
            <div className="photo-overlay" style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: 'opacity .15s' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                <line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
              </svg>
            </div>
          </div>
          {filename && (
            <div style={{ padding: '4px 12px 6px', fontSize: 11, color: 'var(--ink-4)' }}>{filename}</div>
          )}
        </>
      ) : (
        <div
          style={{ minHeight: 160, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: '24px 16px', textAlign: 'center', background: dragOver ? 'var(--surface-2)' : 'transparent', transition: 'background .12s', outline: dragOver ? '2px dashed var(--accent)' : '2px dashed transparent', outlineOffset: -2 }}
          onClick={() => inputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f?.type.startsWith('image/')) onUpload(f); }}
        >
          <div style={{ width: 48, height: 48, borderRadius: '50%', border: '2px dashed var(--hair)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10, color: 'var(--ink-4)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </div>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink-2)', marginBottom: 4 }}>Add photo</div>
          <div style={{ fontSize: 11.5, color: 'var(--ink-4)', lineHeight: 1.8 }}>JPG, PNG · max 10MB</div>
          <div style={{ fontSize: 11.5, color: 'var(--ink-4)' }}>or drag &amp; drop</div>
        </div>
      )}

      <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = ''; }} />
    </div>
  );
}

// Tighter padding than the shared thS (12 columns to fit), and nowrap so a header can
// never overflow its column and land on top of the next one.
const chipThS: React.CSSProperties = {
  ...thS, padding: '10px 10px', whiteSpace: 'nowrap',
};
// Body padding must match chipThS horizontally, or right-aligned numbers stagger
// against their headers.
const chipTdS: React.CSSProperties = { ...tdS, padding: '6px 10px' };

const chipIconBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 32, height: 32, background: 'transparent', border: '1px solid var(--hair)',
  borderRadius: 4, cursor: 'pointer', color: 'var(--ink-3)', padding: 0, flexShrink: 0,
};

const EditIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);
const TrashIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
  </svg>
);

function IconRefresh() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 .49-3.46" />
    </svg>
  );
}

function EditMPNModal({ open, mpn, onClose, onSave }: {
  open: boolean; mpn: MPN; onClose: () => void; onSave: (patch: Partial<MPN>) => void;
}) {
  const [name, setName] = useState(mpn.name);
  const [partType, setPartType] = useState(mpn.part_type);
  const [beforecutQty, setBeforecutQty] = useState(mpn.beforecut_weight != null ? String(mpn.beforecut_weight) : '');
  const [aftercutQty, setAftercutQty] = useState(mpn.aftercut_weight != null ? String(mpn.aftercut_weight) : '');
  const [cutboardCost, setCutboardCost] = useState(mpn.cutboard_cost != null ? String(mpn.cutboard_cost) : '');
  const [note, setNote] = useState(mpn.note ?? '');

  useEffect(() => {
    if (open) {
      setName(mpn.name); setPartType(mpn.part_type);
      setBeforecutQty(mpn.beforecut_weight != null ? String(mpn.beforecut_weight) : '');
      setAftercutQty(mpn.aftercut_weight != null ? String(mpn.aftercut_weight) : '');
      setCutboardCost(mpn.cutboard_cost != null ? String(mpn.cutboard_cost) : '');
      setNote(mpn.note ?? '');
    }
  }, [open, mpn]);

  return (
    <Modal open={open} onClose={onClose} title="Edit MPN" width={480}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={!name} onClick={() => onSave({
          name, part_type: partType,
          beforecut_weight: beforecutQty !== '' ? +beforecutQty : null,
          aftercut_weight: aftercutQty !== '' ? +aftercutQty : null,
          cutboard_cost: cutboardCost !== '' ? +cutboardCost : null,
          note,
        })}>Save</Button>
      </>}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Field label="Name" span={2}><Input value={name} onChange={setName} autoFocus /></Field>
        <Field label="Part Type" span={2}><Input value={partType} onChange={setPartType} placeholder="e.g. IC" /></Field>
        <Field label="Before Cut Wt"><Input value={beforecutQty} onChange={setBeforecutQty} type="number" placeholder="—" /></Field>
        <Field label="After Cut Wt"><Input value={aftercutQty} onChange={setAftercutQty} type="number" placeholder="—" /></Field>
        <Field label="Cutboard Cost"><Input value={cutboardCost} onChange={setCutboardCost} type="number" placeholder="—" /></Field>
        <Field label="Note" span={2}>
          <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Optional notes…" rows={3}
            style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', padding: '6px 10px', fontSize: 13, fontFamily: 'inherit', border: '1px solid var(--hair)', borderRadius: 4, background: 'var(--surface)', color: 'var(--ink)', outline: 'none', lineHeight: 1.5 }} />
        </Field>
      </div>
    </Modal>
  );
}

type ChipFormData = { brandId: string; qty: string; slotGroup: string; itemGroup: string; chipMpn: string; chipType: string; description: string; processedType: string; packagingType: string; photoFile?: File | null; clearPhoto?: boolean; };

function ChipPhotoSquare({ value, onChange }: { value: { src: string; name?: string; file?: File } | null; onChange: (v: { src: string; name: string; file: File } | null) => void; }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const pick = (file: File) => {
    const reader = new FileReader();
    reader.onload = e => onChange({ src: e.target!.result as string, name: file.name, file });
    reader.readAsDataURL(file);
  };
  return (
    <div onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f?.type.startsWith('image/')) pick(f); }}
      style={{ position: 'relative', border: `1px solid ${drag ? 'var(--accent)' : 'var(--hair)'}`, borderRadius: 4, background: drag ? 'var(--accent-tint)' : 'var(--surface)', overflow: 'hidden', aspectRatio: '1 / 1', transition: 'background .12s, border-color .12s' }}>
      {value ? (
        <>
          <img src={value.src} alt="chip" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          <div style={{ position: 'absolute', top: 5, right: 5, display: 'flex', gap: 3 }}>
            <button onClick={() => fileRef.current?.click()} title="Replace" style={{ height: 22, padding: '0 8px', border: 0, borderRadius: 2, background: 'rgba(0,0,0,0.65)', color: '#fff', fontSize: 10.5, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <svg width="9" height="9" viewBox="0 0 12 12" fill="none"><path d="M2 6a4 4 0 016.5-3.1M10 6a4 4 0 01-6.5 3.1M9 1.5V3.5H7M3 10.5V8.5H5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Replace
            </button>
            <button onClick={() => onChange(null)} title="Remove" style={{ width: 22, height: 22, padding: 0, border: 0, borderRadius: 2, background: 'rgba(0,0,0,0.65)', color: '#fff', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="9" height="9" viewBox="0 0 12 12" fill="none"><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
            </button>
          </div>
          {value.name && <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '4px 8px', fontSize: 10, color: '#fff', background: 'linear-gradient(180deg,rgba(0,0,0,0) 0%,rgba(0,0,0,0.55) 100%)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value.name}</div>}
        </>
      ) : (
        <button onClick={() => fileRef.current?.click()} style={{ width: '100%', height: '100%', border: 0, background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, color: 'var(--ink-3)' }}>
          <span style={{ width: 36, height: 36, borderRadius: 36, border: '1px dashed var(--hair)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
          </span>
          <span style={{ fontSize: 11.5, color: 'var(--ink-2)', fontWeight: 500 }}>Add photo</span>
          <span style={{ fontSize: 10, color: 'var(--ink-4)' }}>or drag &amp; drop</span>
        </button>
      )}
      <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) pick(f); e.target.value = ''; }} />
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
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(20,18,14,0.78)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 40,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#000', borderRadius: 6, overflow: 'hidden',
          maxWidth: '90%', maxHeight: '90%',
          boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px',
          background: 'rgba(255,255,255,0.04)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}>
          <span className="mono" style={{ fontSize: 12, color: '#fff' }}>{title || ''}</span>
          <span style={{ flex: 1 }} />
          <button
            onClick={onClose}
            style={{
              width: 24, height: 24, border: 0, borderRadius: 3,
              background: 'rgba(255,255,255,0.12)', color: '#fff', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'inherit',
            }}
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
              <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
        <img src={src} alt="chip" style={{ display: 'block', maxWidth: '80vw', maxHeight: '70vh', objectFit: 'contain' }} />
      </div>
    </div>,
    document.body
  );
}

const PROCESSED_TYPE_OPTIONS = [
  { value: 'harvested', label: 'Harvested' },
  { value: 'tested & reballed', label: 'Tested & Reballed' },
];
const PACKAGING_TYPE_OPTIONS = [
  { value: 'tray', label: 'Tray' },
  { value: 'reel', label: 'Reel' },
  { value: 'bag', label: 'Bag' },
];

function AddChipModal({ open, mode = 'add', initial, chipBrands, onClose, onAdd }: {
  open: boolean; mode?: 'add' | 'edit'; initial?: Chip | null; chipBrands: ChipBrand[]; onClose: () => void; onAdd: (data: ChipFormData) => void;
}) {
  const isMobile = useIsMobile();
  const [brandId, setBrandId] = useState('');
  const [chipMpn, setChipMpn] = useState('');
  const [chipType, setChipType] = useState('');
  const [description, setDescription] = useState('');
  const [qty, setQty] = useState('');
  const [slotGroup, setSlotGroup] = useState('');
  const [itemGroup, setItemGroup] = useState('');
  const [processedType, setProcessedType] = useState('harvested');
  const [packagingType, setPackagingType] = useState('tray');
  // Slot Group lives in a collapsed "Advanced" section — most chips have their own slot
  // and never touch it. Open it automatically when a slot group is actually set.
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [photo, setPhoto] = useState<{ src: string; name?: string; file?: File } | null>(null);
  const initialPhotoUrl = initial?.chip_photo_url ?? null;

  useEffect(() => {
    if (open) {
      setBrandId(initial?.brand != null ? String(initial.brand) : '');
      setChipMpn(initial?.chip_mpn ?? '');
      setChipType(initial?.chip_type ?? '');
      setDescription(initial?.description ?? '');
      // A new chip really defaults to 1 per board — don't leave it blank and let a grey
      // placeholder masquerade as a value. On edit, show whatever is actually stored.
      setQty(initial?.qty != null ? String(initial.qty) : (mode === 'add' ? '1' : ''));
      setSlotGroup(initial?.slot_group ?? '');
      setItemGroup(initial?.item_group ?? '');
      setAdvancedOpen((initial?.slot_group ?? '').trim() !== '');
      setProcessedType(initial?.processed_type ?? 'harvested');
      setPackagingType(initial?.packaging_type ?? 'tray');
      setPhoto(initial?.chip_photo_url ? { src: initial.chip_photo_url, name: initial.chip_photo_url.split('/').pop() } : null);
    }
  }, [open, initial, mode]);

  // Memory chips are the interchangeable ones on these boards, so tagging a chip Memory
  // pre-fills its slot group. Written into the visible field rather than applied as a
  // hidden rule, so a board with two distinct Memory sockets can still split them.
  const changeItemGroup = (next: string) => {
    setItemGroup(next);
    if (next === 'Memory' && slotGroup.trim() === '') setSlotGroup(MEMORY_SLOT_GROUP);
    else if (next !== 'Memory' && slotGroup.trim() === MEMORY_SLOT_GROUP) setSlotGroup('');
  };

  const submit = () => {
    onAdd({
      brandId, qty, slotGroup: slotGroup.trim(), itemGroup, chipMpn, chipType, description,
      processedType, packagingType,
      photoFile: photo?.file ?? null,
      clearPhoto: !photo && !!initialPhotoUrl,
    });
  };

  return (
    <Modal open={open} onClose={onClose} title={mode === 'edit' ? 'Edit Chip' : 'Add Chip'} width={580}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={submit}>{mode === 'edit' ? 'Save' : 'Add'}</Button>
      </>}>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 180px', gap: 20 }}>
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Chip MPN"><Input value={chipMpn} onChange={setChipMpn} placeholder="e.g. TPS62130" /></Field>
            <Field label="Type"><Input value={chipType} onChange={setChipType} placeholder="e.g. DC-DC" /></Field>
            <Field label="Brand"><Select value={brandId} onChange={setBrandId} options={[{ value: '', label: 'No brand' }, ...chipBrands.map(b => ({ value: String(b.id), label: b.name }))]} /></Field>
            <Field label="Item Group"><Select value={itemGroup} onChange={changeItemGroup} options={ITEM_GROUP_OPTIONS} /></Field>
            <Field label="Processed Type"><Select value={processedType} onChange={setProcessedType} options={PROCESSED_TYPE_OPTIONS} /></Field>
            <Field label="Packaging Type"><Select value={packagingType} onChange={setPackagingType} options={PACKAGING_TYPE_OPTIONS} /></Field>
            <Field label="Qty / Board"><Input value={qty} onChange={setQty} type="number" placeholder="1" /></Field>
            <Field label="Description"><Input value={description} onChange={setDescription} placeholder="Optional" /></Field>
          </div>
          <div style={{ fontSize: 11, marginTop: 8, color: 'var(--ink-4)', lineHeight: 1.55 }}>
            <b style={{ color: 'var(--ink-3)' }}>Item Group</b> classifies the chip for the customer&apos;s bid sheet — picking <b style={{ color: 'var(--ink-3)' }}>Memory</b> pre-fills the slot below.
            {' '}<b style={{ color: 'var(--ink-3)' }}>Qty / Board</b> is per single board, almost always 1.
          </div>

          <div style={{ marginTop: 16, borderTop: '1px solid var(--hair)', paddingTop: 12 }}>
            <button
              type="button"
              onClick={() => setAdvancedOpen(o => !o)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                background: 'none', border: 0, padding: 0, cursor: 'pointer',
                color: 'var(--ink-2)', fontSize: 12, fontWeight: 600, textAlign: 'left', letterSpacing: '0.02em',
              }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                style={{ flexShrink: 0, transition: 'transform 0.15s', transform: advancedOpen ? 'rotate(90deg)' : 'none' }}>
                <polyline points="9 6 15 12 9 18" />
              </svg>
              <span>Advanced</span>
              {!advancedOpen && slotGroup.trim() && (
                <span style={{
                  marginLeft: 'auto', fontSize: 10.5, fontWeight: 500, color: 'var(--ink-3)',
                  background: 'var(--surface-2)', border: '1px solid var(--hair-strong)',
                  borderRadius: 999, padding: '2px 9px', letterSpacing: 0,
                }}>
                  slot {slotGroup.trim()}
                </span>
              )}
            </button>
            {advancedOpen && (
              <div style={{
                marginTop: 12, padding: 14, background: 'var(--surface-2)',
                border: '1px solid var(--hair)', borderRadius: 3,
              }}>
                <Field label="Slot Group">
                  <Input value={slotGroup} onChange={setSlotGroup} placeholder="blank = its own slot" />
                </Field>
                <div style={{ fontSize: 11, marginTop: 8, color: 'var(--ink-4)', lineHeight: 1.55 }}>
                  <b style={{ color: 'var(--ink-3)' }}>Where</b> this chip sits on the board. Chips with the
                  <b style={{ color: 'var(--ink-3)' }}> same slot name</b> are interchangeable in one socket and count as
                  <b style={{ color: 'var(--ink-3)' }}> one slot</b> — only one is on any given board. This drives the cut
                  cost and chips-per-board. Leave blank if the chip has a slot to itself.
                </div>
              </div>
            )}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 6, fontWeight: 500 }}>Chip Photo <span style={{ textTransform: 'none', letterSpacing: 0, fontSize: 10.5, color: 'var(--ink-5)', fontWeight: 400 }}>(optional)</span></div>
          <ChipPhotoSquare value={photo} onChange={setPhoto} />
          <div style={{ fontSize: 10.5, color: 'var(--ink-4)', marginTop: 6, lineHeight: 1.4 }}>Close-up of the chip. JPG / PNG · max 10 MB.</div>
        </div>
      </div>
    </Modal>
  );
}
