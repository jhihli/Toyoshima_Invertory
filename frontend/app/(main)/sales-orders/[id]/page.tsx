'use client';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/app/lib/api';
import type { SODetail, Pallet, PalletPhoto } from '@/interface/IDatatable';
import { useIsMobile } from '@/app/ui/hooks/useIsMobile';

// ── Icons ──────────────────────────────────────────────────────────────────────
const IPlus = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>;
const IEdit = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>;
const ITrash = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6M9 6V4h6v2"/></svg>;
const IChevR = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>;
const IChevL = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>;
const IExport = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>;
const ISearch = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>;
const IImage = () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>;
const IClose = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>;
const IBox = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>;

// ── Shared styles ──────────────────────────────────────────────────────────────
const BtnPrimary: React.CSSProperties = { height: 36, padding: '0 13px', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', background: 'var(--accent)', color: '#fff', whiteSpace: 'nowrap', fontFamily: 'inherit' };
const BtnGhost: React.CSSProperties = { ...BtnPrimary, background: 'var(--surface)', color: 'var(--ink-2)', border: '1px solid var(--hair-strong)' };
const BtnDanger: React.CSSProperties = { ...BtnPrimary, background: '#b0432b' };
const FieldLabel: React.CSSProperties = { fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 6 };
const InputSty: React.CSSProperties = { width: '100%', height: 40, padding: '0 12px', border: '1px solid var(--hair-strong)', borderRadius: 9, background: 'var(--surface)', fontFamily: 'inherit', fontSize: 14, color: 'var(--ink)', outline: 'none', boxSizing: 'border-box' };
const SelectSty: React.CSSProperties = { ...InputSty, cursor: 'pointer' };
const Th: React.CSSProperties = { textAlign: 'left', padding: '9px 16px', fontWeight: 600, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-3)', borderBottom: '1px solid var(--hair)', whiteSpace: 'nowrap' };
const ThR: React.CSSProperties = { ...Th, textAlign: 'right' };
const Td: React.CSSProperties = { padding: '9px 16px', borderBottom: '1px solid var(--surface-2)', verticalAlign: 'middle', fontSize: 13.5 };
const TdR: React.CSSProperties = { ...Td, textAlign: 'right' };

// ── Toast ───────────────────────────────────────────────────────────────────────
function Toast({ msg, type, onDone }: { msg: string; type: 'ok' | 'err'; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 2800); return () => clearTimeout(t); }, [onDone]);
  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 400, padding: '10px 16px', borderRadius: 9, background: type === 'ok' ? 'var(--accent)' : '#991b1b', color: '#fff', fontSize: 13, boxShadow: '0 4px 24px rgba(0,0,0,0.2)', fontWeight: 500 }}>
      {msg}
    </div>
  );
}

// ── Overlay ─────────────────────────────────────────────────────────────────────
function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,30,20,0.45)', zIndex: 200, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '60px 20px', overflow: 'auto' }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 720 }}>{children}</div>
    </div>
  );
}

// ── Confirm modal ───────────────────────────────────────────────────────────────
function ConfirmModal({ open, title, message, onClose, onConfirm }: {
  open: boolean; title: string; message: React.ReactNode;
  onClose: () => void; onConfirm: () => void;
}) {
  if (!open) return null;
  return (
    <Overlay onClose={onClose}>
      <div style={{ width: 400, maxWidth: '94vw', background: 'var(--surface)', border: '1px solid var(--hair-strong)', borderRadius: 14, boxShadow: '0 24px 60px rgba(20,30,20,0.3)', overflow: 'hidden' }}>
        <div style={{ padding: '24px 24px 12px', textAlign: 'center' }}>
          <div style={{ width: 46, height: 46, borderRadius: 12, background: '#fef2f2', border: '1px solid #fecaca', color: '#b0432b', display: 'grid', placeItems: 'center', margin: '0 auto 12px' }}><ITrash /></div>
          <h2 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 700 }}>{title}</h2>
          <p style={{ margin: 0, fontSize: 13.5, color: 'var(--ink-3)', lineHeight: 1.5 }}>{message}</p>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', padding: '12px 24px 20px' }}>
          <button onClick={onClose} style={BtnGhost}>Cancel</button>
          <button onClick={onConfirm} style={BtnDanger}><ITrash /> Delete</button>
        </div>
      </div>
    </Overlay>
  );
}

// ── Location Picker ─────────────────────────────────────────────────────────────
const LOC_ZONES = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));
const LOC_ROWS = Array.from({ length: 10 }, (_, i) => i + 1);
const LOC_COLS = Array.from({ length: 200 }, (_, i) => i + 1);

function splitLoc(loc: string) {
  const [z = '', r = '', c = ''] = (loc || '').split('-');
  return { z, r, c };
}
function joinLoc({ z, r, c }: { z: string; r: string; c: string }) {
  if (!z && !r && !c) return '';
  return [z, r, c].join('-').replace(/-+$/, '');
}

function LocationPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const parts = splitLoc(value);
  const set = (patch: Partial<typeof parts>) => onChange(joinLoc({ ...parts, ...patch }));
  const complete = parts.z && parts.r && parts.c;
  return (
    <div>
      <div style={{ ...FieldLabel, marginBottom: 6 }}>
        Location <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--ink-4)', fontSize: 11 }}>zone · row · column</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <select value={parts.z} onChange={e => set({ z: e.target.value })} style={{ ...SelectSty, flex: '1 1 80px', minWidth: 0 }}>
          <option value="">Zone</option>
          {LOC_ZONES.map(z => <option key={z} value={z}>{z}</option>)}
        </select>
        <span style={{ color: 'var(--ink-4)', flexShrink: 0 }}>-</span>
        <select value={parts.r} onChange={e => set({ r: e.target.value })} style={{ ...SelectSty, flex: '1 1 80px', minWidth: 0 }}>
          <option value="">Row</option>
          {LOC_ROWS.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <span style={{ color: 'var(--ink-4)', flexShrink: 0 }}>-</span>
        <select value={parts.c} onChange={e => set({ c: e.target.value })} style={{ ...SelectSty, flex: '1 1 80px', minWidth: 0 }}>
          <option value="">Column</option>
          {LOC_COLS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <div style={{ minWidth: 64, padding: '0 8px', height: 40, display: 'flex', alignItems: 'center', borderRadius: 9, background: 'var(--surface-2)', border: '1px solid var(--hair)', fontSize: 13, flexShrink: 0 }}>
          {value
            ? <span className="mono" style={{ color: complete ? 'var(--accent-2)' : 'var(--ink-3)', fontWeight: 600 }}>{value}</span>
            : <span style={{ color: 'var(--ink-5)' }}>Not set</span>}
        </div>
      </div>
    </div>
  );
}

// ── Lightbox ────────────────────────────────────────────────────────────────────
interface LightboxState { images: { src: string; label: string }[]; index: number; }

function Lightbox({ state, onClose }: { state: LightboxState | null; onClose: () => void }) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [idx, setIdx] = useState(0);
  const drag = React.useRef<{ x: number; y: number } | null>(null);

  useEffect(() => { if (state) { setIdx(state.index); setZoom(1); setPan({ x: 0, y: 0 }); } }, [state]);
  useEffect(() => { setZoom(1); setPan({ x: 0, y: 0 }); }, [idx]);

  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === '+' || e.key === '=') setZoom(z => Math.min(5, +(z + 0.25).toFixed(2)));
      else if (e.key === '-' || e.key === '_') setZoom(z => { const nz = Math.max(1, +(z - 0.25).toFixed(2)); if (nz === 1) setPan({ x: 0, y: 0 }); return nz; });
      else if (e.key === '0') { setZoom(1); setPan({ x: 0, y: 0 }); }
      else if (e.key === 'ArrowLeft') setIdx(i => Math.max(0, i - 1));
      else if (e.key === 'ArrowRight') setIdx(i => Math.min((state?.images.length ?? 1) - 1, i + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state, onClose]);

  if (!state) return null;
  const { images } = state;
  const cur = images[idx];

  const zoomBy = (d: number) => setZoom(z => { const nz = Math.min(5, Math.max(1, +(z + d).toFixed(2))); if (nz === 1) setPan({ x: 0, y: 0 }); return nz; });
  const onWheel = (e: React.WheelEvent) => { e.preventDefault(); zoomBy(e.deltaY < 0 ? 0.2 : -0.2); };
  const onDown = (e: React.MouseEvent) => { if (zoom <= 1) return; drag.current = { x: e.clientX - pan.x, y: e.clientY - pan.y }; };
  const onMove = (e: React.MouseEvent) => { if (!drag.current) return; setPan({ x: e.clientX - drag.current.x, y: e.clientY - drag.current.y }); };
  const onUp = () => { drag.current = null; };

  const IconMinus = () => <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>;
  const IconPlus2 = () => <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>;
  const IconReset = () => <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 8a5 5 0 1 1 1.5 3.5M3 11.5V8H6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>;
  const ZoomBtn = ({ onClick, disabled, children, title }: any) => (
    <button onClick={onClick} disabled={disabled} title={title}
      style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.08)', color: disabled ? 'rgba(255,255,255,0.3)' : '#fff', cursor: disabled ? 'default' : 'pointer', display: 'grid', placeItems: 'center' }}>
      {children}
    </button>
  );
  const NavBtn = ({ onClick, disabled, children }: any) => (
    <button onClick={onClick} disabled={disabled}
      style={{ width: 36, height: 36, borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.08)', color: disabled ? 'rgba(255,255,255,0.2)' : '#fff', cursor: disabled ? 'default' : 'pointer', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
      {children}
    </button>
  );

  return (
    <div onClick={onClose} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
      style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(20,24,20,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ width: '90vw', maxWidth: 900, height: '90vh', maxHeight: 800, background: '#1a1e1a', borderRadius: 14, overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,0.6)' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.1)', flexShrink: 0 }}>
          <span className="mono" style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.7)' }}>{cur.label}</span>
          {images.length > 1 && <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{idx + 1} / {images.length}</span>}
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <ZoomBtn onClick={() => zoomBy(-0.25)} disabled={zoom <= 1} title="Zoom out (−)"><IconMinus /></ZoomBtn>
            <span style={{ width: 44, textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.6)', fontVariantNumeric: 'tabular-nums' }}>{Math.round(zoom * 100)}%</span>
            <ZoomBtn onClick={() => zoomBy(0.25)} disabled={zoom >= 5} title="Zoom in (+)"><IconPlus2 /></ZoomBtn>
            <ZoomBtn onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} disabled={zoom === 1} title="Reset (0)"><IconReset /></ZoomBtn>
          </div>
          <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.12)', margin: '0 4px' }} />
          <button onClick={onClose}
            style={{ width: 28, height: 28, borderRadius: 6, border: 'none', background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', display: 'grid', placeItems: 'center', fontSize: 16, lineHeight: 1 }}>×</button>
        </div>
        {/* Stage with nav arrows */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 0, overflow: 'hidden' }}>
          {images.length > 1 && (
            <NavBtn onClick={() => setIdx(i => i - 1)} disabled={idx === 0}>
              <IChevL />
            </NavBtn>
          )}
          <div onWheel={onWheel} onMouseDown={onDown}
            style={{ flex: 1, height: '100%', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: zoom > 1 ? (drag.current ? 'grabbing' : 'grab') : 'default' }}>
            <img src={cur.src} alt={cur.label} draggable={false}
              style={{ maxWidth: '100%', maxHeight: '100%', userSelect: 'none', transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: 'center', transition: drag.current ? 'none' : 'transform .12s ease' }} />
          </div>
          {images.length > 1 && (
            <NavBtn onClick={() => setIdx(i => i + 1)} disabled={idx === images.length - 1}>
              <IChevR />
            </NavBtn>
          )}
        </div>
        {/* Thumbnail strip */}
        {images.length > 1 && (
          <div style={{ display: 'flex', gap: 6, padding: '8px 12px', borderTop: '1px solid rgba(255,255,255,0.08)', overflowX: 'auto', flexShrink: 0 }}>
            {images.map((img, i) => (
              <img key={i} src={img.src} alt="" onClick={() => setIdx(i)}
                style={{ width: 48, height: 48, borderRadius: 6, objectFit: 'cover', cursor: 'pointer', opacity: i === idx ? 1 : 0.45, border: i === idx ? '2px solid var(--accent)' : '2px solid transparent', flexShrink: 0 }} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Multi-Photo Grid ────────────────────────────────────────────────────────────
interface PhotoEntry { id?: number; url: string; }  // id = existing DB photo; no id = pending

function MultiPhotoGrid({
  photos, onAdd, onRemove,
}: {
  photos: PhotoEntry[];
  onAdd: (dataUrls: string[]) => void;
  onRemove: (index: number) => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);

  const pick = (files: FileList) => {
    const readers: Promise<string>[] = Array.from(files).map(file =>
      new Promise(resolve => {
        const r = new FileReader();
        r.onload = e => resolve(e.target?.result as string);
        r.readAsDataURL(file);
      })
    );
    Promise.all(readers).then(urls => onAdd(urls));
  };

  const ThumbSize = 72;

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {photos.map((ph, i) => (
          <div key={ph.id ?? `p-${i}`} style={{ position: 'relative', width: ThumbSize, height: ThumbSize, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--hair-strong)' }}>
            <img src={ph.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <button onClick={() => onRemove(i)}
              style={{ position: 'absolute', top: 3, right: 3, width: 20, height: 20, borderRadius: 5, background: 'rgba(0,0,0,0.6)', border: 'none', color: '#fff', cursor: 'pointer', display: 'grid', placeItems: 'center', lineHeight: 1, fontSize: 12 }}>×</button>
          </div>
        ))}
        {/* Add button */}
        <div onClick={() => inputRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); if (e.dataTransfer.files.length) pick(e.dataTransfer.files); }}
          style={{ width: ThumbSize, height: ThumbSize, borderRadius: 8, border: '1.5px dashed var(--hair-strong)', background: 'var(--surface-2)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--ink-4)', gap: 4 }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          <span style={{ fontSize: 10, fontWeight: 600 }}>Add</span>
        </div>
      </div>
      <input ref={inputRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
        onChange={e => { if (e.target.files?.length) pick(e.target.files); e.target.value = ''; }} />
    </div>
  );
}

// ── Pallet Modal ────────────────────────────────────────────────────────────────
interface PalletFormData {
  barcode: string;
  gateload: string;
  date: string;
  materialType: string;
  location: string;
  inWtGross: string;
  palletQty: string;
  existingPhotos: PhotoEntry[];   // photos already in DB (have id)
  pendingPhotos: string[];        // new base64 data URLs (not yet uploaded)
  removedPhotoIds: number[];      // existing photo IDs to delete on save
}

function palletBlank(): PalletFormData {
  return { barcode: '', gateload: '', date: new Date().toISOString().slice(0, 10), materialType: 'PCB1', location: '', inWtGross: '', palletQty: '1', existingPhotos: [], pendingPhotos: [], removedPhotoIds: [] };
}

function palletToForm(p: Pallet): PalletFormData {
  return {
    barcode: p.licence_number || '',
    gateload: p.gateload_number || '',
    date: p.created_at ? p.created_at.slice(0, 10) : new Date().toISOString().slice(0, 10),
    materialType: p.material_type || '',
    location: p.location || '',
    inWtGross: p.in_weight_gross ? String(Number(p.in_weight_gross)) : '',
    palletQty: String(p.qty ?? 1),
    existingPhotos: (p.photos || []).map(ph => ({ id: ph.id, url: ph.image_url || ph.image })),
    pendingPhotos: [],
    removedPhotoIds: [],
  };
}

function PalletModal({ open, mode, initial, onClose, onSubmit }: {
  open: boolean; mode: 'add' | 'edit'; initial?: Pallet;
  onClose: () => void; onSubmit: (d: any) => Promise<void>;
}) {
  const [f, setF] = useState<PalletFormData>(palletBlank());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setF(initial ? palletToForm(initial) : palletBlank());
    setError('');
  }, [open, initial]);

  const set = (patch: Partial<PalletFormData>) => setF(s => ({ ...s, ...patch }));

  // All photos shown in grid: existing (not removed) + pending previews
  const allPhotos: PhotoEntry[] = [
    ...f.existingPhotos.filter(ph => !f.removedPhotoIds.includes(ph.id!)),
    ...f.pendingPhotos.map(url => ({ url })),
  ];

  const handlePhotoAdd = (dataUrls: string[]) => set({ pendingPhotos: [...f.pendingPhotos, ...dataUrls] });

  const handlePhotoRemove = (index: number) => {
    const ph = allPhotos[index];
    if (ph.id !== undefined) {
      // existing photo → mark for deletion
      set({ removedPhotoIds: [...f.removedPhotoIds, ph.id] });
    } else {
      // pending photo → remove from pending list
      const pendingIndex = index - f.existingPhotos.filter(e => !f.removedPhotoIds.includes(e.id!)).length;
      const newPending = [...f.pendingPhotos];
      newPending.splice(pendingIndex, 1);
      set({ pendingPhotos: newPending });
    }
  };

  const handleSubmit = async () => {
    if (!f.barcode.trim()) return;
    setSaving(true); setError('');
    try {
      await onSubmit({
        licence_number: f.barcode.trim(),
        gateload_number: f.gateload.trim(),
        location: f.location,
        material_type: f.materialType.trim(),
        in_weight_gross: f.inWtGross ? parseFloat(f.inWtGross) : 0,
        qty: parseInt(f.palletQty) || 1,
        pendingPhotos: f.pendingPhotos,
        removedPhotoIds: f.removedPhotoIds,
      });
      onClose();
    } catch (e: any) { setError(e.message || 'Failed to save'); }
    finally { setSaving(false); }
  };

  if (!open) return null;
  const valid = f.barcode.trim();
  const photoCount = allPhotos.length;

  return (
    <Overlay onClose={onClose}>
      <div style={{ width: 680, maxWidth: '96vw', background: 'var(--surface)', border: '1px solid var(--hair-strong)', borderRadius: 14, boxShadow: '0 24px 60px rgba(20,30,20,0.3)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--hair)' }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{mode === 'edit' ? 'Edit Pallet' : 'Add Pallet'}</h2>
          <button onClick={onClose} style={{ marginLeft: 'auto', width: 28, height: 28, borderRadius: 7, background: 'var(--surface-2)', border: '1px solid var(--hair)', color: 'var(--ink-3)', display: 'grid', placeItems: 'center', cursor: 'pointer' }}><IClose /></button>
        </div>
        <div style={{ padding: '18px 20px' }}>
          {error && <div style={{ padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#b91c1c', fontSize: 12.5, marginBottom: 14 }}>{error}</div>}
          {/* Row 1: Barcode + Gateload */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 12 }}>
            <div>
              <div style={FieldLabel}>Barcode</div>
              <input className="mono" value={f.barcode} onChange={e => set({ barcode: e.target.value })} autoFocus placeholder="Scan or type…" style={InputSty} />
            </div>
            <div>
              <div style={FieldLabel}>Gateload No</div>
              <input value={f.gateload} onChange={e => set({ gateload: e.target.value })} placeholder="e.g. 2" style={InputSty} />
            </div>
          </div>
          {/* Row 2: Date + Material type */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 12 }}>
            <div>
              <div style={FieldLabel}>Date</div>
              <input type="date" value={f.date} onChange={e => set({ date: e.target.value })} style={InputSty} />
            </div>
            <div>
              <div style={FieldLabel}>Material Type</div>
              <input value={f.materialType} onChange={e => set({ materialType: e.target.value })} placeholder="e.g. PCB1" style={InputSty} />
            </div>
          </div>
          {/* Location picker */}
          <div style={{ marginBottom: 12 }}>
            <LocationPicker value={f.location} onChange={v => set({ location: v })} />
          </div>
          {/* Row 3: In WT Gross + Pallet Qty */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
            <div>
              <div style={FieldLabel}>In WT Gross (lb)</div>
              <input type="number" step="0.0001" value={f.inWtGross} onChange={e => set({ inWtGross: e.target.value })} placeholder="—" style={InputSty} />
            </div>
            <div>
              <div style={FieldLabel}>Pallet Qty</div>
              <input type="number" min="1" step="1" value={f.palletQty} onChange={e => set({ palletQty: e.target.value })} style={InputSty} />
            </div>
          </div>
          {/* Photos */}
          <div>
            <div style={{ ...FieldLabel, marginBottom: 10 }}>
              Photos <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, fontSize: 11, color: 'var(--ink-4)' }}>
                {photoCount > 0 ? `${photoCount} image${photoCount > 1 ? 's' : ''}` : 'optional'}
              </span>
            </div>
            <MultiPhotoGrid photos={allPhotos} onAdd={handlePhotoAdd} onRemove={handlePhotoRemove} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '14px 20px', borderTop: '1px solid var(--hair)', background: 'var(--surface-2)' }}>
          <button onClick={onClose} style={BtnGhost}>Cancel</button>
          <button onClick={handleSubmit} disabled={!valid || saving} style={{ ...BtnPrimary, height: 40, fontSize: 14, opacity: !valid || saving ? 0.6 : 1, cursor: !valid || saving ? 'not-allowed' : 'pointer' }}>
            {saving ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Add pallet'}
          </button>
        </div>
      </div>
    </Overlay>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────────
export default function SODetailPage() {
  const { id } = useParams<{ id: string }>();
  const soId = Number(id);
  const router = useRouter();
  const isMobile = useIsMobile();

  const [so, setSo] = useState<SODetail | null>(null);
  const [pallets, setPallets] = useState<Pallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterQ, setFilterQ] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  const [palletModal, setPalletModal] = useState<{ mode: 'add' | 'edit'; item?: Pallet } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Pallet | null>(null);
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);
  const showToast = (msg: string, type: 'ok' | 'err' = 'ok') => setToast({ msg, type });

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const soData = await api.sos.get(soId);
      setSo(soData);
      setPallets(soData.pallets || []);
    } catch { showToast('Failed to load', 'err'); }
    setLoading(false);
  }, [soId]);

  useEffect(() => { reload(); }, [reload]);

  const filteredPallets = useMemo(() => {
    const n = filterQ.trim().toLowerCase();
    if (!n) return pallets;
    return pallets.filter(p =>
      [p.licence_number, p.gateload_number, p.location, p.material_type]
        .some(v => (v || '').toLowerCase().includes(n))
    );
  }, [pallets, filterQ]);

  const handleAddPallet = async (d: any) => {
    const { pendingPhotos, removedPhotoIds, ...palletData } = d;
    const nextSeq = pallets.length > 0 ? Math.max(...pallets.map(p => p.pallet_seq)) + 1 : 1;
    const created = await api.pallets.create(soId, { ...palletData, pallet_seq: nextSeq });
    if (created?.id && pendingPhotos?.length) {
      await Promise.all((pendingPhotos as string[]).map(url => api.pallets.photos.upload(created.id, url)));
    }
    await reload(); showToast('Pallet added');
  };
  const handleEditPallet = async (d: any) => {
    if (!palletModal?.item) return;
    const { pendingPhotos, removedPhotoIds, ...palletData } = d;
    await api.pallets.update(soId, palletModal.item.id, palletData);
    if (removedPhotoIds?.length) {
      await Promise.all((removedPhotoIds as number[]).map(pid => api.pallets.photos.delete(palletModal.item!.id, pid)));
    }
    if (pendingPhotos?.length) {
      await Promise.all((pendingPhotos as string[]).map(url => api.pallets.photos.upload(palletModal.item!.id, url)));
    }
    await reload(); showToast('Pallet saved');
  };
  const handleDeletePallet = async () => {
    if (!deleteConfirm) return;
    await api.pallets.delete(soId, deleteConfirm.id);
    await reload(); setDeleteConfirm(null); showToast('Pallet deleted', 'err');
  };

  if (loading) return <div style={{ padding: 40, color: 'var(--ink-4)' }}>Loading…</div>;
  if (!so) return <div style={{ padding: 40, color: '#b91c1c' }}>Order not found.</div>;

  const totalInWt = pallets.reduce((s, p) => s + Number(p.in_weight_gross || 0), 0);
  const totalQty = pallets.reduce((s, p) => s + Number(p.qty || 0), 0);

  const cell = (v: string | null | undefined, d = 4) =>
    (!v || Number(v) === 0) ? <span style={{ color: 'var(--ink-5)' }}>—</span> : Number(v).toFixed(d);

  return (
    <div style={{ padding: isMobile ? '12px 12px 40px' : '22px 28px 40px' }}>

      {/* Hero card */}
      <div style={{ display: 'flex', background: 'var(--surface)', border: '1px solid var(--hair)', borderRadius: 14, overflow: 'hidden', marginBottom: 20 }}>
        {/* Green accent bar */}
        <div style={{ width: 6, flexShrink: 0, background: 'linear-gradient(180deg, #2f7d50, #256b43)' }} />
        {/* Body */}
        <div style={{ flex: 1, minWidth: 0, padding: isMobile ? '14px 14px' : '18px 22px', display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'flex-start' : 'center', gap: isMobile ? 12 : 22, flexWrap: 'wrap' }}>
          {/* Lead + action buttons row on mobile */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', width: '100%', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0 }}>
              <h1 className="mono" style={{ margin: 0, fontSize: isMobile ? 20 : 26, fontWeight: 700, letterSpacing: '-0.01em' }}>{so.so_number}</h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, fontSize: 13.5, color: 'var(--ink-3)' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0, display: 'inline-block' }} />
                Vendor <b style={{ color: 'var(--ink)', fontWeight: 600 }}>{so.vendor_name}</b>
              </div>
              {so.note && <div style={{ marginTop: 5, fontSize: 12.5, color: 'var(--ink-4)', fontStyle: 'italic' }}>{so.note}</div>}
            </div>
            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button onClick={() => router.push('/sales-orders')} style={BtnGhost}><IChevL /> Back</button>
              <button style={BtnGhost}><IExport /> Export</button>
            </div>
          </div>
          {/* Facts */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(5, auto)', gap: isMobile ? '8px 16px' : '5px 22px', textAlign: isMobile ? 'left' : 'right', width: isMobile ? '100%' : undefined }}>
            {([
              ['Inbound', so.inbound_date || '—'],
              ['Outbound', so.outbound_date || '—'],
              ['Pallets', String(so.total_pallet_count ?? so.pallet_record_count)],
              ['Total WT', totalInWt ? `${totalInWt.toFixed(4)} lb` : '—'],
              ['Created', so.created_at ? new Date(so.created_at).toLocaleDateString() : '—'],
            ] as [string, string][]).map(([label, val], i) => (
              <div key={i}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-4)', marginBottom: 3 }}>{label}</div>
                <div className="mono" style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{val}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Pallets card */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--hair)', borderRadius: 12, overflow: 'hidden' }}>

        {/* Card header */}
        {isMobile ? (
          /* Mobile: single compact row + collapsible search */
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: showSearch || filterQ ? 'none' : '1px solid var(--hair)' }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Pallets</h3>
              <span style={{ fontSize: 11, color: 'var(--ink-4)', background: 'var(--surface-2)', border: '1px solid var(--hair)', borderRadius: 99, padding: '1px 7px', fontVariantNumeric: 'tabular-nums' }}>{pallets.length}</span>
              <div style={{ flex: 1 }} />
              <button
                onClick={() => { setShowSearch(s => { if (s) setFilterQ(''); return !s; }); }}
                style={{ width: 34, height: 34, borderRadius: 8, background: showSearch || filterQ ? 'var(--accent)' : 'var(--surface-2)', border: '1px solid var(--hair)', color: showSearch || filterQ ? '#fff' : 'var(--ink-3)', display: 'grid', placeItems: 'center', cursor: 'pointer', flexShrink: 0 }}>
                <ISearch />
              </button>
              <button style={{ ...BtnPrimary, height: 34, padding: '0 11px', fontSize: 13 }} onClick={() => setPalletModal({ mode: 'add' })}>
                <IPlus /> Add
              </button>
            </div>
            {(showSearch || filterQ) && (
              <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--hair)', background: 'var(--surface-2)' }}>
                <div style={{ height: 36, background: 'var(--surface)', border: '1px solid var(--hair-strong)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 7, padding: '0 11px', color: 'var(--ink-4)' }}>
                  <ISearch />
                  <input autoFocus value={filterQ} onChange={e => setFilterQ(e.target.value)} placeholder="Filter pallets…"
                    style={{ flex: 1, border: 0, background: 'transparent', outline: 'none', fontFamily: 'inherit', fontSize: 13, color: 'var(--ink)' }} />
                  {filterQ && <button onClick={() => setFilterQ('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-4)', display: 'flex', padding: 0 }}><IClose /></button>}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Desktop: full header row */
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--hair)', flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 700 }}>Pallets</h3>
            <span style={{ fontSize: 12.5, color: 'var(--ink-4)' }}>{pallets.length} records</span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ height: 34, background: 'var(--surface-2)', border: '1px solid var(--hair)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 7, padding: '0 11px', color: 'var(--ink-4)' }}>
                <ISearch />
                <input value={filterQ} onChange={e => setFilterQ(e.target.value)} placeholder="Filter pallets…"
                  style={{ border: 0, background: 'transparent', outline: 'none', width: 150, fontFamily: 'inherit', fontSize: 13, color: 'var(--ink)' }} />
                {filterQ && <button onClick={() => setFilterQ('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-4)', display: 'flex', padding: 0 }}><IClose /></button>}
              </div>
              <button style={BtnPrimary} onClick={() => setPalletModal({ mode: 'add' })}><IPlus /> Add pallet</button>
            </div>
          </div>
        )}

        {/* Table or Mobile Cards */}
        {pallets.length === 0 ? (
          <div style={{ padding: '48px 20px', textAlign: 'center' }}>
            <div style={{ width: 54, height: 54, borderRadius: 15, background: 'var(--surface-2)', border: '1px solid var(--hair)', display: 'grid', placeItems: 'center', color: 'var(--ink-4)', margin: '0 auto 14px' }}><IBox /></div>
            <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700 }}>No pallets yet</h3>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--ink-3)' }}>Add the first pallet received for this sales order.</p>
            <button style={BtnPrimary} onClick={() => setPalletModal({ mode: 'add' })}><IPlus /> Add pallet</button>
          </div>
        ) : filteredPallets.length === 0 ? (
          <div style={{ padding: '36px 20px', textAlign: 'center' }}>
            <h3 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 700 }}>Nothing matches</h3>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)' }}>Try a different barcode, location, or material.</p>
          </div>
        ) : isMobile ? (
          /* Mobile: card view */
          <div>
            {filteredPallets.map(p => {
              const imgs = (p.photos || []).map(ph => ({ src: ph.image_url || ph.image, label: p.licence_number || `Pallet #${p.pallet_seq}` }));
              const labelSty: React.CSSProperties = { fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-4)', whiteSpace: 'nowrap' };
              const valSty: React.CSSProperties = { fontSize: 13, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' };
              return (
                <div key={p.id} style={{ padding: '14px 16px', borderBottom: '1px solid var(--hair)' }}>
                  {/* Header: barcode + date */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10, gap: 8 }}>
                    <span className="mono" style={{ fontWeight: 700, fontSize: 15 }}>
                      {p.licence_number || <span style={{ color: 'var(--ink-4)', fontWeight: 400, fontSize: 13 }}>No barcode</span>}
                    </span>
                    <span style={{ fontSize: 11.5, color: 'var(--ink-4)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {p.created_at ? new Date(p.created_at).toLocaleDateString('en-CA') : '—'}
                    </span>
                  </div>

                  {/* Body: photo + metadata grid */}
                  <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                    {/* Photo thumbnail */}
                    {imgs.length > 0 && (
                      <div style={{ position: 'relative', flexShrink: 0, cursor: 'zoom-in', alignSelf: 'flex-start' }}
                        onClick={() => setLightbox({ images: imgs, index: 0 })}>
                        <img src={imgs[0].src} alt="" style={{ width: 54, height: 54, borderRadius: 9, objectFit: 'cover', display: 'block', border: '1px solid var(--hair)' }} />
                        {imgs.length > 1 && (
                          <span style={{ position: 'absolute', bottom: 3, right: 3, background: 'rgba(0,0,0,0.65)', color: '#fff', fontSize: 9, fontWeight: 700, borderRadius: 4, padding: '1px 4px', lineHeight: 1.5 }}>
                            +{imgs.length - 1}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Label / value grid */}
                    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '5px 10px', alignItems: 'baseline' }}>
                      {p.location && <>
                        <span style={labelSty}>Location</span>
                        <span className="mono" style={{ ...valSty, color: 'var(--accent-2)', fontWeight: 600 }}>{p.location}</span>
                      </>}
                      {p.gateload_number && <>
                        <span style={labelSty}>Gate</span>
                        <span style={valSty}>{p.gateload_number}</span>
                      </>}
                      {p.material_type && <>
                        <span style={labelSty}>Material</span>
                        <span style={valSty}>{p.material_type}</span>
                      </>}
                      <span style={labelSty}>Weight</span>
                      <span className="mono" style={valSty}>
                        {Number(p.in_weight_gross) > 0 ? `${Number(p.in_weight_gross).toFixed(2)} lb` : <span style={{ color: 'var(--ink-5)' }}>—</span>}
                      </span>
                      <span style={labelSty}>Qty</span>
                      <span className="mono" style={valSty}>{p.qty}</span>
                    </div>
                  </div>

                  {/* Actions: equal-width buttons */}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => setPalletModal({ mode: 'edit', item: p })}
                      style={{ flex: 1, height: 40, borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--hair)', color: 'var(--ink-2)', fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer', fontFamily: 'inherit' }}>
                      <IEdit /> Edit
                    </button>
                    <button onClick={() => setDeleteConfirm(p)}
                      style={{ flex: 1, height: 40, borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--hair)', color: 'var(--ink-3)', fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer', fontFamily: 'inherit' }}>
                      <ITrash /> Delete
                    </button>
                  </div>
                </div>
              );
            })}
            {/* Mobile totals */}
            <div style={{ padding: '10px 16px', background: 'var(--surface-2)', borderTop: '1px solid var(--hair-strong)', display: 'flex', gap: 16, fontSize: 13, fontWeight: 600 }}>
              <span>Total WT: <span className="mono">{totalInWt ? totalInWt.toFixed(4) : '—'} lb</span></span>
              <span>Qty: <span className="mono">{totalQty}</span></span>
            </div>
          </div>
        ) : (
          /* Desktop: table view */
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980 }}>
              <thead>
                <tr>
                  <th style={Th}>Image</th>
                  <th style={Th}>Barcode</th>
                  <th style={Th}>Date</th>
                  <th style={Th}>Location</th>
                  <th style={Th}>Gateload No</th>
                  <th style={Th}>Material Type</th>
                  <th style={ThR}>In WT Gross (lb)</th>
                  <th style={ThR}>Pallet Qty</th>
                  <th style={{ ...Th, width: 72 }}></th>
                </tr>
              </thead>
              <tbody>
                {filteredPallets.map(p => (
                  <tr key={p.id}
                    onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = '#eef5f0'}
                    onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'}>
                    {/* Image */}
                    <td style={Td} onClick={e => e.stopPropagation()}>
                      {(() => {
                        const imgs = (p.photos || []).map(ph => ({ src: ph.image_url || ph.image, label: p.licence_number || `Pallet #${p.pallet_seq}` }));
                        if (!imgs.length) return (
                          <div style={{ width: 44, height: 44, borderRadius: 8, background: 'var(--surface-2)', border: '1px dashed var(--hair-strong)', display: 'grid', placeItems: 'center', color: 'var(--ink-5)' }}>
                            <IImage />
                          </div>
                        );
                        return (
                          <div style={{ position: 'relative', display: 'inline-block', cursor: 'zoom-in' }}
                            onClick={() => setLightbox({ images: imgs, index: 0 })}>
                            <img src={imgs[0].src} alt="" style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover', display: 'block' }} />
                            {imgs.length > 1 && (
                              <span style={{ position: 'absolute', bottom: 2, right: 2, background: 'rgba(0,0,0,0.65)', color: '#fff', fontSize: 9, fontWeight: 700, borderRadius: 4, padding: '1px 4px', lineHeight: 1.5 }}>
                                +{imgs.length - 1}
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                    {/* Barcode (licence_number) */}
                    <td style={Td}>
                      <span className="mono" style={{ fontWeight: 600, fontSize: 13 }}>
                        {p.licence_number || <span style={{ color: 'var(--ink-5)' }}>—</span>}
                      </span>
                    </td>
                    {/* Date */}
                    <td style={{ ...Td, color: 'var(--ink-3)', fontVariantNumeric: 'tabular-nums', fontSize: 13 }}>
                      {p.created_at ? new Date(p.created_at).toLocaleDateString('en-CA') : '—'}
                    </td>
                    {/* Location */}
                    <td style={Td}>
                      <span className="mono" style={{ color: p.location ? 'var(--ink-2)' : 'var(--ink-5)', fontSize: 13 }}>
                        {p.location || '—'}
                      </span>
                    </td>
                    {/* Gateload */}
                    <td style={{ ...Td, fontSize: 13 }}>
                      {p.gateload_number || <span style={{ color: 'var(--ink-5)' }}>—</span>}
                    </td>
                    {/* Material */}
                    <td style={{ ...Td, fontSize: 13 }}>
                      {p.material_type || <span style={{ color: 'var(--ink-5)' }}>—</span>}
                    </td>
                    {/* In WT Gross */}
                    <td style={{ ...TdR, fontVariantNumeric: 'tabular-nums' }}>{cell(p.in_weight_gross)}</td>
                    {/* Pallet Qty */}
                    <td style={{ ...TdR, fontVariantNumeric: 'tabular-nums' }}>{p.qty}</td>
                    {/* Actions */}
                    <td style={TdR} onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 5, justifyContent: 'flex-end' }}>
                        <button title="Edit" onClick={() => setPalletModal({ mode: 'edit', item: p })}
                          style={{ width: 30, height: 30, borderRadius: 7, background: 'var(--surface-2)', border: '1px solid var(--hair)', color: 'var(--ink-3)', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
                          <IEdit />
                        </button>
                        <button title="Delete" onClick={() => setDeleteConfirm(p)}
                          style={{ width: 30, height: 30, borderRadius: 7, background: 'var(--surface-2)', border: '1px solid var(--hair)', color: 'var(--ink-3)', display: 'grid', placeItems: 'center', cursor: 'pointer' }}
                          onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.color = '#b0432b'; el.style.background = '#fef2f2'; el.style.borderColor = '#fecaca'; }}
                          onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.color = 'var(--ink-3)'; el.style.background = 'var(--surface-2)'; el.style.borderColor = 'var(--hair)'; }}>
                          <ITrash />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>

              {/* Total row */}
              <tfoot>
                <tr style={{ background: 'var(--surface-2)' }}>
                  <td style={{ ...Td, borderTop: '1px solid var(--hair-strong)', borderBottom: 'none' }}></td>
                  <td style={{ ...Td, borderTop: '1px solid var(--hair-strong)', borderBottom: 'none', fontWeight: 700 }}>Total</td>
                  <td colSpan={4} style={{ ...Td, borderTop: '1px solid var(--hair-strong)', borderBottom: 'none' }}></td>
                  <td style={{ ...TdR, borderTop: '1px solid var(--hair-strong)', borderBottom: 'none', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                    {totalInWt ? totalInWt.toFixed(4) : '—'}
                  </td>
                  <td style={{ ...TdR, borderTop: '1px solid var(--hair-strong)', borderBottom: 'none', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                    {totalQty}
                  </td>
                  <td style={{ ...Td, borderTop: '1px solid var(--hair-strong)', borderBottom: 'none' }}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Lightbox */}
      <Lightbox state={lightbox} onClose={() => setLightbox(null)} />

      {/* Modals */}
      <PalletModal open={!!palletModal} mode={palletModal?.mode || 'add'} initial={palletModal?.item}
        onClose={() => setPalletModal(null)}
        onSubmit={palletModal?.mode === 'edit' ? handleEditPallet : handleAddPallet} />
      <ConfirmModal open={!!deleteConfirm}
        title="Delete pallet?"
        message={<>Pallet <b className="mono">{deleteConfirm?.licence_number || `#${deleteConfirm?.pallet_seq}`}</b> and its cargo will be permanently removed.</>}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={handleDeletePallet} />
      {toast && <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  );
}
