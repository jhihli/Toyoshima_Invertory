'use client';
import React, { useEffect, useState } from 'react';
import { api } from '@/app/lib/api';
import type { ChecklistCheck } from '@/interface/IDatatable';
import { CardSty, Th, ThR, Td, TdR } from './parts';

/** Checklist vs board qty, per chip slot, under an MSFT pallet's checklist. Read-only: every
 *  board yields one chip per slot, so the expected count is Σ boards × qty per board — the
 *  same figures the paper checklist carries per board type ("0WW9TT-SLKM8: 31"). A red row
 *  means the checklist or the Boards tab needs fixing before the export can be trusted.
 *  `version` changes whenever the checklist reloads, so the check follows every edit. */
export default function ChecklistCheckPanel({ palletId, version, boardsHref }: {
  palletId: number; version: number; boardsHref?: string;
}) {
  const [check, setCheck] = useState<ChecklistCheck | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    api.pallets.checklistCheck(palletId)
      .then(c => { if (alive) { setCheck(c); setFailed(false); } })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [palletId, version]);

  if (failed) return <div style={{ ...CardSty, marginTop: 14, padding: '12px 16px', fontSize: 13, color: '#b91c1c' }}>Couldn&apos;t load the board-qty check.</div>;
  if (!check || check.status === 'none') return null;

  const bad = check.slots.filter(s => s.status === 'mismatch').length + check.unmatched.length;
  const banner = {
    ok: { bg: '#eef6f0', fg: 'var(--accent-2)', text: 'Checklist matches the board qty.' },
    mismatch: { bg: '#fef2f2', fg: '#b91c1c', text: `${bad} item${bad !== 1 ? 's' : ''} don't match the board qty — fix the checklist or the Boards tab.` },
    incomplete: { bg: '#fffbeb', fg: '#a86b00', text: 'Some lines have no model or qty yet — the check is final once they are filled in.' },
  }[check.status];

  const mark = (s: ChecklistCheck['slots'][number]) =>
    s.status === 'ok' ? <span style={{ color: 'var(--accent-2)', fontWeight: 700 }}>✓</span>
      : <span style={{ color: '#b91c1c', fontWeight: 700 }}>{s.diff > 0 ? `+${s.diff}` : s.diff}</span>;

  return (
    <div style={{ ...CardSty, marginTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '12px 16px', borderBottom: '1px solid var(--hair)' }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Board qty check</h2>
        <span style={{ fontSize: 12.5, padding: '3px 10px', borderRadius: 99, background: banner.bg, color: banner.fg, fontWeight: 600 }}>{banner.text}</span>
        {check.status === 'mismatch' && boardsHref && (
          <a href={boardsHref} style={{ marginLeft: 'auto', fontSize: 12.5, color: 'var(--accent-2)', fontWeight: 600 }}>Open Boards tab →</a>
        )}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
          <thead>
            <tr>
              <th style={Th}>Chip slot</th>
              <th style={ThR} title="Σ boards × qty per board, from the Boards tab">From boards</th>
              <th style={ThR} title="Checklist lines for this slot, NG lines included">Checklist</th>
              <th style={ThR}>Check</th>
            </tr>
          </thead>
          <tbody>
            {/* A slot no line names (this batch lacks the chip, e.g. no AST1050) is not shown. */}
            {check.slots.filter(s => s.status !== 'absent').map(s => (
              <tr key={s.label} style={{ background: s.status === 'mismatch' ? '#fef2f2' : 'transparent' }}>
                <td style={Td}>
                  <span style={{ fontWeight: 600 }}>{s.label}</span>
                  {s.parts.length > 1 || (s.parts.length === 1 && s.parts[0].chip_mpn !== s.label) ? (
                    <div style={{ fontSize: 11.5, color: 'var(--ink-4)', marginTop: 2 }}>
                      {s.parts.map(p => `${p.chip_mpn} ${p.qty}`).join(' + ')}
                    </div>
                  ) : null}
                </td>
                <td style={{ ...TdR, fontVariantNumeric: 'tabular-nums' }}>{s.expected}</td>
                <td style={{ ...TdR, fontVariantNumeric: 'tabular-nums', color: 'var(--ink-2)' }}>{s.actual}</td>
                <td style={TdR}>{mark(s)}</td>
              </tr>
            ))}
            {check.unmatched.map((u, i) => (
              <tr key={`u${i}`} style={{ background: '#fef2f2' }}>
                <td style={Td}>
                  <span className="mono" style={{ fontWeight: 600 }}>{u.model}</span>
                  <div style={{ fontSize: 11.5, color: '#b91c1c', marginTop: 2 }}>Not on any board of this pallet — check the spelling</div>
                </td>
                <td style={{ ...TdR, color: 'var(--ink-5)' }}>—</td>
                <td style={{ ...TdR, fontVariantNumeric: 'tabular-nums' }}>{u.qty}</td>
                <td style={TdR}><span style={{ color: '#b91c1c', fontWeight: 700 }}>?</span></td>
              </tr>
            ))}
            {check.modules.map(m => (
              <tr key={`m${m.label}`}>
                <td style={Td}>
                  <span style={{ fontWeight: 600 }}>{m.label}</span>
                  <div style={{ fontSize: 11.5, color: 'var(--ink-4)', marginTop: 2 }}>Counted per piece — no fixed qty per board, not checked</div>
                </td>
                <td style={{ ...TdR, color: 'var(--ink-5)' }}>NA</td>
                <td style={{ ...TdR, fontVariantNumeric: 'tabular-nums' }}>{m.actual}</td>
                <td style={TdR}></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
