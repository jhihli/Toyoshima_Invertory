# Box label without suffix + new Checklist table

Date: 2026-08-20
Status: approved

## Problem

Two customer intake workflows both end the same way, and the current data model does not
express either of them.

**Workflow ① — customer supplies licence + gate numbers**

```
SO ─┬─ pallet SO-A-1 ─┬─ box SO-A-1
    │                 ├─ box SO-A-1        ── cut ──▶ checklist SO-A-1-1
    │                 └─ box SO-A-1                   checklist SO-A-1-2
    │                                                 checklist SO-A-1-3
    ├─ pallet SO-B-2
    └─ pallet SO-C-3
```

**Workflow ② — SO only, pallets grouped by product type**

```
SO (27 boards) ─┬─ 20 boards PC      → pallets SO-20 ×4
                ├─  5 boards router  → pallets SO-5  ×3
                └─  2 boards printer → pallets SO-2  ×2

pallet SO-20 ─┬─ box SO-20
              ├─ box SO-20   ── cut ──▶ checklist SO-20-1
              └─ box SO-20               checklist SO-20-2
                                         checklist SO-20-3
```

Structurally they are one flow: **the box label equals the pallet label, and each
checklist label is the pallet label plus a running number.**

Today `Box.compose_barcode` appends a `-C{n}` suffix, so every box carries a distinct
barcode. That does not match how the floor works — the worker sticking labels on boxes,
and later on cut PCB material, only needs `SO-PALLET-GATENO`. And there is no table at
all for the checklist (清單) produced after cutting.

## Goal

1. Box barcodes drop the `-C{n}` suffix and become identical to the pallet barcode.
2. A new `Checklist` table, one row per checklist label, barcoded
   `{pallet barcode}-{n}`.
3. Both reachable from the scanner app and the web UI.

## Decisions

Locked during design. Each was chosen by the user.

1. **Checklist hangs off `Pallet`, not `Box`.** Once box barcodes are identical, scanning
   one cannot tell you which box it is — and it does not matter. A checklist row needs to
   answer "which SO, which pallet", which the pallet FK gives. Numbering runs 1..N across
   the whole pallet, so `SO-A-1-3` is unique by construction.

2. **Checklist columns are `id, barcode, created_at, brand, model, qty`.** Only the first
   three are required. No separate sequence column — the number is parsed off the end of
   the barcode when allocating the next one.

3. **`brand` and `model` are free text.** Not lookup tables. Faster to ship; the cost is
   that `Dell` / `DELL` / `dell` count as three distinct values if anyone wants to report
   by brand later.

4. **Both entry points.** Scanner app (bulk create + print) and web UI (view, add, edit,
   delete), mirroring what `Box` already has.

5. **Box identity is a count, not a sequence.** No internal `seq` column. The scanner
   uploads how many boxes a pallet has and the server tops the row count up to that
   number. Idempotent for a single device. Multi-device is discussed under Risks.

## Barcode composition

Collapsed into one place. Today the SO/licence/gateload join is duplicated in
`Box.compose_barcode` and in two `get_pallet_label` methods in `serializer.py`.

```python
Pallet.compose_barcode()   # {so_number}-{licence_number}-{gateload_number}, blank segments skipped
Box.compose_barcode(p)     # == p.compose_barcode()
Checklist.compose_barcode(p, n)  # f"{p.compose_barcode()}-{n}"
```

Worked examples:

| | pallet | box | checklist |
|---|---|---|---|
| ① | `SO-A-1` | `SO-A-1` | `SO-A-1-1`, `SO-A-1-2`, … |
| ② | `SO-20` | `SO-20` | `SO-20-1`, `SO-20-2`, … |

`Checklist.next_index(pallet)` takes the trailing `-{digits}` off each existing checklist
barcode on that pallet and returns max + 1. Reading the number off the barcode rather
than a stored column means the two can never disagree; splitting on the *last* hyphen
keeps it working even if the pallet's licence or gate number is edited afterwards.

Pallet labelling itself is unchanged. In workflow ② the `20` in `SO-20` lives in the
pallet's existing `licence_number` field — the SO → pallet layer is already correct and
this design does not touch it.

## Database

One migration, `0045_checklist`, containing a single `CreateModel`. No existing row is
read or rewritten, so the migration carries no data risk and reverses cleanly.

```python
class Checklist(models.Model):
    pallet     = FK(Pallet, related_name='checklists', on_delete=CASCADE)
    barcode    = CharField(max_length=200, db_index=True)
    brand      = CharField(max_length=100, blank=True)
    model      = CharField(max_length=100, blank=True)
    qty        = IntegerField(null=True, blank=True)
    created_at = DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'checklist'
        unique_together = [['pallet', 'barcode']]
        ordering = ['pallet', 'id']
```

The unique constraint is what makes the scanner bulk endpoint idempotent — unlike box
barcodes, checklist barcodes really are unique within a pallet.

## Existing box rows are left alone

Boxes already in the database keep their `-C{n}` barcodes. Those labels are printed and
stuck to physical boxes; rewriting the rows would desynchronise the database from the
warehouse floor. Only newly created boxes get the bare pallet barcode. A pallet may
therefore hold a mix of old suffixed and new unsuffixed box barcodes, which is correct.

`Box.next_index()` is deleted along with the suffix.

## Scanner API contract change

The envelope (`{success, data}` / `{success, error}`) and `X-API-KEY` auth are unchanged.

### Boxes — same request shape, new semantics

`POST scanner/pallets/<pk>/boxes/bulk/` keeps its `{"boxes": [{"barcode", "note"}, …]}`
body. What changes is the server's interpretation:

- **Before:** insert each barcode, skipping any that already exist on the pallet.
- **After:** treat `len(boxes)` as "this pallet has N boxes" and top the row count up to
  N. Never deletes. Notes are consumed in order for the rows actually created.

Keeping the body shape means the only change on the app side is to stop appending
`-C{n}` when composing the barcode.

Response gains a `total` field alongside `created` / `skipped`.

### Checklists — new endpoints

```
POST scanner/pallets/<pk>/checklists/bulk/
     body {"items": [{"brand", "model", "qty"}, …]}
     → data {"checklists": [{"id", "barcode", "brand", "model", "qty"}, …]}

GET  scanner/pallets/<pk>/checklists/
     → data {"checklists": [...]}
```

The server composes checklist barcodes and allocates the number block inside a single
transaction. The app does **not** compose them. Two devices each guessing the next number
would both land on `-1`; server-side allocation removes that race entirely. The response
returns the composed barcodes for the app to print.

`items` may contain empty objects when the worker has not filled in brand/model/qty —
`len(items)` is what determines how many labels are produced.

## Web API

```
GET  POST   /product/pallets/<pk>/checklists/       # POST body {"count": N} or {"items": [...]}
PUT  DELETE /product/pallets/<pk>/checklists/<id>/
GET         /product/checklists/search/?q=          # cross-SO barcode lookup
```

JWT-authenticated, consistent with the existing box endpoints. The search endpoint
mirrors `box_search` and returns the SO and pallet a checklist belongs to, so scanning a
label found on the floor navigates straight to its pallet.

## Frontend

The pallet detail page
(`frontend/app/(main)/sales-orders/[id]/pallets/[palletId]/page.tsx`) gains a Checklist
section below the existing Boxes section: a table of barcode / brand / model / qty, an
Add control taking a count, inline edit, and delete. `PalletSerializer` gains
`checklist_count` to feed the section header.

The Boxes section is unchanged apart from copy — its rows will now show repeated
identical barcodes, which is expected.

## Risks

**Multi-device box counting.** With count-based top-up, two scanners working the same
pallet no longer merge cleanly: if device A knows about 3 boxes and device B about 2, the
server ends at 3, not 5. The mitigation is on the app side — call
`GET scanner/pallets/<pk>/boxes/` first, merge with local state, then upload the total.
Because the server only ever increases the count, the failure mode is an undercount that
a later upload corrects, never lost data. This trade-off was accepted in preference to
adding a sequence column.

Checklists are not exposed to this: their barcodes are unique and server-allocated, so
concurrent devices simply extend the same sequence.

**APK redeploy required.** Box barcode composition changed and the checklist endpoints
are new, so the scanner app needs another release. This lands right after the Cargo → Box
rename release and should be bundled with it if that build has not shipped yet.

## Tests

- `Pallet.compose_barcode` with and without licence / gateload
- Box created through the web endpoint carries the bare pallet barcode
- Scanner box bulk create tops up rather than duplicating; repeated identical upload is a
  no-op; a smaller upload does not delete rows
- Checklist barcode numbering starts at 1 and continues across separate bulk calls
- `next_index` survives a pallet whose licence number was edited after checklists existed
- Scanner checklist endpoints reject a missing/wrong API key and 404 on an unknown pallet
- Checklist search returns SO and pallet context

## Out of scope

- Pallet barcode composition (unchanged)
- Rewriting existing `-C{n}` box barcodes
- Brand/model lookup tables or reporting
- Linking checklists to the existing `Board` / `MPN` tables
