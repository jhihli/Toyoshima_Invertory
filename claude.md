# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture

This is a warehouse receiving management system with two separate applications:

- **Backend:** Django 5.1 REST API at `backend/server/` — authentication, business logic, data storage
- **Frontend:** Next.js 14 (TypeScript, App Router) at `frontend/` — warehouse manager UI

They communicate via JWT-authenticated REST calls. The frontend is **not** Django-templated — it is a separate Next.js SPA.

### Django apps

| App | Purpose |
|-----|---------|
| `account` | CustomUser (AbstractUser + `role`), JWT auth, user registration |
| `product` | All business models: Vendor, SO, Pallet, PalletMPN, MPN, Chip, ChipBrand, Box, Checklist, SOPhoto, ChecklistScan, ChecklistCorrection |

### Key URL prefixes

```
/api/token/          POST — get JWT access+refresh tokens
/api/token/refresh/  POST — refresh access token
/account/            User management
/product/            All business endpoints (vendors, sos, pallets, pallet mpns, checklists, checklist scans, mpns, scanner, dashboard)
/admin/              Django admin
```

### Frontend pages (Next.js App Router)

| Route | Page |
|-------|------|
| `/` | Dashboard — KPI cards, charts, recent scans |
| `/sos/` | SO list with search/filter/pagination |
| `/sos/[id]/` | MSFT order detail — Pallets & Boards tabs (`?tab=boards&pallet=<id>` deep-links) |
| `/vendors/` | Vendor management |
| `/chipbrands/` | Chip brand management |
| `/login/` | Authentication |

---

## Development Commands

### Backend (Django)

```bash
cd backend/server

# Activate venv
source venv/Scripts/activate   # Windows
source venv/bin/activate       # Linux/Mac

# Run dev server
python manage.py runserver

# Apply migrations
python manage.py migrate

# Create migration after model changes
python manage.py makemigrations

# Load seed data
python manage.py seed_data

# Create admin user
python manage.py createsuperuser
```

### Frontend (Next.js)

```bash
cd frontend

npm install
npm run dev     # dev server on http://localhost:3000
npm run build
npm run start   # production serve on port 3000
npm run lint
```

### Environment

Backend config at `backend/server/.env`. Key variables:
- `SECRET_KEY`, `DEBUG`
- `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`
- `SCANNER_API_KEY` — used by Zebra scanner endpoints
- `MEDIA_ROOT` — local path for uploaded images (production: `/var/www/toyoshima/media`)
- `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`
- `ANTHROPIC_API_KEY` — checklist photo reader. Use a dedicated Anthropic workspace key with a
  monthly spend limit (2026-08 compromise, `docs/SECURITY.md`). Unset = photo reads fail with a clear error.
- Optional: `CHECKLIST_SCAN_MODEL` (default `claude-opus-5-5`), `CHECKLIST_SCAN_EFFORT` (`high`),
  `CHECKLIST_SCAN_MAX_EDGE` (2000 px sent to the model; the original stays on disk)

Frontend config at `frontend/.env.local`:
- `NEXT_PUBLIC_Django_API_URL` — backend URL (e.g. `http://localhost:8000`)
- `NEXTAUTH_URL`, `NEXTAUTH_SECRET`
- `NEXT_PUBLIC_API_KEY` — matches backend `SCANNER_API_KEY`

---

## Production Deployment

The server runs bare Python + native Postgres (no Docker). Stack:
- **nginx** — reverse proxy (port 80/443 → internal services)
- **gunicorn** — serves Django on port 8000 (managed by the `toyoshima-backend` systemd unit)
- **Next.js** — serves frontend on port 3000 (managed by the `toyoshima-frontend` systemd unit)
- **PostgreSQL** — database
- **Let's Encrypt** — SSL cert (auto-renews via certbot)

**Services run under systemd** (`toyoshima-backend`, `toyoshima-frontend`) — start/stop/restart
with `systemctl`. **Never** use `nohup` or `gunicorn --daemon` — that spawns duplicate, unmanaged
processes alongside the systemd-owned ones. This is deliberate hardening after the 2026-08 incident;
see `docs/SECURITY.md`. The deploy directory is `~/Toyoshima_Invertory` (misspelled, matching the repo name).

### Update procedure

Automated: after `git push origin main`, run `ssh toyoshima '~/Toyoshima_Invertory/scripts/deploy.sh'`
from the dev PC (add `--migrate` when it reports new migrations). See `docs/DEPLOY.md`.

**Standing instruction from the user (2026-11-05):** when the user asks to update / deploy the
server (更新服务器), Claude does the whole thing without asking again — commit, `git push origin main`,
run `deploy.sh`, report the result. The only exception: if `deploy.sh` exits 2 (new migrations),
read them and confirm with the user before rerunning with `--migrate`.

Connectivity: `ssh toyoshima` uses the office LAN (`192.168.1.196`). From outside the office, the
server is reached over Tailscale instead (switch the alias `HostName` to the server's `100.x` IP);
never forward port 22 on the router.

The manual steps the script performs:

```bash
cd ~/Toyoshima_Invertory      # note: repo/dir name is misspelled "Invertory"
git pull origin main

# Backend — only if backend/ changed
cd backend/server
source venv/bin/activate
pip install -r requirements.txt      # only when requirements.txt changed
# before migrations that drop tables (e.g. 0048_delete_board), back up first:
#   pg_dump -U $DB_USER -h $DB_HOST $DB_NAME > ~/backup_$(date +%F).sql
# 0047 cannot place boards that have no pallet or no MPN — count them first and decide
# whether to assign them in the old UI before migrating:
#   psql -U $DB_USER -h $DB_HOST $DB_NAME -c "SELECT so_id, count(*) FROM board
#     WHERE pallet_id IS NULL OR mpn_id IS NULL GROUP BY so_id;"
python manage.py migrate             # only when there are new migrations
# after 0048_delete_board: rm -rf /var/www/toyoshima/media/boards   (old board photos)
# 0057 renames every Chip.slot_group 'Memory' → '1G' (not reversible) — back up first.
sudo systemctl restart toyoshima-backend
# a restart kills in-flight checklist photo reads; re-read them (billed) once it is up:
#   python manage.py process_checklist_scans
sudo systemctl status toyoshima-backend    # confirm active (running)

# Frontend — only if frontend/ changed
cd ../../frontend
npm install                          # only when package.json / lockfile changed
npm run build
sudo systemctl restart toyoshima-frontend
sudo systemctl status toyoshima-frontend   # confirm active (running)

# Reload nginx only if its config changed
sudo nginx -t && sudo systemctl reload nginx
```

Logs: `journalctl -u toyoshima-frontend -n 100` (or `-u toyoshima-backend`), `-f` to follow.

### nginx config location
`/etc/nginx/sites-enabled/toyoshimainventory` — proxies:
- `/api/`, `/product/`, `/account/`, `/token/` → gunicorn on port 8000
- `/admin/` → gunicorn on port 8000
- `/media/` → static files at `/var/www/toyoshima/media/`
- `/` → Next.js on port 3000

### Server network notes
- Server LAN IP: `192.168.1.196`, pinned by an IP reservation on the router (device "Dell e5:3f:1f",
  MAC `b8:cb:29:e5:3f:1f`)
- Public IP: `68.201.129.63` (domain `toyoshimainventory.com` A record points here; no AAAA record).
  It was `72.183.39.29` until the router was replaced in 2026-10 — Spectrum can change it, so check
  with `curl -4 ifconfig.me` on the server before touching DNS.
- Router is a Spectrum Business router (WiFi `SpectrumSetup-2E` since 2026-10). Port forwarding lives in
  the Spectrum Business portal: Services → Internet → Router → Port Forwarding and IP Reservations →
  "Dell e5:3f:1f" → `toyoshima-http` (TCP 80→80) and `toyoshima-https` (TCP 443→443).
- **A rule can show as saved but not work.** After the 2026-10 router swap, 443 was listed but inbound 443
  timed out while 80 worked (so HTTP→HTTPS redirects died). Deleting and re-creating the 443 rule fixed it.
  Check from OUTSIDE the office (phone data, or canyouseeme.org) — never from the office LAN.
- **Hairpin NAT does not work:** from inside the office, the domain resolves to the public IP and the router
  will not loop it back. The dev PC works only via a hosts-file override (`192.168.1.196 toyoshimainventory.com`).
  Scanners/handhelds need a non-office network (hotspot / mobile data) or a local DNS override.

---

## Data Model — Critical Semantics

### Weight rule inheritance

`SO.weight_rule` overrides `Vendor.default_weight_rule`. If `SO.weight_rule` is blank, it falls back to the vendor default. The `SO.save()` method auto-fills `weight_rule` from the vendor when blank. **Never reimplement this logic elsewhere.**

### Pallet counting — two modes

**Per Pallet** (`weight_rule='per_pallet'`): every Pallet row has `qty=1`. Physical count == record count.

**Aggregated** (`weight_rule='aggregated'`): Pallet rows have `qty > 1` representing batches. Physical count ≠ record count.

Always use these SO properties — never `count()` on the queryset directly:

| Property | Returns |
|----------|---------|
| `so.total_pallet_count` | `Sum('qty')` — physical pallets |
| `so.pallet_record_count` | `count()` — table rows (tab badge) |
| `so.total_pallet_weight` | `Sum('weight')` |
| `so.total_board_count` | Sum of every pallet's `effective_board_qty` (`total_board_qty` is the same number) |
| `so.effective_weight_rule` | SO's own rule or vendor default |

When `pallet_record_count != total_pallet_count`, the UI must show "X records · Y physical pallets total" above the pallets table.

### Model relationships

```
Vendor → SO → Pallet → PalletMPN → MPN → Chip → ChipBrand
              Pallet → Checklist → Chip (FK, nullable)
              Pallet → Box
         SO → SOPhoto
         SO → ChecklistScan → Pallet (nullable until identified)
```

Key field notes:
- `PalletMPN` — which board types (MPNs) sit on a pallet: (pallet, mpn) unique, `board_qty`.
  Replaced barcode-scanned `Board` rows (removed 2026-10; backfilled by migration 0047).
- `Pallet.effective_board_qty` is the ONLY place a pallet's board count is computed: sum of its
  PalletMPN `board_qty` (blank = 0), or the legacy hand-typed `Pallet.board_qty` when the pallet
  has no rows (`board_qty_is_legacy`). The Pallet API's `board_qty` is this value, read-only.
- `Checklist.chip` — FK to `Chip` (nullable, PROTECT). Must belong to an MPN on the line's pallet
  (`Checklist.chip_allowed`); the server copies brand/model text from it (`text_from_chip`),
  and `Chip.save()` / `ChipBrand.save()` re-copy it whenever the chip or brand is edited.
  MSFT checklists pick a chip; Sales Orders checklists stay free text.
- `PalletChipNG` — failed (NG) chips per (pallet, chip), edited from the Pallets table's NG column.
  The SO export's Inventory sheet is built by `GET sos/<id>/inventory/` (checklist lines → NG rows,
  per pallet; tantalum is one SO-level weight, `SO.tantalum_weight` + `tantalum_unit` (lb|g), reported as entered on
  Bid_Template_Tantalum); every other sheet's chip quantities are formulas over that sheet.
- `Pallet.board_qty` — legacy hand-typed board count, read only as the fallback in
  `effective_board_qty`; never written by the UI any more
- `Chip.mpn` — FK to `MPN` (nullable)
- `Chip.slot_group` — chips sharing it are interchangeable alternates for ONE slot (one per
  board). **Memory slots are named by capacity class: `1G`, `2G`, …** (migration 0057 renamed
  every `Memory` to `1G`): memory of one capacity is mixed after cutting and counted per class,
  CPU-type parts (SLKM8, EP4CE15F23C9LN, AST2400) per part number. `Pallet.checklist_check()`
  reconciles per slot on that basis. Blank = the chip is its own slot. Nothing pre-fills it.
- `Box.pallet` — FK to `Pallet` (`related_name='boxes'`), DB table `box`

### Barcode composition

`Pallet.compose_barcode()` is the single source of truth. Never rebuild this string
by hand anywhere else — the frontend and the scanner app both take it from the server.

```
pallet    = {so_number}-{licence_number}-{gateload_number}   (blank segments skipped)
box       = pallet barcode, verbatim
checklist = pallet barcode + "-{n}", n from 1, continuous within the pallet
```

### Box

A `Box` is a physical box sitting on a pallet. **Every box on a pallet carries the
pallet's own barcode** — there is no per-box suffix, because all the floor needs on a
box is which SO and which pallet. A Box row is therefore a count of boxes plus a note.

Rows created before 2026-08 still carry a legacy `-C{n}` suffix (from when the model
was named `Cargo`). Those labels are printed and stuck to physical boxes, so the rows
are never rewritten — expect a pallet to hold a mix of suffixed and bare barcodes.

Because box barcodes are not unique, the scanner bulk endpoint uses **count semantics**,
not per-barcode dedup: the device reports how many boxes the pallet has and the server
tops the row count up to that number, never down.

### Checklist

A `Checklist` row is one line of the 清單 produced after a pallet's boards are cut,
barcoded `{pallet barcode}-{n}`. It hangs off `Pallet`, not `Box` — once every box
shares one barcode, "which box did this come from" is neither answerable nor needed.

`brand`, `model` and `qty` are all optional free-text/numeric fields; labels are often
printed first and filled in later. **Barcodes are always allocated server-side**
(`Checklist.next_index()` + `compose_barcode()`), never composed by a client — two
scanners each guessing the next number would both pick the same one.

### Checklist photo scans (清單 photo → draft → confirm)

Spec: `docs/superpowers/specs/2026-11-13-checklist-photo-autofill-design.md`. The owner photographs
a filled-in sheet on the MSFT order's Pallets tab; nothing touches Pallet / PalletMPN / MPN / Chip /
Checklist until they confirm the review screen.

- `ChecklistScan` (`checklist_scan`): one per photo — `image` (kept, `checklist_scans/%Y/%m/`),
  `status` processing → ready | failed → confirmed | discarded, `transcription` (the model's raw
  reading), `draft` (server-built plan), `confirmed`, `result`, tokens + `cost_usd`, `attempts`.
- `ChecklistCorrection` (`checklist_correction`): owner-confirmed meanings (`mpn_name`,
  `chip_model`, `capacity_class`, `brand_abbrev`), keyed on the I/1 S/5 O/0-folded text. Fed into
  the prompt and checked before fuzzy matching. 0058 seeds D9SFT/D9MNQ/K4B1G1646G-BCH9/
  NT5TU64M16HG-AC = 1G, K4B2G1646Q-BCK0 = 2G, AL = ALTERA.
- `product/scan_reader.read_sheet()` is the ONLY Anthropic API call (claude-opus-5-5, structured
  output, adaptive thinking, effort high, `fallbacks="default"`, cached dictionary prefix). It
  transcribes; it decides nothing. Tests must mock it — never hit the API from a test.
- `product/scan_draft.py`: `build_draft` (matching: MPNs ignore `SP#` + case, near-matches only
  pre-selected and yellow; parts via `scan_match.same_part`, never a near-duplicate chip),
  `apply_draft` (the single writer, one transaction, re-validates everything; rows only via
  `next_index()`/`compose_barcode()`; never overwrites a row with content unless `use_sheet`,
  never deletes a row with content or a non-trailing row, never edits/deletes existing chips,
  never removes a PalletMPN, never writes weight), `preview_check` (apply in a rolled-back
  savepoint → `checklist_check()`; **don't write a second reconciliation**). Chip additions to an
  existing MPN are opt-in (shared by every order).
- Background: a daemon thread per photo, started on commit (no Celery). A restart kills in-flight
  reads → scan stuck `processing`, stale after 10 min, retry from the UI or
  `manage.py process_checklist_scans` (billed).
- Eval: `manage.py eval_checklist_scans --dir "<repo>/asset/checklist screenshot" --yes`
  (BILLED, one call per photo) scores the 4 samples per field and prints cost.

### Pallet mode rules for seed data / tests

- Per Pallet vendors (MSFT, Dell, Lenovo): `qty=1` on every Pallet row
- Aggregated vendors (SMS, HPE): `qty` between 3–15 per row
- Include at least 2 SOs that override their vendor default

---

## Auth Pattern

JWT via `djangorestframework-simplejwt`. Frontend uses NextAuth (`auth.ts`) to manage session.

- Access token: 8 hours
- Refresh token: 7 days
- `AUTH_USER_MODEL = 'account.CustomUser'`

User roles: `admin`, `manager`, `vz_user`, `r2_user`, `n_user`. Role-based menu visibility is controlled in the frontend.

---

## API Conventions

- All list endpoints support `page` and `page_size` query params
- SO list supports: `q` (searches `so_number`), `vendor`, `date_from`, `date_to`
- SO serializers include computed fields: `total_pallet_count`, `total_pallet_weight`, `total_board_count`, `pallet_record_count`
- Scanner endpoints at `/product/scanner/` use API key auth (`SCANNER_API_KEY`) and return `{ "success": true/false, "data": {...}, "error": "..." }`
- Delete success: HTTP 204 empty body
- Validation error: HTTP 400 + `serializer.errors`
- Missing record: HTTP 404 + `{ "error": "X not found" }`
- Checklist scans (JWT, admin/manager only): `POST/GET sos/<id>/checklist-scans/` (multipart
  `images`; `?pallet=`), `GET checklist-scans/<id>/`, and POSTs under `checklist-scans/<id>/`:
  `preview/ {draft}`, `rebuild/ {pallet_id?, overrides?}`, `confirm/ {draft}` (409 = the pallet
  changed since the draft — rebuild), `discard/`, `retry/`

---

## Data Semantics Cheat Sheet

**Scenario 1 — MSFT, Per Pallet (3 physical pallets, 3 rows)**
```
SO-001 (vendor=MSFT, weight_rule=per_pallet)
├── Pallet row 1: weight=24, qty=1
├── Pallet row 2: weight=36, qty=1
└── Pallet row 3: weight=28, qty=1
total_pallet_count=3, pallet_record_count=3, total_pallet_weight=88
```

**Scenario 2 — SMS, Aggregated (12 physical pallets, 2 rows)**
```
SO-002 (vendor=SMS, weight_rule=aggregated)
├── Pallet row 1: weight=100, qty=5
└── Pallet row 2: weight=124, qty=7
total_pallet_count=12, pallet_record_count=2, total_pallet_weight=224
```

**Scenario 3 — MSFT with override (10 physical pallets, 1 row)**
```
SO-003 (vendor=MSFT, weight_rule=aggregated ← overrides MSFT default)
└── Pallet row 1: weight=240, qty=10
total_pallet_count=10, pallet_record_count=1, total_pallet_weight=240
vendor.default_weight_rule=per_pallet (unchanged)
```

---

## Scanner Integration

The Zebra scanner app calls `/product/scanner/` endpoints using `SCANNER_API_KEY` header auth. Do not change the scanner response format:
```json
{ "success": true, "data": { ... } }
{ "success": false, "error": "reason" }
```

Board scanning was retired in 2026-10: the `board_inbound` action and
`scanner/boards/<pk>/photo/` are gone (boards are assigned per pallet on the MSFT order's
Boards tab instead).

Label endpoints (renamed from `cargo` in a hard cutover — old clients get 404):
- `GET  scanner/pallets/lookup/?barcode=` → `pallet_barcode`, `existing_box_count`,
  `existing_checklist_count`. Print `pallet_barcode` as-is; do not recompose it.
- `POST scanner/pallets/<pk>/boxes/bulk/` → body `{ "boxes": [{ "note" }] }`.
  `len(boxes)` is the pallet's **total** box count, not a delta. Any `barcode` in the
  body is ignored — the server composes it. Returns `created`, `skipped`, `total`.
- `GET  scanner/pallets/<pk>/boxes/` → `data.boxes`
- `POST scanner/pallets/<pk>/checklists/bulk/` → body `{ "items": [{ "brand", "model",
  "qty" }] }` (or `{ "count": N }`). The server allocates the numbers and returns the
  composed barcodes in `data.checklists` for printing.
- `GET  scanner/pallets/<pk>/checklists/` → `data.checklists`

Renaming these keys again requires rebuilding and redeploying the Zebra APK in lockstep.

## Media Files

SO, pallet, MPN/chip and checklist-scan photos (`checklist_scans/`, kept permanently) stored at `MEDIA_ROOT` (configured in `.env`). Production path: `/var/www/toyoshima/media/`. nginx serves `/media/` directly from filesystem in production.
