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
  date: string;
  licence_number: string;
  payload_number: string;
  note: string;
  created_at: string;
  total_pallet_count: number;
  pallet_record_count: number;
  total_pallet_weight: string;
  total_board_count: number;
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

export interface Pallet {
  id: number;
  so: number;
  pallet_seq: number;
  weight: string;
  qty: number;
  created_at: string;
}

export interface Board {
  id: number;
  so: number;
  barcode: string;
  catalog: string;
  weight: string | null;
  qty: number;
  mpn: string;
  photo: string | null;
  photo_url: string | null;
  note: string;
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
  board: number;
  brand: number | null;
  brand_name: string | null;
  qty: number;
  note: string;
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
  top_vendors: { name: string; board_count: number }[];
  recent_boards: {
    id: number; barcode: string; so_number: string; so_id: number;
    vendor: string; mpn: string; qty: number; scanned_at: string;
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
