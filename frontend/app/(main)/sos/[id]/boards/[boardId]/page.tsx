'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  Button, Modal, Card, Breadcrumbs, Select, Input, EditableCell,
  Empty, Field, useToast, thS, tdS, ghostBtn,
} from '@/app/ui/components';
import { api } from '@/app/lib/api';
import type { Board, Chip, ChipBrand } from '@/interface/IDatatable';
import { useIsMobile } from '@/app/ui/hooks/useIsMobile';

export default function BoardDetailPage() {
  const router = useRouter();
  const { id: soId, boardId } = useParams<{ id: string; boardId: string }>();
  const toast = useToast();

  const isMobile = useIsMobile();
  const [board, setBoard] = useState<Board | null>(null);
  const [chipBrands, setChipBrands] = useState<ChipBrand[]>([]);
  const [loading, setLoading] = useState(true);
  const [addChipOpen, setAddChipOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const actionMenuRef = useRef<HTMLDivElement>(null);

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
  useEffect(() => {
    if (!actionMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (actionMenuRef.current && !actionMenuRef.current.contains(e.target as Node)) {
        setActionMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [actionMenuOpen]);

  if (loading || !board) {
    return <div className="page-pad" style={{ color: 'var(--ink-3)', fontSize: 13 }}>Loading…</div>;
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

  const handleAddChip = async (brandId: string, qty: string, description: string) => {
    try {
      const chip = await api.chips.create(board.id, { brand: +brandId || null, qty: +qty, description });
      setBoard(b => b ? { ...b, chips: [...b.chips, chip] } : b);
      toast('Chip added');
    } catch { toast('Failed to add chip'); }
  };

  const handleSaveEdit = async (patch: { barcode: string; mpn: string; qty: string }) => {
    try {
      const updated = await api.boards.update(board.id, {
        barcode: patch.barcode, mpn: patch.mpn,
        qty: +patch.qty,
      } as any);
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
    ['MPN', board.mpn?.name || '—', 'mono'],
    ['Quantity', board.qty, 'num'],
    ['Scanned At', board.scanned_at?.slice(0, 16).replace('T', ' '), 'num'],
  ];

  return (
    <div className="fade-in page-pad">
      <Breadcrumbs items={[
        { label: 'Home', onClick: () => router.push('/dashboard') },
        { label: 'Sales Orders', onClick: () => router.push('/sos') },
        { label: `SO ${soId}`, onClick: () => router.push(`/sos/${soId}`) },
        { label: board.mpn?.name || board.barcode || `Board #${board.id}` },
      ]} />

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', margin: isMobile ? '10px 0 14px' : '14px 0 20px', gap: 10 }}>
        <div>
          {isMobile ? (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <h1 className="mono" style={{ margin: 0, fontSize: 20, fontWeight: 400 }}>{board.mpn?.name || board.barcode || `Board #${board.id}`}</h1>
              <span style={{ fontSize: 12, color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>SO {soId} · {board.scanned_at?.slice(0, 10)}</span>
            </div>
          ) : (
            <>
              <h1 className="mono" style={{ margin: 0, fontSize: 20, fontWeight: 400 }}>{board.mpn?.name || board.barcode || `Board #${board.id}`}</h1>
              <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 6 }}>SO {soId} · Scanned {board.scanned_at?.slice(0, 10)}</div>
            </>
          )}
        </div>

        {isMobile ? (
          <div ref={actionMenuRef} style={{ position: 'relative', flexShrink: 0 }}>
            <button onClick={() => setActionMenuOpen(o => !o)} style={{
              background: actionMenuOpen ? 'var(--surface-2)' : 'var(--surface)',
              border: '1px solid var(--hair-strong)', borderRadius: 3,
              width: 36, height: 36, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink)',
            }}>
              <DotsVerticalIcon />
            </button>
            {actionMenuOpen && (
              <div style={{
                position: 'absolute', right: 0, top: 42, zIndex: 60,
                background: 'var(--surface)', border: '1px solid var(--hair)',
                borderRadius: 4, boxShadow: '0 4px 16px rgba(26,25,23,0.12)',
                minWidth: 148, overflow: 'hidden',
              }}>
                {([
                  { label: 'Edit', icon: <EditIcon />, danger: false, action: () => { setEditOpen(true); setActionMenuOpen(false); } },
                  { label: 'Delete', icon: <TrashIcon />, danger: true, action: () => { setConfirmDelete(true); setActionMenuOpen(false); } },
                ] as { label: string; icon: React.ReactNode; danger: boolean; action: () => void }[]).map((item, i, arr) => (
                  <button key={item.label} onClick={item.action} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    width: '100%', padding: '11px 14px', border: 0,
                    borderBottom: i < arr.length - 1 ? '1px solid var(--hair)' : 'none',
                    background: 'none', cursor: 'pointer', fontSize: 13,
                    color: item.danger ? 'var(--err)' : 'var(--ink)', textAlign: 'left',
                  }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                  >
                    {item.icon}{item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <Button variant="outline" icon={<EditIcon />} onClick={() => setEditOpen(true)}>Edit</Button>
            <Button variant="danger" icon={<TrashIcon />} onClick={() => setConfirmDelete(true)}>Delete</Button>
          </div>
        )}
      </div>

      {/* Hidden file input — shared between mobile and desktop */}
      <input ref={photoInputRef} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={e => { handlePhotoUpload(e.target.files?.[0]); e.target.value = ''; }} />

      {/* Split: photo | fields */}
      {isMobile ? (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            {/* Compact photo column */}
            <div style={{ flexShrink: 0 }}>
              <PhotoThumb url={board.photo_url} size={130} onClick={board.photo_url ? () => setLightboxOpen(true) : undefined} />
              <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                <button onClick={() => photoInputRef.current?.click()} style={{
                  flex: 1, fontSize: 11, color: 'var(--ink-3)',
                  background: 'none', border: '1px solid var(--hair-strong)',
                  borderRadius: 3, padding: '4px 0', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                }}>
                  <UploadIcon /> Replace
                </button>
                {board.photo_url && (
                  <button onClick={handlePhotoDelete} style={{
                    background: 'none', border: '1px solid var(--hair-strong)',
                    borderRadius: 3, padding: '4px 6px', cursor: 'pointer',
                    color: 'var(--err)', display: 'flex', alignItems: 'center',
                  }}>
                    <TrashIcon />
                  </button>
                )}
              </div>
            </div>
            {/* Key-value list */}
            <div style={{ flex: 1, minWidth: 0 }}>
              {fields.map(([k, v, cls]) => (
                <div key={k} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                  padding: '6px 0', borderBottom: '1px solid var(--hair)',
                }}>
                  <span style={{ fontSize: 10.5, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.1em', flexShrink: 0, marginRight: 8 }}>{k}</span>
                  <span className={cls as string} style={{ fontSize: 12.5, color: 'var(--ink)', textAlign: 'right', wordBreak: 'break-all' }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 20, marginBottom: 24 }}>
          <div>
            <PhotoThumb url={board.photo_url} size={320} onClick={board.photo_url ? () => setLightboxOpen(true) : undefined} />
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
                  <div className={cls as string} style={{ fontSize: 14, color: 'var(--ink)' }}>{v}</div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Chips */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 10,
          background: 'var(--accent-light)', padding: '9px 16px',
          borderRadius: 3,
        }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--accent-2)', letterSpacing: '0.02em' }}>Chips</span>
          <span className="num" style={{
            fontSize: 11, color: 'var(--accent-2)',
            background: 'rgba(45,106,79,0.15)', padding: '1px 7px', borderRadius: 10, lineHeight: 1.6,
          }}>{board.chips.length} brand{board.chips.length === 1 ? '' : 's'}</span>
          <span className="num" style={{
            fontSize: 11, color: 'var(--accent-2)',
            background: 'rgba(45,106,79,0.15)', padding: '1px 7px', borderRadius: 10, lineHeight: 1.6,
          }}>{totalChips} chip{totalChips === 1 ? '' : 's'}</span>
        </div>
        <Button size="sm" variant="primary" icon={<PlusIcon />} onClick={() => setAddChipOpen(true)}>Add chip</Button>
      </div>

      <div style={{ border: '1px solid var(--hair)', borderRadius: 3, background: 'var(--surface)' }}>
        <div className="table-scroll">
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
                    <EditableCell value={c.description} onSave={v => handleUpdateChip(c.id, { description: v })} />
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
      </div>

      {/* Photo lightbox */}
      <Modal open={lightboxOpen && !!board.photo_url} onClose={() => setLightboxOpen(false)} title="Photo" width={720}>
        {board.photo_url && (
          <img src={board.photo_url} alt="Board photo"
            style={{ width: '100%', maxHeight: '80vh', objectFit: 'contain', borderRadius: 3, display: 'block' }} />
        )}
      </Modal>

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
          Delete board <span className="mono" style={{ color: 'var(--ink)' }}>{board.mpn?.name || board.barcode}</span> from
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
  onSave: (d: { barcode: string; mpn: string; qty: string }) => void;
}) {
  const [barcode, setBarcode] = useState('');
  const [mpn, setMpn] = useState('');
  const [qty, setQty] = useState('');
  useEffect(() => {
    if (open && board) {
      setBarcode(board.barcode || '');
      setMpn(board.mpn?.name || '');
      setQty(String(board.qty ?? ''));
    }
  }, [open, board]);
  const canSave = mpn.trim() && qty.trim();
  return (
    <Modal open={open} onClose={onClose} title="Edit board" width={520}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={!canSave}
          onClick={() => { onSave({ barcode, mpn, qty }); onClose(); }}>
          Save changes
        </Button>
      </>}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Field label="MPN" span={2}>
          <Input value={mpn} onChange={setMpn} placeholder="NVMe-PCIe4-1T" autoFocus
            style={{ fontFamily: 'ui-monospace, monospace' }} />
        </Field>
        <Field label="Barcode">
          <Input value={barcode} onChange={setBarcode} placeholder="BC-000-0000"
            style={{ fontFamily: 'ui-monospace, monospace' }} />
        </Field>
        <Field label="Qty"><Input value={qty} onChange={setQty} type="number" placeholder="1" /></Field>
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
function PhotoThumb({ url, size = 120, onClick }: { url?: string | null; size?: number; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        width: size, height: size, border: '1px solid var(--hair-strong)', borderRadius: 3,
        background: url ? `url(${url}) center/cover` : 'linear-gradient(135deg, oklch(92% 0.02 30) 0%, oklch(85% 0.015 45) 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: onClick ? 'zoom-in' : 'default',
      }}
    >
      {!url && <div className="mono" style={{ fontSize: 9, color: 'var(--ink-3)', letterSpacing: '0.05em', opacity: 0.6 }}>PHOTO</div>}
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────
const DotsVerticalIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <circle cx="8" cy="2.5" r="1.5" /><circle cx="8" cy="8" r="1.5" /><circle cx="8" cy="13.5" r="1.5" />
  </svg>
);
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
