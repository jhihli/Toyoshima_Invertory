// Mock data matching the Django schema
const vendors = [
  { id: 1, name: 'MSFT',   default_weight_rule: 'per_pallet' },
  { id: 2, name: 'SMS',    default_weight_rule: 'aggregated' },
  { id: 3, name: 'Dell',   default_weight_rule: 'per_pallet' },
  { id: 4, name: 'Lenovo', default_weight_rule: 'per_pallet' },
  { id: 5, name: 'HPE',    default_weight_rule: 'aggregated' },
];

const chipBrands = [
  { id: 1, name: 'Samsung' },
  { id: 2, name: 'Intel' },
  { id: 3, name: 'Micron' },
  { id: 4, name: 'SK Hynix' },
  { id: 5, name: 'Kioxia' },
  { id: 6, name: 'Western Digital' },
];

// Generate 48 SOs for realistic pagination
const pad = (n, w = 3) => String(n).padStart(w, '0');
const mpns = ['DDR4-3200-32G', 'DDR5-4800-16G', 'NVMe-PCIe4-1T', 'NVMe-PCIe4-2T', 'SATA-SSD-960G', 'NIC-25G-SFP28'];
const catalogs = ['MEM-A1', 'MEM-B2', 'SSD-C3', 'SSD-D4', 'NET-E5'];

const makeChips = (n, seed) => Array.from({ length: n }, (_, i) => ({
  id: seed * 100 + i,
  brand_id: ((seed + i) % chipBrands.length) + 1,
  qty: 4 + ((seed * (i + 1)) % 8),
  note: '',
}));

const makeBoards = (soId, n) => Array.from({ length: n }, (_, i) => {
  const chipsCount = 1 + ((soId + i) % 4);
  return {
    id: soId * 1000 + i + 1,
    barcode: `BC-${pad(soId, 3)}-${pad(i + 1, 4, 4)}`,
    catalog: catalogs[(soId + i) % catalogs.length],
    weight: +(1.2 + ((soId + i) % 7) * 0.3).toFixed(2),
    qty: 1 + ((soId + i) % 3),
    mpn: mpns[(soId * 2 + i) % mpns.length],
    note: i === 0 ? 'Minor scuff on corner' : '',
    scanned_at: `2026-04-${pad(10 + (i % 9), 2)} 14:${pad(20 + i * 3, 2)}`,
    chips: makeChips(chipsCount, soId + i),
  };
});

const makePallets = (soId, n, rule) => {
  if (rule === 'aggregated') {
    // One record summarising many physical pallets: weight & qty are totals.
    return [{ id: soId * 100, pallet_seq: 1,
      weight: +(420 + soId * 12.5).toFixed(2),
      qty: 40 + (soId * 3) % 80 }];
  }
  // Per-pallet: each row is exactly one physical pallet, qty is always 1.
  return Array.from({ length: n }, (_, i) => ({
    id: soId * 100 + i + 1,
    pallet_seq: i + 1,
    weight: +(180 + ((soId + i) % 12) * 8.5).toFixed(2),
    qty: 1,
  }));
};

const sos = Array.from({ length: 48 }, (_, i) => {
  const vendor = vendors[i % vendors.length];
  const id = i + 1;
  const palletN = 2 + (i % 4);
  const boardN = 6 + (i % 14);
  const day = 1 + ((i * 3) % 27);
  const month = 4 - Math.floor(i / 20);
  const override = i % 7 === 3
    ? (vendor.default_weight_rule === 'per_pallet' ? 'aggregated' : 'per_pallet')
    : '';
  const effectiveRule = override || vendor.default_weight_rule;
  return {
    id,
    so_number: `SO-2026-${pad(1000 + id, 4, 4)}`,
    vendor_id: vendor.id,
    weight_rule: override,
    date: `2026-${pad(month, 2)}-${pad(day, 2)}`,
    licence_number: `TRK-${pad(i * 7 + 13, 5)}`,
    payload_number: `PLD-${pad(i + 200, 4)}`,
    note: i % 5 === 0 ? 'Driver reported partial damage to outer wrap.' : '',
    created_at: `2026-${pad(month, 2)}-${pad(day, 2)} 09:${pad((i * 13) % 60, 2)}`,
    photos: Array.from({ length: 2 + (i % 4) }, (_, j) => ({
      id: id * 10 + j, caption: j === 0 ? 'Arrival' : j === 1 ? 'Licence' : `Pallet ${j}`,
    })),
    pallets: makePallets(id, palletN, effectiveRule),
    boards: makeBoards(id, boardN),
    status: i % 7 === 0 ? 'Issue' : (i % 3 === 0 ? 'In Progress' : 'Completed'),
  };
});

// Recent scanned boards - flatten
const recentBoards = sos.slice(0, 6).flatMap(so =>
  so.boards.slice(0, 2).map(b => ({ ...b, so_number: so.so_number, vendor: vendors.find(v => v.id === so.vendor_id).name }))
).slice(0, 10);

// Daily count for last 30 days
const dailyCounts = Array.from({ length: 30 }, (_, i) => {
  const v = 3 + Math.round(Math.sin(i * 0.6) * 3 + Math.cos(i * 0.3) * 2 + (i * 13 % 5));
  return { day: i + 1, count: Math.max(1, v) };
});

// Top vendors by board count
const topVendors = vendors.map(v => ({
  name: v.name,
  count: sos.filter(s => s.vendor_id === v.id).reduce((sum, s) => sum + s.boards.length, 0),
})).sort((a, b) => b.count - a.count).slice(0, 5);

const data = { vendors, chipBrands, sos, recentBoards, dailyCounts, topVendors };
window.mockData = data;
