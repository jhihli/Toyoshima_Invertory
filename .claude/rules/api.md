---
description: API endpoints reference and error handling for TGT Inventory
---
## Account (`/account/`)
| Method | Path | Purpose |
|--------|------|---------|
| GET/POST | `users/` | List users or authenticate |
| GET | `user-info/` | Current user info |
| POST | `register/` | Create new user |

## Error Handling
- Validate with `serializer.is_valid()` → return `serializer.errors` + `HTTP 400`
- Missing record → `HTTP 404` + `{ "error": "X not found" }`
- Scanner: wrap in try/except → `{ "success": false, "error": str(e) }`
- Scanner success: `{ "success": true, "data": {...} }`
- Delete success: `HTTP 204` empty body
