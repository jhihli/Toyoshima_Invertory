# Design: Rename `Cargo` to `Box`

**Date:** 2026-08-20
**Status:** Approved, ready for implementation planning

## Problem

The entity stored under a pallet is called `Cargo` throughout the stack — database
table, Django model, REST routes, scanner API payloads, TypeScript types, and UI
copy. The name is wrong: what sits inside a pallet is a **box**, not cargo. The
mismatch shows up every time someone reads the pallet page or the scanner
contract, and it will keep costing translation effort as the system grows.

## Goal

Rename the entity to `Box` end to end — database, backend, scanner API, frontend,
and visible copy — with no data loss and no change to already-printed physical
labels.

## Decisions

These were settled during brainstorming and are not open for re-litigation during
implementation:

1. **Scanner API is renamed too, hard cutover.** No back-compat aliases. The
   deployed Zebra app breaks the moment the server ships and stays broken until
   the rebuilt APK is installed on every device. A handoff prompt for the scanner
   app's agent is a deliverable of this work (see "Scanner App Handoff Prompt").
2. **Barcode suffix stays `-C{n}`.** Barcodes such as `SO123-tgt1-1-C4` are
   already printed and stuck to physical boxes. `Box.compose_barcode` keeps
   emitting `C{n}` and `Box.next_index` keeps parsing `-C(\d{1,6})$`. This is
   deliberate legacy and must be commented as such so nobody "fixes" it later.
3. **No data migration of barcode values.** Existing rows are renamed in place,
   values untouched.
4. **`add_default_cargos.py` is deleted, not renamed.** It calls
   `Cargo.objects.get_or_create(name=...)` against a model with no `name` field,
   so it raises on any run. It is a leftover from a much older shipping-method
   `Cargo` model.
5. **Pallet page heading becomes "Boxes"** (not "Box Items").

## Database

One new migration, `0044_rename_cargo_to_box`, containing:

```python
migrations.RenameModel(old_name='Cargo', new_name='Box')
migrations.AlterModelTable(name='box', table='box')
migrations.AlterModelOptions(name='box', options={'ordering': ['pallet', 'id']})
```

`RenameModel` is Django-state-only here because `db_table` is set explicitly, so
the physical rename is done by `AlterModelTable`, which emits
`ALTER TABLE cargo RENAME TO box`. Rows, primary keys, and the `pallet_id`
foreign key are preserved.

**Known cosmetic leftovers, deliberately not addressed:** PostgreSQL does not
rename a table's owned sequence or its indexes when the table is renamed, so
`cargo_id_seq` and the barcode index keep their old names. Both are functionally
irrelevant; renaming them would add migration risk for no gain.

**Note on the table name:** `box` is a geometric *type* name in PostgreSQL but is
not a reserved keyword, and Django quotes all identifiers it generates, so a table
named `box` is safe.

## Backend Rename Map

`backend/server/product/models.py`

| Before | After |
|---|---|
| `class Cargo(models.Model)` | `class Box(models.Model)` |
| `db_table = 'cargo'` | `db_table = 'box'` |
| `related_name='cargos'` (→ `pallet.cargos`) | `related_name='boxes'` (→ `pallet.boxes`) |
| `__str__` → `f"Cargo {self.id} ..."` | `f"Box {self.id} ..."` |
| `compose_barcode` / `next_index` docstrings | reworded to "box", with an explicit note that the `C` in `C{n}` is legacy and intentional |

`backend/server/product/serializer.py`

| Before | After |
|---|---|
| `CargoSerializer` | `BoxSerializer` |
| `cargo_count` field on `PalletSerializer` | `box_count` |
| `get_cargo_count` → `obj.cargos.count()` | `get_box_count` → `obj.boxes.count()` |

`backend/server/product/views.py`

| Before | After |
|---|---|
| `cargo_list` | `box_list` |
| `cargo_detail` | `box_detail` |
| `cargo_search` | `box_search` |
| `scanner_cargo_bulk_create` | `scanner_box_bulk_create` |
| `scanner_cargo_list` | `scanner_box_list` |
| local vars `cargo`, `cargos` | `box`, `boxes` |
| section comment banners | "Box" / "Scanner: box label printer" |

`backend/server/product/urls.py`

| Before | After |
|---|---|
| `pallets/<int:pallet_pk>/cargos/` name=`cargo-list` | `pallets/<int:pallet_pk>/boxes/` name=`box-list` |
| `pallets/<int:pallet_pk>/cargos/<int:pk>/` name=`cargo-detail` | `.../boxes/<int:pk>/` name=`box-detail` |
| `cargos/search/` name=`cargo-search` | `boxes/search/` name=`box-search` |
| `scanner/pallets/<int:pallet_pk>/cargos/bulk/` name=`scanner-cargo-bulk-create` | `scanner/pallets/<int:pallet_pk>/boxes/bulk/` name=`scanner-box-bulk-create` |
| `scanner/pallets/<int:pallet_pk>/cargos/` name=`scanner-cargo-list` | `scanner/pallets/<int:pallet_pk>/boxes/` name=`scanner-box-list` |

## Scanner API Contract Change (breaking)

The `{success, data}` / `{success, error}` envelope shape is unchanged. What
changes are the routes and the key names inside them.

**`GET /product/scanner/pallets/lookup/`** (pallet lookup by licence barcode)

- Response field `existing_cargo_count` → `existing_box_count`.

**`POST /product/scanner/pallets/<pk>/boxes/bulk/`** (was `.../cargos/bulk/`)

- Request body key `cargos` → `boxes`.
- Error strings: `"cargos must be a list"` → `"boxes must be a list"`;
  `"each cargo must be an object"` → `"each box must be an object"`.
- Response `data.created` / `data.skipped` are unchanged in shape and name.

**`GET /product/scanner/pallets/<pk>/boxes/`** (was `.../cargos/`)

- Response key `data.cargos` → `data.boxes`. Item shape
  (`id`, `barcode`, `note`, `created_at`) is unchanged.

Unchanged: `X-API-KEY` header auth, the 404 body
`{'success': False, 'error': 'Pallet not found'}`, and the idempotent
skip-on-duplicate-barcode behaviour.

## Frontend Rename Map

`frontend/interface/IDatatable.ts`

| Before | After |
|---|---|
| `interface Cargo` | `interface Box` |
| `interface CargoSearchResult` | `interface BoxSearchResult` |
| `Pallet.cargo_count?: number` | `Pallet.box_count?: number` |

`frontend/app/lib/api.ts`

| Before | After |
|---|---|
| `api.pallets.cargos.{list,create,update,delete}` | `api.pallets.boxes.{...}` |
| `api.cargos.search` | `api.boxes.search` |
| paths `/pallets/${id}/cargos/`, `/cargos/search/` | `/pallets/${id}/boxes/`, `/boxes/search/` |

`frontend/app/(main)/sales-orders/[id]/pallets/[palletId]/page.tsx`

| Before | After |
|---|---|
| `CargoPage` | `BoxPage` |
| `AddCargoModal` / `EditCargoModal` | `AddBoxModal` / `EditBoxModal` |
| state `cargos`, `cargoData`, prop `cargo` | `boxes`, `boxData`, `box` |

`frontend/app/(main)/sales-orders/page.tsx`

| Before | After |
|---|---|
| `CargoSearch` component | `BoxSearch` |
| `api.cargos.search(term)` | `api.boxes.search(term)` |

The route path `/sales-orders/[id]/pallets/[palletId]` contains no "cargo"
segment, so no frontend URLs move and no links need updating.

## Visible Copy Changes

| Before | After |
|---|---|
| `Cargo Items` (pallet page heading) | `Boxes` |
| `Add Cargo` (button, modal title) | `Add Box` |
| `Add N cargo item(s)` (submit button) | `Add N box(es)` |
| `Edit Cargo` (modal title) | `Edit Box` |
| `Delete cargo?` (confirm title) | `Delete box?` |
| `Cargo <barcode> will be permanently removed.` | `Box <barcode> will be permanently removed.` |
| `Cargo saved` / `Cargo deleted` (toasts) | `Box saved` / `Box deleted` |
| `Added N cargo item(s)` (toast) | `Added N box(es)` |
| `Scan or enter cargo barcode…` (placeholder) | `Scan or enter box barcode…` |
| `Cargo barcode "X" not found` (flash) | `Box barcode "X" not found` |
| `Pallet <n> and its cargo will be permanently removed.` | `... and its boxes will be permanently removed.` |

## Tests

`backend/server/product/tests.py` — rename the model import, all `Cargo.objects`
/ `Cargo.next_index` references, the URLs under test, the request/response keys,
and the classes `BulkCargoCreateTests` → `BulkBoxCreateTests` and
`ScannerCargoListTests` → `ScannerBoxListTests`. The assertion on
`existing_cargo_count` becomes `existing_box_count`.

Test *coverage* does not change — this is a mechanical rename, and any behavioural
gap found along the way should be reported rather than silently fixed here.

## Documentation

`CLAUDE.md` — the scanner integration section and any model/relationship
references that mention cargo are updated to Box, including a note that the
scanner contract changed and old clients are incompatible.

## Verification

Every one of these must pass before the work is called done:

1. `python manage.py makemigrations --check --dry-run` → no model drift.
2. `python manage.py migrate` on a copy of production data → succeeds, and
   `select count(*) from box` matches the pre-migration `select count(*) from cargo`.
3. `python manage.py test product` → all pass.
4. `npm run build` and `npm run lint` in `frontend/` → clean.
5. `grep -rin cargo` excluding `node_modules`, `.next`, `venv`, `.git`, and
   `__pycache__` → hits only in historical migration files (`0018`, `0019`, `0040`,
   `0041`, `0042`, and the new `0044`'s `old_name='Cargo'`) and in the deliberate
   legacy comment on the `C{n}` suffix. Any other hit is an incomplete rename.

## Deployment

Hard cutover — order matters and there is unavoidable downtime for label printing.

1. Have the rebuilt Zebra APK ready **before** starting.
2. Pick a low-traffic window.
3. Server: `git pull` → `pip install -r requirements.txt` → `python manage.py
   migrate` → restart gunicorn.
4. Frontend: `npm install` → `npm run build` → restart Next.js.
5. Push the new APK to every scanner device.

Between steps 3 and 5, the old Zebra app receives 404s on `/cargos/` routes and
cannot print or sync labels. Web UI box management is unaffected.

Rollback: `git revert` the code and run `migrate product 0043` to rename the
table back. No data is destroyed in either direction.

## Scanner App Handoff Prompt

Deliver the following verbatim to the agent working on the Zebra scanner app,
after the server-side rename is merged.

---

> The Toyoshima inventory server has renamed its `Cargo` entity to `Box`. The
> scanner API changed with it, as a hard cutover with no backward compatibility —
> the old paths and keys now return 404 or 400. Update this app to match.
>
> **Route changes** (base unchanged: `<server>/product/scanner/`, auth still the
> `X-API-KEY` header with the same key):
>
> | Old | New |
> |---|---|
> | `POST pallets/<pallet_id>/cargos/bulk/` | `POST pallets/<pallet_id>/boxes/bulk/` |
> | `GET pallets/<pallet_id>/cargos/` | `GET pallets/<pallet_id>/boxes/` |
>
> **Payload changes:**
>
> - Bulk create request body: `{"cargos": [{"barcode": "...", "note": "..."}]}`
>   becomes `{"boxes": [{"barcode": "...", "note": "..."}]}`. Item shape is
>   unchanged.
> - Box list response: `{"success": true, "data": {"cargos": [...]}}` becomes
>   `{"success": true, "data": {"boxes": [...]}}`. Item shape
>   (`id`, `barcode`, `note`, `created_at`) is unchanged.
> - Pallet lookup response: the field `existing_cargo_count` is now
>   `existing_box_count`. Everything else in that response is unchanged.
> - Bulk create error strings changed to `"boxes must be a list"` and
>   `"each box must be an object"`. Only match on these if the app inspects error
>   text; matching on `success: false` plus the HTTP status is preferable.
>
> **Unchanged, do not touch:**
>
> - The `{"success": true, "data": {...}}` / `{"success": false, "error": "..."}`
>   envelope.
> - The barcode format. Labels are still composed as
>   `{so_number}-{licence_number}-{gateload_number}-C{n}` with a capital **C**.
>   The `C` is legacy and intentional — do **not** change it to `B`. Already-printed
>   labels use `C`, and the server's next-index logic parses `-C{n}`.
> - Bulk create is still idempotent: barcodes already on the pallet come back in
>   `data.skipped` rather than erroring.
> - The `X-API-KEY` header and its value.
>
> **Also rename internally:** any local model, DTO, variable, string resource, or
> UI label in this app that says "cargo" should say "box", so the app's vocabulary
> matches the server's. Inside a pallet are boxes, not cargo.
>
> **Deploy note:** this is a coordinated cutover. The server ships first and the
> old app stops working immediately, so this build needs to reach every scanner
> device promptly.

---

## Out of Scope

- Renaming the `cargo_id_seq` sequence or existing index names.
- Changing the `-C{n}` barcode suffix.
- Any behavioural change to box creation, dedup, or search.
- Refactoring unrelated to the rename.
