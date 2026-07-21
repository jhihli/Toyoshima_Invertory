'use client';
/**
 * Shared, in-memory cache of breadcrumb labels keyed by id.
 *
 * Pages prime it as they load their own data (the SO list knows every so_number; the SO detail
 * knows every pallet label), so when the user clicks a row and navigates into a child route, the
 * top breadcrumb reads the real label immediately instead of flashing the raw numeric id while it
 * runs its own fetch. The breadcrumb subscribes so a later fill re-renders it.
 */
type Store = { so: Record<string, string>; pallet: Record<string, string> };
const store: Store = { so: {}, pallet: {} };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

export const crumbCache = {
  getSo: (id: string | number) => store.so[String(id)] ?? null,
  getPallet: (id: string | number) => store.pallet[String(id)] ?? null,
  setSo(id: string | number, label: string) {
    const k = String(id);
    if (label && store.so[k] !== label) { store.so[k] = label; emit(); }
  },
  setPallet(id: string | number, label: string) {
    const k = String(id);
    if (label && store.pallet[k] !== label) { store.pallet[k] = label; emit(); }
  },
  subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
};
