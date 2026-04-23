# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture

This is a warehouse receiving management system with two separate applications:

- **Backend:** Django 5.1 REST API at `backend/server/` — authentication, business logic, data storage
- **Frontend:** Next.js 14 (TypeScript, App Router) at `frontend/` — warehouse manager UI

They communicate via JWT-authenticated REST calls. The frontend is **not** Django-templated — it is a separate Next.js SPA. The `htmx` patterns described in older planning notes were **not** implemented; all interactivity is React/Next.js.

### Django apps

| App | Purpose |
|-----|---------|
| `account` | CustomUser (AbstractUser + `role`), JWT auth, user registration |
| `product` | All business models: Vendor, SO, Pallet, Board, Chip, ChipBrand, SOPhoto |

### Key URL prefixes

```
/api/token/          POST — get JWT access+refresh tokens
/api/token/refresh/  POST — refresh access token
/account/            User management (keep existing)
/product/            All business endpoints (vendors, sos, pallets, boards, chips, scanner, dashboard)
```

### Frontend pages (Next.js App Router)

| Route | Page |
|-------|------|
| `/` | Dashboard — KPI cards, charts, recent scans |
| `/sos/` | SO list with search/filter/pagination |
| `/sos/[id]/` | SO detail — pallets & boards tabs |
| `/sos/[id]/boards/[boardId]/` | Board detail with chips |
| `/vendors/` | Vendor management |
| `/chipbrands/` | Chip brand management |
| `/login/` | Authentication |

---

## Development Commands

### Backend (Django)

```bash
cd backend/server

# Activate venv (Windows)
source venv/Scripts/activate

# Run dev server
python manage.py runserver

# Apply migrations
python manage.py migrate

# Create migration after model changes
python manage.py makemigrations

# Load seed data (50 SOs, realistic pallets/boards/chips)
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
npm run lint
```

### Docker (runs both services)

```bash
docker-compose up    # Django on :8000, Postgres on :5432
```

### Environment

Copy `.env` settings are at `backend/server/.env`. Key variables:
- `SECRET_KEY`, `DEBUG`
- `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`
- `SCANNER_API_KEY` — used by Zebra scanner endpoints
- `MEDIA_ROOT` — local path for uploaded images

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
| `so.total_board_count` | Board record count |
| `so.effective_weight_rule` | SO's own rule or vendor default |

When `pallet_record_count != total_pallet_count`, the UI must show "X records · Y physical pallets total" above the pallets table.

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
- SO list supports: `q` (searches `so_number`, `licence_number`), `vendor`, `date_from`, `date_to`
- SO serializers include computed fields: `total_pallet_count`, `total_pallet_weight`, `total_board_count`, `pallet_record_count`
- Scanner endpoints at `/product/scanner/` use API key auth (`SCANNER_API_KEY`) and return `{ "success": true/false, "data": {...}, "error": "..." }`
- Delete success: HTTP 204 empty body
- Validation error: HTTP 400 + `serializer.errors`
- Missing record: HTTP 404 + `{ "error": "X not found" }`

---

## Data Semantics Cheat Sheet

Three scenarios that define exact storage and computed values:

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

## Feature Implementation Notes

### Pages to implement (remaining work)

See the `Pages to Implement` section in older planning notes. The agreed design is a clean, data-dense Linear/Notion/Retool-inspired aesthetic. Reference UI code is at `.claude/claude design ui/inventory-web/`.

### New SO modal behavior

Weight rule section is collapsed by default, showing "Per Pallet INHERITED FROM [Vendor]" + "Change" button. On override, display: "⚠️ Overriding [Vendor] default. This applies only to this SO."

### Future Zebra scanner integration

The companion Zebra scanner app will call `/product/scanner/` endpoints using the `SCANNER_API_KEY`. Do not change the scanner response format.

### Media files

Board photos and SO photos are stored at `MEDIA_ROOT` (configured in `.env`). Django serves them in dev via `MEDIA_URL`.
