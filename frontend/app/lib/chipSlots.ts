import type { Chip, MPN } from '@/interface/IDatatable';

/**
 * A board MPN has a fixed number of chip SLOTS. One slot can be filled by any one of
 * several interchangeable parts — e.g. SP#789124-001 has 3 slots (FPGA, PCH, and one
 * DRAM slot that any of 5 part numbers can fill), not 5 chips.
 *
 * Chips sharing a non-empty `slot_group` are alternates for the same slot. Everything
 * downstream (chip-cut cost, Chip Total Qty, Board BOM columns) counts SLOTS, not chips.
 *
 * There are two grouping levels and they are NOT the same:
 *
 *  - Per-MPN slot (`buildSlots`) — used by Board BOM, Processing PCB, Activity Based,
 *    Service_Cost. The memory slot has 3 alternates on SP#0WW9TT, 5 on SP#789124-001,
 *    1 on B600GG1.
 *  - SO-wide slot union (`buildGlobalSlots`) — used by Processing chips only. It unions
 *    the memory slot across every MPN into a single row.
 */

export const CIRCULAR_CENTER = 'CHI90';
export const HARVEST_STATE = 'Residual PCBA Attached';
/** Container UID marking chips that failed the cut. Their qty is the "Chips failed" total. */
export const NG_UID = 'NG';

export const ITEM_GROUP_OPTIONS = [
  { value: '', label: '—' },
  { value: 'Controller', label: 'Controller' },
  { value: 'Memory', label: 'Memory' },
  { value: 'FPGA', label: 'FPGA' },
  { value: 'Capacitor', label: 'Capacitor' },
];

/**
 * Slot group pre-filled when a chip is tagged Memory. On these boards the DRAMs are the
 * interchangeable part, so this saves typing it every time.
 *
 * It is only a DEFAULT written into the field, never an implicit rule — a board with two
 * genuinely different Memory sockets (say DRAM + NAND) must be able to split them, and it
 * can, by editing the value. Item Group cannot drive grouping on its own: AST1050 and
 * SLKM8 are both 'Controller' yet occupy different slots.
 */
export const MEMORY_SLOT_GROUP = 'Memory';

/** chip_mpn is free text and already carries I/1 and S/5 typos — never key off it raw. */
export const normalizeChipMpn = (s: string | null | undefined) =>
  (s ?? '').trim().replace(/\s+/g, ' ').toUpperCase();

/** BOM qty of a chip on ONE board. Blank (not yet entered) counts as 1. */
export const qtyPerBoard = (c: Chip) => c.qty ?? 1;

const group = (c: Chip) => (c.slot_group ?? '').trim();

/** Per-MPN slot key: same slot_group on the same MPN => one slot. Blank => its own slot. */
export const mpnSlotKey = (c: Chip) => (group(c) ? `g:${group(c)}` : `c:${c.id}`);

/**
 * SO-wide slot key: unions the same slot_group ACROSS MPNs. Blank slot_group falls back
 * to the chip MPN, so SLKM8 appearing on 6 board MPNs still collapses to one row.
 */
export const globalSlotKey = (c: Chip) =>
  group(c) ? `g:${group(c)}` : `m:${normalizeChipMpn(c.chip_mpn)}`;

export interface Slot {
  key: string;
  chips: Chip[];
  /** Distinct chip MPNs filling this slot, in insertion order. */
  chipMpns: string[];
  /** Slash-joined chipMpns — how the slot renders in every sheet. */
  label: string;
  /** How many chips this slot contributes per board (normally 1). */
  qtyPerBoard: number;
}

/** Per-MPN slots. Chips are sorted by id so slash-join order follows insertion order. */
export function buildSlots(chips: Chip[] | null | undefined): Slot[] {
  const ordered = [...(chips ?? [])].sort((a, b) => a.id - b.id);
  const slots = new Map<string, Slot>();

  for (const c of ordered) {
    const key = mpnSlotKey(c);
    let slot = slots.get(key);
    if (!slot) {
      slot = { key, chips: [], chipMpns: [], label: '', qtyPerBoard: 0 };
      slots.set(key, slot);
    }
    slot.chips.push(c);
    const mpn = (c.chip_mpn ?? '').trim();
    if (mpn && !slot.chipMpns.includes(mpn)) slot.chipMpns.push(mpn);
    // Alternates share a slot, so the slot contributes the max of their per-board qty,
    // not the sum — only one of them is physically present on any given board.
    slot.qtyPerBoard = Math.max(slot.qtyPerBoard, qtyPerBoard(c));
  }

  for (const slot of slots.values()) slot.label = slot.chipMpns.join('/');
  return [...slots.values()];
}

/** Number of physical chip slots on one board of this MPN. The chip-cut cost divisor. */
export const slotCount = (chips: Chip[] | null | undefined) => buildSlots(chips).length;

/** Total chips harvested from ONE board of this MPN. Board BOM's "Chip Total Qty.". */
export const bomTotalQty = (chips: Chip[] | null | undefined) =>
  buildSlots(chips).reduce((n, s) => n + s.qtyPerBoard, 0);

export interface MpnEntry {
  mpn: MPN;
  chips: Chip[];
  /** Boards of this MPN in the SO being exported. */
  boardCount: number;
  latestDate: string;
}

export interface GlobalSlot {
  key: string;
  /** Union of every alternate seen for this slot across all MPNs, slash-joined. */
  label: string;
  /** Chips harvested: sum over MPNs of (boards of that MPN x the slot's per-board qty). */
  processedQty: number;
  /** Chips that failed the cut: sum of NG-container counts. */
  failedQty: number;
  date: string;
  chipIds: Set<number>;
}

/**
 * SO-wide slot union, for the Processing chips sheet.
 *
 * `processedQty` is DERIVED from board counts, never read from a stored quantity — that
 * is the whole point of the redesign. `failedQty` comes from containers whose UID is the
 * literal string "NG".
 *
 * A part cannot be an interchangeable alternate on one board and a standalone slot on
 * another — it is the same physical part either way. So if a chip MPN carries a slot group
 * ANYWHERE in the SO, an untagged copy of it elsewhere joins that group too. Without this,
 * one chip missing its Item Group silently splits the memory line into two billing rows.
 */
export function buildGlobalSlots(
  entries: MpnEntry[],
  ngQtyByChipId: Map<number, number>,
): GlobalSlot[] {
  const out = new Map<string, GlobalSlot>();
  // Biggest MPN first, so a slot's alternates are labelled in a stable, sensible order.
  const ordered = [...entries].sort((a, b) => b.boardCount - a.boardCount);

  // Which slot group each chip MPN is known to belong to, learned across the whole SO.
  const groupOfChipMpn = new Map<string, string>();
  for (const entry of ordered) {
    for (const c of entry.chips ?? []) {
      const g = (c.slot_group ?? '').trim();
      const m = normalizeChipMpn(c.chip_mpn);
      if (g && m && !groupOfChipMpn.has(m)) groupOfChipMpn.set(m, g);
    }
  }

  for (const entry of ordered) {
    for (const slot of buildSlots(entry.chips)) {
      // Every chip in a per-MPN slot shares the same slot_group, so any member yields
      // the same global key. An untagged chip adopts the group its MPN uses elsewhere.
      const head = slot.chips[0];
      const adopted = (head.slot_group ?? '').trim()
        ? null
        : groupOfChipMpn.get(normalizeChipMpn(head.chip_mpn));
      const key = adopted ? `g:${adopted}` : globalSlotKey(head);
      let gs = out.get(key);
      if (!gs) {
        gs = { key, label: '', processedQty: 0, failedQty: 0, date: '', chipIds: new Set() };
        out.set(key, gs);
      }
      const parts = gs.label ? gs.label.split('/') : [];
      for (const mpn of slot.chipMpns) if (!parts.includes(mpn)) parts.push(mpn);
      gs.label = parts.join('/');

      gs.processedQty += entry.boardCount * slot.qtyPerBoard;
      if (entry.latestDate > gs.date) gs.date = entry.latestDate;
      for (const c of slot.chips) gs.chipIds.add(c.id);
    }
  }

  for (const gs of out.values()) {
    for (const id of gs.chipIds) gs.failedQty += ngQtyByChipId.get(id) ?? 0;
  }
  return [...out.values()];
}
