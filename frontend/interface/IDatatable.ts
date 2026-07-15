export interface Vendor {
  id: number;
  name: string;
  default_weight_rule: 'per_pallet' | 'aggregated';
  so_count?: number;
}

export interface SO {
  id: number;
  so_number: string;
  vendor: number;
  vendor_name: string;
  vendor_weight_rule: 'per_pallet' | 'aggregated';
  weight_rule: string;
  effective_weight_rule: 'per_pallet' | 'aggregated';
  inbound_date: string;
  outbound_date: string | null;
  note: string;
  created_at: string;
  total_pallet_count: number;
  pallet_record_count: number;
  total_pallet_weight: string;
  total_board_count: number;
  total_board_qty: number | null;
}

export interface SODetail extends SO {
  pallets: Pallet[];
  photos: SOPhoto[];
}

export interface SOPhoto {
  id: number;
  so: number;
  image: string;
  image_url: string | null;
  caption: string;
  uploaded_at: string;
}

export interface PalletPhoto {
  id: number;
  image: string;
  image_url: string | null;
  uploaded_at: string;
}

export interface Pallet {
  id: number;
  so: number;
  pallet_seq: number;
  licence_number: string;
  gateload_number: string;
  location: string;
  photo: string | null;
  photo_url: string | null;
  photos: PalletPhoto[];
  in_weight_gross: string;
  actual_weight: string | null;
  out_weight_gross: string | null;
  out_weight_net: string | null;
  tantalum_wt: string | null;
  material_type: string;
  qty: number;
  board_qty: number | null;
  board_count: number;
  created_at: string;
}

export interface MPN {
  id: number;
  name: string;
  part_type: string;
  beforecut_weight: number | null;
  aftercut_weight: number | null;
  /** @deprecated Hand-maintained and redundant — use the derived slot_count / chips_per_board. */
  chip_qty: number | null;
  /** Physical chip slots on one board (interchangeable alternates count once). */
  slot_count?: number;
  /** Chips harvested from ONE board — sum of each slot's per-board qty. */
  chips_per_board?: number;
  cutboard_cost: number | null;
  beforecut_photo_url?: string | null;
  aftercut_photo_url?: string | null;
  board_count?: number;
  chip_brands: string[];
  note?: string;
  created_at: string;
  latest_board_date?: string | null;
  chips?: Chip[];
}

export interface Board {
  id: number;
  so: number;
  pallet: number | null;
  pallet_label: string | null;
  barcode: string;
  qty: number;
  mpn: MPN | null;
  photo: string | null;
  photo_url: string | null;
  scanned_at: string;
  chips: Chip[];
  chip_count: number;
}

export interface ChipBrand {
  id: number;
  name: string;
}

export interface Chip {
  id: number;
  mpn: number | null;
  brand: number | null;
  brand_name: string | null;
  chip_mpn: string;
  chip_type: string;
  chip_photo: string | null;
  chip_photo_url: string | null;
  /** BOM qty: how many of this chip sit on ONE board. null = not yet known. */
  qty: number | null;
  /** Chips sharing a slot_group are interchangeable alternates in one board slot. */
  slot_group: string;
  item_group: string;
  cut_fail: number | null;
  chip_cost: number | null;
  description: string;
  processed_type: string;
  packaging_type: string;
}

export interface PalletChipContainer {
  id: number;
  pallet: number;
  chip: number;
  container_uid: string;
  actual_qty?: number | null;
  chip_mpn?: string;
  processed_type?: string;
  packaging_type?: string;
  qty?: number;
  inventory_qty?: number;
  pallet_seq?: number;
  chip_brand?: string;
  chip_type?: string;
  chip_description?: string;
  chip_item_group?: string;
  chip_slot_group?: string;
}

export interface MPNReportConfig {
  recipient: string;
  cc: string;
  auto_send_enabled: boolean;
  send_time: string;
  updated_at: string;
}

export interface MPNReportStatus {
  id: number;
  sent_at: string;
  sent_to: string;
  cc: string;
  status: 'ok' | 'error';
  error: string;
  triggered_by: 'cron' | 'manual';
}

export interface MPNReportLastSend {
  record: MPNReportStatus | null;
}

export interface PaginatedResult<T> {
  total: number;
  page: number;
  page_size: number;
  results: T[];
}

export interface DashboardStats {
  today_so_count: number;
  pallets_this_month: number;
  daily_counts: { date: string; count: number }[];
  top_vendors: { name: string; pallet_count: number }[];
  recent_pallets: {
    id: number; licence_number: string; pallet_seq: number;
    so_number: string; so_id: number; vendor: string; created_at: string;
  }[];
}

export type User = {
  id: bigint | string;
  username: string;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
};
