'use client';
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import {
  Button, Input, Select, Modal, Pagination, Breadcrumbs, Tabs,
  Card, SectionHeader, EditableCell, Field, Empty, useToast,
  thS, tdS, ghostBtn,
} from '@/app/ui/components';
import { api } from '@/app/lib/api';
import { WeightRuleField } from '../WeightRuleField';
import type { SODetail, Pallet, Board, Chip, ChipBrand, Vendor } from '@/interface/IDatatable';

const BOARDS_PAGE_SIZE = 20;

export default function SODetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const soId = Number(id);
  const toast = useToast();

  const [so, setSo] = useState<SODetail | null>(null);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [chipBrands, setChipBrands] = useState<ChipBrand[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'pallets' | 'boards'>('pallets');
  const [editMeta, setEditMeta] = useState(false);
  const [addPalletOpen, setAddPalletOpen] = useState(false);
  const [addBoardOpen, setAddBoardOpen] = useState(false);
  const [lightbox, setLightbox] = useState<SODetail['photos'][0] | null>(null);
  const [expandedBoard, setExpandedBoard] = useState<number | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Board pagination + filter state
  const [boards, setBoards] = useState<Board[]>([]);
  const [boardTotal, setBoardTotal] = useState(0);
  const [boardPage, setBoardPage] = useState(1);
  const [boardDateFrom, setBoardDateFrom] = useState('');
  const [boardDateTo, setBoardDateTo] = useState('');
  const [boardPalletFilter, setBoardPalletFilter] = useState('');

  const loadSO = useCallback(async () => {
    try {
      const data = await api.sos.get(soId);
      setSo(data);
    } catch { toast('Failed to load SO'); }
    finally { setLoading(false); }
  }, [soId]);

  const loadBoards = useCallback(async () => {
    if (!soId) return;
    try {
      const params: Record<string, string | number> = {
        date_from: boardDateFrom, date_to: boardDateTo,
        page: boardPage, page_size: BOARDS_PAGE_SIZE,
      };
      if (boardPalletFilter) params.pallet = boardPalletFilter;
      const res = await api.boards.listBySO(soId, params);
      setBoards(res.results);
      setBoardTotal(res.total);
    } catch {}
  }, [soId, boardDateFrom, boardDateTo, boardPage, boardPalletFilter]);

  useEffect(() => { loadSO(); }, [loadSO]);
  useEffect(() => { if (tab === 'boards') loadBoards(); }, [tab, loadBoards]);
  useEffect(() => { api.vendors.list().then(setVendors).catch(() => {}); }, []);
  useEffect(() => { api.chipBrands.list().then(setChipBrands).catch(() => {}); }, []);

  if (loading || !so) {
    return <div style={{ padding: '24px 28px', color: 'var(--ink-3)', fontSize: 13 }}>Loading…</div>;
  }

  const vendor = vendors.find(v => v.id === so.vendor);
  const effectiveRule = so.effective_weight_rule;
  const ruleIsOverride = so.weight_rule && so.weight_rule !== so.vendor_weight_rule;

  const palletTotal = so.pallets.reduce((acc, p) => ({
    weight: acc.weight + parseFloat(p.weight),
    qty: acc.qty + p.qty,
    boardQty: acc.boardQty + (p.board_qty ?? 0),
  }), { weight: 0, qty: 0, boardQty: 0 });

  // Pallet handlers
  const handleUpdatePallet = async (pId: number, patch: Partial<Pallet>) => {
    try {
      const updated = await api.pallets.update(soId, pId, patch);
      setSo(s => s ? { ...s, pallets: s.pallets.map(p => p.id === pId ? updated : p) } : s);
      toast('Pallet updated');
    } catch { toast('Failed to update pallet'); }
  };

  const handleDeletePallet = async (pId: number) => {
    try {
      await api.pallets.delete(soId, pId);
      setSo(s => s ? { ...s, pallets: s.pallets.filter(p => p.id !== pId) } : s);
      toast('Pallet removed');
    } catch { toast('Failed to delete pallet'); }
  };

  const handleAddPallet = async (data: { weight: string; qty: string; licence_number: string; payload_number: string; board_qty: string }) => {
    try {
      const created = await api.pallets.create(soId, {
        weight: data.weight as any,
        qty: +data.qty,
        licence_number: data.licence_number,
        payload_number: data.payload_number,
        board_qty: data.board_qty ? +data.board_qty : null,
      });
      setSo(s => s ? { ...s, pallets: [...s.pallets, created] } : s);
      toast('Pallet added');
    } catch { toast('Failed to add pallet'); }
  };

  const handleSaveMeta = async (patch: Partial<SODetail>) => {
    try {
      const updated = await api.sos.update(soId, patch);
      setSo(s => s ? { ...s, ...updated } : s);
      setEditMeta(false);
      toast('SO updated');
    } catch { toast('Failed to update SO'); }
  };

  const handlePhotoFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const imgs = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (!imgs.length) { toast('Please select image files'); return; }
    let uploaded = 0;
    for (const file of imgs) {
      try {
        const caption = file.name.replace(/\.[^.]+$/, '').slice(0, 24);
        const photo = await api.photos.upload(soId, file, caption);
        setSo(s => s ? { ...s, photos: [...s.photos, photo] } : s);
        uploaded++;
      } catch { toast(`Failed to upload ${file.name}`); }
    }
    if (uploaded) toast(`${uploaded} photo${uploaded === 1 ? '' : 's'} added`);
  };

  const handleDeletePhoto = async (photoId: number) => {
    try {
      await api.photos.delete(soId, photoId);
      setSo(s => s ? { ...s, photos: s.photos.filter(p => p.id !== photoId) } : s);
      toast('Photo removed');
    } catch { toast('Failed to delete photo'); }
  };

  const handleDeleteSO = async () => {
    try {
      await api.sos.delete(soId);
      toast('SO deleted');
      router.push('/sos');
    } catch { toast('Failed to delete SO'); }
  };

  const handleAddBoard = async (data: { barcode: string; catalog: string; mpn: string; weight: string; qty: string; note: string; pallet: string }) => {
    try {
      await api.boards.create(soId, {
        so: soId, barcode: data.barcode, catalog: data.catalog,
        mpn: data.mpn, weight: data.weight as any, qty: +data.qty, note: data.note,
        pallet: data.pallet ? +data.pallet : null,
      } as any);
      toast('Board added');
      loadBoards();
      setSo(s => s ? { ...s, total_board_count: s.total_board_count + 1 } : s);
    } catch { toast('Failed to add board'); }
  };

  const boardPageCount = Math.max(1, Math.ceil(boardTotal / BOARDS_PAGE_SIZE));

  const handleExport = async () => {
    toast('Preparing export…');
    try {
      // Fetch all boards (with chips inline)
      const allBoards = await api.boards.listBySO(soId, { page: 1, page_size: 9999 });
      const allBoardData = allBoards.results;

      const wb = XLSX.utils.book_new();

      // Sheet 1: Summary
      const summaryRows = [
        { Field: 'SO Number', Value: so.so_number },
        { Field: 'Vendor', Value: so.vendor_name },
        { Field: 'Date', Value: so.date },
        { Field: 'Weight Rule', Value: so.effective_weight_rule === 'per_pallet' ? 'Per Pallet' : 'Aggregated' },
        { Field: 'Note', Value: so.note || '' },
        { Field: 'Total Pallets', Value: so.total_pallet_count },
        { Field: 'Total Weight (lb)', Value: parseFloat(so.total_pallet_weight) },
        { Field: 'Total Boards', Value: so.total_board_count },
        { Field: 'Exported At', Value: new Date().toISOString().slice(0, 16).replace('T', ' ') },
      ];
      const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
      wsSummary['!cols'] = [{ wch: 18 }, { wch: 40 }];
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

      // Sheet 2: Pallets
      const palletRows = so.pallets.map(p => ({
        'Seq': p.pallet_seq,
        'Licence No': p.licence_number || '',
        'Payload No': p.payload_number || '',
        'Weight (lb)': parseFloat(p.weight),
        'Qty': p.qty,
        'Board Qty': p.board_qty ?? '',
      }));
      if (palletRows.length > 0) {
        const wsPallets = XLSX.utils.json_to_sheet(palletRows);
        wsPallets['!cols'] = [{ wch: 8 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 8 }, { wch: 10 }];
        XLSX.utils.book_append_sheet(wb, wsPallets, 'Pallets');
      }

      // Sheet 3: Boards
      const boardRows = allBoardData.map(b => ({
        'MPN': b.mpn || '',
        'Pallet': b.pallet_label || '',
        'Barcode': b.barcode || '',
        'Catalog': b.catalog || '',
        'Weight (lb)': b.weight ? parseFloat(b.weight) : '',
        'Qty': b.qty,
        'Chip Brands': b.chips.map(c => c.brand_name || 'Unknown').join(', '),
        'Total Chips': b.chips.reduce((sum, c) => sum + c.qty, 0),
        'Note': b.note || '',
        'Scanned At': b.scanned_at?.slice(0, 16).replace('T', ' ') || '',
      }));
      if (boardRows.length > 0) {
        const wsBoards = XLSX.utils.json_to_sheet(boardRows);
        wsBoards['!cols'] = [{ wch: 16 }, { wch: 18 }, { wch: 16 }, { wch: 14 }, { wch: 12 }, { wch: 6 }, { wch: 24 }, { wch: 12 }, { wch: 30 }, { wch: 18 }];
        XLSX.utils.book_append_sheet(wb, wsBoards, 'Boards');
      }

      // Sheet 4: Chips — deduplicated per MPN (chips are shared across boards with the same MPN)
      const seenMpns = new Set<string>();
      const chipRows = allBoardData.flatMap(b => {
        if (!b.mpn || b.chips.length === 0 || seenMpns.has(b.mpn)) return [];
        seenMpns.add(b.mpn);
        return b.chips.map(c => ({
          'MPN': b.mpn,
          'Brand': c.brand_name || '',
          'Qty': c.qty,
          'Note': c.note || '',
        }));
      });
      if (chipRows.length > 0) {
        const wsChips = XLSX.utils.json_to_sheet(chipRows);
        wsChips['!cols'] = [{ wch: 16 }, { wch: 14 }, { wch: 8 }, { wch: 30 }];
        XLSX.utils.book_append_sheet(wb, wsChips, 'Chips');
      }

      const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
      saveAs(new Blob([buf], { type: 'application/octet-stream' }), `${so.so_number}-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch { toast('Export failed'); }
  };

  return (
    <div className="fade-in" style={{ padding: '24px 28px 40px' }}>
      <Breadcrumbs items={[
        { label: 'Home', onClick: () => router.push('/dashboard') },
        { label: 'Sales Orders', onClick: () => router.push('/sos') },
        { label: so.so_number },
      ]} />

      {/* Title row */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', margin: '14px 0 20px' }}>
        <div>
          <h1 className="mono" style={{ margin: 0, fontSize: 20, fontWeight: 400, letterSpacing: '-0.01em' }}>
            {so.so_number}
          </h1>
          <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 6 }}>
            Received {so.date} · {so.vendor_name} · Created {so.created_at?.slice(0, 10)}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="outline" icon={<TrashIcon />} onClick={() => setDeleteConfirmOpen(true)}
            style={{ color: '#c0392b', borderColor: '#c0392b' }}>
            Delete
          </Button>
          <Button variant="outline" icon={<DownloadIcon />} onClick={handleExport}>Export</Button>
          <Button variant="outline" icon={<EditIcon />} onClick={() => setEditMeta(true)}>Edit</Button>
        </div>
      </div>

      {/* Meta card */}
      <Card pad={0} style={{ marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)' }}>
          {([
            ['Vendor', so.vendor_name],
            ['Weight Rule', effectiveRule === 'per_pallet' ? 'Per Pallet' : 'Aggregated', ruleIsOverride ? 'override' : null],
            ['Pallets', so.total_pallet_count],
            ['Boards', so.total_board_count],
          ] as [string, any, string?][]).map(([k, v, tag], i) => (
            <div key={k} style={{ padding: '16px 20px', borderRight: i < 3 ? '1px solid var(--hair)' : 'none' }}>
              <div style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-4)', marginBottom: 6 }}>{k}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                <div className={typeof v === 'number' ? 'num' : ''} style={{ fontSize: 14, color: 'var(--ink)' }}>
                  {v || '—'}
                </div>
                {tag === 'override' && (
                  <span style={{ fontSize: 9.5, color: '#a56b1f', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 500 }}>
                    override
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
        {/* Editable note */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--hair)', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-4)', marginTop: 3, minWidth: 60 }}>Note</span>
          <div style={{ flex: 1 }}>
            <EditableCell value={so.note} onSave={v => handleSaveMeta({ note: v })} />
            {!so.note && <div style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 2, paddingLeft: 6 }}>Double-click to add a note.</div>}
          </div>
        </div>
      </Card>

      {/* Photos */}
      <div style={{ marginBottom: 24 }}>
        <SectionHeader label="Photos" count={so.photos.length}
          action={<Button size="sm" variant="outline" icon={<UploadIcon />} onClick={() => fileInputRef.current?.click()}>Upload</Button>} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10 }}>
          {so.photos.map(p => (
            <PhotoThumb key={p.id} url={p.image_url} caption={p.caption}
              onClick={() => setLightbox(p)}
              onDelete={() => handleDeletePhoto(p.id)} />
          ))}
          <div onClick={() => fileInputRef.current?.click()} style={{
            height: 120, border: '1px dashed var(--hair-strong)', borderRadius: 3,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 4, color: 'var(--ink-3)', fontSize: 11, cursor: 'pointer', background: 'var(--surface)',
          }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--surface)')}>
            <PlusIcon />
            <span>Add photo</span>
          </div>
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
          onChange={e => { handlePhotoFiles(e.target.files); e.target.value = ''; }} />
      </div>

      {/* Tabs */}
      <Tabs value={tab} onChange={v => setTab(v as any)} tabs={[
        { value: 'pallets', label: 'Pallets', count: so.pallets.length },
        { value: 'boards', label: 'Boards', count: so.total_board_count },
      ]} />

      <div style={{ padding: '20px 0' }}>
        {tab === 'pallets' && (
          <PalletsTab
            pallets={so.pallets}
            effectiveRule={effectiveRule}
            ruleIsOverride={!!ruleIsOverride}
            vendorName={so.vendor_name}
            palletTotal={palletTotal}
            addDisabled={false}
            onAdd={() => setAddPalletOpen(true)}
            onUpdate={handleUpdatePallet}
            onDelete={handleDeletePallet}
          />
        )}
        {tab === 'boards' && (
          <BoardsTab
            boards={boards}
            pallets={so.pallets}
            total={boardTotal}
            page={boardPage}
            pageCount={boardPageCount}
            dateFrom={boardDateFrom}
            dateTo={boardDateTo}
            palletFilter={boardPalletFilter}
            expandedBoard={expandedBoard}
            chipBrands={chipBrands}
            onPageChange={setBoardPage}
            onDateFromChange={setBoardDateFrom}
            onDateToChange={setBoardDateTo}
            onPalletFilterChange={v => { setBoardPalletFilter(v); setBoardPage(1); }}
            onExpand={id => setExpandedBoard(expandedBoard === id ? null : id)}
            onOpenBoard={boardId => router.push(`/sos/${soId}/boards/${boardId}`)}
            onChipAdded={loadBoards}
            onAddBoard={() => setAddBoardOpen(true)}
          />
        )}
      </div>

      {/* Lightbox */}
      <Modal open={!!lightbox} onClose={() => setLightbox(null)} title={lightbox?.caption || 'Photo'} width={720}>
        {lightbox && <PhotoThumb url={lightbox.image_url} size={680} caption={lightbox.caption} />}
      </Modal>

      {/* Edit meta modal */}
      <EditSOModal open={editMeta} so={so} vendors={vendors} onClose={() => setEditMeta(false)} onSave={handleSaveMeta} />

      {/* Add pallet modal */}
      <AddPalletModal open={addPalletOpen} rule={effectiveRule} onClose={() => setAddPalletOpen(false)} onAdd={handleAddPallet} />

      {/* Add board modal */}
      <AddBoardModal open={addBoardOpen} pallets={so.pallets} onClose={() => setAddBoardOpen(false)} onAdd={handleAddBoard} />

      {/* Delete SO confirmation modal */}
      <Modal
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        title="Delete Sales Order"
        width={460}
        footer={<>
          <Button variant="ghost" onClick={() => setDeleteConfirmOpen(false)}>Cancel</Button>
          <Button variant="primary"
            style={{ background: '#c0392b', borderColor: '#c0392b' }}
            onClick={handleDeleteSO}>
            Delete
          </Button>
        </>}>
        <div style={{ fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.6 }}>
          <p style={{ margin: '0 0 12px' }}>
            Are you sure you want to delete <strong className="mono">{so?.so_number}</strong>?
          </p>
          <div style={{
            background: 'var(--surface-2)', border: '1px solid var(--hair)',
            borderRadius: 3, padding: '10px 14px', fontSize: 12.5, color: 'var(--ink-3)',
          }}>
            This will permanently delete:
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
              <li>All pallets ({so?.total_pallet_count ?? 0} physical pallets)</li>
              <li>All boards ({so?.total_board_count ?? 0} boards)</li>
              <li>All chips and photos attached to those boards</li>
            </ul>
          </div>
          <p style={{ margin: '12px 0 0', fontSize: 12, color: 'var(--ink-4)' }}>
            This action cannot be undone.
          </p>
        </div>
      </Modal>

    </div>
  );
}

// ─── Pallets Tab ──────────────────────────────────────────────────
function PalletsTab({ pallets, effectiveRule, ruleIsOverride, vendorName, palletTotal, addDisabled, onAdd, onUpdate, onDelete }: {
  pallets: Pallet[]; effectiveRule: string; ruleIsOverride: boolean; vendorName: string;
  palletTotal: { weight: number; qty: number; boardQty: number }; addDisabled: boolean;
  onAdd: () => void; onUpdate: (id: number, p: Partial<Pallet>) => void; onDelete: (id: number) => void;
}) {
  const [editingPallet, setEditingPallet] = useState<Pallet | null>(null);

  return (
    <>
      <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 11, color: 'var(--ink-4)' }}>
          <span className="num">{pallets.length}</span> record{pallets.length === 1 ? '' : 's'}
        </div>
        <Button size="sm" variant="outline" icon={<PlusIcon />} onClick={onAdd} disabled={addDisabled}>
          Add pallet
        </Button>
      </div>

      <div style={{ border: '1px solid var(--hair)', borderRadius: 3, background: 'var(--surface)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '7%' }} />
            <col style={{ width: '21%' }} />
            <col style={{ width: '21%' }} />
            <col style={{ width: '16%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '15%' }} />
          </colgroup>
          <thead>
            <tr>
              <th style={thS}>Seq</th>
              <th style={thS}>Licence No</th>
              <th style={thS}>Payload No</th>
              <th style={{ ...thS, textAlign: 'right' }}>Weight (lb)</th>
              <th style={{ ...thS, textAlign: 'right' }}>Qty</th>
              <th style={{ ...thS, textAlign: 'right' }}>Board Qty</th>
              <th style={{ ...thS, textAlign: 'right' }}></th>
            </tr>
          </thead>
          <tbody>
            {pallets.map(p => (
              <tr key={p.id} style={{ borderBottom: '1px solid var(--hair)' }}>
                <td style={tdS}>
                  <span className="mono" style={{ color: 'var(--ink-3)' }}>#{String(p.pallet_seq).padStart(2, '0')}</span>
                </td>
                <td style={{ ...tdS, fontSize: 12 }} className="mono">{p.licence_number || <span style={{ color: 'var(--ink-5)' }}>—</span>}</td>
                <td style={{ ...tdS, fontSize: 12 }} className="mono">{p.payload_number || <span style={{ color: 'var(--ink-5)' }}>—</span>}</td>
                <td style={{ ...tdS, textAlign: 'right' }} className="num">{parseFloat(p.weight).toFixed(2)}</td>
                <td style={{ ...tdS, textAlign: 'right' }} className="num">{p.qty}</td>
                <td style={{ ...tdS, textAlign: 'right' }} className="num">
                  {p.board_qty != null ? p.board_qty : <span style={{ color: 'var(--ink-5)' }}>—</span>}
                </td>
                <td style={{ ...tdS, textAlign: 'right' }}>
                  <div style={{ display: 'inline-flex', gap: 4 }}>
                    <button onClick={() => setEditingPallet(p)} style={ghostBtn} title="Edit"><EditIcon /></button>
                    <button onClick={() => onDelete(p.id)} style={ghostBtn} title="Delete"><TrashIcon /></button>
                  </div>
                </td>
              </tr>
            ))}
            {pallets.length > 0 && (
              <tr style={{ background: 'var(--surface-2)' }}>
                <td style={{ ...tdS, fontSize: 11, color: 'var(--ink-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  Total
                </td>
                <td /><td />
                <td style={{ ...tdS, textAlign: 'right' }} className="num">{palletTotal.weight.toFixed(2)}</td>
                <td style={{ ...tdS, textAlign: 'right' }} className="num">{palletTotal.qty}</td>
                <td style={{ ...tdS, textAlign: 'right' }} className="num">{palletTotal.boardQty || '—'}</td>
                <td />
              </tr>
            )}
            {pallets.length === 0 && (
              <tr><td colSpan={7}><Empty label="No pallets yet" sub="Click 'Add pallet' to start." /></td></tr>
            )}
          </tbody>
        </table>
      </div>

      {editingPallet && (
        <EditPalletModal
          open={!!editingPallet}
          pallet={editingPallet}
          effectiveRule={effectiveRule}
          onClose={() => setEditingPallet(null)}
          onSave={async patch => {
            await onUpdate(editingPallet.id, patch);
            setEditingPallet(null);
          }}
        />
      )}
    </>
  );
}

// ─── Edit Pallet Modal ────────────────────────────────────────────
function EditPalletModal({ open, pallet, effectiveRule, onClose, onSave }: {
  open: boolean; pallet: Pallet; effectiveRule: string;
  onClose: () => void; onSave: (patch: Partial<Pallet>) => Promise<void>;
}) {
  const aggregated = effectiveRule === 'aggregated';
  const [licence, setLicence] = useState(pallet.licence_number);
  const [payload, setPayload] = useState(pallet.payload_number);
  const [weight, setWeight] = useState(parseFloat(pallet.weight).toFixed(2));
  const [qty, setQty] = useState(String(pallet.qty));
  const [boardQty, setBoardQty] = useState(pallet.board_qty != null ? String(pallet.board_qty) : '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setLicence(pallet.licence_number);
      setPayload(pallet.payload_number);
      setWeight(parseFloat(pallet.weight).toFixed(2));
      setQty(String(pallet.qty));
      setBoardQty(pallet.board_qty != null ? String(pallet.board_qty) : '');
      setSaving(false);
    }
  }, [open, pallet]);

  const handleSave = async () => {
    setSaving(true);
    await onSave({
      licence_number: licence,
      payload_number: payload,
      weight: weight as any,
      qty: +qty,
      board_qty: boardQty !== '' ? +boardQty : null,
    });
  };

  return (
    <Modal open={open} onClose={onClose} title={`Edit Pallet #${String(pallet.pallet_seq).padStart(2, '0')}`} width={480}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={!weight || !qty || saving} onClick={handleSave}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </>}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Field label="Licence No">
          <Input value={licence} onChange={setLicence} placeholder="TRK-00123" autoFocus />
        </Field>
        <Field label="Payload No">
          <Input value={payload} onChange={setPayload} placeholder="PLD-0200" />
        </Field>
        <Field label="Weight (lb)">
          <Input value={weight} onChange={setWeight} type="number" placeholder="0.00" />
        </Field>
        <Field label={aggregated ? 'Qty (physical pallets)' : 'Qty'}>
          {aggregated
            ? <Input value={qty} onChange={setQty} type="number" placeholder="0" />
            : <Input value="1" onChange={() => {}} type="number" disabled />}
        </Field>
        <Field label="Board Qty" span={2}>
          <Input value={boardQty} onChange={setBoardQty} type="number" placeholder="Optional" />
        </Field>
      </div>
    </Modal>
  );
}

// ─── Boards Tab ───────────────────────────────────────────────────
function BoardsTab({ boards, pallets, total, page, pageCount, dateFrom, dateTo, palletFilter, expandedBoard, chipBrands,
  onPageChange, onDateFromChange, onDateToChange, onPalletFilterChange, onExpand, onOpenBoard, onChipAdded, onAddBoard }: {
  boards: Board[]; pallets: Pallet[]; total: number; page: number; pageCount: number;
  dateFrom: string; dateTo: string; palletFilter: string; expandedBoard: number | null; chipBrands: ChipBrand[];
  onPageChange: (p: number) => void; onDateFromChange: (v: string) => void;
  onDateToChange: (v: string) => void; onPalletFilterChange: (v: string) => void; onExpand: (id: number) => void;
  onOpenBoard: (id: number) => void; onChipAdded: () => void; onAddBoard: () => void;
}) {
  const from = (page - 1) * BOARDS_PAGE_SIZE + 1;
  const to = Math.min(page * BOARDS_PAGE_SIZE, total);
  const hasFilter = dateFrom || dateTo || palletFilter;

  const palletOptions = [
    { value: '', label: 'All pallets' },
    ...pallets.map(p => {
      const parts = [p.licence_number, p.payload_number].filter(Boolean);
      const label = parts.length ? parts.join('-') : `#${String(p.pallet_seq).padStart(2, '0')}`;
      return { value: String(p.id), label: `#${String(p.pallet_seq).padStart(2, '0')} · ${label}` };
    }),
  ];

  return (
    <div>
      {/* Filter bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14, marginBottom: 10,
        padding: '10px 12px', border: '1px solid var(--hair)', borderRadius: 3, background: 'var(--surface)',
      }}>
        <span style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-4)' }}>Pallet</span>
        <div style={{ minWidth: 180 }}>
          <Select value={palletFilter} onChange={onPalletFilterChange} options={palletOptions} />
        </div>
        <span style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-4)' }}>Scanned</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="date" value={dateFrom} onChange={e => { onDateFromChange(e.target.value); onPageChange(1); }}
            style={{ border: '1px solid var(--hair-strong)', borderRadius: 3, padding: '4px 8px', fontSize: 12, outline: 'none', background: 'var(--surface)', color: 'var(--ink)' }} />
          <span style={{ color: 'var(--ink-4)', fontSize: 12 }}>→</span>
          <input type="date" value={dateTo} onChange={e => { onDateToChange(e.target.value); onPageChange(1); }}
            style={{ border: '1px solid var(--hair-strong)', borderRadius: 3, padding: '4px 8px', fontSize: 12, outline: 'none', background: 'var(--surface)', color: 'var(--ink)' }} />
        </div>
        {hasFilter && <Button size="sm" variant="ghost" onClick={() => { onDateFromChange(''); onDateToChange(''); onPalletFilterChange(''); onPageChange(1); }}>Clear</Button>}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>
          <span className="num">{total}</span> boards
        </span>
        <Button size="sm" variant="outline" icon={<PlusIcon />} onClick={onAddBoard} disabled={pallets.length === 0}>
          Add board
        </Button>
      </div>

      <div style={{ border: '1px solid var(--hair)', borderRadius: 3, background: 'var(--surface)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 28 }} /><col style={{ width: '15%' }} /><col style={{ width: '13%' }} />
            <col style={{ width: '10%' }} /><col style={{ width: '16%' }} /><col style={{ width: '9%' }} />
            <col style={{ width: '7%' }} /><col style={{ width: '8%' }} /><col />
          </colgroup>
          <thead>
            <tr>
              <th style={thS}></th>
              <th style={thS}>MPN</th>
              <th style={thS}>Pallet</th>
              <th style={thS}>Catalog</th>
              <th style={thS}>Barcode</th>
              <th style={{ ...thS, textAlign: 'right' }}>Weight</th>
              <th style={{ ...thS, textAlign: 'right' }}>Qty</th>
              <th style={{ ...thS, textAlign: 'right' }}>Chips</th>
              <th style={thS}>Scanned</th>
            </tr>
          </thead>
          <tbody>
            {boards.map(b => {
              const open = expandedBoard === b.id;
              return (
                <React.Fragment key={b.id}>
                  <tr style={{ borderBottom: '1px solid var(--hair)', background: open ? 'var(--surface-2)' : 'transparent' }}>
                    <td style={{ ...tdS, padding: '8px 4px 8px 14px' }}>
                      <button onClick={() => onExpand(b.id)} style={{ ...ghostBtn, padding: 3 }}>
                        <span style={{ display: 'inline-flex', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .12s' }}>
                          <ChevronIcon />
                        </span>
                      </button>
                    </td>
                    <td style={tdS}>
                      <button onClick={() => onOpenBoard(b.id)}
                        className="mono" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', color: 'var(--ink)', fontSize: 12.5, textDecoration: 'underline', textDecorationColor: 'var(--ink-5)', textUnderlineOffset: 3, fontFamily: 'inherit' }}>
                        {b.mpn || '—'}
                      </button>
                    </td>
                    <td style={{ ...tdS, fontSize: 12 }} className="mono">
                      {b.pallet_label
                        ? <span style={{ color: 'var(--ink-2)' }}>{b.pallet_label}</span>
                        : <span style={{ color: 'var(--ink-5)' }}>—</span>}
                    </td>
                    <td style={{ ...tdS, fontSize: 12 }} className="mono">{b.catalog || '—'}</td>
                    <td style={{ ...tdS, fontSize: 12, color: 'var(--ink-3)' }} className="mono">{b.barcode || '—'}</td>
                    <td style={{ ...tdS, textAlign: 'right' }} className="num">{b.weight ? parseFloat(b.weight).toFixed(2) : '—'}</td>
                    <td style={{ ...tdS, textAlign: 'right' }} className="num">{b.qty}</td>
                    <td style={{ ...tdS, textAlign: 'right' }} className="num">{b.chip_count}</td>
                    <td style={{ ...tdS, fontSize: 11.5, color: 'var(--ink-3)' }} className="num">{b.scanned_at?.slice(0, 10)}</td>
                  </tr>
                  {open && (
                    <tr style={{ borderBottom: '1px solid var(--hair)' }}>
                      <td />
                      <td colSpan={8} style={{ padding: '8px 14px 16px' }}>
                        <div style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-4)', marginBottom: 8 }}>Chips on board</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {b.chips.map(c => {
                            const brand = chipBrands.find(cb => cb.id === c.brand);
                            return (
                              <span key={c.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 9px', border: '1px solid var(--hair-strong)', borderRadius: 3, background: 'var(--surface)', fontSize: 12 }}>
                                {brand?.name ?? '—'} <span className="num" style={{ color: 'var(--ink-3)' }}>×{c.qty}</span>
                              </span>
                            );
                          })}
                          {b.chips.length === 0 && <span style={{ fontSize: 11.5, color: 'var(--ink-4)' }}>No chips recorded.</span>}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            {boards.length === 0 && (
              <tr><td colSpan={9} style={{ padding: '28px 14px', textAlign: 'center', fontSize: 12, color: 'var(--ink-3)' }}>
                No boards found.
              </td></tr>
            )}
          </tbody>
        </table>

        {/* Pagination footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderTop: '1px solid var(--hair)', fontSize: 11.5, color: 'var(--ink-3)' }}>
          <span>
            {total > 0 ? <>Showing <span className="num">{from}</span>–<span className="num">{to}</span> of <span className="num">{total}</span></> : '0 boards'}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page <= 1}
              style={{ width: 26, height: 24, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface)', border: '1px solid var(--hair-strong)', borderRadius: 3, color: page <= 1 ? 'var(--ink-5)' : 'var(--ink-2)', cursor: page <= 1 ? 'default' : 'pointer', opacity: page <= 1 ? 0.5 : 1 }}>
              <span style={{ transform: 'rotate(180deg)', display: 'inline-flex' }}><ChevronIcon /></span>
            </button>
            <span style={{ padding: '0 10px', fontSize: 12 }}>
              <span className="num">{page}</span><span style={{ color: 'var(--ink-4)' }}> / </span><span className="num">{pageCount}</span>
            </span>
            <button onClick={() => onPageChange(Math.min(pageCount, page + 1))} disabled={page >= pageCount}
              style={{ width: 26, height: 24, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface)', border: '1px solid var(--hair-strong)', borderRadius: 3, color: page >= pageCount ? 'var(--ink-5)' : 'var(--ink-2)', cursor: page >= pageCount ? 'default' : 'pointer', opacity: page >= pageCount ? 0.5 : 1 }}>
              <ChevronIcon />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Edit SO Modal ────────────────────────────────────────────────
function EditSOModal({ open, so, vendors, onClose, onSave }: {
  open: boolean; so: SODetail; vendors: Vendor[];
  onClose: () => void; onSave: (patch: Partial<SODetail>) => void;
}) {
  const [soNumber, setSoNumber] = useState(so.so_number);
  const [vendorId, setVendorId] = useState(String(so.vendor));
  const [date, setDate] = useState(so.date);
  const [note, setNote] = useState(so.note);
  useEffect(() => {
    if (open) {
      setSoNumber(so.so_number); setVendorId(String(so.vendor));
      setDate(so.date); setNote(so.note);
    }
  }, [open]);
  return (
    <Modal open={open} onClose={onClose} title={`Edit ${so.so_number}`} width={560}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={() => onSave({ so_number: soNumber, vendor: +vendorId, date, note })}>Save</Button>
      </>}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Field label="SO Number"><Input value={soNumber} onChange={setSoNumber} /></Field>
        <Field label="Vendor">
          <Select value={vendorId} onChange={setVendorId}
            options={vendors.map(v => ({ value: String(v.id), label: v.name }))} />
        </Field>
        <Field label="Date" span={2}><Input value={date} onChange={setDate} type="date" /></Field>
        <Field label="Note" span={2}>
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={3}
            style={{ width: '100%', padding: '6px 10px', border: '1px solid var(--hair-strong)', background: 'var(--surface)', borderRadius: 3, fontFamily: 'inherit', fontSize: 13, resize: 'vertical', outline: 'none', color: 'var(--ink)' }} />
        </Field>
      </div>
    </Modal>
  );
}

// ─── Add Pallet Modal ─────────────────────────────────────────────
function AddPalletModal({ open, rule, onClose, onAdd }: {
  open: boolean; rule: string; onClose: () => void;
  onAdd: (data: { weight: string; qty: string; licence_number: string; payload_number: string; board_qty: string }) => void;
}) {
  const aggregated = rule === 'aggregated';
  const [w, setW] = useState('');
  const [q, setQ] = useState('');
  const [licence, setLicence] = useState('');
  const [payload, setPayload] = useState('');
  const [boardQty, setBoardQty] = useState('');
  useEffect(() => {
    if (open) { setW(''); setQ(aggregated ? '' : '1'); setLicence(''); setPayload(''); setBoardQty(''); }
  }, [open, aggregated]);
  return (
    <Modal open={open} onClose={onClose} title={aggregated ? 'Add aggregated record' : 'Add pallet'} width={500}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={!w || !q}
          onClick={() => { onAdd({ weight: w, qty: q, licence_number: licence, payload_number: payload, board_qty: boardQty }); onClose(); }}>
          Add
        </Button>
      </>}>
      <div style={{ fontSize: 11.5, color: 'var(--ink-3)', lineHeight: 1.5, padding: '10px 12px', background: 'var(--surface-2)', border: '1px solid var(--hair)', borderRadius: 3, marginBottom: 14 }}>
        {aggregated
          ? <>One record summarises <b style={{ color: 'var(--ink-2)', fontWeight: 500 }}>many physical pallets</b>. Enter total weight and how many pallets.</>
          : <>One row = <b style={{ color: 'var(--ink-2)', fontWeight: 500 }}>one physical pallet</b>. Qty is locked to <span className="num">1</span>.</>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Field label="Licence No">
          <Input value={licence} onChange={setLicence} placeholder="TRK-00123" autoFocus />
        </Field>
        <Field label="Payload No">
          <Input value={payload} onChange={setPayload} placeholder="PLD-0200" />
        </Field>
        <Field label={aggregated ? 'Total Weight (lb)' : 'Weight (lb)'}>
          <Input value={w} onChange={setW} type="number" placeholder="0.00" />
        </Field>
        <Field label={aggregated ? 'Qty (physical pallets)' : 'Qty'}>
          {aggregated
            ? <Input value={q} onChange={setQ} type="number" placeholder="0" />
            : <Input value="1" onChange={() => {}} type="number" disabled />}
        </Field>
        <Field label="Board Qty" span={2}>
          <Input value={boardQty} onChange={setBoardQty} type="number" placeholder="Optional" />
        </Field>
      </div>
    </Modal>
  );
}

// ─── Photo Thumb ──────────────────────────────────────────────────
function PhotoThumb({ url, caption, size = 120, onClick, onDelete }: {
  url?: string | null; caption?: string; size?: number; onClick?: () => void; onDelete?: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const hues = [30, 45, 15, 60, 90, 200, 20, 40];
  const seed = url ? url.length % hues.length : 0;
  const h1 = hues[seed];
  const h2 = hues[(seed + 3) % hues.length];
  return (
    <div onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: size, height: size, border: '1px solid var(--hair-strong)', borderRadius: 3,
        background: url ? `url(${url}) center/cover` : `linear-gradient(135deg, oklch(92% 0.02 ${h1}) 0%, oklch(85% 0.015 ${h2}) 100%)`,
        position: 'relative', overflow: 'hidden', cursor: onClick ? 'pointer' : 'default',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
      {!url && <div className="mono" style={{ fontSize: 9, color: 'var(--ink-3)', letterSpacing: '0.05em', opacity: 0.6 }}>PHOTO</div>}
      {caption && <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '4px 6px', fontSize: 10, color: 'var(--ink-2)', background: 'rgba(252,251,248,0.85)', borderTop: '1px solid var(--hair)' }}>{caption}</div>}
      {onDelete && hovered && (
        <button onClick={e => { e.stopPropagation(); onDelete(); }}
          style={{
            position: 'absolute', top: 5, right: 5, width: 20, height: 20,
            background: 'rgba(26,25,23,0.55)', border: 'none', borderRadius: 2,
            color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, lineHeight: 1,
          }}>×</button>
      )}
    </div>
  );
}

// ─── Add Board Modal ──────────────────────────────────────────────
function AddBoardModal({ open, pallets, onClose, onAdd }: {
  open: boolean; pallets: Pallet[]; onClose: () => void;
  onAdd: (d: { barcode: string; catalog: string; mpn: string; weight: string; qty: string; note: string; pallet: string }) => void;
}) {
  const [barcode, setBarcode] = useState('');
  const [catalog, setCatalog] = useState('');
  const [mpn, setMpn] = useState('');
  const [weight, setWeight] = useState('');
  const [qty, setQty] = useState('0');
  const [note, setNote] = useState('');
  const [pallet, setPallet] = useState('');
  useEffect(() => {
    if (open) { setBarcode(''); setCatalog(''); setMpn(''); setWeight(''); setQty('0'); setNote(''); setPallet(''); }
  }, [open]);
  const canSave = mpn.trim() && pallet !== '';

  const palletOptions = [
    { value: '', label: '— No pallet —' },
    ...pallets.map(p => {
      const parts = [p.licence_number, p.payload_number].filter(Boolean);
      const label = parts.length ? parts.join('-') : `#${String(p.pallet_seq).padStart(2, '0')}`;
      return { value: String(p.id), label: `#${String(p.pallet_seq).padStart(2, '0')} · ${label}` };
    }),
  ];

  return (
    <Modal open={open} onClose={onClose} title="Add board" width={520}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={!canSave}
          onClick={() => { onAdd({ barcode, catalog, mpn, weight, qty, note, pallet }); onClose(); }}>Add</Button>
      </>}>
      <div style={{ fontSize: 11.5, color: 'var(--ink-3)', lineHeight: 1.5, padding: '10px 12px',
        background: 'var(--surface-2)', border: '1px solid var(--hair)', borderRadius: 3, marginBottom: 14 }}>
        Scan or enter the board's identifiers. Timestamp is set to now automatically; chips can be added after from the board detail page.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Field label="MPN" span={2}>
          <Input value={mpn} onChange={setMpn} placeholder="NVMe-PCIe4-1T" autoFocus
            style={{ fontFamily: 'ui-monospace, monospace' }} />
        </Field>
        <Field label="Pallet" span={2}>
          <Select value={pallet} onChange={setPallet} options={palletOptions} />
        </Field>
        <Field label="Catalog">
          <Input value={catalog} onChange={setCatalog} placeholder="SSD-C3" />
        </Field>
        <Field label="Barcode">
          <Input value={barcode} onChange={setBarcode} placeholder="BC-000-0000"
            style={{ fontFamily: 'ui-monospace, monospace' }} />
        </Field>
        <Field label="Weight (lb)">
          <Input value={weight} onChange={setWeight} type="number" placeholder="0.00" />
        </Field>
        <Field label="Qty">
          <Input value={qty} onChange={v => setQty(v.replace(/^0+(\d)/, '$1'))} type="number" placeholder="0" />
        </Field>
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

// ─── Inline icons ──────────────────────────────────────────────────
const PlusIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);
const EditIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);
const DownloadIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);
const UploadIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);
const TrashIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
  </svg>
);
const ChevronIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);
