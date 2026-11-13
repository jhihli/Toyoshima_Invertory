'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Button, Badge, useToast } from '@/app/ui/components';
import { apiErrorMessage, apiGet } from '@/app/lib/api';
import { useIsMobile } from '@/app/ui/hooks/useIsMobile';
import {
  scanApi, type ChecklistScan, type ScanDraft, type DraftMpn, type DraftLine, type ScanOverrides, type ScanCheck,
} from '@/app/lib/checklistScanApi';

/**
 * Review one checklist photo: the photo beside (desktop) or above (phone) the server's
 * draft. Yellow = the reader or matcher isn't sure; red = something won't add up or can't
 * be applied. Choices (tick a chip addition, use the sheet's value, keep a board count,
 * delete an empty trailing row) are flipped in the draft; content edits (a part number,
 * a qty, a capacity class, which MPN a header means) are sent back as overrides and the
 * server rebuilds the draft, so plans are only ever derived on the server. The
 * reconciliation shown is Pallet.checklist_check() run on the would-be state.
 */

const YELLOW = '#f5eedf';
const YELLOW_LINE = '#e4d9b6';
const RED = '#f3e2dd';
const RED_LINE = '#e4c4bb';

type MpnOption = { id: number; name: string };

export default function ChecklistScanReview({ scanId, onClose, onConfirmed }: {
  scanId: number; onClose: () => void; onConfirmed: () => void;
}) {
  const isMobile = useIsMobile();
  const toast = useToast();
  const [scan, setScan] = useState<ChecklistScan | null>(null);
  const [draft, setDraft] = useState<ScanDraft | null>(null);
  const [check, setCheck] = useState<ScanCheck | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [photoOpen, setPhotoOpen] = useState(true);
  const [zoom, setZoom] = useState(false);
  const [mpnOptions, setMpnOptions] = useState<MpnOption[]>([]);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readOnly = scan?.status !== 'ready';

  useEffect(() => {
    let alive = true;
    scanApi.get(scanId).then(s => {
      if (!alive) return;
      setScan(s);
      const d = (s.status === 'confirmed' ? s.confirmed : null) ?? s.draft ?? null;
      setDraft(d);
      setCheck(d?.check ?? null);
    }).catch(e => setError(apiErrorMessage(e) || 'Could not load the scan.'));
    apiGet<MpnOption[]>('/mpns/').then(list => { if (alive) setMpnOptions(list.map(m => ({ id: m.id, name: m.name }))); })
      .catch(() => {});
    return () => { alive = false; };
  }, [scanId]);

  useEffect(() => { if (isMobile) setPhotoOpen(false); }, [isMobile]);

  /** A choice changed in the draft: keep it locally, refresh the reconciliation. */
  const choose = (mutate: (d: ScanDraft) => void) => {
    if (!draft || readOnly) return;
    const next: ScanDraft = JSON.parse(JSON.stringify(draft));
    mutate(next);
    setDraft(next);
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(() => {
      scanApi.preview(scanId, next).then(r => setCheck(r.check)).catch(() => {});
    }, 500);
  };

  /** A content edit: the server rebuilds the draft (no model call), keeping current ticks. */
  const rebuild = useCallback(async (body: { pallet_id?: number; overrides?: ScanOverrides }) => {
    if (!draft) return;
    setBusy(true);
    setError('');
    try {
      const s = await scanApi.rebuild(scanId, {
        ...body, previous: { mpns: draft.mpns, lines: draft.lines, delete_rows: draft.delete_rows },
      });
      setScan(s);
      setDraft(s.draft ?? null);
      setCheck(s.draft?.check ?? null);
    } catch (e) {
      setError(apiErrorMessage(e) || 'Could not update the draft.');
    } finally {
      setBusy(false);
    }
  }, [draft, scanId]);

  const confirm = async () => {
    if (!draft) return;
    setBusy(true);
    setError('');
    try {
      const s = await scanApi.confirm(scanId, draft);
      const r = s.result ?? {};
      toast(`Saved: ${r.filled ?? 0} filled, ${r.created ?? 0} added, ${r.replaced ?? 0} replaced, ${r.deleted ?? 0} deleted`);
      onConfirmed();
    } catch (e) {
      setError(apiErrorMessage(e) || 'Confirm failed.');
    } finally {
      setBusy(false);
    }
  };

  const discard = async () => {
    setBusy(true);
    try { await scanApi.discard(scanId); toast('Discarded'); onClose(); }
    catch (e) { setError(apiErrorMessage(e) || 'Discard failed.'); }
    finally { setBusy(false); }
  };

  const blocking = !draft || !draft.pallet_id || draft.errors.length > 0;
  const title = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      Checklist photo #{scanId}
      {scan && scan.status !== 'ready' && <Badge tone={scan.status === 'confirmed' ? 'ok' : 'neutral'}>{scan.status}</Badge>}
    </span>
  );

  const footer = readOnly ? (
    <Button variant="outline" onClick={onClose} style={{ height: 44 }}>Close</Button>
  ) : (
    <>
      <Button variant="ghost" onClick={discard} disabled={busy} style={{ height: 44, marginRight: 'auto' }}>Discard</Button>
      <Button variant="outline" onClick={onClose} disabled={busy} style={{ height: 44 }}>Later</Button>
      <Button variant="primary" onClick={confirm} disabled={busy || blocking} style={{ height: 44, padding: '0 20px' }}
        title={blocking ? 'Fix the red items first' : 'Write this to the pallet'}>
        {busy ? 'Working…' : 'Confirm'}
      </Button>
    </>
  );

  return (
    <Modal open onClose={onClose} title={title} width={1280} footer={footer}>
      {!draft ? (
        <div style={{ padding: 24, color: error ? 'var(--err)' : 'var(--ink-4)' }}>{error || 'Loading…'}</div>
      ) : (
        <div style={{
          display: 'grid', gap: isMobile ? 14 : 20, alignItems: 'start',
          gridTemplateColumns: isMobile ? 'minmax(0,1fr)' : 'minmax(0,5fr) minmax(0,7fr)',
        }}>
          {/* Photo */}
          <div style={isMobile ? undefined : { position: 'sticky', top: 0 }}>
            {isMobile && (
              <button onClick={() => setPhotoOpen(v => !v)} style={{ ...plainBtn, marginBottom: 6 }}>
                {photoOpen ? 'Hide photo ▲' : 'Show photo ▼'}
              </button>
            )}
            {(photoOpen || !isMobile) && scan?.image_url && (
              <div onClick={() => setZoom(z => !z)} style={{
                border: '1px solid var(--hair)', borderRadius: 4, background: 'var(--surface-2)',
                overflow: 'auto', maxHeight: isMobile ? '55vh' : 'calc(100vh - 250px)', cursor: zoom ? 'zoom-out' : 'zoom-in',
              }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={scan.image_url} alt="Checklist sheet"
                  style={zoom ? { width: '200%', maxWidth: 'none', display: 'block' } : { width: '100%', display: 'block' }} />
              </div>
            )}
            {(photoOpen || !isMobile) && (
              <div style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 4 }}>Tap the photo to zoom.</div>
            )}
          </div>

          {/* Draft */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0, opacity: busy ? 0.6 : 1 }}>
            {error && <Banner tone="red">{error}</Banner>}
            {draft.errors.map((e, i) => <Banner key={`e${i}`} tone="red">{e}</Banner>)}
            {draft.warnings.map((w, i) => <Banner key={`w${i}`} tone="yellow">{w}</Banner>)}

            <PalletSection draft={draft} readOnly={readOnly} onPick={id => rebuild({ pallet_id: id })} />
            <BoardsSection draft={draft} readOnly={readOnly} mpnOptions={mpnOptions} isMobile={isMobile}
              onChoose={choose} onOverride={o => rebuild({ overrides: o })} />
            <LinesSection draft={draft} readOnly={readOnly} isMobile={isMobile}
              onChoose={choose} onOverride={o => rebuild({ overrides: o })} />
            <RowsSection draft={draft} readOnly={readOnly} onChoose={choose} />
            {check && <CheckSection check={check} />}
            {draft.notes && <Banner tone="neutral">Reader&apos;s notes: {draft.notes}</Banner>}
          </div>
        </div>
      )}
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────── sections

function Section({ title, children, extra }: { title: string; children: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <div style={{ border: '1px solid var(--hair)', borderRadius: 4, background: 'var(--surface)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '10px 12px', borderBottom: '1px solid var(--hair)' }}>
        <span style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-3)', fontWeight: 600 }}>{title}</span>
        {extra}
      </div>
      <div style={{ padding: 12 }}>{children}</div>
    </div>
  );
}

function PalletSection({ draft, readOnly, onPick }: { draft: ScanDraft; readOnly: boolean; onPick: (id: number) => void }) {
  const l = draft.label;
  return (
    <Section title="Pallet">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <select value={draft.pallet_id ?? ''} disabled={readOnly}
          onChange={e => e.target.value && onPick(Number(e.target.value))}
          style={{ ...fieldSty, minWidth: 220, background: draft.pallet_id ? 'var(--surface)' : RED }}>
          {!draft.pallet_id && <option value="">Pick the pallet…</option>}
          {draft.pallet_options.map(p => <option key={p.id} value={p.id}>{p.label} — {p.barcode}</option>)}
        </select>
        <span style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>
          Label: <b className="mono">{l.so_number || '—'}</b> · <b className="mono">{l.pallet_barcode || '—'}</b> ·{' '}
          <span style={l.weight_mismatch ? { background: YELLOW, padding: '1px 4px', borderRadius: 3 } : undefined}>
            {l.weight_text || '—'}{l.weight_mismatch && l.stored_weight != null ? ` (stored ${l.stored_weight} lb — not changed)` : ''}
          </span>
        </span>
      </div>
    </Section>
  );
}

function BoardsSection({ draft, readOnly, mpnOptions, isMobile, onChoose, onOverride }: {
  draft: ScanDraft; readOnly: boolean; mpnOptions: MpnOption[]; isMobile: boolean;
  onChoose: (m: (d: ScanDraft) => void) => void; onOverride: (o: ScanOverrides) => void;
}) {
  return (
    <Section title="Board types (MPN)" extra={<span style={{ fontSize: 11.5, color: 'var(--ink-4)' }}>from the header notes</span>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {draft.mpns.map((m, i) => (
          <MpnCard key={m.key} m={m} readOnly={readOnly} mpnOptions={mpnOptions} isMobile={isMobile}
            onChoose={fn => onChoose(d => fn(d.mpns[i]))} onOverride={o => onOverride({ mpns: { [m.key]: o } })} />
        ))}
        {draft.mpns.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--ink-4)' }}>No board types were read from the header.</div>}
        {draft.missing_pallet_mpns.map(x => (
          <Banner key={x.mpn_id} tone="yellow">{x.name} ({x.board_qty ?? '—'} boards) is on this pallet but not on the sheet — kept as is.</Banner>
        ))}
      </div>
    </Section>
  );
}

function MpnCard({ m, readOnly, mpnOptions, isMobile, onChoose, onOverride }: {
  m: DraftMpn; readOnly: boolean; mpnOptions: MpnOption[]; isMobile: boolean;
  onChoose: (fn: (m: DraftMpn) => void) => void;
  onOverride: (o: NonNullable<ScanOverrides['mpns']>[string]) => void;
}) {
  const y = (f: string) => m.yellow.includes(f);
  const [newName, setNewName] = useState(m.new_name);
  const [qty, setQty] = useState(m.board_qty == null ? '' : String(m.board_qty));
  useEffect(() => { setNewName(m.new_name); setQty(m.board_qty == null ? '' : String(m.board_qty)); }, [m.new_name, m.board_qty]);
  const conflict = m.current_board_qty != null && m.current_board_qty !== m.board_qty;
  const options = [
    ...m.suggestions.map(s => ({ id: s.id, name: s.name })),
    ...mpnOptions.filter(o => !m.suggestions.some(s => s.id === o.id) && o.id === m.mpn_id),
    ...mpnOptions.filter(o => !m.suggestions.some(s => s.id === o.id) && o.id !== m.mpn_id),
  ];
  const additions = m.chips.filter(c => !c.exists);
  const existing = m.chips.filter(c => c.exists);
  return (
    <div style={{ border: `1px solid ${y('mpn') || y('board_qty') ? YELLOW_LINE : 'var(--hair)'}`, borderRadius: 4, padding: 10, opacity: m.skip ? 0.55 : 1 }}>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0,1fr) 130px', gap: 10, alignItems: 'end' }}>
        <label style={{ display: 'block', minWidth: 0 }}>
          <span style={miniLabel}>Sheet: <b className="mono" style={{ color: 'var(--ink)' }}>{m.text || '—'}</b>
            {m.match === 'near' && ' · close match, check it'}{m.match === 'new' && ' · not found — new MPN'}</span>
          <select disabled={readOnly} value={m.mpn_id ?? 'new'}
            onChange={e => e.target.value === 'new' ? onOverride({ mpn_id: null, new_name: newName || m.text })
              : onOverride({ mpn_id: Number(e.target.value) })}
            style={{ ...fieldSty, width: '100%', background: y('mpn') ? YELLOW : 'var(--surface)' }}>
            {options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            <option value="new">➕ New MPN…</option>
          </select>
        </label>
        <label style={{ display: 'block' }}>
          <span style={miniLabel}>Boards</span>
          <input inputMode="numeric" value={qty} disabled={readOnly}
            onChange={e => setQty(e.target.value.replace(/[^\d]/g, ''))}
            onBlur={() => { const n = qty === '' ? null : Number(qty); if (n !== m.board_qty) onOverride({ board_qty: n }); }}
            style={{ ...fieldSty, width: '100%', background: y('board_qty') ? YELLOW : 'var(--surface)' }} />
        </label>
      </div>
      {m.mpn_id == null && (
        <label style={{ display: 'block', marginTop: 8 }}>
          <span style={miniLabel}>New MPN name</span>
          <input value={newName} disabled={readOnly} onChange={e => setNewName(e.target.value)}
            onBlur={() => newName.trim() && newName !== m.new_name && onOverride({ mpn_id: null, new_name: newName.trim() })}
            style={{ ...fieldSty, width: '100%', background: YELLOW }} />
        </label>
      )}
      {conflict && (
        <div style={{ marginTop: 8, padding: 8, background: YELLOW, borderRadius: 3, fontSize: 12.5 }}>
          This pallet already has <b>{m.current_board_qty}</b> boards of it; the sheet says <b>{m.board_qty ?? '—'}</b>.
          <div style={{ display: 'flex', gap: 14, marginTop: 6, flexWrap: 'wrap' }}>
            <Radio checked={m.board_qty_choice === 'sheet'} disabled={readOnly} onChange={() => onChoose(x => { x.board_qty_choice = 'sheet'; })}>Use sheet ({m.board_qty ?? '—'})</Radio>
            <Radio checked={m.board_qty_choice === 'keep'} disabled={readOnly} onChange={() => onChoose(x => { x.board_qty_choice = 'keep'; })}>Keep {m.current_board_qty}</Radio>
          </div>
        </div>
      )}
      <div style={{ marginTop: 8, fontSize: 12, color: 'var(--ink-3)' }}>
        Chips: {existing.map(c => (
          <span key={c.part} className="mono" style={chipTag} title={c.note || undefined}>
            {c.part}{c.slot_group ? ` · ${c.slot_group}` : ''}{c.note ? ' ⚠' : ''}
          </span>
        ))}
        {existing.length === 0 && additions.length === 0 && <span>none listed</span>}
      </div>
      {additions.map(c => (
        <label key={c.part} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 6, padding: '6px 8px', minHeight: 40,
          background: c.shared ? YELLOW : 'var(--surface-2)', borderRadius: 3, fontSize: 12.5, cursor: readOnly ? 'default' : 'pointer' }}>
          <input type="checkbox" checked={c.apply} disabled={readOnly} style={checkSty}
            onChange={e => onChoose(x => { const t = x.chips.find(k => k.part === c.part); if (t) t.apply = e.target.checked; })} />
          <span>
            Add <b className="mono">{c.part}</b>{c.brand ? ` (${c.brand})` : ''}{c.slot_group ? `, slot ${c.slot_group}` : ''} to MPN <b>{m.name || m.text}</b>
            {c.shared && <span style={{ color: '#a87a2b' }}> — affects all orders using this MPN</span>}
          </span>
        </label>
      ))}
      {m.unresolved.map(u => (
        <div key={u.text} style={{ marginTop: 6, padding: 8, background: YELLOW, borderRadius: 3, fontSize: 12.5 }}>
          Couldn&apos;t tell which part <b className="mono">{u.text}</b> means.{' '}
          <select disabled={readOnly} defaultValue="" style={{ ...fieldSty, height: 36 }}
            onChange={e => e.target.value && onOverride({ items: { [u.text]: e.target.value } })}>
            <option value="">Pick…</option>
            {u.options.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      ))}
      {m.notes.map((n, i) => <div key={i} style={{ fontSize: 11.5, color: 'var(--ink-4)', marginTop: 4 }}>{n}</div>)}
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 12, color: 'var(--ink-3)', minHeight: 32 }}>
        <input type="checkbox" checked={m.skip} disabled={readOnly} style={checkSty} onChange={e => onChoose(x => { x.skip = e.target.checked; })} />
        Leave this board type out
      </label>
    </div>
  );
}

const ACTION_TEXT: Record<DraftLine['action'], string> = {
  fill: 'fill in', same: 'already there', conflict: 'differs', create: 'add new', flag: 'not applied',
};

function LinesSection({ draft, readOnly, isMobile, onChoose, onOverride }: {
  draft: ScanDraft; readOnly: boolean; isMobile: boolean;
  onChoose: (m: (d: ScanDraft) => void) => void; onOverride: (o: ScanOverrides) => void;
}) {
  const counts = draft.lines.reduce<Record<string, number>>((a, l) => ({ ...a, [l.action]: (a[l.action] ?? 0) + 1 }), {});
  return (
    <Section title="Checklist lines" extra={
      <span style={{ fontSize: 11.5, color: 'var(--ink-4)' }}>
        {Object.entries(counts).map(([k, n]) => `${n} ${ACTION_TEXT[k as DraftLine['action']]}`).join(' · ')}
      </span>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {draft.lines.map((l, i) => (
          <LineRow key={`${l.index}-${i}`} l={l} readOnly={readOnly} isMobile={isMobile} classes={draft.capacity_classes}
            onChoose={fn => onChoose(d => fn(d.lines[i]))}
            onOverride={onOverride} />
        ))}
        {draft.lines.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--ink-4)' }}>No lines were read.</div>}
      </div>
    </Section>
  );
}

function LineRow({ l, readOnly, isMobile, classes, onChoose, onOverride }: {
  l: DraftLine; readOnly: boolean; isMobile: boolean; classes: string[];
  onChoose: (fn: (l: DraftLine) => void) => void; onOverride: (o: ScanOverrides) => void;
}) {
  const [part, setPart] = useState(l.part);
  const [qty, setQty] = useState(l.qty == null ? '' : String(l.qty));
  useEffect(() => { setPart(l.part); setQty(l.qty == null ? '' : String(l.qty)); }, [l.part, l.qty]);
  const y = (f: string) => l.yellow.includes(f);
  const key = String(l.index);
  const listId = `cand-${l.index}-${l.raw_model}`;
  const red = l.action === 'flag';
  const capChoices = Array.from(new Set([...(l.capacity_options.length ? l.capacity_options : classes), ...(l.capacity ? [l.capacity] : []), '1G', '2G']));
  const commitPart = () => { if (part.trim() !== l.part) onOverride({ lines: { [key]: { part: part.trim() } } }); };
  const commitQty = () => { const n = qty === '' ? null : Number(qty); if (n !== l.qty) onOverride({ lines: { [key]: { qty: n } } }); };
  const editable = !readOnly && l.index != null;
  return (
    <div style={{
      border: `1px solid ${red ? RED_LINE : l.action === 'conflict' ? YELLOW_LINE : 'var(--hair)'}`,
      background: red ? RED : 'transparent', borderRadius: 4, padding: 8,
    }}>
      <div style={{ display: 'grid', gap: 8, alignItems: 'end',
        gridTemplateColumns: isMobile ? '52px minmax(0,1fr) 84px' : '52px minmax(0,1.6fr) 90px 92px minmax(0,1fr)' }}>
        <div>
          <span style={miniLabel}>#</span>
          <div className="mono" style={{ fontSize: 16, fontWeight: 600, padding: '8px 0', background: y('index') ? YELLOW : undefined }}>{l.index ?? '?'}</div>
        </div>
        <label style={{ minWidth: 0 }}>
          <span style={miniLabel}>{l.brand ? `${l.brand} · ` : ''}part{l.raw_model && l.raw_model !== l.part ? ` (read “${l.raw_model}”)` : ''}</span>
          <input list={listId} value={part} disabled={!editable} onChange={e => setPart(e.target.value.toUpperCase())}
            onBlur={commitPart} onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            className="mono" style={{ ...fieldSty, width: '100%', background: y('part') ? YELLOW : 'var(--surface)' }} />
          <datalist id={listId}>{l.candidates.map(c => <option key={c} value={c} />)}</datalist>
        </label>
        <label>
          <span style={miniLabel}>Qty</span>
          <input inputMode="numeric" value={qty} disabled={!editable} onChange={e => setQty(e.target.value.replace(/[^\d]/g, ''))}
            onBlur={commitQty} onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            style={{ ...fieldSty, width: '100%', textAlign: 'right', background: y('qty') ? YELLOW : 'var(--surface)' }} />
        </label>
        <label style={isMobile ? { gridColumn: '1 / span 2' } : undefined}>
          <span style={miniLabel}>Memory</span>
          <select value={l.capacity ?? ''} disabled={!editable || !l.part}
            onChange={e => onOverride({ capacity: { [l.part]: e.target.value } })}
            style={{ ...fieldSty, width: '100%', background: y('capacity') ? YELLOW : 'var(--surface)' }}>
            <option value="">—</option>
            {capChoices.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <div style={{ fontSize: 12, color: red ? 'var(--err)' : 'var(--ink-3)', alignSelf: 'center', ...(isMobile ? {} : {}) }}>
          <b>{ACTION_TEXT[l.action]}</b>
          {l.capacity_source && l.capacity && <div style={{ fontSize: 11, color: 'var(--ink-4)' }}>{l.capacity} via {l.capacity_source}</div>}
        </div>
      </div>
      {l.flag && <div style={{ fontSize: 12, color: 'var(--err)', marginTop: 6 }}>{l.flag}</div>}
      {l.action === 'conflict' && l.existing && (
        <div style={{ marginTop: 8, padding: 8, background: YELLOW, borderRadius: 3, fontSize: 12.5 }}>
          The system already has <b className="mono">{[l.existing.brand, l.existing.model].filter(Boolean).join(' ') || '—'}</b> × <b>{l.existing.qty ?? '—'}</b> on #{l.index}.
          <div style={{ display: 'flex', gap: 14, marginTop: 6, flexWrap: 'wrap' }}>
            <Radio checked={!l.use_sheet} disabled={readOnly} onChange={() => onChoose(x => { x.use_sheet = false; })}>Keep the system&apos;s</Radio>
            <Radio checked={l.use_sheet} disabled={readOnly} onChange={() => onChoose(x => { x.use_sheet = true; })}>Use the sheet&apos;s</Radio>
          </div>
        </div>
      )}
    </div>
  );
}

function RowsSection({ draft, readOnly, onChoose }: {
  draft: ScanDraft; readOnly: boolean; onChoose: (m: (d: ScanDraft) => void) => void;
}) {
  if (!draft.delete_rows.length && !draft.extra_rows.length) return null;
  return (
    <Section title="Rows not on the sheet">
      {draft.delete_rows.map((r, i) => (
        <label key={r.row_id} style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 40, fontSize: 12.5, cursor: 'pointer' }}>
          <input type="checkbox" checked={r.apply} disabled={readOnly} style={checkSty}
            onChange={e => onChoose(d => { d.delete_rows[i].apply = e.target.checked; })} />
          Delete empty label <b className="mono">#{r.index}</b> <span style={{ color: 'var(--ink-4)' }}>(printed but not used)</span>
        </label>
      ))}
      {draft.extra_rows.map(r => (
        <div key={r.row_id} style={{ fontSize: 12.5, padding: '6px 0', color: '#a87a2b' }}>
          #{r.index ?? '?'} {r.model ? <span className="mono">{r.model} × {r.qty ?? '—'}</span> : ''} — {r.reason}; left as it is.
        </div>
      ))}
    </Section>
  );
}

function CheckSection({ check }: { check: ScanCheck }) {
  const head = {
    ok: { tone: 'ok' as const, text: 'Adds up: every chip slot matches its boards.' },
    mismatch: { tone: 'err' as const, text: "Doesn't add up — check the red rows (you may still confirm)." },
    incomplete: { tone: 'warn' as const, text: 'Some lines have no part or qty yet.' },
    none: { tone: 'neutral' as const, text: 'Nothing to check yet.' },
    error: { tone: 'err' as const, text: check.error || 'This draft cannot be applied as it is.' },
  }[check.status];
  return (
    <Section title="Reconciliation" extra={<Badge tone={head.tone}>{head.text}</Badge>}>
      <div className="table-scroll">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 320 }}>
          <thead>
            <tr style={{ color: 'var(--ink-3)', fontSize: 11, textAlign: 'left' }}>
              <th style={cell}>Slot</th><th style={{ ...cell, textAlign: 'right' }}>Boards say</th>
              <th style={{ ...cell, textAlign: 'right' }}>Lines say</th><th style={{ ...cell, textAlign: 'right' }} />
            </tr>
          </thead>
          <tbody>
            {check.slots.filter(s => s.status !== 'absent').map(s => (
              <tr key={s.label} style={{ background: s.status === 'mismatch' ? RED : undefined }}>
                <td style={cell}>
                  <b>{s.label}</b>
                  {s.parts.length > 1 && <div style={{ fontSize: 11, color: 'var(--ink-4)' }}>{s.parts.map(p => `${p.chip_mpn} ${p.qty}`).join(' + ')}</div>}
                </td>
                <td style={{ ...cell, textAlign: 'right' }} className="num">{s.expected}</td>
                <td style={{ ...cell, textAlign: 'right' }} className="num">{s.actual}</td>
                <td style={{ ...cell, textAlign: 'right', fontWeight: 700, color: s.status === 'ok' ? 'var(--accent-2)' : 'var(--err)' }}>
                  {s.status === 'ok' ? '✓' : (s.diff > 0 ? `+${s.diff}` : s.diff)}
                </td>
              </tr>
            ))}
            {check.unmatched.map((u, i) => (
              <tr key={`u${i}`} style={{ background: RED }}>
                <td style={cell} colSpan={4}><b className="mono">{u.model}</b> × {u.qty} — on no board of this pallet (tick its chip addition, or fix the part)</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

// ─────────────────────────────────────────────────────────── bits

function Banner({ tone, children }: { tone: 'red' | 'yellow' | 'neutral'; children: React.ReactNode }) {
  const c = tone === 'red' ? { bg: RED, b: RED_LINE, fg: '#a8402b' } : tone === 'yellow' ? { bg: YELLOW, b: YELLOW_LINE, fg: '#7a5a1f' }
    : { bg: 'var(--surface-2)', b: 'var(--hair)', fg: 'var(--ink-3)' };
  return <div style={{ padding: '8px 12px', background: c.bg, border: `1px solid ${c.b}`, borderRadius: 4, color: c.fg, fontSize: 13 }}>{children}</div>;
}

function Radio({ checked, disabled, onChange, children }: { checked: boolean; disabled?: boolean; onChange: () => void; children: React.ReactNode }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 36, cursor: disabled ? 'default' : 'pointer' }}>
      <input type="radio" checked={checked} disabled={disabled} onChange={onChange} style={checkSty} />
      {children}
    </label>
  );
}

// 16px text keeps iOS Safari from zooming the page when a field is focused.
const fieldSty: React.CSSProperties = {
  height: 40, padding: '0 10px', border: '1px solid var(--hair-strong)', borderRadius: 3,
  fontSize: 16, fontFamily: 'inherit', color: 'var(--ink)', boxSizing: 'border-box', outline: 'none',
};
const miniLabel: React.CSSProperties = { display: 'block', fontSize: 11, color: 'var(--ink-4)', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const checkSty: React.CSSProperties = { width: 20, height: 20, flexShrink: 0, margin: 0 };
const chipTag: React.CSSProperties = { display: 'inline-block', padding: '1px 6px', margin: '2px 4px 2px 0', border: '1px solid var(--hair)', borderRadius: 3, background: 'var(--surface-2)', fontSize: 11.5 };
const cell: React.CSSProperties = { padding: '6px 8px', borderBottom: '1px solid var(--hair)' };
const plainBtn: React.CSSProperties = { background: 'none', border: '1px solid var(--hair-strong)', borderRadius: 3, padding: '8px 12px', fontSize: 13, fontFamily: 'inherit', cursor: 'pointer', color: 'var(--ink-2)', minHeight: 40 };
