'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '@/app/lib/api';
import type { Pallet } from '@/interface/IDatatable';
import { crumbCache, palletCrumb } from '@/app/lib/crumbCache';

/**
 * Loads the SO and the one pallet that both pallet routes hang off — the Boxes page and
 * the Checklist page — and derives the labels they share.
 *
 * Kept in one place so the two pages cannot drift on how a pallet is named or how its
 * barcode is composed, and so each primes the breadcrumb cache the same way.
 */
export function usePalletContext(soId: number, palletId: number) {
  const [pallet, setPallet] = useState<Pallet | null>(null);
  const [soNumber, setSoNumber] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const reload = useCallback(async () => {
    const soData = await api.sos.get(soId);
    setSoNumber(soData.so_number);
    crumbCache.setSo(soData.id, soData.so_number);
    const thisPallet = soData.pallets?.find((p: Pallet) => p.id === palletId) || null;
    if (thisPallet) {
      crumbCache.setPallet(thisPallet.id, palletCrumb(soData.so_number, thisPallet));
    }
    setPallet(thisPallet);
  }, [soId, palletId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(false);
    reload()
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reload]);

  const palletLabel = pallet ? (pallet.licence_number || `Pallet #${pallet.pallet_seq}`) : '';

  // Mirrors Pallet.compose_barcode on the server: every box on this pallet gets this
  // string verbatim, and each checklist line gets it plus '-{n}'.
  const palletBarcode = useMemo(
    () => [soNumber, pallet?.licence_number, pallet?.gateload_number].filter(Boolean).join('-'),
    [soNumber, pallet],
  );

  return { pallet, soNumber, palletLabel, palletBarcode, loading, error, reload };
}
