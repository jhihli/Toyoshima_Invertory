const SOListPage = ({ onOpen, onNavDashboard }) => {
  const toast = useToast();
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [q, setQ] = useState('');
  const [vendorFilter, setVendorFilter] = useState('');
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [sort, setSort] = useState({ key: 'date', dir: 'desc' });
  const [page, setPage] = useState(1);
  const pageSize = 15;
  const [newOpen, setNewOpen] = useState(false);

  const filtered = useMemo(() => {
    let rows = mockData.sos.slice();
    if (q) rows = rows.filter(s => s.so_number.toLowerCase().includes(q.toLowerCase())
      || s.licence_number.toLowerCase().includes(q.toLowerCase()));
    if (vendorFilter) rows = rows.filter(s => String(s.vendor_id) === vendorFilter);
    if (dateFrom) rows = rows.filter(s => s.date >= dateFrom);
    if (dateTo) rows = rows.filter(s => s.date <= dateTo);
    rows.sort((a, b) => {
      const av = a[sort.key], bv = b[sort.key];
      if (av < bv) return sort.dir === 'asc' ? -1 : 1;
      if (av > bv) return sort.dir === 'asc' ? 1 : -1;
      return 0;
    });
    return rows;
  }, [q, vendorFilter, dateFrom, dateTo, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  const toggleSort = (key) => {
    setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' });
  };

  const Th = ({ label, sortKey, align = 'left', w }) => (
    <th style={{ textAlign: align, padding: '10px 14px', fontWeight: 400,
      fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase',
      color: 'var(--ink-3)', borderBottom: '1px solid var(--hair)',
      cursor: sortKey ? 'pointer' : 'default', width: w, userSelect: 'none' }}
      onClick={() => sortKey && toggleSort(sortKey)}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {label}
        {sortKey === sort.key && (sort.dir === 'asc'
          ? <Icons.ChevronUp size={10} /> : <Icons.ChevronDown size={10} />)}
      </span>
    </th>
  );

  return (
    <div className="fade-in" style={{ padding: '24px 28px 40px' }}>
      <Breadcrumbs items={[{ label: 'Home', onClick: onNavDashboard }, { label: 'Sales Orders' }]} />
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', margin: '14px 0 20px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 400, letterSpacing: '-0.015em' }}>Sales Orders</h1>
          <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 4 }}>
            <span className="num">{filtered.length}</span> of {mockData.sos.length} records
          </div>
        </div>
        <Button variant="primary" icon={<Icons.Plus size={13} />} onClick={() => setNewOpen(true)}>New SO</Button>
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <Input value={q} onChange={v => { setQ(v); setPage(1); }}
          placeholder="Filter by SO number or licence…" icon={<Icons.Search size={13} />}
          style={{ width: 300 }} />
        <Select value={vendorFilter} onChange={v => { setVendorFilter(v); setPage(1); }}
          placeholder="All vendors"
          options={mockData.vendors.map(v => ({ value: String(v.id), label: v.name }))} />
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6,
          border: '1px solid var(--hair-strong)', borderRadius: 3, background: 'var(--surface)',
          padding: '0 10px', height: 30 }}>
          <Icons.Calendar size={12} style={{ color: 'var(--ink-3)' }}/>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            style={{ border: 0, outline: 0, background: 'transparent', fontSize: 12, color: 'var(--ink)', width: 110 }}/>
          <span style={{ color: 'var(--ink-4)' }}>→</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            style={{ border: 0, outline: 0, background: 'transparent', fontSize: 12, color: 'var(--ink)', width: 110 }}/>
        </div>
        {(q || vendorFilter || dateFrom !== today || dateTo !== today) && (
          <Button variant="ghost" onClick={() => { setQ(''); setVendorFilter(''); setDateFrom(today); setDateTo(today); setPage(1); }}>
            Clear
          </Button>
        )}
        <div style={{ flex: 1 }} />
        <Button variant="outline" icon={<Icons.Download size={13} />} onClick={() => toast('Export queued')}>Export</Button>
      </div>

      {/* Table */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--hair)', borderRadius: 3 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <thead>
            <tr>
              <Th label="SO Number" sortKey="so_number" w="17%" />
              <Th label="Vendor" w="10%" />
              <Th label="Date" sortKey="date" w="11%" />
              <Th label="Licence No" w="14%" />
              <Th label="Payload" w="12%" />
              <Th label="Pallets" align="right" w="8%" />
              <Th label="Total Weight (lb)" align="right" w="12%" />
              <Th label="Boards" align="right" w="8%" />
              <Th label="" w="8%" />
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 && (
              <tr><td colSpan={9}><Empty label="No matching SOs" sub="Try clearing filters or a different search." /></td></tr>
            )}
            {pageRows.map(s => {
              const vendor = mockData.vendors.find(v => v.id === s.vendor_id);
              const totalWeight = s.pallets.reduce((sum, p) => sum + p.weight, 0);
              const palletQty = s.pallets.reduce((sum, p) => sum + (p.qty || 0), 0);
              return (
                <tr key={s.id} onClick={() => onOpen(s.id)}
                  style={{ borderBottom: '1px solid var(--hair)', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <td style={{ padding: '12px 14px' }}>
                    <span className="mono" style={{ fontSize: 12.5, color: 'var(--ink)' }}>{s.so_number}</span>
                  </td>
                  <td style={{ padding: '12px 14px', fontSize: 12.5 }}>{vendor.name}</td>
                  <td style={{ padding: '12px 14px', fontSize: 12.5 }} className="num">{s.date}</td>
                  <td style={{ padding: '12px 14px', fontSize: 12, color: 'var(--ink-2)' }} className="mono">{s.licence_number}</td>
                  <td style={{ padding: '12px 14px', fontSize: 12, color: 'var(--ink-2)' }} className="mono">{s.payload_number}</td>
                  <td style={{ padding: '12px 14px', textAlign: 'right' }} className="num">{palletQty}</td>
                  <td style={{ padding: '12px 14px', textAlign: 'right' }} className="num">{totalWeight.toFixed(2)}</td>
                  <td style={{ padding: '12px 14px', textAlign: 'right' }} className="num">{s.boards.length}</td>
                  <td style={{ padding: '12px 14px', textAlign: 'right', color: 'var(--ink-4)' }}>
                    <Icons.Chevron size={12} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <Pagination page={page} pageCount={pageCount} onChange={setPage}
          total={filtered.length} pageSize={pageSize} />
      </div>

      {/* New SO modal */}
      <NewSOModal open={newOpen} onClose={() => setNewOpen(false)} onCreate={() => { setNewOpen(false); toast('SO created'); }} />
    </div>
  );
};

const NewSOModal = ({ open, onClose, onCreate }) => {
  const [soNumber, setSoNumber] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [date, setDate] = useState('');
  const [licence, setLicence] = useState('');
  const [payload, setPayload] = useState('');
  const [weightRule, setWeightRule] = useState('');
  const [note, setNote] = useState('');
  useEffect(() => { if (open) {
    const today = new Date().toISOString().slice(0, 10);
    setSoNumber(''); setVendorId(''); setDate(today); setLicence('');
    setPayload(''); setWeightRule(''); setNote('');
  } }, [open]);
  return (
    <Modal open={open} onClose={onClose} title="New Sales Order" width={560}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={onCreate}>Create</Button>
      </>}>
      <FormFields {...{ soNumber, setSoNumber, vendorId, setVendorId, date, setDate,
        licence, setLicence, payload, setPayload, weightRule, setWeightRule, note, setNote }} />
    </Modal>
  );
};

const FormFields = ({ soNumber, setSoNumber, vendorId, setVendorId, date, setDate,
  licence, setLicence, payload, setPayload, weightRule, setWeightRule, note, setNote }) => {
  const vendor = mockData.vendors.find(v => String(v.id) === String(vendorId));
  const vendorDefault = vendor?.default_weight_rule;
  // Effective rule when weightRule empty = vendor default
  const effective = weightRule || vendorDefault || 'per_pallet';
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
      <Field label="SO Number"><Input value={soNumber} onChange={setSoNumber} placeholder="SO-2026-0001" /></Field>
      <Field label="Vendor">
        <Select value={String(vendorId || '')} onChange={setVendorId} placeholder="Select vendor"
          options={mockData.vendors.map(v => ({ value: String(v.id), label: v.name }))} />
      </Field>
      <Field label="Date"><Input value={date} onChange={setDate} type="date" /></Field>
      <Field label="Licence Number"><Input value={licence} onChange={setLicence} placeholder="TRK-00123" /></Field>
      <Field label="Payload Number" span={2}><Input value={payload} onChange={setPayload} placeholder="PLD-0200" /></Field>

      <Field label="Weight Rule" span={2}>
        <WeightRuleField vendor={vendor} value={weightRule} onChange={setWeightRule} />
      </Field>

      <Field label="Note" span={2}>
        <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Optional…" rows={3}
          style={{ width: '100%', padding: '6px 10px', border: '1px solid var(--hair-strong)',
            background: 'var(--surface)', borderRadius: 3, resize: 'vertical',
            fontFamily: 'inherit', fontSize: 13, outline: 'none', color: 'var(--ink)' }} />
      </Field>
    </div>
  );
};

const Field = ({ label, children, span = 1 }) => (
  <label style={{ gridColumn: `span ${span}`, display: 'flex', flexDirection: 'column', gap: 5 }}>
    <span style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase',
      color: 'var(--ink-3)' }}>{label}</span>
    {children}
  </label>
);

Object.assign(window, { SOListPage, Field, FormFields });

// ───────────────────────────────────────────────────────────── Weight Rule field
const WeightRuleField = ({ vendor, value, onChange }) => {
  const [expanded, setExpanded] = useState(false);
  useEffect(() => { setExpanded(false); }, [vendor?.id]);

  if (!vendor) {
    return (
      <div style={{ padding: '12px 14px', border: '1px dashed var(--hair-strong)',
        borderRadius: 3, background: 'var(--surface-2)',
        fontSize: 12, color: 'var(--ink-4)', fontStyle: 'italic' }}>
        Select a vendor to inherit its weight rule.
      </div>
    );
  }

  const vendorDefault = vendor.default_weight_rule;
  const effective = value || vendorDefault;
  const isOverride = value && value !== vendorDefault;
  const ruleLabel = (r) => r === 'per_pallet' ? 'Per Pallet' : 'Aggregated';
  const ruleDesc = (r) => r === 'per_pallet' ? 'Record each pallet separately' : 'One record, total weight + qty';

  return (
    <div style={{ border: '1px solid var(--hair-strong)', borderRadius: 3,
      background: 'var(--surface)', overflow: 'hidden' }}>
      {/* Collapsed summary row */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '12px 14px', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, color: 'var(--ink)' }}>{ruleLabel(effective)}</span>
            {!isOverride && (
              <span style={{ fontSize: 10.5, color: 'var(--ink-4)',
                letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                inherited from {vendor.name}
              </span>
            )}
            {isOverride && (
              <span style={{ fontSize: 10.5, color: 'var(--warn, #a56b1f)',
                letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 500 }}>
                overrides {vendor.name} default
              </span>
            )}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 2 }}>
            {ruleDesc(effective)}
          </div>
        </div>
        <button type="button" onClick={() => setExpanded(e => !e)}
          style={{ background: 'var(--surface-2)', border: '1px solid var(--hair-strong)',
            borderRadius: 3, padding: '5px 10px', fontSize: 11.5, color: 'var(--ink-2)',
            cursor: 'pointer', letterSpacing: '0.04em', fontFamily: 'inherit' }}>
          {expanded ? 'Done' : (isOverride ? 'Edit' : 'Change')}
        </button>
      </div>

      {/* Expanded options */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--hair)', background: 'var(--surface-2)',
          padding: '10px 14px 12px' }}>
          <div style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase',
            color: 'var(--ink-4)', marginBottom: 8 }}>Override for this SO</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {['per_pallet', 'aggregated'].map(r => {
              const checked = effective === r;
              const isDefault = vendorDefault === r;
              return (
                <label key={r} style={{ display: 'flex', alignItems: 'flex-start', gap: 10,
                  padding: '8px 10px', cursor: 'pointer', borderRadius: 3,
                  background: checked ? 'var(--surface)' : 'transparent',
                  border: '1px solid ' + (checked ? 'var(--hair-strong)' : 'transparent') }}>
                  <span style={{ width: 14, height: 14, borderRadius: '50%',
                    border: '1.25px solid ' + (checked ? 'var(--ink)' : 'var(--ink-5)'),
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, marginTop: 1 }}>
                    {checked && <span style={{ width: 7, height: 7, borderRadius: '50%',
                      background: 'var(--ink)' }}/>}
                  </span>
                  <input type="radio" checked={checked}
                    onChange={() => onChange(isDefault ? '' : r)}
                    style={{ display: 'none' }} />
                  <div style={{ flex: 1, lineHeight: 1.4 }}>
                    <div style={{ fontSize: 12.5, color: 'var(--ink)' }}>
                      {ruleLabel(r)}
                      {isDefault && (
                        <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--ink-4)',
                          letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                          {vendor.name} default
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{ruleDesc(r)}</div>
                  </div>
                </label>
              );
            })}
          </div>

          {isOverride && (
            <div style={{ marginTop: 10, padding: '8px 10px',
              border: '1px solid #e8d4ae', background: '#faf3e4', borderRadius: 3,
              display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                stroke="#a56b1f" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
                style={{ flexShrink: 0, marginTop: 1 }}>
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <div style={{ fontSize: 11.5, color: '#7a4e12', lineHeight: 1.5 }}>
                Overriding <b style={{ fontWeight: 500 }}>{vendor.name}</b> default. This applies only to this SO —
                the vendor's default rule is unchanged.
              </div>
            </div>
          )}

          {!isOverride && (
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--ink-4)', lineHeight: 1.5 }}>
              Leave on the vendor default unless this shipment uses a different rule.
            </div>
          )}
        </div>
      )}
    </div>
  );
};

Object.assign(window, { WeightRuleField });
