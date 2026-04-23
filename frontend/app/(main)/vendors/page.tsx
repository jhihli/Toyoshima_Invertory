'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Button, Modal, Breadcrumbs, Badge, Select, Input, Empty,
  Field, useToast, thS, tdS, ghostBtn,
} from '@/app/ui/components';
import { api } from '@/app/lib/api';
import type { Vendor } from '@/interface/IDatatable';

export default function VendorsPage() {
  const router = useRouter();
  const toast = useToast();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Vendor | null>(null);
  const [name, setName] = useState('');
  const [rule, setRule] = useState<'per_pallet' | 'aggregated'>('per_pallet');

  const load = useCallback(async () => {
    try {
      const data = await api.vendors.list();
      setVendors(data);
    } catch { toast('Failed to load vendors'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setEditing(null); setName(''); setRule('per_pallet'); setModalOpen(true); };
  const openEdit = (v: Vendor) => { setEditing(v); setName(v.name); setRule(v.default_weight_rule); setModalOpen(true); };

  const handleSave = async () => {
    try {
      if (editing) {
        const updated = await api.vendors.update(editing.id, { name, default_weight_rule: rule });
        setVendors(vs => vs.map(v => v.id === editing.id ? updated : v));
        toast('Vendor updated');
      } else {
        const created = await api.vendors.create({ name, default_weight_rule: rule });
        setVendors(vs => [...vs, created]);
        toast('Vendor created');
      }
      setModalOpen(false);
    } catch { toast(editing ? 'Failed to update vendor' : 'Failed to create vendor'); }
  };

  const handleDelete = async (v: Vendor) => {
    if (!confirm(`Delete vendor "${v.name}"? This cannot be undone.`)) return;
    try {
      await api.vendors.delete(v.id);
      setVendors(vs => vs.filter(x => x.id !== v.id));
      toast('Vendor removed');
    } catch { toast('Failed to delete vendor'); }
  };

  return (
    <div className="fade-in" style={{ padding: '24px 28px 40px' }}>
      <Breadcrumbs items={[
        { label: 'Home', onClick: () => router.push('/dashboard') },
        { label: 'Vendors' },
      ]} />

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', margin: '14px 0 20px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 400, letterSpacing: '-0.015em' }}>Vendors</h1>
          <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 4 }}>
            <span className="num">{vendors.length}</span> suppliers configured
          </div>
        </div>
        <Button variant="primary" icon={<PlusIcon />} onClick={openNew}>New vendor</Button>
      </div>

      <div style={{ border: '1px solid var(--hair)', borderRadius: 3, background: 'var(--surface)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thS}>Name</th>
              <th style={thS}>Default Weight Rule</th>
              <th style={{ ...thS, textAlign: 'right' }}>SO Count</th>
              <th style={{ ...thS, width: 140, textAlign: 'right' }}></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={4}><Empty label="Loading…" /></td></tr>
            )}
            {!loading && vendors.length === 0 && (
              <tr><td colSpan={4}><Empty label="No vendors yet" sub="Click 'New vendor' to add one." /></td></tr>
            )}
            {!loading && vendors.map(v => (
              <tr key={v.id} style={{ borderBottom: '1px solid var(--hair)' }}>
                <td style={{ ...tdS, fontSize: 13 }}>{v.name}</td>
                <td style={tdS}>
                  <Badge tone="neutral">
                    {v.default_weight_rule === 'per_pallet' ? 'Per Pallet' : 'Aggregated'}
                  </Badge>
                </td>
                <td style={{ ...tdS, textAlign: 'right' }} className="num">{(v as any).so_count ?? 0}</td>
                <td style={{ ...tdS, textAlign: 'right' }}>
                  <button onClick={() => openEdit(v)} style={ghostBtn}>Edit</button>
                  <button onClick={() => handleDelete(v)} style={{ ...ghostBtn, color: 'var(--err)' }}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)}
        title={editing ? `Edit ${editing.name}` : 'New vendor'} width={440}
        footer={<>
          <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button>
          <Button variant="primary" disabled={!name} onClick={handleSave}>{editing ? 'Save' : 'Create'}</Button>
        </>}>
        <div style={{ display: 'grid', gap: 14 }}>
          <Field label="Vendor name">
            <Input value={name} onChange={setName} placeholder="e.g. MSFT" autoFocus />
          </Field>
          <Field label="Default weight rule">
            <Select value={rule} onChange={v => setRule(v as 'per_pallet' | 'aggregated')} options={[
              { value: 'per_pallet', label: 'Per Pallet  —  record each pallet separately' },
              { value: 'aggregated', label: 'Aggregated  —  record total weight + qty' },
            ]} />
          </Field>
          <div style={{
            fontSize: 11.5, color: 'var(--ink-3)', lineHeight: 1.5,
            padding: '10px 12px', background: 'var(--surface-2)', borderRadius: 3,
            border: '1px solid var(--hair)',
          }}>
            The weight rule determines how pallet data is entered on the SO Detail page.
            Per-pallet shows a table of individual pallets; aggregated shows a single total row.
          </div>
        </div>
      </Modal>
    </div>
  );
}

const PlusIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);
