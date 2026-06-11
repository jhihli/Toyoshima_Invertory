'use client';
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useRouter, useParams } from 'next/navigation';
import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import {
  Button, Input, Select, Modal, Breadcrumbs, Tabs,
  Card, SectionHeader, EditableCell, Field, Empty, Badge, useToast,
  thS, tdS, ghostBtn,
} from '@/app/ui/components';
import { api } from '@/app/lib/api';
import { WeightRuleField } from '../WeightRuleField';
import type { SODetail, Pallet, Board, Chip, Vendor } from '@/interface/IDatatable';
import { useIsMobile } from '@/app/ui/hooks/useIsMobile';

function downloadBackup(data: { so_number: string; mpn: string; pallet: string; barcodes: string[] }) {
  const backup = {
    saved_at: new Date().toISOString(),
    so_number: data.so_number,
    mpn: data.mpn,
    pallet: data.pallet,
    barcodes: data.barcodes,
    total: data.barcodes.length,
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const dateStr = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '-');
  a.href = url;
  a.download = `scan_backup_${data.so_number}_${dateStr}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Build pallet dropdown options. Uses gateload_number as the label number when available
 *  (user's mental model: "Pallet 2" = the pallet whose gateload is 2).
 *  Falls back to 1-based sorted position when no gateload_number exists. */
function sortedPalletOptions(pallets: import('@/interface/IDatatable').Pallet[]) {
  const sorted = [...pallets].sort((a, b) => {
    const la = [a.licence_number, a.gateload_number].filter(Boolean).join('-') || `#${String(a.pallet_seq).padStart(2, '0')}`;
    const lb = [b.licence_number, b.gateload_number].filter(Boolean).join('-') || `#${String(b.pallet_seq).padStart(2, '0')}`;
    return la.localeCompare(lb);
  });
  return sorted.map((p, i) => ({
    value: String(p.id),
    label: p.gateload_number ? `Pallet ${p.gateload_number}` : `Pallet ${i + 1}`,
    pallet: p,
  }));
}

export default function SODetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const soId = Number(id);
  const toast = useToast();

  const [so, setSo] = useState<SODetail | null>(null);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'pallets' | 'boards'>('pallets');
  const [editMeta, setEditMeta] = useState(false);
  const [addPalletOpen, setAddPalletOpen] = useState(false);
  const [addBoardOpen, setAddBoardOpen] = useState(false);
  const [boardMpns, setBoardMpns] = useState<string[]>([]);
  const [lightbox, setLightbox] = useState<SODetail['photos'][0] | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteBoardId, setDeleteBoardId] = useState<number | null>(null);
  const [deletePalletId, setDeletePalletId] = useState<number | null>(null);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [photosMenuOpen, setPhotosMenuOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const actionMenuRef = useRef<HTMLDivElement>(null);
  const photosMenuRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  // Board pagination + filter state
  const [boards, setBoards] = useState<Board[]>([]);
  const [boardDateFrom, setBoardDateFrom] = useState('');
  const [boardDateTo, setBoardDateTo] = useState('');
  const [boardPalletFilter, setBoardPalletFilter] = useState('');
  const [boardBarcodeSearch, setBoardBarcodeSearch] = useState('');

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
        page: 1, page_size: 9999,
      };
      if (boardPalletFilter) params.pallet = boardPalletFilter;
      const res = await api.boards.listBySO(soId, params);
      setBoards(res.results);
    } catch {}
  }, [soId, boardDateFrom, boardDateTo, boardPalletFilter]);

  useEffect(() => { loadSO(); }, [loadSO]);
  useEffect(() => { if (tab === 'boards') loadBoards(); }, [tab, loadBoards]);
  useEffect(() => { api.vendors.list().then(setVendors).catch(() => {}); }, []);
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

  useEffect(() => {
    if (!lightbox) return;
    document.body.style.overflow = 'hidden';
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightbox(null); };
    window.addEventListener('keydown', h);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', h);
    };
  }, [lightbox]);

  if (loading || !so) {
    return <div className="page-pad" style={{ color: 'var(--ink-3)', fontSize: 13 }}>Loading…</div>;
  }

  const vendor = vendors.find(v => v.id === so.vendor);
  const effectiveRule = so.effective_weight_rule;
  const ruleIsOverride = so.weight_rule && so.weight_rule !== so.vendor_weight_rule;

  const palletTotal = so.pallets.reduce((acc, p) => ({
    weight: acc.weight + parseFloat(p.in_weight_gross),
    qty: acc.qty + p.qty,
    boardQty: acc.boardQty + (p.board_qty ?? 0),
    outWeightGross: acc.outWeightGross + (p.out_weight_gross ? parseFloat(p.out_weight_gross) : 0),
    outWeightNet: acc.outWeightNet + (p.out_weight_net ? parseFloat(p.out_weight_net) : 0),
    tantalumWt: acc.tantalumWt + (p.tantalum_wt ? parseFloat(p.tantalum_wt) : 0),
  }), { weight: 0, qty: 0, boardQty: 0, outWeightGross: 0, outWeightNet: 0, tantalumWt: 0 });

  const palletOptions = [
    { value: '', label: 'All pallets' },
    ...so.pallets.map(p => {
      const parts = [p.licence_number, p.gateload_number].filter(Boolean);
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
      setBoards(bs => bs.filter(b => b.pallet !== pId));
      toast('Pallet removed');
    } catch { toast('Failed to delete pallet'); }
  };

  const handleAddPallet = async (data: { in_weight_gross: string; actual_weight: string; out_weight_gross: string; out_weight_net: string; tantalum_wt: string; material_type: string; qty: string; licence_number: string; gateload_number: string; board_qty: string }) => {
    try {
      const created = await api.pallets.create(soId, {
        in_weight_gross: data.in_weight_gross as any,
        actual_weight: data.actual_weight ? (data.actual_weight as any) : null,
        out_weight_gross: data.out_weight_gross ? (data.out_weight_gross as any) : null,
        out_weight_net: data.out_weight_net ? (data.out_weight_net as any) : null,
        tantalum_wt: data.tantalum_wt ? (data.tantalum_wt as any) : null,
        material_type: data.material_type,
        qty: +data.qty,
        licence_number: data.licence_number,
        gateload_number: data.gateload_number,
        board_qty: data.board_qty ? +data.board_qty : null,
      });
      setSo(s => s ? { ...s, pallets: [...s.pallets, created] } : s);
      toast('Pallet added');
    } catch { toast('Failed to add pallet'); }
  };

  const handleAddPalletsBulk = async (rows: { in_weight_gross: string; actual_weight: string; out_weight_gross: string; out_weight_net: string; tantalum_wt: string; material_type: string; qty: string; licence_number: string; gateload_number: string; board_qty: string }[]) => {
    let added = 0;
    for (const data of rows) {
      try {
        const created = await api.pallets.create(soId, {
          in_weight_gross: data.in_weight_gross as any,
          actual_weight: data.actual_weight ? (data.actual_weight as any) : null,
          out_weight_gross: data.out_weight_gross ? (data.out_weight_gross as any) : null,
          out_weight_net: data.out_weight_net ? (data.out_weight_net as any) : null,
          tantalum_wt: data.tantalum_wt ? (data.tantalum_wt as any) : null,
          material_type: data.material_type,
          qty: +data.qty,
          licence_number: data.licence_number,
          gateload_number: data.gateload_number,
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
      setSo(s => s ? { ...s, total_board_count: s.total_board_count - 1 } : s);
      toast('Board deleted');
    } catch { toast('Failed to delete board'); }
    finally { setDeleteBoardId(null); }
  };

  const handleOpenAddBoard = async () => {
    setAddBoardOpen(true);
    try {
      const allMpns = await api.mpns.list();
      setBoardMpns(allMpns.map(m => m.name));
    } catch {}
  };

  const handleAddBoard = async (data: { barcode: string; mpn: string; qty: string; pallet: string }) => {
    try {
      await api.boards.create(soId, {
        so: soId, barcode: data.barcode,
        mpn: data.mpn || null, qty: +data.qty,
        pallet: data.pallet ? +data.pallet : null,
      } as any);
      toast('Board added');
      loadBoards();
      setSo(s => s ? { ...s, total_board_count: s.total_board_count + 1 } : s);
    } catch { toast('Failed to add board'); }
  };

  const handleAddBoardBulk = async (
    barcodes: { barcode: string }[],
    shared: { mpn: string; pallet: string }
  ) => {
    const boards = barcodes.map(r => ({
      so: soId, barcode: r.barcode,
      mpn: shared.mpn || null,
      qty: 1,
      pallet: shared.pallet ? +shared.pallet : null,
    }));
    const palletLabel = shared.pallet
      ? (sortedPalletOptions(so?.pallets ?? []).find(o => o.value === shared.pallet)?.label ?? shared.pallet)
      : 'No pallet';
    try {
      downloadBackup({
        so_number: so?.so_number ?? String(soId),
        mpn: shared.mpn,
        pallet: palletLabel,
        barcodes: barcodes.map(r => r.barcode),
      });
    } catch { /* download blocked by browser — don't break the save */ }
    const result = await api.boards.createBulk(soId, boards as any);
    toast(`${result.length} board${result.length === 1 ? '' : 's'} added`);
    loadBoards();
    setSo(s => s ? { ...s, total_board_count: s.total_board_count + result.length } : s);
  };


  const handleExport = async () => {
    toast('Preparing export…');
    try {
      const allBoards = await api.boards.listBySO(soId, { page: 1, page_size: 9999 });
      const allBoardData = allBoards.results;
      const workbook = new ExcelJS.Workbook();
      const palletMap = new Map(so.pallets.map(p => [p.id, p]));

      const HDR_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF156082' } };
      const HDR_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' } };
      const styleHdr = (row: ExcelJS.Row) => row.eachCell(cell => { cell.fill = HDR_FILL; cell.font = HDR_FONT; });

      // Build MPN map once (reused across sheets)
      type MpnEntry = { mpn: NonNullable<Board['mpn']>; chips: Board['chips']; boardCount: number; latestDate: string };
      const mpnMap = new Map<number, MpnEntry>();
      for (const b of allBoardData) {
        if (!b.mpn) continue;
        if (!mpnMap.has(b.mpn.id)) mpnMap.set(b.mpn.id, { mpn: b.mpn, chips: b.chips, boardCount: 0, latestDate: '' });
        const entry = mpnMap.get(b.mpn.id)!;
        entry.boardCount++;
        if (b.scanned_at > entry.latestDate) entry.latestDate = b.scanned_at;
      }

      // ── Sheet 1: Worksheet Descriptions (static) ─────────────────
      const wsDesc = workbook.addWorksheet('Worksheet Descriptions');
      wsDesc.columns = [{ width: 22 }, { width: 70 }, { width: 36 }, { width: 60 }];
      styleHdr(wsDesc.addRow(['Report', 'Description', 'Driver', 'SLA']));
      wsDesc.addRow(['In-Outbound report', 'E-E tracking of inbound and outbound material, per PO, per LP', 'Recycling reporting', 'inbound, day of receiving. Outbound, day of sending. Ongoing']);
      wsDesc.addRow(['Processing PCB', "Tracking of processed PCB's and harvested chips qty., per PO, per LP, per MPN", 'Billing, harvested chips', 'per month (cadence of invoicing)']);
      wsDesc.addRow(['Processing chips', 'Tracking of processed Chips for defined services, per Chip MPN, per Service', 'Billing, chips processing and packaging', 'per month (cadence of invoicing)']);
      wsDesc.addRow(['Inventory', 'Tracking of all processed chips ready for shipping, per UID container, MPN, processed type, packaging type', 'RFQ and transaction, inventory management', 'on going, review monthly, expected updated immediately, expected monthly cycle count(for now)']);
      wsDesc.addRow(['Board BOM', 'Bill of material for PCB, per MPN, each Chip for harvest', 'Material insight, validation', 'on going, each processed Board present before end of month']);
      wsDesc.addRow(['Chip BOM', 'Bill of material for chips, per Chip MPN, Chip type, Chip description, chip picture', 'Material insight, validation, RFQ', 'on going, each processed Chip present before end of month']);
      wsDesc.addRow(['Price list', 'Agreed pricing per provided service', 'Billing', 'fixed, mutual agreement for change.']);

      // ── Sheet 2: In-outbound ──────────────────────────────────────
      const wsInOut = workbook.addWorksheet('In-outbound');
      wsInOut.columns = [
        { width: 14 }, { width: 14 }, { width: 18 }, { width: 22 }, { width: 18 },
        { width: 14 }, { width: 14 }, { width: 18 }, { width: 22 }, { width: 18 },
      ];
      styleHdr(wsInOut.addRow(['SO No.', 'Inbound Date', 'Inbound LP No.', 'Inbound Weight gross', 'Inbound Weight net', 'Material type', 'Outbound Date ', 'Outbound LP No.', 'Outbound Weight gross', 'Outbound Weight net']));
      for (const p of so.pallets) {
        wsInOut.addRow([
          so.so_number, so.inbound_date, p.licence_number || '',
          p.in_weight_gross ? parseFloat(p.in_weight_gross) : '',
          p.actual_weight ? parseFloat(p.actual_weight) : '',
          p.material_type || '', so.outbound_date || '', p.licence_number || '',
          p.out_weight_gross ? parseFloat(p.out_weight_gross) : '',
          p.out_weight_net ? parseFloat(p.out_weight_net) : '',
        ]);
      }

      // ── Sheet 3: Processing PCB ───────────────────────────────────
      const wsPCB = workbook.addWorksheet('Processing PCB');
      wsPCB.columns = [{ width: 18 }, { width: 14 }, { width: 14 }, { width: 20 }, { width: 10 }, { width: 14 }];
      styleHdr(wsPCB.addRow(['Inbound LP No.', 'Date processed', 'Part type', 'MPN', 'Part Qty.', 'Chip Total Qty.']));
      const pcbMap = new Map<string, { lpNo: string; date: string; partType: string; mpnName: string; partQty: number; chipTypeCount: number }>();
      for (const b of allBoardData) {
        if (!b.mpn) continue;
        const pallet = b.pallet ? palletMap.get(b.pallet) : null;
        const lpNo = pallet?.licence_number || '';
        const key = `${lpNo}||${b.mpn.id}`;
        const chipTypeCount = (b.chips ?? []).length;
        if (!pcbMap.has(key)) pcbMap.set(key, { lpNo, date: b.scanned_at?.slice(0, 10) || '', partType: b.mpn.part_type || '', mpnName: b.mpn.name, partQty: 0, chipTypeCount });
        const entry = pcbMap.get(key)!;
        entry.partQty++;
        if ((b.scanned_at || '') > (entry.date + 'T')) entry.date = b.scanned_at?.slice(0, 10) || '';
      }
      const pcbRows = [...pcbMap.values()].sort((a, b) => a.lpNo.localeCompare(b.lpNo));
      for (const e of pcbRows) wsPCB.addRow([e.lpNo, e.date, e.partType, e.mpnName, e.partQty, e.chipTypeCount * e.partQty]);

      // ── Sheet 4: Processing chips ─────────────────────────────────
      const wsChipProc = workbook.addWorksheet('Processing chips');
      wsChipProc.columns = [{ width: 14 }, { width: 20 }, { width: 24 }, { width: 20 }, { width: 14 }, { width: 14 }];
      styleHdr(wsChipProc.addRow(['Date processed', 'process type', 'Chip MPN', 'Chips processed qty.', 'Chips failed', 'Failure rate']));
      const chipProcMap = new Map<string, { date: string; chipMpn: string; processed: number; failed: number }>();
      for (const [, { chips, boardCount, latestDate }] of mpnMap) {
        for (const chip of chips ?? []) {
          const key = chip.chip_mpn || '';
          if (!chipProcMap.has(key)) chipProcMap.set(key, { date: latestDate.slice(0, 10), chipMpn: chip.chip_mpn || '', processed: 0, failed: 0 });
          const entry = chipProcMap.get(key)!;
          entry.processed += chip.qty;
          entry.failed += chip.cut_fail ?? 0;
          if (latestDate.slice(0, 10) > entry.date) entry.date = latestDate.slice(0, 10);
        }
      }
      for (const e of chipProcMap.values()) {
        const row = wsChipProc.addRow([e.date, 'Chip Harvest', e.chipMpn, e.processed, e.failed, e.processed > 0 ? e.failed / e.processed : 0]);
        row.getCell(6).numFmt = '0.00%';
      }

      // ── Sheet 5: Inventory ───────────────────────────────────────
      const wsInventory = workbook.addWorksheet('Inventory');
      wsInventory.columns = [{ width: 14 }, { width: 24 }, { width: 18 }, { width: 16 }, { width: 8 }];
      styleHdr(wsInventory.addRow(['Container UID', 'Chip MPN', 'Processed type', 'Packaging type', 'Qty.']));
      const allContainers = await api.sos.chipContainers(soId);
      for (const c of allContainers) {
        wsInventory.addRow([c.container_uid, c.chip_mpn || '', c.processed_type || 'harvested', c.packaging_type || 'tray', c.inventory_qty ?? c.qty ?? '']);
      }

      // ── Sheet 6: Board BOM ────────────────────────────────────────
      const mpnBomEntries = [...mpnMap.values()].map(({ mpn, chips }) => ({
        partType: mpn.part_type || '',
        mpnName: mpn.name,
        chips: (chips ?? []).map(c => ({ chipMpn: c.chip_mpn || '', qty: c.qty })),
      }));
      const maxChips = Math.max(0, ...mpnBomEntries.map(e => e.chips.length));
      const bomHeader: string[] = ['Part type', 'MPN'];
      const bomCols: { width: number }[] = [{ width: 14 }, { width: 20 }];
      for (let i = 1; i <= maxChips; i++) {
        bomHeader.push(`Chip ${String.fromCharCode(64 + i)} MPN`, `Chip ${String.fromCharCode(64 + i)} Qty.`);
        bomCols.push({ width: 24 }, { width: 10 });
      }
      bomHeader.push('Chip Total Qty.');
      bomCols.push({ width: 14 });
      const wsBoardBom = workbook.addWorksheet('Board BOM');
      wsBoardBom.columns = bomCols;
      styleHdr(wsBoardBom.addRow(bomHeader));
      for (const { partType, mpnName, chips } of mpnBomEntries) {
        const row: (string | number)[] = [partType, mpnName];
        let total = 0;
        for (let i = 0; i < maxChips; i++) {
          const chip = chips[i];
          row.push(chip?.chipMpn ?? '', chip ? chip.qty : '');
          if (chip) total += chip.qty;
        }
        row.push(total || '');
        wsBoardBom.addRow(row);
      }

      // ── Sheet 7: Chip BOM (with embedded photos) ──────────────────
      const chipBomMap = new Map<string, { manufacturer: string; chipType: string; description: string; photoUrl: string }>();
      for (const b of allBoardData) {
        for (const chip of b.chips ?? []) {
          if (!chip.chip_mpn || chipBomMap.has(chip.chip_mpn)) continue;
          chipBomMap.set(chip.chip_mpn, {
            manufacturer: chip.brand_name || '',
            chipType: chip.chip_type || '',
            description: chip.description || '',
            photoUrl: chip.chip_photo_url || '',
          });
        }
      }
      console.log('[Export] Chip BOM photo URLs:', Array.from(chipBomMap.entries()).map(([k, v]) => ({ chip: k, photoUrl: v.photoUrl || '(none)' })));
      const wsChipBom = workbook.addWorksheet('Chip BOM');
      wsChipBom.columns = [{ width: 24 }, { width: 18 }, { width: 14 }, { width: 30 }, { width: 18 }];
      styleHdr(wsChipBom.addRow(['Chip MPN', 'Manufacturer', 'Chip type', 'Chip description', 'Chip picture']));
      for (const [chipMpn, e] of chipBomMap.entries()) {
        const dataRow = wsChipBom.addRow([chipMpn, e.manufacturer, e.chipType, e.description, '']);
        dataRow.height = 60;
        if (e.photoUrl) {
          try {
            const res = await fetch(e.photoUrl);
            if (res.ok) {
              const blob = await res.blob();
              const base64 = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve((reader.result as string).split(',')[1]);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
              });
              const ext = e.photoUrl.toLowerCase().endsWith('.png') ? 'png' : 'jpeg';
              const imgId = workbook.addImage({ base64, extension: ext });
              const r0 = dataRow.number - 1;
              wsChipBom.addImage(imgId, { tl: { col: 4, row: r0 } as any, br: { col: 5, row: r0 + 1 } as any, editAs: 'oneCell' });
            }
          } catch { /* skip failed image — leave cell empty */ }
        }
      }

      const r3 = (n: number) => Math.round(n * 1000) / 1000;

      // ── Sheet 8: Activity Based Processing Cost (dynamic per MPN) ──
      const wsActivityCost = workbook.addWorksheet('Activity Based Processing Cost');
      wsActivityCost.columns = [{ width: 26 }, { width: 14 }, { width: 58 }];
      const sortedForABC = [...mpnMap.values()].sort((a, b) => b.boardCount - a.boardCount);
      for (const entry of sortedForABC) {
        const cutCost = r3(Number(entry.mpn.cutboard_cost ?? 0));
        const chipTypeCount = entry.chips.length;
        const chipCutCost = cutCost > 0 && chipTypeCount > 0 ? r3(cutCost / chipTypeCount) : null;
        const cutDef = chipCutCost != null
          ? `The cost to cut a single chip by board type (${cutCost}/${chipTypeCount}=${chipCutCost})`
          : 'The cost to cut a single chip by board type';

        // Board part Number row
        const bpnRow = wsActivityCost.addRow(['Board part Number:', entry.mpn.name, '']);
        bpnRow.getCell(1).fill = HDR_FILL; bpnRow.getCell(1).font = HDR_FONT;
        bpnRow.getCell(2).font = { bold: true };

        // Column sub-headers
        const subHdr = wsActivityCost.addRow(['Service', 'Cost', 'Definition']);
        subHdr.eachCell(cell => { cell.fill = HDR_FILL; cell.font = HDR_FONT; });

        // Data rows — track row range for Total formula
        const dataStartRow = wsActivityCost.lastRow!.number + 1;
        wsActivityCost.addRow(['Chip Cut Out',        chipCutCost ?? '', cutDef]);
        wsActivityCost.addRow(['Chip Reball',         '', 'The cost to reball a single chip by chip type']);
        wsActivityCost.addRow(['Chip Test',           '', 'The cost to test a single chip by chip type']);
        wsActivityCost.addRow(['Chip Packaging tray', '', 'The cost to pack out a single chip by chip type']);
        const dataEndRow = wsActivityCost.lastRow!.number;

        // Total row
        const totalRow = wsActivityCost.addRow(['Total', '', '']);
        totalRow.getCell(2).value = { formula: `SUM(B${dataStartRow}:B${dataEndRow})` };
        totalRow.getCell(1).font = { bold: true };

        // Spacer between MPN blocks
        wsActivityCost.addRow([]);
      }

      // ── Sheet 9: Service_Cost_Example (all MPNs, chip cost = cutboard_cost / totalChipQty) ──
      const wsSCE = workbook.addWorksheet('Service_Cost_Example');
      wsSCE.columns = [{ width: 44 }, { width: 14 }, { width: 10 }, { width: 10 }, { width: 8 }, { width: 8 }, { width: 10 }, { width: 18 }, { width: 22 }];
      const sceHdr = wsSCE.addRow(['', 'Board Cut Cost', 'Harvest', 'Reball', 'Test', 'Pack', 'Total', 'On Hand Inventory', 'Total Processing Cost']);
      for (let c = 2; c <= 9; c++) { sceHdr.getCell(c).fill = HDR_FILL; sceHdr.getCell(c).font = HDR_FONT; }
      // Helper: add a data row and replace Total (col G) and Total Processing Cost (col I) with formulas
      const addSceRow = (ws: ExcelJS.Worksheet, cols: (string | number)[]) => {
        const row = ws.addRow(cols);
        const rn = row.number;
        row.getCell(7).value = { formula: `SUM(B${rn}:F${rn})` };
        row.getCell(9).value = { formula: `H${rn}*G${rn}` };
        return row;
      };
      const sortedMpns = [...mpnMap.values()].sort((a, b) => b.boardCount - a.boardCount);
      for (const entry of sortedMpns) {
        const cutCost = entry.mpn.cutboard_cost ?? 0;
        const inv = entry.boardCount;
        const chipTypeCount = (entry.chips ?? []).length;
        const unitChipCost = r3(cutCost > 0 && chipTypeCount > 0 ? cutCost / chipTypeCount : 0);
        wsSCE.addRow([]);
        const mpnRow = addSceRow(wsSCE, [entry.mpn.name, cutCost, '', '', '', '', 0, inv, 0]);
        mpnRow.getCell(1).fill = HDR_FILL; mpnRow.getCell(1).font = HDR_FONT;
        wsSCE.addRow([]);
        let chipStartRow = 0;
        let chipEndRow = 0;
        for (const chip of entry.chips) {
          const chipRow = addSceRow(wsSCE, [chip.chip_mpn, unitChipCost, '', '', '', '', 0, inv, 0]);
          if (!chipStartRow) chipStartRow = chipRow.number;
          chipEndRow = chipRow.number;
        }
        wsSCE.addRow([]);
        const totalRow = wsSCE.addRow([`Total Cost of harvested chips ${entry.mpn.name}`, '', '', '', '', '', '', '']);
        if (chipStartRow) totalRow.getCell(9).value = { formula: `SUM(I${chipStartRow}:I${chipEndRow})` };
        totalRow.getCell(1).fill = HDR_FILL; totalRow.getCell(1).font = HDR_FONT;
      }

      const buf = await workbook.xlsx.writeBuffer();
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
              Inbound {so.inbound_date}{so.outbound_date ? ` · Outbound ${so.outbound_date}` : ''} · {so.vendor_name} · Created {so.created_at?.slice(0, 10)}
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
            {/* Photos dropdown */}
            <div ref={photosMenuRef} style={{ flex: '0 0 auto', padding: '6px 12px', position: 'relative', display: 'flex', alignItems: 'center', borderRight: '1px solid var(--hair)' }}>
              <button
                onClick={() => setPhotosMenuOpen(o => !o)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '4px 10px', borderRadius: 4, border: `1px solid ${photosMenuOpen ? 'var(--accent-2)' : 'var(--accent-border)'}`,
                  background: photosMenuOpen ? 'var(--accent-2)' : 'var(--accent-light)',
                  color: photosMenuOpen ? '#fcfbf8' : 'var(--accent-2)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
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
            {/* Note */}
            <div style={{ flex: 1, padding: '6px 12px', minWidth: 0 }}>
              <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-4)', marginBottom: 2 }}>Note</div>
              <EditableCell value={so.note} onSave={v => handleSaveMeta({ note: v })} />
            </div>
          </div>
        </Card>
      )}
      <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
        onChange={e => { handlePhotoFiles(e.target.files); e.target.value = ''; }} />

      {/* Combined tab + action row */}
      {isMobile ? (
        <Tabs value={tab} onChange={v => setTab(v as any)} tabs={[
          { value: 'pallets', label: 'Pallets' },
          { value: 'boards', label: 'Boards' },
        ]} />
      ) : (
        <div style={{ display: 'flex', alignItems: 'stretch', borderBottom: '1px solid var(--hair)' }}>
          {/* Tab buttons */}
          {[
            { value: 'pallets', label: 'Pallets' },
            { value: 'boards', label: 'Boards' },
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
                <Select value={boardPalletFilter} onChange={v => { setBoardPalletFilter(v); }} options={palletOptions} />
              </div>
              <span style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-4)' }}>Scanned</span>
              <input type="date" value={boardDateFrom} onChange={e => { setBoardDateFrom(e.target.value); }}
                style={{ border: '1px solid var(--hair-strong)', borderRadius: 3, padding: '4px 8px', fontSize: 12, outline: 'none', background: 'var(--surface)', color: 'var(--ink)' }} />
              <span style={{ color: 'var(--ink-4)', fontSize: 12 }}>→</span>
              <input type="date" value={boardDateTo} onChange={e => { setBoardDateTo(e.target.value); }}
                style={{ border: '1px solid var(--hair-strong)', borderRadius: 3, padding: '4px 8px', fontSize: 12, outline: 'none', background: 'var(--surface)', color: 'var(--ink)' }} />
              {(boardDateFrom || boardDateTo || boardPalletFilter) && (
                <Button size="sm" variant="ghost" onClick={() => { setBoardDateFrom(''); setBoardDateTo(''); setBoardPalletFilter(''); }}>Clear</Button>
              )}
              <span style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-4)' }}>Barcode</span>
              <input
                type="text"
                value={boardBarcodeSearch}
                onChange={e => setBoardBarcodeSearch(e.target.value)}
                placeholder="Scan or search…"
                style={{ border: '1px solid var(--hair-strong)', borderRadius: 3, padding: '4px 8px', fontSize: 12, outline: 'none', background: 'var(--surface)', color: 'var(--ink)', width: 150 }}
              />
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
            onDelete={setDeletePalletId}
            onGoToBoards={palletId => { setBoardPalletFilter(String(palletId)); setTab('boards'); }}
          />
        )}
        {tab === 'boards' && (
          <BoardsTab
            boards={boards}
            pallets={so.pallets}
            soNumber={so.so_number}
            dateFrom={boardDateFrom}
            dateTo={boardDateTo}
            palletFilter={boardPalletFilter}
            barcodeSearch={boardBarcodeSearch}
            onDateFromChange={setBoardDateFrom}
            onDateToChange={setBoardDateTo}
            onPalletFilterChange={setBoardPalletFilter}
            onBarcodeSearchChange={setBoardBarcodeSearch}
            onAddBoard={handleOpenAddBoard}
            onDeleteBoard={setDeleteBoardId}
          />
        )}
      </div>

      {/* Lightbox */}
      {lightbox?.image_url && createPortal(
        <div
          onClick={() => setLightbox(null)}
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
              <span className="mono" style={{ fontSize: 12, color: '#fff' }}>
                {so?.so_number}{lightbox.caption ? ` · ${lightbox.caption}` : ''}
              </span>
              <span style={{ flex: 1 }} />
              <button
                onClick={() => setLightbox(null)}
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
            <img src={lightbox.image_url} alt="photo" style={{ display: 'block', maxWidth: '80vw', maxHeight: '70vh', objectFit: 'contain' }} />
          </div>
        </div>,
        document.body
      )}

      {/* Edit meta modal */}
      <EditSOModal open={editMeta} so={so} vendors={vendors} onClose={() => setEditMeta(false)} onSave={handleSaveMeta} />

      {/* Add pallet modal */}
      <AddPalletModal open={addPalletOpen} rule={effectiveRule} onClose={() => setAddPalletOpen(false)} onAdd={handleAddPallet} onAddBulk={handleAddPalletsBulk} />

      {/* Add board modal */}
      <AddBoardModal open={addBoardOpen} pallets={so.pallets} mpns={boardMpns} existingBoards={boards} onClose={() => setAddBoardOpen(false)} onAdd={handleAddBoard} onAddBulk={handleAddBoardBulk} />

      {/* Delete pallet confirmation modal */}
      {deletePalletId !== null && (() => {
        const pallet = so.pallets.find(p => p.id === deletePalletId);
        return (
          <Modal
            open={deletePalletId !== null}
            onClose={() => setDeletePalletId(null)}
            title="Delete Pallet"
            width={460}
            footer={<>
              <Button variant="ghost" onClick={() => setDeletePalletId(null)}>Cancel</Button>
              <Button variant="primary"
                style={{ background: '#c0392b', borderColor: '#c0392b' }}
                onClick={() => { handleDeletePallet(deletePalletId); setDeletePalletId(null); }}>
                Delete
              </Button>
            </>}>
            <div style={{ fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.6 }}>
              <p style={{ margin: '0 0 12px' }}>
                Are you sure you want to delete pallet{pallet ? <> <strong className="mono">#{String(pallet.pallet_seq).padStart(2, '0')}</strong></> : ''}?
              </p>
              {pallet && (
                <div style={{
                  background: 'var(--surface-2)', border: '1px solid var(--hair)',
                  borderRadius: 3, padding: '10px 14px', fontSize: 12.5, color: 'var(--ink-3)',
                }}>
                  {[pallet.licence_number, pallet.gateload_number].filter(Boolean).join(' · ') || '—'}
                  {pallet.board_qty != null && <span style={{ marginLeft: 8 }}>· {pallet.board_qty} boards</span>}
                  <div style={{ marginTop: 8, fontSize: 12 }}>
                    All barcodes linked to this pallet will be permanently deleted. MPN records will be kept.
                  </div>
                </div>
              )}
              <p style={{ margin: '12px 0 0', fontSize: 12, color: 'var(--ink-4)' }}>
                This action cannot be undone.
              </p>
            </div>
          </Modal>
        );
      })()}

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
                Are you sure you want to delete board{board?.mpn?.name ? <> <strong className="mono">{board.mpn!.name}</strong></> : ''}?
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
function PalletsTab({ pallets, effectiveRule, ruleIsOverride, vendorName, palletTotal, addDisabled, onAdd, onUpdate, onDelete, onGoToBoards }: {
  pallets: Pallet[]; effectiveRule: string; ruleIsOverride: boolean; vendorName: string;
  palletTotal: { weight: number; qty: number; boardQty: number; outWeightGross: number; outWeightNet: number; tantalumWt: number }; addDisabled: boolean;
  onAdd: () => void; onUpdate: (id: number, p: Partial<Pallet>) => void; onDelete: (id: number) => void;
  onGoToBoards: (palletId: number) => void;
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
            <div key={p.id} onClick={() => onGoToBoards(p.id)}
              style={{ background: 'var(--surface)', border: '1px solid var(--hair)', borderRadius: 4, padding: 14, cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Badge tone="warn" style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
                  {parseFloat(p.in_weight_gross).toFixed(2)} lb
                </Badge>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button onClick={e => { e.stopPropagation(); setEditingPallet(p); }} style={ghostBtn} title="Edit"><EditIcon /></button>
                  <button onClick={e => { e.stopPropagation(); onDelete(p.id); }} style={ghostBtn} title="Delete"><TrashIcon /></button>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5, fontSize: 11.5, color: 'var(--ink-3)', flexWrap: 'wrap' }}>
                {(p.licence_number || p.gateload_number) && (
                  <Badge tone="blue" style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11 }}>
                    {[p.licence_number, p.gateload_number].filter(Boolean).join(' · ')}
                  </Badge>
                )}
                {(p.licence_number || p.gateload_number) && <span style={{ color: 'var(--hair-strong)' }}>·</span>}
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
              <col style={{ width: '8%' }} />
              <col style={{ width: '7%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '7%' }} />
              <col style={{ width: '7%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '11%' }} />
            </colgroup>
            <thead>
              <tr>
                <th style={thS}>Licence No</th>
                <th style={thS}>Gateload No</th>
                <th style={{ ...thS, textAlign: 'right' }}>In Wt Gross (lb)</th>
                <th style={{ ...thS, textAlign: 'right' }}>Actual Wt (lb)</th>
                <th style={{ ...thS, textAlign: 'right' }}>Out Wt Gross (lb)</th>
                <th style={{ ...thS, textAlign: 'right' }}>Out Wt Net (lb)</th>
                <th style={{ ...thS, textAlign: 'right' }}>Tantalum Wt (g)</th>
                <th style={thS}>Material Type</th>
                <th style={{ ...thS, textAlign: 'right' }}>Pallet Qty</th>
                <th style={{ ...thS, textAlign: 'right' }}>Board Qty</th>
                <th style={{ ...thS, textAlign: 'right' }}>Board Qty (Real)</th>
                <th style={{ ...thS, textAlign: 'right' }}></th>
              </tr>
            </thead>
            <tbody>
              {pallets.map(p => (
                <tr key={p.id} onClick={() => onGoToBoards(p.id)}
                  style={{ borderBottom: '1px solid var(--hair)', cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ''}>
                  <td style={{ ...tdS, fontSize: 12 }} className="mono">{p.licence_number || <span style={{ color: 'var(--ink-5)' }}>—</span>}</td>
                  <td style={{ ...tdS, fontSize: 12 }} className="mono">{p.gateload_number || <span style={{ color: 'var(--ink-5)' }}>—</span>}</td>
                  <td style={{ ...tdS, textAlign: 'right' }} className="num">{parseFloat(p.in_weight_gross).toFixed(2)}</td>
                  <td style={{ ...tdS, textAlign: 'right' }} className="num">
                    {p.actual_weight ? parseFloat(p.actual_weight).toFixed(2) : <span style={{ color: 'var(--ink-5)' }}>—</span>}
                  </td>
                  <td style={{ ...tdS, textAlign: 'right' }} className="num">
                    {p.out_weight_gross ? parseFloat(p.out_weight_gross).toFixed(2) : <span style={{ color: 'var(--ink-5)' }}>—</span>}
                  </td>
                  <td style={{ ...tdS, textAlign: 'right' }} className="num">
                    {p.out_weight_net ? parseFloat(p.out_weight_net).toFixed(2) : <span style={{ color: 'var(--ink-5)' }}>—</span>}
                  </td>
                  <td style={{ ...tdS, textAlign: 'right' }} className="num">
                    {p.tantalum_wt ? parseFloat(p.tantalum_wt).toFixed(2) : <span style={{ color: 'var(--ink-5)' }}>—</span>}
                  </td>
                  <td style={{ ...tdS }}>{p.material_type || <span style={{ color: 'var(--ink-5)' }}>—</span>}</td>
                  <td style={{ ...tdS, textAlign: 'right' }} className="num">{p.qty}</td>
                  <td style={{ ...tdS, textAlign: 'right' }} className="num">
                    {p.board_qty != null ? p.board_qty : <span style={{ color: 'var(--ink-5)' }}>—</span>}
                  </td>
                  <td style={{ ...tdS, textAlign: 'right' }} className="num">
                    <span style={{ fontWeight: 600, color: p.board_count > 0 ? 'var(--ink)' : 'var(--ink-5)' }}>
                      {p.board_count}
                    </span>
                  </td>
                  <td style={{ ...tdS, textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: 4 }}>
                      <button onClick={e => { e.stopPropagation(); setEditingPallet(p); }} style={ghostBtn} title="Edit"><EditIcon /></button>
                      <button onClick={e => { e.stopPropagation(); onDelete(p.id); }} style={ghostBtn} title="Delete"><TrashIcon /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {pallets.length > 0 && (
                <tr style={{ background: 'var(--surface-2)' }}>
                  <td style={{ ...tdS, fontSize: 11, color: 'var(--ink-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }} colSpan={2}>
                    Total
                  </td>
                  <td style={{ ...tdS, textAlign: 'right' }} className="num">{palletTotal.weight.toFixed(2)}</td>
                  <td />
                  <td style={{ ...tdS, textAlign: 'right' }} className="num">{palletTotal.outWeightGross > 0 ? palletTotal.outWeightGross.toFixed(2) : '—'}</td>
                  <td style={{ ...tdS, textAlign: 'right' }} className="num">{palletTotal.outWeightNet > 0 ? palletTotal.outWeightNet.toFixed(2) : '—'}</td>
                  <td style={{ ...tdS, textAlign: 'right' }} className="num">{palletTotal.tantalumWt > 0 ? palletTotal.tantalumWt.toFixed(2) : '—'}</td>
                  <td />
                  <td style={{ ...tdS, textAlign: 'right' }} className="num">{palletTotal.qty}</td>
                  <td style={{ ...tdS, textAlign: 'right' }} className="num">{palletTotal.boardQty || '—'}</td>
                  <td style={{ ...tdS, textAlign: 'right' }} className="num">
                    <span style={{ fontWeight: 600 }}>{pallets.reduce((s, p) => s + p.board_count, 0)}</span>
                  </td>
                  <td />
                </tr>
              )}
              {pallets.length === 0 && (
                <tr><td colSpan={12}><Empty label="No pallets yet" sub="Click 'Add pallet' to start." /></td></tr>
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
  const [payload, setPayload] = useState(pallet.gateload_number);
  const [inWeightGross, setInWeightGross] = useState(parseFloat(pallet.in_weight_gross).toFixed(2));
  const [actualWeight, setActualWeight] = useState(pallet.actual_weight ? parseFloat(pallet.actual_weight).toFixed(2) : '');
  const [outWeightGross, setOutWeightGross] = useState(pallet.out_weight_gross ? parseFloat(pallet.out_weight_gross).toFixed(2) : '');
  const [outWeightNet, setOutWeightNet] = useState(pallet.out_weight_net ? parseFloat(pallet.out_weight_net).toFixed(2) : '');
  const [tantalumWt, setTantalumWt] = useState(pallet.tantalum_wt ? parseFloat(pallet.tantalum_wt).toFixed(2) : '');
  const [matType, setMatType] = useState(pallet.material_type);
  const [qty, setQty] = useState(String(pallet.qty));
  const [boardQty, setBoardQty] = useState(pallet.board_qty != null ? String(pallet.board_qty) : '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setLicence(pallet.licence_number);
      setPayload(pallet.gateload_number);
      setInWeightGross(parseFloat(pallet.in_weight_gross).toFixed(2));
      setActualWeight(pallet.actual_weight ? parseFloat(pallet.actual_weight).toFixed(2) : '');
      setOutWeightGross(pallet.out_weight_gross ? parseFloat(pallet.out_weight_gross).toFixed(2) : '');
      setOutWeightNet(pallet.out_weight_net ? parseFloat(pallet.out_weight_net).toFixed(2) : '');
      setTantalumWt(pallet.tantalum_wt ? parseFloat(pallet.tantalum_wt).toFixed(2) : '');
      setMatType(pallet.material_type);
      setQty(String(pallet.qty));
      setBoardQty(pallet.board_qty != null ? String(pallet.board_qty) : '');
      setSaving(false);
    }
  }, [open, pallet]);

  const handleSave = async () => {
    setSaving(true);
    await onSave({
      licence_number: licence,
      gateload_number: payload,
      in_weight_gross: inWeightGross as any,
      actual_weight: actualWeight ? (actualWeight as any) : null,
      out_weight_gross: outWeightGross ? (outWeightGross as any) : null,
      out_weight_net: outWeightNet ? (outWeightNet as any) : null,
      tantalum_wt: tantalumWt ? (tantalumWt as any) : null,
      material_type: matType,
      qty: +qty,
      board_qty: boardQty !== '' ? +boardQty : null,
    });
  };

  return (
    <Modal open={open} onClose={onClose} title={`Edit Pallet #${String(pallet.pallet_seq).padStart(2, '0')}`} width={560}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={!inWeightGross || !qty || saving} onClick={handleSave}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </>}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Field label="Licence No">
          <Input value={licence} onChange={setLicence} placeholder="TRK-00123" autoFocus />
        </Field>
        <Field label="Gateload No">
          <Input value={payload} onChange={setPayload} placeholder="PLD-0200" />
        </Field>
        <Field label="In Weight Gross (lb)">
          <Input value={inWeightGross} onChange={setInWeightGross} type="number" placeholder="0.00" />
        </Field>
        <Field label="Actual Weight (lb)">
          <Input value={actualWeight} onChange={setActualWeight} type="number" placeholder="Optional" />
        </Field>
        <Field label="Out Weight Gross (lb)">
          <Input value={outWeightGross} onChange={setOutWeightGross} type="number" placeholder="Optional" />
        </Field>
        <Field label="Out Weight Net (lb)">
          <Input value={outWeightNet} onChange={setOutWeightNet} type="number" placeholder="Optional" />
        </Field>
        <Field label="Tantalum Wt (g)">
          <Input value={tantalumWt} onChange={setTantalumWt} type="number" placeholder="Optional" />
        </Field>
        <Field label="Material Type">
          <Input value={matType} onChange={setMatType} placeholder="Optional" />
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
function BoardsTab({ boards, pallets, soNumber, dateFrom, dateTo, palletFilter,
  barcodeSearch,
  onDateFromChange, onDateToChange, onPalletFilterChange, onBarcodeSearchChange,
  onAddBoard, onDeleteBoard }: {
  boards: Board[]; pallets: Pallet[]; soNumber: string;
  dateFrom: string; dateTo: string; palletFilter: string; barcodeSearch: string;
  onDateFromChange: (v: string) => void; onDateToChange: (v: string) => void;
  onPalletFilterChange: (v: string) => void; onBarcodeSearchChange: (v: string) => void;
  onAddBoard: () => void; onDeleteBoard: (id: number) => void;
}) {
  const router = useRouter();
  const { id: soId } = useParams<{ id: string }>();
  const [expandedMpns, setExpandedMpns] = useState<Set<string>>(new Set());
  const [highlightBarcodeId, setHighlightBarcodeId] = useState<number | null>(null);
  const hasFilter = dateFrom || dateTo || palletFilter;
  const isMobile = useIsMobile();

  useEffect(() => {
    const q = barcodeSearch.trim();
    if (!q) { setHighlightBarcodeId(null); return; }
    const found = boards.find(b => b.barcode.toLowerCase() === q.toLowerCase());
    if (found) {
      const mpnKey = found.mpn ? String(found.mpn.id) : '__no_mpn__';
      const palletKey = found.pallet != null ? String(found.pallet) : '__no_pallet__';
      const key = `${mpnKey}__${palletKey}`;
      setExpandedMpns(prev => new Set([...prev, key]));
      setHighlightBarcodeId(found.id);
    } else {
      setHighlightBarcodeId(null);
    }
  }, [barcodeSearch, boards]);

  const palletOptions = [
    { value: '', label: 'All pallets' },
    ...pallets.map(p => {
      const parts = [p.licence_number, p.gateload_number].filter(Boolean);
      const label = parts.length ? parts.join('-') : `#${String(p.pallet_seq).padStart(2, '0')}`;
      return { value: String(p.id), label: `#${String(p.pallet_seq).padStart(2, '0')} · ${label}` };
    }),
  ];

  const mpnGroups = React.useMemo(() => {
    const map = new Map<string, { key: string; mpn: Board['mpn']; pallet_label: string | null; boards: Board[] }>();
    for (const b of boards) {
      const mpnKey = b.mpn ? String(b.mpn.id) : '__no_mpn__';
      const palletKey = b.pallet != null ? String(b.pallet) : '__no_pallet__';
      const key = `${mpnKey}__${palletKey}`;
      if (!map.has(key)) map.set(key, { key, mpn: b.mpn, pallet_label: b.pallet_label, boards: [] });
      map.get(key)!.boards.push(b);
    }
    return [...map.values()].sort((a, b) => {
      const pa = a.pallet_label ?? '';
      const pb = b.pallet_label ?? '';
      return pa.localeCompare(pb);
    });
  }, [boards]);

  const toggleMpn = (key: string) => setExpandedMpns(prev => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });

  const mobileFilterBar = (
    <div style={{ marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Select value={palletFilter} onChange={onPalletFilterChange} options={palletOptions} style={{ flex: 1 }} />
        <Button size="sm" variant="primary" icon={<PlusIcon />} onClick={onAddBoard} disabled={pallets.length === 0}>Add</Button>
      </div>
      <input
        type="text"
        value={barcodeSearch}
        onChange={e => onBarcodeSearchChange(e.target.value)}
        placeholder="Scan or search barcode…"
        style={{ border: '1px solid var(--hair-strong)', borderRadius: 3, padding: '6px 10px', fontSize: 12, outline: 'none', background: 'var(--surface)', color: 'var(--ink)', width: '100%' }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input type="date" value={dateFrom} onChange={e => onDateFromChange(e.target.value)}
          style={{ flex: 1, border: '1px solid var(--hair-strong)', borderRadius: 3, padding: '6px 8px', fontSize: 12, outline: 'none', background: 'var(--surface)', color: 'var(--ink)' }} />
        <span style={{ color: 'var(--ink-4)', fontSize: 12, flexShrink: 0 }}>→</span>
        <input type="date" value={dateTo} onChange={e => onDateToChange(e.target.value)}
          style={{ flex: 1, border: '1px solid var(--hair-strong)', borderRadius: 3, padding: '6px 8px', fontSize: 12, outline: 'none', background: 'var(--surface)', color: 'var(--ink)' }} />
        {hasFilter && <Button size="sm" variant="ghost" onClick={() => { onDateFromChange(''); onDateToChange(''); onPalletFilterChange(''); }}>Clear</Button>}
      </div>
    </div>
  );

  return (
    <div>
      {isMobile && mobileFilterBar}

      {isMobile ? (
        /* Mobile: MPN cards with expandable barcode grid */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {mpnGroups.length === 0 && <div style={{ padding: '28px 0', textAlign: 'center', fontSize: 12, color: 'var(--ink-3)' }}>No boards found.</div>}
          {mpnGroups.map(({ key, mpn, pallet_label, boards: gBoards }) => {
            const open = expandedMpns.has(key);
            return (
              <div key={key} style={{ border: '1px solid var(--hair)', borderRadius: 4, background: 'var(--surface)', overflow: 'hidden' }}>
                <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    onClick={() => mpn && router.push(`/sos/${soId}/mpns/${mpn.id}?so=${encodeURIComponent(soNumber)}${gBoards[0]?.pallet != null ? `&palletId=${gBoards[0].pallet}&palletLabel=${encodeURIComponent(pallet_label ?? '')}` : ''}`)}
                    className="mono"
                    style={{ background: 'none', border: 0, padding: 0, cursor: mpn ? 'pointer' : 'default', fontSize: 13, fontWeight: 500, color: mpn ? 'var(--accent-2)' : 'var(--ink)', textDecoration: mpn ? 'underline' : 'none', textDecorationColor: 'var(--accent)', textUnderlineOffset: 3, fontFamily: 'inherit', flex: 1, textAlign: 'left', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  >
                    {mpn?.name || <span style={{ color: 'var(--ink-5)' }}>No MPN</span>}
                  </button>
                  <button onClick={() => toggleMpn(key)} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px',
                    borderRadius: 3, border: `1px solid ${open ? 'var(--accent)' : 'var(--hair-strong)'}`,
                    background: open ? 'var(--accent-light)' : 'var(--surface-2)',
                    color: open ? 'var(--accent-2)' : 'var(--ink-3)', fontSize: 11.5, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
                  }}>
                    <span className="num">{gBoards.length}</span>
                    <span>{open ? 'close' : 'open'}</span>
                    <span style={{ display: 'inline-flex', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .12s' }}><ChevronIcon /></span>
                  </button>
                </div>
                <div style={{ padding: '6px 12px 8px', borderTop: '1px solid var(--hair)', display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: 11.5, color: 'var(--ink-3)' }}>
                  {pallet_label && <span>Pallet <span className="mono" style={{ color: 'var(--ink-2)' }}>{pallet_label}</span></span>}
                  {mpn?.chip_qty != null && <><span style={{ color: 'var(--hair-strong)' }}>·</span><span>Chips <span className="num" style={{ color: 'var(--ink-2)' }}>{mpn.chip_qty}</span></span></>}
                  {mpn?.part_type && <><span style={{ color: 'var(--hair-strong)' }}>·</span><span className="mono" style={{ color: 'var(--ink-2)' }}>{mpn.part_type}</span></>}
                </div>
                {open && (
                  <div style={{ borderTop: '1px solid var(--hair)', background: 'var(--surface-2)', padding: '8px 10px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 4 }}>
                      {gBoards.map((b, idx) => (
                        <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 8px', background: 'var(--surface)', border: '1px solid var(--hair)', borderRadius: 3 }}>
                          <span className="num" style={{ fontSize: 10.5, color: 'var(--ink-4)', flexShrink: 0, minWidth: 22 }}>{String(idx + 1).padStart(3, '0')}</span>
                          <span className="mono" style={{ fontSize: 11.5, color: 'var(--ink)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.barcode || '—'}</span>
                          <button onClick={() => router.push(`/sos/${soId}/boards/${b.id}`)} style={ghostBtn} title="Edit"><EditIcon /></button>
                          <button onClick={() => onDeleteBoard(b.id)} style={ghostBtn} title="Delete"><TrashIcon /></button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* Desktop: MPN-grouped table with expandable barcode grid */
        <div style={{ border: '1px solid var(--hair)', borderRadius: 3, background: 'var(--surface)' }}>
          <div className="table-scroll">
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '22%' }} />
              <col style={{ width: '15%' }} />
              <col style={{ width: '11%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '11%' }} />
              <col style={{ width: '13%' }} />
              <col style={{ width: '11%' }} />
            </colgroup>
            <thead>
              <tr>
                <th style={thS}>MPN</th>
                <th style={thS}>Pallet</th>
                <th style={thS}>Barcodes</th>
                <th style={{ ...thS, textAlign: 'right' }}>Chips</th>
                <th style={{ ...thS, textAlign: 'right' }}>Total Chips</th>
                <th style={thS}>Part Type</th>
                <th style={thS}>Created</th>
              </tr>
            </thead>
            <tbody>
              {mpnGroups.length === 0 && (
                <tr><td colSpan={7} style={{ padding: '28px 14px', textAlign: 'center', fontSize: 12, color: 'var(--ink-3)' }}>No boards found.</td></tr>
              )}
              {mpnGroups.map(({ key, mpn, pallet_label, boards: gBoards }) => {
                const open = expandedMpns.has(key);
                return (
                  <React.Fragment key={key}>
                    {/* MPN summary row */}
                    <tr
                      style={{ borderBottom: open ? 'none' : '1px solid var(--hair)', cursor: 'pointer', background: open ? 'var(--accent-light)' : 'transparent' }}
                      onClick={() => toggleMpn(key)}
                      onMouseEnter={e => { if (!open) (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
                      onMouseLeave={e => { if (!open) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                    >
                      {/* MPN name — chevron inline + clickable link, stops row toggle */}
                      <td style={{ ...tdS, padding: '9px 6px 9px 12px' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ display: 'inline-flex', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .12s', color: 'var(--ink-3)', flexShrink: 0, cursor: 'pointer' }} onClick={e => { e.stopPropagation(); toggleMpn(key); }}><ChevronIcon /></span>
                          {mpn ? (
                            <button onClick={() => router.push(`/sos/${soId}/mpns/${mpn.id}?so=${encodeURIComponent(soNumber)}${gBoards[0]?.pallet != null ? `&palletId=${gBoards[0].pallet}&palletLabel=${encodeURIComponent(pallet_label ?? '')}` : ''}`)}
                              className="mono"
                              style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', fontSize: 13, fontWeight: 500, color: 'var(--accent-2)', textDecoration: 'underline', textDecorationColor: 'var(--accent)', textUnderlineOffset: 3, fontFamily: 'ui-monospace, monospace' }}>
                              {mpn.name}
                            </button>
                          ) : (
                            <span style={{ color: 'var(--ink-5)', fontSize: 13 }}>No MPN</span>
                          )}
                        </div>
                      </td>
                      <td style={{ ...tdS, fontSize: 12 }} className="mono">
                        {pallet_label ? <span style={{ color: 'var(--ink-2)' }}>{pallet_label}</span> : <span style={{ color: 'var(--ink-5)' }}>—</span>}
                      </td>
                      {/* Barcodes expand button */}
                      <td style={tdS} onClick={e => e.stopPropagation()}>
                        <button onClick={() => toggleMpn(key)} style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          padding: '3px 8px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit',
                          background: open ? 'var(--accent-light)' : 'var(--surface-2)',
                          border: `1px solid ${open ? 'var(--accent)' : 'var(--hair-strong)'}`,
                          color: open ? 'var(--accent-2)' : 'var(--ink-3)', fontSize: 11.5,
                        }}>
                          <span className="num">{gBoards.length}</span>
                          <span>{open ? 'close' : 'open'}</span>
                          <span style={{ display: 'inline-flex', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .12s' }}><ChevronIcon /></span>
                        </button>
                      </td>
                      <td style={{ ...tdS, textAlign: 'right' }} className="num">
                        {mpn?.chip_qty != null ? mpn.chip_qty : <span style={{ color: 'var(--ink-5)' }}>—</span>}
                      </td>
                      <td style={{ ...tdS, textAlign: 'right' }} className="num">
                        {mpn?.chip_qty != null ? mpn.chip_qty * gBoards.length : <span style={{ color: 'var(--ink-5)' }}>—</span>}
                      </td>
                      <td style={{ ...tdS, fontSize: 12 }} className="mono">
                        {mpn?.part_type || <span style={{ color: 'var(--ink-5)' }}>—</span>}
                      </td>
                      <td style={{ ...tdS, fontSize: 11.5, color: 'var(--ink-3)' }} className="num">
                        {mpn?.created_at ? mpn.created_at.slice(0, 10) : <span style={{ color: 'var(--ink-5)' }}>—</span>}
                      </td>
                    </tr>
                    {/* Barcode grid — 5 columns */}
                    {open && (
                      <tr style={{ borderBottom: '1px solid var(--hair)' }}>
                        <td colSpan={7} style={{ padding: '10px 14px 14px', background: 'var(--surface-2)' }}>
                          <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(5, 1fr)',
                            borderTop: '1px solid var(--hair)',
                            borderLeft: '1px solid var(--hair)',
                          }}>
                            {gBoards.map((b, idx) => {
                              const isHit = b.id === highlightBarcodeId;
                              return (
                                <div key={b.id} style={{
                                  display: 'flex', alignItems: 'center', gap: 5,
                                  padding: '5px 8px',
                                  background: isHit ? '#fffde7' : 'var(--surface)',
                                  borderRight: `1px solid ${isHit ? '#f9a825' : 'var(--hair)'}`,
                                  borderBottom: `1px solid ${isHit ? '#f9a825' : 'var(--hair)'}`,
                                  minWidth: 0,
                                }}>
                                  <span className="num" style={{ fontSize: 10.5, color: 'var(--ink-4)', flexShrink: 0, minWidth: 26 }}>
                                    {String(idx + 1).padStart(3, '0')}
                                  </span>
                                  <span className="mono" style={{ fontSize: 12, color: isHit ? '#b45309' : 'var(--ink)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: isHit ? 600 : 400 }}>
                                    {b.barcode || '—'}
                                  </span>
                                  <button onClick={() => onDeleteBoard(b.id)} style={{ ...ghostBtn, flexShrink: 0 }} title="Delete"><TrashIcon /></button>
                                </div>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
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
  const [inboundDate, setInboundDate] = useState(so.inbound_date);
  const [outboundDate, setOutboundDate] = useState(so.outbound_date ?? '');
  const [note, setNote] = useState(so.note);
  useEffect(() => {
    if (open) {
      setSoNumber(so.so_number); setVendorId(String(so.vendor));
      setInboundDate(so.inbound_date); setOutboundDate(so.outbound_date ?? '');
      setNote(so.note);
    }
  }, [open]);
  return (
    <Modal open={open} onClose={onClose} title={`Edit ${so.so_number}`} width={560}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={() => onSave({ so_number: soNumber, vendor: +vendorId, inbound_date: inboundDate, outbound_date: outboundDate || null, note } as any)}>Save</Button>
      </>}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Field label="SO Number"><Input value={soNumber} onChange={setSoNumber} /></Field>
        <Field label="Vendor">
          <Select value={vendorId} onChange={setVendorId}
            options={vendors.map(v => ({ value: String(v.id), label: v.name }))} />
        </Field>
        <Field label="Inbound Date"><Input value={inboundDate} onChange={setInboundDate} type="date" /></Field>
        <Field label="Outbound Date"><Input value={outboundDate} onChange={setOutboundDate} type="date" /></Field>
        <Field label="Note" span={2}>
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={3}
            style={{ width: '100%', padding: '6px 10px', border: '1px solid var(--hair-strong)', background: 'var(--surface)', borderRadius: 3, fontFamily: 'inherit', fontSize: 13, resize: 'vertical', outline: 'none', color: 'var(--ink)' }} />
        </Field>
      </div>
    </Modal>
  );
}

// ─── Add Pallet Modal ─────────────────────────────────────────────
type PalletRowData = { in_weight_gross: string; actual_weight: string; out_weight_gross: string; out_weight_net: string; tantalum_wt: string; material_type: string; qty: string; licence_number: string; gateload_number: string; board_qty: string };

function AddPalletModal({ open, rule, onClose, onAdd, onAddBulk }: {
  open: boolean; rule: string; onClose: () => void;
  onAdd: (data: PalletRowData) => void;
  onAddBulk: (rows: PalletRowData[]) => void;
}) {
  const aggregated = rule === 'aggregated';
  const [mode, setMode] = useState<'single' | 'bulk'>('single');

  // single
  const [w, setW] = useState('');
  const [actualW, setActualW] = useState('');
  const [outWGross, setOutWGross] = useState('');
  const [outWNet, setOutWNet] = useState('');
  const [tanWt, setTanWt] = useState('');
  const [materialType, setMaterialType] = useState('');
  const [q, setQ] = useState('');
  const [licence, setLicence] = useState('');
  const [payload, setPayload] = useState('');
  const [boardQty, setBoardQty] = useState('');

  // bulk
  const blankRow = (): PalletRowData => ({ licence_number: '', gateload_number: '', in_weight_gross: '', actual_weight: '', out_weight_gross: '', out_weight_net: '', tantalum_wt: '', material_type: '', qty: aggregated ? '' : '1', board_qty: '' });
  const [rows, setRows] = useState<PalletRowData[]>(Array.from({ length: 10 }, blankRow));

  useEffect(() => {
    if (open) {
      setMode('single');
      setW(''); setActualW(''); setOutWGross(''); setOutWNet(''); setTanWt(''); setMaterialType(''); setQ(aggregated ? '' : '1'); setLicence(''); setPayload(''); setBoardQty('');
      setRows(Array.from({ length: 10 }, blankRow));
    }
  }, [open, aggregated]);

  const updateRow = (i: number, patch: Partial<PalletRowData>) =>
    setRows(rs => rs.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  const addRow = () => setRows(rs => [...rs, blankRow()]);
  const removeRow = (i: number) => setRows(rs => rs.length === 1 ? [blankRow()] : rs.filter((_, idx) => idx !== i));

  const filledRows = rows.filter(r => String(r.in_weight_gross).trim() !== '' && (!aggregated || String(r.qty).trim() !== ''));
  const canSaveSingle = w !== '' && q !== '';
  const canSaveBulk = filledRows.length > 0;

  const licList = filledRows.map(r => (r.licence_number || '').trim()).filter(Boolean);
  const dupLicences = new Set(licList.filter((l, i) => licList.indexOf(l) !== i));

  const submitSingle = () => {
    onAdd({ in_weight_gross: w, actual_weight: actualW, out_weight_gross: outWGross, out_weight_net: outWNet, tantalum_wt: tanWt, material_type: materialType, qty: q, licence_number: licence, gateload_number: payload, board_qty: boardQty });
    onClose();
  };
  const submitBulk = () => {
    onAddBulk(filledRows.map(r => ({
      licence_number: r.licence_number,
      gateload_number: r.gateload_number,
      in_weight_gross: r.in_weight_gross,
      actual_weight: r.actual_weight,
      out_weight_gross: r.out_weight_gross,
      out_weight_net: r.out_weight_net,
      tantalum_wt: r.tantalum_wt,
      material_type: r.material_type,
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
      width={mode === 'bulk' ? 1160 : 560}
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
            <Field label="Gateload No">
              <Input value={payload} onChange={setPayload} placeholder="PLD-0200" />
            </Field>
            <Field label="In Weight Gross (lb)">
              <Input value={w} onChange={v => { setW(v); setActualW(v); }} type="number" placeholder="0.00" />
            </Field>
            <Field label="Actual Weight (lb)">
              <Input value={actualW} onChange={setActualW} type="number" placeholder="0.00" />
            </Field>
            <Field label="Out Weight Gross (lb)">
              <Input value={outWGross} onChange={setOutWGross} type="number" placeholder="Optional" />
            </Field>
            <Field label="Out Weight Net (lb)">
              <Input value={outWNet} onChange={setOutWNet} type="number" placeholder="Optional" />
            </Field>
            <Field label="Tantalum Wt (g)">
              <Input value={tanWt} onChange={setTanWt} type="number" placeholder="Optional" />
            </Field>
            <Field label="Material Type">
              <Input value={materialType} onChange={setMaterialType} placeholder="Optional" />
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
            <div style={{ display: 'grid', gridTemplateColumns: '28px 1.2fr 1.2fr 0.9fr 0.9fr 0.9fr 0.9fr 0.9fr 0.9fr 0.9fr 0.9fr 24px', gap: 0, padding: '8px 10px', fontSize: 9.5, letterSpacing: '0.14em', textTransform: 'uppercase' as const, color: 'var(--ink-4)', background: 'var(--surface-2)', borderBottom: '1px solid var(--hair)' }}>
              <div>#</div>
              <div style={{ paddingLeft: 6 }}>Licence No</div>
              <div style={{ paddingLeft: 6 }}>Gateload No</div>
              <div style={{ paddingLeft: 6, textAlign: 'right' as const }}>In Wt Gross</div>
              <div style={{ paddingLeft: 6, textAlign: 'right' as const }}>Actual Wt</div>
              <div style={{ paddingLeft: 6, textAlign: 'right' as const }}>Out Wt Gross</div>
              <div style={{ paddingLeft: 6, textAlign: 'right' as const }}>Out Wt Net</div>
              <div style={{ paddingLeft: 6, textAlign: 'right' as const }}>Tantalum Wt</div>
              <div style={{ paddingLeft: 6 }}>Material Type</div>
              <div style={{ paddingLeft: 6, textAlign: 'right' as const }}>Pallet Qty</div>
              <div style={{ paddingLeft: 6, textAlign: 'right' as const }}>Board Qty</div>
              <div />
            </div>
            <div>
              {rows.map((r, i) => {
                const isDup = !!r.licence_number && dupLicences.has(r.licence_number.trim());
                return (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '28px 1.2fr 1.2fr 0.9fr 0.9fr 0.9fr 0.9fr 0.9fr 0.9fr 0.9fr 0.9fr 24px', gap: 0, padding: '6px 10px', alignItems: 'center', borderBottom: '1px solid var(--hair)' }}>
                    <span className="mono" style={{ fontSize: 11, color: 'var(--ink-4)' }}>
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <BulkCellP value={r.licence_number} onChange={v => updateRow(i, { licence_number: v })}
                      warn={isDup} title={isDup ? 'Duplicate licence in this batch' : undefined} />
                    <BulkCellP value={r.gateload_number} onChange={v => updateRow(i, { gateload_number: v })} />
                    <BulkCellP value={r.in_weight_gross} onChange={v => updateRow(i, { in_weight_gross: v, actual_weight: v })}
                      type="number" placeholder="0.00" align="right" />
                    <BulkCellP value={r.actual_weight} onChange={v => updateRow(i, { actual_weight: v })}
                      type="number" placeholder="0.00" align="right" />
                    <BulkCellP value={r.out_weight_gross} onChange={v => updateRow(i, { out_weight_gross: v })}
                      type="number" placeholder="—" align="right" />
                    <BulkCellP value={r.out_weight_net} onChange={v => updateRow(i, { out_weight_net: v })}
                      type="number" placeholder="—" align="right" />
                    <BulkCellP value={r.tantalum_wt} onChange={v => updateRow(i, { tantalum_wt: v })}
                      type="number" placeholder="—" align="right" />
                    <BulkCellP value={r.material_type} onChange={v => updateRow(i, { material_type: v })} />
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
function MpnComboInput({ value, onChange, mpns, autoFocus }: {
  value: string; onChange: (v: string) => void;
  mpns: string[]; autoFocus?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const filtered = isTyping ? mpns.filter(m => m.toLowerCase().includes(value.toLowerCase().trim())) : mpns;

  return (
    <div style={{ position: 'relative' }}>
      <input
        value={value}
        onChange={e => { setIsTyping(true); onChange(e.target.value.toUpperCase()); }}
        onFocus={() => setOpen(true)}
        onBlur={() => { setTimeout(() => setOpen(false), 150); setIsTyping(false); }}
        autoFocus={autoFocus}
        placeholder="SP#"
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
          maxHeight: 220, overflowY: 'auto', marginTop: 2,
        }}>
          {filtered.map(name => (
            <div key={name} onMouseDown={() => { onChange(name); setIsTyping(false); setOpen(false); }}
              style={{ padding: '7px 10px', cursor: 'pointer', fontSize: 12.5,
                fontFamily: 'ui-monospace, monospace', color: 'var(--ink)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              {name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AddBoardModal({ open, pallets, mpns, existingBoards, onClose, onAdd, onAddBulk }: {
  open: boolean; pallets: Pallet[]; mpns: string[]; existingBoards: Board[]; onClose: () => void;
  onAdd: (d: { barcode: string; mpn: string; qty: string; pallet: string }) => void;
  onAddBulk: (rows: { barcode: string }[], shared: { mpn: string; pallet: string }) => Promise<void>;
}) {
  const [mode, setMode] = useState<'single' | 'bulk'>('single');
  // single
  const [barcode, setBarcode] = useState('');
  const [mpn, setMpn] = useState('');
  const [qty, setQty] = useState('1');
  const [pallet, setPallet] = useState('');
  // bulk
  const [bulkBarcode, setBulkBarcode] = useState('');
  const [bulkRows, setBulkRows] = useState<{ barcode: string }[]>([]);
  const [bMpn, setBMpn] = useState('');
  const [bPallet, setBPallet] = useState('');
  const [selectedBulkIdx, setSelectedBulkIdx] = useState<number | null>(null);
  const [bulkBarcodeFocused, setBulkBarcodeFocused] = useState(false);
  const [bulkPage, setBulkPage] = useState(1);
  const BULK_PAGE_SIZE = 108;
  const [dbDupBarcodes, setDbDupBarcodes] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const importInputRef = useRef<HTMLInputElement>(null);

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    const addBarcodes = (barcodes: string[]) => {
      const valid = barcodes.map(b => b.trim()).filter(Boolean);
      if (!valid.length) return;
      setBulkRows(rs => {
        const next = [...rs, ...valid.map(b => ({ barcode: b }))];
        setBulkPage(Math.ceil(next.length / BULK_PAGE_SIZE));
        return next;
      });
    };
    if (ext === 'xlsx' || ext === 'xls') {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const wb = XLSX.read(ev.target?.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });
        addBarcodes((rows as unknown[][]).flatMap(row => row).map(c => String(c ?? '')));
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = (ev.target?.result as string) || '';
        addBarcodes(text.split(/[\r\n\t,]+/));
      };
      reader.readAsText(file);
    }
    e.target.value = '';
  };

  useEffect(() => {
    if (open) {
      setMode('single');
      setBarcode(''); setMpn(''); setQty('1'); setPallet('');
      setBulkBarcode(''); setBulkRows([]); setBMpn(''); setBPallet(''); setSelectedBulkIdx(null); setBulkPage(1);
      setDbDupBarcodes(new Set());
    }
  }, [open]);

  useEffect(() => { setDbDupBarcodes(new Set()); }, [bMpn, bPallet]);

  const palletOptions = [
    { value: '', label: '— No pallet —' },
    ...sortedPalletOptions(pallets).map(({ value, label }) => ({ value, label })),
  ];

  const canSaveSingle = mpn.trim() !== '' && pallet !== '' && barcode.trim() !== '' && qty.trim() !== '' && +qty > 0;
  const dupCount = bulkRows.length - new Set(bulkRows.map(r => r.barcode)).size;
  const nonDupCount = dbDupBarcodes.size > 0 ? bulkRows.filter(r => !dbDupBarcodes.has(r.barcode)).length : bulkRows.length;
  const canSaveBulk = bulkRows.length > 0 && bMpn.trim() !== '' && bPallet !== '' && dupCount === 0 && (dbDupBarcodes.size === 0 || nonDupCount > 0);

  const handleBulkSubmit = async () => {
    setSubmitError('');
    let rowsToAdd = bulkRows;
    if (dbDupBarcodes.size > 0) {
      rowsToAdd = bulkRows.filter(r => !dbDupBarcodes.has(r.barcode));
      if (rowsToAdd.length === 0) { onClose(); return; }
    } else {
      const existingBarcodeSet = new Set(
        existingBoards
          .filter(b => (b.mpn?.name ?? '') === bMpn && String(b.pallet ?? '') === bPallet)
          .map(b => b.barcode)
      );
      const dupes = new Set(bulkRows.map(r => r.barcode).filter(bc => existingBarcodeSet.has(bc)));
      if (dupes.size > 0) { setDbDupBarcodes(dupes); return; }
    }
    setSubmitting(true);
    try {
      await onAddBulk(rowsToAdd, { mpn: bMpn, pallet: bPallet });
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to save boards.');
    } finally {
      setSubmitting(false);
    }
  };
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
            <div style={{ display: 'flex', gap: 12, flex: 1, minWidth: 0, alignItems: 'flex-end', flexWrap: 'wrap', rowGap: 6 }}>
              {/* MPN */}
              <div style={{ flex: '0 0 280px', minWidth: 200 }}>
                <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--ink-3)', marginBottom: 3 }}>MPN <span style={{ color: 'red' }}>*</span></div>
                <MpnComboInput value={bMpn} onChange={setBMpn} mpns={mpns} />
              </div>
              {/* Pallet */}
              <div style={{ flex: '0 0 200px', minWidth: 140 }}>
                <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--ink-3)', marginBottom: 3 }}>Pallet <span style={{ color: 'red' }}>*</span></div>
                <Select value={bPallet} onChange={setBPallet} options={palletOptions} size="lg" style={{ width: '100%' }} />
              </div>
              {/* Divider */}
              <div style={{ width: 1, background: 'var(--hair-strong)', alignSelf: 'stretch', margin: '0 8px', flexShrink: 0 }} />
              {/* Barcode scan field */}
              <div style={{ flex: '0 0 200px', minWidth: 160 }}>
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
              {/* Import from file */}
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                <input ref={importInputRef} type="file" accept=".xlsx,.xls,.txt,.csv,.tsv,.note" style={{ display: 'none' }} onChange={handleImportFile} />
                <button onClick={() => importInputRef.current?.click()}
                  title="Import barcodes from Excel or text file"
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', fontSize: 12, fontWeight: 500,
                    border: '1px solid var(--hair-strong)', borderRadius: 4, background: 'var(--surface)',
                    color: 'var(--ink-2)', cursor: 'pointer', whiteSpace: 'nowrap', height: 36 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                  Import file
                </button>
              </div>
            </div>
          )}
        </div>
      }
      width={mode === 'single' ? 520 : 1100}
      footer={mode === 'single'
        ? <>
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button variant="primary" disabled={!canSaveSingle}
              onClick={() => { onAdd({ barcode, mpn, qty, pallet }); onClose(); }}>Add</Button>
          </>
        : <>
            <span style={{ fontSize: 22, color: 'var(--ink-3)', fontWeight: 500, flexShrink: 0 }}>
              <span className="num" style={{ color: 'var(--ink)', fontWeight: 700 }}>{bulkRows.length}</span> scanned
              {dupCount > 0 && <span style={{ marginLeft: 12, color: '#b8782a' }}>· {dupCount} duplicate{dupCount > 1 ? 's' : ''}</span>}
              {dbDupBarcodes.size > 0 && <span style={{ marginLeft: 12, color: '#c2410c', fontSize: 14 }}>· {dbDupBarcodes.size} barcode duplicate</span>}
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
            <Button variant="ghost" onClick={onClose} disabled={submitting}>Cancel</Button>
            <Button variant="primary" disabled={!canSaveBulk || submitting} onClick={handleBulkSubmit}>
              {submitting ? 'Saving…' : dbDupBarcodes.size > 0
                ? `Add ${nonDupCount} new board${nonDupCount === 1 ? '' : 's'} (skip ${dbDupBarcodes.size})`
                : `Add ${bulkRows.length || ''} board${bulkRows.length === 1 ? '' : 's'}`}
            </Button>
          </>}>

      {submitError && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', marginBottom: 12, background: '#fff5f5', border: '1px solid #fca5a5', borderRadius: 6, color: '#b91c1c', fontSize: 13 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          {submitError}
        </div>
      )}

      {mode === 'single' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label={<>MPN <span style={{ color: 'red' }}>*</span></>} span={2}>
            <MpnComboInput value={mpn} onChange={setMpn} mpns={mpns} autoFocus />
          </Field>
          <Field label={<>Pallet <span style={{ color: 'red' }}>*</span></>} span={2}>
            <Select value={pallet} onChange={setPallet} options={palletOptions} />
          </Field>
          <Field label={<>Barcode <span style={{ color: 'red' }}>*</span></>} span={2}>
            <Input value={barcode} onChange={setBarcode} placeholder="BC-000-0000" autoFocus
              style={{ fontFamily: 'ui-monospace, monospace' }} />
          </Field>
          <Field label={<>Qty <span style={{ color: 'red' }}>*</span></>}>
            <Input value={qty} onChange={v => setQty(v.replace(/^0+(\d)/, '$1'))} type="number" placeholder="1" />
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
                    const dbDup = !dup && dbDupBarcodes.has(r.barcode);
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
                          background: dup ? (selected ? '#f87171' : '#fca5a5')
                                    : dbDup ? (selected ? '#fb923c' : '#fed7aa')
                                    : selected ? 'var(--surface-2)' : 'transparent',
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
