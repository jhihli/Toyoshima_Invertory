'use client';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import * as XLSX from 'xlsx';
import * as XLSXStyle from 'xlsx-js-style';
import { saveAs } from 'file-saver';
import {
  Button, Input, Select, Modal, Pagination, Breadcrumbs, Empty,
  Field, useToast, thS, tdS,
} from '@/app/ui/components';
import { api } from '@/app/lib/api';
import type { SO, Vendor } from '@/interface/IDatatable';
import { WeightRuleField } from './WeightRuleField';

const PAGE_SIZE = 30;

type SortKey = 'so_number' | 'date';

export default function SOListPage() {
  const router = useRouter();
  const toast = useToast();
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const [sos, setSos] = useState<SO[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const [q, setQ] = useState('');
  const [vendorFilter, setVendorFilter] = useState('');
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'date', dir: 'desc' });
  const [newOpen, setNewOpen] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.sos.list({
        q, vendor: vendorFilter, date_from: dateFrom, date_to: dateTo,
        page, page_size: PAGE_SIZE,
      });
      setSos(res.results);
      setTotal(res.total);
    } catch (e) {
      toast('Failed to load SOs');
    } finally {
      setLoading(false);
    }
  }, [q, vendorFilter, dateFrom, dateTo, page]);

  useEffect(() => { api.vendors.list().then(setVendors).catch(() => {}); }, []);
  useEffect(() => { fetchData(); }, [fetchData]);

  const toggleSort = (key: SortKey) => {
    setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' });
  };

  const hasFilter = q || vendorFilter || dateFrom !== today || dateTo !== today;
  const clearFilters = () => { setQ(''); setVendorFilter(''); setDateFrom(today); setDateTo(today); setPage(1); };
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleExport = async () => {
    toast('Preparing export…');
    try {
      const all = await api.sos.list({ q, vendor: vendorFilter, date_from: dateFrom, date_to: dateTo, page: 1, page_size: 9999 });
      const palletsPerSO = await Promise.all(all.results.map(s => api.pallets.list(s.id)));

      const COL_WIDTHS = [{ wch: 18 }, { wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 10 }];
      const COLS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
      const HEADER = ['SO Number', 'Vendor', 'Date', 'Pallet #', 'Licence No', 'Payload No', 'Weight (lb)', 'Pallet Qty', 'Board Qty', 'Boards'];

      // ── Sheet 1: Sales Orders (flat pallet rows, no styling needed) ──
      const rows: Record<string, string | number>[] = [];
      all.results.forEach((s, idx) => {
        const pallets = palletsPerSO[idx];
        if (pallets.length === 0) {
          rows.push({ 'SO Number': s.so_number, 'Vendor': s.vendor_name, 'Date': s.date, 'Pallet #': '', 'Licence No': '', 'Payload No': '', 'Weight (lb)': '', 'Pallet Qty': '', 'Board Qty': '', 'Boards': s.total_board_count });
        } else {
          pallets.forEach(p => rows.push({ 'SO Number': s.so_number, 'Vendor': s.vendor_name, 'Date': s.date, 'Pallet #': p.pallet_seq, 'Licence No': p.licence_number || '', 'Payload No': p.payload_number || '', 'Weight (lb)': parseFloat(p.weight), 'Pallet Qty': p.qty, 'Board Qty': p.board_qty ?? '', 'Boards': s.total_board_count }));
        }
      });
      const ws1 = XLSX.utils.json_to_sheet(rows);
      ws1['!cols'] = COL_WIDTHS;

      // ── Sheet 2: Weight Qty Sum (pallet rows + yellow subtotal per SO) ──
      const aoaData: (string | number)[][] = [HEADER];
      const summaryRowIndices: number[] = [];
      let rowPtr = 1; // 0 = header row

      all.results.forEach((s, idx) => {
        const pallets = palletsPerSO[idx];
        let totalW = 0, totalQ = 0;
        pallets.forEach(p => {
          totalW += parseFloat(p.weight);
          totalQ += p.qty;
          aoaData.push([s.so_number, s.vendor_name, s.date, p.pallet_seq, p.licence_number || '', p.payload_number || '', parseFloat(p.weight), p.qty, p.board_qty ?? '', s.total_board_count]);
          rowPtr++;
        });
        // Subtotal row for this SO
        summaryRowIndices.push(rowPtr);
        aoaData.push([s.so_number, '', '', '', '', '', totalW, totalQ, '', '']);
        rowPtr++;
      });

      const ws2 = XLSXStyle.utils.aoa_to_sheet(aoaData) as any;
      ws2['!cols'] = COL_WIDTHS;

      // Apply yellow highlight + bold to every cell in each subtotal row
      const yellow = { fill: { patternType: 'solid', fgColor: { rgb: 'FFFF00' } }, font: { bold: true } };
      summaryRowIndices.forEach(r => {
        COLS.forEach(c => {
          const addr = `${c}${r + 1}`; // aoa row r → Excel row r+1 (1-indexed)
          if (!ws2[addr]) ws2[addr] = { v: '', t: 's' };
          ws2[addr].s = yellow;
        });
      });

      // ── Write workbook ──
      const wb = XLSXStyle.utils.book_new() as any;
      XLSXStyle.utils.book_append_sheet(wb, ws1 as any, 'Sales Orders');
      XLSXStyle.utils.book_append_sheet(wb, ws2, 'Weight Qty Sum');
      const buf = XLSXStyle.write(wb, { type: 'array', bookType: 'xlsx' });
      saveAs(new Blob([buf], { type: 'application/octet-stream' }), `sales-orders-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch { toast('Export failed'); }
  };

  const Th = ({ label, sortKey, align = 'left', w }: {
    label: string; sortKey?: SortKey; align?: 'left' | 'right'; w?: string;
  }) => (
    <th style={{ ...thS, textAlign: align, width: w, cursor: sortKey ? 'pointer' : 'default', userSelect: 'none' }}
      onClick={() => sortKey && toggleSort(sortKey)}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {label}
        {sortKey === sort.key && (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {sort.dir === 'asc'
              ? <polyline points="18 15 12 9 6 15" />
              : <polyline points="6 9 12 15 18 9" />}
          </svg>
        )}
      </span>
    </th>
  );

  return (
    <div className="fade-in" style={{ padding: '24px 28px 40px' }}>
      <Breadcrumbs items={[{ label: 'Home', onClick: () => router.push('/dashboard') }, { label: 'Sales Orders' }]} />

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', margin: '14px 0 20px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 400, letterSpacing: '-0.015em' }}>Sales Orders</h1>
          <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 4 }}>
            <span className="num">{total}</span> records
          </div>
        </div>
        <Button variant="primary" icon={<PlusIcon />} onClick={() => setNewOpen(true)}>New SO</Button>
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <Input value={q} onChange={v => { setQ(v); setPage(1); }}
          placeholder="Filter by SO number or licence…" icon={<SearchIcon />}
          style={{ width: 300 }} />
        <Select value={vendorFilter} onChange={v => { setVendorFilter(v); setPage(1); }}
          placeholder="All vendors"
          options={vendors.map(v => ({ value: String(v.id), label: v.name }))} />
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          border: '1px solid var(--hair-strong)', borderRadius: 3,
          background: 'var(--surface)', padding: '0 10px', height: 30,
        }}>
          <CalendarIcon />
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            style={{ border: 0, outline: 0, background: 'transparent', fontSize: 12, color: 'var(--ink)', width: 110 }} />
          <span style={{ color: 'var(--ink-4)' }}>→</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            style={{ border: 0, outline: 0, background: 'transparent', fontSize: 12, color: 'var(--ink)', width: 110 }} />
        </div>
        {hasFilter && <Button variant="ghost" onClick={clearFilters}>Clear</Button>}
        <div style={{ flex: 1 }} />
        <Button variant="outline" icon={<DownloadIcon />} onClick={handleExport}>Export</Button>
      </div>

      {/* Table */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--hair)', borderRadius: 3 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <thead>
            <tr>
              <Th label="SO Number" sortKey="so_number" w="22%" />
              <Th label="Vendor" w="15%" />
              <Th label="Date" sortKey="date" w="14%" />
              <Th label="Pallets" align="right" w="10%" />
              <Th label="Total Weight (lb)" align="right" w="16%" />
              <Th label="Boards" align="right" w="12%" />
              <Th label="" w="11%" />
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7}><Empty label="Loading…" /></td></tr>
            )}
            {!loading && sos.length === 0 && (
              <tr><td colSpan={7}><Empty label="No matching SOs" sub="Try clearing filters or a different search." /></td></tr>
            )}
            {!loading && sos.map(s => (
              <SORow key={s.id} so={s} onClick={() => router.push(`/sos/${s.id}`)} />
            ))}
          </tbody>
        </table>
        <Pagination page={page} pageCount={pageCount} onChange={setPage} total={total} pageSize={PAGE_SIZE} />
      </div>

      <NewSOModal
        open={newOpen}
        vendors={vendors}
        onClose={() => setNewOpen(false)}
        onCreate={async (data) => {
          try {
            const so = await api.sos.create(data);
            setNewOpen(false);
            toast('SO created');
            router.push(`/sos/${so.id}`);
          } catch { toast('Same SO exists'); }
        }}
      />
    </div>
  );
}

// ─── SO Row ───────────────────────────────────────────────────────
function SORow({ so, onClick }: { so: SO; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <tr onClick={onClick}
      style={{ borderBottom: '1px solid var(--hair)', cursor: 'pointer', background: hover ? 'var(--surface-2)' : 'transparent' }}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <td style={tdS}><span className="mono" style={{ fontSize: 12.5 }}>{so.so_number}</span></td>
      <td style={{ ...tdS, fontSize: 12.5 }}>{so.vendor_name}</td>
      <td style={{ ...tdS, fontSize: 12.5 }} className="num">{so.date}</td>
      <td style={{ ...tdS, textAlign: 'right' }} className="num">{so.total_pallet_count}</td>
      <td style={{ ...tdS, textAlign: 'right' }} className="num">{parseFloat(so.total_pallet_weight).toFixed(2)}</td>
      <td style={{ ...tdS, textAlign: 'right' }} className="num">{so.total_board_count}</td>
      <td style={{ ...tdS, textAlign: 'right', color: 'var(--ink-4)' }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </td>
    </tr>
  );
}

// ─── New SO Modal ──────────────────────────────────────────────────
function NewSOModal({ open, vendors, onClose, onCreate }: {
  open: boolean; vendors: Vendor[];
  onClose: () => void; onCreate: (data: Partial<SO>) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [soNumber, setSoNumber] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [date, setDate] = useState(today);
  const [weightRule, setWeightRule] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (open) {
      setSoNumber(''); setVendorId(''); setDate(today);
      setWeightRule(''); setNote('');
    }
  }, [open]);

  const vendor = vendors.find(v => String(v.id) === vendorId);

  return (
    <Modal open={open} onClose={onClose} title="New Sales Order" width={560}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={!soNumber || !vendorId || !date}
          onClick={() => onCreate({ so_number: soNumber, vendor: +vendorId, date, weight_rule: weightRule, note })}>
          Create
        </Button>
      </>}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label="SO Number">
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <Input value={soNumber} onChange={setSoNumber} placeholder="SO-2026-0001" style={{ flex: 1 }} />
            <button
              type="button"
              title="Generate SO number"
              onClick={() => {
                const now = new Date();
                const hh = String(now.getHours()).padStart(2, '0');
                const mm = String(now.getMinutes()).padStart(2, '0');
                const ss = String(now.getSeconds()).padStart(2, '0');
                setSoNumber(`SO${hh}${mm}${ss}`);
              }}
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 30, height: 30, flexShrink: 0,
                border: '1px solid var(--hair-strong)', borderRadius: 3,
                background: 'var(--surface)', cursor: 'pointer', color: 'var(--ink-3)',
                padding: 0,
              }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--ink)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--ink-3)')}>
              <RefreshIcon />
            </button>
          </div>
        </Field>
        <Field label="Vendor">
          <Select value={vendorId} onChange={setVendorId} placeholder="Select vendor"
            options={vendors.map(v => ({ value: String(v.id), label: v.name }))} />
        </Field>
        <Field label="Date" span={2}><Input value={date} onChange={setDate} type="date" /></Field>
        <Field label="Weight Rule" span={2}>
          <WeightRuleField vendor={vendor ?? null} value={weightRule} onChange={setWeightRule} />
        </Field>
        <Field label="Note" span={2}>
          <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Optional…" rows={2}
            style={{
              width: '100%', padding: '6px 10px', border: '1px solid var(--hair-strong)',
              background: 'var(--surface)', borderRadius: 3, resize: 'vertical',
              fontFamily: 'inherit', fontSize: 13, outline: 'none', color: 'var(--ink)',
            }} />
        </Field>
      </div>
    </Modal>
  );
}

// ─── Inline icons ──────────────────────────────────────────────────
const PlusIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);
const SearchIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);
const DownloadIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);
const RefreshIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 4 23 10 17 10" />
    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
  </svg>
);
const CalendarIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);
