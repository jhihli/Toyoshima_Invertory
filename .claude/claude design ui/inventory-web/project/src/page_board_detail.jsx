const BoardDetailPage = ({ boardId, onBack, onBackToSO }) => {
  const toast = useToast();
  // Find SO + board
  const soFound = mockData.sos.find(s => s.boards.some(b => b.id === boardId));
  const board0 = soFound.boards.find(b => b.id === boardId);
  const [board, setBoard] = useState(board0);
  const [addChipOpen, setAddChipOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const saveEdit = (patch) => {
    setBoard(b => ({ ...b, ...patch, weight: +patch.weight, qty: +patch.qty }));
    // keep mock store in sync so SO detail reflects the edit
    const target = mockData.sos.find(s => s.id === soFound.id).boards.find(b => b.id === boardId);
    Object.assign(target, patch, { weight: +patch.weight, qty: +patch.qty });
    toast('Board updated');
  };
  const doDelete = () => {
    const so = mockData.sos.find(s => s.id === soFound.id);
    so.boards = so.boards.filter(b => b.id !== boardId);
    toast('Board deleted');
    onBackToSO(soFound.id);
  };

  const updChip = (id, patch) => setBoard(b => ({
    ...b, chips: b.chips.map(c => c.id === id ? { ...c, ...patch } : c),
  }));
  const addChip = (brand_id, qty, note) => {
    setBoard(b => ({ ...b, chips: [...b.chips, { id: Date.now(), brand_id: +brand_id, qty: +qty, note }] }));
    toast('Chip added');
  };
  const delChip = (id) => {
    setBoard(b => ({ ...b, chips: b.chips.filter(c => c.id !== id) }));
    toast('Chip removed');
  };

  const totalChips = board.chips.reduce((s, c) => s + c.qty, 0);

  return (
    <div className="fade-in" style={{ padding: '24px 28px 40px' }}>
      <Breadcrumbs items={[
        { label: 'Home', onClick: onBack },
        { label: 'Sales Orders', onClick: onBack },
        { label: soFound.so_number, onClick: () => onBackToSO(soFound.id) },
        { label: board.barcode },
      ]} />

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', margin: '14px 0 20px' }}>
        <div>
          <h1 className="mono" style={{ margin: 0, fontSize: 20, fontWeight: 400 }}>{board.barcode}</h1>
          <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 6 }}>
            SO {soFound.so_number} · Scanned {board.scanned_at}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="outline" icon={<Icons.Edit size={13} />} onClick={() => setEditOpen(true)}>Edit</Button>
          <Button variant="danger" icon={<Icons.Trash size={13} />} onClick={() => setConfirmDelete(true)}>Delete</Button>
        </div>
      </div>

      {/* Split: photo | fields */}
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 20, marginBottom: 24 }}>
        <div>
          <PhotoThumb size={320} seed={board.id} caption="Board photo" />
          <Button size="sm" variant="outline" icon={<Icons.Upload size={12}/>}
            onClick={() => toast('Upload dialog')}
            style={{ marginTop: 8, width: '100%', justifyContent: 'center' }}>
            Replace photo
          </Button>
        </div>
        <Card pad={0}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
            {[
              ['Barcode', board.barcode, 'mono'],
              ['Catalog', board.catalog, 'mono'],
              ['MPN', board.mpn, 'mono'],
              ['Weight (lb)', board.weight?.toFixed(2) ?? '—', 'num'],
              ['Quantity', board.qty, 'num'],
              ['Scanned At', board.scanned_at, 'num'],
            ].map(([k, v, cls], i) => (
              <div key={k} style={{ padding: '18px 22px',
                borderBottom: i < 4 ? '1px solid var(--hair)' : 'none',
                borderRight: i % 2 === 0 ? '1px solid var(--hair)' : 'none' }}>
                <div style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase',
                  color: 'var(--ink-4)', marginBottom: 6 }}>{k}</div>
                <div className={cls} style={{ fontSize: 14, color: 'var(--ink)' }}>{v}</div>
              </div>
            ))}
          </div>
          {board.note && (
            <div style={{ padding: '14px 22px', borderTop: '1px solid var(--hair)',
              background: 'var(--surface-2)', display: 'flex', gap: 10 }}>
              <span style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase',
                color: 'var(--ink-4)', marginTop: 2 }}>Note</span>
              <span style={{ fontSize: 12.5, color: 'var(--ink-2)', flex: 1 }}>{board.note}</span>
            </div>
          )}
        </Card>
      </div>

      {/* Chips section */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        paddingBottom: 10, borderBottom: '1px solid var(--hair)', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
          <span style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase',
            color: 'var(--ink-3)' }}>Chips</span>
          <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
            <span className="num" style={{ color: 'var(--ink)' }}>{board.chips.length}</span>
            <span style={{ color: 'var(--ink-4)' }}> brand{board.chips.length === 1 ? '' : 's'} · </span>
            <span className="num" style={{ color: 'var(--ink)' }}>{totalChips}</span>
            <span style={{ color: 'var(--ink-4)' }}> total chip{totalChips === 1 ? '' : 's'}</span>
          </span>
        </div>
        <Button size="sm" variant="outline" icon={<Icons.Plus size={12} />}
          onClick={() => setAddChipOpen(true)}>Add chip</Button>
      </div>

      <div style={{ border: '1px solid var(--hair)', borderRadius: 3, background: 'var(--surface)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thS}>Brand</th>
              <th style={{ ...thS, textAlign: 'right', width: 120 }}>Qty</th>
              <th style={thS}>Note</th>
              <th style={{ ...thS, width: 60 }}></th>
            </tr>
          </thead>
          <tbody>
            {board.chips.length === 0 && (
              <tr><td colSpan={4}><Empty label="No chips recorded" sub="Click 'Add chip' to start." /></td></tr>
            )}
            {board.chips.map(c => {
              const brand = mockData.chipBrands.find(cb => cb.id === c.brand_id);
              return (
                <tr key={c.id} style={{ borderBottom: '1px solid var(--hair)' }}>
                  <td style={tdS}>{brand?.name || '—'}</td>
                  <td style={{ ...tdS, textAlign: 'right' }} className="num">
                    <EditableCell value={c.qty} type="number" align="right"
                      onSave={v => { updChip(c.id, { qty: +v }); toast('Chip updated'); }} />
                  </td>
                  <td style={{ ...tdS, color: 'var(--ink-3)' }}>
                    <EditableCell value={c.note} onSave={v => { updChip(c.id, { note: v }); toast('Chip updated'); }} />
                  </td>
                  <td style={{ ...tdS, textAlign: 'right' }}>
                    <button onClick={() => delChip(c.id)} style={ghostBtn}><Icons.Trash size={13} /></button>
                  </td>
                </tr>
              );
            })}
            {board.chips.length > 0 && (
              <tr style={{ background: 'var(--surface-2)' }}>
                <td style={{ ...tdS, fontSize: 11, color: 'var(--ink-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  Total Chips
                </td>
                <td style={{ ...tdS, textAlign: 'right' }} className="num">{totalChips}</td>
                <td colSpan={2} />
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <AddChipModal open={addChipOpen} onClose={() => setAddChipOpen(false)} onAdd={addChip} />
      <EditBoardModal open={editOpen} onClose={() => setEditOpen(false)}
        board={board} onSave={saveEdit} />
      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete board?" width={420}
        footer={<>
          <Button variant="ghost" onClick={() => setConfirmDelete(false)}>Cancel</Button>
          <Button variant="danger" icon={<Icons.Trash size={13} />}
            onClick={() => { setConfirmDelete(false); doDelete(); }}>Delete board</Button>
        </>}>
        <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.6 }}>
          Delete board <span className="mono" style={{ color: 'var(--ink)' }}>{board.barcode}</span> from
          SO <span className="mono" style={{ color: 'var(--ink)' }}>{soFound.so_number}</span>?
        </div>
        {board.chips.length > 0 && (
          <div style={{ marginTop: 10, padding: '8px 12px', background: 'var(--surface-2)',
            border: '1px solid var(--hair)', borderRadius: 3, fontSize: 11.5, color: 'var(--ink-3)' }}>
            This will also remove <span className="num" style={{ color: 'var(--ink-2)' }}>{board.chips.length}</span> chip
            record{board.chips.length === 1 ? '' : 's'} (<span className="num">{totalChips}</span> total chips).
          </div>
        )}
        <div style={{ marginTop: 10, fontSize: 11.5, color: 'var(--ink-4)' }}>
          This action cannot be undone.
        </div>
      </Modal>
    </div>
  );
};

const AddChipModal = ({ open, onClose, onAdd }) => {
  const [brand, setBrand] = useState('');
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  useEffect(() => { if (open) { setBrand(''); setQty(''); setNote(''); } }, [open]);
  return (
    <Modal open={open} onClose={onClose} title="Add chip" width={440}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={!brand || !qty}
          onClick={() => { onAdd(brand, qty, note); onClose(); }}>Add</Button>
      </>}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Field label="Brand" span={2}>
          <Select value={brand} onChange={setBrand} placeholder="Select brand"
            options={mockData.chipBrands.map(c => ({ value: String(c.id), label: c.name }))} />
        </Field>
        <Field label="Qty"><Input value={qty} onChange={setQty} type="number" placeholder="0" /></Field>
        <Field label="Note"><Input value={note} onChange={setNote} placeholder="Optional" /></Field>
      </div>
    </Modal>
  );
};

const EditBoardModal = ({ open, onClose, board, onSave }) => {
  const [barcode, setBarcode] = useState('');
  const [catalog, setCatalog] = useState('');
  const [mpn, setMpn] = useState('');
  const [weight, setWeight] = useState('');
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  useEffect(() => { if (open && board) {
    setBarcode(board.barcode || '');
    setCatalog(board.catalog || '');
    setMpn(board.mpn || '');
    setWeight(String(board.weight ?? ''));
    setQty(String(board.qty ?? ''));
    setNote(board.note || '');
  } }, [open, board]);
  const canSave = barcode && catalog && mpn && weight && qty;
  return (
    <Modal open={open} onClose={onClose} title="Edit board" width={520}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={!canSave}
          onClick={() => { onSave({ barcode, catalog, mpn, weight, qty, note }); onClose(); }}>
          Save changes
        </Button>
      </>}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Field label="Barcode" span={2}>
          <Input value={barcode} onChange={setBarcode} placeholder="BC-000-0000" autoFocus
            style={{ fontFamily: 'var(--mono, ui-monospace, monospace)' }} />
        </Field>
        <Field label="Catalog"><Input value={catalog} onChange={setCatalog} placeholder="SSD-C3" /></Field>
        <Field label="MPN"><Input value={mpn} onChange={setMpn} placeholder="NVMe-PCIe4-1T" /></Field>
        <Field label="Weight (lb)"><Input value={weight} onChange={setWeight} type="number" placeholder="0.00" /></Field>
        <Field label="Qty"><Input value={qty} onChange={setQty} type="number" placeholder="1" /></Field>
        <Field label="Note" span={2}>
          <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Optional…" rows={2}
            style={{ width: '100%', padding: '6px 10px', border: '1px solid var(--hair-strong)',
              background: 'var(--surface)', borderRadius: 3, resize: 'vertical',
              fontSize: 13, color: 'var(--ink)', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
        </Field>
      </div>
    </Modal>
  );
};

Object.assign(window, { BoardDetailPage });
