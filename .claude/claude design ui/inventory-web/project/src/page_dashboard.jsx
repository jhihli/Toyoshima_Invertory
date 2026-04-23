const DashboardPage = ({ onNav, onOpenSO }) => {
  const toast = useToast();

  // Physical pallets this month = Σ qty across Pallet records
  // (works correctly for both per-pallet and aggregated weight rules)
  const palletQtyTotal = mockData.sos.reduce((acc, s) =>
    acc + s.pallets.reduce((a, p) => a + (p.qty || 0), 0), 0);
  const todaysSOs = mockData.sos.filter(s => s.date === '2026-04-25').length || 7;

  const kpis = [
    { label: "Today's SOs",        value: todaysSOs,     delta: '+2',  sub: 'vs. yesterday',
      tip: 'Count of sales orders received today.' },
    { label: 'Pallets this month', value: palletQtyTotal, delta: '+6%', sub: 'vs. last month',
      tip: 'Total physical pallets received this month across all vendors (Σ qty).' },
  ];

  // Line chart for daily SO count (30 days)
  const d = mockData.dailyCounts;
  const W = 800, H = 180, P = { t: 16, r: 16, b: 24, l: 24 };
  const maxY = Math.max(...d.map(x => x.count));
  const xs = (i) => P.l + (W - P.l - P.r) * (i / (d.length - 1));
  const ys = (v) => H - P.b - (H - P.t - P.b) * (v / maxY);
  const path = d.map((p, i) => (i === 0 ? 'M' : 'L') + xs(i) + ' ' + ys(p.count)).join(' ');
  const area = path + ` L ${xs(d.length - 1)} ${H - P.b} L ${xs(0)} ${H - P.b} Z`;

  const topV = mockData.topVendors;
  const maxV = Math.max(...topV.map(v => v.count));

  return (
    <div className="fade-in" style={{ padding: '24px 28px 40px' }}>
      <Breadcrumbs items={[{ label: 'Home' }, { label: 'Dashboard' }]} />
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', margin: '14px 0 20px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 400, letterSpacing: '-0.015em' }}>Overview</h1>
          <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 4 }}>
            Receiving activity across all vendors and bays.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Select value="30" onChange={() => {}} options={[
            { value: '7', label: 'Last 7 days' },
            { value: '30', label: 'Last 30 days' },
            { value: '90', label: 'Last 90 days' },
          ]} />
          <Button variant="outline" icon={<Icons.Download size={13} />} onClick={() => toast('Report generated')}>Report</Button>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 0,
        border: '1px solid var(--hair)', borderRadius: 3, background: 'var(--surface)', marginBottom: 24 }}>
        {kpis.map((k, i) => (
          <div key={k.label} title={k.tip || ''} style={{ padding: '20px 22px',
            borderRight: i < 1 ? '1px solid var(--hair)' : 'none' }}>
            <div style={{ fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase',
              color: 'var(--ink-4)', lineHeight: 1.5, whiteSpace: 'nowrap' }}>{k.label}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 10 }}>
              <div className="num" style={{ fontSize: 28, fontWeight: 400, letterSpacing: '-0.02em' }}>{k.value}</div>
              <div className="num" style={{ fontSize: 11, color: 'var(--ink-3)' }}>{k.delta}</div>
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 4 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 20, marginBottom: 24 }}>
        <Card pad={0}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--hair)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase',
                color: 'var(--ink-4)' }}>Daily SO count</div>
              <div style={{ fontSize: 13, color: 'var(--ink-2)', marginTop: 4 }}>Last 30 days</div>
            </div>
            <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--ink-3)' }}>
              <span><span className="num" style={{ color: 'var(--ink)' }}>
                {d.reduce((s,x)=>s+x.count,0)}
              </span> total</span>
              <span><span className="num" style={{ color: 'var(--ink)' }}>
                {(d.reduce((s,x)=>s+x.count,0)/d.length).toFixed(1)}
              </span> avg/day</span>
            </div>
          </div>
          <div style={{ padding: '16px 10px' }}>
            <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
              {/* Gridlines */}
              {[0.25, 0.5, 0.75, 1].map((f, i) => (
                <line key={i} x1={P.l} x2={W - P.r}
                  y1={H - P.b - (H - P.t - P.b) * f} y2={H - P.b - (H - P.t - P.b) * f}
                  stroke="#e6e3dc" strokeDasharray="2 3" strokeWidth="1" />
              ))}
              {/* Y labels */}
              {[0, Math.round(maxY / 2), maxY].map((v, i) => (
                <text key={i} x={P.l - 6} y={ys(v) + 3} textAnchor="end"
                  style={{ fontSize: 9, fill: 'var(--ink-4)', fontFamily: 'inherit' }}>{v}</text>
              ))}
              {/* Area fill */}
              <path d={area} fill="#1a1917" fillOpacity="0.06" />
              {/* Line */}
              <path d={path} fill="none" stroke="var(--ink)" strokeWidth="1.25"
                strokeLinejoin="round" strokeLinecap="round" />
              {/* Dots */}
              {d.map((p, i) => (i === d.length - 1) && (
                <circle key={i} cx={xs(i)} cy={ys(p.count)} r="2.5" fill="var(--ink)" />
              ))}
              {/* X ticks */}
              {[0, 7, 14, 21, 29].map(i => (
                <text key={i} x={xs(i)} y={H - 6} textAnchor="middle"
                  style={{ fontSize: 9, fill: 'var(--ink-4)', fontFamily: 'inherit' }}>
                  {`Day ${i + 1}`}
                </text>
              ))}
            </svg>
          </div>
        </Card>

        <Card pad={0}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--hair)' }}>
            <div style={{ fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase',
              color: 'var(--ink-4)', lineHeight: 1.5, whiteSpace: 'nowrap' }}>Top vendors</div>
            <div style={{ fontSize: 13, color: 'var(--ink-2)', marginTop: 4 }}>By board count</div>
          </div>
          <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {topV.map(v => {
              const pct = v.count / maxV;
              return (
                <div key={v.name}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 12.5 }}>{v.name}</span>
                    <span className="num" style={{ fontSize: 12, color: 'var(--ink-3)' }}>{v.count}</span>
                  </div>
                  <div style={{ height: 4, background: 'var(--surface-2)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ width: `${pct * 100}%`, height: '100%', background: 'var(--ink)' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Recent activity */}
      <Card pad={0}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--hair)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase',
              color: 'var(--ink-4)', lineHeight: 1.5, whiteSpace: 'nowrap' }}>Recent scans</div>
            <div style={{ fontSize: 13, color: 'var(--ink-2)', marginTop: 4 }}>Last 10 boards</div>
          </div>
          <Button size="sm" variant="ghost" onClick={() => onNav('sos')}>View all →</Button>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thS}>Barcode</th>
              <th style={thS}>SO</th>
              <th style={thS}>Vendor</th>
              <th style={thS}>MPN</th>
              <th style={{ ...thS, textAlign: 'right' }}>Qty</th>
              <th style={{ ...thS, textAlign: 'right' }}>Scanned</th>
            </tr>
          </thead>
          <tbody>
            {mockData.recentBoards.map(b => (
              <tr key={b.id} style={{ borderBottom: '1px solid var(--hair)', cursor: 'pointer' }}
                onClick={() => { const so = mockData.sos.find(s => s.so_number === b.so_number); onOpenSO(so.id); }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <td style={tdS} className="mono">{b.barcode}</td>
                <td style={tdS} className="mono">{b.so_number}</td>
                <td style={tdS}>{b.vendor}</td>
                <td style={{ ...tdS, color: 'var(--ink-3)' }} className="mono">{b.mpn}</td>
                <td style={{ ...tdS, textAlign: 'right' }} className="num">{b.qty}</td>
                <td style={{ ...tdS, textAlign: 'right', color: 'var(--ink-3)' }} className="num">{b.scanned_at}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
};

Object.assign(window, { DashboardPage });
