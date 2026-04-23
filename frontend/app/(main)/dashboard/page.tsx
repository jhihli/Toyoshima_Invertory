'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Button, Card, Breadcrumbs, Select, Empty, useToast, thS, tdS,
} from '@/app/ui/components';
import { api } from '@/app/lib/api';
import type { DashboardStats } from '@/interface/IDatatable';

export default function DashboardPage() {
  const router = useRouter();
  const toast = useToast();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState('30');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.dashboard.stats();
      setStats(data);
    } catch { toast('Failed to load dashboard'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading || !stats) {
    return <div style={{ padding: '24px 28px', color: 'var(--ink-3)', fontSize: 13 }}>Loading…</div>;
  }

  const d = stats.daily_counts;
  const W = 800, H = 180, P = { t: 16, r: 16, b: 24, l: 28 };
  const maxY = Math.max(...d.map(x => x.count), 1);
  const xs = (i: number) => P.l + (W - P.l - P.r) * (i / Math.max(d.length - 1, 1));
  const ys = (v: number) => H - P.b - (H - P.t - P.b) * (v / maxY);
  const linePath = d.map((p, i) => (i === 0 ? 'M' : 'L') + xs(i).toFixed(1) + ' ' + ys(p.count).toFixed(1)).join(' ');
  const areaPath = linePath + ` L ${xs(d.length - 1).toFixed(1)} ${H - P.b} L ${xs(0).toFixed(1)} ${H - P.b} Z`;

  const topV = stats.top_vendors;
  const maxV = Math.max(...topV.map(v => v.board_count), 1);
  const total = d.reduce((s, x) => s + x.count, 0);
  const avg = d.length ? (total / d.length).toFixed(1) : '0.0';

  const kpis = [
    { label: "Today's SOs",        value: stats.today_so_count,      delta: null, sub: 'sales orders today' },
    { label: 'Pallets this month', value: stats.pallets_this_month,  delta: null, sub: 'physical pallets received' },
  ];

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
          <Select value={range} onChange={setRange} options={[
            { value: '7', label: 'Last 7 days' },
            { value: '30', label: 'Last 30 days' },
            { value: '90', label: 'Last 90 days' },
          ]} />
          <Button variant="outline" icon={<DownloadIcon />} onClick={() => toast('Report generated')}>Report</Button>
        </div>
      </div>

      {/* KPIs */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 0,
        border: '1px solid var(--hair)', borderRadius: 3, background: 'var(--surface)', marginBottom: 24,
      }}>
        {kpis.map((k, i) => (
          <div key={k.label} style={{ padding: '20px 22px', borderRight: i < 1 ? '1px solid var(--hair)' : 'none' }}>
            <div style={{ fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-4)', lineHeight: 1.5, whiteSpace: 'nowrap' }}>{k.label}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 10 }}>
              <div className="num" style={{ fontSize: 28, fontWeight: 400, letterSpacing: '-0.02em' }}>{k.value}</div>
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 4 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 20, marginBottom: 24 }}>
        <Card pad={0}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--hair)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-4)' }}>Daily SO count</div>
              <div style={{ fontSize: 13, color: 'var(--ink-2)', marginTop: 4 }}>Last 30 days</div>
            </div>
            <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--ink-3)' }}>
              <span><span className="num" style={{ color: 'var(--ink)' }}>{total}</span> total</span>
              <span><span className="num" style={{ color: 'var(--ink)' }}>{avg}</span> avg/day</span>
            </div>
          </div>
          <div style={{ padding: '16px 10px' }}>
            {d.length === 0 ? (
              <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--ink-4)', fontSize: 12 }}>No data</div>
            ) : (
              <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
                {[0.25, 0.5, 0.75, 1].map((f, i) => (
                  <line key={i} x1={P.l} x2={W - P.r}
                    y1={H - P.b - (H - P.t - P.b) * f} y2={H - P.b - (H - P.t - P.b) * f}
                    stroke="#e6e3dc" strokeDasharray="2 3" strokeWidth="1" />
                ))}
                {[0, Math.round(maxY / 2), maxY].map((v, i) => (
                  <text key={i} x={P.l - 6} y={ys(v) + 3} textAnchor="end"
                    style={{ fontSize: 9, fill: 'var(--ink-4)', fontFamily: 'inherit' }}>{v}</text>
                ))}
                <path d={areaPath} fill="#1a1917" fillOpacity="0.06" />
                <path d={linePath} fill="none" stroke="var(--ink)" strokeWidth="1.25"
                  strokeLinejoin="round" strokeLinecap="round" />
                {d.map((p, i) => i === d.length - 1 && (
                  <circle key={i} cx={xs(i)} cy={ys(p.count)} r="2.5" fill="var(--ink)" />
                ))}
                {[0, 7, 14, 21, 29].filter(i => i < d.length).map(i => (
                  <text key={i} x={xs(i)} y={H - 6} textAnchor="middle"
                    style={{ fontSize: 9, fill: 'var(--ink-4)', fontFamily: 'inherit' }}>
                    {d[i]?.date?.slice(5) || `D${i + 1}`}
                  </text>
                ))}
              </svg>
            )}
          </div>
        </Card>

        <Card pad={0}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--hair)' }}>
            <div style={{ fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-4)', lineHeight: 1.5, whiteSpace: 'nowrap' }}>Top vendors</div>
            <div style={{ fontSize: 13, color: 'var(--ink-2)', marginTop: 4 }}>By board count</div>
          </div>
          <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {topV.length === 0 ? (
              <div style={{ color: 'var(--ink-4)', fontSize: 12, textAlign: 'center', padding: '20px 0' }}>No data</div>
            ) : topV.map(v => {
              const pct = v.board_count / maxV;
              return (
                <div key={v.name}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 12.5 }}>{v.name}</span>
                    <span className="num" style={{ fontSize: 12, color: 'var(--ink-3)' }}>{v.board_count}</span>
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

      {/* Recent scans */}
      <Card pad={0}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--hair)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-4)', lineHeight: 1.5, whiteSpace: 'nowrap' }}>Recent scans</div>
            <div style={{ fontSize: 13, color: 'var(--ink-2)', marginTop: 4 }}>Last 10 boards</div>
          </div>
          <Button size="sm" variant="ghost" onClick={() => router.push('/sos')}>View all →</Button>
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
            {stats.recent_boards.length === 0 && (
              <tr><td colSpan={6}><Empty label="No recent scans" /></td></tr>
            )}
            {stats.recent_boards.map(b => (
              <RecentRow key={b.id} board={b} onClick={() => router.push(`/sos/${b.so_id}`)} />
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function RecentRow({ board, onClick }: { board: any; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <tr onClick={onClick}
      style={{ borderBottom: '1px solid var(--hair)', cursor: 'pointer', background: hover ? 'var(--surface-2)' : 'transparent' }}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <td style={tdS} className="mono">{board.barcode}</td>
      <td style={tdS} className="mono">{board.so_number}</td>
      <td style={tdS}>{board.vendor}</td>
      <td style={{ ...tdS, color: 'var(--ink-3)' }} className="mono">{board.mpn || '—'}</td>
      <td style={{ ...tdS, textAlign: 'right' }} className="num">{board.qty}</td>
      <td style={{ ...tdS, textAlign: 'right', color: 'var(--ink-3)' }} className="num">{board.scanned_at?.slice(0, 16)}</td>
    </tr>
  );
}

const DownloadIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);
