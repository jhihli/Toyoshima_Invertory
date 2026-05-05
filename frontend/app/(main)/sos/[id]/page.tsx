'use client';
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import {
  Button, Input, Select, Modal, Pagination, Breadcrumbs, Tabs,
  Card, SectionHeader, EditableCell, Field, Empty, Badge, useToast,
  thS, tdS, ghostBtn,
} from '@/app/ui/components';
import { api } from '@/app/lib/api';
import { WeightRuleField } from '../WeightRuleField';
import type { SODetail, Pallet, Board, Chip, ChipBrand, Vendor } from '@/interface/IDatatable';
import { useIsMobile } from '@/app/ui/hooks/useIsMobile';

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
  const [boardMpns, setBoardMpns] = useState<string[]>([]);
  const [lightbox, setLightbox] = useState<SODetail['photos'][0] | null>(null);
  const [expandedBoard, setExpandedBoard] = useState<number | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteBoardId, setDeleteBoardId] = useState<number | null>(null);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [photosMenuOpen, setPhotosMenuOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const actionMenuRef = useRef<HTMLDivElement>(null);
  const photosMenuRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

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

  useEffect(() => {
    if (!photosMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (photosMenuRef.current && !photosMenuRef.current.contains(e.target as Node)) {
        setPhotosMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [photosMenuOpen]);

  if (loading || !so) {
    return <div className="page-pad" style={{ color: 'var(--ink-3)', fontSize: 13 }}>Loading…</div>;
  }

  const vendor = vendors.find(v => v.id === so.vendor);
  const effectiveRule = so.effective_weight_rule;
  const ruleIsOverride = so.weight_rule && so.weight_rule !== so.vendor_weight_rule;

  const palletTotal = so.pallets.reduce((acc, p) => ({
    weight: acc.weight + parseFloat(p.weight),
    qty: acc.qty + p.qty,
    boardQty: acc.boardQty + (p.board_qty ?? 0),
  }), { weight: 0, qty: 0, boardQty: 0 });

  const palletOptions = [
    { value: '', label: 'All pallets' },
    ...so.pallets.map(p => {
      const parts = [p.licence_number, p.payload_number].filter(Boolean);
      const label = parts.length ? parts.join('-') : `#${String(p.pallet_seq).padStart(2, '0')}`;
      return { value: String(p.id), label: `#${String(p.pallet_seq).padStart(2, '0')} · ${label}` };
    }),
  ];

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

  const handleAddPalletsBulk = async (rows: { weight: string; qty: string; licence_number: string; payload_number: string; board_qty: string }[]) => {
    let added = 0;
    for (const data of rows) {
      try {
        const created = await api.pallets.create(soId, {
          weight: data.weight as any,
          qty: +data.qty,
          licence_number: data.licence_number,
          payload_number: data.payload_number,
          board_qty: data.board_qty ? +data.board_qty : null,
        });
        setSo(s => s ? { ...s, pallets: [...s.pallets, created] } : s);
        added++;
      } catch { toast(`Failed to add pallet ${added + 1}`); }
    }
    if (added > 0) toast(`${added} pallet${added === 1 ? '' : 's'} added`);
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

  const handleDeleteBoard = async (boardId: number) => {
    try {
      await api.boards.delete(boardId);
      setBoards(bs => bs.filter(b => b.id !== boardId));
      setBoardTotal(t => t - 1);
      setSo(s => s ? { ...s, total_board_count: s.total_board_count - 1 } : s);
      toast('Board deleted');
    } catch { toast('Failed to delete board'); }
    finally { setDeleteBoardId(null); }
  };

  const handleOpenAddBoard = async () => {
    setAddBoardOpen(true);
    try {
      const res = await api.boards.listBySO(soId, { page: 1, page_size: 9999 });
      const unique = [...new Set(res.results.map(b => b.mpn).filter(Boolean))] as string[];
      setBoardMpns(unique);
    } catch {}
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

  const handleAddBoardBulk = async (
    barcodes: { barcode: string }[],
    shared: { catalog: string; mpn: string; pallet: string }
  ) => {
    try {
      const boards = barcodes.map(r => ({
        so: soId, barcode: r.barcode,
        catalog: shared.catalog, mpn: shared.mpn,
        qty: 1,
        pallet: shared.pallet ? +shared.pallet : null,
      }));
      const result = await api.boards.createBulk(soId, boards as any);
      toast(`${result.length} board${result.length === 1 ? '' : 's'} added`);
      loadBoards();
      setSo(s => s ? { ...s, total_board_count: s.total_board_count + result.length } : s);
    } catch { toast('Failed to add boards'); }
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
        'Pallet Qty': p.qty,
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
    <div className="fade-in page-pad">
      <Breadcrumbs items={[
        { label: 'Home', onClick: () => router.push('/dashboard') },
        { label: 'Sales Orders', onClick: () => router.push('/sos') },
        { label: so.so_number },
      ]} />

      {/* Title row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', margin: isMobile ? '8px 0 10px' : '8px 0 8px', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <h1 className="mono" style={{ margin: 0, fontSize: 20, fontWeight: 400, letterSpacing: '-0.01em' }}>
            {so.so_number}
          </h1>
          {!isMobile && (
            <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
              Received {so.date} · {so.vendor_name} · Created {so.created_at?.slice(0, 10)}
            </span>
          )}
        </div>

        {isMobile ? (
          /* Mobile: single "⋮" menu button */
          <div ref={actionMenuRef} style={{ position: 'relative', flexShrink: 0 }}>
            <button
              onClick={() => setActionMenuOpen(o => !o)}
              style={{
                background: actionMenuOpen ? 'var(--surface-2)' : 'var(--surface)',
                border: '1px solid var(--hair-strong)', borderRadius: 3,
                width: 28, height: 28, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--ink)',
              }}
            >
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
                  { label: 'Edit', icon: <EditIcon />, danger: false, action: () => { setEditMeta(true); setActionMenuOpen(false); } },
                  { label: 'Export', icon: <DownloadIcon />, danger: false, action: () => { handleExport(); setActionMenuOpen(false); } },
                  { label: 'Upload photo', icon: <UploadIcon />, danger: false, action: () => { fileInputRef.current?.click(); setActionMenuOpen(false); } },
                  { label: 'Delete', icon: <TrashIcon />, danger: true, action: () => { setDeleteConfirmOpen(true); setActionMenuOpen(false); } },
                ] as { label: string; icon: React.ReactNode; danger: boolean; action: () => void }[]).map((item, i, arr) => (
                  <button key={item.label} onClick={item.action} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    width: '100%', padding: '11px 14px', border: 0,
                    borderBottom: i < arr.length - 1 ? '1px solid var(--hair)' : 'none',
                    background: 'none', cursor: 'pointer', fontSize: 13,
                    color: item.danger ? 'var(--err)' : 'var(--ink)',
                    textAlign: 'left',
                  }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                  >
                    {item.icon}
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Desktop: three separate buttons */
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <Button variant="danger" icon={<TrashIcon />} onClick={() => setDeleteConfirmOpen(true)}>Delete</Button>
            <Button variant="outline" icon={<DownloadIcon />} onClick={handleExport}>Export</Button>
            <Button variant="outline" icon={<EditIcon />} onClick={() => setEditMeta(true)}>Edit</Button>
          </div>
        )}
      </div>

      {/* Meta card */}
      {isMobile ? (
        <Card pad={0} style={{ marginBottom: 12 }}>
          {/* Vendor + Weight Rule — same row, two halves */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--hair)' }}>
            <div style={{ flex: 1, padding: '10px 14px', borderRight: '1px solid var(--hair)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-4)', flexShrink: 0 }}>Vendor</span>
              <span style={{ fontSize: 13, color: 'var(--ink)' }}>{so.vendor_name}</span>
            </div>
            <div style={{ flex: 1, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-4)', flexShrink: 0 }}>Rule</span>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <Badge tone={effectiveRule === 'per_pallet' ? 'ok' : 'blue'}>
                  {effectiveRule === 'per_pallet' ? 'Per Pallet' : 'Aggregated'}
                </Badge>
                {ruleIsOverride && <Badge tone="warn">OVR</Badge>}
              </div>
            </div>
          </div>
          {/* Pallets + Boards — same row, label and value inline */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--hair)' }}>
            <div style={{ flex: 1, padding: '10px 14px', borderRight: '1px solid var(--hair)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-4)' }}>Pallets</span>
              <span className="num" style={{ fontSize: 13, color: 'var(--ink)' }}>{so.total_pallet_count}</span>
            </div>
            <div style={{ flex: 1, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-4)' }}>Boards</span>
              <span className="num" style={{ fontSize: 13, color: 'var(--ink)' }}>{so.total_board_count}</span>
            </div>
          </div>
          {/* Note row — hidden when empty */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '6px 14px', borderBottom: '1px solid var(--hair)' }}>
            <span style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-4)', flexShrink: 0 }}>Note</span>
            {so.note && (
              <div style={{ flex: 1, textAlign: 'right' }}>
                <EditableCell value={so.note} onSave={v => handleSaveMeta({ note: v })} />
              </div>
            )}
          </div>
          {/* Photos row */}
          <div style={{ padding: '10px 14px' }}>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: 2 }}>
              {so.photos.map(p => (
                <div key={p.id} onClick={() => setLightbox(p)} style={{
                  flexShrink: 0, width: 52, height: 52, borderRadius: 3, cursor: 'pointer',
                  background: `url(${p.image_url}) center/cover no-repeat var(--surface-2)`,
                  border: '1px solid var(--hair)',
                }} />
              ))}
              <div onClick={() => fileInputRef.current?.click()} style={{
                flexShrink: 0, width: 52, height: 52,
                border: '1px dashed var(--hair-strong)', borderRadius: 3,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                gap: 3, color: 'var(--ink-4)', fontSize: 9, cursor: 'pointer',
              }}>
                <PlusIcon />
                <span style={{ letterSpacing: '0.04em', textTransform: 'uppercase' }}>Photo</span>
              </div>
            </div>
          </div>
        </Card>
      ) : (
        <Card pad={0} style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'stretch' }}>
            {/* Vendor */}
            <div style={{ flex: '0 0 160px', padding: '6px 12px', borderRight: '1px solid var(--hair)' }}>
              <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-4)', marginBottom: 2 }}>Vendor</div>
              <div style={{ fontSize: 13, color: 'var(--ink)' }}>{so.vendor_name || '—'}</div>
            </div>
            {/* Weight Rule */}
            <div style={{ flex: '0 0 150px', padding: '6px 12px', borderRight: '1px solid var(--hair)' }}>
              <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-4)', marginBottom: 2 }}>Weight Rule</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                <Badge tone={effectiveRule === 'per_pallet' ? 'ok' : 'blue'}>
                  {effectiveRule === 'per_pallet' ? 'Per Pallet' : 'Aggregated'}
                </Badge>
                {ruleIsOverride && <Badge tone="warn">Override</Badge>}
              </div>
            </div>
            {/* Pallets */}
            <div style={{ flex: '0 0 90px', padding: '6px 12px', borderRight: '1px solid var(--hair)' }}>
              <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-4)', marginBottom: 2 }}>Pallets</div>
              <div className="num" style={{ fontSize: 13, color: 'var(--ink)' }}>{so.total_pallet_count}</div>
            </div>
            {/* Boards */}
            <div style={{ flex: '0 0 90px', padding: '6px 12px', borderRight: '1px solid var(--hair)' }}>
              <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-4)', marginBottom: 2 }}>Boards</div>
              <div className="num" style={{ fontSize: 13, color: 'var(--ink)' }}>{so.total_board_count}</div>
            </div>
            {/* Note */}
            <div style={{ flex: 1, padding: '6px 12px', minWidth: 0, borderRight: '1px solid var(--hair)' }}>
              <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-4)', marginBottom: 2 }}>Note</div>
              <EditableCell value={so.note} onSave={v => handleSaveMeta({ note: v })} />
            </div>
            {/* Photos dropdown */}
            <div ref={photosMenuRef} style={{ flex: '0 0 auto', padding: '6px 12px', position: 'relative', display: 'flex', alignItems: 'center' }}>
              <button
                onClick={() => setPhotosMenuOpen(o => !o)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '4px 10px', borderRadius: 4, border: '1px solid var(--hair-strong)',
                  background: photosMenuOpen ? 'var(--surface-2)' : 'var(--surface)',
                  color: 'var(--ink)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
                  whiteSpace: 'nowrap',
                }}
              >
                <ImageIcon />
                <span>{so.photos.length} photo{so.photos.length !== 1 ? 's' : ''}</span>
                <ChevronDownIcon />
              </button>
              {photosMenuOpen && (
                <div style={{
                  position: 'absolute', right: 0, top: '100%', zIndex: 200,
                  background: 'var(--surface)', border: '1px solid var(--hair-strong)',
                  borderRadius: 6, padding: 12, width: 300,
                  boxShadow: '0 4px 16px rgba(0,0,0,0.10)',
                }}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {so.photos.map(p => (
                      <PhotoThumb key={p.id} url={p.image_url} caption={p.caption} size={80}
                        onClick={() => { setLightbox(p); setPhotosMenuOpen(false); }}
                        onDelete={() => handleDeletePhoto(p.id)} />
                    ))}
                    <div onClick={() => { fileInputRef.current?.click(); setPhotosMenuOpen(false); }} style={{
                      width: 80, height: 80, border: '1px dashed var(--hair-strong)', borderRadius: 3,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      gap: 3, color: 'var(--ink-3)', fontSize: 10, cursor: 'pointer', background: 'var(--surface)',
                    }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'var(--surface)')}>
                      <PlusIcon />
                      <span>Add photo</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </Card>
      )}
      <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
        onChange={e => { handlePhotoFiles(e.target.files); e.target.value = ''; }} />

      {/* Combined tab + action row */}
      {isMobile ? (
        <Tabs value={tab} onChange={v => setTab(v as any)} tabs={[
          { value: 'pallets', label: 'Pallets', count: so.pallets.length },
          { value: 'boards', label: 'Boards', count: so.total_board_count },
        ]} />
      ) : (
        <div style={{ display: 'flex', alignItems: 'stretch', borderBottom: '1px solid var(--hair)' }}>
          {/* Tab buttons */}
          {[
            { value: 'pallets', label: 'Pallets', count: so.pallets.length },
            { value: 'boards', label: 'Boards', count: so.total_board_count },
          ].map(t => {
            const active = tab === t.value;
            return (
              <button key={t.value} onClick={() => setTab(t.value as any)} style={{
                background: active ? 'var(--accent-light)' : 'none',
                border: 0, padding: '9px 16px', cursor: 'pointer',
                color: active ? 'var(--accent-2)' : 'var(--ink-3)',
                borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
                marginBottom: -1, fontSize: 13, fontWeight: active ? 500 : 400,
                borderRadius: '3px 3px 0 0',
                display: 'inline-flex', alignItems: 'center', gap: 7,
                fontFamily: 'inherit', transition: 'background .1s, color .1s', flexShrink: 0,
              }}
              onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
              onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'none'; }}>
                {t.label}
                <span className="num" style={{
                  fontSize: 11, padding: '1px 7px', borderRadius: 10, lineHeight: 1.6,
                  color: active ? 'var(--accent-2)' : 'var(--ink-4)',
                  background: active ? 'rgba(45,106,79,0.15)' : 'var(--surface-2)',
                }}>{t.count}</span>
              </button>
            );
          })}
          <div style={{ flex: 1 }} />
          {/* Pallets actions */}
          {tab === 'pallets' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 4px 0 12px' }}>
              <span style={{ fontSize: 11, color: 'var(--ink-4)' }}>
                <span className="num">{so.pallets.length}</span> record{so.pallets.length === 1 ? '' : 's'}
              </span>
              <Button size="sm" variant="primary" icon={<PlusIcon />} onClick={() => setAddPalletOpen(true)}>
                Add pallet
              </Button>
            </div>
          )}
          {/* Boards actions */}
          {tab === 'boards' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 4px 0 12px' }}>
              <span style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-4)' }}>Pallet</span>
              <div style={{ minWidth: 160 }}>
                <Select value={boardPalletFilter} onChange={v => { setBoardPalletFilter(v); setBoardPage(1); }} options={palletOptions} />
              </div>
              <span style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-4)' }}>Scanned</span>
              <input type="date" value={boardDateFrom} onChange={e => { setBoardDateFrom(e.target.value); setBoardPage(1); }}
                style={{ border: '1px solid var(--hair-strong)', borderRadius: 3, padding: '4px 8px', fontSize: 12, outline: 'none', background: 'var(--surface)', color: 'var(--ink)' }} />
              <span style={{ color: 'var(--ink-4)', fontSize: 12 }}>→</span>
              <input type="date" value={boardDateTo} onChange={e => { setBoardDateTo(e.target.value); setBoardPage(1); }}
                style={{ border: '1px solid var(--hair-strong)', borderRadius: 3, padding: '4px 8px', fontSize: 12, outline: 'none', background: 'var(--surface)', color: 'var(--ink)' }} />
              {(boardDateFrom || boardDateTo || boardPalletFilter) && (
                <Button size="sm" variant="ghost" onClick={() => { setBoardDateFrom(''); setBoardDateTo(''); setBoardPalletFilter(''); setBoardPage(1); }}>Clear</Button>
              )}
              <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>
                <span className="num">{boardTotal}</span> boards
              </span>
              <Button size="sm" variant="primary" icon={<PlusIcon />} onClick={handleOpenAddBoard} disabled={so.pallets.length === 0}>
                Add board
              </Button>
            </div>
          )}
        </div>
      )}

      <div style={{ padding: isMobile ? '10px 0' : '12px 0' }}>
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
            onAddBoard={handleOpenAddBoard}
            onDeleteBoard={setDeleteBoardId}
          />
        )}
      </div>

      {/* Lightbox */}
      <Modal open={!!lightbox} onClose={() => setLightbox(null)} title={lightbox?.caption || 'Photo'} width={720}>
        {lightbox?.image_url && (
          <img src={lightbox.image_url} alt={lightbox.caption || 'Photo'}
            style={{ width: '100%', maxHeight: '80vh', objectFit: 'contain', borderRadius: 3, display: 'block' }} />
        )}
      </Modal>

      {/* Edit meta modal */}
      <EditSOModal open={editMeta} so={so} vendors={vendors} onClose={() => setEditMeta(false)} onSave={handleSaveMeta} />

      {/* Add pallet modal */}
      <AddPalletModal open={addPalletOpen} rule={effectiveRule} onClose={() => setAddPalletOpen(false)} onAdd={handleAddPallet} onAddBulk={handleAddPalletsBulk} />

      {/* Add board modal */}
      <AddBoardModal open={addBoardOpen} pallets={so.pallets} mpns={boardMpns} onClose={() => setAddBoardOpen(false)} onAdd={handleAddBoard} onAddBulk={handleAddBoardBulk} />

      {/* Delete board confirmation modal */}
      {deleteBoardId !== null && (() => {
        const board = boards.find(b => b.id === deleteBoardId);
        return (
          <Modal
            open={deleteBoardId !== null}
            onClose={() => setDeleteBoardId(null)}
            title="Delete Board"
            width={460}
            footer={<>
              <Button variant="ghost" onClick={() => setDeleteBoardId(null)}>Cancel</Button>
              <Button variant="primary"
                style={{ background: '#c0392b', borderColor: '#c0392b' }}
                onClick={() => handleDeleteBoard(deleteBoardId)}>
                Delete
              </Button>
            </>}>
            <div style={{ fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.6 }}>
              <p style={{ margin: '0 0 12px' }}>
                Are you sure you want to delete board{board?.mpn ? <> <strong className="mono">{board.mpn}</strong></> : ''}?
              </p>
              <div style={{
                background: 'var(--surface-2)', border: '1px solid var(--hair)',
                borderRadius: 3, padding: '10px 14px', fontSize: 12.5, color: 'var(--ink-3)',
              }}>
                This will permanently delete:
                <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                  <li>The board record and its photo</li>
                  <li>All chip data for this MPN (if no other boards share the same MPN)</li>
                </ul>
              </div>
              <p style={{ margin: '12px 0 0', fontSize: 12, color: 'var(--ink-4)' }}>
                This action cannot be undone.
              </p>
            </div>
          </Modal>
        );
      })()}

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
  const isMobile = useIsMobile();

  return (
    <>
      {isMobile && (
        <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 11, color: 'var(--ink-4)' }}>
            <span className="num">{pallets.length}</span> record{pallets.length === 1 ? '' : 's'}
          </div>
          <Button size="sm" variant="primary" icon={<PlusIcon />} onClick={onAdd} disabled={addDisabled}>
            Add pallet
          </Button>
        </div>
      )}

      {isMobile ? (
        /* Mobile: pallet cards */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {pallets.length === 0 && <Empty label="No pallets yet" sub="Click 'Add pallet' to start." />}
          {pallets.map(p => (
            <div key={p.id} style={{ background: 'var(--surface)', border: '1px solid var(--hair)', borderRadius: 4, padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className="mono" style={{ fontSize: 13, color: 'var(--ink-3)' }}>
                  #{String(p.pallet_seq).padStart(2, '0')}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Badge tone="warn" style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
                    {parseFloat(p.weight).toFixed(2)} lb
                  </Badge>
                  <button onClick={() => setEditingPallet(p)} style={ghostBtn} title="Edit"><EditIcon /></button>
                  <button onClick={() => onDelete(p.id)} style={ghostBtn} title="Delete"><TrashIcon /></button>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5, fontSize: 11.5, color: 'var(--ink-3)', flexWrap: 'wrap' }}>
                {(p.licence_number || p.payload_number) && (
                  <Badge tone="blue" style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11 }}>
                    {[p.licence_number, p.payload_number].filter(Boolean).join(' · ')}
                  </Badge>
                )}
                {(p.licence_number || p.payload_number) && <span style={{ color: 'var(--hair-strong)' }}>·</span>}
                <span>Pallet qty <span className="num" style={{ color: 'var(--ink-2)' }}>{p.qty}</span></span>
                {p.board_qty != null && <><span style={{ color: 'var(--hair-strong)' }}>·</span><span>Boards <span className="num" style={{ color: 'var(--ink-2)' }}>{p.board_qty}</span></span></>}
              </div>
            </div>
          ))}
          {pallets.length > 0 && (
            <div style={{ padding: '10px 14px', border: '1px solid var(--hair)', borderRadius: 4, background: 'var(--surface-2)', fontSize: 12, color: 'var(--ink-3)', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ letterSpacing: '0.06em', textTransform: 'uppercase', fontSize: 11 }}>Total</span>
              <span className="num">{palletTotal.weight.toFixed(2)} lb · {palletTotal.qty} pallets{palletTotal.boardQty ? ` · ${palletTotal.boardQty} boards` : ''}</span>
            </div>
          )}
        </div>
      ) : (
        /* Desktop: pallet table */
        <div style={{ border: '1px solid var(--hair)', borderRadius: 3, background: 'var(--surface)' }}>
          <div className="table-scroll">
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
                <th style={{ ...thS, textAlign: 'right' }}>Pallet Qty</th>
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
        </div>
      )}

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
  onPageChange, onDateFromChange, onDateToChange, onPalletFilterChange, onExpand, onOpenBoard, onChipAdded, onAddBoard, onDeleteBoard }: {
  boards: Board[]; pallets: Pallet[]; total: number; page: number; pageCount: number;
  dateFrom: string; dateTo: string; palletFilter: string; expandedBoard: number | null; chipBrands: ChipBrand[];
  onPageChange: (p: number) => void; onDateFromChange: (v: string) => void;
  onDateToChange: (v: string) => void; onPalletFilterChange: (v: string) => void; onExpand: (id: number) => void;
  onOpenBoard: (id: number) => void; onChipAdded: () => void; onAddBoard: () => void; onDeleteBoard: (id: number) => void;
}) {
  const from = (page - 1) * BOARDS_PAGE_SIZE + 1;
  const to = Math.min(page * BOARDS_PAGE_SIZE, total);
  const hasFilter = dateFrom || dateTo || palletFilter;
  const isMobile = useIsMobile();

  const palletOptions = [
    { value: '', label: 'All pallets' },
    ...pallets.map(p => {
      const parts = [p.licence_number, p.payload_number].filter(Boolean);
      const label = parts.length ? parts.join('-') : `#${String(p.pallet_seq).padStart(2, '0')}`;
      return { value: String(p.id), label: `#${String(p.pallet_seq).padStart(2, '0')} · ${label}` };
    }),
  ];

  const filterBar = isMobile ? (
    /* Mobile filter: stacked rows */
    <div style={{ marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Select value={palletFilter} onChange={v => { onPalletFilterChange(v); onPageChange(1); }}
          options={palletOptions} style={{ flex: 1 }} />
        <Button size="sm" variant="primary" icon={<PlusIcon />} onClick={onAddBoard} disabled={pallets.length === 0}>
          Add
        </Button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input type="date" value={dateFrom} onChange={e => { onDateFromChange(e.target.value); onPageChange(1); }}
          style={{ flex: 1, border: '1px solid var(--hair-strong)', borderRadius: 3, padding: '6px 8px', fontSize: 12, outline: 'none', background: 'var(--surface)', color: 'var(--ink)' }} />
        <span style={{ color: 'var(--ink-4)', fontSize: 12, flexShrink: 0 }}>→</span>
        <input type="date" value={dateTo} onChange={e => { onDateToChange(e.target.value); onPageChange(1); }}
          style={{ flex: 1, border: '1px solid var(--hair-strong)', borderRadius: 3, padding: '6px 8px', fontSize: 12, outline: 'none', background: 'var(--surface)', color: 'var(--ink)' }} />
        {hasFilter && <Button size="sm" variant="ghost" onClick={() => { onDateFromChange(''); onDateToChange(''); onPalletFilterChange(''); onPageChange(1); }}>Clear</Button>}
      </div>
    </div>
  ) : (
    /* Desktop filter: single row */
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14, marginBottom: 10,
      padding: '10px 12px', border: '1px solid var(--hair)', borderRadius: 3, background: 'var(--surface)',
    }}>
      <span style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-4)' }}>Pallet</span>
      <div style={{ minWidth: 180 }}>
        <Select value={palletFilter} onChange={v => { onPalletFilterChange(v); onPageChange(1); }} options={palletOptions} />
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
      <Button size="sm" variant="primary" icon={<PlusIcon />} onClick={onAddBoard} disabled={pallets.length === 0}>
        Add board
      </Button>
    </div>
  );

  return (
    <div>
      {isMobile && filterBar}

      {isMobile ? (
        /* Mobile: board cards */
        <div>
          {boards.length === 0 && (
            <div style={{ padding: '28px 0', textAlign: 'center', fontSize: 12, color: 'var(--ink-3)' }}>No boards found.</div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {boards.map(b => (
              <div key={b.id} style={{
                background: 'var(--surface)', border: '1px solid var(--hair)', borderRadius: 4,
                padding: '9px 12px', display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <button onClick={() => onOpenBoard(b.id)} className="mono" style={{
                  background: 'none', border: 0, padding: 0, cursor: 'pointer', fontSize: 12.5,
                  color: 'var(--ink)', textDecoration: 'underline', textDecorationColor: 'var(--ink-5)',
                  textUnderlineOffset: 3, fontFamily: 'inherit', flexShrink: 0,
                }}>
                  {b.barcode || '—'}
                </button>
                {b.mpn && <><span style={{ color: 'var(--hair-strong)', flexShrink: 0 }}>·</span><span className="mono" style={{ fontSize: 12, color: 'var(--ink-3)', flexShrink: 0 }}>{b.mpn}</span></>}
                <span style={{ color: 'var(--hair-strong)', flexShrink: 0 }}>·</span>
                <span style={{ fontSize: 11.5, color: 'var(--ink-3)', flexShrink: 0 }}>
                  Qty <span className="num" style={{ color: 'var(--ink-2)' }}>{b.qty}</span>
                </span>
                <span style={{ color: 'var(--hair-strong)', flexShrink: 0 }}>·</span>
                <span style={{ fontSize: 11.5, color: 'var(--ink-3)', flexShrink: 0 }}>
                  Chips <span className="num" style={{ color: 'var(--ink-2)' }}>{b.chip_count}</span>
                </span>
                <div style={{ flex: 1 }} />
                <span className="num mono" style={{ fontSize: 11, color: 'var(--ink-4)', flexShrink: 0 }}>
                  {b.scanned_at?.slice(11, 16)}
                </span>
                <button onClick={() => onDeleteBoard(b.id)} style={{ ...ghostBtn, flexShrink: 0 }} title="Delete"><TrashIcon /></button>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12 }}>
            <Pagination page={page} pageCount={pageCount} onChange={onPageChange} total={total} pageSize={BOARDS_PAGE_SIZE} />
          </div>
        </div>
      ) : (
        /* Desktop: boards table */
        <div style={{ border: '1px solid var(--hair)', borderRadius: 3, background: 'var(--surface)' }}>
          <div className="table-scroll">
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: 28 }} /><col style={{ width: '15%' }} /><col style={{ width: '13%' }} />
              <col style={{ width: '10%' }} /><col style={{ width: '14%' }} /><col style={{ width: '9%' }} />
              <col style={{ width: '7%' }} /><col style={{ width: '8%' }} /><col /><col style={{ width: 42 }} />
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
                <th style={thS}></th>
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
                        {b.pallet_label ? <span style={{ color: 'var(--ink-2)' }}>{b.pallet_label}</span> : <span style={{ color: 'var(--ink-5)' }}>—</span>}
                      </td>
                      <td style={{ ...tdS, fontSize: 12 }} className="mono">{b.catalog || '—'}</td>
                      <td style={{ ...tdS, fontSize: 12, color: 'var(--ink-3)' }} className="mono">{b.barcode || '—'}</td>
                      <td style={{ ...tdS, textAlign: 'right' }} className="num">{b.weight ? parseFloat(b.weight).toFixed(2) : '—'}</td>
                      <td style={{ ...tdS, textAlign: 'right' }} className="num">{b.qty}</td>
                      <td style={{ ...tdS, textAlign: 'right' }} className="num">{b.chip_count}</td>
                      <td style={{ ...tdS, fontSize: 11.5, color: 'var(--ink-3)' }} className="num">{b.scanned_at?.slice(0, 10)}</td>
                      <td style={{ ...tdS, textAlign: 'right' }}>
                        <button onClick={() => onDeleteBoard(b.id)} style={ghostBtn} title="Delete"><TrashIcon /></button>
                      </td>
                    </tr>
                    {open && (
                      <tr style={{ borderBottom: '1px solid var(--hair)' }}>
                        <td />
                        <td colSpan={9} style={{ padding: '8px 14px 16px' }}>
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
                <tr><td colSpan={10} style={{ padding: '28px 14px', textAlign: 'center', fontSize: 12, color: 'var(--ink-3)' }}>
                  No boards found.
                </td></tr>
              )}
            </tbody>
          </table>
          </div>

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
      )}
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
type PalletRowData = { weight: string; qty: string; licence_number: string; payload_number: string; board_qty: string };

function AddPalletModal({ open, rule, onClose, onAdd, onAddBulk }: {
  open: boolean; rule: string; onClose: () => void;
  onAdd: (data: PalletRowData) => void;
  onAddBulk: (rows: PalletRowData[]) => void;
}) {
  const aggregated = rule === 'aggregated';
  const [mode, setMode] = useState<'single' | 'bulk'>('single');

  // single
  const [w, setW] = useState('');
  const [q, setQ] = useState('');
  const [licence, setLicence] = useState('');
  const [payload, setPayload] = useState('');
  const [boardQty, setBoardQty] = useState('');

  // bulk
  const blankRow = (): PalletRowData => ({ licence_number: '', payload_number: '', weight: '', qty: aggregated ? '' : '1', board_qty: '' });
  const [rows, setRows] = useState<PalletRowData[]>(Array.from({ length: 10 }, blankRow));

  useEffect(() => {
    if (open) {
      setMode('single');
      setW(''); setQ(aggregated ? '' : '1'); setLicence(''); setPayload(''); setBoardQty('');
      setRows(Array.from({ length: 10 }, blankRow));
    }
  }, [open, aggregated]);

  const updateRow = (i: number, patch: Partial<PalletRowData>) =>
    setRows(rs => rs.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  const addRow = () => setRows(rs => [...rs, blankRow()]);
  const removeRow = (i: number) => setRows(rs => rs.length === 1 ? [blankRow()] : rs.filter((_, idx) => idx !== i));

  const filledRows = rows.filter(r => String(r.weight).trim() !== '' && (!aggregated || String(r.qty).trim() !== ''));
  const canSaveSingle = w !== '' && q !== '';
  const canSaveBulk = filledRows.length > 0;

  const licList = filledRows.map(r => (r.licence_number || '').trim()).filter(Boolean);
  const dupLicences = new Set(licList.filter((l, i) => licList.indexOf(l) !== i));

  const submitSingle = () => {
    onAdd({ weight: w, qty: q, licence_number: licence, payload_number: payload, board_qty: boardQty });
    onClose();
  };
  const submitBulk = () => {
    onAddBulk(filledRows.map(r => ({
      licence_number: r.licence_number,
      payload_number: r.payload_number,
      weight: r.weight,
      qty: aggregated ? r.qty : '1',
      board_qty: r.board_qty,
    })));
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose}
      title={
        <div style={{ display: 'flex', gap: 0, border: '1px solid var(--hair)', borderRadius: 3, padding: 2, width: 'fit-content' }}>
          {(['single', 'bulk'] as const).map(k => (
            <button key={k} onClick={() => setMode(k)}
              style={{ padding: '5px 14px', fontSize: 12, border: 0, cursor: 'pointer',
                background: mode === k ? 'var(--ink)' : 'transparent',
                color: mode === k ? '#fff' : 'var(--ink-3)',
                borderRadius: 2, letterSpacing: 0.2, fontWeight: mode === k ? 500 : 400 }}>
              {k === 'single' ? 'One' : 'Multi'}
            </button>
          ))}
        </div>
      }
      width={mode === 'bulk' ? 1000 : 500}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        {mode === 'single'
          ? <Button variant="primary" disabled={!canSaveSingle} onClick={submitSingle}>Add</Button>
          : <Button variant="primary" disabled={!canSaveBulk} onClick={submitBulk}>
              Add {filledRows.length || ''} pallet{filledRows.length === 1 ? '' : 's'}
            </Button>}
      </>}>

      {mode === 'single' && (
        <>
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
            <Field label={aggregated ? 'Pallet Qty (physical pallets)' : 'Pallet Qty'}>
              {aggregated
                ? <Input value={q} onChange={setQ} type="number" placeholder="0" />
                : <Input value="1" onChange={() => {}} type="number" disabled />}
            </Field>
            <Field label="Board Qty" span={2}>
              <Input value={boardQty} onChange={setBoardQty} type="number" placeholder="Optional" />
            </Field>
          </div>
        </>
      )}

      {mode === 'bulk' && (
        <>
          <div style={{ border: '1px solid var(--hair)', borderRadius: 3, background: 'var(--surface)', overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '36px 1.4fr 1.4fr 1fr 1fr 1fr 28px', gap: 0, padding: '8px 10px', fontSize: 9.5, letterSpacing: '0.14em', textTransform: 'uppercase' as const, color: 'var(--ink-4)', background: 'var(--surface-2)', borderBottom: '1px solid var(--hair)' }}>
              <div>#</div>
              <div style={{ paddingLeft: 6 }}>Licence No</div>
              <div style={{ paddingLeft: 6 }}>Payload No</div>
              <div style={{ paddingLeft: 6, textAlign: 'right' as const }}>Weight (lb)</div>
              <div style={{ paddingLeft: 6, textAlign: 'right' as const }}>Pallet Qty</div>
              <div style={{ paddingLeft: 6, textAlign: 'right' as const }}>Board Qty</div>
              <div />
            </div>
            <div>
              {rows.map((r, i) => {
                const isDup = !!r.licence_number && dupLicences.has(r.licence_number.trim());
                return (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '36px 1.4fr 1.4fr 1fr 1fr 1fr 28px', gap: 0, padding: '6px 10px', alignItems: 'center', borderBottom: '1px solid var(--hair)' }}>
                    <span className="mono" style={{ fontSize: 11, color: 'var(--ink-4)' }}>
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <BulkCellP value={r.licence_number} onChange={v => updateRow(i, { licence_number: v })}
                      warn={isDup} title={isDup ? 'Duplicate licence in this batch' : undefined} />
                    <BulkCellP value={r.payload_number} onChange={v => updateRow(i, { payload_number: v })} />
                    <BulkCellP value={r.weight} onChange={v => updateRow(i, { weight: v })}
                      type="number" placeholder="0.00" align="right" />
                    {aggregated
                      ? <BulkCellP value={r.qty} onChange={v => updateRow(i, { qty: v })}
                          type="number" placeholder="0" align="right" />
                      : <span style={{ paddingLeft: 6, textAlign: 'right' as const, fontSize: 12, color: 'var(--ink-4)', fontVariantNumeric: 'tabular-nums' }}>1</span>}
                    <BulkCellP value={r.board_qty} onChange={v => updateRow(i, { board_qty: v })}
                      type="number" placeholder="—" align="right" />
                    <button onClick={() => removeRow(i)} title="Remove row"
                      style={{ background: 'none', border: 0, cursor: 'pointer', color: 'var(--ink-4)', padding: 0, lineHeight: 0, display: 'inline-flex', justifyContent: 'flex-end' }}>
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>
            <div style={{ padding: '8px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--hair)', background: 'var(--surface-2)' }}>
              <button onClick={addRow}
                style={{ background: 'none', border: '1px dashed var(--hair-strong)', borderRadius: 3, padding: '4px 10px', fontSize: 11, color: 'var(--ink-3)', cursor: 'pointer', fontFamily: 'inherit' }}>
                + Add row
              </button>
              <div style={{ fontSize: 11, color: 'var(--ink-4)' }}>
                <span className="num" style={{ color: 'var(--ink-2)' }}>{filledRows.length}</span> of {rows.length} filled
                {dupLicences.size > 0 && (
                  <span style={{ marginLeft: 10, color: '#b8782a' }}>
                    · {dupLicences.size} duplicate licence{dupLicences.size === 1 ? '' : 's'}
                  </span>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}

function BulkCellP({ value, onChange, type = 'text', placeholder, align = 'left', warn, title }: {
  value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
  align?: 'left' | 'right'; warn?: boolean; title?: string;
}) {
  return (
    <input value={value} onChange={e => onChange(e.target.value)}
      type={type} placeholder={placeholder} title={title}
      style={{ width: '100%', padding: '4px 6px', border: '1px solid transparent', borderRadius: 2, background: 'transparent', color: warn ? '#b8782a' : 'var(--ink)', fontSize: 12, fontFamily: 'inherit', textAlign: align, fontVariantNumeric: 'tabular-nums' as const, outline: 'none' }}
      onFocus={e => e.currentTarget.style.border = '1px solid var(--ink)'}
      onBlur={e => e.currentTarget.style.border = '1px solid transparent'} />
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
function MpnComboInput({ value, onChange, mpns, autoFocus, placeholder }: {
  value: string; onChange: (v: string) => void; mpns: string[];
  autoFocus?: boolean; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const filtered = mpns.filter(m => m.toLowerCase().includes(value.toLowerCase().trim()));
  return (
    <div style={{ position: 'relative' }}>
      <input
        value={value}
        onChange={e => onChange(e.target.value.toUpperCase())}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        autoFocus={autoFocus}
        placeholder={placeholder ?? 'NVMe-PCIe4-1T'}
        style={{
          width: '100%', padding: '6px 10px', boxSizing: 'border-box',
          border: '1px solid var(--hair-strong)', borderRadius: 3,
          background: 'var(--surface)', color: 'var(--ink)',
          fontSize: 13, outline: 'none', fontFamily: 'ui-monospace, monospace',
        }}
      />
      {open && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
          background: 'var(--surface)', border: '1px solid var(--hair-strong)',
          borderRadius: 3, boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
          maxHeight: 180, overflowY: 'auto', marginTop: 2,
        }}>
          {filtered.map(m => (
            <div key={m} onMouseDown={() => { onChange(m); setOpen(false); }}
              style={{ padding: '7px 10px', cursor: 'pointer', fontSize: 12.5, fontFamily: 'ui-monospace, monospace', color: 'var(--ink)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              {m}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AddBoardModal({ open, pallets, mpns, onClose, onAdd, onAddBulk }: {
  open: boolean; pallets: Pallet[]; mpns: string[]; onClose: () => void;
  onAdd: (d: { barcode: string; catalog: string; mpn: string; weight: string; qty: string; note: string; pallet: string }) => void;
  onAddBulk: (rows: { barcode: string }[], shared: { catalog: string; mpn: string; pallet: string }) => void;
}) {
  const [mode, setMode] = useState<'single' | 'bulk'>('single');
  // single
  const [barcode, setBarcode] = useState('');
  const [catalog, setCatalog] = useState('');
  const [mpn, setMpn] = useState('');
  const [weight, setWeight] = useState('');
  const [qty, setQty] = useState('0');
  const [note, setNote] = useState('');
  const [pallet, setPallet] = useState('');
  // bulk
  const [bulkBarcode, setBulkBarcode] = useState('');
  const [bulkRows, setBulkRows] = useState<{ barcode: string }[]>([]);
  const [bCatalog, setBCatalog] = useState('');
  const [bMpn, setBMpn] = useState('');
  const [bPallet, setBPallet] = useState('');
  const [selectedBulkIdx, setSelectedBulkIdx] = useState<number | null>(null);
  const [bulkBarcodeFocused, setBulkBarcodeFocused] = useState(false);
  const [bulkPage, setBulkPage] = useState(1);
  const BULK_PAGE_SIZE = 108;

  useEffect(() => {
    if (open) {
      setMode('single');
      setBarcode(''); setCatalog(''); setMpn(''); setWeight(''); setQty('0'); setNote(''); setPallet('');
      setBulkBarcode(''); setBulkRows([]); setBCatalog(''); setBMpn(''); setBPallet(''); setSelectedBulkIdx(null); setBulkPage(1);
    }
  }, [open]);

  const palletOptions = [
    { value: '', label: '— No pallet —' },
    ...pallets.map(p => {
      const parts = [p.licence_number, p.payload_number].filter(Boolean);
      const label = parts.length ? parts.join('-') : `#${String(p.pallet_seq).padStart(2, '0')}`;
      return { value: String(p.id), label: `#${String(p.pallet_seq).padStart(2, '0')} · ${label}` };
    }),
  ];

  const canSaveSingle = mpn.trim() !== '' && pallet !== '' && qty.trim() !== '' && +qty > 0;
  const canSaveBulk = bulkRows.length > 0 && bMpn.trim() !== '' && bPallet !== '';
  const dupCount = bulkRows.length - new Set(bulkRows.map(r => r.barcode)).size;
  const bulkTotalPages = Math.max(1, Math.ceil(bulkRows.length / BULK_PAGE_SIZE));
  const bulkSafePage = Math.min(bulkPage, bulkTotalPages);

  const pushBulk = (raw: string) => {
    const v = (raw || '').trim();
    if (!v) return;
    setBulkRows(rs => {
      const next = [...rs, { barcode: v }];
      setBulkPage(Math.ceil(next.length / BULK_PAGE_SIZE));
      return next;
    });
    setBulkBarcode('');
  };
  const removeBulk = (i: number) => { setBulkRows(rs => rs.filter((_, j) => j !== i)); setSelectedBulkIdx(null); };

  return (
    <Modal open={open} onClose={onClose}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 0, border: '1px solid var(--hair)', borderRadius: 3, padding: 2, flexShrink: 0 }}>
            {(['single', 'bulk'] as const).map((k) => (
              <button key={k} onClick={() => setMode(k)}
                style={{ padding: '5px 14px', fontSize: 12, border: 0, cursor: 'pointer',
                  background: mode === k ? 'var(--ink)' : 'transparent',
                  color: mode === k ? '#fff' : 'var(--ink-3)',
                  borderRadius: 2, letterSpacing: 0.2, fontWeight: mode === k ? 500 : 400 }}>
                {k === 'single' ? 'One' : 'Multi'}
              </button>
            ))}
          </div>
          {mode === 'bulk' && (
            <div style={{ display: 'flex', gap: 0, flex: 1, minWidth: 0, alignItems: 'flex-end' }}>
              {/* Grouped: MPN + Pallet + Catalog */}
              <div style={{ display: 'flex', gap: 20, alignItems: 'flex-end' }}>
                <div style={{ flex: '0 0 220px' }}>
                  <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--ink-3)', marginBottom: 3 }}>MPN <span style={{ color: 'red' }}>*</span></div>
                  <MpnComboInput value={bMpn} onChange={setBMpn} mpns={mpns} />
                </div>
                {/* Pallet + Catalog side by side with tight gap */}
                <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
                  <div style={{ flex: '0 0 300px' }}>
                    <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--ink-3)', marginBottom: 3 }}>Pallet <span style={{ color: 'red' }}>*</span></div>
                    <Select value={bPallet} onChange={setBPallet} options={palletOptions} size="lg" style={{ width: '100%' }} />
                  </div>
                  <div style={{ flex: '0 0 150px' }}>
                    <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--ink-3)', marginBottom: 3 }}>Catalog</div>
                    <Input value={bCatalog} onChange={setBCatalog} placeholder="SSD-C3" style={{ width: '100%' }} />
                  </div>
                </div>
              </div>
              {/* Divider */}
              <div style={{ width: 1, background: 'var(--hair-strong)', alignSelf: 'stretch', margin: '0 20px' }} />
              {/* Barcode scan field */}
              <div style={{ flex: 1, minWidth: 260 }}>
                <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--ink-3)', marginBottom: 3 }}>Barcode</div>
                <Input value={bulkBarcode}
                  onChange={v => {
                    if (v.includes('\r') || v.includes('\n')) {
                      pushBulk(v.replace(/[\r\n]/g, '').trim());
                    } else {
                      setBulkBarcode(v);
                    }
                  }}
                  placeholder="Scan or type, then press Enter" autoFocus
                  onFocus={() => setBulkBarcodeFocused(true)}
                  onBlur={() => setBulkBarcodeFocused(false)}
                  onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      pushBulk((e.target as HTMLInputElement).value);
                    }
                  }}
                  style={{
                    fontFamily: 'ui-monospace, monospace', width: '100%',
                    ...(bulkBarcodeFocused ? { background: '#e8f5e9', border: '1px solid #4caf50' } : {}),
                  }} />
              </div>
            </div>
          )}
        </div>
      }
      width={mode === 'single' ? 520 : 1400}
      footer={mode === 'single'
        ? <>
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button variant="primary" disabled={!canSaveSingle}
              onClick={() => { onAdd({ barcode, catalog, mpn, weight, qty, note, pallet }); onClose(); }}>Add</Button>
          </>
        : <>
            <span style={{ fontSize: 22, color: 'var(--ink-3)', fontWeight: 500, flexShrink: 0 }}>
              <span className="num" style={{ color: 'var(--ink)', fontWeight: 700 }}>{bulkRows.length}</span> scanned
              {dupCount > 0 && <span style={{ marginLeft: 12, color: '#b8782a' }}>· {dupCount} duplicate{dupCount > 1 ? 's' : ''}</span>}
            </span>
            {bulkTotalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, justifyContent: 'center' }}>
                <button onClick={() => setBulkPage(p => Math.max(1, p - 1))} disabled={bulkSafePage === 1}
                  style={{ padding: '4px 12px', fontSize: 13, border: '1px solid var(--hair-strong)',
                    borderRadius: 3, background: 'var(--surface)', cursor: bulkSafePage === 1 ? 'not-allowed' : 'pointer',
                    opacity: bulkSafePage === 1 ? 0.4 : 1, color: 'var(--ink)' }}>‹ Prev</button>
                <span style={{ fontSize: 13, color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>
                  Page <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{bulkSafePage}</span> / {bulkTotalPages}
                  <span style={{ marginLeft: 8, fontSize: 12 }}>({(bulkSafePage - 1) * BULK_PAGE_SIZE + 1}–{Math.min(bulkSafePage * BULK_PAGE_SIZE, bulkRows.length)})</span>
                </span>
                <button onClick={() => setBulkPage(p => Math.min(bulkTotalPages, p + 1))} disabled={bulkSafePage === bulkTotalPages}
                  style={{ padding: '4px 12px', fontSize: 13, border: '1px solid var(--hair-strong)',
                    borderRadius: 3, background: 'var(--surface)', cursor: bulkSafePage === bulkTotalPages ? 'not-allowed' : 'pointer',
                    opacity: bulkSafePage === bulkTotalPages ? 0.4 : 1, color: 'var(--ink)' }}>Next ›</button>
              </div>
            )}
            {bulkTotalPages <= 1 && <span style={{ flex: 1 }} />}
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button variant="primary" disabled={!canSaveBulk}
              onClick={() => { onAddBulk(bulkRows, { catalog: bCatalog, mpn: bMpn, pallet: bPallet }); onClose(); }}>
              Add {bulkRows.length || ''} board{bulkRows.length === 1 ? '' : 's'}
            </Button>
          </>}>

      {mode === 'single' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label={<>MPN <span style={{ color: 'red' }}>*</span></>}>
            <MpnComboInput value={mpn} onChange={setMpn} mpns={mpns} autoFocus />
          </Field>
          <Field label="Catalog">
            <Input value={catalog} onChange={setCatalog} placeholder="SSD-C3" />
          </Field>
          <Field label={<>Pallet <span style={{ color: 'red' }}>*</span></>} span={2}>
            <Select value={pallet} onChange={setPallet} options={palletOptions} />
          </Field>
          <Field label="Barcode" span={2}>
            <Input value={barcode} onChange={setBarcode} placeholder="BC-000-0000" autoFocus
              style={{ fontFamily: 'ui-monospace, monospace' }} />
          </Field>
          <Field label="Weight (lb)">
            <Input value={weight} onChange={setWeight} type="number" placeholder="0.00" />
          </Field>
          <Field label={<>Qty <span style={{ color: 'red' }}>*</span></>}>
            <Input value={qty} onChange={v => setQty(v.replace(/^0+(\d)/, '$1'))} type="number" placeholder="1" />
          </Field>
          <Field label="Note" span={2}>
            <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Optional…" rows={2}
              style={{ width: '100%', padding: '6px 10px', border: '1px solid var(--hair-strong)',
                background: 'var(--surface)', borderRadius: 3, resize: 'vertical',
                fontSize: 13, color: 'var(--ink)', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
          </Field>
        </div>
      )}

      {mode === 'bulk' && (() => {
        const pageRows = bulkRows.slice((bulkSafePage - 1) * BULK_PAGE_SIZE, bulkSafePage * BULK_PAGE_SIZE);
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* 6-column barcode grid — fixed, no scroll */}
            <div style={{ border: '1px solid var(--hair)', borderRadius: 3, background: 'var(--surface)', minHeight: 580 }}>
              {bulkRows.length === 0 && (
                <div style={{ padding: '120px 16px', textAlign: 'center', fontSize: 12, color: 'var(--ink-3)' }}>
                  <div style={{ fontSize: 22, opacity: 0.25, marginBottom: 6 }}>⌁</div>
                  No barcodes scanned yet
                </div>
              )}
              {bulkRows.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)' }}>
                  {pageRows.map((r, pi) => {
                    const i = (bulkSafePage - 1) * BULK_PAGE_SIZE + pi;
                    const dup = bulkRows.findIndex(x => x.barcode === r.barcode) !== i;
                    const selected = selectedBulkIdx === i;
                    const col = pi % 6;
                    return (
                      <div key={i}
                        onClick={() => setSelectedBulkIdx(selected ? null : i)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          padding: '0.1px 5px', cursor: 'pointer',
                          borderBottom: '1px solid var(--hair)',
                          borderRight: col < 5 ? '1px solid var(--hair)' : 'none',
                          fontSize: 12, minWidth: 0,
                          background: dup ? (selected ? '#f87171' : '#fca5a5') : selected ? 'var(--surface-2)' : 'transparent',
                        }}>
                        <span style={{ flex: 1, minWidth: 0, fontFamily: 'ui-monospace, monospace',
                          color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden',
                          textOverflow: 'ellipsis', fontWeight: 600, fontSize: 20 }}>{r.barcode}</span>
                        {selected && (
                          <button onClick={e => { e.stopPropagation(); removeBulk(i); }}
                            style={{ background: 'none', border: 0, cursor: 'pointer',
                              color: 'var(--ink-3)', fontSize: 16, lineHeight: 1, padding: 2,
                              flexShrink: 0 }}>×</button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </Modal>
  );
}

// ─── Inline icons ──────────────────────────────────────────────────
const DotsVerticalIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <circle cx="8" cy="2.5" r="1.5" /><circle cx="8" cy="8" r="1.5" /><circle cx="8" cy="13.5" r="1.5" />
  </svg>
);
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
const ChevronDownIcon = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);
const ImageIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21 15 16 10 5 21" />
  </svg>
);
