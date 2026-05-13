'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Button, Modal, Breadcrumbs, Input, Empty,
  Field, useToast, thS, tdS, ghostBtn,
} from '@/app/ui/components';
import { api } from '@/app/lib/api';
import type { ChipBrand } from '@/interface/IDatatable';

export default function ChipBrandsPage() {
  const router = useRouter();
  const toast = useToast();
  const [brands, setBrands] = useState<ChipBrand[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ChipBrand | null>(null);
  const [name, setName] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await api.chipBrands.list();
      setBrands(data);
    } catch { toast('Failed to load chip brands'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setEditing(null); setName(''); setModalOpen(true); };
  const openEdit = (cb: ChipBrand) => { setEditing(cb); setName(cb.name); setModalOpen(true); };

  const handleSave = async () => {
    try {
      if (editing) {
        const updated = await api.chipBrands.update(editing.id, { name });
        setBrands(bs => bs.map(b => b.id === editing.id ? updated : b));
        toast('Brand updated');
      } else {
        const created = await api.chipBrands.create({ name });
        setBrands(bs => [...bs, created]);
        toast('Brand created');
      }
      setModalOpen(false);
    } catch { toast(editing ? 'Failed to update brand' : 'Failed to create brand'); }
  };

  const handleDelete = async (cb: ChipBrand) => {
    if (!confirm(`Delete chip brand "${cb.name}"?`)) return;
    try {
      await api.chipBrands.delete(cb.id);
      setBrands(bs => bs.filter(b => b.id !== cb.id));
      toast('Brand removed');
    } catch { toast('Failed to delete brand'); }
  };

  return (
    <div className="fade-in page-pad">
      <Breadcrumbs items={[
        { label: 'Home', onClick: () => router.push('/dashboard') },
        { label: 'Chip Brands' },
      ]} />

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', margin: '14px 0 20px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 400, letterSpacing: '-0.015em' }}>Chip Brands</h1>
          <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 4 }}>
            Dictionary used when recording chips on boards.
          </div>
        </div>
        <Button variant="primary" icon={<PlusIcon />} onClick={openNew}>New brand</Button>
      </div>

      <div style={{ border: '1px solid var(--hair)', borderRadius: 3, background: 'var(--surface)' }}>
        <div className="table-scroll">
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thS}>Brand</th>
              <th style={{ ...thS, textAlign: 'right' }}>Chips recorded</th>
              <th style={{ ...thS, width: 140, textAlign: 'right' }}></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={3}><Empty label="Loading…" /></td></tr>
            )}
            {!loading && brands.length === 0 && (
              <tr><td colSpan={3}><Empty label="No chip brands yet" sub="Click 'New brand' to add one." /></td></tr>
            )}
            {!loading && brands.map(cb => (
              <tr key={cb.id} style={{ borderBottom: '1px solid var(--hair)' }}>
                <td style={{ ...tdS, fontSize: 13 }}>{cb.name}</td>
                <td style={{ ...tdS, textAlign: 'right' }} className="num">{(cb as any).chip_count ?? 0}</td>
                <td style={{ ...tdS, textAlign: 'right' }}>
                  <div style={{ display: 'inline-flex', gap: 4 }}>
                    <button onClick={() => openEdit(cb)} style={iconBtn} title="Edit"><EditIcon /></button>
                    <button onClick={() => handleDelete(cb)} style={{ ...iconBtn, color: 'var(--err)' }} title="Delete"><TrashIcon /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)}
        title={editing ? `Edit ${editing.name}` : 'New chip brand'} width={420}
        footer={<>
          <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button>
          <Button variant="primary" disabled={!name} onClick={handleSave}>{editing ? 'Save' : 'Create'}</Button>
        </>}>
        <Field label="Brand name">
          <Input value={name} onChange={setName} placeholder="e.g. Samsung" autoFocus />
        </Field>
      </Modal>
    </div>
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
