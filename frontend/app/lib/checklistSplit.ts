/**
 * Splits a pallet's checklist quantities across the boards (MPNs) on that pallet, for the
 * export's "Chip Total Qty" — so each pallet's rows add up to exactly its checklist total.
 *
 *  - A chip in only one of the pallet's boards' BOMs goes to that board.
 *  - A chip several of its boards share (or that no board's BOM lists, i.e. typed by hand)
 *    is split between those boards in proportion to their board qty (equally if all are 0).
 *  - Totals are whole chips: per pallet, the fractional parts are rounded with the largest-
 *    remainder method, so rounding never changes the pallet total.
 *
 * Kept free of React / ExcelJS so it can be run on its own.
 */

export interface SplitBoardRow {
  /** Any id unique per (pallet, MPN) row. */
  key: string;
  palletId: number;
  boards: number;
  /** Normalised part numbers in this MPN's BOM. */
  chipKeys: Set<string>;
}

export interface SplitLine {
  palletId: number;
  /** Normalised part number of the checklist line. */
  chipKey: string;
  qty: number;
}

export function splitChecklistByBoard(rows: SplitBoardRow[], lines: SplitLine[]): Map<string, number> {
  const out = new Map<string, number>(rows.map(r => [r.key, 0]));
  const byPallet = new Map<number, SplitBoardRow[]>();
  for (const r of rows) byPallet.set(r.palletId, [...(byPallet.get(r.palletId) ?? []), r]);

  const exact = new Map<string, number>(rows.map(r => [r.key, 0]));
  for (const line of lines) {
    const onPallet = byPallet.get(line.palletId);
    if (!onPallet?.length || !(line.qty > 0)) continue;
    const owners = onPallet.filter(r => r.chipKeys.has(line.chipKey));
    const targets = owners.length ? owners : onPallet;
    const weight = targets.reduce((n, r) => n + Math.max(r.boards, 0), 0);
    for (const r of targets) {
      const share = weight > 0 ? Math.max(r.boards, 0) / weight : 1 / targets.length;
      exact.set(r.key, exact.get(r.key)! + line.qty * share);
    }
  }

  for (const palletRows of byPallet.values()) {
    const total = Math.round(palletRows.reduce((n, r) => n + exact.get(r.key)!, 0));
    const floors = palletRows.map(r => ({ r, f: Math.floor(exact.get(r.key)! + 1e-9) }));
    let left = total - floors.reduce((n, x) => n + x.f, 0);
    const byRemainder = [...floors].sort((a, b) =>
      (exact.get(b.r.key)! - b.f) - (exact.get(a.r.key)! - a.f));
    for (const x of byRemainder) {
      if (left <= 0) break;
      x.f += 1; left -= 1;
    }
    for (const x of floors) out.set(x.r.key, x.f);
  }
  return out;
}
