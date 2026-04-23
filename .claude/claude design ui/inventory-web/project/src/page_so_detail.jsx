const SODetailPage = ({ soId, onBack, onOpenBoard }) => {
  const toast = useToast();
  const so0 = mockData.sos.find(s => s.id === soId);
  const vendor = mockData.vendors.find(v => v.id === so0.vendor_id);
  const [so, setSo] = useState(so0);
  const [tab, setTab] = useState('pallets');
  const [editMeta, setEditMeta] = useState(false);
  const [addPalletOpen, setAddPalletOpen] = useState(false);
  const [addBoardOpen, setAddBoardOpen] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const [expandedBoard, setExpandedBoard] = useState(null);
  const fileInputRef = useRef(null);

  const handlePhotoFiles = (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const imgs = files.filter(f => f.type.startsWith('image/'));
    if (!imgs.length) { toast('Please select image files'); return; }
    Promise.all(imgs.map(f => new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve({ name: f.name, src: reader.result });
      reader.readAsDataURL(f);
    }))).then(results => {
      setSo(s => ({ ...s, photos: [
        ...results.map((r, i) => ({
          id: Date.now() + i,
          caption: r.name.replace(/\.[^.]+$/, '').slice(0, 24),
          src: r.src,
        })),
        ...s.photos,
      ] }));
      toast(`${imgs.length} photo${imgs.length === 1 ? '' : 's'} added`);
    });
  };
  const openFilePicker = () => fileInputRef.current?.click();

  const updateSo = (patch) => setSo(s => ({ ...s, ...patch }));
  const updatePallet = (id, patch) => setSo(s => ({
    ...s, pallets: s.pallets.map(p => p.id === id ? { ...p, ...patch } : p),
  }));
  const deletePallet = (id) => {
    setSo(s => ({ ...s, pallets: s.pallets.filter(p => p.id !== id) }));
    toast('Pallet removed');
  };
  const addPallet = (weight, qty) => {
    setSo(s => ({ ...s, pallets: [...s.pallets, {
      id: Date.now(), pallet_seq: s.pallets.length + 1, weight: +weight, qty: +qty }] }));
    toast('Pallet added');
  };
  const addBoard = (data) => {
    const now = new Date();
    const scanned = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    setSo(s => ({ ...s, boards: [...s.boards, {
      id: Date.now(),
      barcode: data.barcode,
      catalog: data.catalog,
      mpn: data.mpn,
      weight: +data.weight,
      qty: +data.qty,
      note: data.note || '',
      scanned_at: scanned,
      chips: [],
    }] }));
    toast('Board added');
  };

  const palletTotal = so.pallets.reduce((s, p) => ({ weight: s.weight + p.weight, qty: s.qty + p.qty }),
    { weight: 0, qty: 0 });
  const palletRecordCount = so.pallets.length;
  const palletPhysicalCount = palletTotal.qty;

  const effectiveRule = so.weight_rule || vendor.default_weight_rule;
  const ruleIsOverride = so.weight_rule && so.weight_rule !== vendor.default_weight_rule;

  return (
    <div className="fade-in" style={{ padding: '24px 28px 40px' }}>
      <Breadcrumbs items={[
        { label: 'Home', onClick: onBack },
        { label: 'Sales Orders', onClick: onBack },
        { label: so.so_number },
      ]} />

      {/* Title row */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', margin: '14px 0 20px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 className="mono" style={{ margin: 0, fontSize: 20, fontWeight: 400, letterSpacing: '-0.01em' }}>
              {so.so_number}
            </h1>
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 6 }}>
            Received {so.date} · {vendor.name} · Created {so.created_at}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="outline" icon={<Icons.Download size={13} />} onClick={() => toast('PDF generated')}>Export</Button>
          <Button variant="outline" icon={<Icons.Edit size={13} />} onClick={() => setEditMeta(true)}>Edit</Button>
        </div>
      </div>

      {/* Meta card */}
      <Card pad={0} style={{ marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)' }}>
          {[
            ['Vendor', vendor.name, null],
            ['Weight Rule',
              effectiveRule === 'per_pallet' ? 'Per Pallet' : 'Aggregated',
              ruleIsOverride ? 'override' : null],
            ['Licence No', so.licence_number, null],
            ['Payload No', so.payload_number, null],
            ['Pallets', palletPhysicalCount, null],
            ['Boards', so.boards.length, null],
          ].map(([k, v, tag], i) => (
            <div key={k} style={{ padding: '16px 20px', borderRight: i < 5 ? '1px solid var(--hair)' : 'none' }}>
              <div style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase',
                color: 'var(--ink-4)', marginBottom: 6 }}>{k}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                <div className={typeof v === 'number' ? 'num' : ''} style={{ fontSize: 14, color: 'var(--ink)' }}>
                  {v || '—'}
                </div>
                {tag === 'override' && (
                  <span style={{ fontSize: 9.5, color: '#a56b1f', letterSpacing: '0.08em',
                    textTransform: 'uppercase', fontWeight: 500 }}>override</span>
                )}
              </div>
            </div>
          ))}
        </div>
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--hair)',
          display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase',
            color: 'var(--ink-4)', marginTop: 3, minWidth: 60 }}>Note</span>
          <div style={{ flex: 1 }}>
            <EditableCell value={so.note} onSave={v => { updateSo({ note: v }); toast('Note updated'); }} />
            {!so.note && <div style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 2, paddingLeft: 6 }}>
              Double-click to add a note.
            </div>}
          </div>
        </div>
      </Card>

      {/* Photos */}
      <div style={{ marginBottom: 24 }}>
        <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
          onChange={(e) => { handlePhotoFiles(e.target.files); e.target.value = ''; }} />
        <SectionHeader label="Photos" count={so.photos.length}
          action={<Button size="sm" variant="outline" icon={<Icons.Upload size={12}/>}
            onClick={openFilePicker}>Upload</Button>} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10 }}>
          {so.photos.map((p, i) => (
            <PhotoThumb key={p.id} caption={p.caption} seed={p.id} src={p.src}
              onClick={() => setLightbox(p)} />
          ))}
          <div onClick={openFilePicker} style={{
            height: 120, border: '1px dashed var(--hair-strong)', borderRadius: 3,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 4, color: 'var(--ink-3)', fontSize: 11, cursor: 'pointer', background: 'var(--surface)',
          }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
            onMouseLeave={e => e.currentTarget.style.background = 'var(--surface)'}>
            <Icons.Plus size={14} />
            <span>Add photo</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onChange={setTab} tabs={[
        { value: 'pallets', label: 'Pallets', count: so.pallets.length },
        { value: 'boards',  label: 'Boards',  count: so.boards.length },
      ]} />

      <div style={{ padding: '20px 0' }}>
        {tab === 'pallets' && (
          <>
            <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>
                  {effectiveRule === 'per_pallet'
                    ? <>Rule: <b style={{ color: 'var(--ink-2)', fontWeight: 500 }}>Per-pallet</b>. Record each pallet's weight separately.</>
                    : <>Rule: <b style={{ color: 'var(--ink-2)', fontWeight: 500 }}>Aggregated</b>. One row with total weight and qty.</>
                  }
                  <span style={{ marginLeft: 6, color: 'var(--ink-4)' }}>
                    ({ruleIsOverride ? `override of ${vendor.name} default` : `from vendor ${vendor.name}`})
                  </span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 4 }}>
                  <span className="num">{palletRecordCount}</span> record{palletRecordCount === 1 ? '' : 's'}
                  {' · '}
                  <span className="num" style={{ color: 'var(--ink-2)' }}>{palletPhysicalCount}</span> physical pallet{palletPhysicalCount === 1 ? '' : 's'} total
                </div>
              </div>
              <Button size="sm" variant="outline" icon={<Icons.Plus size={12} />}
                onClick={() => setAddPalletOpen(true)}
                disabled={effectiveRule === 'aggregated' && so.pallets.length >= 1}>
                Add {effectiveRule === 'aggregated' ? 'record' : 'pallet'}
              </Button>
            </div>
            <div style={{ border: '1px solid var(--hair)', borderRadius: 3, background: 'var(--surface)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={thS}>Seq</th>
                    <th style={{ ...thS, textAlign: 'right' }}>Weight (lb)</th>
                    <th style={{ ...thS, textAlign: 'right' }}>Qty</th>
                    <th style={{ ...thS, width: 100, textAlign: 'right' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {so.pallets.map(p => (
                    <tr key={p.id} style={{ borderBottom: '1px solid var(--hair)' }}>
                      <td style={tdS}>
                        <span className="mono" style={{ color: 'var(--ink-3)' }}>#{String(p.pallet_seq).padStart(2, '0')}</span>
                      </td>
                      <td style={{ ...tdS, textAlign: 'right' }} className="num">
                        <EditableCell value={p.weight} type="number" align="right"
                          onSave={v => { updatePallet(p.id, { weight: +v }); toast('Pallet updated'); }} />
                      </td>
                      <td style={{ ...tdS, textAlign: 'right' }} className="num">
                        {effectiveRule === 'per_pallet'
                          ? <span style={{ color: 'var(--ink-3)' }}>1</span>
                          : <EditableCell value={p.qty} type="number" align="right"
                              onSave={v => { updatePallet(p.id, { qty: +v }); toast('Pallet updated'); }} />}
                      </td>
                      <td style={{ ...tdS, textAlign: 'right' }}>
                        <button onClick={() => deletePallet(p.id)} style={ghostBtn}>
                          <Icons.Trash size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {so.pallets.length > 0 && (
                    <tr style={{ background: 'var(--surface-2)' }}>
                      <td style={{ ...tdS, fontSize: 11, color: 'var(--ink-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                        Total <span style={{ color: 'var(--ink-4)', textTransform: 'none', letterSpacing: 0 }}>
                          ({palletPhysicalCount} physical)
                        </span>
                      </td>
                      <td style={{ ...tdS, textAlign: 'right' }} className="num">{palletTotal.weight.toFixed(2)}</td>
                      <td style={{ ...tdS, textAlign: 'right' }} className="num">{palletTotal.qty}</td>
                      <td />
                    </tr>
                  )}
                </tbody>
              </table>
              <div style={{ padding: '10px 14px', fontSize: 11, color: 'var(--ink-4)',
                borderTop: '1px solid var(--hair)' }}>
                Double-click any cell to edit inline.
              </div>
            </div>
          </>
        )}

        {tab === 'boards' && (
          <BoardsTable boards={so.boards} onOpenBoard={onOpenBoard}
            expandedBoard={expandedBoard} setExpandedBoard={setExpandedBoard}
            onAddBoard={() => setAddBoardOpen(true)} />
        )}
      </div>

      {/* Lightbox */}
      <Modal open={!!lightbox} onClose={() => setLightbox(null)} title={lightbox?.caption || 'Photo'} width={720}>
        {lightbox && <PhotoThumb size={680} seed={lightbox.id} caption={lightbox.caption} src={lightbox.src} />}
      </Modal>

      {/* Edit meta */}
      <Modal open={editMeta} onClose={() => setEditMeta(false)} title={`Edit ${so.so_number}`} width={560}
        footer={<>
          <Button variant="ghost" onClick={() => setEditMeta(false)}>Cancel</Button>
          <Button variant="primary" onClick={() => { setEditMeta(false); toast('SO updated'); }}>Save</Button>
        </>}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label="SO Number"><Input value={so.so_number} onChange={v => updateSo({ so_number: v })} /></Field>
          <Field label="Vendor">
            <Select value={String(so.vendor_id)} onChange={v => updateSo({ vendor_id: +v })}
              options={mockData.vendors.map(v => ({ value: String(v.id), label: v.name }))} />
          </Field>
          <Field label="Date"><Input value={so.date} onChange={v => updateSo({ date: v })} type="date" /></Field>
          <Field label="Licence Number"><Input value={so.licence_number} onChange={v => updateSo({ licence_number: v })} /></Field>
          <Field label="Payload Number" span={2}><Input value={so.payload_number} onChange={v => updateSo({ payload_number: v })} /></Field>
          <Field label="Note" span={2}>
            <textarea value={so.note} onChange={e => updateSo({ note: e.target.value })} rows={3}
              style={{ width: '100%', padding: '6px 10px', border: '1px solid var(--hair-strong)',
                background: 'var(--surface)', borderRadius: 3, fontFamily: 'inherit', fontSize: 13,
                resize: 'vertical', outline: 'none', color: 'var(--ink)' }} />
          </Field>
        </div>
      </Modal>

      <AddPalletModal open={addPalletOpen} onClose={() => setAddPalletOpen(false)} onAdd={addPallet}
        rule={effectiveRule} />
      <AddBoardModal open={addBoardOpen} onClose={() => setAddBoardOpen(false)} onAdd={addBoard} />
    </div>
  );
};

// ───────────────────────────────────────────────────────────── Boards tab
const BOARDS_PAGE_SIZE = 8;
const BoardsTable = ({ boards, onOpenBoard, expandedBoard, setExpandedBoard, onAddBoard }) => {
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);

  const dayOf = (s) => (s || '').slice(0, 10); // 'YYYY-MM-DD'
  const filtered = useMemo(() => {
    return boards.filter(b => {
      const d = dayOf(b.scanned_at);
      if (fromDate && d < fromDate) return false;
      if (toDate && d > toDate) return false;
      return true;
    });
  }, [boards, fromDate, toDate]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / BOARDS_PAGE_SIZE));
  const pg = Math.min(page, totalPages);
  const pageRows = filtered.slice((pg - 1) * BOARDS_PAGE_SIZE, pg * BOARDS_PAGE_SIZE);
  const showing = filtered.length === 0 ? [0, 0]
    : [(pg - 1) * BOARDS_PAGE_SIZE + 1, Math.min(pg * BOARDS_PAGE_SIZE, filtered.length)];

  useEffect(() => { setPage(1); }, [fromDate, toDate]);
  const clear = () => { setFromDate(''); setToDate(''); };
  const hasFilter = fromDate || toDate;

  return (
    <div>
      {/* Filter bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 10,
        padding: '10px 12px', border: '1px solid var(--hair)', borderRadius: 3,
        background: 'var(--surface)' }}>
        <span style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase',
          color: 'var(--ink-4)' }}>Scanned</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Input value={fromDate} onChange={setFromDate} type="date" />
          <span style={{ color: 'var(--ink-4)', fontSize: 12 }}>→</span>
          <Input value={toDate} onChange={setToDate} type="date" />
        </div>
        {hasFilter && (
          <Button size="sm" variant="ghost" onClick={clear}>Clear</Button>
        )}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>
          {filtered.length === boards.length
            ? <><span className="num">{boards.length}</span> boards</>
            : <><span className="num">{filtered.length}</span> of <span className="num">{boards.length}</span> boards</>}
        </span>
        <Button size="sm" variant="outline" icon={<Icons.Plus size={12} />} onClick={onAddBoard}>
          Add board
        </Button>
      </div>

      <div style={{ border: '1px solid var(--hair)', borderRadius: 3, background: 'var(--surface)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 28 }}/><col style={{ width: '18%' }}/><col style={{ width: '12%' }}/>
            <col style={{ width: '18%' }}/><col style={{ width: '10%' }}/><col style={{ width: '10%' }}/>
            <col style={{ width: '10%' }}/><col/>
          </colgroup>
          <thead>
            <tr>
              <th style={thS}></th>
              <th style={thS}>Barcode</th>
              <th style={thS}>Catalog</th>
              <th style={thS}>MPN</th>
              <th style={{ ...thS, textAlign: 'right' }}>Weight</th>
              <th style={{ ...thS, textAlign: 'right' }}>Qty</th>
              <th style={{ ...thS, textAlign: 'right' }}>Chips</th>
              <th style={thS}>Scanned</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map(b => {
              const open = expandedBoard === b.id;
              return (
                <React.Fragment key={b.id}>
                  <tr style={{ borderBottom: '1px solid var(--hair)',
                    background: open ? 'var(--surface-2)' : 'transparent' }}>
                    <td style={{ ...tdS, padding: '8px 4px 8px 14px' }}>
                      <button onClick={() => setExpandedBoard(open ? null : b.id)}
                        style={{ ...ghostBtn, padding: 3 }}>
                        <span style={{ display: 'inline-flex',
                          transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .12s' }}>
                          <Icons.Chevron size={11} />
                        </span>
                      </button>
                    </td>
                    <td style={tdS}>
                      <button onClick={() => onOpenBoard(b.id)}
                        className="mono" style={{ background: 'none', border: 0, padding: 0,
                          cursor: 'pointer', color: 'var(--ink)', fontSize: 12.5,
                          textDecoration: 'underline', textDecorationColor: 'var(--ink-5)',
                          textUnderlineOffset: 3 }}>
                        {b.barcode}
                      </button>
                    </td>
                    <td style={{ ...tdS, fontSize: 12 }} className="mono">{b.catalog}</td>
                    <td style={{ ...tdS, fontSize: 12, color: 'var(--ink-2)' }} className="mono">{b.mpn}</td>
                    <td style={{ ...tdS, textAlign: 'right' }} className="num">{b.weight?.toFixed(2) || '—'}</td>
                    <td style={{ ...tdS, textAlign: 'right' }} className="num">{b.qty}</td>
                    <td style={{ ...tdS, textAlign: 'right' }} className="num">{b.chips.length}</td>
                    <td style={{ ...tdS, fontSize: 11.5, color: 'var(--ink-3)' }} className="num">{b.scanned_at}</td>
                  </tr>
                  {open && (
                    <tr style={{ borderBottom: '1px solid var(--hair)' }}>
                      <td />
                      <td colSpan={7} style={{ padding: '8px 14px 16px' }}>
                        <div style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase',
                          color: 'var(--ink-4)', marginBottom: 8 }}>Chips on board</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {b.chips.map(c => {
                            const brand = mockData.chipBrands.find(cb => cb.id === c.brand_id);
                            return (
                              <span key={c.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6,
                                padding: '3px 9px', border: '1px solid var(--hair-strong)',
                                borderRadius: 3, background: 'var(--surface)', fontSize: 12 }}>
                                {brand?.name} <span className="num" style={{ color: 'var(--ink-3)' }}>×{c.qty}</span>
                              </span>
                            );
                          })}
                          {b.note && <span style={{ fontSize: 11.5, color: 'var(--ink-3)', fontStyle: 'italic', marginLeft: 4 }}>
                            — {b.note}
                          </span>}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            {pageRows.length === 0 && (
              <tr><td colSpan={8} style={{ padding: '28px 14px', textAlign: 'center',
                fontSize: 12, color: 'var(--ink-3)' }}>
                No boards match the selected date range.
              </td></tr>
            )}
          </tbody>
        </table>

        {/* Pagination footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 14px', borderTop: '1px solid var(--hair)',
          fontSize: 11.5, color: 'var(--ink-3)' }}>
          <span>
            Showing <span className="num">{showing[0]}</span>–<span className="num">{showing[1]}</span>
            {' '}of <span className="num">{filtered.length}</span>
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={pg <= 1}
              style={pagerBtn(pg <= 1)}>
              <Icons.Chevron size={10} style={{ transform: 'rotate(180deg)' }} />
            </button>
            <span style={{ padding: '0 10px', fontSize: 12 }}>
              <span className="num">{pg}</span>
              <span style={{ color: 'var(--ink-4)' }}> / </span>
              <span className="num">{totalPages}</span>
            </span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={pg >= totalPages}
              style={pagerBtn(pg >= totalPages)}>
              <Icons.Chevron size={10} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const pagerBtn = (disabled) => ({
  width: 26, height: 24, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  background: 'var(--surface)', border: '1px solid var(--hair-strong)', borderRadius: 3,
  color: disabled ? 'var(--ink-5)' : 'var(--ink-2)',
  cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1,
});

const AddPalletModal = ({ open, onClose, onAdd, rule }) => {
  const aggregated = rule === 'aggregated';
  const [w, setW] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => { if (open) { setW(''); setQ(aggregated ? '' : '1'); } }, [open, aggregated]);
  return (
    <Modal open={open} onClose={onClose} title={aggregated ? 'Add aggregated record' : 'Add pallet'} width={440}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={!w || !q}
          onClick={() => { onAdd(w, q); onClose(); }}>Add</Button>
      </>}>
        <div style={{ fontSize: 11.5, color: 'var(--ink-3)', lineHeight: 1.5,
          padding: '10px 12px', background: 'var(--surface-2)', border: '1px solid var(--hair)',
          borderRadius: 3, marginBottom: 14 }}>
          {aggregated
            ? <>One record summarises <b style={{ color: 'var(--ink-2)', fontWeight: 500 }}>many physical pallets</b>. Enter the total weight and how many pallets this record covers.</>
            : <>One row = <b style={{ color: 'var(--ink-2)', fontWeight: 500 }}>one physical pallet</b>. Qty is locked to <span className="num">1</span>.</>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label={aggregated ? 'Total Weight (lb)' : 'Weight (lb)'}>
            <Input value={w} onChange={setW} type="number" placeholder="0.00" autoFocus />
          </Field>
          <Field label={aggregated ? 'Qty (physical pallets)' : 'Qty'}>
            {aggregated
              ? <Input value={q} onChange={setQ} type="number" placeholder="0" />
              : <Input value="1" onChange={() => {}} type="number" disabled />}
          </Field>
        </div>
    </Modal>
  );
};

const AddBoardModal = ({ open, onClose, onAdd }) => {
  const [barcode, setBarcode] = useState('');
  const [catalog, setCatalog] = useState('');
  const [mpn, setMpn] = useState('');
  const [weight, setWeight] = useState('');
  const [qty, setQty] = useState('1');
  const [note, setNote] = useState('');
  useEffect(() => { if (open) {
    setBarcode(''); setCatalog(''); setMpn(''); setWeight(''); setQty('1'); setNote('');
  } }, [open]);
  const canSave = barcode && catalog && mpn && weight && qty;
  return (
    <Modal open={open} onClose={onClose} title="Add board" width={520}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={!canSave}
          onClick={() => { onAdd({ barcode, catalog, mpn, weight, qty, note }); onClose(); }}>Add</Button>
      </>}>
      <div style={{ fontSize: 11.5, color: 'var(--ink-3)', lineHeight: 1.5,
        padding: '10px 12px', background: 'var(--surface-2)', border: '1px solid var(--hair)',
        borderRadius: 3, marginBottom: 14 }}>
        Scan or enter the board's identifiers. Timestamp is set to now automatically; chips can be added after from the board detail page.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Field label="Barcode" span={2}>
          <Input value={barcode} onChange={setBarcode} placeholder="BC-000-0000" autoFocus
            style={{ fontFamily: 'var(--mono, ui-monospace, monospace)' }} />
        </Field>
        <Field label="Catalog">
          <Input value={catalog} onChange={setCatalog} placeholder="SSD-C3" />
        </Field>
        <Field label="MPN">
          <Input value={mpn} onChange={setMpn} placeholder="NVMe-PCIe4-1T" />
        </Field>
        <Field label="Weight (lb)">
          <Input value={weight} onChange={setWeight} type="number" placeholder="0.00" />
        </Field>
        <Field label="Qty">
          <Input value={qty} onChange={setQty} type="number" placeholder="1" />
        </Field>
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

const thS = { textAlign: 'left', padding: '10px 14px', fontWeight: 400,
  fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase',
  color: 'var(--ink-3)', borderBottom: '1px solid var(--hair)' };
const tdS = { padding: '10px 14px', fontSize: 12.5, verticalAlign: 'middle' };
const ghostBtn = { background: 'none', border: 0, cursor: 'pointer', color: 'var(--ink-3)',
  padding: 4, borderRadius: 3, display: 'inline-flex' };

Object.assign(window, { SODetailPage, thS, tdS, ghostBtn });
