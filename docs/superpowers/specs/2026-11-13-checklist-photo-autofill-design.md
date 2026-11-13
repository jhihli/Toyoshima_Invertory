# Checklist photo → auto-filled pallet data — design

Date: 2026-11-13 · Status: owner decisions recorded; awaiting final approval

## Why

After a pallet's boards are cut, a worker fills in a paper 清單 (checklist sheet) by hand and
gives it to the owner. Today the owner types it into the system by hand: the pallet's board types
(MPNs) with board counts, the chips on each MPN, and every checklist line. It is slow, and the
owner is the only one who can do it.

The goal is for the owner to photograph the sheets, upload them, glance at a pre-filled draft, and
confirm. The tool should get better over time: handwriting is often poor, and every correction the
owner makes should make the next read more accurate. "Training" here means **accumulated rules and
corrections fed to a strong hosted model**, not fine-tuning a model.

## What a sheet looks like

Samples: `asset/checklist screenshot/cl1–cl4.png` (git-ignored; SO S06-000979). One sheet = one
pallet. Each sheet has three zones:

1. **Pallet label** (printed sticker, top-left): `MSFT / S06-000979 / 06LP00083239-9 / 575 LB`:
   vendor, SO number, pallet barcode text, weight.
2. **Handwritten header notes** (above the table): one group per board type:
   `841631-001 (147) { SLKM8, 1G, AL }`, meaning MPN, **circled number = board count**, and the
   braces list the chips on that board. Brace entries are either a CPU-type part number (`SLKM8`),
   a brand abbreviation (`AL` = ALTERA, the FPGA), or a **memory capacity class** (`1G`, `2G`).
3. **Table** (the checklist proper): each line has a printed barcode sticker `#1`, `#2`… (printed
   earlier by the Zebra scanner; that is the checklist line number), plus handwritten 牌子 (brand,
   often blank), 型号 (model) and 数量 (qty). The sheet has a left and a right column of lines;
   a sticker can sit in either.

### The rule that makes this checkable

Memory chips of the same capacity are mixed together after cutting, so they are counted per
**capacity class**, not per part number. CPU-type chips (SLKM8, ALTERA EP4CE15F23C9LN,
ASPEED AST2400, …) are counted per part number. With one chip per slot per board:

- a CPU-type line's qty = Σ board counts of the MPNs listing that chip
- the sum of all 1G lines = Σ board counts of the MPNs listing `1G` (same for 2G)

All four samples reconcile exactly, e.g. cl2: SLKM8 191 = 147+12+31+1; AL/EP4CE15F23C9LN
159 = 147+12; 1G: D9SFT 143 + D9MNQ 16 + NT5TU64M16HG-AC 1 = 160 = 147+12+1; 2G:
K4B2G1646Q-BCK0 31 = 31.

This is exactly what `Pallet.checklist_check()` (`backend/server/product/models.py:173`) already
computes. It works per slot: alternates sharing a `Chip.slot_group` (e.g. `"1G"`) form one slot,
matched by normalised part number. **The feature must express 1G/2G as `slot_group` on the MPN's
memory chips and reuse `checklist_check()` for reconciliation, not build a second checker.**

## Goals

- Upload one or more sheet photos from the **MSFT order detail page** (`/sos/[id]/`), from an
  iPhone or a desktop.
- For each photo, produce a **draft**: which pallet; MPNs + board counts; chips per MPN (CPU parts
  by part number, memory by capacity class); filled checklist lines.
- Create missing MPNs, chips and chip brands automatically (in the draft; written on confirm).
- Classify every memory line as 1G / 2G / … and reconcile totals per slot; flag mismatches.
- Reconcile checklist **line count** against the blank rows already in the system (see below).
- Owner reviews and confirms; **nothing is written to Pallet/PalletMPN/Chip/Checklist before
  confirm.**
- Keep every photo, the model's raw reading, and the owner's confirmed result, so corrections can
  be learned from.
- Get more accurate with use (corrections dictionary + few-shot examples).

## Non-goals

- Fine-tuning or self-hosting a model (the RTX 5060 box is not used in this version).
- Workers uploading or reviewing (only the owner does both).
- NG (`is_ng`) marking from the photo: the sheets carry no NG information.
- Sales Orders (non-MSFT) checklists, which stay free text.
- The Excel report and automated deploy (later phases).

## Anti-goals (would be a failure even if it "works")

- Writing to live data without the owner's confirm.
- Silently overwriting a checklist line that already has different content.
- Deleting checklist rows that might be real (any row with content, or a gap in the middle).
- Composing checklist barcodes outside `Checklist.next_index()` / `compose_barcode()`.
- A second reconciliation algorithm that can disagree with `checklist_check()`.

## Flow

1. Owner opens MSFT order S06-000979 → Pallets tab → **"上传清单 / Upload checklist"** button
   (next to "Add pallet"; desktop action row `frontend/app/(main)/sos/[id]/page.tsx` ~1086, plus
   a mobile equivalent). Picks several photos at once.
2. Each photo becomes a `ChecklistScan` row (status `processing`) and is read by the model in the
   background, so the upload request does not wait on the model call.
3. The model returns a **transcription** (structured JSON, below). The server, not the model,
   then does matching, classification, creation plans and reconciliation, producing the draft.
4. Owner opens the review screen: photo on one side, draft on the other (stacked on iPhone).
   Uncertain fields are **yellow**; reconciliation failures are **red**; planned creations
   (new MPN / chip / brand / checklist rows) and planned deletions are listed explicitly.
5. Owner edits whatever is wrong and confirms. The server applies everything in **one
   transaction**, records the confirmed result, and learns from the differences.

### Identifying the pallet

The model reads the label's SO number and pallet barcode text. The server matches the pallet by
its composed barcode (`Pallet.compose_barcode()`) within the SO the upload came from. If the SO on
the label is not the page's SO → red error ("this sheet belongs to S0x-…"). If no pallet matches,
the owner picks the pallet from a dropdown on the review screen. The checklist stickers (`#n`,
whose text also carries the pallet barcode) are a second signal.

## What the model returns (transcription only)

One call per photo, structured output (JSON schema), with:

- `label`: `so_number`, `pallet_barcode`, `weight_text`
- `header_groups[]`: `mpn_text`, `board_qty`, `items[]` (each brace entry as written),
  with per-field `confidence` (high / low)
- `lines[]`: `index` (the `#n` on the sticker), `brand_text`, `model_text`, `qty`,
  per-field `confidence`, and `model_candidates[]`: its best guesses for a poorly written model,
  **chosen from the provided known-part list where possible**
- `notes`: anything it could not place

The prompt includes: the sheet-format description above, the known-parts dictionary (from
`chips/catalog/`, i.e. every `chip_mpn` with brand and `slot_group`), the known MPN names, the
correction dictionary, and a few recent confirmed examples. These are the "experience" inputs.

Model: `claude-opus-5-5` via the official `anthropic` Python SDK, structured outputs
(`output_config.format` / `messages.parse`), adaptive thinking, effort set explicitly, and
server-side refusal fallback (`fallbacks: "default"`) enabled. The stable prompt prefix
(instructions + dictionaries) should be prompt-cached. Rough cost: on the order of US$0.10–0.20
per photo; the builder should measure it on the four samples and record the real number.

## Server-side draft building (deterministic)

**MPNs.** Match `mpn_text` to `MPN.name` (normalised; corrections dictionary first). Not found →
plan a new MPN. Planned PalletMPN `board_qty` = circled number. If the pallet already has that
PalletMPN with a different `board_qty` → show old vs new, owner picks.

**Chips per MPN.** For each brace entry:

- CPU-type part (`SLKM8`) or brand abbreviation (`AL`): resolve to a part number. `AL` resolves to
  the ALTERA part that appears in the table; abbreviations are learned in the corrections
  dictionary. Ensure a `Chip` with that `chip_mpn` exists under the MPN; brand from the catalog,
  creating the `ChipBrand` if missing.
- Capacity class (`1G`, `2G`): ensure that every memory part on this pallet's table classified to
  that class exists as a `Chip` under the MPN with `slot_group = "1G"` (alternates in one slot).
- New chips default to `qty = 1` per board (all samples are consistent with this).
- Existing MPNs that already have chips: add only what is missing (each addition opt-in, see
  decision 2); never edit or delete existing chips.

**Classifying a memory part's capacity** (in order):

1. existing `Chip.slot_group` for that part number anywhere in the catalog
2. the corrections/capacity dictionary (owner-confirmed)
3. decoding the part number (e.g. Samsung `K4B1G…` = 1Gb, `K4B2G…` = 2Gb; `NT5TU64M16…` =
   64M×16 = 1Gb)
4. otherwise **yellow**, owner picks the class (and it is remembered)

Short Micron FBGA codes like `D9SFT` / `D9MNQ` cannot be decoded; they come from 1–2. Seed the
dictionary with the classes established from the samples: D9SFT, D9MNQ, K4B1G1646G-BCH9,
NT5TU64M16HG-AC = 1G; K4B2G1646Q-BCK0 = 2G. **Owner should confirm these four.**

**Checklist lines.** Match by sticker index `#n` to the existing row whose barcode ends in `-n`.
Set `chip` to a chip on the pallet with that part number (satisfying `Checklist.chip_allowed`);
brand/model text then comes from `text_from_chip` as usual. Qty from the photo.

**Line-count reconciliation** (system rows vs sheet lines):

| Case | Example | Draft action |
|---|---|---|
| Same | sheet #1–#7, system #1–#7 | fill in place |
| Missed scan | sheet #1–#7, system #1–#5 | create #6, #7 via `next_index()` (numbers follow on) |
| Extra scan, trailing & empty | sheet #1–#7, system #1–#9 empty | propose deleting #8, #9 (owner ticks) |
| Gap / non-trailing extra | sheet skips #4 | flag only; never auto-delete |
| Row already has content | #3 filled, differs | show old vs new, owner picks |

If missing rows are not contiguous with the existing ones (e.g. the system has #1–#3 and the sheet
has #1–#3 and #6), flag it rather than create mismatched numbers.

**Reconciliation.** Run the same logic as `checklist_check()` on the *draft* (pallet state as it
would be after apply) and show each slot as ok / mismatch with expected vs actual. A mismatch is
red but does not block confirm; the owner may know better.

## Multiple photos per pallet (merge)

A pallet may get a second photo (second page, or a clearer re-shoot). Each photo is its own
`ChecklistScan`; both are kept. A new scan's draft is built against the pallet's **current**
state (including earlier confirmed scans): new `#n` → added; same `#n` and same content → skip;
same `#n`, different content → old vs new for the owner; new MPNs → added; same MPN, different
board count → owner picks. Reconciliation always covers the whole pallet.

## Storage: `ChecklistScan` (new model, `product` app)

| Field | Purpose |
|---|---|
| `so` FK, `pallet` FK (nullable until identified) | ownership |
| `image` (`upload_to='checklist_scans/%Y/%m/'`) | the photo, kept permanently |
| `status` | `processing` / `ready` / `failed` / `confirmed` / `discarded` |
| `transcription` JSON | the model's raw reading |
| `draft` JSON | server-built draft shown for review |
| `confirmed` JSON | what the owner confirmed (diff vs draft = corrections) |
| `error` text | failure reason |
| `model`, token usage, cost | for cost tracking |
| `uploaded_by`, `created_at`, `confirmed_at` | audit |

Pallets tab: each pallet row shows a small icon when it has scans; it opens the scans (photo +
status) for that pallet.

## Getting smarter: `ChecklistCorrection` (new model)

On confirm, every field the owner changed from the draft becomes a row:
`kind` (mpn_name / chip_model / capacity_class / brand_abbrev), `raw_text` as read, `resolved`
value, `count`, `last_seen`. Used two ways:

1. **Before the call**: the dictionary goes into the prompt ("`S2km8` has meant SLKM8").
2. **After the call**: server matching checks the dictionary before fuzzy matching.

Plus few-shot: the prompt includes 2–3 recent confirmed scans (transcription → confirmed) as
examples. Capacity classes confirmed by the owner are stored here too
(`kind=capacity_class`), so a new memory part is asked about only once.

## API (sketch, builder may refine)

- `POST sos/<id>/checklist-scans/` multipart, several `images` → created scans
- `GET  sos/<id>/checklist-scans/` → list with status (frontend polls while `processing`)
- `GET  checklist-scans/<id>/` → scan + draft
- `POST checklist-scans/<id>/confirm/` body = owner-edited draft → applies in one transaction,
  re-validating everything server-side (chip_allowed, barcode allocation, no overwrite without
  explicit choice)
- `POST checklist-scans/<id>/discard/`, `POST checklist-scans/<id>/retry/`

JWT-authenticated like other `/product/` endpoints; restricted to admin/manager roles.

## Constraints

- Django 5.1 / DRF backend, Next.js 14 frontend; follow existing API conventions in CLAUDE.md.
- **iPhone**: the upload button and review screen must work well at phone width (camera/photo
  picker via `<input type=file accept="image/*" multiple>`; review stacked vertically, large tap
  targets). Desktop: photo and draft side by side.
- No Celery/queue exists today. Background processing must not block a gunicorn worker for the
  length of a model call, and must survive gracefully if the process restarts (a scan stuck in
  `processing` can be retried).
- **Secrets**: `ANTHROPIC_API_KEY` lives in `backend/server/.env` on the server. Use a dedicated
  Anthropic workspace/key with a **monthly spend limit**, given the 2026-08 compromise
  (`docs/SECURITY.md`).
- `frontend/app/lib/api.ts` and `frontend/app/(main)/sos/[id]/page.tsx` contain local-only MSFT
  code under git skip-worktree. Edits there must be staged as stripped copies; see project memory
  and `docs/MSFT_LOCAL.md`.
- Photos are ~0.5–0.7 MB; downscaling before sending to the model is fine; keep the original on disk.
- Backend tests in `backend/server/product/tests.py` (`python manage.py test product`); the model
  call must be mockable so tests do not hit the API.

## Left to the builder

- Background execution mechanism (thread, management-command worker, etc.) within the
  constraint above.
- Exact JSON schemas, prompt wording, normalisation and fuzzy-match thresholds.
- Review-screen component structure and visual details.
- Whether the confirm endpoint reuses existing view helpers (`_create_checklists`,
  `_clean_checklist_rows`) or factors shared services out of them.

## Evaluation

The four samples plus their correct answers (in this document) are the first eval set. Before
the owner relies on it, the builder runs all four through the pipeline and reports per-field
accuracy and the measured cost per photo. Every confirmed scan later becomes another eval case.

## Owner decisions (2026-11-13)

1. **Rename the memory slot group.** A one-time data migration renames every
   `Chip.slot_group = "Memory"` to `"1G"`; 2G parts go in `"2G"`. Chips with a blank
   `slot_group` are left as they are (builder's call: not part of the rename). The frontend default
   that pre-fills `slot_group='Memory'` when `item_group='Memory'`
   (`frontend/app/lib/chipSlots.ts:42`) must stop suggesting `Memory`; tests that use `'Memory'`
   are updated to capacity names.
2. **Adding chips to a shared MPN is allowed, but each addition is opt-in.** MPNs (and their
   chips) are shared by every SO, so a new chip changes `checklist_check()` and cost splits on
   other pallets too. The review screen lists every planned chip addition separately as
   "add <part> to MPN <name> (affects all orders)"; only the ones the owner ticks are applied.
   Chips for an MPN created by this same scan are part of creating it and are ticked by default.
3. **Label weight is compared, never written.** If the label weight differs from the pallet's
   stored weight, show yellow. No weight field is changed.
4. **A PalletMPN already on the pallet but missing from the sheet is flagged yellow, never
   removed.**

## Production facts found during review (2026-11-13, read-only query)

- **Memory chips today carry `slot_group = "Memory"`** (52 chips), not a capacity name; 8 more
  have `item_group=Memory` but blank `slot_group`. Every memory part currently on these MPNs is
  1G (K4B1G1646G-BCH9, D9SFT, D9MNQ, NT5TU64M16HG); no 2G part exists yet. See decision 1.
- **Most sample MPNs already exist**, under names that differ from the handwriting:
  `SP#841631-001`, `SP#789124-001`, `x898568`, `1A4262W00-600-G` (sheet: "1A42b2W00-600-G"),
  `B600GH0` (cl2 "BG00GH0"), `B696401852188010` / `B696402852261010` (cl3's long numbers).
  MPN matching must therefore ignore a `SP#` prefix and case, and fall back to near-matches
  shown to the owner, before planning a new MPN.
- Some stored `chip_mpn` values carry handwriting typos, e.g. `EP4CE1SF23C9LN` for
  EP4CE15F23C9LN, and `NT5TU64M16HG` without the `-AC` suffix. Part matching must use the
  existing I/1, S/5-tolerant normalisation and prefix matching, and must not create a duplicate
  chip for a near-identical part number.
- `chips/catalog/` does not return `slot_group` today; add it for the prompt dictionary.

## Appendix: sample readings (expected answers, owner to confirm the `?` items)

All SO S06-000979, vendor MSFT. Every sample reconciles per slot.

**cl1**: pallet `06LP00085063-3`, 731 LB
- Header: `X898568` (212) {SLKM8, 1G}
- Lines: #1 SLKM8 212 · #2 K4B1G1646G-BCH9 212

**cl2**: pallet `06LP00083239-9`, 575 LB
- Header: `841631-001` (147) {SLKM8, 1G, AL} · `789124-001` (12) {SLKM8, 1G, AL} ·
  `1A42B2W00-600-G`? (31) {ASPEED AST2400, 2G, SLKM8} · `BG00GH0`? (1) {SLKM8, 1G}
- Lines: #1 SLKM8 191 · #2 ALTERA EP4CE15F23C9LN 159 · #3 D9MNQ 16 · #4 D9SFT 143 ·
  #5 NT5TU64M16HG-AC 1 · #6 K4B2G1646Q-BCK0 31 · #7 ASPEED AST2400 31 (right-hand column)

**cl3**: pallet `06LP00086194-5`, 984 LB
- Header: `X898568` (205) {SLKM8, 1G} · `841631`(-001?) (90) {SLKM8, 1G, AL} ·
  `B69640185226010`? (1) {SLKM8, 1G} · `B69640185218840`? (1) {SLKM8, 1G}
- Lines: #1 SLKM8 297 · #2 D9SFT 95 · #3 K4B1G1646G-BCH9 202 · #4 ALTERA EP4CE15F23C9LN 90

**cl4**: pallet `06LP00084995-13`, 1060 LB
- Header: `X898568` (276) {SLKM8, 1G} · `B600GH0`? (40) {SLKM8, 1G} (same MPN as cl2's `BG00GH0`?)
- Lines: #1 SLKM8 316 · #2 K4B1G1646G-BCH9 274 · #3 NT5TU64M16HG-AC 41 ·
  #4 D9MNQ 1 (written like "D7MNQ")
