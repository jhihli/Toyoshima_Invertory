'use client';
/**
 * Client-side API utility for pages running in the browser.
 * Reads the JWT access token from the NextAuth session and attaches it
 * as a Bearer token on every request to the Django backend.
 */

import { getSession } from 'next-auth/react';

const API = process.env.NEXT_PUBLIC_Django_API_URL || 'http://localhost:8000';
const PREFIX = `${API}/product`;

async function getAuthHeaders(): Promise<Record<string, string>> {
  const session = await getSession() as any;
  const token = session?.accessToken;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function apiPostForm<T>(path: string, form: FormData): Promise<T> {
  const session = await getSession() as any;
  const token = session?.accessToken;
  const res = await fetch(`${PREFIX}${path}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  if (!res.ok) {
    const err = await res.text().catch(() => 'Unknown error');
    throw new Error(`POST ${path} failed (${res.status}): ${err}`);
  }
  return res.json();
}

export async function apiGet<T>(path: string): Promise<T> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${PREFIX}${path}`, { headers });
  if (!res.ok) {
    const err = await res.text().catch(() => 'Unknown error');
    throw new Error(`GET ${path} failed (${res.status}): ${err}`);
  }
  return res.json();
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${PREFIX}${path}`, {
    method: 'POST', headers, body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => 'Unknown error');
    throw new Error(`POST ${path} failed (${res.status}): ${err}`);
  }
  return res.json();
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${PREFIX}${path}`, {
    method: 'PUT', headers, body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => 'Unknown error');
    throw new Error(`PUT ${path} failed (${res.status}): ${err}`);
  }
  return res.json();
}

export async function apiDelete(path: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${PREFIX}${path}`, { method: 'DELETE', headers });
  if (!res.ok) {
    const err = await res.text().catch(() => 'Unknown error');
    throw new Error(`DELETE ${path} failed (${res.status}): ${err}`);
  }
}

// ─── Typed wrappers ───────────────────────────────────────────────
import type {
  Vendor, SO, SODetail, SOPhoto, Pallet, PalletPhoto, Board, ChipBrand, Chip, MPN,
  PaginatedResult, DashboardStats,
  MPNReportConfig, MPNReportStatus, MPNReportLastSend,
  PalletChipContainer, Box, BoxSearchResult,
  MsftMeta, MsftJobInfo, MsftCreditUnit, MsftPaymentNotice, MsftApiLog,
} from '@/interface/IDatatable';

export const api = {
  // Vendors
  vendors: {
    list: () => apiGet<Vendor[]>('/vendors/'),
    create: (d: Partial<Vendor>) => apiPost<Vendor>('/vendors/', d),
    update: (id: number, d: Partial<Vendor>) => apiPut<Vendor>(`/vendors/${id}/`, d),
    delete: (id: number) => apiDelete(`/vendors/${id}/`),
  },

  // SOs
  sos: {
    list: (params: Record<string, string | number> = {}) => {
      const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
      return apiGet<PaginatedResult<SO>>(`/sos/?${qs}`);
    },
    get: (id: number) => apiGet<SODetail>(`/sos/${id}/`),
    create: (d: Partial<SO>) => apiPost<SO>('/sos/', d),
    update: (id: number, d: Partial<SO>) => apiPut<SO>(`/sos/${id}/`, d),
    delete: (id: number) => apiDelete(`/sos/${id}/`),
    chipContainers: (soId: number) => apiGet<PalletChipContainer[]>(`/sos/${soId}/chip-containers/`),
  },

  // Pallets
  pallets: {
    list: (soId: number) => apiGet<Pallet[]>(`/sos/${soId}/pallets/`),
    create: (soId: number, d: Partial<Pallet>) => apiPost<Pallet>(`/sos/${soId}/pallets/`, d),
    update: (soId: number, id: number, d: Partial<Pallet>) => apiPut<Pallet>(`/sos/${soId}/pallets/${id}/`, d),
    delete: (soId: number, id: number) => apiDelete(`/sos/${soId}/pallets/${id}/`),
    uploadPhoto: async (palletId: number, dataUrl: string): Promise<Pallet> => {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const file = new File([blob], 'photo.jpg', { type: blob.type || 'image/jpeg' });
      const form = new FormData();
      form.append('photo', file);
      return apiPostForm<Pallet>(`/pallets/${palletId}/photo/`, form);
    },
    deletePhoto: (palletId: number) => apiDelete(`/pallets/${palletId}/photo/`),
    photos: {
      upload: async (palletId: number, dataUrl: string): Promise<PalletPhoto> => {
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        const file = new File([blob], 'photo.jpg', { type: blob.type || 'image/jpeg' });
        const form = new FormData();
        form.append('image', file);
        return apiPostForm<PalletPhoto>(`/pallets/${palletId}/photos/`, form);
      },
      delete: (palletId: number, photoId: number) => apiDelete(`/pallets/${palletId}/photos/${photoId}/`),
    },
    chipContainers: {
      list: (palletId: number, mpnId?: number) => {
        const qs = mpnId != null ? `?mpn_id=${mpnId}` : '';
        return apiGet<PalletChipContainer[]>(`/pallets/${palletId}/chip-containers/${qs}`);
      },
      upsert: (palletId: number, chipId: number, container_uid: string, actual_qty?: number | null) =>
        apiPut<PalletChipContainer>(`/pallets/${palletId}/chip-containers/${chipId}/`, { container_uid, actual_qty }),
    },
    boxes: {
      list: (palletId: number) => apiGet<Box[]>(`/pallets/${palletId}/boxes/`),
      create: (palletId: number, d: { count?: number; qty?: number; note?: string }) =>
        apiPost<Box[]>(`/pallets/${palletId}/boxes/`, d),
      update: (palletId: number, id: number, d: Partial<Box>) =>
        apiPut<Box>(`/pallets/${palletId}/boxes/${id}/`, d),
      delete: (palletId: number, id: number) => apiDelete(`/pallets/${palletId}/boxes/${id}/`),
    },
  },

  // Box (cross-SO barcode search)
  boxes: {
    search: (q: string) => apiGet<BoxSearchResult[]>(`/boxes/search/?q=${encodeURIComponent(q)}`),
  },

  // Photos
  photos: {
    upload: (soId: number, file: File, caption: string) => {
      const form = new FormData();
      form.append('image', file);
      form.append('caption', caption);
      return apiPostForm<SOPhoto>(`/sos/${soId}/photos/`, form);
    },
    delete: (soId: number, photoId: number) => apiDelete(`/sos/${soId}/photos/${photoId}/`),
  },

  // Boards
  boards: {
    listBySO: (soId: number, params: Record<string, string | number> = {}) => {
      const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
      return apiGet<PaginatedResult<Board>>(`/sos/${soId}/boards/?${qs}`);
    },
    get: (id: number) => apiGet<Board>(`/boards/${id}/`),
    create: (soId: number, d: Partial<Board>) => apiPost<Board>(`/sos/${soId}/boards/`, d),
    createBulk: (soId: number, boards: Partial<Board>[]) => apiPost<Board[]>(`/sos/${soId}/boards/bulk/`, boards),
    update: (id: number, d: Partial<Board>) => apiPut<Board>(`/boards/${id}/`, d),
    delete: (id: number) => apiDelete(`/boards/${id}/`),
    uploadPhoto: (id: number, file: File) => {
      const form = new FormData();
      form.append('photo', file);
      return apiPostForm<Board>(`/boards/${id}/photo/`, form);
    },
    deletePhoto: (id: number) => apiDelete(`/boards/${id}/photo/`),
  },

  // Chips
  chips: {
    create: (boardId: number, d: Partial<Chip>) => apiPost<Chip>(`/boards/${boardId}/chips/`, d),
    update: (boardId: number, id: number, d: Partial<Chip>) => apiPut<Chip>(`/boards/${boardId}/chips/${id}/`, d),
    delete: (boardId: number, id: number) => apiDelete(`/boards/${boardId}/chips/${id}/`),
  },

  // Chip Brands
  chipBrands: {
    list: () => apiGet<ChipBrand[]>('/chipbrands/'),
    create: (d: Partial<ChipBrand>) => apiPost<ChipBrand>('/chipbrands/', d),
    update: (id: number, d: Partial<ChipBrand>) => apiPut<ChipBrand>(`/chipbrands/${id}/`, d),
    delete: (id: number) => apiDelete(`/chipbrands/${id}/`),
  },

  // MPNs
  mpns: {
    list: (params: Record<string, string> = {}) => {
      const qs = new URLSearchParams(params);
      return apiGet<MPN[]>(`/mpns/?${qs}`);
    },
    get: (id: number) => apiGet<MPN>(`/mpns/${id}/`),
    create: (d: Partial<MPN>) => apiPost<MPN>('/mpns/', d),
    update: (id: number, d: Partial<MPN>) => apiPut<MPN>(`/mpns/${id}/`, d),
    delete: (id: number) => apiDelete(`/mpns/${id}/`),
    chips: {
      create: (mpnId: number, d: Partial<Chip>) => apiPost<Chip>(`/mpns/${mpnId}/chips/`, d),
      update: (mpnId: number, id: number, d: Partial<Chip>) => apiPut<Chip>(`/mpns/${mpnId}/chips/${id}/`, d),
      delete: (mpnId: number, id: number) => apiDelete(`/mpns/${mpnId}/chips/${id}/`),
      uploadPhoto: (mpnId: number, chipId: number, file: File) => {
        const form = new FormData();
        form.append('photo', file);
        return apiPostForm<Chip>(`/mpns/${mpnId}/chips/${chipId}/photo/`, form);
      },
      deletePhoto: (mpnId: number, chipId: number) => apiDelete(`/mpns/${mpnId}/chips/${chipId}/photo/`),
    },
    photos: {
      uploadBeforecut: (id: number, file: File) => {
        const form = new FormData();
        form.append('photo', file);
        return apiPostForm<MPN>(`/mpns/${id}/beforecut_photo/`, form);
      },
      deleteBeforecut: (id: number) => apiDelete(`/mpns/${id}/beforecut_photo/`),
      uploadAftercut: (id: number, file: File) => {
        const form = new FormData();
        form.append('photo', file);
        return apiPostForm<MPN>(`/mpns/${id}/aftercut_photo/`, form);
      },
      deleteAftercut: (id: number) => apiDelete(`/mpns/${id}/aftercut_photo/`),
    },
  },

  // Dashboard
  dashboard: {
    stats: () => apiGet<DashboardStats>('/dashboard/'),
  },

  // MPN Report Email
  mpnReport: {
    getConfig:  () => apiGet<MPNReportConfig>('/mpn-report/config/'),
    saveConfig: (d: Partial<MPNReportConfig>) => apiPut<MPNReportConfig>('/mpn-report/config/', d),
    lastSend:   () => apiGet<MPNReportLastSend>('/mpn-report/last-send/'),
    sendNow:    () => apiPost<MPNReportStatus>('/mpn-report/send-now/', {}),
  },

  // Microsoft Recycling API (Buyback)
  msft: {
    meta:    () => apiGet<MsftMeta>('/msft/meta/'),
    getJob:  (soId: number) => apiGet<MsftJobInfo>(`/sos/${soId}/msft/job/`),
    saveJob: (soId: number, d: Partial<MsftJobInfo>) => apiPut<MsftJobInfo>(`/sos/${soId}/msft/job/`, d),
    uploadPo: async (soId: number, file: File): Promise<MsftJobInfo> => {
      const form = new FormData();
      form.append('file', file);
      return apiPostForm<MsftJobInfo>(`/sos/${soId}/msft/po-document/`, form);
    },
    deletePo: (soId: number) => apiDelete(`/sos/${soId}/msft/po-document/`),
    creditUnits: {
      list:   (soId: number) => apiGet<MsftCreditUnit[]>(`/sos/${soId}/msft/credit-units/`),
      create: (soId: number, d: Partial<MsftCreditUnit>) => apiPost<MsftCreditUnit>(`/sos/${soId}/msft/credit-units/`, d),
      update: (soId: number, id: number, d: Partial<MsftCreditUnit>) => apiPut<MsftCreditUnit>(`/sos/${soId}/msft/credit-units/${id}/`, d),
      delete: (soId: number, id: number) => apiDelete(`/sos/${soId}/msft/credit-units/${id}/`),
    },
    paymentNotices: {
      list:   (soId: number) => apiGet<MsftPaymentNotice[]>(`/sos/${soId}/msft/payment-notices/`),
      create: (soId: number, d: Partial<MsftPaymentNotice>) => apiPost<MsftPaymentNotice>(`/sos/${soId}/msft/payment-notices/`, d),
      update: (soId: number, id: number, d: Partial<MsftPaymentNotice>) => apiPut<MsftPaymentNotice>(`/sos/${soId}/msft/payment-notices/${id}/`, d),
      delete: (soId: number, id: number) => apiDelete(`/sos/${soId}/msft/payment-notices/${id}/`),
    },
    logs: (soId: number, report?: string) =>
      apiGet<MsftApiLog[]>(`/sos/${soId}/msft/logs/${report ? `?report=${report}` : ''}`),
    push: (soId: number, report: 'credit' | 'podoc' | 'pnr', dry_run: boolean) =>
      apiPost<MsftApiLog>(`/sos/${soId}/msft/push/`, { report, dry_run }),
  },
};
