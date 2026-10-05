'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useRouter, useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import {
  Button, Input, Select, Modal, Tabs,
  Card, SectionHeader, EditableCell, Field, Empty, Badge, useToast,
  thS, tdS, ghostBtn,
} from '@/app/ui/components';
import { crumbCache, palletCrumb } from '@/app/lib/crumbCache';
import { api } from '@/app/lib/api';
import {
  buildSlots, buildGlobalSlots, slotCount, bomTotalQty, normalizeChipMpn,
  CIRCULAR_CENTER, HARVEST_STATE, NG_UID,
  type MpnEntry,
} from '@/app/lib/chipSlots';
import { WeightRuleField } from '../WeightRuleField';
import PalletBoardsTab from '@/app/ui/pallet/PalletBoardsTab';
import PalletNgModal from '@/app/ui/pallet/PalletNgModal';
import PalletBoardsNgSection, { usePalletBoardsNg } from '@/app/ui/pallet/PalletBoardsNgSection';
import type { SODetail, Pallet, PalletPhoto, Chip, Vendor } from '@/interface/IDatatable';
import { useIsMobile } from '@/app/ui/hooks/useIsMobile';

export default function SODetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const soId = Number(id);
  const toast = useToast();

  const [so, setSo] = useState<SODetail | null>(null);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'pallets' | 'boards'>('pallets');
  const { data: session } = useSession();
  const [editMeta, setEditMeta] = useState(false);
  const [addPalletOpen, setAddPalletOpen] = useState(false);
  const [lightbox, setLightbox] = useState<SODetail['photos'][0] | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletePalletId, setDeletePalletId] = useState<number | null>(null);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [photosMenuOpen, setPhotosMenuOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const actionMenuRef = useRef<HTMLDivElement>(null);
  const photosMenuRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  const loadSO = useCallback(async () => {
    try {
      const data = await api.sos.get(soId);
      setSo(data);
      // Prime the breadcrumb so clicking through to a pallet's boxes shows its real
      // label immediately instead of a skeleton while the crumb runs its own fetch.
      crumbCache.setSo(data.id, data.so_number);
      (data.pallets || []).forEach(p => crumbCache.setPallet(p.id, palletCrumb(data.so_number, p)));
    } catch { toast('Failed to load SO'); }
    finally { setLoading(false); }
  }, [soId]);

  useEffect(() => { loadSO(); }, [loadSO]);
  const [boardsPalletId, setBoardsPalletId] = useState<number | null>(null);

  // Deep link from a pallet's checklist: /sos/<id>?tab=boards&pallet=<palletId>
  useEffect(() => {
    const qp = new URLSearchParams(window.location.search);
    if (qp.get('tab') === 'boards') setTab('boards');
    const p = Number(qp.get('pallet'));
    if (p) setBoardsPalletId(p);
  }, []);
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

  const boardPalletOptions = so.pallets.map(p => {
    const parts = [p.licence_number, p.gateload_number].filter(Boolean);
    const label = parts.length ? parts.join('-') : `#${String(p.pallet_seq).padStart(2, '0')}`;
    return { value: String(p.id), label: `#${String(p.pallet_seq).padStart(2, '0')} · ${label}` };
  });
  // Boards tab defaults to the first pallet until one is picked or deep-linked.
  const boardsPallet = so.pallets.some(p => p.id === boardsPalletId) ? boardsPalletId : (so.pallets[0]?.id ?? null);

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

  const handleAddPallet = async (data: { in_weight_gross: string; actual_weight: string; out_weight_gross: string; out_weight_net: string; tantalum_wt: string; material_type: string; qty: string; licence_number: string; gateload_number: string; pendingPhotos?: string[] }) => {
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
      });
      const photos = data.pendingPhotos || [];
      if (created?.id && photos.length) {
        // Pallet exists now — attach each photo, then reload so the row shows them.
        await Promise.all(photos.map(url => api.pallets.photos.upload(created.id, url)));
        await loadSO();
      } else {
        setSo(s => s ? { ...s, pallets: [...s.pallets, created] } : s);
      }
      toast('Pallet added');
    } catch { toast('Failed to add pallet'); }
  };

  const handleAddPalletsBulk = async (rows: { in_weight_gross: string; actual_weight: string; out_weight_gross: string; out_weight_net: string; tantalum_wt: string; material_type: string; qty: string; licence_number: string; gateload_number: string }[]) => {
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

  const handleExport = async () => {
    toast('Preparing export…');
    try {
      const [pmRows, invRows] = await Promise.all([api.sos.palletMpns(soId), api.sos.inventory(soId)]);
      // One row per (pallet, MPN) carrying its board qty — replaces per-scan Board rows.
      const allBoardData = pmRows.map(r => ({
        pallet: r.pallet, mpn: r.mpn, chips: r.chips, qty: r.board_qty ?? 0,
        date: r.created_at,   // when this MPN was added to the pallet = "Date processed"
      }));
      const workbook = new ExcelJS.Workbook();
      const palletMap = new Map(so.pallets.map(p => [p.id, p]));

      const HDR_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF156082' } };
      const HDR_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' } };
      const styleHdr = (row: ExcelJS.Row) => row.eachCell(cell => { cell.fill = HDR_FILL; cell.font = HDR_FONT; });

      // Build MPN map once (reused across sheets)
      const mpnMap = new Map<number, MpnEntry>();
      for (const b of allBoardData) {
        if (!b.mpn) continue;
        if (!mpnMap.has(b.mpn.id)) mpnMap.set(b.mpn.id, { mpn: b.mpn, chips: b.chips, boardCount: 0, latestDate: '' });
        const entry = mpnMap.get(b.mpn.id)!;
        entry.boardCount += b.qty;
        if (b.date > entry.latestDate) entry.latestDate = b.date;
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
      wsPCB.columns = [{ width: 18 }, { width: 14 }, { width: 14 }, { width: 20 }, { width: 10 }, { width: 14 }, { width: 16 }];
      styleHdr(wsPCB.addRow(['Inbound LP No.', 'Date processed', 'Part type', 'MPN', 'Part Qty.', 'Chip Total Qty.', 'Chips per board']));
      const pcbMap = new Map<string, { lpNo: string; date: string; partType: string; mpnName: string; partQty: number; chips: Chip[] }>();
      for (const b of allBoardData) {
        if (!b.mpn) continue;
        const pallet = b.pallet ? palletMap.get(b.pallet) : null;
        const lpNo = pallet?.licence_number || '';
        const key = `${lpNo}||${b.mpn.id}`;
        if (!pcbMap.has(key)) pcbMap.set(key, { lpNo, date: b.date?.slice(0, 10) || '', partType: b.mpn.part_type || '', mpnName: b.mpn.name, partQty: 0, chips: b.chips ?? [] });
        const entry = pcbMap.get(key)!;
        entry.partQty += b.qty;
        if ((b.date || '') > (entry.date + 'T')) entry.date = b.date?.slice(0, 10) || '';
      }
      const pcbRows = [...pcbMap.values()].sort((a, b) => a.lpNo.localeCompare(b.lpNo));
      let pcbFirstDataRow = 0;
      let pcbLastDataRow = 0;
      for (const e of pcbRows) {
        // Chips harvested = boards x chips per board. Interchangeable alternates share one
        // slot, so a 5-alternate DRAM slot still yields 1 chip per board, not 5.
        const row = wsPCB.addRow([e.lpNo, e.date, e.partType, e.mpnName, e.partQty, e.partQty * bomTotalQty(e.chips)]);
        // Chips on this board MPN = Chip Total Qty / Part Qty.
        row.getCell(7).value = { formula: `IF(E${row.number}>0,F${row.number}/E${row.number},0)` };
        if (!pcbFirstDataRow) pcbFirstDataRow = row.number;
        pcbLastDataRow = row.number;
      }
      // Totals: Part Qty and Chip Total Qty summed; Chips per board = fleet-wide ratio F/E.
      if (pcbFirstDataRow) {
        const totalRow = wsPCB.addRow([]);
        totalRow.getCell(5).value = { formula: `SUM(E${pcbFirstDataRow}:E${pcbLastDataRow})` };
        totalRow.getCell(6).value = { formula: `SUM(F${pcbFirstDataRow}:F${pcbLastDataRow})` };
        totalRow.getCell(7).value = { formula: `IF(E${totalRow.number}>0,F${totalRow.number}/E${totalRow.number},0)` };
      }

      // ── Sheet 4: Processing chips ─────────────────────────────────
      // One row per slot, unioned across every MPN in the SO: the DRAM slot has 3
      // alternates on one board type and 5 on another, but bills as a single line.
      const wsChipProc = workbook.addWorksheet('Processing chips');
      wsChipProc.columns = [{ width: 14 }, { width: 20 }, { width: 24 }, { width: 20 }, { width: 14 }, { width: 14 }];
      styleHdr(wsChipProc.addRow(['Date processed', 'process type', 'Chip MPN', 'Chips processed qty.', 'Chips failed', 'Failure rate']));
      // Both counts are LIVE formulas off the Inventory sheet (filled from the checklist and
      // the pallets' NG counts below), so edits made there in Excel flow through:
      //   Chips processed = every Inventory qty for the slot's chip MPNs (good + NG)
      //   Chips failed    = only the rows whose Container UID (col B) is "NG"
      // A memory slot bundles several alternate MPNs into one line, so each sums per alternate.
      const INV_NG_QTY = 'Inventory!$F:$F', INV_NG_UID = 'Inventory!$B:$B', INV_NG_MPN = 'Inventory!$C:$C';
      const xq = (m: string) => `"${m.replace(/"/g, '""')}"`;
      for (const gs of buildGlobalSlots([...mpnMap.values()])) {
        const row = wsChipProc.addRow([gs.date.slice(0, 10), 'Chip Harvest', gs.label, 0, 0, 0]);
        const rn = row.number;
        const processed = gs.chipMpns.map(m => `SUMIF(${INV_NG_MPN},${xq(m)},${INV_NG_QTY})`).join('+') || '0';
        const failed = gs.chipMpns
          .map(m => `SUMIFS(${INV_NG_QTY},${INV_NG_UID},"${NG_UID}",${INV_NG_MPN},${xq(m)})`)
          .join('+') || '0';
        row.getCell(4).value = { formula: processed };
        row.getCell(5).value = { formula: failed };
        row.getCell(6).value = { formula: `IF(D${rn}>0,E${rn}/D${rn},0)` };
        row.getCell(6).numFmt = '0.00%';
      }

      // ── Sheet 5: Inventory ───────────────────────────────────────
      // Filled from the system (GET /sos/<id>/inventory/): per pallet, every checklist line
      // (Container UID = its barcode; unfilled lines stay blank), then one "NG" row per chip
      // with failures, then the pallet's Tantalum row ("73g"). The other sheets' formulas read
      // this sheet, so correcting a value here in Excel updates them too.
      const wsInventory = workbook.addWorksheet('Inventory');
      wsInventory.columns = [{ width: 10 }, { width: 34 }, { width: 24 }, { width: 18 }, { width: 16 }, { width: 8 }];
      styleHdr(wsInventory.addRow(['Pallet', 'Container UID', 'Chip MPN', 'Processed type', 'Packaging type', 'Qty.']));
      const invBorder: Partial<ExcelJS.Borders> = {
        top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' },
      };
      let invGroupStart = 0;
      invRows.forEach((r, i) => {
        const row = wsInventory.addRow([r.pallet_label, r.container_uid, r.chip_mpn, r.processed_type, r.packaging_type, r.qty ?? '']);
        for (let c = 1; c <= 6; c++) row.getCell(c).border = invBorder;
        if (!invGroupStart || invRows[i - 1]?.pallet_id !== r.pallet_id) invGroupStart = row.number;
        const lastOfPallet = invRows[i + 1]?.pallet_id !== r.pallet_id;
        if (lastOfPallet) {
          if (row.number > invGroupStart) wsInventory.mergeCells(invGroupStart, 1, row.number, 1);
          const cell = wsInventory.getCell(invGroupStart, 1);
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
        }
      });

      // ── Sheet 6: Board BOM ────────────────────────────────────────
      // One column pair per SLOT, not per chip. A slot's alternates are slash-joined.
      const mpnBomEntries = [...mpnMap.values()].map(({ mpn, chips }) => ({
        partType: mpn.part_type || '',
        mpnName: mpn.name,
        slots: buildSlots(chips),
      }));
      const maxSlots = Math.max(0, ...mpnBomEntries.map(e => e.slots.length));
      const bomHeader: string[] = ['Part type', 'MPN'];
      const bomCols: { width: number }[] = [{ width: 14 }, { width: 20 }];
      for (let i = 1; i <= maxSlots; i++) {
        bomHeader.push(`Chip ${String.fromCharCode(64 + i)} MPN`, `Chip ${String.fromCharCode(64 + i)} Qty.`);
        bomCols.push({ width: 24 }, { width: 10 });
      }
      bomHeader.push('Chip Total Qty.');
      bomCols.push({ width: 14 });
      const wsBoardBom = workbook.addWorksheet('Board BOM');
      wsBoardBom.columns = bomCols;
      styleHdr(wsBoardBom.addRow(bomHeader));
      for (const { partType, mpnName, slots } of mpnBomEntries) {
        const row: (string | number)[] = [partType, mpnName];
        let total = 0;
        for (let i = 0; i < maxSlots; i++) {
          const slot = slots[i];
          row.push(slot?.label ?? '', slot ? slot.qtyPerBoard : '');
          if (slot) total += slot.qtyPerBoard;
        }
        row.push(total || '');
        wsBoardBom.addRow(row);
      }

      const r3 = (n: number) => Math.round(n * 1000) / 1000;
      // Excel Accounting format: "$" hugs the left edge, number right-aligned, 2 decimals.
      const ACCOUNTING_FMT = '_("$"* #,##0.00_);_("$"* (#,##0.00);_("$"* "-"??_);_(@_)';

      // ── Sheet 7: Activity Based Processing Cost (dynamic per MPN) ──
      const wsActivityCost = workbook.addWorksheet('Activity Based Processing Cost');
      wsActivityCost.columns = [
        { width: 26 }, { width: 14 }, { width: 58 }, { width: 4 },
        { width: 22 }, { width: 16 }, { width: 20 }, { width: 30 },
      ];
      // Header row (row 1) for the per-board-type roll-up columns E–H. Each MPN block below
      // carries its own totals on the "Board part Number:" row (E–H), mirroring the template.
      const abcHdr = wsActivityCost.addRow([
        '', '', '', '',
        'Qty of Boards Processed', '# chips per board', 'Total Chips Harvested',
        'Total cost to process by board type',
      ]);
      for (let c = 5; c <= 8; c++) { abcHdr.getCell(c).fill = HDR_FILL; abcHdr.getCell(c).font = HDR_FONT; }

      // Light blue ("Blue, Accent 1, Lighter 80%") across the MPN roll-up row, cols B–H.
      const ABC_MPN_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCE6F1' } };
      const sortedForABC = [...mpnMap.values()].sort((a, b) => b.boardCount - a.boardCount);
      const abcHCells: string[] = [];   // H-cell of each block, for the grand total SUM
      let abcLastTotalRow: ExcelJS.Row | null = null;
      for (const entry of sortedForABC) {
        const cutCost = r3(Number(entry.mpn.cutboard_cost ?? 0));
        // Divide the board's cut cost across its SLOTS. Five interchangeable DRAMs are
        // one slot, so a 3-slot board bills 0.7/3, not 0.7/5.
        const nSlots = slotCount(entry.chips);
        const chipCutCost = cutCost > 0 && nSlots > 0 ? r3(cutCost / nSlots) : null;
        const cutDef = chipCutCost != null
          ? `The cost to cut a single chip by board type (${cutCost}/${nSlots}=${chipCutCost})`
          : 'The cost to cut a single chip by board type';

        // Board part Number row — also carries the roll-up columns E–H.
        const bpnRow = wsActivityCost.addRow(['Board part Number:', entry.mpn.name, '']);
        bpnRow.getCell(1).fill = HDR_FILL; bpnRow.getCell(1).font = HDR_FONT;
        bpnRow.getCell(2).font = { bold: true };
        // MPN name + the E–H roll-up cells sit on a light blue band (col A stays dark teal).
        for (let c = 2; c <= 8; c++) bpnRow.getCell(c).fill = ABC_MPN_FILL;
        const bpnNum = bpnRow.number;
        bpnRow.getCell(5).value = entry.boardCount;             // Qty of Boards Processed (= On Hand Inventory)
        bpnRow.getCell(6).value = bomTotalQty(entry.chips);     // # chips per board (chips harvested per board)
        bpnRow.getCell(7).value = { formula: `E${bpnNum}*F${bpnNum}` };       // Total Chips Harvested
        // Total cost = harvested chips × per-chip total service cost (this block's Total row, col B).
        bpnRow.getCell(8).value = { formula: `G${bpnNum}*B${bpnNum + 6}` };
        bpnRow.getCell(8).numFmt = ACCOUNTING_FMT;   // "$" at the left of the value
        abcHCells.push(`H${bpnNum}`);

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
        abcLastTotalRow = totalRow;

        // Spacer between MPN blocks
        wsActivityCost.addRow([]);
      }
      // Grand total of processing cost across all board types, on the last block's Total row.
      if (abcLastTotalRow && abcHCells.length) {
        abcLastTotalRow.getCell(7).value = 'Total';
        abcLastTotalRow.getCell(7).font = { bold: true };
        abcLastTotalRow.getCell(8).value = { formula: `SUM(${abcHCells.join(',')})` };
        abcLastTotalRow.getCell(8).numFmt = ACCOUNTING_FMT;
      }

      // Chip BOM's Quantity and Bid_Template_Chip's Quantity are the SAME live formula: the
      // Inventory Qty of every row whose Chip MPN matches, EXCEPT the "NG" rows — failed chips
      // are not stock that can be bid on or shipped.
      // Inventory layout: A=Pallet, B=Container UID, C=Chip MPN, D=Processed, E=Packaging, F=Qty.
      const INV_MPN_COL = 'Inventory!$C:$C';
      const INV_QTY_COL = 'Inventory!$F:$F';
      const INV_UID_COL = 'Inventory!$B:$B';
      const goodQty = (cell: string) => `SUMIFS(${INV_QTY_COL},${INV_MPN_COL},${cell},${INV_UID_COL},"<>${NG_UID}")`;

      // ── Sheet 8: Chip BOM (with embedded photos) ──────────────────
      // Individual chips here, NOT slot groups — this is the catalogue of every distinct
      // part, which is also what the Bid template enumerates.
      const chipBomMap = new Map<string, { chipMpn: string; manufacturer: string; chipType: string; description: string; itemGroup: string; photoUrl: string }>();
      for (const b of allBoardData) {
        for (const chip of b.chips ?? []) {
          const key = normalizeChipMpn(chip.chip_mpn);
          if (!key || chipBomMap.has(key)) continue;
          chipBomMap.set(key, {
            chipMpn: chip.chip_mpn.trim(),
            manufacturer: chip.brand_name || '',
            chipType: chip.chip_type || '',
            description: chip.description || '',
            itemGroup: chip.item_group || '',
            photoUrl: chip.chip_photo_url || '',
          });
        }
      }
      const wsChipBom = workbook.addWorksheet('Chip BOM');
      wsChipBom.columns = [{ width: 24 }, { width: 18 }, { width: 14 }, { width: 30 }, { width: 18 }, { width: 12 }];
      styleHdr(wsChipBom.addRow(['Chip MPN', 'Manufacturer', 'Chip type', 'Chip description', 'Chip picture', 'Quantity']));
      // Each chip is one bordered row; a single blank row separates consecutive chips and the
      // Total row follows the last chip directly — matching the reference workbook's frame.
      const thinSide: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FF000000' } };
      const boxBorder: Partial<ExcelJS.Borders> = { top: thinSide, bottom: thinSide, left: thinSide, right: thinSide };
      let chipBomFirstDataRow = 0;
      let chipBomLastDataRow = 0;
      let chipBomFirst = true;
      let chipBomPrevPhoto = false;
      for (const e of chipBomMap.values()) {
        // A photo's two-cell anchor (below) already reserves the row under its data row, and that
        // reserved row is the blank spacer to the next chip. A chip WITHOUT a photo reserves
        // nothing, so add the spacer explicitly. Either way: exactly one blank row between chips.
        if (!chipBomFirst && !chipBomPrevPhoto) wsChipBom.addRow([]);
        chipBomFirst = false;
        const dataRow = wsChipBom.addRow([e.chipMpn, e.manufacturer, e.chipType, e.description, '', 0]);
        dataRow.height = 72;
        for (let c = 1; c <= 6; c++) dataRow.getCell(c).border = boxBorder;
        // Same live formula as Bid_Template_Chip: good (non-NG) Inventory Qty for this Chip MPN (col A).
        dataRow.getCell(6).value = { formula: goodQty(`$A${dataRow.number}`) };
        if (!chipBomFirstDataRow) chipBomFirstDataRow = dataRow.number;
        chipBomLastDataRow = dataRow.number;
        let chipBomPhotoAdded = false;
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
              const imgExt = e.photoUrl.toLowerCase().endsWith('.png') ? 'png' : 'jpeg';
              const imgId = workbook.addImage({ base64, extension: imgExt });
              const r0 = dataRow.number - 1;
              // Two-cell anchor spanning the data row: the photo is bounded to the row's height,
              // so a taller row makes a bigger photo and it can never overflow into the next row
              // (a fixed-size ext anchor ignored the height and overflowed). This anchor also
              // reserves the row below as the spacer — see the spacer logic at the top of the loop.
              wsChipBom.addImage(imgId, { tl: { col: 4, row: r0 } as any, br: { col: 5, row: r0 + 1 } as any, editAs: 'oneCell' });
              chipBomPhotoAdded = true;
            }
          } catch { /* skip failed image — leave cell empty */ }
        }
        chipBomPrevPhoto = chipBomPhotoAdded;
      }
      // Quantity total. Blank spacer rows in the range are empty and contribute 0.
      if (chipBomFirstDataRow) {
        const totalRow = wsChipBom.addRow(['', '', '', '', 'Total', 0]);
        totalRow.getCell(5).font = { bold: true };
        totalRow.getCell(5).border = boxBorder;
        totalRow.getCell(6).border = boxBorder;
        totalRow.getCell(6).value = { formula: `SUM(F${chipBomFirstDataRow}:F${chipBomLastDataRow})` };
      }

      // ── Sheet 9: Service_Cost_Example ─────────────────────────────
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
        const slots = buildSlots(entry.chips);
        const unitChipCost = r3(cutCost > 0 && slots.length > 0 ? Number(cutCost) / slots.length : 0);
        wsSCE.addRow([]);
        const mpnRow = addSceRow(wsSCE, [entry.mpn.name, cutCost, '', '', '', '', 0, inv, 0]);
        mpnRow.getCell(1).fill = HDR_FILL; mpnRow.getCell(1).font = HDR_FONT;
        wsSCE.addRow([]);
        let chipStartRow = 0;
        let chipEndRow = 0;
        for (const slot of slots) {
          const chipRow = addSceRow(wsSCE, [slot.label, unitChipCost, '', '', '', '', 0, inv, 0]);
          if (!chipStartRow) chipStartRow = chipRow.number;
          chipEndRow = chipRow.number;
        }
        wsSCE.addRow([]);
        const totalRow = wsSCE.addRow([`Total Cost of harvested chips ${entry.mpn.name}`, '', '', '', '', '', '', '']);
        if (chipStartRow) totalRow.getCell(9).value = { formula: `SUM(I${chipStartRow}:I${chipEndRow})` };
        totalRow.getCell(1).fill = HDR_FILL; totalRow.getCell(1).font = HDR_FONT;
      }

      const BID_HEADER = ['Item Number', 'Standard Description', 'Manufacturer', 'Circular Center', 'Item Group', 'Line Number', 'Quantity', 'Harvest State'];
      const BID_COLS = [{ width: 20 }, { width: 26 }, { width: 16 }, { width: 14 }, { width: 12 }, { width: 12 }, { width: 10 }, { width: 26 }];
      const titleWords = (s: string) => s.toLowerCase().replace(/\b\w/g, ch => ch.toUpperCase());

      // ── Sheet 10: Bid_Template_Chip ───────────────────────────────
      // Quantity is a LIVE formula (see INV_MPN_COL/INV_QTY_COL above) — same as Chip BOM.
      const wsBidChip = workbook.addWorksheet('Bid_Template_Chip');
      wsBidChip.columns = BID_COLS;
      styleHdr(wsBidChip.addRow(BID_HEADER));
      const bidChips = [...chipBomMap.values()].sort((a, b) => a.chipMpn.localeCompare(b.chipMpn));
      bidChips.forEach((c, i) => {
        const row = wsBidChip.addRow([
          c.chipMpn, c.description, titleWords(c.manufacturer), CIRCULAR_CENTER,
          c.itemGroup, i + 1, 0, HARVEST_STATE,
        ]);
        row.getCell(7).value = { formula: goodQty(`$A${row.number}`) };
      });
      const bidChipTotal = wsBidChip.addRow(['', '', '', '', '', '', '', '']);
      bidChipTotal.getCell(6).value = 'Total';   // to the left of the Quantity total
      bidChipTotal.getCell(6).font = { bold: true };
      if (bidChips.length) bidChipTotal.getCell(7).value = { formula: `SUM(G2:G${1 + bidChips.length})` };

      // ── Sheet 11: Bid_Template_Tantalum ───────────────────────────
      const wsBidTa = workbook.addWorksheet('Bid_Template_Tantalum');
      wsBidTa.columns = BID_COLS;
      styleHdr(wsBidTa.addRow(BID_HEADER));
      // Quantity is a LIVE total off the Inventory sheet's Tantalum rows (one per pallet).
      // Tantalum is logged there under the Chip MPN "Tantalum" with a TEXT qty like "73g", so a
      // plain SUMIF (which only adds numbers) returns 0 — strip the "g" and sum with SUMPRODUCT.
      // IFERROR(VALUE(...),0) turns each blank/non-numeric cell into 0. Rows bounded generously.
      // MUST be an array formula: SUBSTITUTE/VALUE are scalar, so a regular formula makes modern
      // Excel insert implicit-intersection "@" on the range (collapsing it to one cell → wrong
      // total). Writing it as t="array" forces whole-range evaluation, no "@".
      const TA_MPN = 'Inventory!$C$2:$C$10000', TA_QTY = 'Inventory!$F$2:$F$10000';
      const taRow = wsBidTa.addRow(['No part number', 'Grams of tantalum', 'Various', CIRCULAR_CENTER, 'Capacitor', 1, 0, HARVEST_STATE]);
      taRow.getCell(7).value = {
        formula: `SUMPRODUCT((${TA_MPN}="Tantalum")*IFERROR(VALUE(SUBSTITUTE(${TA_QTY},"g","")),0))`,
        ref: `G${taRow.number}`,
        shareType: 'array',
      } as any;
      const bidTaTotal = wsBidTa.addRow(['', '', '', '', '', '', '', '']);
      bidTaTotal.getCell(6).value = 'Total (grams)';
      bidTaTotal.getCell(7).value = { formula: `SUM(G${taRow.number})` };

      const buf = await workbook.xlsx.writeBuffer();
      saveAs(new Blob([buf], { type: 'application/octet-stream' }), `${so.so_number}-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch { toast('Export failed'); }
  };

  return (
    <div className="fade-in page-pad">
      {/* Title row — mobile only (desktop shows actions inline in the meta card) */}
      {isMobile && (
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', margin: '8px 0 10px', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <h1 className="mono" style={{ margin: 0, fontSize: 20, fontWeight: 400, letterSpacing: '-0.01em' }}>
              {so.so_number}
            </h1>
          </div>

          {/* Mobile: single "⋮" menu button */}
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
        </div>
      )}

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
            <div style={{ flex: '0 0 300px', padding: '6px 12px', minWidth: 0 }}>
              <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-4)', marginBottom: 2 }}>Note</div>
              <EditableCell value={so.note} onSave={v => handleSaveMeta({ note: v })} />
            </div>
            {/* Actions */}
            <div style={{ flex: 1, padding: '6px 12px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
              <Button variant="danger" icon={<TrashIcon />} onClick={() => setDeleteConfirmOpen(true)}>Delete</Button>
              <Button variant="outline" icon={<DownloadIcon />} onClick={handleExport}>Export</Button>
              <Button variant="outline" icon={<EditIcon />} onClick={() => setEditMeta(true)}>Edit</Button>
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
            onGoToBoards={palletId => { setBoardsPalletId(palletId); setTab('boards'); }}
            onGoToBoxes={palletId => router.push(`/sos/${soId}/pallets/${palletId}`)}
            onNgSaved={loadSO}
          />
        )}
        {tab === 'boards' && (
          <PalletBoardsTab
            palletOptions={boardPalletOptions}
            palletId={boardsPallet}
            onPalletChange={setBoardsPalletId}
            onChanged={loadSO}
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
              <li>All board assignments ({so?.total_board_count ?? 0} boards)</li>
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

// ─── Pallet photos: grid (in forms) + multi-image lightbox (viewing) ──
// Ported from the Sales-Orders pallet screen so MSFT pallets behave identically:
// scanner- or web-uploaded photos hang off PalletPhoto and are viewed/managed here.
interface PhotoEntry { id?: number; url: string; }  // id = existing DB photo; no id = pending upload

function MultiPhotoGrid({ photos, onAdd, onRemove }: {
  photos: PhotoEntry[]; onAdd: (dataUrls: string[]) => void; onRemove: (index: number) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
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
          <div key={ph.id ?? `p-${i}`} style={{ position: 'relative', width: ThumbSize, height: ThumbSize, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--hair-strong)' }}>
            <img src={ph.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <button type="button" onClick={() => onRemove(i)}
              style={{ position: 'absolute', top: 3, right: 3, width: 20, height: 20, borderRadius: 5, background: 'rgba(0,0,0,0.6)', border: 'none', color: '#fff', cursor: 'pointer', display: 'grid', placeItems: 'center', lineHeight: 1, fontSize: 12 }}>×</button>
          </div>
        ))}
        <div onClick={() => inputRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); if (e.dataTransfer.files.length) pick(e.dataTransfer.files); }}
          style={{ width: ThumbSize, height: ThumbSize, borderRadius: 6, border: '1.5px dashed var(--hair-strong)', background: 'var(--surface-2)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--ink-4)', gap: 4 }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          <span style={{ fontSize: 10, fontWeight: 600 }}>Add</span>
        </div>
      </div>
      <input ref={inputRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
        onChange={e => { if (e.target.files?.length) pick(e.target.files); e.target.value = ''; }} />
    </div>
  );
}

interface PalletLightboxState { images: { src: string; label: string }[]; index: number; }

function PalletLightbox({ state, onClose }: { state: PalletLightboxState | null; onClose: () => void }) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [idx, setIdx] = useState(0);
  const drag = useRef<{ x: number; y: number } | null>(null);

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

  const Chev = ({ dir }: { dir: 'l' | 'r' }) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points={dir === 'l' ? '15 18 9 12 15 6' : '9 18 15 12 9 6'} />
    </svg>
  );
  const NavBtn = ({ onClick, disabled, children }: any) => (
    <button onClick={onClick} disabled={disabled}
      style={{ width: 36, height: 36, borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.08)', color: disabled ? 'rgba(255,255,255,0.2)' : '#fff', cursor: disabled ? 'default' : 'pointer', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
      {children}
    </button>
  );
  const ZoomBtn = ({ onClick, disabled, children, title }: any) => (
    <button onClick={onClick} disabled={disabled} title={title}
      style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.08)', color: disabled ? 'rgba(255,255,255,0.3)' : '#fff', cursor: disabled ? 'default' : 'pointer', display: 'grid', placeItems: 'center' }}>
      {children}
    </button>
  );

  return createPortal(
    <div onClick={onClose} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
      style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(20,24,20,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ width: '90vw', maxWidth: 900, height: '90vh', maxHeight: 800, background: '#1a1e1a', borderRadius: 14, overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,0.6)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.1)', flexShrink: 0 }}>
          <span className="mono" style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.7)' }}>{cur.label}</span>
          {images.length > 1 && <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{idx + 1} / {images.length}</span>}
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <ZoomBtn onClick={() => zoomBy(-0.25)} disabled={zoom <= 1} title="Zoom out (−)">−</ZoomBtn>
            <span style={{ width: 44, textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.6)', fontVariantNumeric: 'tabular-nums' }}>{Math.round(zoom * 100)}%</span>
            <ZoomBtn onClick={() => zoomBy(0.25)} disabled={zoom >= 5} title="Zoom in (+)">+</ZoomBtn>
            <ZoomBtn onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} disabled={zoom === 1} title="Reset (0)">⟳</ZoomBtn>
          </div>
          <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.12)', margin: '0 4px' }} />
          <button onClick={onClose}
            style={{ width: 28, height: 28, borderRadius: 6, border: 'none', background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', display: 'grid', placeItems: 'center', fontSize: 16, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 0, overflow: 'hidden' }}>
          {images.length > 1 && <NavBtn onClick={() => setIdx(i => i - 1)} disabled={idx === 0}><Chev dir="l" /></NavBtn>}
          <div onWheel={onWheel} onMouseDown={onDown}
            style={{ flex: 1, height: '100%', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: zoom > 1 ? (drag.current ? 'grabbing' : 'grab') : 'default' }}>
            <img src={cur.src} alt={cur.label} draggable={false}
              style={{ maxWidth: '100%', maxHeight: '100%', userSelect: 'none', transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: 'center', transition: drag.current ? 'none' : 'transform .12s ease' }} />
          </div>
          {images.length > 1 && <NavBtn onClick={() => setIdx(i => i + 1)} disabled={idx === images.length - 1}><Chev dir="r" /></NavBtn>}
        </div>
        {images.length > 1 && (
          <div style={{ display: 'flex', gap: 6, padding: '8px 12px', borderTop: '1px solid rgba(255,255,255,0.08)', overflowX: 'auto', flexShrink: 0 }}>
            {images.map((img, i) => (
              <img key={i} src={img.src} alt="" onClick={() => setIdx(i)}
                style={{ width: 48, height: 48, borderRadius: 6, objectFit: 'cover', cursor: 'pointer', opacity: i === idx ? 1 : 0.45, border: i === idx ? '2px solid var(--accent)' : '2px solid transparent', flexShrink: 0 }} />
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

/** Map a pallet's photos to lightbox image entries (image_url, falling back to raw path).
 *  Prefers the multi-photo PalletPhoto set; if a pallet has none, falls back to the
 *  legacy single Pallet.photo field so older photos still surface. */
function palletImgs(p: Pallet) {
  const label = p.licence_number || `Pallet #${p.pallet_seq}`;
  const imgs = (p.photos || []).map(ph => ({ src: (ph.image_url || ph.image) as string, label }));
  if (!imgs.length && (p.photo_url || p.photo)) imgs.push({ src: (p.photo_url || p.photo) as string, label });
  return imgs;
}

// ─── Pallets Tab ──────────────────────────────────────────────────
function PalletsTab({ pallets, effectiveRule, ruleIsOverride, vendorName, palletTotal, addDisabled, onAdd, onUpdate, onDelete, onGoToBoards, onGoToBoxes, onNgSaved }: {
  pallets: Pallet[]; effectiveRule: string; ruleIsOverride: boolean; vendorName: string;
  palletTotal: { weight: number; qty: number; boardQty: number; outWeightGross: number; outWeightNet: number; tantalumWt: number }; addDisabled: boolean;
  onAdd: () => void; onUpdate: (id: number, p: Partial<Pallet>) => void; onDelete: (id: number) => void;
  onGoToBoards: (palletId: number) => void;
  onGoToBoxes: (palletId: number) => void;
  /** NG counts were saved — refresh the SO so the NG column updates. */
  onNgSaved: () => void;
}) {
  const [editingPallet, setEditingPallet] = useState<Pallet | null>(null);
  const [ngPallet, setNgPallet] = useState<{ id: number; label: string } | null>(null);
  const ngLabel = (p: Pallet) => p.licence_number || `Pallet #${p.pallet_seq}`;
  const ngTotal = pallets.reduce((n, p) => n + (p.ng_qty ?? 0), 0);
  const [lightbox, setLightbox] = useState<PalletLightboxState | null>(null);
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                  {(() => {
                    const imgs = palletImgs(p);
                    if (!imgs.length) return null;
                    return (
                      <div style={{ position: 'relative', flexShrink: 0, cursor: 'zoom-in', lineHeight: 0 }}
                        onClick={e => { e.stopPropagation(); setLightbox({ images: imgs, index: 0 }); }}>
                        <img src={imgs[0].src} alt="" style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover', display: 'block', border: '1px solid var(--hair)' }} />
                        {imgs.length > 1 && (
                          <span style={{ position: 'absolute', bottom: -3, right: -3, background: 'rgba(0,0,0,0.7)', color: '#fff', fontSize: 8.5, fontWeight: 700, borderRadius: 4, padding: '0 3px', lineHeight: 1.55 }}>+{imgs.length - 1}</span>
                        )}
                      </div>
                    );
                  })()}
                  <Badge tone="warn" style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
                    {parseFloat(p.in_weight_gross).toFixed(2)} lb
                  </Badge>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button onClick={e => { e.stopPropagation(); onGoToBoxes(p.id); }} style={ghostBtn} title="Boxes & checklist"><BoxIcon /></button>
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
                {p.board_qty != null && <><span style={{ color: 'var(--hair-strong)' }}>·</span><span>Boards <span className="num" style={{ color: 'var(--ink-2)' }}>{p.board_qty}</span></span>{p.board_qty_is_legacy && <Badge tone="neutral" style={{ fontSize: 10 }}>Legacy</Badge>}</>}
                <span style={{ color: 'var(--hair-strong)' }}>·</span>
                <button onClick={e => { e.stopPropagation(); setNgPallet({ id: p.id, label: ngLabel(p) }); }}
                  style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit', color: 'var(--ink-3)' }}>
                  NG <span className="num" style={{ color: p.ng_qty ? 'var(--err)' : 'var(--ink-2)' }}>{p.ng_qty || 0}</span>
                </button>
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
              <col style={{ width: 60 }} />
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
              <col style={{ width: '5%' }} />
              <col style={{ width: '11%' }} />
            </colgroup>
            <thead>
              <tr>
                <th style={thS}>Image</th>
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
                <th style={{ ...thS, textAlign: 'right' }} title="Failed chips — click a value to edit">NG</th>
                <th style={{ ...thS, textAlign: 'right' }}></th>
              </tr>
            </thead>
            <tbody>
              {pallets.map(p => (
                <tr key={p.id} onClick={() => onGoToBoards(p.id)}
                  style={{ borderBottom: '1px solid var(--hair)', cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ''}>
                  <td style={tdS} onClick={e => e.stopPropagation()}>
                    {(() => {
                      const imgs = palletImgs(p);
                      if (!imgs.length) return (
                        <div style={{ width: 40, height: 40, borderRadius: 6, background: 'var(--surface-2)', border: '1px dashed var(--hair-strong)', display: 'grid', placeItems: 'center', color: 'var(--ink-5)' }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                        </div>
                      );
                      return (
                        <div style={{ position: 'relative', display: 'inline-block', cursor: 'zoom-in', lineHeight: 0 }}
                          onClick={() => setLightbox({ images: imgs, index: 0 })}>
                          <img src={imgs[0].src} alt="" style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover', display: 'block' }} />
                          {imgs.length > 1 && (
                            <span style={{ position: 'absolute', bottom: 2, right: 2, background: 'rgba(0,0,0,0.65)', color: '#fff', fontSize: 9, fontWeight: 700, borderRadius: 4, padding: '1px 4px', lineHeight: 1.5 }}>+{imgs.length - 1}</span>
                          )}
                        </div>
                      );
                    })()}
                  </td>
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
                    {p.board_qty_is_legacy && <Badge tone="neutral" style={{ marginLeft: 6, fontSize: 10 }}>Legacy</Badge>}
                  </td>
                  {/* Reads like the other number columns; the whole cell is the click target. */}
                  <td className="num ng-cell" title="Edit NG (failed chips)"
                    style={{ ...tdS, textAlign: 'right', cursor: 'pointer' }}
                    onClick={e => { e.stopPropagation(); setNgPallet({ id: p.id, label: ngLabel(p) }); }}>
                    {p.ng_qty
                      ? <Badge tone="err" style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{p.ng_qty}</Badge>
                      : <span style={{ color: 'var(--ink-5)' }}>—</span>}
                  </td>
                  <td style={{ ...tdS, textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: 4 }}>
                      <button onClick={e => { e.stopPropagation(); onGoToBoxes(p.id); }} style={ghostBtn} title="Boxes & checklist"><BoxIcon /></button>
                      <button onClick={e => { e.stopPropagation(); setEditingPallet(p); }} style={ghostBtn} title="Edit"><EditIcon /></button>
                      <button onClick={e => { e.stopPropagation(); onDelete(p.id); }} style={ghostBtn} title="Delete"><TrashIcon /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {pallets.length > 0 && (
                <tr style={{ background: 'var(--surface-2)' }}>
                  <td style={{ ...tdS, fontSize: 11, color: 'var(--ink-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }} colSpan={3}>
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
                  <td style={{ ...tdS, textAlign: 'right', color: ngTotal ? 'var(--err)' : undefined }} className="num">{ngTotal || '—'}</td>
                  <td />
                </tr>
              )}
              {pallets.length === 0 && (
                <tr><td colSpan={13}><Empty label="No pallets yet" sub="Click 'Add pallet' to start." /></td></tr>
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
      <PalletLightbox state={lightbox} onClose={() => setLightbox(null)} />
      <PalletNgModal pallet={ngPallet} onClose={() => setNgPallet(null)} onSaved={onNgSaved} />
      <style>{`.ng-cell:hover{background:var(--accent-light)}`}</style>
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
  const [saving, setSaving] = useState(false);
  const [existingPhotos, setExistingPhotos] = useState<PhotoEntry[]>([]);
  const [pendingPhotos, setPendingPhotos] = useState<string[]>([]);
  const [removedPhotoIds, setRemovedPhotoIds] = useState<number[]>([]);
  const [error, setError] = useState('');
  // Board qty per MPN + NG per chip; the pallet's Board Qty / NG are their sums.
  const boardsNg = usePalletBoardsNg(pallet.id, open);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (open) {
      setError('');
      setLicence(pallet.licence_number);
      setPayload(pallet.gateload_number);
      setInWeightGross(parseFloat(pallet.in_weight_gross).toFixed(2));
      setActualWeight(pallet.actual_weight ? parseFloat(pallet.actual_weight).toFixed(2) : '');
      setOutWeightGross(pallet.out_weight_gross ? parseFloat(pallet.out_weight_gross).toFixed(2) : '');
      setOutWeightNet(pallet.out_weight_net ? parseFloat(pallet.out_weight_net).toFixed(2) : '');
      setTantalumWt(pallet.tantalum_wt ? parseFloat(pallet.tantalum_wt).toFixed(2) : '');
      setMatType(pallet.material_type);
      setQty(String(pallet.qty));
      setSaving(false);
      setExistingPhotos((pallet.photos || []).map(ph => ({ id: ph.id, url: (ph.image_url || ph.image) as string })));
      setPendingPhotos([]);
      setRemovedPhotoIds([]);
    }
  }, [open, pallet]);

  // Grid shows surviving existing photos + pending previews.
  const gridPhotos: PhotoEntry[] = [
    ...existingPhotos.filter(ph => !removedPhotoIds.includes(ph.id!)),
    ...pendingPhotos.map(url => ({ url })),
  ];
  const removePhoto = (index: number) => {
    const ph = gridPhotos[index];
    if (ph.id !== undefined) {
      setRemovedPhotoIds(ids => [...ids, ph.id!]);
    } else {
      const pendingStart = existingPhotos.filter(e => !removedPhotoIds.includes(e.id!)).length;
      setPendingPhotos(ps => ps.filter((_, idx) => idx !== index - pendingStart));
    }
  };

  const handleSave = async () => {
    setSaving(true); setError('');
    try {
      // Boards & NG first: the pallet returned by onSave() then carries the new totals.
      const err = await boardsNg.save();
      if (err) { setError(err); return; }
      // Photo ops next, so the pallet returned by onSave() reflects the final photo set.
      if (removedPhotoIds.length) {
        await Promise.all(removedPhotoIds.map(pid => api.pallets.photos.delete(pallet.id, pid)));
      }
      if (pendingPhotos.length) {
        await Promise.all(pendingPhotos.map(url => api.pallets.photos.upload(pallet.id, url)));
      }
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
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Edit Pallet #${String(pallet.pallet_seq).padStart(2, '0')}`} width={isMobile ? 560 : 1040}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={!inWeightGross || !qty || saving} onClick={handleSave}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </>}>
      {error && <div style={{ marginBottom: 12, color: 'var(--err)', fontSize: 12.5 }}>{error}</div>}
      {/* Wide layout: pallet fields + photos on the left, Boards & NG on the right, so the
          whole pallet fits without scrolling. Stacks on phones. */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 0 : 24, alignItems: 'start' }}>
      <div>
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
      </div>
      <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-4)', marginBottom: 10 }}>
          Photos <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--ink-4)' }}>
            {gridPhotos.length > 0 ? `${gridPhotos.length} image${gridPhotos.length > 1 ? 's' : ''}` : 'optional'}
          </span>
        </div>
        <MultiPhotoGrid
          photos={gridPhotos}
          onAdd={urls => setPendingPhotos(ps => [...ps, ...urls])}
          onRemove={removePhoto}
        />
      </div>
      </div>
      <PalletBoardsNgSection state={boardsNg} flush={!isMobile} listMaxHeight={isMobile ? 280 : 'calc(100vh - 340px)'} />
      </div>
    </Modal>
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
type PalletRowData = { in_weight_gross: string; actual_weight: string; out_weight_gross: string; out_weight_net: string; tantalum_wt: string; material_type: string; qty: string; licence_number: string; gateload_number: string };

function AddPalletModal({ open, rule, onClose, onAdd, onAddBulk }: {
  open: boolean; rule: string; onClose: () => void;
  onAdd: (data: PalletRowData & { pendingPhotos?: string[] }) => void;
  onAddBulk: (rows: PalletRowData[]) => void;
}) {
  const aggregated = rule === 'aggregated';
  const [mode, setMode] = useState<'single' | 'bulk'>('single');

  // single
  const [w, setW] = useState('');
  const [pendingPhotos, setPendingPhotos] = useState<string[]>([]);
  const [actualW, setActualW] = useState('');
  const [outWGross, setOutWGross] = useState('');
  const [outWNet, setOutWNet] = useState('');
  const [tanWt, setTanWt] = useState('');
  const [materialType, setMaterialType] = useState('');
  const [q, setQ] = useState('');
  const [licence, setLicence] = useState('');
  const [payload, setPayload] = useState('');

  // bulk
  const blankRow = (): PalletRowData => ({ licence_number: '', gateload_number: '', in_weight_gross: '', actual_weight: '', out_weight_gross: '', out_weight_net: '', tantalum_wt: '', material_type: '', qty: aggregated ? '' : '1' });
  const [rows, setRows] = useState<PalletRowData[]>(Array.from({ length: 10 }, blankRow));

  useEffect(() => {
    if (open) {
      setMode('single');
      setW(''); setActualW(''); setOutWGross(''); setOutWNet(''); setTanWt(''); setMaterialType(''); setQ(aggregated ? '' : '1'); setLicence(''); setPayload('');
      setPendingPhotos([]);
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
    onAdd({ in_weight_gross: w, actual_weight: actualW, out_weight_gross: outWGross, out_weight_net: outWNet, tantalum_wt: tanWt, material_type: materialType, qty: q, licence_number: licence, gateload_number: payload, pendingPhotos });
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
          </div>
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-4)', marginBottom: 10 }}>
              Photos <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--ink-4)' }}>
                {pendingPhotos.length > 0 ? `${pendingPhotos.length} image${pendingPhotos.length > 1 ? 's' : ''}` : 'optional'}
              </span>
            </div>
            <MultiPhotoGrid
              photos={pendingPhotos.map(url => ({ url }))}
              onAdd={urls => setPendingPhotos(ps => [...ps, ...urls])}
              onRemove={i => setPendingPhotos(ps => ps.filter((_, idx) => idx !== i))}
            />
          </div>
        </>
      )}

      {mode === 'bulk' && (
        <>
          <div style={{ border: '1px solid var(--hair)', borderRadius: 3, background: 'var(--surface)', overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '28px 1.2fr 1.2fr 0.9fr 0.9fr 0.9fr 0.9fr 0.9fr 0.9fr 0.9fr 24px', gap: 0, padding: '8px 10px', fontSize: 9.5, letterSpacing: '0.14em', textTransform: 'uppercase' as const, color: 'var(--ink-4)', background: 'var(--surface-2)', borderBottom: '1px solid var(--hair)' }}>
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
              <div />
            </div>
            <div>
              {rows.map((r, i) => {
                const isDup = !!r.licence_number && dupLicences.has(r.licence_number.trim());
                return (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '28px 1.2fr 1.2fr 0.9fr 0.9fr 0.9fr 0.9fr 0.9fr 0.9fr 0.9fr 24px', gap: 0, padding: '6px 10px', alignItems: 'center', borderBottom: '1px solid var(--hair)' }}>
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

const BoxIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" />
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
