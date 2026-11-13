---
description: API endpoints reference and error handling for TGT Inventory
---
## Account (`/account/`)
| Method | Path | Purpose |
|--------|------|---------|
| GET/POST | `users/` | List users or authenticate |
| GET | `user-info/` | Current user info |
| POST | `register/` | Create new user |

## Checklist photo scans (`/product/`, JWT, admin/manager only)
| Method | Path | Purpose |
|--------|------|---------|
| GET/POST | `sos/<id>/checklist-scans/` | List (`?pallet=`) / upload photos (multipart `images`) |
| GET | `checklist-scans/<id>/` | Scan + draft + transcription |
| POST | `checklist-scans/<id>/preview/` | `{draft}` → `{check}` (dry run, writes nothing) |
| POST | `checklist-scans/<id>/rebuild/` | `{pallet_id?, overrides?}` → re-derived draft (no model call) |
| POST | `checklist-scans/<id>/confirm/` | `{draft}` → applied in one transaction; 409 = stale draft |
| POST | `checklist-scans/<id>/discard/`, `retry/` | Discard / read again (billed) |

## Error Handling
- Validate with `serializer.is_valid()` → return `serializer.errors` + `HTTP 400`
- Missing record → `HTTP 404` + `{ "error": "X not found" }`
- Scanner: wrap in try/except → `{ "success": false, "error": str(e) }`
- Scanner success: `{ "success": true, "data": {...} }`
- Delete success: `HTTP 204` empty body
