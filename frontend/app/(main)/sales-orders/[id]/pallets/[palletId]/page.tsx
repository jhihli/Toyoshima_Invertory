'use client';
import BoxesView from '@/app/ui/pallet/BoxesView';

/** Boxes on a pallet, reached from a general sales order. The MSFT route
 *  (/sos/[id]/pallets/[palletId]) renders the same view. */
export default function Page() {
  return <BoxesView />;
}
