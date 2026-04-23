const ChipBrandsPage = () => {
  const toast = useToast();
  const [list, setList] = useState(mockData.chipBrands);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState('');

  const countFor = (cb) => {
    let total = 0;
    mockData.sos.forEach(s => s.boards.forEach(b => b.chips.forEach(c => {
      if (c.brand_id === cb.id) total += c.qty;
    })));
    return total;
  };

  const openNew = () => { setEditing(null); setName(''); setModalOpen(true); };
  const openEdit = (cb) => { setEditing(cb); setName(cb.name); setModalOpen(true); };
  const save = () => {
    if (editing) setList(l => l.map(x => x.id === editing.id ? { ...x, name } : x));
    else setList(l => [...l, { id: Date.now(), name }]);
    toast(editing ? 'Brand updated' : 'Brand created');
    setModalOpen(false);
  };
  const remove = (cb) => { setList(l => l.filter(x => x.id !== cb.id)); toast('Brand removed'); };

  return (
    <div className="fade-in" style={{ padding: '24px 28px 40px' }}>
      <Breadcrumbs items={[{ label: 'Home' }, { label: 'Chip Brands' }]} />
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', margin: '14px 0 20px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 400, letterSpacing: '-0.015em' }}>Chip Brands</h1>
          <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 4 }}>
            Dictionary used when recording chips on boards.
          </div>
        </div>
        <Button variant="primary" icon={<Icons.Plus size={13} />} onClick={openNew}>New brand</Button>
      </div>

      <div style={{ border: '1px solid var(--hair)', borderRadius: 3, background: 'var(--surface)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thS}>Brand</th>
              <th style={{ ...thS, textAlign: 'right' }}>Chips recorded</th>
              <th style={{ ...thS, width: 140, textAlign: 'right' }}></th>
            </tr>
          </thead>
          <tbody>
            {list.map(cb => (
              <tr key={cb.id} style={{ borderBottom: '1px solid var(--hair)' }}>
                <td style={{ ...tdS, fontSize: 13 }}>{cb.name}</td>
                <td style={{ ...tdS, textAlign: 'right' }} className="num">{countFor(cb)}</td>
                <td style={{ ...tdS, textAlign: 'right' }}>
                  <Button size="sm" variant="ghost" onClick={() => openEdit(cb)}>Edit</Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(cb)}
                    style={{ color: 'var(--err)' }}>Delete</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)}
        title={editing ? `Edit ${editing.name}` : 'New chip brand'} width={420}
        footer={<>
          <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button>
          <Button variant="primary" disabled={!name} onClick={save}>{editing ? 'Save' : 'Create'}</Button>
        </>}>
        <Field label="Brand name"><Input value={name} onChange={setName} placeholder="e.g. Samsung" autoFocus /></Field>
      </Modal>
    </div>
  );
};

Object.assign(window, { ChipBrandsPage });
