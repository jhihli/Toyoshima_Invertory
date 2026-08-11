'use client';
/**
 * MSFT Report — Microsoft Recycling API (Buyback) reporting panel for one SO.
 * Rendered as the "MSFT Report" tab on /sos/[id]. Four sections:
 *   ① Job info   ② Credit units (Memory/CPU only)   ③ PO doc + PNR   ④ Logs
 * Preview = dry-run (assemble JSON, no send). Push = live PUT to Microsoft.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Input, Select, Badge, useToast } from '@/app/ui/components';
import { api } from '@/app/lib/api';
import type {
  MsftMeta, MsftJobInfo, MsftCreditUnit, MsftPaymentNotice, MsftApiLog,
} from '@/interface/IDatatable';

const REPORTS = [
  { key: 'credit' as const, label: 'Credit Details' },
  { key: 'podoc' as const, label: 'PO Document' },
  { key: 'pnr' as const, label: 'Payment Notification' },
];

const cellInput: React.CSSProperties = {
  border: '1px solid var(--hair-strong)', borderRadius: 3, padding: '4px 7px',
  fontSize: 12, outline: 'none', background: 'var(--surface)', color: 'var(--ink)',
  width: '100%', fontFamily: 'inherit', boxSizing: 'border-box',
};
const th: React.CSSProperties = {
  textAlign: 'left', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase',
  color: 'var(--ink-4)', fontWeight: 600, padding: '6px 8px', whiteSpace: 'nowrap',
};
const td: React.CSSProperties = { padding: '4px 6px', verticalAlign: 'middle' };

function statusTone(s: string): 'ok' | 'err' | 'warn' | 'neutral' {
  return s === 'ok' ? 'ok' : s === 'error' ? 'err' : s === 'dryrun' ? 'warn' : 'neutral';
}

// Local (not UTC) today as YYYY-MM-DD — used as the default Date Sold for new units.
function todayISO(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export default function MsftReportPanel({ soId }: { soId: number }) {
  const toast = useToast();
  const [meta, setMeta] = useState<MsftMeta | null>(null);
  const [job, setJob] = useState<MsftJobInfo | null>(null);
  const [units, setUnits] = useState<MsftCreditUnit[]>([]);
  const [notices, setNotices] = useState<MsftPaymentNotice[]>([]);
  const [logs, setLogs] = useState<MsftApiLog[]>([]);
  const [preview, setPreview] = useState<{ report: string; json: unknown } | null>(null);
  const [busy, setBusy] = useState<string>('');
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    const [m, j, u, n, l] = await Promise.all([
      api.msft.meta(), api.msft.getJob(soId), api.msft.creditUnits.list(soId),
      api.msft.paymentNotices.list(soId), api.msft.logs(soId),
    ]);
    setMeta(m); setJob(j); setUnits(u); setNotices(n); setLogs(l);
  }, [soId]);

  // Load once per SO. `toast` is intentionally NOT a dep — including it can loop
  // (each toast re-renders the provider → new toast fn → effect re-runs → refetch → fail → toast…).
  useEffect(() => {
    let alive = true;
    reload().catch(() => { if (alive) toast('Failed to load MSFT data'); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload]);

  // ─── Job info ─────────────────────────────────────────────
  const patchJob = (field: keyof MsftJobInfo, value: string) =>
    setJob(j => (j ? { ...j, [field]: value } : j));
  const saveJob = async () => {
    if (!job) return;
    setBusy('job');
    try {
      const saved = await api.msft.saveJob(soId, {
        supplier_job_type: job.supplier_job_type, ms_company_code: job.ms_company_code,
        supplier_po_number: job.supplier_po_number, supplier_po_currency: job.supplier_po_currency,
        billing_country: job.billing_country, job_status: job.job_status,
      });
      setJob(saved); toast('Job info saved');
    } catch { toast('Save failed'); } finally { setBusy(''); }
  };

  // ─── Credit units ─────────────────────────────────────────
  const addUnit = async () => {
    try {
      const created = await api.msft.creditUnits.create(soId, {
        supplier_unit_id: '', unit_type: 'Memory', quantity: 1,
        date_sold: todayISO(),
        supplier_po_number: job?.supplier_po_number || '',
      });
      setUnits(u => [...u, created]);
    } catch { toast('Add failed'); }
  };
  const patchUnitLocal = (id: number, field: keyof MsftCreditUnit, value: string) =>
    setUnits(us => us.map(u => (u.id === id ? { ...u, [field]: value } : u)));
  const saveUnit = async (u: MsftCreditUnit, field: keyof MsftCreditUnit) => {
    try { await api.msft.creditUnits.update(soId, u.id, { [field]: (u as any)[field] }); }
    catch (e: any) { toast(String(e?.message || 'Update failed').slice(0, 120)); reload(); }
  };
  const delUnit = async (id: number) => {
    try { await api.msft.creditUnits.delete(soId, id); setUnits(us => us.filter(u => u.id !== id)); }
    catch { toast('Delete failed'); }
  };

  // ─── PO document ──────────────────────────────────────────
  const onPickPo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy('po-upload');
    try { const saved = await api.msft.uploadPo(soId, f); setJob(saved); toast('PO uploaded'); }
    catch { toast('Upload failed'); } finally { setBusy(''); if (fileRef.current) fileRef.current.value = ''; }
  };

  // ─── Payment notices ──────────────────────────────────────
  const addNotice = async () => {
    try {
      const created = await api.msft.paymentNotices.create(soId, {
        supplier_po_number: job?.supplier_po_number || '', supplier_po_currency: job?.supplier_po_currency || 'USD',
      });
      setNotices(n => [...n, created]);
    } catch { toast('Add failed'); }
  };
  const patchNoticeLocal = (id: number, field: keyof MsftPaymentNotice, value: string) =>
    setNotices(ns => ns.map(n => (n.id === id ? { ...n, [field]: value } : n)));
  const saveNotice = async (n: MsftPaymentNotice, field: keyof MsftPaymentNotice) => {
    try { await api.msft.paymentNotices.update(soId, n.id, { [field]: (n as any)[field] }); }
    catch { toast('Update failed'); reload(); }
  };
  const delNotice = async (id: number) => {
    try { await api.msft.paymentNotices.delete(soId, id); setNotices(ns => ns.filter(n => n.id !== id)); }
    catch { toast('Delete failed'); }
  };

  // ─── Push / preview ───────────────────────────────────────
  const run = async (report: 'credit' | 'podoc' | 'pnr', dry: boolean) => {
    setBusy(`${report}-${dry ? 'preview' : 'push'}`);
    try {
      const log = await api.msft.push(soId, report, dry);
      setLogs(ls => [log, ...ls]);
      if (dry) {
        if (log.status === 'error') toast(log.error?.slice(0, 160) || 'Validation error');
        else setPreview({ report, json: log.request_payload });
      } else if (log.status === 'ok') {
        toast(`${report} pushed — ${log.success_count} accepted`);
      } else {
        toast(log.error?.slice(0, 160) || `${report} returned errors`);
      }
    } catch (e: any) { toast(String(e?.message || 'Push failed').slice(0, 160)); }
    finally { setBusy(''); }
  };

  const okFor = (r: string) => logs.some(l => l.report_type === r && l.status === 'ok');

  if (!meta || !job) return <div style={{ padding: 24, color: 'var(--ink-4)', fontSize: 13 }}>Loading…</div>;

  const companyOpts = meta.company_codes.map(c => ({ value: c.code, label: `${c.code} — ${c.country}` }));
  const unitTypeOpts = meta.buyback_unit_types.map(t => ({ value: t, label: t }));

  return (
    <div style={{ padding: '16px 4px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* header: env + progress */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Badge tone={meta.environment === 'prod' ? 'err' : 'blue'}>
          {meta.environment.toUpperCase()}
        </Badge>
        <span style={{ fontSize: 11, color: 'var(--ink-4)' }}>Supplier {meta.supplier_id}</span>
        <div style={{ flex: 1 }} />
        {REPORTS.map(r => (
          <Badge key={r.key} tone={okFor(r.key) ? 'ok' : 'neutral'}>
            {r.label} {okFor(r.key) ? '✓' : '○'}
          </Badge>
        ))}
      </div>

      {/* ① Job info */}
      <Section title="① Job Info">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
          <Lbl t="Job Type"><Input value={job.supplier_job_type} onChange={v => patchJob('supplier_job_type', v)} size="sm" /></Lbl>
          <Lbl t="Company Code">
            <Select value={job.ms_company_code} onChange={v => patchJob('ms_company_code', v)} options={companyOpts} placeholder="Select…" size="sm" style={{ width: '100%' }} />
          </Lbl>
          <Lbl t="PO Number"><Input value={job.supplier_po_number} onChange={v => patchJob('supplier_po_number', v)} size="sm" /></Lbl>
          <Lbl t="PO Currency"><Input value={job.supplier_po_currency} onChange={v => patchJob('supplier_po_currency', v)} size="sm" /></Lbl>
          <Lbl t="Billing Country"><Input value={job.billing_country} onChange={v => patchJob('billing_country', v)} size="sm" /></Lbl>
          <Lbl t="Job Status"><Input value={job.job_status} onChange={v => patchJob('job_status', v)} size="sm" /></Lbl>
        </div>
        <div style={{ marginTop: 10 }}>
          <Button size="sm" variant="primary" onClick={saveJob} disabled={busy === 'job'}>Save</Button>
        </div>
      </Section>

      {/* ② Credit units */}
      <Section title="② Credit Details (sold chips · Memory / CPU / Other)"
        action={<Button size="sm" variant="outline" onClick={addUnit}>+ Add unit</Button>}>
        {units.length === 0 ? <Muted>No units yet. Click "+ Add unit".</Muted> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
              <thead><tr style={{ borderBottom: '1px solid var(--hair)' }}>
                {['Unit ID', 'Type', 'Date Sold', 'Sale Price', 'Commission', 'MS Rev Share', 'PO Number', 'Qty', ''].map((h, i) =>
                  <th key={i} style={th}>{h}</th>)}
              </tr></thead>
              <tbody>
                {units.map(u => (
                  <tr key={u.id} style={{ borderBottom: '1px solid var(--hair)' }}>
                    <td style={{ ...td, minWidth: 120 }}><input style={cellInput} value={u.supplier_unit_id} onChange={e => patchUnitLocal(u.id, 'supplier_unit_id', e.target.value)} onBlur={() => saveUnit(u, 'supplier_unit_id')} /></td>
                    <td style={{ ...td, minWidth: 90 }}><Select value={u.unit_type} onChange={v => { patchUnitLocal(u.id, 'unit_type', v); api.msft.creditUnits.update(soId, u.id, { unit_type: v }).catch(() => toast('Update failed')); }} options={unitTypeOpts} size="sm" style={{ width: '100%' }} /></td>
                    <td style={{ ...td, minWidth: 130 }}><input type="date" style={cellInput} value={u.date_sold || ''} onChange={e => patchUnitLocal(u.id, 'date_sold', e.target.value)} onBlur={() => saveUnit(u, 'date_sold')} /></td>
                    <td style={{ ...td, minWidth: 90 }}><input style={cellInput} value={u.sale_price ?? ''} onChange={e => patchUnitLocal(u.id, 'sale_price', e.target.value)} onBlur={() => saveUnit(u, 'sale_price')} /></td>
                    <td style={{ ...td, minWidth: 90 }}><input style={cellInput} value={u.supplier_commission ?? ''} onChange={e => patchUnitLocal(u.id, 'supplier_commission', e.target.value)} onBlur={() => saveUnit(u, 'supplier_commission')} /></td>
                    <td style={{ ...td, minWidth: 90 }}><input style={cellInput} value={u.ms_revenue_share ?? ''} onChange={e => patchUnitLocal(u.id, 'ms_revenue_share', e.target.value)} onBlur={() => saveUnit(u, 'ms_revenue_share')} /></td>
                    <td style={{ ...td, minWidth: 110 }}><input style={cellInput} value={u.supplier_po_number} onChange={e => patchUnitLocal(u.id, 'supplier_po_number', e.target.value)} onBlur={() => saveUnit(u, 'supplier_po_number')} /></td>
                    <td style={{ ...td, width: 56 }}><input style={cellInput} value={String(u.quantity ?? '')} onChange={e => patchUnitLocal(u.id, 'quantity', e.target.value)} onBlur={() => saveUnit(u, 'quantity')} /></td>
                    <td style={{ ...td, width: 30 }}><button onClick={() => delUnit(u.id)} title="Delete" style={{ border: 0, background: 'none', cursor: 'pointer', color: 'var(--err, #c0392b)', fontSize: 15 }}>×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <PushRow label="Credit Details" report="credit" busy={busy} onPreview={() => run('credit', true)} onPush={() => run('credit', false)} />
      </Section>

      {/* ③ PO Document */}
      <Section title="③ PO Document">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <input ref={fileRef} type="file" accept="application/pdf" onChange={onPickPo} style={{ fontSize: 12 }} />
          {job.po_document_name && <Badge tone="ok">{job.po_document_name}</Badge>}
          {job.po_document_name && <button onClick={async () => { await api.msft.deletePo(soId); setJob(await api.msft.getJob(soId)); }} style={{ border: 0, background: 'none', cursor: 'pointer', color: 'var(--ink-4)', fontSize: 12 }}>Remove</button>}
          <span style={{ fontSize: 11, color: 'var(--ink-4)' }}>PO number is taken from Job Info above (must already exist in Credit).</span>
        </div>
        <PushRow label="PO Document" report="podoc" busy={busy} onPreview={() => run('podoc', true)} onPush={() => run('podoc', false)}
          pushDisabled={!okFor('credit')} lockHint="Push Credit Details first" />
      </Section>

      {/* ④ Payment Notifications */}
      <Section title="④ Payment Notification(PNR)"
        action={<Button size="sm" variant="outline" onClick={addNotice}>+ Add payment</Button>}>
        {notices.length === 0 ? <Muted>No payment notices yet.</Muted> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
              <thead><tr style={{ borderBottom: '1px solid var(--hair)' }}>
                {['PO Number', 'Currency', 'MS Invoice #', 'Payment Date', 'Amount', 'Amount USD', ''].map((h, i) => <th key={i} style={th}>{h}</th>)}
              </tr></thead>
              <tbody>
                {notices.map(n => (
                  <tr key={n.id} style={{ borderBottom: '1px solid var(--hair)' }}>
                    <td style={{ ...td, minWidth: 120 }}><input style={cellInput} value={n.supplier_po_number} onChange={e => patchNoticeLocal(n.id, 'supplier_po_number', e.target.value)} onBlur={() => saveNotice(n, 'supplier_po_number')} /></td>
                    <td style={{ ...td, width: 70 }}><input style={cellInput} value={n.supplier_po_currency} onChange={e => patchNoticeLocal(n.id, 'supplier_po_currency', e.target.value)} onBlur={() => saveNotice(n, 'supplier_po_currency')} /></td>
                    <td style={{ ...td, minWidth: 120 }}><input style={cellInput} value={n.ms_invoice_number} onChange={e => patchNoticeLocal(n.id, 'ms_invoice_number', e.target.value)} onBlur={() => saveNotice(n, 'ms_invoice_number')} /></td>
                    <td style={{ ...td, minWidth: 130 }}><input type="date" style={cellInput} value={n.payment_date || ''} onChange={e => patchNoticeLocal(n.id, 'payment_date', e.target.value)} onBlur={() => saveNotice(n, 'payment_date')} /></td>
                    <td style={{ ...td, minWidth: 90 }}><input style={cellInput} value={n.payment_amount ?? ''} onChange={e => patchNoticeLocal(n.id, 'payment_amount', e.target.value)} onBlur={() => saveNotice(n, 'payment_amount')} /></td>
                    <td style={{ ...td, minWidth: 90 }}><input style={cellInput} value={n.payment_amount_usd ?? ''} onChange={e => patchNoticeLocal(n.id, 'payment_amount_usd', e.target.value)} onBlur={() => saveNotice(n, 'payment_amount_usd')} /></td>
                    <td style={{ ...td, width: 30 }}><button onClick={() => delNotice(n.id)} title="Delete" style={{ border: 0, background: 'none', cursor: 'pointer', color: 'var(--err, #c0392b)', fontSize: 15 }}>×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <PushRow label="Payment Notification" report="pnr" busy={busy} onPreview={() => run('pnr', true)} onPush={() => run('pnr', false)}
          pushDisabled={!okFor('podoc')} lockHint="Push PO Document first" />
      </Section>

      {/* preview modal */}
      {preview && (
        <div onClick={() => setPreview(null)} style={{ position: 'fixed', inset: 0, zIndex: 900, background: 'rgba(20,18,14,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 30 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', borderRadius: 6, maxWidth: 760, width: '100%', maxHeight: '82vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,0.4)' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--hair)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <strong style={{ fontSize: 13 }}>Preview JSON — {preview.report} (dry-run, not sent)</strong>
              <button onClick={() => setPreview(null)} style={{ border: 0, background: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--ink-4)' }}>×</button>
            </div>
            <pre style={{ margin: 0, padding: 16, overflow: 'auto', fontSize: 12, lineHeight: 1.5, fontFamily: 'ui-monospace, monospace', color: 'var(--ink)' }}>
              {JSON.stringify(preview.json, null, 2)}
            </pre>
          </div>
        </div>
      )}

      {/* ⑤ Logs */}
      <Section title="Report history">
        {logs.length === 0 ? <Muted>No report history yet.</Muted> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {logs.map(l => (
              <details key={l.id} style={{ border: '1px solid var(--hair)', borderRadius: 4, padding: '6px 10px' }}>
                <summary style={{ cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8, listStyle: 'none' }}>
                  <Badge tone={statusTone(l.status)}>{l.status}</Badge>
                  <span style={{ fontWeight: 500 }}>{l.report_type}</span>
                  {l.http_status != null && <span style={{ color: 'var(--ink-4)' }}>{l.http_status}</span>}
                  <span style={{ color: 'var(--ink-4)' }}>{new Date(l.created_at).toLocaleString()}</span>
                  {l.correlation_id && <span style={{ color: 'var(--ink-4)', fontSize: 10.5, fontFamily: 'monospace' }}>{l.correlation_id.slice(0, 8)}…</span>}
                  {l.error_count > 0 && <Badge tone="err">{l.error_count} err</Badge>}
                </summary>
                {l.error && <div style={{ fontSize: 11.5, color: 'var(--err, #c0392b)', marginTop: 6, whiteSpace: 'pre-wrap' }}>{l.error}</div>}
                {(l.response as unknown) != null && (
                  <pre style={{ margin: '6px 0 0', fontSize: 11, overflow: 'auto', maxHeight: 200, fontFamily: 'monospace', color: 'var(--ink-2)' }}>
                    {JSON.stringify(l.response, null, 2)}
                  </pre>
                )}
              </details>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

// ─── small presentational helpers ─────────────────────────────
function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ border: '1px solid var(--hair)', borderRadius: 6, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)' }}>{title}</div>
        {action}
      </div>
      {children}
    </div>
  );
}
function Lbl({ t, children }: { t: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-4)' }}>{t}</span>
      {children}
    </label>
  );
}
function Muted({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, color: 'var(--ink-4)', padding: '6px 0' }}>{children}</div>;
}
function PushRow({ label, report, busy, onPreview, onPush, pushDisabled, lockHint }: {
  label: string; report: string; busy: string; onPreview: () => void; onPush: () => void;
  pushDisabled?: boolean; lockHint?: string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, paddingTop: 10, borderTop: '1px dashed var(--hair)' }}>
      {/* Preview (dry-run) is always allowed — no order dependency. */}
      <Button size="sm" variant="ghost" onClick={onPreview} disabled={!!busy}>Preview JSON</Button>
      <Button size="sm" variant="primary" onClick={onPush} disabled={!!busy || !!pushDisabled}>
        {busy === `${report}-push` ? 'Pushing…' : `Push ${label} → MSFT`}
      </Button>
      {pushDisabled && lockHint && (
        <span style={{ fontSize: 11, color: 'var(--ink-4)' }}>🔒 {lockHint}</span>
      )}
    </div>
  );
}
