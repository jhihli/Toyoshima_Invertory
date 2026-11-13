'use client';
/**
 * Checklist photo scans (photo → draft → confirm). Kept out of api.ts on purpose: that
 * file carries local-only code in the owner's checkout, so this feature adds nothing to it
 * and has its own multipart helper.
 */
import { getSession } from 'next-auth/react';
import { apiGet, apiPost } from '@/app/lib/api';
import type { ChecklistCheck } from '@/interface/IDatatable';

const API = process.env.NEXT_PUBLIC_Django_API_URL || 'http://localhost:8000';

export type ScanStatus = 'processing' | 'ready' | 'failed' | 'confirmed' | 'discarded';

export interface DraftChip {
  part: string; brand: string; slot_group: string; item_group: string;
  /** Already on the MPN — nothing to add. */
  exists: boolean;
  /** Add it on confirm. Additions to a shared MPN start unticked. */
  apply: boolean;
  /** The MPN already exists, so the chip would change every order that uses it. */
  shared: boolean;
  note: string;
}

export interface DraftMpn {
  key: string; text: string;
  board_qty: number | null; current_board_qty: number | null;
  board_qty_choice: 'sheet' | 'keep';
  match: 'exact' | 'correction' | 'near' | 'new' | 'owner';
  mpn_id: number | null; new_name: string; name: string;
  suggestions: { id: number; name: string; score: number }[];
  yellow: string[]; skip: boolean;
  chips: DraftChip[];
  unresolved: { text: string; options: string[] }[];
  notes: string[];
}

export type LineAction = 'fill' | 'same' | 'conflict' | 'create' | 'flag';

export interface DraftLine {
  index: number | null; column: string;
  brand: string; part: string; raw_model: string; part_source: string;
  qty: number | null;
  capacity: string | null; capacity_source: string | null; capacity_options: string[];
  candidates: string[]; yellow: string[];
  action: LineAction; row_id: number | null;
  existing: { brand: string; model: string; qty: number | null } | null;
  use_sheet: boolean; flag: string;
}

export interface ScanDraft {
  pallet_id: number | null;
  pallet_options: { id: number; label: string; barcode: string }[];
  errors: string[]; warnings: string[];
  label: {
    so_number: string; pallet_barcode: string; weight_text: string;
    weight: number | null; stored_weight: number | null; weight_mismatch: boolean;
  };
  mpns: DraftMpn[];
  missing_pallet_mpns: { mpn_id: number; name: string; board_qty: number | null }[];
  lines: DraftLine[];
  delete_rows: { row_id: number; index: number; barcode: string; apply: boolean }[];
  extra_rows: { row_id: number; index: number | null; model: string; qty: number | null; reason: string }[];
  capacity_classes: string[];
  overrides: ScanOverrides;
  notes: string;
  check: ScanCheck;
}

/** Pallet.checklist_check() of the state the draft would produce; 'error' when the
 *  draft can't be applied as it stands (the message says why). */
export type ScanCheck = Omit<ChecklistCheck, 'status'> & {
  status: ChecklistCheck['status'] | 'error';
  error?: string;
};

export interface ScanOverrides {
  lines?: Record<string, { part?: string; qty?: number | null; brand?: string }>;
  capacity?: Record<string, string>;
  mpns?: Record<string, { mpn_id?: number | null; new_name?: string; board_qty?: number | null; items?: Record<string, string> }>;
}

export interface ChecklistScan {
  id: number; so: number; status: ScanStatus; is_stale: boolean;
  pallet_id: number | null; pallet_label: string;
  image_url: string | null; error: string; attempts: number;
  model: string; cost_usd: string | null;
  created_at: string; updated_at: string; confirmed_at: string | null;
  result: Record<string, number> | null;
  draft?: ScanDraft | null;
  /** What the owner confirmed (status 'confirmed'). */
  confirmed?: ScanDraft | null;
}

async function postForm<T>(path: string, form: FormData): Promise<T> {
  const session = await getSession() as any;
  const token = session?.accessToken;
  const res = await fetch(`${API}/product${path}`, {
    method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: form,
  });
  if (!res.ok) {
    const err = await res.text().catch(() => 'Unknown error');
    throw new Error(`POST ${path} failed (${res.status}): ${err}`);
  }
  return res.json();
}

export const scanApi = {
  upload: (soId: number, files: File[]) => {
    const form = new FormData();
    files.forEach(f => form.append('images', f));
    return postForm<ChecklistScan[]>(`/sos/${soId}/checklist-scans/`, form);
  },
  list: (soId: number, palletId?: number) =>
    apiGet<ChecklistScan[]>(`/sos/${soId}/checklist-scans/${palletId ? `?pallet=${palletId}` : ''}`),
  get: (id: number) => apiGet<ChecklistScan>(`/checklist-scans/${id}/`),
  preview: (id: number, draft: ScanDraft) =>
    apiPost<{ check: ScanDraft['check'] }>(`/checklist-scans/${id}/preview/`, { draft }),
  /** Re-derive the draft (no model call) after a content edit or a pallet pick. `previous`
   *  carries the current ticks so a rebuild doesn't reset them. */
  rebuild: (id: number, d: { pallet_id?: number; overrides?: ScanOverrides; previous?: Partial<ScanDraft> }) =>
    apiPost<ChecklistScan>(`/checklist-scans/${id}/rebuild/`, d),
  confirm: (id: number, draft: ScanDraft) => apiPost<ChecklistScan>(`/checklist-scans/${id}/confirm/`, { draft }),
  discard: (id: number) => apiPost<ChecklistScan>(`/checklist-scans/${id}/discard/`, {}),
  retry: (id: number) => apiPost<ChecklistScan>(`/checklist-scans/${id}/retry/`, {}),
};
