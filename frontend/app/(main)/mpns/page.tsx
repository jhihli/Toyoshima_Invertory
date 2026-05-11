'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Button, Modal, Breadcrumbs, Input, Empty,
  Field, useToast, thS, tdS, ghostBtn,
} from '@/app/ui/components';
import { api } from '@/app/lib/api';
import type { MPN } from '@/interface/IDatatable';

export default function MPNsPage() {
  const router = useRouter();
  const toast = useToast();
  const [mpns, setMpns] = useState<MPN[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMpn, setModalMpn] = useState<MPN | null>(null); // null = create mode

  // Text fields
  const [name, setName] = useState('');
  const [partType, setPartType] = useState('');
  const [beforecutQty, setBeforecutQty] = useState('');
  const [aftercutQty, setAftercutQty] = useState('');
  const [chipQty, setChipQty] = useState('');

  // Local pending files (create mode only — uploaded atomically on "Create")
  const [beforecutFile, setBeforecutFile] = useState<File | null>(null);
  const [aftercutFile, setAftercutFile] = useState<File | null>(null);
  const [beforecutPreview, setBeforecutPreview] = useState<string | null>(null);
  const [aftercutPreview, setAftercutPreview] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setMpns(await api.mpns.list()); }
    catch { toast('Failed to load MPNs'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const revokeLocalPreviews = () => {
    if (beforecutPreview) URL.revokeObjectURL(beforecutPreview);
    if (aftercutPreview) URL.revokeObjectURL(aftercutPreview);
  };


  const openNew = () => {
    setModalMpn(null);
    setName(''); setPartType(''); setBeforecutQty(''); setAftercutQty(''); setChipQty('');
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
          <Button variant="primary" icon={<PlusIcon />} onClick={openNew}>New MPN</Button>
        </div>
      </div>

      <div style={{ border: '1px solid var(--hair)', borderRadius: 3, background: 'var(--surface)' }}>
        <div className="table-scroll">
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '26%' }} />
              <col style={{ width: '13%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '11%' }} />
              <col style={{ width: 110 }} />
            </colgroup>
            <thead>
              <tr>
                <th style={thS}>Name</th>
                <th style={thS}>Part Type</th>
                <th style={{ ...thS, textAlign: 'right' }}>Beforecut Weight</th>
                <th style={{ ...thS, textAlign: 'right' }}>Aftercut Weight</th>
                <th style={{ ...thS, textAlign: 'right' }}>Chips</th>
                <th style={{ ...thS, textAlign: 'right' }}>Boards</th>
                <th style={thS}>Created</th>
                <th style={{ ...thS, textAlign: 'right' }}></th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={8}><Empty label="Loading…" /></td></tr>}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={8}>
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
                    <td style={{ ...tdS, textAlign: 'right' }}>
                      <button onClick={() => openEdit(m)} style={ghostBtn}>Edit</button>
                      <button
                        onClick={() => handleDelete(m)}
                        style={{ ...ghostBtn, color: bc > 0 ? 'var(--ink-4)' : 'var(--err)' }}
                        title={bc > 0 ? `${bc} board${bc !== 1 ? 's' : ''} using this MPN` : 'Delete'}
                      >Delete</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

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

const PlusIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);
