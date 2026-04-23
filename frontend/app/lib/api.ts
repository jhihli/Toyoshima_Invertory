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
  Vendor, SO, SODetail, SOPhoto, Pallet, Board, ChipBrand, Chip,
  PaginatedResult, DashboardStats,
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
  },

  // Pallets
  pallets: {
    list: (soId: number) => apiGet<Pallet[]>(`/sos/${soId}/pallets/`),
    create: (soId: number, d: Partial<Pallet>) => apiPost<Pallet>(`/sos/${soId}/pallets/`, d),
    update: (soId: number, id: number, d: Partial<Pallet>) => apiPut<Pallet>(`/sos/${soId}/pallets/${id}/`, d),
    delete: (soId: number, id: number) => apiDelete(`/sos/${soId}/pallets/${id}/`),
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

  // Dashboard
  dashboard: {
    stats: () => apiGet<DashboardStats>('/dashboard/'),
  },
};
