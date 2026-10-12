'use client';
import React, { useState, useMemo, useRef, useEffect } from 'react';
import type { ChipCatalogEntry } from '@/interface/IDatatable';

/** Chip MPN field for the Add/Edit chip dialog: type freely, or pick an existing part number
 *  from every MPN's chips. The dropdown lists part numbers only; picking one hands the whole
 *  catalogue entry to `onPick` so the dialog can fill brand, type, item group and so on.
 *
 *  Part numbers are free text and typos split a part across reports (K4B1G164G vs
 *  K4B1G1646G), so a value one or two characters off an existing part gets a
 *  "did you mean" hint. It never blocks saving — a genuinely new part is still allowed. */

const norm = (s: string) => s.replace(/\s+/g, '').toUpperCase();

/** Edit distance, capped: returns `max + 1` as soon as it is clearly above `max`. */
function distance(a: string, b: string, max: number) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

export default function ChipMpnInput({ value, onChange, catalog, onPick, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  catalog: ChipCatalogEntry[];
  onPick: (entry: ChipCatalogEntry) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  const q = norm(value);
  const matches = useMemo(() => {
    if (!q) return catalog.slice(0, 50);
    return catalog.filter(e => norm(e.chip_mpn).includes(q)).slice(0, 50);
  }, [catalog, q]);

  const exact = !!q && catalog.some(e => norm(e.chip_mpn) === q);
  const nearMiss = useMemo(() => {
    if (!q || exact || q.length < 4) return null;
    let best: ChipCatalogEntry | null = null, bestD = 3;
    for (const e of catalog) {
      const d = distance(q, norm(e.chip_mpn), 2);
      if (d > 0 && d < bestD) { best = e; bestD = d; }
    }
    return best;
  }, [catalog, q, exact]);

  useEffect(() => { setActive(0); }, [q]);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (!boxRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const pick = (e: ChipCatalogEntry) => { onPick(e); setOpen(false); };

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <input value={value} placeholder={placeholder} autoComplete="off"
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={e => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { setOpen(true); return; }
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(i + 1, matches.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(i - 1, 0)); }
          else if (e.key === 'Enter' && open && matches[active]) { e.preventDefault(); pick(matches[active]); }
          else if (e.key === 'Escape' || e.key === 'Tab') setOpen(false);
        }}
        style={{ width: '100%', height: 36, boxSizing: 'border-box', border: '1px solid var(--hair-strong)', borderRadius: 3,
          padding: '0 10px', fontSize: 13, background: 'var(--surface)', color: 'var(--ink)', fontFamily: 'inherit', outline: 'none' }} />
      {open && matches.length > 0 && !exact && (
        <div role="listbox" style={{ position: 'absolute', zIndex: 20, top: 'calc(100% + 2px)', left: 0, right: 0, maxHeight: 220, overflowY: 'auto',
          background: 'var(--surface)', border: '1px solid var(--hair-strong)', borderRadius: 3, boxShadow: '0 6px 18px rgba(26,25,23,0.12)' }}>
          {matches.map((e, i) => (
            <div key={e.chip_mpn} role="option" aria-selected={i === active} className="mono"
              onMouseDown={ev => { ev.preventDefault(); pick(e); }}
              onMouseEnter={() => setActive(i)}
              style={{ padding: '6px 10px', fontSize: 12.5, cursor: 'pointer',
                background: i === active ? 'var(--accent-light)' : 'transparent' }}>
              {e.chip_mpn}
            </div>
          ))}
        </div>
      )}
      {nearMiss && (
        <div style={{ marginTop: 5, fontSize: 11.5, color: 'var(--warn, #a86b00)', lineHeight: 1.45 }}>
          Close to existing <b className="mono">{nearMiss.chip_mpn}</b> —{' '}
          <button type="button" onClick={() => pick(nearMiss)}
            style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', color: 'var(--accent-2)', fontWeight: 600, fontSize: 11.5, fontFamily: 'inherit', textDecoration: 'underline' }}>
            use it
          </button>
        </div>
      )}
    </div>
  );
}
