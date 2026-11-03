/**
 * Splits a pallet's checklist quantities across the boards (MPNs) on that pallet, for the
 * export's "Chip Total Qty" — so each pallet's rows add up to exactly its checklist total.
 *
 * The checklist counts pieces per pallet, not per board type, but every board yields one
 * chip per slot — so a board type's share is bounded by its slots (boards × qty per board):
 *
 *  - A chip in only one of the pallet's boards' BOMs goes to that board.
 *  - A chip several boards share first fills each board's REMAINING slot capacity, in
 *    proportion to it — parts unique to one board are placed first, so 28 K4B1G on 31
 *    0WW9TT boards leave only 3 of its memory slots for the D9SFT both boards use. When the
 *    checklist matches the board qty (see Pallet.checklist_check) this gives exactly
 *    boards × slots per board type, the figures on the paper checklist.
 *  - Pieces beyond the capacity (checklist > boards), chips with no slot info (variable-qty
 *    modules) and chips no board's BOM lists (typed by hand) are split in proportion to board
 *    qty (equally if all are 0).
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
  /** Part number → the slot it fills on this board (alternates share one). Optional. */
  slotOf?: Map<string, string>;
  /** Slot → pieces this pallet's boards can hold there (boards × qty per board). */
  slotCap?: Map<string, number>;
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
  const used = new Map<string, number>();   // `${row key}|${slot}` → pieces placed so far
  const add = (r: SplitBoardRow, n: number) => exact.set(r.key, exact.get(r.key)! + n);
  const byBoards = (targets: SplitBoardRow[], qty: number) => {
    const weight = targets.reduce((n, r) => n + Math.max(r.boards, 0), 0);
    for (const r of targets) add(r, qty * (weight > 0 ? Math.max(r.boards, 0) / weight : 1 / targets.length));
  };

  // Parts fewer boards share go first, so a shared part only takes the slots left over.
  const owners = (l: SplitLine) => (byPallet.get(l.palletId) ?? []).filter(r => r.chipKeys.has(l.chipKey));
  const ordered = lines.map((l, i) => ({ l, i, n: owners(l).length }))
    .sort((a, b) => (a.n || Infinity) - (b.n || Infinity) || a.i - b.i);

  for (const { l: line } of ordered) {
    const onPallet = byPallet.get(line.palletId);
    if (!onPallet?.length || !(line.qty > 0)) continue;
    const own = owners(line);
    if (!own.length) { byBoards(onPallet, line.qty); continue; }
    const slotted = own.every(r => r.slotOf?.has(line.chipKey) && r.slotCap);
    if (!slotted) { byBoards(own, line.qty); continue; }

    const slotKey = (r: SplitBoardRow) => `${r.key}|${r.slotOf!.get(line.chipKey)}`;
    const rem = own.map(r => Math.max((r.slotCap!.get(r.slotOf!.get(line.chipKey)!) ?? 0) - (used.get(slotKey(r)) ?? 0), 0));
    const totalRem = rem.reduce((a, b) => a + b, 0);
    const fill = Math.min(line.qty, totalRem);
    own.forEach((r, i) => {
      const n = totalRem > 0 ? fill * rem[i] / totalRem : 0;
      add(r, n);
      used.set(slotKey(r), (used.get(slotKey(r)) ?? 0) + n);
    });
    if (line.qty > fill) byBoards(own, line.qty - fill);
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
