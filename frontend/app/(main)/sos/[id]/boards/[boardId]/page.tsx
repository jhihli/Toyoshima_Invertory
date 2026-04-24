'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  Button, Modal, Card, Breadcrumbs, Select, Input, EditableCell,
  Empty, Field, useToast, thS, tdS, ghostBtn,
} from '@/app/ui/components';
import { api } from '@/app/lib/api';
import type { Board, Chip, ChipBrand } from '@/interface/IDatatable';

export default function BoardDetailPage() {
  const router = useRouter();
  const { id: soId, boardId } = useParams<{ id: string; boardId: string }>();
  const toast = useToast();

  const [board, setBoard] = useState<Board | null>(null);
  const [chipBrands, setChipBrands] = useState<ChipBrand[]>([]);
  const [loading, setLoading] = useState(true);
  const [addChipOpen, setAddChipOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const [b, brands] = await Promise.all([
        api.boards.get(Number(boardId)),
        api.chipBrands.list(),
      ]);
      setBoard(b);
      setChipBrands(brands);
    } catch { toast('Failed to load board'); }
    finally { setLoading(false); }
  }, [boardId]);

  useEffect(() => { load(); }, [load]);

  if (loading || !board) {
    return <div style={{ padding: '24px 28px', color: 'var(--ink-3)', fontSize: 13 }}>Loading…</div>;
  }

  const totalChips = board.chips.reduce((s, c) => s + c.qty, 0);

  const handleUpdateChip = async (chipId: number, patch: Partial<Chip>) => {
    try {
      const updated = await api.chips.update(board.id, chipId, patch);
      setBoard(b => b ? { ...b, chips: b.chips.map(c => c.id === chipId ? updated : c) } : b);
      toast('Chip updated');
    } catch { toast('Failed to update chip'); }
  };

  const handleDeleteChip = async (chipId: number) => {
    try {
      await api.chips.delete(board.id, chipId);
      setBoard(b => b ? { ...b, chips: b.chips.filter(c => c.id !== chipId) } : b);
      toast('Chip removed');
    } catch { toast('Failed to delete chip'); }
  };

  const handleAddChip = async (brandId: string, qty: string, note: string) => {
    try {
      const chip = await api.chips.create(board.id, { brand: +brandId || null, qty: +qty, note });
      setBoard(b => b ? { ...b, chips: [...b.chips, chip] } : b);
      toast('Chip added');
    } catch { toast('Failed to add chip'); }
  };

  const handleSaveEdit = async (patch: { barcode: string; catalog: string; mpn: string; weight: string; qty: string; note: string }) => {
    try {
      const updated = await api.boards.update(board.id, {
        barcode: patch.barcode, catalog: patch.catalog, mpn: patch.mpn,
        weight: patch.weight as any, qty: +patch.qty, note: patch.note,
      });
      setBoard(b => b ? { ...b, ...updated } : b);
      toast('Board updated');
    } catch { toast('Failed to update board'); }
  };

  const handleDelete = async () => {
    try {
      await api.boards.delete(board.id);
      toast('Board deleted');
      router.push(`/sos/${soId}`);
    } catch { toast('Failed to delete board'); }
  };

  const handlePhotoUpload = async (file: File | null | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast('Please select an image file'); return; }
    try {
      const updated = await api.boards.uploadPhoto(board.id, file);
      setBoard(b => b ? { ...b, photo: updated.photo, photo_url: updated.photo_url } : b);
      toast('Photo updated');
    } catch { toast('Failed to upload photo'); }
  };

  const handlePhotoDelete = async () => {
    if (!confirm('Remove this photo?')) return;
    try {
      await api.boards.deletePhoto(board.id);
      setBoard(b => b ? { ...b, photo: null, photo_url: null } : b);
      toast('Photo removed');
    } catch { toast('Failed to remove photo'); }
  };

  const fields: [string, any, string][] = [
    ['Barcode', board.barcode, 'mono'],
    ['Catalog', board.catalog || '—', 'mono'],
    ['MPN', board.mpn || '—', 'mono'],
    ['Weight (lb)', board.weight ? parseFloat(board.weight).toFixed(2) : '—', 'num'],
    ['Quantity', board.qty, 'num'],
    ['Scanned At', board.scanned_at?.slice(0, 16), 'num'],
  ];

  return (
    <div className="fade-in" style={{ padding: '24px 28px 40px' }}>
      <Breadcrumbs items={[
        { label: 'Home', onClick: () => router.push('/dashboard') },
        { label: 'Sales Orders', onClick: () => router.push('/sos') },
        { label: `SO ${soId}`, onClick: () => router.push(`/sos/${soId}`) },
        { label: board.mpn || board.barcode || `Board #${board.id}` },
      ]} />

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', margin: '14px 0 20px' }}>
        <div>
          <h1 className="mono" style={{ margin: 0, fontSize: 20, fontWeight: 400 }}>{board.mpn || board.barcode || `Board #${board.id}`}</h1>
          <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 6 }}>
            SO {soId} · Scanned {board.scanned_at?.slice(0, 10)}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="outline" icon={<EditIcon />} onClick={() => setEditOpen(true)}>Edit</Button>
          <Button variant="danger" icon={<TrashIcon />} onClick={() => setConfirmDelete(true)}>Delete</Button>
        </div>
      </div>

      {/* Split: photo | fields */}
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 20, marginBottom: 24 }}>
        <div>
          <PhotoThumb url={board.photo_url} size={320} />
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <Button size="sm" variant="outline" icon={<UploadIcon />}
              onClick={() => photoInputRef.current?.click()}
              style={{ flex: 1, justifyContent: 'center' }}>
              Replace photo
            </Button>
            {board.photo_url && (
              <Button size="sm" variant="ghost" icon={<TrashIcon />} onClick={handlePhotoDelete}
                style={{ color: 'var(--err)' }} />
            )}
          </div>
          <input ref={photoInputRef} type="file" accept="image/*" style={{ display: 'none' }}
            onChange={e => { handlePhotoUpload(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
        <Card pad={0}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
            {fields.map(([k, v, cls], i) => (
              <div key={k} style={{
                padding: '18px 22px',
                borderBottom: i < 4 ? '1px solid var(--hair)' : 'none',
                borderRight: i % 2 === 0 ? '1px solid var(--hair)' : 'none',
              }}>
                <div style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-4)', marginBottom: 6 }}>{k}</div>
                <div className={cls} style={{ fontSize: 14, color: 'var(--ink)' }}>{v}</div>
              </div>
            ))}
          </div>
          {board.note && (
            <div style={{ padding: '14px 22px', borderTop: '1px solid var(--hair)', background: 'var(--surface-2)', display: 'flex', gap: 10 }}>
              <span style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-4)', marginTop: 2 }}>Note</span>
              <span style={{ fontSize: 12.5, color: 'var(--ink-2)', flex: 1 }}>{board.note}</span>
            </div>
          )}
        </Card>
      </div>

      {/* Chips */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 10, borderBottom: '1px solid var(--hair)', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
          <span style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>Chips</span>
          <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
            <span className="num" style={{ color: 'var(--ink)' }}>{board.chips.length}</span>
            <span style={{ color: 'var(--ink-4)' }}> brand{board.chips.length === 1 ? '' : 's'} · </span>
            <span className="num" style={{ color: 'var(--ink)' }}>{totalChips}</span>
            <span style={{ color: 'var(--ink-4)' }}> total chip{totalChips === 1 ? '' : 's'}</span>
          </span>
        </div>
        <Button size="sm" variant="outline" icon={<PlusIcon />} onClick={() => setAddChipOpen(true)}>Add chip</Button>
      </div>

      <div style={{ border: '1px solid var(--hair)', borderRadius: 3, background: 'var(--surface)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thS}>Brand</th>
              <th style={{ ...thS, textAlign: 'right', width: 120 }}>Qty</th>
              <th style={thS}>Note</th>
              <th style={{ ...thS, width: 60 }}></th>
            </tr>
          </thead>
          <tbody>
            {board.chips.length === 0 && (
              <tr><td colSpan={4}><Empty label="No chips recorded" sub="Click 'Add chip' to start." /></td></tr>
            )}
            {board.chips.map(c => {
              const brand = chipBrands.find(cb => cb.id === c.brand);
              return (
                <tr key={c.id} style={{ borderBottom: '1px solid var(--hair)' }}>
                  <td style={tdS}>{brand?.name || c.brand_name || '—'}</td>
                  <td style={{ ...tdS, textAlign: 'right' }} className="num">
                    <EditableCell value={c.qty} type="number" align="right"
                      onSave={v => handleUpdateChip(c.id, { qty: +v })} />
                  </td>
                  <td style={{ ...tdS, color: 'var(--ink-3)' }}>
                    <EditableCell value={c.note} onSave={v => handleUpdateChip(c.id, { note: v })} />
                  </td>
                  <td style={{ ...tdS, textAlign: 'right' }}>
                    <button onClick={() => handleDeleteChip(c.id)} style={ghostBtn}><TrashIcon /></button>
                  </td>
                </tr>
              );
            })}
            {board.chips.length > 0 && (
              <tr style={{ background: 'var(--surface-2)' }}>
                <td style={{ ...tdS, fontSize: 11, color: 'var(--ink-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Total Chips</td>
                <td style={{ ...tdS, textAlign: 'right' }} className="num">{totalChips}</td>
                <td colSpan={2} />
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <AddChipModal open={addChipOpen} chipBrands={chipBrands} onClose={() => setAddChipOpen(false)} onAdd={handleAddChip} />

      {/* Edit board modal */}
      <EditBoardModal open={editOpen} board={board} onClose={() => setEditOpen(false)} onSave={handleSaveEdit} />

      {/* Delete confirmation modal */}
      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete board?" width={420}
        footer={<>
          <Button variant="ghost" onClick={() => setConfirmDelete(false)}>Cancel</Button>
          <Button variant="danger" icon={<TrashIcon />} onClick={() => { setConfirmDelete(false); handleDelete(); }}>
            Delete board
          </Button>
        </>}>
        <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.6 }}>
          Delete board <span className="mono" style={{ color: 'var(--ink)' }}>{board.mpn || board.barcode}</span> from
          SO <span className="mono" style={{ color: 'var(--ink)' }}>{soId}</span>?
        </div>
        {board.chips.length > 0 && (
          <div style={{ marginTop: 10, padding: '8px 12px', background: 'var(--surface-2)',
            border: '1px solid var(--hair)', borderRadius: 3, fontSize: 11.5, color: 'var(--ink-3)' }}>
            This will also remove <span className="num" style={{ color: 'var(--ink-2)' }}>{board.chips.length}</span> chip
            record{board.chips.length === 1 ? '' : 's'} (<span className="num">{totalChips}</span> total chips).
          </div>
        )}
        <div style={{ marginTop: 10, fontSize: 11.5, color: 'var(--ink-4)' }}>
          This action cannot be undone.
        </div>
      </Modal>
    </div>
  );
}

// ─── Edit Board Modal ─────────────────────────────────────────────
function EditBoardModal({ open, board, onClose, onSave }: {
  open: boolean; board: Board; onClose: () => void;
  onSave: (d: { barcode: string; catalog: string; mpn: string; weight: string; qty: string; note: string }) => void;
}) {
  const [barcode, setBarcode] = useState('');
  const [catalog, setCatalog] = useState('');
  const [mpn, setMpn] = useState('');
  const [weight, setWeight] = useState('');
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  useEffect(() => {
    if (open && board) {
      setBarcode(board.barcode || '');
      setCatalog(board.catalog || '');
      setMpn(board.mpn || '');
      setWeight(board.weight ? parseFloat(board.weight).toString() : '');
      setQty(String(board.qty ?? ''));
      setNote(board.note || '');
    }
  }, [open, board]);
  const canSave = mpn.trim() && catalog.trim() && qty.trim();
  return (
    <Modal open={open} onClose={onClose} title="Edit board" width={520}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={!canSave}
          onClick={() => { onSave({ barcode, catalog, mpn, weight, qty, note }); onClose(); }}>
          Save changes
        </Button>
      </>}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Field label="MPN" span={2}>
          <Input value={mpn} onChange={setMpn} placeholder="NVMe-PCIe4-1T" autoFocus
            style={{ fontFamily: 'ui-monospace, monospace' }} />
        </Field>
        <Field label="Catalog"><Input value={catalog} onChange={setCatalog} placeholder="SSD-C3" /></Field>
        <Field label="Barcode">
          <Input value={barcode} onChange={setBarcode} placeholder="BC-000-0000"
            style={{ fontFamily: 'ui-monospace, monospace' }} />
        </Field>
        <Field label="Weight (lb)"><Input value={weight} onChange={setWeight} type="number" placeholder="0.00" /></Field>
        <Field label="Qty"><Input value={qty} onChange={setQty} type="number" placeholder="1" /></Field>
        <Field label="Note" span={2}>
          <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Optional…" rows={2}
            style={{ width: '100%', padding: '6px 10px', border: '1px solid var(--hair-strong)',
              background: 'var(--surface)', borderRadius: 3, resize: 'vertical',
              fontSize: 13, color: 'var(--ink)', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
        </Field>
      </div>
    </Modal>
  );
}

// ─── Add Chip Modal ────────────────────────────────────────────────
function AddChipModal({ open, chipBrands, onClose, onAdd }: {
  open: boolean; chipBrands: ChipBrand[];
  onClose: () => void; onAdd: (brandId: string, qty: string, note: string) => void;
}) {
  const [brand, setBrand] = useState('');
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  useEffect(() => { if (open) { setBrand(''); setQty(''); setNote(''); } }, [open]);
  return (
    <Modal open={open} onClose={onClose} title="Add chip" width={440}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={!qty} onClick={() => { onAdd(brand, qty, note); onClose(); }}>Add</Button>
      </>}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Field label="Brand" span={2}>
          <Select value={brand} onChange={setBrand} placeholder="Select brand"
            options={chipBrands.map(c => ({ value: String(c.id), label: c.name }))} />
        </Field>
        <Field label="Qty"><Input value={qty} onChange={setQty} type="number" placeholder="0" /></Field>
        <Field label="Note"><Input value={note} onChange={setNote} placeholder="Optional" /></Field>
      </div>
    </Modal>
  );
}

// ─── Photo Thumb ──────────────────────────────────────────────────
function PhotoThumb({ url, size = 120 }: { url?: string | null; size?: number }) {
  return (
    <div style={{
      width: size, height: size, border: '1px solid var(--hair-strong)', borderRadius: 3,
      background: url ? `url(${url}) center/cover` : 'linear-gradient(135deg, oklch(92% 0.02 30) 0%, oklch(85% 0.015 45) 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {!url && <div className="mono" style={{ fontSize: 9, color: 'var(--ink-3)', letterSpacing: '0.05em', opacity: 0.6 }}>PHOTO</div>}
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────
const PlusIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);
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
const UploadIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);
