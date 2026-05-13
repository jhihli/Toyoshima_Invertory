'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import * as XLSX from 'xlsx-js-style';
import {
  Button, Modal, Breadcrumbs, Input, Empty,
  Field, useToast, thS, tdS, ghostBtn,
} from '@/app/ui/components';
import { api } from '@/app/lib/api';
import type { MPN, MPNReportConfig, MPNReportStatus } from '@/interface/IDatatable';

export default function MPNsPage() {
  const router = useRouter();
  const toast = useToast();
  const [mpns, setMpns] = useState<MPN[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMpn, setModalMpn] = useState<MPN | null>(null);
  const [exporting, setExporting] = useState(false);

  const [reportStatus, setReportStatus] = useState<MPNReportStatus | null>(null);
  const [reportConfig, setReportConfig] = useState<MPNReportConfig | null>(null);
  const [reportLoading, setReportLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);

  // Text fields
  const [name, setName] = useState('');
  const [partType, setPartType] = useState('');
  const [beforecutQty, setBeforecutQty] = useState('');
  const [aftercutQty, setAftercutQty] = useState('');
  const [chipQty, setChipQty] = useState('');
  const [note, setNote] = useState('');

  // Local pending files (create mode only — uploaded atomically on "Create")
  const [beforecutFile, setBeforecutFile] = useState<File | null>(null);
  const [aftercutFile, setAftercutFile] = useState<File | null>(null);
  const [beforecutPreview, setBeforecutPreview] = useState<string | null>(null);
  const [aftercutPreview, setAftercutPreview] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [mpnData, statusData, configData] = await Promise.all([
        api.mpns.list(),
        api.mpnReport.lastSend(),
        api.mpnReport.getConfig(),
      ]);
      setMpns(mpnData);
      setReportStatus(statusData.record);
      setReportConfig(configData);
    } catch { toast('Failed to load MPNs'); }
    finally { setLoading(false); setReportLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const revokeLocalPreviews = () => {
    if (beforecutPreview) URL.revokeObjectURL(beforecutPreview);
    if (aftercutPreview) URL.revokeObjectURL(aftercutPreview);
  };


  const openNew = () => {
    setModalMpn(null);
    setName(''); setPartType(''); setBeforecutQty(''); setAftercutQty(''); setChipQty(''); setNote('');
    setBeforecutFile(null); setAftercutFile(null);
    setBeforecutPreview(null); setAftercutPreview(null);
    setModalOpen(true);
  };

  const openEdit = (m: MPN) => {
    setModalMpn(m);
    setName(m.name);
    setPartType(m.part_type ?? '');
    setBeforecutQty(m.beforecut_weight != null ? String(m.beforecut_weight) : '');
    setAftercutQty(m.aftercut_weight != null ? String(m.aftercut_weight) : '');
    setChipQty(m.chip_qty != null ? String(m.chip_qty) : '');
    setNote(m.note ?? '');
    setBeforecutFile(null); setAftercutFile(null);
    setBeforecutPreview(null); setAftercutPreview(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    revokeLocalPreviews();
    setModalOpen(false);
    setModalMpn(null);
  };

  // Create-mode: stage file locally and show preview
  const selectBeforecutFile = (file: File) => {
    if (beforecutPreview) URL.revokeObjectURL(beforecutPreview);
    setBeforecutFile(file);
    setBeforecutPreview(URL.createObjectURL(file));
  };
  const clearBeforecutFile = () => {
    if (beforecutPreview) URL.revokeObjectURL(beforecutPreview);
    setBeforecutFile(null); setBeforecutPreview(null);
  };
  const selectAftercutFile = (file: File) => {
    if (aftercutPreview) URL.revokeObjectURL(aftercutPreview);
    setAftercutFile(file);
    setAftercutPreview(URL.createObjectURL(file));
  };
  const clearAftercutFile = () => {
    if (aftercutPreview) URL.revokeObjectURL(aftercutPreview);
    setAftercutFile(null); setAftercutPreview(null);
  };

  const handleSave = async () => {
    const payload: Partial<MPN> = {
      name, part_type: partType,
      beforecut_weight: beforecutQty !== '' ? +beforecutQty : null,
      aftercut_weight: aftercutQty !== '' ? +aftercutQty : null,
      chip_qty: chipQty !== '' ? +chipQty : null,
      note,
    };
    try {
      if (modalMpn) {
        // Edit — save text fields only (photos handled inline via immediate upload)
        const updated = await api.mpns.update(modalMpn.id, payload);
        setMpns(ms => ms.map(m => m.id === modalMpn.id ? { ...m, ...updated } : m));
        toast('MPN updated');
        closeModal();
      } else {
        // Create — create MPN then upload any staged photos atomically
        let latest = await api.mpns.create(payload);
        if (beforecutFile) latest = await api.mpns.photos.uploadBeforecut(latest.id, beforecutFile);
        if (aftercutFile) latest = await api.mpns.photos.uploadAftercut(latest.id, aftercutFile);
        setMpns(ms => [...ms, latest]);
        toast('MPN created');
        closeModal();
      }
    } catch { toast(modalMpn ? 'Failed to update MPN' : 'Failed to create MPN'); }
  };

  // Edit-mode: immediate upload/delete
  const handlePhotoUpload = async (type: 'before' | 'after', file: File) => {
    if (!modalMpn) return;
    try {
      const updated = type === 'before'
        ? await api.mpns.photos.uploadBeforecut(modalMpn.id, file)
        : await api.mpns.photos.uploadAftercut(modalMpn.id, file);
      const patch = { beforecut_photo_url: updated.beforecut_photo_url, aftercut_photo_url: updated.aftercut_photo_url };
      setMpns(ms => ms.map(m => m.id === modalMpn.id ? { ...m, ...patch } : m));
      setModalMpn(prev => prev ? { ...prev, ...patch } : prev);
      toast('Photo uploaded');
    } catch { toast('Failed to upload photo'); }
  };

  const handlePhotoDelete = async (type: 'before' | 'after') => {
    if (!modalMpn) return;
    try {
      const key = type === 'before' ? 'beforecut_photo_url' : 'aftercut_photo_url';
      if (type === 'before') await api.mpns.photos.deleteBeforecut(modalMpn.id);
      else await api.mpns.photos.deleteAftercut(modalMpn.id);
      setMpns(ms => ms.map(m => m.id === modalMpn.id ? { ...m, [key]: null } : m));
      setModalMpn(prev => prev ? { ...prev, [key]: null } : prev);
      toast('Photo deleted');
    } catch { toast('Failed to delete photo'); }
  };

  const handleDelete = async (m: MPN) => {
    const bc = m.board_count ?? 0;
    if (bc > 0) {
      toast(`Cannot delete — ${bc} board${bc !== 1 ? 's are' : ' is'} still using this MPN. Reassign them first.`);
      return;
    }
    if (!confirm(`Delete MPN "${m.name}"? This cannot be undone.`)) return;
    try {
      await api.mpns.delete(m.id);
      setMpns(ms => ms.filter(x => x.id !== m.id));
      toast('MPN deleted');
    } catch (err: any) {
      const msg = err?.message ?? '';
      toast(msg.includes('Cannot delete') ? msg : 'Failed to delete MPN');
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const details = await Promise.all(mpns.map(m => api.mpns.get(m.id)));

      const aoa: any[][] = [[
        'MPN', 'Date Processed', 'Chip MPN', 'Chips Failed',
        'Failure Rate (BOARDS Scanned / Chips Failed)',
        'BOARDS (Scanned)', 'CUTBOARD COST', 'CHIP COST',
      ]];

      for (const mpn of details) {
        const chips = mpn.chips ?? [];
        const totalChipQty = chips.reduce((s, c) => s + c.qty, 0);
        const chipCost = mpn.cutboard_cost != null && totalChipQty > 0
          ? parseFloat((Number(mpn.cutboard_cost) / totalChipQty).toFixed(4))
          : null;
        const boardCount = mpn.board_count ?? 0;

        if (chips.length === 0) {
          aoa.push([mpn.name, mpn.latest_board_date ?? '', '', '', null, boardCount, mpn.cutboard_cost ?? '', '']);
        } else {
          for (const chip of chips) {
            const failureRate = (chip.cut_fail != null && chip.cut_fail > 0 && boardCount > 0)
              ? chip.cut_fail / boardCount
              : 0;
            aoa.push([
              mpn.name,
              mpn.latest_board_date ?? '',
              chip.chip_mpn || '',
              chip.cut_fail ?? 0,
              failureRate,
              boardCount,
              mpn.cutboard_cost ?? '',
              chipCost ?? '',
            ]);
          }
        }
      }

      const ws = XLSX.utils.aoa_to_sheet(aoa);
      const range = XLSX.utils.decode_range(ws['!ref']!);
      // Apply left alignment to all cells; format failure rate (col E) as percentage
      for (let r = range.s.r; r <= range.e.r; r++) {
        for (let c = range.s.c; c <= range.e.c; c++) {
          const cellAddr = XLSX.utils.encode_cell({ r, c });
          if (!ws[cellAddr]) continue;
          const cell = ws[cellAddr];
          cell.s = { ...(cell.s ?? {}), alignment: { horizontal: 'left' } };
          if (c === 4 && r > 0 && cell.v != null) {
            cell.t = 'n';
            cell.z = '0.00%';
          }
        }
      }
      // Set column widths
      ws['!cols'] = [{ wch: 20 }, { wch: 14 }, { wch: 22 }, { wch: 12 }, { wch: 38 }, { wch: 16 }, { wch: 14 }, { wch: 12 }];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'MPN Export');
      XLSX.writeFile(wb, `mpn_export_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch { toast('Export failed'); }
    finally { setExporting(false); }
  };

  const handleSendNow = async () => {
    setSending(true);
    try {
      const record = await api.mpnReport.sendNow();
      setReportStatus(record);
      toast(record.status === 'ok' ? 'Report sent successfully' : 'Send failed — check status for details');
    } catch { toast('Failed to send report'); }
    finally { setSending(false); }
  };

  const handleSaveConfig = async (cfg: Partial<MPNReportConfig>) => {
    try {
      const updated = await api.mpnReport.saveConfig(cfg);
      setReportConfig(updated);
      toast('Settings saved');
    } catch { toast('Failed to save settings'); }
  };

  const filtered = search.trim()
    ? mpns.filter(m =>
        m.name.toLowerCase().includes(search.toLowerCase()) ||
        (m.part_type ?? '').toLowerCase().includes(search.toLowerCase()))
    : mpns;

  return (
    <div className="fade-in page-pad">
      <Breadcrumbs items={[
        { label: 'Home', onClick: () => router.push('/dashboard') },
        { label: 'MPNs' },
      ]} />

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', margin: '14px 0 20px', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 400, letterSpacing: '-0.015em' }}>MPNs</h1>
          <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 4 }}>
            <span className="num">{mpns.length}</span> part numbers
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Input value={search} onChange={setSearch} placeholder="Search name or part type…" />

          {/* Report email status bar */}
          {!reportLoading && (
            <>
              <ReportStatusBadge record={reportStatus} />
              <Button variant="outline" onClick={handleSendNow} disabled={sending}>
                {sending ? 'Sending…' : 'Send Now'}
              </Button>
              <button
                onClick={() => setConfigOpen(true)}
                title="Email report settings"
                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, background: 'transparent', border: '1px solid var(--hair)', borderRadius: 4, cursor: 'pointer', color: 'var(--ink-3)', flexShrink: 0 }}
              >
                <GearIcon />
              </button>
              <div style={{ width: 1, height: 20, background: 'var(--hair)', flexShrink: 0 }} />
            </>
          )}

          <Button variant="outline" icon={<DownloadIcon />} onClick={handleExport} disabled={exporting || mpns.length === 0}>
            {exporting ? 'Exporting…' : 'Export'}
          </Button>
          <Button variant="primary" icon={<PlusIcon />} onClick={openNew}>New MPN</Button>
        </div>
      </div>

      <div style={{ border: '1px solid var(--hair)', borderRadius: 3, background: 'var(--surface)' }}>
        <div className="table-scroll">
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '20%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '6%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '9%' }} />
              <col />
              <col style={{ width: 110 }} />
            </colgroup>
            <thead>
              <tr>
                <th style={thS}>Name</th>
                <th style={thS}>Part Type</th>
                <th style={{ ...thS, textAlign: 'right' }}>Beforecut Weight</th>
                <th style={{ ...thS, textAlign: 'right' }}>Aftercut Weight</th>
                <th style={{ ...thS, textAlign: 'right' }}>Chips</th>
                <th style={{ ...thS, textAlign: 'right' }}>Boards (Scanned)</th>
                <th style={thS}>Created</th>
                <th style={thS}>Note</th>
                <th style={{ ...thS, textAlign: 'right' }}></th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={9}><Empty label="Loading…" /></td></tr>}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={9}>
                  <Empty
                    label={search ? 'No matching MPNs' : 'No MPNs yet'}
                    sub={search ? 'Try a different search.' : "Click 'New MPN' to add one."}
                  />
                </td></tr>
              )}
              {!loading && filtered.map(m => {
                const bc = m.board_count ?? 0;
                return (
                  <tr key={m.id} style={{ borderBottom: '1px solid var(--hair)' }}>
                    <td style={{ ...tdS }}>
                      <button
                        onClick={() => router.push(`/mpns/${m.id}`)}
                        className="mono"
                        style={{
                          background: '#ddeef8', border: '1px solid #afd2ea', borderRadius: 3,
                          cursor: 'pointer', padding: '2px 8px', fontSize: 12,
                          color: '#1a5f8b', fontFamily: 'inherit', letterSpacing: '0.02em',
                          lineHeight: 1.6, whiteSpace: 'nowrap',
                        }}
                      >
                        {m.name}
                      </button>
                    </td>
                    <td style={{ ...tdS, fontSize: 12, color: 'var(--ink-3)' }}>{m.part_type || '—'}</td>
                    <td style={{ ...tdS, textAlign: 'right' }} className="num">{m.beforecut_weight ?? '—'}</td>
                    <td style={{ ...tdS, textAlign: 'right' }} className="num">{m.aftercut_weight ?? '—'}</td>
                    <td style={{ ...tdS, textAlign: 'right' }} className="num">{m.chip_qty ?? '—'}</td>
                    <td style={{ ...tdS, textAlign: 'right' }}>
                      <span className="num" style={{ color: bc > 0 ? 'var(--ink)' : 'var(--ink-4)' }}>{bc}</span>
                    </td>
                    <td style={{ ...tdS, fontSize: 12, color: 'var(--ink-3)' }}>{m.created_at?.slice(0, 10) || '—'}</td>
                    <td style={{ ...tdS, fontSize: 12, color: 'var(--ink-3)', maxWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: m.note ? 600 : 400 }}
                      title={m.note || undefined}>
                      {m.note || <span style={{ color: 'var(--ink-5)', fontWeight: 400 }}>—</span>}
                    </td>
                    <td style={{ ...tdS, textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 4 }}>
                        <button onClick={() => openEdit(m)} style={iconBtn} title="Edit"><EditIcon /></button>
                        <button
                          onClick={() => handleDelete(m)}
                          style={{ ...iconBtn, color: bc > 0 ? 'var(--ink-4)' : 'var(--err)' }}
                          title={bc > 0 ? `${bc} board${bc !== 1 ? 's' : ''} using this MPN` : 'Delete'}
                        ><TrashIcon /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {configOpen && reportConfig && (
        <EmailConfigModal
          config={reportConfig}
          onClose={() => setConfigOpen(false)}
          onSave={handleSaveConfig}
        />
      )}

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={modalMpn ? `Edit ${modalMpn.name}` : 'New MPN'}
        width={560}
        footer={<>
          <Button variant="ghost" onClick={closeModal}>Cancel</Button>
          <Button variant="primary" disabled={!name} onClick={handleSave}>{modalMpn ? 'Save' : 'Create'}</Button>
        </>}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label="Name" span={2}>
            <Input value={name} onChange={setName} placeholder="e.g. BS123" autoFocus />
          </Field>
          <Field label="Part Type" span={2}>
            <Input value={partType} onChange={setPartType} placeholder="e.g. IC" />
          </Field>
          <Field label="Before Cut Wt">
            <Input value={beforecutQty} onChange={setBeforecutQty} type="number" placeholder="—" />
          </Field>
          <Field label="After Cut Wt">
            <Input value={aftercutQty} onChange={setAftercutQty} type="number" placeholder="—" />
          </Field>
          <Field label="Chip Qty" span={2}>
            <Input value={chipQty} onChange={setChipQty} type="number" placeholder="—" />
          </Field>
          <Field label="Note" span={2}>
            <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Optional notes…" rows={3}
              style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', padding: '6px 10px', fontSize: 13, fontFamily: 'inherit', border: '1px solid var(--hair)', borderRadius: 4, background: 'var(--surface)', color: 'var(--ink)', outline: 'none', lineHeight: 1.5 }} />
          </Field>

          {/* Photos */}
          <div style={{ gridColumn: 'span 2', borderTop: '1px solid var(--hair)', paddingTop: 14 }}>
            <div style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 10 }}>
              Photos
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {modalMpn ? (
                // Edit mode: immediate upload/delete against the server
                <>
                  <PhotoCard
                    label="Before Cut"
                    displayUrl={modalMpn.beforecut_photo_url ?? null}
                    onFileChange={f => handlePhotoUpload('before', f)}
                    onDelete={() => handlePhotoDelete('before')}
                  />
                  <PhotoCard
                    label="After Cut"
                    displayUrl={modalMpn.aftercut_photo_url ?? null}
                    onFileChange={f => handlePhotoUpload('after', f)}
                    onDelete={() => handlePhotoDelete('after')}
                  />
                </>
              ) : (
                // Create mode: stage locally, upload atomically on "Create"
                <>
                  <PhotoCard
                    label="Before Cut"
                    displayUrl={beforecutPreview}
                    onFileChange={selectBeforecutFile}
                    onDelete={clearBeforecutFile}
                  />
                  <PhotoCard
                    label="After Cut"
                    displayUrl={aftercutPreview}
                    onFileChange={selectAftercutFile}
                    onDelete={clearAftercutFile}
                  />
                </>
              )}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function PhotoCard({ label, displayUrl, onFileChange, onDelete }: {
  label: string;
  displayUrl: string | null;
  onFileChange: (file: File) => void;
  onDelete: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const pickFile = (file: File) => {
    if (file.type.startsWith('image/')) onFileChange(file);
  };

  return (
    <div style={{ border: '1px solid var(--hair)', borderRadius: 6, background: 'var(--surface)', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '6px 10px 6px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--hair)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: displayUrl ? '#4caf50' : 'var(--hair)', flexShrink: 0 }} />
          <span style={{ fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-3)', fontWeight: 500 }}>
            {label}
          </span>
        </div>
        {displayUrl && (
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              onClick={() => inputRef.current?.click()}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'transparent', border: '1px solid var(--hair)', borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: 11.5, color: 'var(--ink-2)', fontFamily: 'inherit', lineHeight: 1 }}
            >
              <IconRefresh /> Replace
            </button>
            <button
              onClick={onDelete}
              title="Remove"
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, background: 'transparent', border: '1px solid var(--hair)', borderRadius: 4, cursor: 'pointer', fontSize: 16, color: 'var(--ink-3)', fontFamily: 'inherit', lineHeight: 1 }}
            >
              ×
            </button>
          </div>
        )}
      </div>

      {/* Body */}
      {displayUrl ? (
        <div style={{ background: 'var(--surface-2)' }}>
          <img
            src={displayUrl}
            alt={label}
            style={{ width: '100%', height: 200, objectFit: 'cover', display: 'block' }}
          /></div>
      ) : (
        <div
          style={{ minHeight: 168, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: '24px 16px', textAlign: 'center', background: dragOver ? 'var(--surface-2)' : 'transparent', transition: 'background .12s', outline: dragOver ? '2px dashed var(--accent)' : '2px dashed transparent', outlineOffset: -2 }}
          onClick={() => inputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) pickFile(f); }}
        >
          <div style={{ width: 52, height: 52, borderRadius: '50%', border: '2px dashed var(--hair)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12, color: 'var(--ink-4)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </div>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink-2)', marginBottom: 5 }}>Add photo</div>
          <div style={{ fontSize: 11.5, color: 'var(--ink-4)', lineHeight: 1.8 }}>JPG, PNG · max 10MB</div>
          <div style={{ fontSize: 11.5, color: 'var(--ink-4)' }}>or drag &amp; drop</div>
        </div>
      )}

      <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) onFileChange(f); e.target.value = ''; }} />
    </div>
  );
}

function IconRefresh() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 .49-3.46" />
    </svg>
  );
}

const iconBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 28, height: 28, background: 'transparent', border: '1px solid var(--hair)',
  borderRadius: 4, cursor: 'pointer', color: 'var(--ink-3)', padding: 0,
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

const PlusIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const DownloadIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const GearIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

function formatSentAt(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    + ', ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function ReportStatusBadge({ record }: { record: MPNReportStatus | null }) {
  if (!record) {
    return (
      <span style={{ fontSize: 12, color: 'var(--ink-4)', whiteSpace: 'nowrap' }}>Never sent</span>
    );
  }
  const ok = record.status === 'ok';
  return (
    <span
      title={ok ? `Sent to ${record.sent_to}` : record.error}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        fontSize: 12, whiteSpace: 'nowrap',
        color: ok ? '#2e7d32' : '#c62828',
        cursor: ok ? 'default' : 'help',
      }}
    >
      <span style={{
        width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
        background: ok ? '#4caf50' : '#e53935',
      }} />
      {ok ? 'Sent' : 'Failed'} {formatSentAt(record.sent_at)}
    </span>
  );
}

function EmailTagInput({ tags, onChange, placeholder }: {
  tags: string[]; onChange: (v: string[]) => void; placeholder?: string;
}) {
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const commit = () => {
    const val = draft.trim();
    if (val && !tags.includes(val)) onChange([...tags, val]);
    setDraft('');
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit(); }
    if (e.key === 'Backspace' && draft === '' && tags.length > 0)
      onChange(tags.slice(0, -1));
  };

  return (
    <div
      onClick={() => inputRef.current?.focus()}
      style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '6px 8px', border: '1px solid var(--hair)', borderRadius: 4, background: 'var(--surface)', cursor: 'text', minHeight: 38 }}
    >
      {tags.map((tag, i) => (
        <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--accent-tint)', border: '1px solid #afd2ea', borderRadius: 3, padding: '2px 6px', fontSize: 12, color: '#1a5f8b' }}>
          {tag}
          <button onClick={e => { e.stopPropagation(); onChange(tags.filter((_, idx) => idx !== i)); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5a9cbf', padding: 0, display: 'inline-flex', lineHeight: 1, fontSize: 14 }}>×</button>
        </span>
      ))}
      <input
        ref={inputRef}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={commit}
        placeholder={tags.length === 0 ? placeholder : ''}
        style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: 'var(--ink)', fontFamily: 'inherit', minWidth: 160, flex: 1, padding: '2px 0' }}
      />
    </div>
  );
}

function EmailConfigModal({ config, onClose, onSave }: {
  config: MPNReportConfig;
  onClose: () => void;
  onSave: (d: Partial<MPNReportConfig>) => Promise<void>;
}) {
  const splitEmails = (s: string) => s.split(',').map(e => e.trim()).filter(Boolean);
  const [recipients, setRecipients] = useState<string[]>(() => splitEmails(config.recipient));
  const [ccs, setCcs] = useState<string[]>(() => splitEmails(config.cc));
  const [autoSend, setAutoSend] = useState(config.auto_send_enabled);
  const [sendTime, setSendTime] = useState(config.send_time?.slice(0, 5) ?? '19:00');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({ recipient: recipients.join(','), cc: ccs.join(','), auto_send_enabled: autoSend, send_time: sendTime });
      onClose();
    } finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} title="Email Report Settings" width={480}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
      </>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

        {/* Recipients */}
        <div style={{ padding: '4px 0 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>To</span>
            <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--ink-5)' }}>Press Enter or comma to add</span>
          </div>
          <EmailTagInput tags={recipients} onChange={setRecipients} placeholder="recipient@example.com" />
        </div>

        <div style={{ height: 1, background: 'var(--hair)', margin: '0 0 16px' }} />

        {/* CC */}
        <div style={{ paddingBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>CC</span>
            <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--ink-5)' }}>Optional</span>
          </div>
          <EmailTagInput tags={ccs} onChange={setCcs} placeholder="cc@example.com" />
        </div>

        <div style={{ height: 1, background: 'var(--hair)', margin: '0 0 16px' }} />

        {/* Schedule */}
        <div>
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-3)', display: 'block', marginBottom: 12 }}>Schedule</span>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', border: '1px solid var(--hair)', borderRadius: 6, background: 'var(--surface)' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)', marginBottom: 2 }}>Auto-send daily</div>
              <div style={{ fontSize: 12, color: 'var(--ink-4)' }}>{autoSend ? `Sends at ${sendTime} every day` : 'Disabled — use Send Now to send manually'}</div>
            </div>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
              <div style={{ position: 'relative', width: 36, height: 20 }}>
                <input type="checkbox" checked={autoSend} onChange={e => setAutoSend(e.target.checked)}
                  style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }} />
                <div style={{ position: 'absolute', inset: 0, borderRadius: 20, background: autoSend ? 'var(--accent)' : 'var(--hair)', transition: 'background .2s', cursor: 'pointer' }}
                  onClick={() => setAutoSend(v => !v)} />
                <div style={{ position: 'absolute', top: 3, left: autoSend ? 19 : 3, width: 14, height: 14, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left .2s', pointerEvents: 'none' }} />
              </div>
            </label>
          </div>
          {autoSend && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, padding: '10px 14px', border: '1px solid var(--hair)', borderRadius: 6, background: 'var(--surface)' }}>
              <span style={{ fontSize: 13, color: 'var(--ink-2)', flex: 1 }}>Send time</span>
              <input type="time" value={sendTime} onChange={e => setSendTime(e.target.value)}
                style={{ height: 30, padding: '0 8px', fontSize: 13, fontFamily: 'inherit', border: '1px solid var(--hair)', borderRadius: 4, background: 'var(--surface)', color: 'var(--ink)', outline: 'none', cursor: 'pointer' }} />
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
