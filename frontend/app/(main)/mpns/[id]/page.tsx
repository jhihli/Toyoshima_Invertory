'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useRouter, useParams } from 'next/navigation';
import {
  Button, Breadcrumbs, Field, Input, Select, Modal,
  useToast, thS, tdS, ghostBtn, Empty,
} from '@/app/ui/components';
import { api } from '@/app/lib/api';
import type { MPN, Chip, ChipBrand } from '@/interface/IDatatable';

export default function MPNDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const mpnId = Number(id);
  const toast = useToast();

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
  const totalChips = chips.reduce((s, c) => s + c.qty, 0);

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
        qty: +data.qty, chip_mpn: data.chipMpn, chip_type: data.chipType, description: data.description,
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
        qty: +data.qty, chip_mpn: data.chipMpn, chip_type: data.chipType, description: data.description,
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
        <div style={{ width: 340, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <PhotoCard
            label="Before Cut Photo"
            photoUrl={mpn.beforecut_photo_url}
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
            <div style={{ display: 'flex', alignItems: 'stretch', flexWrap: 'wrap' }}>
              {[
                { label: 'Before Cut Wt', value: mpn.beforecut_weight ?? '—', mono: false, flex: '0 0 112px' },
                { label: 'After Cut Wt', value: mpn.aftercut_weight ?? '—', mono: false, flex: '0 0 112px' },
                { label: 'Chip Qty', value: mpn.chip_qty ?? '—', mono: false, flex: '0 0 112px' },
                { label: 'Created', value: mpn.created_at?.slice(0, 10) || '—', mono: false, flex: '0 0 100px' },
                { label: 'Part Type', value: mpn.part_type || '—', mono: true, flex: '1 1 auto' },
              ].map((item, i, arr) => (
                <div key={item.label} style={{ flex: item.flex, padding: '8px 14px', borderRight: i < arr.length - 1 ? '1px solid var(--hair)' : 'none' }}>
                  <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-4)', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</div>
                  <div className={item.mono ? 'mono' : 'num'} style={{ fontSize: 13, color: 'var(--ink)' }}>{item.value}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-4)', fontWeight: 500 }}>Chips</span>
            <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
              {chips.length} brand{chips.length !== 1 ? 's' : ''} · {totalChips} chip{totalChips !== 1 ? 's' : ''}
              {' · '}{chips.filter(c => c.chip_photo_url).length}/{chips.length} with photo
            </span>
            <div style={{ flex: 1 }} />
            <Button size="sm" variant="primary" disabled={mpn.chip_qty != null && totalChips >= mpn.chip_qty} onClick={() => setAddChipOpen(true)}>+ Add chip</Button>
          </div>

          <div style={{ border: '1px solid var(--hair)', borderRadius: 3, background: 'var(--surface)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '20%' }} />
                <col style={{ width: '18%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: 68 }} />
                <col style={{ width: '10%' }} />
                <col />
                <col style={{ width: 72 }} />
              </colgroup>
              <thead>
                <tr>
                  <th style={thS}>Brand</th>
                  <th style={thS}>Chip MPN</th>
                  <th style={thS}>Type</th>
                  <th style={thS}>Photo</th>
                  <th style={{ ...thS, textAlign: 'right' }}>Qty</th>
                  <th style={thS}>Description</th>
                  <th style={thS}></th>
                </tr>
              </thead>
              <tbody>
                {chips.length === 0 && (
                  <tr><td colSpan={7}><Empty label="No chips yet" sub="Click '+ Add chip' to start." /></td></tr>
                )}
                {chips.map(chip => (
                  <tr key={chip.id} className="chip-row" style={{ borderTop: '1px solid var(--hair)' }}>
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
                    <td style={{ ...tdS, textAlign: 'right' }} className="num">{chip.qty}</td>
                    <td style={{ ...tdS, fontSize: 12, color: 'var(--ink-3)' }}>{chip.description || <span style={{ color: 'var(--ink-4)' }}>—</span>}</td>
                    <td style={{ ...tdS, textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 4 }}>
                        <button onClick={e => { e.stopPropagation(); setEditingChip(chip); }} style={ghostBtn} title="Edit"><EditIcon /></button>
                        <button onClick={e => { e.stopPropagation(); setDeleteChipId(chip.id); }} style={ghostBtn} title="Delete"><TrashIcon /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
      <AddChipModal open={addChipOpen} chipBrands={chipBrands} onClose={() => setAddChipOpen(false)} onAdd={handleAddChip}
        maxQty={mpn.chip_qty != null ? mpn.chip_qty - totalChips : undefined} />
      {editingChip && <AddChipModal open={true} mode="edit" initial={editingChip} chipBrands={chipBrands} onClose={() => setEditingChip(null)} onAdd={data => handleUpdateChip(editingChip.id, data)}
        maxQty={mpn.chip_qty != null ? mpn.chip_qty - totalChips + editingChip.qty : undefined} />}
      <Lightbox src={lightbox?.src ?? null} title={lightbox?.title} onClose={() => setLightbox(null)} />
    </div>
  );
}

function PhotoCard({ label, photoUrl, onUpload, onDelete }: {
  label: string; photoUrl?: string | null;
  onUpload: (file: File) => void; onDelete: () => void;
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
          <div style={{ background: 'var(--surface-2)' }}>
            <img src={photoUrl} alt={label} style={{ width: '100%', height: 220, objectFit: 'cover', display: 'block' }} />
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
  const [chipQty, setChipQty] = useState(mpn.chip_qty != null ? String(mpn.chip_qty) : '');

  useEffect(() => {
    if (open) {
      setName(mpn.name); setPartType(mpn.part_type);
      setBeforecutQty(mpn.beforecut_weight != null ? String(mpn.beforecut_weight) : '');
      setAftercutQty(mpn.aftercut_weight != null ? String(mpn.aftercut_weight) : '');
      setChipQty(mpn.chip_qty != null ? String(mpn.chip_qty) : '');
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
          chip_qty: chipQty !== '' ? +chipQty : null,
        })}>Save</Button>
      </>}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Field label="Name" span={2}><Input value={name} onChange={setName} autoFocus /></Field>
        <Field label="Part Type" span={2}><Input value={partType} onChange={setPartType} placeholder="e.g. IC" /></Field>
        <Field label="Before Cut Wt"><Input value={beforecutQty} onChange={setBeforecutQty} type="number" placeholder="—" /></Field>
        <Field label="After Cut Wt"><Input value={aftercutQty} onChange={setAftercutQty} type="number" placeholder="—" /></Field>
        <Field label="Chip Qty" span={2}><Input value={chipQty} onChange={setChipQty} type="number" placeholder="—" /></Field>
      </div>
    </Modal>
  );
}

type ChipFormData = { brandId: string; qty: string; chipMpn: string; chipType: string; description: string; photoFile?: File | null; clearPhoto?: boolean; };

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

function AddChipModal({ open, mode = 'add', initial, chipBrands, onClose, onAdd, maxQty }: {
  open: boolean; mode?: 'add' | 'edit'; initial?: Chip | null; chipBrands: ChipBrand[]; onClose: () => void; onAdd: (data: ChipFormData) => void; maxQty?: number;
}) {
  const [brandId, setBrandId] = useState('');
  const [qty, setQty] = useState('1');
  const [chipMpn, setChipMpn] = useState('');
  const [chipType, setChipType] = useState('');
  const [description, setDescription] = useState('');
  const [photo, setPhoto] = useState<{ src: string; name?: string; file?: File } | null>(null);
  const initialPhotoUrl = initial?.chip_photo_url ?? null;

  useEffect(() => {
    if (open) {
      setBrandId(initial?.brand != null ? String(initial.brand) : '');
      setQty(initial?.qty != null ? String(initial.qty) : '1');
      setChipMpn(initial?.chip_mpn ?? '');
      setChipType(initial?.chip_type ?? '');
      setDescription(initial?.description ?? '');
      setPhoto(initial?.chip_photo_url ? { src: initial.chip_photo_url, name: initial.chip_photo_url.split('/').pop() } : null);
    }
  }, [open, initial]);

  const qtyNum = +qty || 0;
  const overLimit = maxQty != null && qtyNum > maxQty;

  const submit = () => {
    if (overLimit) return;
    onAdd({
      brandId, qty, chipMpn, chipType, description,
      photoFile: photo?.file ?? null,
      clearPhoto: !photo && !!initialPhotoUrl,
    });
  };

  return (
    <Modal open={open} onClose={onClose} title={mode === 'edit' ? 'Edit Chip' : 'Add Chip'} width={560}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={overLimit} onClick={submit}>{mode === 'edit' ? 'Save' : 'Add'}</Button>
      </>}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px', gap: 18 }}>
        <div>
          <Field label="Brand"><Select value={brandId} onChange={setBrandId} options={[{ value: '', label: 'No brand' }, ...chipBrands.map(b => ({ value: String(b.id), label: b.name }))]} /></Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
            <Field label="Chip MPN"><Input value={chipMpn} onChange={setChipMpn} placeholder="e.g. TPS62130" autoFocus={mode === 'add'} /></Field>
            <Field label="Type"><Input value={chipType} onChange={setChipType} placeholder="e.g. DC-DC" /></Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 10, marginTop: 12 }}>
            <Field label="Qty">
              <Input value={qty} onChange={setQty} type="number" placeholder="1" />
              {maxQty != null && (
                <div style={{ fontSize: 11, marginTop: 3, color: overLimit ? '#a8472b' : 'var(--ink-4)' }}>
                  {overLimit ? `Exceeds limit — max ${maxQty}` : `${maxQty} remaining`}
                </div>
              )}
            </Field>
            <Field label="Description"><Input value={description} onChange={setDescription} placeholder="Optional" /></Field>
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
