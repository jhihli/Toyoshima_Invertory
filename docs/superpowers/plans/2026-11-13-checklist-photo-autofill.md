# Checklist Photo → Auto-filled Pallet Data — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The owner photographs a pallet's handwritten 清單, uploads it on the MSFT order page, reviews a server-built draft (MPNs + board counts, chips per MPN, checklist lines, reconciliation) and confirms; nothing touches live data before confirm.

**Architecture:** A `ChecklistScan` row per photo. A background thread calls Claude once per photo for a pure **transcription** (structured JSON). Deterministic server code (`scan_match` + `scan_draft`) turns the transcription into a **draft** against the pallet's current state. The draft is applied by ONE function, `apply_draft()`, used both for real (confirm, one transaction) and as a dry run inside a rolled-back savepoint, so reconciliation is literally `Pallet.checklist_check()` on the would-be state. Owner corrections become `ChecklistCorrection` rows fed back into matching and the prompt.

**Tech Stack:** Django 5.1 + DRF (Postgres), `anthropic` Python SDK (`claude-opus-5-5`, structured outputs, adaptive thinking, `fallbacks="default"`), Pillow; Next.js (App Router, TypeScript, inline styles).

**Spec:** `docs/superpowers/specs/2026-11-13-checklist-photo-autofill-design.md`

## Global Constraints

- Nothing is written to Pallet / PalletMPN / MPN / Chip / ChipBrand / Checklist before confirm. Draft building may only write inside a savepoint that is always rolled back.
- Checklist barcodes only via `Checklist.next_index()` + `Checklist.compose_barcode()` under `select_for_update` on the pallet. A created row's number must equal its sheet `#n`, else the confirm fails (400) and nothing is written.
- Reconciliation = `Pallet.checklist_check()`; no second checker.
- Never overwrite a checklist row with content unless the confirm body explicitly chooses the sheet value; never delete a row with content or a non-trailing row; never edit or delete existing chips; never remove a PalletMPN (missing ones are flagged yellow).
- Chip additions to an existing (shared) MPN are opt-in, unticked by default; chips of an MPN created by this scan are ticked by default.
- Label weight is compared (yellow on mismatch), never written.
- Memory slot groups are capacity names: data migration `"Memory"` → `"1G"` (case/space-insensitive), blank slot_group untouched; frontend stops pre-filling `Memory`.
- Seed dictionary: capacity_class D9SFT, D9MNQ, K4B1G1646G-BCH9, NT5TU64M16HG-AC = 1G; K4B2G1646Q-BCK0 = 2G; brand_abbrev AL = ALTERA.
- Model call: `claude-opus-5-5`, `thinking={"type":"adaptive"}`, `output_config={"effort": "high", "format": json_schema}`, `betas=["server-side-fallback-2026-07-01"]`, `fallbacks="default"`, system prefix cached (`cache_control` ephemeral), key from `ANTHROPIC_API_KEY`. One function `product.scan_reader.read_sheet()`; tests mock it; no test hits the API; no billed call is made by the builder.
- Scan endpoints: JWT + `IsAdminOrManager`. Errors per CLAUDE.md (400 + errors, 404 `{"error": "X not found"}`).
- No Celery: background = daemon thread started on commit; `processing` scans older than 10 min are stale and retryable; management command `process_checklist_scans` re-runs stale ones.
- `frontend/app/lib/api.ts` and `frontend/app/(main)/sos/[id]/page.tsx` are skip-worktree locally: zero changes to `api.ts`; `page.tsx` gets only small self-contained insertions.
- iPhone: upload via `<input type=file accept="image/*" multiple>`, review stacked at phone width, ≥40px tap targets; desktop photo | draft side by side.
- Backend tests: `venv/Scripts/python.exe manage.py test product --noinput` against local Postgres (sqlite cannot run migration 0018). Baseline 163 OK.

## Review Focus

1. **Confirming a stale draft** (another scan or a manual edit filled row #3 after the draft was built) — confirm must refuse (409) rather than overwrite; test in Task 6.
2. **Sheet index gap** (system #1–#3, sheet #1–#3 and #6) — #6 flagged, not created; confirm with it still marked create → 400; test in Task 5/6.
3. **Near-identical part numbers** (`EP4CE15F23C9LN` vs stored `EP4CE1SF23C9LN`, `NT5TU64M16HG-AC` vs `NT5TU64M16HG`) — must resolve to the existing chip, never create a duplicate; test in Task 3/5.
4. **Label for a different SO** — red error, confirm refused; test in Task 5/6.
5. **Unreadable / non-image upload** (HEIC Pillow cannot open, a PDF) — 400 at upload, no scan row; test in Task 7.

---

## File Structure

| File | Responsibility |
|---|---|
| `backend/server/product/models.py` | `ChecklistScan`, `ChecklistCorrection` |
| `backend/server/product/migrations/0057_memory_slot_group_to_1g.py` | data migration Memory → 1G |
| `backend/server/product/migrations/0058_checklistscan_checklistcorrection.py` | new tables + seed dictionary |
| `backend/server/product/scan_match.py` | pure normalisation / matching / capacity decoding |
| `backend/server/product/scan_reader.py` | prompt, JSON schema, image prep, `read_sheet()` (the only API call), cost |
| `backend/server/product/scan_draft.py` | `build_draft()`, `apply_draft()`, `preview_check()`, `learn_from_confirm()` |
| `backend/server/product/scan_worker.py` | `process_scan()`, `start_processing()`, staleness |
| `backend/server/product/scan_views.py` | the scan endpoints (kept out of the 1400-line views.py) |
| `backend/server/product/urls.py` | routes |
| `backend/server/product/views.py` | `chip_catalog` gains `slot_group` |
| `backend/server/product/management/commands/process_checklist_scans.py` | re-run stale scans |
| `backend/server/product/management/commands/eval_checklist_scans.py` | run the 4 samples, per-field accuracy + cost (owner runs it) |
| `backend/server/product/tests_scan.py` | new tests (imported by `tests.py`? no — Django discovers `tests*.py`) |
| `frontend/app/lib/checklistScanApi.ts` | types + API calls (own multipart helper; `api.ts` untouched) |
| `frontend/app/ui/pallet/ChecklistScans.tsx` | upload button + scan list + polling |
| `frontend/app/ui/pallet/ChecklistScanReview.tsx` | review screen |
| `frontend/app/(main)/sos/[id]/page.tsx` | one insertion: `<ChecklistScans>` above the Pallets table |
| `frontend/app/lib/chipSlots.ts`, `frontend/app/(main)/mpns/[id]/page.tsx` | stop pre-filling `Memory`; catalog pick copies `slot_group` |
| `CLAUDE.md`, `.claude/rules/*` | docs |

---

### Task 1: Memory → 1G slot groups (backend + frontend default)

**Files:** Create `migrations/0057_memory_slot_group_to_1g.py`; modify `tests.py` (Memory → 1G), `views.py` (`chip_catalog`), `chipSlots.ts`, `mpns/[id]/page.tsx`.

- [ ] Test `SlotGroupRenameMigrationTests.test_forward` (call the migration's `rename_memory(apps, schema_editor)` with real `apps`): chips with `'Memory'`, `' memory '` → `'1G'`; `''` and `'MEM2'` unchanged.
- [ ] Test `test_catalog_carries_slot_group`: `GET chips/catalog/` entry has `slot_group == '1G'`.
- [ ] Replace `'Memory'` slot groups in existing tests with `'1G'` (labels in asserts too).
- [ ] Implement; reverse migration is a no-op (new 1G chips can't be told apart).
- [ ] Frontend: delete `MEMORY_SLOT_GROUP`; `changeItemGroup` / `changeVariableQty` no longer touch slot group; `pickCatalog` copies catalog `slot_group` into a blank field; slot-group placeholder `e.g. 1G / 2G`; `ChipCatalogEntry.slot_group?: string`.
- [ ] Run tests; commit.

### Task 2: Models + seed

**Files:** `models.py`, `migrations/0058_...py`.

**Produces:**
- `ChecklistScan(so FK CASCADE, pallet FK SET_NULL null, image ImageField upload_to='checklist_scans/%Y/%m/', status in processing|ready|failed|confirmed|discarded, transcription JSON null, draft JSON null, confirmed JSON null, result JSON null, error Text, model Char, input_tokens/output_tokens/cache_read_tokens/cache_write_tokens Int default 0, cost_usd Decimal(10,4) null, attempts Int default 0, processing_started_at DateTime null, uploaded_by FK user SET_NULL null, created_at auto, updated_at auto, confirmed_at null)`; `db_table='checklist_scan'`; property `is_stale` (processing and started > `STALE_AFTER = timedelta(minutes=10)` ago).
- `ChecklistCorrection(kind in mpn_name|chip_model|capacity_class|brand_abbrev, raw_text, raw_key (scan_match.fuzzy_key(raw_text)), resolved, count default 1, last_seen auto_now)`; unique `(kind, raw_key)`; classmethods `lookup(kind, text) -> str|None`, `record(kind, raw, resolved)` (upsert, count+1).
- Seed rows in 0058 RunPython (Global Constraints values).
- [ ] Tests `CorrectionTests`: seeded `lookup('capacity_class','d9sft') == '1G'`; `record` twice → count 2, resolved updated; lookup is I/1 S/5 tolerant (`'D9SFT'` vs `'D95FT'`).
- [ ] Implement, makemigrations, run tests, commit.

### Task 3: `scan_match` (pure)

**Produces** (all in `product/scan_match.py`):
- `norm(s) -> str` — same as `checklist_check`'s (collapse spaces, upper).
- `fuzzy_key(s) -> str` — norm, drop non-alphanumerics, map `I→1, L→1? no`: map `I→1, S→5, O→0`.
- `mpn_key(s) -> str` — fuzzy_key after stripping a leading `SP#`/`SP` prefix token.
- `same_part(a, b) -> bool` — fuzzy keys equal, or one is a prefix of the other and the shorter has ≥ 8 chars.
- `capacity_class(text) -> str|None` — `1G`, `2G`, `512M` for brace items like `1G`, `1GB`, `2 G`.
- `decode_capacity(part) -> str|None` — Samsung `K4[A-Z](\d+)G…` → `{n}G`; Nanya/Micron `…(\d+)M(\d+)…` (NT5xx / MT4xx) → depth×width Mb → `1G`/`2G`/`512M`; Hynix `H5T[A-Z](\d+)G`; else None.
- `similarity(a, b) -> float` — difflib ratio on fuzzy keys.
- [ ] Tests (`ScanMatchTests`): `same_part('EP4CE15F23C9LN','EP4CE1SF23C9LN')`, `same_part('NT5TU64M16HG-AC','NT5TU64M16HG')`, not `same_part('SLKM8','SLKM9')`; `mpn_key('SP#841631-001') == mpn_key('841631-001')`; `mpn_key('x898568') == mpn_key('X898568')`; decode: `K4B1G1646G-BCH9`→1G, `K4B2G1646Q-BCK0`→2G, `NT5TU64M16HG-AC`→1G, `NT5CB128M16FP`→2G, `D9SFT`→None; `capacity_class('1GB')=='1G'`, `capacity_class('SLKM8') is None`.
- [ ] Implement, run, commit.

### Task 4: `scan_reader` (prompt, schema, image, cost — mocked)

**Produces:**
- `TRANSCRIPTION_SCHEMA: dict` (label{so_number,pallet_barcode,weight_text}, header_groups[{mpn_text, mpn_confidence, board_qty|null, board_qty_confidence, items[{text, confidence}]}], lines[{index|null, column, brand_text, model_text, model_confidence, qty|null, qty_confidence, model_candidates[]}], notes); confidences enum `high|low`; every object `additionalProperties: false` with all keys required.
- `build_context() -> dict` — known parts (catalog incl. slot_group), MPN names, corrections, ≤3 recent confirmed examples (transcription → confirmed lines/mpns).
- `build_system(context) -> list[dict]` — stable instructions block + dictionary block with `cache_control: {"type": "ephemeral"}`; deterministic ordering (sorted) so the prefix caches.
- `prepare_image(fileobj) -> (bytes, media_type)` — EXIF-transpose, RGB, long edge ≤ `CHECKLIST_SCAN_MAX_EDGE` (default 2000), JPEG q90.
- `compute_cost(usage) -> Decimal` — $4 / $20 per MTok in/out, cache write $5, cache read $0.20.
- `read_sheet(image_bytes, media_type, context) -> ReadResult(transcription: dict, model: str, usage: dict, cost_usd: Decimal)` — the ONLY function that calls the API; raises `ReadError` on refusal / max_tokens / missing key / API error.
- [ ] Tests (`ScanReaderTests`, `read_sheet`'s client constructor patched): schema objects all have `additionalProperties False` and required == properties; `build_system` byte-identical across two calls and last block cached; `prepare_image` shrinks a 4000×3000 PNG to ≤2000 long edge JPEG; `compute_cost` on a fixed usage; `read_sheet` with a fake client returning refusal → `ReadError`; with JSON text → parsed dict + cost; request kwargs include model, fallbacks, betas, effort.
- [ ] Implement with `client.beta.messages.stream(...).get_final_message()` (`max_tokens=32000`), run, commit.

### Task 5: `scan_draft.build_draft` + `apply_draft` + preview

**Consumes:** Tasks 2–3; `Pallet.checklist_check()`, `Checklist.next_index/compose_barcode/chip_allowed/text_from_chip`.

**Produces:**
- `build_draft(scan) -> dict` (stored in `scan.draft`): `pallet_id`, `pallet_options[{id,label,barcode}]`, `label{so_number,pallet_barcode,weight_text,weight,stored_weight}`, `errors[]` (red), `warnings[]` (yellow), `mpns[{key,text,board_qty,yellow[],match: exact|correction|near|new, mpn_id|null, new_name, suggestions[{id,name,score}], current_board_qty|null, board_qty_choice: sheet|keep, chips[{part, brand, slot_group, item_group, exists, apply, shared, note}], unresolved[]}]`, `missing_pallet_mpns[{mpn_id,name,board_qty}]`, `lines[{index, brand, part, raw_model, qty, capacity, capacity_source, candidates[], yellow[], action: fill|same|conflict|create|flag, row_id|null, existing{brand,model,qty}|null, use_sheet, flag}]`, `delete_rows[{row_id,index,barcode,apply:false}]`, `extra_rows[{row_id,index,model,qty}]`, `check` (preview).
- `apply_draft(pallet, draft) -> dict` summary; raises `DraftError(msg, status=400|409)`; does every write (brands, MPNs, chips, PalletMPNs, rows) re-validating against current DB state.
- `preview_check(pallet, draft) -> dict` — `apply_draft` inside `transaction.atomic()` then forced rollback; returns `checklist_check()` of the would-be state (or `{"status":"error","error":...}`).
- `learn_from_confirm(original, confirmed)` — ChecklistCorrection rows for changed mpn choice/name, line part, capacity, unresolved brace abbreviations resolved.
- [ ] Tests (`ScanDraftTests`, fixtures = the cl2 sample transcription; production-like DB: MPNs `SP#841631-001`, `SP#789124-001`, `1A4262W00-600-G`, `B600GH0` with chips incl. `EP4CE1SF23C9LN`, `NT5TU64M16HG` slot 1G; pallet S06-000979 / 06LP00083239 / 9 with 7 blank rows):
  - pallet identified; MPNs matched (`841631-001`→SP#841631-001 exact, `BG00GH0`→B600GH0 near & yellow); `AL` → existing `EP4CE1SF23C9LN` (no duplicate); `K4B2G1646Q-BCK0` capacity 2G (dictionary) planned as new chip on `1A4262W00-600-G` with `apply=False` (shared MPN).
  - all lines action `fill`; preview check status `ok` when chip additions ticked; nothing written (counts of PalletMPN/Chip/Checklist content unchanged after build).
  - apply → PalletMPN rows + board_qty, rows filled with chip FK set and text from chip, check `ok`.
  - missed scan: system #1–#5 → #6/#7 `create`; apply creates barcodes `…-6`, `…-7`.
  - trailing empty #8/#9 → `delete_rows` unticked; ticked → deleted on apply.
  - gap: system #1–#3, sheet #1–#3 + #6 → #6 `flag`.
  - row #3 has different content → `conflict`, `use_sheet False`; apply keeps old; with `use_sheet True` replaced.
  - label SO S06-000999 → red error.
  - weight 575 vs stored 500 → yellow warning, weight unchanged after apply.
  - PalletMPN on pallet not on sheet → `missing_pallet_mpns`, still present after apply.
  - existing PalletMPN with board_qty 140 vs sheet 147 → `board_qty_choice 'keep'`.
- [ ] Implement, run, commit.

### Task 6: worker + endpoints + learning

**Files:** `scan_worker.py`, `scan_views.py`, `urls.py`, `management/commands/process_checklist_scans.py`.

**Produces endpoints (all `/product/`, IsAdminOrManager):**
- `POST sos/<id>/checklist-scans/` multipart `images` (1–20, each Pillow-openable, ≤ 25 MB) → 201 `[scan]`, each `processing`, processing started on commit.
- `GET sos/<id>/checklist-scans/` → `[scan summary]` (`id,status,pallet_id,pallet_label,image_url,error,is_stale,cost_usd,created_at,confirmed_at`), `?pallet=` filter.
- `GET checklist-scans/<id>/` → summary + `draft`, `transcription`, `result`.
- `POST checklist-scans/<id>/preview/ {draft}` → `{check}`.
- `POST checklist-scans/<id>/rebuild/ {pallet_id?}` → scan (ready; draft rebuilt from stored transcription, no model call).
- `POST checklist-scans/<id>/confirm/ {draft}` → 200 scan (confirmed, `result`); 400/409 `{error}`; only from `ready`.
- `POST checklist-scans/<id>/discard/` → scan; `POST checklist-scans/<id>/retry/` → scan (allowed for failed, stale processing, ready).
- `process_scan(scan_id)`, `start_processing(scan_id)` (inline when `settings.CHECKLIST_SCAN_INLINE`, else `transaction.on_commit` + daemon thread).
- [ ] Tests (`ScanApiTests`, `read_sheet` patched, `CHECKLIST_SCAN_INLINE=True`): upload 2 images → 2 scans ready with drafts; n_user → 403; non-image → 400 and no row; read error → failed + error text, retry → ready; confirm writes + status confirmed + corrections recorded for an edited part; confirm twice → 400; stale draft (row filled after build) → 409 and nothing written; discard; GET 404 `{"error": "Checklist scan not found"}`; stale processing → retry allowed, fresh processing → 400.
- [ ] Implement, run, commit.

### Task 7: eval command

- `eval_checklist_scans --dir <folder> [--samples cl1,cl2,cl3,cl4] [--yes]` — runs `read_sheet` on each sample, compares to the expected answers embedded in the command (spec appendix), prints per-field accuracy (label, header mpn text, board qty, brace items, line index, model, qty) and per-photo + total cost; refuses to call the API without `--yes`.
- [ ] Test the scoring function on a perfect and an imperfect fake transcription (no API).
- [ ] Commit.

### Task 8: Frontend

- `checklistScanApi.ts`: types `ChecklistScan`, `ScanDraft`…, calls listed in Task 6.
- `ChecklistScans.tsx`: props `{ soId: number; pallets: Pallet[]; onApplied: () => void }`; button "上传清单 / Upload checklist" (hidden input `accept="image/*" multiple`); list of scans (status badge, pallet label, retry/discard/review); polls every 3 s while any scan is processing.
- `ChecklistScanReview.tsx`: Modal; desktop grid `minmax(0,1fr) minmax(0,1.3fr)`, mobile single column (photo collapsible); sections Pallet & label, Board types, Chip additions (checkboxes "add <part> to MPN <name> (affects all orders)"), Lines, Deletions, Reconciliation; yellow `#f5eedf` / red `#f3e2dd`; debounced preview; Confirm / Discard.
- `page.tsx`: insert `<ChecklistScans soId={soId} pallets={so.pallets} onApplied={loadSO} />` at the top of the `tab === 'pallets'` block (mobile and desktop).
- [ ] `npx tsc --noEmit`, `npm run build`; commit.

### Task 9: Docs

- CLAUDE.md: ChecklistScan / ChecklistCorrection, endpoints, 1G/2G slot_group semantics, `ANTHROPIC_API_KEY`, `process_checklist_scans`, eval command, migrations 0057/0058 in the deploy notes. `.claude/rules/`: remove/flag stale `data model.md`; add the scan endpoints to `api.md`.
- [ ] Commit.
