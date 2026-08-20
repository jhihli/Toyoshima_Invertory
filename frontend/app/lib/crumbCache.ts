'use client';
/**
 * Shared, in-memory cache of breadcrumb labels keyed by id.
 *
 * Pages prime it as they load their own data (the SO list knows every so_number; the SO detail
 * knows every pallet label), so when the user clicks a row and navigates into a child route, the
 * top breadcrumb reads the real label immediately instead of flashing the raw numeric id while it
 * runs its own fetch. The breadcrumb subscribes so a later fill re-renders it.
 *
 * A pallet carries two names, because the two order flows name it differently: the general
 * sales-order flow treats the licence number as the pallet's name, while MSFT orders want the
 * full physical barcode. Both are cached so the breadcrumb can pick by route.
 */
export type PalletCrumb = { licence: string; barcode: string };

type Store = { so: Record<string, string>; pallet: Record<string, PalletCrumb> };
const store: Store = { so: {}, pallet: {} };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

/** Builds both pallet names from a loaded SO + pallet. `barcode` mirrors
 *  Pallet.compose_barcode on the server — keep the two in step. */
export function palletCrumb(
  soNumber: string,
  p: { licence_number?: string; gateload_number?: string; pallet_seq: number },
): PalletCrumb {
  return {
    licence: p.licence_number || `Pallet #${p.pallet_seq}`,
    barcode: [soNumber, p.licence_number, p.gateload_number].filter(Boolean).join('-'),
  };
}

export const crumbCache = {
  getSo: (id: string | number) => store.so[String(id)] ?? null,
  getPallet: (id: string | number) => store.pallet[String(id)] ?? null,
  setSo(id: string | number, label: string) {
    const k = String(id);
    if (label && store.so[k] !== label) { store.so[k] = label; emit(); }
  },
  setPallet(id: string | number, crumb: PalletCrumb) {
    if (!crumb.licence && !crumb.barcode) return;
    const k = String(id);
    const cur = store.pallet[k];
    if (cur && cur.licence === crumb.licence && cur.barcode === crumb.barcode) return;
    store.pallet[k] = crumb;
    emit();
  },
  subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
};
