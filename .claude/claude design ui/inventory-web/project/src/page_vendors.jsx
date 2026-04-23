const VendorsPage = () => {
  const toast = useToast();
  const [list, setList] = useState(mockData.vendors);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState('');
  const [rule, setRule] = useState('per_pallet');

  const openNew = () => { setEditing(null); setName(''); setRule('per_pallet'); setModalOpen(true); };
  const openEdit = (v) => { setEditing(v); setName(v.name); setRule(v.default_weight_rule); setModalOpen(true); };
  const save = () => {
    if (editing) {
      setList(l => l.map(v => v.id === editing.id ? { ...v, name, default_weight_rule: rule } : v));
      toast('Vendor updated');
    } else {
      setList(l => [...l, { id: Date.now(), name, default_weight_rule: rule }]);
      toast('Vendor created');
    }
    setModalOpen(false);
  };
  const remove = (v) => { setList(l => l.filter(x => x.id !== v.id)); toast('Vendor removed'); };

  const countFor = (v) => mockData.sos.filter(s => s.vendor_id === v.id).length;

  return (
    <div className="fade-in" style={{ padding: '24px 28px 40px' }}>
      <Breadcrumbs items={[{ label: 'Home' }, { label: 'Vendors' }]} />
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', margin: '14px 0 20px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 400, letterSpacing: '-0.015em' }}>Vendors</h1>
          <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 4 }}>
            <span className="num">{list.length}</span> suppliers configured
          </div>
        </div>
        <Button variant="primary" icon={<Icons.Plus size={13} />} onClick={openNew}>New vendor</Button>
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
            {list.map(v => (
              <tr key={v.id} style={{ borderBottom: '1px solid var(--hair)' }}>
                <td style={{ ...tdS, fontSize: 13 }}>{v.name}</td>
                <td style={tdS}>
                  <Badge tone="neutral">
                    {v.default_weight_rule === 'per_pallet' ? 'Per Pallet' : 'Aggregated'}
                  </Badge>
                </td>
                <td style={{ ...tdS, textAlign: 'right' }} className="num">{countFor(v)}</td>
                <td style={{ ...tdS, textAlign: 'right' }}>
                  <Button size="sm" variant="ghost" onClick={() => openEdit(v)}>Edit</Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(v)}
                    style={{ color: 'var(--err)' }}>Delete</Button>
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
          <Button variant="primary" disabled={!name} onClick={save}>{editing ? 'Save' : 'Create'}</Button>
        </>}>
        <div style={{ display: 'grid', gap: 14 }}>
          <Field label="Vendor name"><Input value={name} onChange={setName} placeholder="e.g. MSFT" autoFocus /></Field>
          <Field label="Default weight rule">
            <Select value={rule} onChange={setRule} options={[
              { value: 'per_pallet', label: 'Per Pallet  —  record each pallet separately (like MSFT)' },
              { value: 'aggregated', label: 'Aggregated  —  record total weight + qty (like SMS)' },
            ]} />
          </Field>
          <div style={{ fontSize: 11.5, color: 'var(--ink-3)', lineHeight: 1.5,
            padding: '10px 12px', background: 'var(--surface-2)', borderRadius: 3,
            border: '1px solid var(--hair)' }}>
            The weight rule determines how pallet data is entered on the SO Detail page.
            Per-pallet shows a table of individual pallets; aggregated shows a single total row.
          </div>
        </div>
      </Modal>
    </div>
  );
};

Object.assign(window, { VendorsPage });
