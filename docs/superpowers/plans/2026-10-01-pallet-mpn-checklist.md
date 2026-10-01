# Pallet ↔ MPN Assignment & Checklist Chip Dropdown — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users assign MPNs (with a board count) to each pallet of an MSFT order, pick checklist chips from those MPNs, and retire barcode-scanned `Board` records entirely.

**Architecture:** A new `PalletMPN` table (pallet × MPN, unique, with `board_qty`) becomes the single source of board counts: `Pallet.effective_board_qty` sums it (falling back to the legacy hand-typed `Pallet.board_qty` when a pallet has no rows), and SO / MPN / report / export counts derive from it. `Checklist` gains a nullable `chip` FK validated against the pallet's MPNs; the server copies the chip's brand / part number into the existing `brand` / `model` text columns so every existing reader keeps working. `Board` is backfilled into `PalletMPN` and then dropped.

**Tech Stack:** Django 5.1 + DRF (Postgres), Next.js 14 App Router (TypeScript, inline styles), ExcelJS.

**Spec:** `docs/superpowers/specs/2026-10-01-pallet-mpn-checklist-design.md`

## Global Constraints

- Scope is MSFT Order (`/sos/`) only. `ChecklistCard` is shared with `/sales-orders/`; there it must keep its free-text Brand/Model inputs (`chipMode` prop false).
- Scanner endpoints for pallet / box / checklist (`scanner/pallets/...`) do not change behaviour. `scanner/boards/<pk>/photo/` and the `board_inbound` action are removed.
- Error conventions: validation → HTTP 400 + `serializer.errors` or `{ "error": "..." }`; missing → 404; delete success → 204 empty body.
- `Pallet.effective_board_qty` is the only place that computes a pallet's board count. Nothing else sums `PalletMPN.board_qty` per pallet.
- `PalletMPN.board_qty` blank counts as 0 in every sum. A pallet with MPN rows whose qty are all blank shows 0.
- A pallet with **no** MPN rows shows its legacy `board_qty` and `board_qty_is_legacy: true`.
- Deleting a `PalletMPN` used by any checklist line on that pallet → 400 `{ "error": "Used by N checklist line(s)" }`. Deleting a `Chip` referenced by a checklist → 400.
- Export "Date processed" = `PalletMPN.created_at`.
- UI copy is English, matching the rest of the app.
- Backend tests: `cd backend/server && venv/Scripts/python.exe manage.py test product --noinput` (Windows venv; uses the local Postgres test DB). Baseline: 60 tests, OK.
- Frontend checks: `cd frontend && npm run lint && npm run build`.

## Review Focus

1. **Duplicate MPN in one Add request** (same MPN twice in `items`) — expect 400 and nothing written. Test in Task 3.
2. **Negative / non-numeric board qty** — expect 400 from the API; the UI refuses before sending. Test in Task 3.
3. **Checklist chip from an MPN on a *different* pallet of the same SO** — expect 400. Test in Task 4.
4. **Sales Orders checklist edit** (text Brand/Model, no chip) — must still save the typed text. Test in Task 4.
5. **Backfill grouping under `Board`'s default `-scanned_at` ordering** — many boards of one (pallet, MPN) must collapse to ONE row with the summed qty, not one row per board. Test in Task 1.

---

## File Structure

| File | Responsibility |
|---|---|
| `backend/server/product/models.py` | `PalletMPN` model; `Pallet.effective_board_qty` / `board_qty_is_legacy`; `SO.total_board_count`; `MPN.board_total()` / `latest_board_added()`; `Checklist.chip`, `chip_allowed()`, `text_from_chip()`; remove `Board` |
| `backend/server/product/pallet_mpn_backfill.py` (new) | Pure function `backfill_pallet_mpns(Board, PalletMPN)` used by the migration |
| `backend/server/product/migrations/0047_pallet_mpn.py` (new) | Create `pallet_mpn`, add `checklist.chip`, run backfill |
| `backend/server/product/migrations/0048_delete_board.py` (new) | Drop `board` |
| `backend/server/product/serializer.py` | `PalletMPNSerializer`, `PalletMPNExportSerializer`; Pallet/SO/MPN/Checklist serializer changes; remove Board serializers |
| `backend/server/product/views.py` | PalletMPN CRUD, chip-options, SO pallet-mpns; checklist chip handling; chip-delete guard; remove Board views |
| `backend/server/product/urls.py` | Routes |
| `backend/server/product/management/commands/send_mpn_report.py` | Counts from `MPN.board_total()` |
| `backend/server/product/tests.py` | New test classes |
| `frontend/interface/IDatatable.ts` | `PalletMPN`, `ChipOptionGroup`, `PalletMpnExportRow`; `Pallet` / `Checklist` fields; remove `Board` |
| `frontend/app/lib/api.ts` | `api.pallets.mpns`, `api.pallets.chipOptions`, `api.sos.palletMpns`; remove `api.boards` / `api.chips` |
| `frontend/app/ui/pallet/PalletBoardsTab.tsx` (new) | The new Boards tab |
| `frontend/app/ui/pallet/ChecklistCard.tsx` | Chip dropdown when `chipMode` |
| `frontend/app/ui/pallet/ChecklistView.tsx` | Pass `chipMode` / `boardsHref` |
| `frontend/app/(main)/sos/[id]/page.tsx` | Tabs, wiring, remove scan-board code, pallet form/table changes, export source |
| `frontend/app/(main)/sos/page.tsx` | Collapse two board columns into one |
| `frontend/app/(main)/mpns/[id]/page.tsx`, `frontend/app/(main)/sos/[id]/mpns/[mpnId]/page.tsx` | Label "Boards (Scanned)" → "Boards" |
| `frontend/app/(main)/sos/[id]/boards/` | Delete |
| `CLAUDE.md` | Data-model + deploy notes |

---

### Task 1: `PalletMPN` model, `Checklist.chip`, backfill migration

**Files:**
- Create: `backend/server/product/pallet_mpn_backfill.py`
- Create: `backend/server/product/migrations/0047_pallet_mpn.py` (generated, then edited)
- Modify: `backend/server/product/models.py` (Pallet ~L91-127, Checklist ~L177-221, append PalletMPN after `MPN`)
- Test: `backend/server/product/tests.py`

**Interfaces:**
- Produces: `PalletMPN(pallet, mpn, board_qty, created_at)`, `related_name='pallet_mpns'` on both Pallet and MPN; `PalletMPN.checklist_use_count() -> int`; `Pallet.effective_board_qty -> int | None`; `Pallet.board_qty_is_legacy -> bool`; `Checklist.chip` (FK Chip, `related_name='checklists'`); `Checklist.chip_allowed(pallet, chip) -> bool`; `Checklist.text_from_chip(chip) -> tuple[str, str]`; `backfill_pallet_mpns(Board, PalletMPN) -> tuple[int, int]` (created, skipped).

- [ ] **Step 1: Write the failing tests**

Append to `backend/server/product/tests.py` (and extend the import line at the top to `from product.models import Vendor, SO, Pallet, Box, Checklist, MPN, Chip, ChipBrand, PalletMPN, Board`):

```python
def make_so_with_pallets(n=2, so_number='S05-000617'):
    vendor, _ = Vendor.objects.get_or_create(name='MSFT')
    so = SO.objects.create(so_number=so_number, vendor=vendor, inbound_date=date(2026, 9, 28))
    pallets = [
        Pallet.objects.create(so=so, pallet_seq=i + 1, licence_number=f'LP{i + 1}', qty=1)
        for i in range(n)
    ]
    return so, pallets


class EffectiveBoardQtyTests(TestCase):
    def test_sum_of_mpn_rows(self):
        _, (p, _) = make_so_with_pallets()
        PalletMPN.objects.create(pallet=p, mpn=MPN.objects.create(name='A'), board_qty=20)
        PalletMPN.objects.create(pallet=p, mpn=MPN.objects.create(name='B'), board_qty=15)
        self.assertEqual(p.effective_board_qty, 35)
        self.assertFalse(p.board_qty_is_legacy)

    def test_mpn_rows_override_legacy_value(self):
        _, (p, _) = make_so_with_pallets()
        p.board_qty = 40
        p.save()
        PalletMPN.objects.create(pallet=p, mpn=MPN.objects.create(name='A'), board_qty=35)
        self.assertEqual(p.effective_board_qty, 35)
        self.assertFalse(p.board_qty_is_legacy)

    def test_blank_qty_rows_count_as_zero(self):
        _, (p, _) = make_so_with_pallets()
        p.board_qty = 40
        p.save()
        PalletMPN.objects.create(pallet=p, mpn=MPN.objects.create(name='A'), board_qty=None)
        self.assertEqual(p.effective_board_qty, 0)

    def test_no_rows_falls_back_to_legacy(self):
        _, (p, _) = make_so_with_pallets()
        p.board_qty = 40
        p.save()
        self.assertEqual(p.effective_board_qty, 40)
        self.assertTrue(p.board_qty_is_legacy)

    def test_no_rows_no_legacy_is_none_and_not_flagged(self):
        _, (p, _) = make_so_with_pallets()
        self.assertIsNone(p.effective_board_qty)
        self.assertFalse(p.board_qty_is_legacy)

    def test_same_mpn_on_two_pallets_kept_separate(self):
        _, (p1, p2) = make_so_with_pallets()
        m = MPN.objects.create(name='DCS-7060CX-32S')
        PalletMPN.objects.create(pallet=p1, mpn=m, board_qty=20)
        PalletMPN.objects.create(pallet=p2, mpn=m, board_qty=18)
        self.assertEqual(p1.effective_board_qty, 20)
        self.assertEqual(p2.effective_board_qty, 18)

    def test_pallet_mpn_unique(self):
        from django.db import IntegrityError
        _, (p, _) = make_so_with_pallets()
        m = MPN.objects.create(name='A')
        PalletMPN.objects.create(pallet=p, mpn=m)
        with self.assertRaises(IntegrityError):
            PalletMPN.objects.create(pallet=p, mpn=m)


class ChecklistChipRuleTests(TestCase):
    def test_chip_allowed_only_when_its_mpn_is_on_the_pallet(self):
        _, (p1, p2) = make_so_with_pallets()
        m = MPN.objects.create(name='A')
        chip = Chip.objects.create(mpn=m, chip_mpn='BCM56960B1KFSBG')
        PalletMPN.objects.create(pallet=p1, mpn=m)
        self.assertTrue(Checklist.chip_allowed(p1, chip))
        self.assertFalse(Checklist.chip_allowed(p2, chip))

    def test_text_from_chip(self):
        brand = ChipBrand.objects.create(name='Broadcom')
        chip = Chip.objects.create(mpn=MPN.objects.create(name='A'), brand=brand, chip_mpn='BCM56960B1KFSBG')
        self.assertEqual(Checklist.text_from_chip(chip), ('Broadcom', 'BCM56960B1KFSBG'))

    def test_text_from_chip_without_brand(self):
        chip = Chip.objects.create(mpn=MPN.objects.create(name='A'), chip_mpn='X1')
        self.assertEqual(Checklist.text_from_chip(chip), ('', 'X1'))

    def test_checklist_use_count(self):
        _, (p, _) = make_so_with_pallets()
        m = MPN.objects.create(name='A')
        chip = Chip.objects.create(mpn=m, chip_mpn='X1')
        row = PalletMPN.objects.create(pallet=p, mpn=m)
        Checklist.objects.create(pallet=p, barcode='b-1', chip=chip)
        Checklist.objects.create(pallet=p, barcode='b-2', chip=chip)
        Checklist.objects.create(pallet=p, barcode='b-3')
        self.assertEqual(row.checklist_use_count(), 2)


class BackfillTests(TestCase):
    """Removed in Task 5 together with the Board model."""

    def test_groups_by_pallet_and_mpn(self):
        from product.pallet_mpn_backfill import backfill_pallet_mpns
        so, (p1, p2) = make_so_with_pallets()
        m = MPN.objects.create(name='DCS-7060CX-32S')
        for i in range(3):
            Board.objects.create(so=so, pallet=p1, mpn=m, barcode=f'a{i}', qty=1)
        Board.objects.create(so=so, pallet=p2, mpn=m, barcode='b0', qty=2)
        Board.objects.create(so=so, pallet=None, mpn=m, barcode='orphan')
        Board.objects.create(so=so, pallet=p1, mpn=None, barcode='nompn')

        created, skipped = backfill_pallet_mpns(Board, PalletMPN)

        self.assertEqual((created, skipped), (2, 2))
        self.assertEqual(PalletMPN.objects.get(pallet=p1, mpn=m).board_qty, 3)
        self.assertEqual(PalletMPN.objects.get(pallet=p2, mpn=m).board_qty, 2)

    def test_is_idempotent(self):
        from product.pallet_mpn_backfill import backfill_pallet_mpns
        so, (p1, _) = make_so_with_pallets()
        m = MPN.objects.create(name='A')
        Board.objects.create(so=so, pallet=p1, mpn=m, barcode='a')
        backfill_pallet_mpns(Board, PalletMPN)
        created, _ = backfill_pallet_mpns(Board, PalletMPN)
        self.assertEqual(created, 0)
        self.assertEqual(PalletMPN.objects.count(), 1)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend/server && venv/Scripts/python.exe manage.py test product --noinput`
Expected: ImportError — `cannot import name 'PalletMPN'`.

- [ ] **Step 3: Add the model code**

In `models.py`, inside `class Pallet`, after `compose_barcode`:

```python
    @property
    def effective_board_qty(self):
        """The pallet's board count — the ONE place it is computed.

        With any MPN rows: the sum of their board_qty (blank counts as 0).
        Without: the legacy hand-typed board_qty from before boards were assigned per MPN.
        Iterates .all() so a prefetch of 'pallet_mpns' is reused instead of re-queried.
        """
        rows = list(self.pallet_mpns.all())
        if rows:
            return sum(r.board_qty or 0 for r in rows)
        return self.board_qty

    @property
    def board_qty_is_legacy(self):
        """True when the number shown is the old hand-typed value, not an MPN sum."""
        return self.board_qty is not None and not list(self.pallet_mpns.all())
```

In `class Checklist`, add the field after `qty` and two static methods after `next_index`:

```python
    chip = models.ForeignKey(
        'Chip', on_delete=models.PROTECT, null=True, blank=True, related_name='checklists',
        help_text="The chip this line counts. brand/model are copied from it on save; rows "
                  "from before chips were selectable keep free text and a null chip."
    )
```

```python
    @staticmethod
    def chip_allowed(pallet, chip):
        """A line may only name a chip from a board (MPN) assigned to its own pallet."""
        return chip.mpn_id is not None and pallet.pallet_mpns.filter(mpn_id=chip.mpn_id).exists()

    @staticmethod
    def text_from_chip(chip):
        """(brand, model) text written into the row, so label printing, search and exports
        that read the text columns keep working unchanged."""
        return (chip.brand.name if chip.brand_id else ''), (chip.chip_mpn or '')
```

Append after `class MPN` (before `class Board`):

```python
class PalletMPN(models.Model):
    """Which board types (MPNs) sit on a pallet, and how many of each.

    Replaces barcode-scanned Board rows. One row per (pallet, MPN), so the same MPN on
    several pallets keeps a separate count per pallet. Its board_qty values are what
    Pallet.effective_board_qty sums.
    """
    pallet = models.ForeignKey(Pallet, on_delete=models.CASCADE, related_name='pallet_mpns')
    mpn = models.ForeignKey(MPN, on_delete=models.PROTECT, related_name='pallet_mpns')
    board_qty = models.IntegerField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'pallet_mpn'
        unique_together = [('pallet', 'mpn')]
        ordering = ['pallet', 'mpn__name']

    def __str__(self):
        return f"{self.pallet} · {self.mpn} ×{self.board_qty}"

    def checklist_use_count(self):
        """Checklist lines on this pallet that name a chip of this MPN."""
        return Checklist.objects.filter(pallet_id=self.pallet_id, chip__mpn_id=self.mpn_id).count()
```

- [ ] **Step 4: Write the backfill function**

Create `backend/server/product/pallet_mpn_backfill.py`:

```python
"""One-off conversion of scanned Board rows into PalletMPN rows (migration 0047).

Takes the model classes as arguments so the migration can pass its historical models.
"""
from django.db.models import Min, Q, Sum


def backfill_pallet_mpns(Board, PalletMPN):
    """Collapse Board rows into one PalletMPN per (pallet, mpn).

    board_qty = Sum(qty) of the group, created_at = earliest scan. Boards missing a
    pallet or an MPN cannot be placed and are skipped. Existing PalletMPN rows are
    left alone, so running twice creates nothing new.

    Returns (created, skipped).
    """
    skipped = Board.objects.filter(Q(pallet__isnull=True) | Q(mpn__isnull=True)).count()
    groups = (
        Board.objects
        .filter(pallet__isnull=False, mpn__isnull=False)
        # Clear Board's default '-scanned_at' ordering: left in, it joins the GROUP BY
        # and yields one group per board instead of one per (pallet, mpn).
        .order_by()
        .values('pallet_id', 'mpn_id')
        .annotate(total=Sum('qty'), first=Min('scanned_at'))
    )
    created = 0
    for g in groups:
        _, made = PalletMPN.objects.get_or_create(
            pallet_id=g['pallet_id'], mpn_id=g['mpn_id'],
            defaults={'board_qty': g['total'], 'created_at': g['first']},
        )
        created += int(made)
    return created, skipped
```

- [ ] **Step 5: Generate and edit the migration**

Run: `cd backend/server && venv/Scripts/python.exe manage.py makemigrations product --name pallet_mpn`
Expected: creates `product/migrations/0047_pallet_mpn.py` with `CreateModel(PalletMPN)` and `AddField(checklist.chip)`.

Edit that file: add at module level

```python
def backfill(apps, schema_editor):
    from product.pallet_mpn_backfill import backfill_pallet_mpns
    created, skipped = backfill_pallet_mpns(
        apps.get_model('product', 'Board'), apps.get_model('product', 'PalletMPN'),
    )
    print(f'\n  pallet_mpn backfill: {created} rows created, '
          f'{skipped} boards skipped (no pallet or no MPN)')
```

and append to `operations`:

```python
        migrations.RunPython(backfill, migrations.RunPython.noop),
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend/server && venv/Scripts/python.exe manage.py test product --noinput`
Expected: all pass (60 old + 13 new).

- [ ] **Step 7: Commit**

```bash
git add backend/server/product/models.py backend/server/product/pallet_mpn_backfill.py backend/server/product/migrations/0047_pallet_mpn.py backend/server/product/tests.py
git commit -m "feat(product): PalletMPN model, Checklist.chip, Board backfill migration"
```

---

### Task 2: Board counts from `PalletMPN` (SO, Pallet, MPN serializers, MPN report)

**Files:**
- Modify: `backend/server/product/models.py` (SO `total_board_count` / `total_board_qty` ~L62-69; MPN methods)
- Modify: `backend/server/product/serializer.py` (`PalletSerializer`, `MPNSerializer`)
- Modify: `backend/server/product/views.py` (`so_list`, `so_detail`, `pallet_list` prefetch; `mpn_detail` delete message)
- Modify: `backend/server/product/management/commands/send_mpn_report.py` (~L137-144)
- Test: `backend/server/product/tests.py`

**Interfaces:**
- Consumes: `Pallet.effective_board_qty`, `Pallet.board_qty_is_legacy`, `PalletMPN` (Task 1).
- Produces: `SO.total_board_count -> int` (== `SO.total_board_qty`); `MPN.board_total(so_id=None) -> int`; `MPN.latest_board_added(so_id=None) -> datetime | None`; Pallet API fields `board_qty` (read-only, effective) + `board_qty_is_legacy`; `board_count` removed from the Pallet API.

- [ ] **Step 1: Write the failing tests**

```python
class BoardCountApiTests(TestCase):
    def setUp(self):
        from rest_framework.test import APIClient
        self.client = APIClient()
        self.client.force_authenticate(user=get_user_model().objects.create_user(username='u', password='p'))
        self.so, (self.p1, self.p2) = make_so_with_pallets()
        self.m = MPN.objects.create(name='DCS-7060CX-32S')
        PalletMPN.objects.create(pallet=self.p1, mpn=self.m, board_qty=20)
        PalletMPN.objects.create(pallet=self.p2, mpn=self.m, board_qty=18)

    def test_so_total_sums_every_pallet(self):
        self.assertEqual(self.so.total_board_count, 38)
        self.assertEqual(self.so.total_board_qty, 38)

    def test_so_total_includes_legacy_pallet(self):
        _, (p3,) = make_so_with_pallets(1, so_number='OTHER')
        p3.so = self.so
        p3.pallet_seq = 3
        p3.board_qty = 7
        p3.save()
        self.assertEqual(self.so.total_board_count, 45)

    def test_so_detail_pallet_fields(self):
        data = self.client.get(f'/product/sos/{self.so.id}/').json()
        self.assertEqual(data['total_board_count'], 38)
        p = next(x for x in data['pallets'] if x['id'] == self.p1.id)
        self.assertEqual(p['board_qty'], 20)
        self.assertFalse(p['board_qty_is_legacy'])
        self.assertNotIn('board_count', p)

    def test_pallet_board_qty_is_read_only(self):
        self.client.put(f'/product/sos/{self.so.id}/pallets/{self.p1.id}/', {'board_qty': 99}, format='json')
        self.p1.refresh_from_db()
        self.assertIsNone(self.p1.board_qty)

    def test_mpn_board_count_across_pallets_and_sos(self):
        _, (other,) = make_so_with_pallets(1, so_number='S05-OTHER')
        PalletMPN.objects.create(pallet=other, mpn=self.m, board_qty=5)
        self.assertEqual(self.m.board_total(), 43)
        self.assertEqual(self.m.board_total(so_id=self.so.id), 38)
        row = self.client.get('/product/mpns/', {'so': self.so.id}).json()[0]
        self.assertEqual(row['board_count'], 43)
        self.assertEqual(row['so_board_count'], 38)
        self.assertIsNotNone(row['latest_board_date'])

    def test_mpn_delete_blocked_while_on_a_pallet(self):
        resp = self.client.delete(f'/product/mpns/{self.m.id}/')
        self.assertEqual(resp.status_code, 400)
        self.assertIn('2 pallet', resp.json()['error'])
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `venv/Scripts/python.exe manage.py test product.tests.BoardCountApiTests --noinput`
Expected: FAIL (`total_board_count` returns Board count 0; `board_total` missing).

- [ ] **Step 3: Implement**

`models.py`, replace SO's two properties:

```python
    @property
    def total_board_count(self):
        """Sum of every pallet's effective_board_qty (legacy pallets included).
        Iterates .all() so a 'pallets__pallet_mpns' prefetch is reused."""
        return sum(p.effective_board_qty or 0 for p in self.pallets.all())

    @property
    def total_board_qty(self):
        """Same number as total_board_count — kept so existing API readers don't break."""
        return self.total_board_count
```

`models.py`, add to `class MPN`:

```python
    def board_total(self, so_id=None):
        """Boards of this MPN across every pallet (optionally one SO). Blank qty = 0."""
        qs = self.pallet_mpns.all()
        if so_id:
            qs = qs.filter(pallet__so_id=so_id)
        return qs.aggregate(t=Sum('board_qty'))['t'] or 0

    def latest_board_added(self, so_id=None):
        """When this MPN was last added to a pallet (optionally within one SO)."""
        from django.db.models import Max
        qs = self.pallet_mpns.all()
        if so_id:
            qs = qs.filter(pallet__so_id=so_id)
        return qs.aggregate(t=Max('created_at'))['t']
```

`serializer.py`, `PalletSerializer`: replace `board_count = serializers.SerializerMethodField(read_only=True)` with

```python
    board_qty = serializers.SerializerMethodField(read_only=True)
    board_qty_is_legacy = serializers.SerializerMethodField(read_only=True)
```

in `Meta.fields` replace `'board_qty', 'board_count'` with `'board_qty', 'board_qty_is_legacy'`, and replace `get_board_count` with

```python
    def get_board_qty(self, obj):
        return obj.effective_board_qty

    def get_board_qty_is_legacy(self, obj):
        return obj.board_qty_is_legacy
```

`serializer.py`, `MPNSerializer`: replace the four count/date getters with

```python
    def get_board_count(self, obj):
        return obj.board_total()

    def get_so_board_count(self, obj):
        """Boards of this MPN within ONE SO — only under ?so=<id>, else None."""
        so_id = self.context.get('so_id')
        if not so_id:
            return None
        return obj.board_total(so_id=so_id)

    def get_latest_board_date(self, obj):
        d = obj.latest_board_added()
        return d.strftime('%Y-%m-%d') if d else None

    def get_so_latest_board_date(self, obj):
        so_id = self.context.get('so_id')
        if not so_id:
            return None
        d = obj.latest_board_added(so_id=so_id)
        return d.strftime('%Y-%m-%d') if d else None
```

`views.py`:
- `so_list` GET: `qs = SO.objects.select_related('vendor').prefetch_related('pallets__pallet_mpns').all()`
- `so_detail`: `.prefetch_related('pallets__boards', 'photos')` → `.prefetch_related('pallets__pallet_mpns', 'pallets__photos', 'photos')`
- `pallet_list` GET: `PalletSerializer(so.pallets.prefetch_related('pallet_mpns', 'photos'), many=True)`
- `mpn_detail` delete branch:

```python
    except ProtectedError:
        n = mpn.pallet_mpns.count()
        msg = (f'Cannot delete: this MPN is assigned to {n} pallet(s). Remove it from those pallets first.'
               if n else 'Cannot delete: checklist lines still reference chips of this MPN.')
        return Response({'error': msg}, status=status.HTTP_400_BAD_REQUEST)
```

`send_mpn_report.py` (~L137-144):

```python
        mpns = MPN.objects.prefetch_related('chips__brand').order_by('name')

        for mpn in mpns:
            chips = list(mpn.chips.all())
            board_count = mpn.board_total()

            latest_result = mpn.latest_board_added()
            latest_date = latest_result.strftime('%Y-%m-%d') if latest_result else ''
```

Remove `Max` from that file's imports if now unused.

- [ ] **Step 4: Run all tests**

Run: `venv/Scripts/python.exe manage.py test product --noinput`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add backend/server/product
git commit -m "feat(product): derive SO/pallet/MPN board counts from PalletMPN"
```

---

### Task 3: PalletMPN API, chip options, SO pallet-mpns

**Files:**
- Modify: `backend/server/product/serializer.py` (append)
- Modify: `backend/server/product/views.py` (new section after the Checklist section)
- Modify: `backend/server/product/urls.py`
- Test: `backend/server/product/tests.py`

**Interfaces:**
- Consumes: `PalletMPN`, `PalletMPN.checklist_use_count()`.
- Produces (all under `/product/`, JWT):
  - `GET  pallets/<pallet_pk>/mpns/` → `PalletMPN[]` = `{id, pallet, mpn, mpn_name, part_type, chips_per_board, board_qty, checklist_use_count, created_at}`
  - `POST pallets/<pallet_pk>/mpns/` body `{items: [{mpn, board_qty}]}` → 201 `PalletMPN[]`
  - `PUT|PATCH pallets/<pallet_pk>/mpns/<pk>/` body `{board_qty}` → `PalletMPN`
  - `DELETE pallets/<pallet_pk>/mpns/<pk>/` → 204 | 400
  - `GET  pallets/<pallet_pk>/chip-options/` → `[{mpn_id, mpn_name, chips: [{id, brand_name, chip_mpn, slot_group}]}]`
  - `GET  sos/<so_pk>/pallet-mpns/` → `[{id, pallet, board_qty, created_at, mpn: {id, name, part_type, cutboard_cost, chips_per_board, created_at}, chips: Chip[]}]`

- [ ] **Step 1: Write the failing tests**

```python
class PalletMpnApiTests(TestCase):
    def setUp(self):
        from rest_framework.test import APIClient
        self.client = APIClient()
        self.client.force_authenticate(user=get_user_model().objects.create_user(username='u', password='p'))
        self.so, (self.p1, self.p2) = make_so_with_pallets()
        self.a = MPN.objects.create(name='DCS-7060CX-32S')
        self.b = MPN.objects.create(name='MPN2')
        self.url = f'/product/pallets/{self.p1.id}/mpns/'

    def test_add_several(self):
        resp = self.client.post(self.url, {'items': [{'mpn': self.a.id, 'board_qty': 20},
                                                     {'mpn': self.b.id, 'board_qty': None}]}, format='json')
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(len(resp.json()), 2)
        self.assertEqual(self.p1.effective_board_qty, 20)

    def test_list_fields(self):
        PalletMPN.objects.create(pallet=self.p1, mpn=self.a, board_qty=20)
        row = self.client.get(self.url).json()[0]
        for key in ('id', 'pallet', 'mpn', 'mpn_name', 'part_type', 'chips_per_board',
                    'board_qty', 'checklist_use_count', 'created_at'):
            self.assertIn(key, row)
        self.assertEqual(row['mpn_name'], 'DCS-7060CX-32S')

    def test_already_on_pallet_rejected(self):
        PalletMPN.objects.create(pallet=self.p1, mpn=self.a)
        resp = self.client.post(self.url, {'items': [{'mpn': self.a.id}]}, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_duplicate_within_batch_rejected_and_nothing_written(self):
        resp = self.client.post(self.url, {'items': [{'mpn': self.b.id}, {'mpn': self.a.id},
                                                     {'mpn': self.a.id}]}, format='json')
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(PalletMPN.objects.count(), 0)

    def test_negative_qty_rejected(self):
        resp = self.client.post(self.url, {'items': [{'mpn': self.a.id, 'board_qty': -1}]}, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_non_numeric_qty_rejected(self):
        resp = self.client.post(self.url, {'items': [{'mpn': self.a.id, 'board_qty': 'ten'}]}, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_unknown_mpn_rejected(self):
        resp = self.client.post(self.url, {'items': [{'mpn': 99999}]}, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_empty_items_rejected(self):
        self.assertEqual(self.client.post(self.url, {'items': []}, format='json').status_code, 400)

    def test_same_mpn_allowed_on_another_pallet(self):
        PalletMPN.objects.create(pallet=self.p2, mpn=self.a, board_qty=18)
        resp = self.client.post(self.url, {'items': [{'mpn': self.a.id, 'board_qty': 20}]}, format='json')
        self.assertEqual(resp.status_code, 201)

    def test_update_qty(self):
        row = PalletMPN.objects.create(pallet=self.p1, mpn=self.a, board_qty=20)
        resp = self.client.put(f'{self.url}{row.id}/', {'board_qty': 25}, format='json')
        self.assertEqual(resp.status_code, 200)
        row.refresh_from_db()
        self.assertEqual(row.board_qty, 25)
        self.assertEqual(row.mpn_id, self.a.id)

    def test_update_on_wrong_pallet_404(self):
        row = PalletMPN.objects.create(pallet=self.p1, mpn=self.a)
        resp = self.client.put(f'/product/pallets/{self.p2.id}/mpns/{row.id}/', {'board_qty': 1}, format='json')
        self.assertEqual(resp.status_code, 404)

    def test_delete_unused(self):
        row = PalletMPN.objects.create(pallet=self.p1, mpn=self.a)
        self.assertEqual(self.client.delete(f'{self.url}{row.id}/').status_code, 204)
        self.assertFalse(PalletMPN.objects.exists())

    def test_delete_blocked_when_checklist_uses_it(self):
        row = PalletMPN.objects.create(pallet=self.p1, mpn=self.a)
        chip = Chip.objects.create(mpn=self.a, chip_mpn='X1')
        Checklist.objects.create(pallet=self.p1, barcode='b-1', chip=chip)
        resp = self.client.delete(f'{self.url}{row.id}/')
        self.assertEqual(resp.status_code, 400)
        self.assertIn('1 checklist', resp.json()['error'])
        self.assertTrue(PalletMPN.objects.filter(pk=row.pk).exists())

    def test_chip_options_only_this_pallets_mpns(self):
        brand = ChipBrand.objects.create(name='Broadcom')
        Chip.objects.create(mpn=self.a, brand=brand, chip_mpn='BCM56960B1KFSBG')
        Chip.objects.create(mpn=self.b, chip_mpn='OTHER')
        PalletMPN.objects.create(pallet=self.p1, mpn=self.a)
        PalletMPN.objects.create(pallet=self.p2, mpn=self.b)
        data = self.client.get(f'/product/pallets/{self.p1.id}/chip-options/').json()
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]['mpn_name'], 'DCS-7060CX-32S')
        self.assertEqual(data[0]['chips'][0]['brand_name'], 'Broadcom')
        self.assertEqual(data[0]['chips'][0]['chip_mpn'], 'BCM56960B1KFSBG')

    def test_so_pallet_mpns(self):
        Chip.objects.create(mpn=self.a, chip_mpn='X1')
        PalletMPN.objects.create(pallet=self.p1, mpn=self.a, board_qty=20)
        PalletMPN.objects.create(pallet=self.p2, mpn=self.a, board_qty=18)
        data = self.client.get(f'/product/sos/{self.so.id}/pallet-mpns/').json()
        self.assertEqual(sorted(r['board_qty'] for r in data), [18, 20])
        self.assertEqual(data[0]['mpn']['name'], 'DCS-7060CX-32S')
        self.assertIn('cutboard_cost', data[0]['mpn'])
        self.assertEqual(data[0]['chips'][0]['chip_mpn'], 'X1')
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `venv/Scripts/python.exe manage.py test product.tests.PalletMpnApiTests --noinput`
Expected: FAIL with 404s.

- [ ] **Step 3: Serializers**

Add `PalletMPN` to the model import in `serializer.py`; add `'cutboard_cost'` to `MPNLiteSerializer.Meta.fields` (→ `['id', 'name', 'part_type', 'cutboard_cost', 'created_at', 'chips_per_board']`). Append:

```python
class PalletMPNSerializer(serializers.ModelSerializer):
    mpn_name = serializers.CharField(source='mpn.name', read_only=True)
    part_type = serializers.CharField(source='mpn.part_type', read_only=True)
    chips_per_board = serializers.IntegerField(source='mpn.chips_per_board', read_only=True)
    board_qty = serializers.IntegerField(allow_null=True, required=False, min_value=0)
    checklist_use_count = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = PalletMPN
        fields = ['id', 'pallet', 'mpn', 'mpn_name', 'part_type', 'chips_per_board',
                  'board_qty', 'checklist_use_count', 'created_at']
        read_only_fields = ['pallet', 'created_at']
        # (pallet, mpn) uniqueness is checked in the view: pallet is read-only here,
        # so DRF's auto UniqueTogetherValidator would demand it in the payload.
        validators = []

    def get_checklist_use_count(self, obj):
        return obj.checklist_use_count()


class PalletMPNExportSerializer(serializers.ModelSerializer):
    """One (pallet, MPN) row with the MPN's chip BOM, for the SO Excel export."""
    mpn = MPNLiteSerializer(read_only=True)
    chips = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = PalletMPN
        fields = ['id', 'pallet', 'board_qty', 'created_at', 'mpn', 'chips']

    def get_chips(self, obj):
        return ChipSerializer(obj.mpn.chips.all(), many=True, context=self.context).data
```

- [ ] **Step 4: Views**

Add `PalletMPN` to the views model import and `PalletMPNSerializer, PalletMPNExportSerializer` to the serializer import. Add after `checklist_search`:

```python
# ─────────────────────────────────────────────────── Pallet MPNs (boards on a pallet)
@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def pallet_mpn_list(request, pallet_pk):
    pallet = get_object_or_404(Pallet, pk=pallet_pk)
    if request.method == 'GET':
        qs = pallet.pallet_mpns.select_related('mpn').prefetch_related('mpn__chips')
        return Response(PalletMPNSerializer(qs, many=True).data)

    # POST {"items": [{"mpn": id, "board_qty": n|null}, ...]} — all or nothing.
    items = request.data.get('items') if isinstance(request.data, dict) else None
    if not isinstance(items, list) or not items:
        return Response({'error': 'items must be a non-empty list'}, status=status.HTTP_400_BAD_REQUEST)
    existing = set(pallet.pallet_mpns.values_list('mpn_id', flat=True))
    valid = []
    for item in items:
        if not isinstance(item, dict):
            return Response({'error': 'each item must be an object'}, status=status.HTTP_400_BAD_REQUEST)
        s = PalletMPNSerializer(data=item)
        if not s.is_valid():
            return Response(s.errors, status=status.HTTP_400_BAD_REQUEST)
        mpn = s.validated_data['mpn']
        if mpn.id in existing:
            return Response({'error': f'{mpn.name} is already on this pallet'}, status=status.HTTP_400_BAD_REQUEST)
        existing.add(mpn.id)
        valid.append(s)
    with transaction.atomic():
        created = [s.save(pallet=pallet) for s in valid]
    return Response(PalletMPNSerializer(created, many=True).data, status=status.HTTP_201_CREATED)


@api_view(['PUT', 'PATCH', 'DELETE'])
@permission_classes([IsAuthenticated])
def pallet_mpn_detail(request, pallet_pk, pk):
    row = get_object_or_404(PalletMPN.objects.select_related('mpn'), pk=pk, pallet_id=pallet_pk)
    if request.method == 'DELETE':
        n = row.checklist_use_count()
        if n:
            return Response({'error': f'Used by {n} checklist line(s)'}, status=status.HTTP_400_BAD_REQUEST)
        row.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
    # Only the count is editable; changing the MPN is remove + add.
    data = {'board_qty': request.data['board_qty']} if 'board_qty' in request.data else {}
    s = PalletMPNSerializer(row, data=data, partial=True)
    if s.is_valid():
        s.save()
        return Response(s.data)
    return Response(s.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def pallet_chip_options(request, pallet_pk):
    """Chips a checklist line on this pallet may name, grouped by board (MPN)."""
    pallet = get_object_or_404(Pallet, pk=pallet_pk)
    rows = pallet.pallet_mpns.select_related('mpn').prefetch_related('mpn__chips__brand')
    return Response([{
        'mpn_id': r.mpn_id,
        'mpn_name': r.mpn.name,
        'chips': [{
            'id': c.id,
            'brand_name': c.brand.name if c.brand_id else '',
            'chip_mpn': c.chip_mpn,
            'slot_group': c.slot_group,
        } for c in r.mpn.chips.all()],
    } for r in rows])


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def so_pallet_mpns(request, so_pk):
    """Every (pallet, MPN) row of an SO with chip BOMs — the Excel export's data source."""
    so = get_object_or_404(SO, pk=so_pk)
    qs = (PalletMPN.objects.filter(pallet__so=so)
          .select_related('mpn').prefetch_related('mpn__chips__brand')
          .order_by('pallet__pallet_seq', 'mpn__name'))
    return Response(PalletMPNExportSerializer(qs, many=True, context={'request': request}).data)
```

- [ ] **Step 5: URLs**

In `urls.py`, after the `checklists/search/` line:

```python
    path('pallets/<int:pallet_pk>/mpns/', views.pallet_mpn_list, name='pallet-mpn-list'),
    path('pallets/<int:pallet_pk>/mpns/<int:pk>/', views.pallet_mpn_detail, name='pallet-mpn-detail'),
    path('pallets/<int:pallet_pk>/chip-options/', views.pallet_chip_options, name='pallet-chip-options'),
    path('sos/<int:so_pk>/pallet-mpns/', views.so_pallet_mpns, name='so-pallet-mpns'),
```

- [ ] **Step 6: Run all tests**

Run: `venv/Scripts/python.exe manage.py test product --noinput`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add backend/server/product
git commit -m "feat(product): pallet MPN CRUD, chip options and SO pallet-mpn endpoints"
```

---

### Task 4: Checklist chip validation (edit + web create), chip-delete guard

**Files:**
- Modify: `backend/server/product/serializer.py` (`ChecklistSerializer`)
- Modify: `backend/server/product/views.py` (`_clean_checklist_rows`, `_create_checklists`, `checklist_list`, `mpn_chip_detail`)
- Test: `backend/server/product/tests.py`

**Interfaces:**
- Consumes: `Checklist.chip_allowed`, `Checklist.text_from_chip`.
- Produces: Checklist API includes `chip`; `PUT pallets/<pk>/checklists/<id>/` accepts `chip`; web `POST pallets/<pk>/checklists/` items accept `chip`. Scanner bulk ignores `chip`.

- [ ] **Step 1: Write the failing tests**

```python
class ChecklistChipApiTests(TestCase):
    def setUp(self):
        from rest_framework.test import APIClient
        self.client = APIClient()
        self.client.force_authenticate(user=get_user_model().objects.create_user(username='u', password='p'))
        self.so, (self.p24, self.p2) = make_so_with_pallets()
        self.board = MPN.objects.create(name='DCS-7060CX-32S')
        self.chip = Chip.objects.create(mpn=self.board, brand=ChipBrand.objects.create(name='Broadcom'),
                                        chip_mpn='BCM56960B1KFSBG')
        PalletMPN.objects.create(pallet=self.p24, mpn=self.board, board_qty=25)
        self.row = Checklist.objects.create(pallet=self.p24, barcode='S05-000617-LP1-1')
        self.url = f'/product/pallets/{self.p24.id}/checklists/{self.row.id}/'

    def test_pick_chip_and_qty(self):
        resp = self.client.put(self.url, {'chip': self.chip.id, 'qty': 40}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual((resp.json()['brand'], resp.json()['model'], resp.json()['qty'], resp.json()['chip']),
                         ('Broadcom', 'BCM56960B1KFSBG', 40, self.chip.id))

    def test_client_text_is_overridden_by_chip(self):
        resp = self.client.put(self.url, {'chip': self.chip.id, 'brand': 'Junk', 'model': 'Junk'}, format='json')
        self.assertEqual(resp.json()['brand'], 'Broadcom')

    def test_chip_from_another_pallets_mpn_rejected(self):
        other = MPN.objects.create(name='MPN2')
        PalletMPN.objects.create(pallet=self.p2, mpn=other)
        foreign = Chip.objects.create(mpn=other, chip_mpn='OTHER')
        resp = self.client.put(self.url, {'chip': foreign.id}, format='json')
        self.assertEqual(resp.status_code, 400)
        self.assertIn('chip', resp.json())

    def test_text_only_edit_still_works(self):
        """Sales Orders keeps free-text checklist editing."""
        resp = self.client.put(self.url, {'brand': 'Dell', 'model': 'OptiPlex', 'qty': 3}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.row.refresh_from_db()
        self.assertEqual((self.row.brand, self.row.model, self.row.chip_id), ('Dell', 'OptiPlex', None))

    def test_web_create_with_chip(self):
        resp = self.client.post(f'/product/pallets/{self.p24.id}/checklists/',
                                {'items': [{'chip': self.chip.id, 'qty': 40}] * 2}, format='json')
        self.assertEqual(resp.status_code, 201)
        self.assertEqual([r['brand'] for r in resp.json()], ['Broadcom', 'Broadcom'])
        self.assertEqual(Checklist.objects.filter(chip=self.chip).count(), 2)

    def test_web_create_with_foreign_chip_rejected(self):
        foreign = Chip.objects.create(mpn=MPN.objects.create(name='X'), chip_mpn='X1')
        resp = self.client.post(f'/product/pallets/{self.p24.id}/checklists/',
                                {'items': [{'chip': foreign.id}]}, format='json')
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(Checklist.objects.count(), 1)

    def test_chip_delete_blocked_when_referenced(self):
        Checklist.objects.filter(pk=self.row.pk).update(chip=self.chip)
        resp = self.client.delete(f'/product/mpns/{self.board.id}/chips/{self.chip.id}/')
        self.assertEqual(resp.status_code, 400)
        self.assertTrue(Chip.objects.filter(pk=self.chip.pk).exists())

    def test_scanner_bulk_ignores_chip(self):
        with override_settings(SCANNER_API_KEY='k'):
            resp = self.client.post(f'/product/scanner/pallets/{self.p24.id}/checklists/bulk/',
                                    {'items': [{'brand': 'B', 'model': 'M', 'chip': self.chip.id}]},
                                    format='json', HTTP_X_API_KEY='k')
        self.assertEqual(resp.status_code, 201)
        self.assertFalse(Checklist.objects.filter(chip=self.chip).exists())
```

(Check the scanner test's expected status against the existing `ScannerChecklistCreateTests` — if that endpoint returns 200, match it.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `venv/Scripts/python.exe manage.py test product.tests.ChecklistChipApiTests --noinput`
Expected: FAIL (`chip` not a serializer field; chip delete 204/500).

- [ ] **Step 3: Serializer**

```python
class ChecklistSerializer(serializers.ModelSerializer):
    class Meta:
        model = Checklist
        fields = ['id', 'pallet', 'barcode', 'chip', 'brand', 'model', 'qty', 'created_at']
        # barcode is composed server-side; a client editing it would break next_index().
        read_only_fields = ['pallet', 'barcode', 'created_at']

    def validate(self, attrs):
        chip = attrs.get('chip')
        if chip is not None:
            if not Checklist.chip_allowed(self.instance.pallet, chip):
                raise serializers.ValidationError({'chip': 'This chip is not on a board assigned to this pallet.'})
            attrs['brand'], attrs['model'] = Checklist.text_from_chip(chip)
        return attrs
```

(This serializer is only used with an instance for writes — creation goes through `_create_checklists`.)

- [ ] **Step 4: Web create path**

Replace `_clean_checklist_rows` and `_create_checklists` in `views.py`:

```python
def _clean_checklist_rows(items, pallet=None):
    """Normalise client-supplied checklist items. Returns (rows, error_message).

    With `pallet` (the web UI), an item may name a `chip`: it must belong to an MPN on
    that pallet, and its brand / part number replace any typed text. The scanner calls
    without `pallet`, so a `chip` it sends is ignored and its text is stored as before.
    """
    rows = []
    for item in items:
        if not isinstance(item, dict):
            return None, 'each item must be an object'
        brand = item.get('brand') or ''
        model = item.get('model') or ''
        if not isinstance(brand, str) or not isinstance(model, str):
            return None, 'brand and model must be strings'
        chip = None
        if pallet is not None and item.get('chip') not in (None, ''):
            chip = Chip.objects.select_related('brand').filter(pk=_as_int(item.get('chip'), 0)).first()
            if chip is None or not Checklist.chip_allowed(pallet, chip):
                return None, 'chip is not on a board assigned to this pallet'
            brand, model = Checklist.text_from_chip(chip)
        rows.append({
            'brand': brand.strip()[:100],
            'model': model.strip()[:100],
            'qty': _as_int(item.get('qty'), None),
            'chip': chip,
        })
    return rows, None
```

In `_create_checklists`, add `chip=row.get('chip'),` to the `Checklist.objects.create(...)` call. In `checklist_list` POST change `_clean_checklist_rows(items[:500])` to `_clean_checklist_rows(items[:500], pallet=pallet)`. Leave the scanner call (~L1079) unchanged.

- [ ] **Step 5: Chip delete guard**

In `mpn_chip_detail`, replace the trailing `chip.delete()` with:

```python
    try:
        chip.delete()
    except ProtectedError:
        n = chip.checklists.count()
        return Response({'error': f'Chip is used by {n} checklist line(s)'}, status=status.HTTP_400_BAD_REQUEST)
```

- [ ] **Step 6: Run all tests**

Run: `venv/Scripts/python.exe manage.py test product --noinput`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add backend/server/product
git commit -m "feat(product): checklist lines pick a chip from the pallet's MPNs"
```

---

### Task 5: Remove `Board` from the backend

**Files:**
- Modify: `backend/server/product/models.py` (delete `class Board`)
- Create: `backend/server/product/migrations/0048_delete_board.py` (generated)
- Modify: `backend/server/product/serializer.py` (delete `MPNField`, `BoardSerializer`, `BoardListSerializer`; keep `MPNLiteSerializer`)
- Modify: `backend/server/product/views.py` (delete Board views, `chip_create`, `chip_detail`, `scanner_board_photo`, `_board_inbound` + its dispatch)
- Modify: `backend/server/product/urls.py`
- Modify: `backend/server/product/tests.py` (delete `BackfillTests`; drop `Board` from the import)

**Interfaces:**
- Produces: no `Board` anywhere in the backend. `scanner_api` with `action=board_inbound` falls through to `Unknown action` (400).

- [ ] **Step 1: Write the failing test**

```python
class BoardRemovedTests(TestCase):
    def test_board_routes_gone(self):
        from rest_framework.test import APIClient
        c = APIClient()
        c.force_authenticate(user=get_user_model().objects.create_user(username='u', password='p'))
        so, _ = make_so_with_pallets(1)
        self.assertEqual(c.get(f'/product/sos/{so.id}/boards/').status_code, 404)
        self.assertEqual(c.get('/product/boards/1/').status_code, 404)

    @override_settings(SCANNER_API_KEY='k')
    def test_board_inbound_action_gone(self):
        from rest_framework.test import APIClient
        resp = APIClient().post('/product/scanner/', {'action': 'board_inbound'}, format='json', HTTP_X_API_KEY='k')
        self.assertEqual(resp.status_code, 400)
```

Delete the `BackfillTests` class and remove `Board` from the test import line (the backfill already ran in migration 0047; its function stays for that migration).

- [ ] **Step 2: Run to verify failure**

Run: `venv/Scripts/python.exe manage.py test product.tests.BoardRemovedTests --noinput`
Expected: FAIL (routes return 200).

- [ ] **Step 3: Delete the code**

- `models.py`: delete `class Board` entirely.
- `serializer.py`: delete `MPNField`, `BoardSerializer`, `BoardListSerializer`; remove `Board` from the import; update `MPNLiteSerializer`'s docstring to "Trimmed MPN payload for the export rows."
- `views.py`: delete `board_list_by_so`, `board_bulk_create`, `board_detail`, `board_photo`, `chip_create`, `chip_detail` (the board-scoped one — keep `mpn_chip_create` / `mpn_chip_detail`), `scanner_board_photo`, `_board_inbound`, and the `elif action == 'board_inbound':` branch in `scanner_api`. Remove `Board`, `BoardSerializer`, `BoardListSerializer` from imports.
- `urls.py`: delete the routes `sos/<int:so_pk>/boards/`, `sos/<int:so_pk>/boards/bulk/`, the whole `# Boards` block (`boards/<int:pk>/`, `boards/<int:pk>/photo/`, `boards/<int:board_pk>/chips/`, `boards/<int:board_pk>/chips/<int:pk>/`), and `scanner/boards/<int:board_pk>/photo/`.

Then: `grep -rn "Board\b\|\.boards\b\|board_inbound" backend/server/product --include=*.py | grep -v migrations` → expect no hits except `pallet_mpn_backfill.py`.

- [ ] **Step 4: Generate the migration**

Run: `venv/Scripts/python.exe manage.py makemigrations product --name delete_board`
Expected: `0048_delete_board.py` containing `migrations.DeleteModel(name='Board')`.

- [ ] **Step 5: Run all tests + check**

Run: `venv/Scripts/python.exe manage.py check && venv/Scripts/python.exe manage.py test product --noinput`
Expected: no issues; all pass.

- [ ] **Step 6: Apply to the local dev DB**

Run: `venv/Scripts/python.exe manage.py migrate`
Expected: 0047 prints the backfill counts; 0048 applies.

- [ ] **Step 7: Commit**

```bash
git add backend/server/product
git commit -m "refactor(product): remove scanned Board model and its endpoints"
```

---

### Task 6: Frontend types and API client

**Files:**
- Modify: `frontend/interface/IDatatable.ts`
- Modify: `frontend/app/lib/api.ts`

**Interfaces:**
- Produces: types `PalletMPN`, `ChipOptionGroup`, `PalletMpnExportRow`; `Pallet.board_qty_is_legacy`; `Checklist.chip`; `api.pallets.mpns.{list, create, update, delete}`, `api.pallets.chipOptions`, `api.sos.palletMpns`. Removes `Board`, `api.boards`, `api.chips`.

- [ ] **Step 1: Types**

In `IDatatable.ts`:
- `Pallet`: replace `board_count: number;` with
  ```ts
  /** True when board_qty is the old hand-typed value (the pallet has no MPN rows yet). */
  board_qty_is_legacy: boolean;
  ```
  and add the doc comment `/** Sum of this pallet's MPN board_qty, or the legacy value. Read-only. */` above `board_qty`.
- `Checklist`: add `chip: number | null;` after `barcode`.
- Delete `interface Board`.
- Append:

```ts
/** One board type (MPN) on one pallet, with how many of it. */
export interface PalletMPN {
  id: number;
  pallet: number;
  mpn: number;
  mpn_name: string;
  part_type: string;
  chips_per_board: number;
  board_qty: number | null;
  /** Checklist lines on this pallet naming a chip of this MPN — removal is blocked while > 0. */
  checklist_use_count: number;
  created_at: string;
}

/** Chips a checklist line may pick, grouped by the pallet's MPNs. */
export interface ChipOptionGroup {
  mpn_id: number;
  mpn_name: string;
  chips: { id: number; brand_name: string; chip_mpn: string; slot_group: string }[];
}

/** SO export row: one (pallet, MPN) with its chip BOM. */
export interface PalletMpnExportRow {
  id: number;
  pallet: number;
  board_qty: number | null;
  created_at: string;
  mpn: Pick<MPN, 'id' | 'name' | 'part_type' | 'cutboard_cost' | 'created_at' | 'chips_per_board'>;
  chips: Chip[];
}
```

- [ ] **Step 2: API client**

In `api.ts` import list: remove `Board`, add `PalletMPN, ChipOptionGroup, PalletMpnExportRow`. In `sos` add:

```ts
    palletMpns: (soId: number) => apiGet<PalletMpnExportRow[]>(`/sos/${soId}/pallet-mpns/`),
```

In `pallets` add (after `checklists`):

```ts
    mpns: {
      list: (palletId: number) => apiGet<PalletMPN[]>(`/pallets/${palletId}/mpns/`),
      create: (palletId: number, items: { mpn: number; board_qty: number | null }[]) =>
        apiPost<PalletMPN[]>(`/pallets/${palletId}/mpns/`, { items }),
      update: (palletId: number, id: number, d: { board_qty: number | null }) =>
        apiPut<PalletMPN>(`/pallets/${palletId}/mpns/${id}/`, d),
      delete: (palletId: number, id: number) => apiDelete(`/pallets/${palletId}/mpns/${id}/`),
    },
    chipOptions: (palletId: number) => apiGet<ChipOptionGroup[]>(`/pallets/${palletId}/chip-options/`),
```

Delete the `// Boards` (`boards: {...}`) and `// Chips` (`chips: {...}`) blocks.

Add next to `apiDelete` (exported, used by the Boards tab and checklist modal to show the server's message):

```ts
/** The `error` field of a failed request's JSON body, or '' — api* helpers throw
 *  `Error("<METHOD> <path> failed (<status>): <body>")`. */
export function apiErrorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : '';
  const i = msg.indexOf('): ');
  if (i < 0) return '';
  try { return JSON.parse(msg.slice(i + 3)).error || ''; } catch { return ''; }
}
```

- [ ] **Step 3: Type-check (expected to fail only in files later tasks rewrite)**

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep -o "^app/[^(]*" | sort -u`
Expected: errors only in `app/(main)/sos/[id]/page.tsx` and `app/(main)/sos/[id]/boards/[boardId]/page.tsx`.

- [ ] **Step 4: Commit**

```bash
git add frontend/interface/IDatatable.ts frontend/app/lib/api.ts
git commit -m "feat(frontend): PalletMPN types and API client; drop Board client"
```

---

### Task 7: New Boards tab component

**Files:**
- Create: `frontend/app/ui/pallet/PalletBoardsTab.tsx`

**Interfaces:**
- Consumes: `api.pallets.mpns.*`, `api.mpns.list`, `apiErrorMessage`, `PalletMPN`, `MPN`.
- Produces: `export default function PalletBoardsTab(props: { soId: number; soNumber: string; palletOptions: { value: string; label: string }[]; palletId: number | null; onPalletChange: (id: number) => void; onChanged: () => void })`.

- [ ] **Step 1: Write the component**

```tsx
'use client';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { api, apiErrorMessage } from '@/app/lib/api';
import type { MPN, PalletMPN } from '@/interface/IDatatable';
import { Button, Select, Modal, Input, Empty, thS, tdS, ghostBtn, useToast } from '@/app/ui/components';

/** Boards tab of an MSFT order: which board types (MPNs) sit on each pallet, and how many.
 *  Replaces barcode scanning. A pallet's rows here are what its checklist chip dropdown
 *  offers, and their board_qty sum is the pallet's board count on the server
 *  (Pallet.effective_board_qty) — so every change calls onChanged() to refresh the SO. */

const LABEL: React.CSSProperties = { fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-4)' };
const DASH = <span style={{ color: 'var(--ink-5)' }}>—</span>;

/** '' → null; otherwise a non-negative integer, or undefined when invalid. */
function parseBoardQty(raw: string): number | null | undefined {
  const t = raw.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isInteger(n) && n >= 0 ? n : undefined;
}

export default function PalletBoardsTab({ soId, soNumber, palletOptions, palletId, onPalletChange, onChanged }: {
  soId: number; soNumber: string;
  palletOptions: { value: string; label: string }[];
  palletId: number | null;
  onPalletChange: (id: number) => void;
  onChanged: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [rows, setRows] = useState<PalletMPN[]>([]);
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PalletMPN | null>(null);

  const load = useCallback(async () => {
    if (palletId == null) { setRows([]); return; }
    setLoading(true);
    try { setRows(await api.pallets.mpns.list(palletId)); }
    catch { toast('Failed to load boards'); }
    finally { setLoading(false); }
    // toast is a fresh function each render; depending on it would reload in a loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [palletId]);
  useEffect(() => { load(); }, [load]);

  const totalBoards = rows.reduce((s, r) => s + (r.board_qty ?? 0), 0);
  const palletLabel = palletOptions.find(o => o.value === String(palletId))?.label ?? '';
  const existingMpnIds = useMemo(() => new Set(rows.map(r => r.mpn)), [rows]);

  /** Returns false when the value was rejected, so the cell can revert. */
  const saveQty = async (row: PalletMPN, raw: string): Promise<boolean> => {
    const next = parseBoardQty(raw);
    if (next === undefined) { toast('Board qty must be a whole number, 0 or more'); return false; }
    if (next === row.board_qty) return true;
    try {
      const updated = await api.pallets.mpns.update(row.pallet, row.id, { board_qty: next });
      setRows(rs => rs.map(r => r.id === row.id ? updated : r));
      onChanged();
      return true;
    } catch (e) { toast(apiErrorMessage(e) || 'Failed to save board qty'); return false; }
  };

  const handleDelete = async () => {
    const target = deleteTarget;
    if (!target) return;
    try {
      await api.pallets.mpns.delete(target.pallet, target.id);
      setRows(rs => rs.filter(r => r.id !== target.id));
      onChanged();
      toast('Board removed from pallet');
    } catch (e) { toast(apiErrorMessage(e) || 'Failed to remove board'); }
    finally { setDeleteTarget(null); }
  };

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <span style={LABEL}>Pallet</span>
        <div style={{ minWidth: 200 }}>
          <Select value={palletId == null ? '' : String(palletId)} onChange={v => onPalletChange(Number(v))} options={palletOptions} />
        </div>
        <span className="num" style={{ fontSize: 12, color: 'var(--ink-3)' }}>
          {rows.length} MPN{rows.length === 1 ? '' : 's'} · {totalBoards} board{totalBoards === 1 ? '' : 's'}
        </span>
        <div style={{ flex: 1 }} />
        <Button size="sm" variant="primary" icon={<PlusIcon />} onClick={() => setAddOpen(true)} disabled={palletId == null}>
          Add board
        </Button>
      </div>

      <div className="table-scroll" style={{ border: '1px solid var(--hair)', borderRadius: 4, background: 'var(--surface)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--hair)' }}>
              <th style={thS}>MPN</th>
              <th style={thS}>Part type</th>
              <th style={{ ...thS, textAlign: 'right' }}>Chips / board</th>
              <th style={{ ...thS, textAlign: 'right' }}>Board qty</th>
              <th style={{ ...thS, textAlign: 'right' }}>Checklist lines</th>
              <th style={{ ...thS, width: 48 }} />
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} style={{ borderBottom: '1px solid var(--hair)' }}>
                <td style={tdS}>
                  <button className="mono"
                    onClick={() => router.push(`/sos/${soId}/mpns/${r.mpn}?so=${encodeURIComponent(soNumber)}&palletId=${r.pallet}&palletLabel=${encodeURIComponent(palletLabel)}`)}
                    style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', color: 'var(--accent-2)', fontWeight: 600, fontSize: 12.5, fontFamily: 'inherit' }}>
                    {r.mpn_name}
                  </button>
                </td>
                <td style={tdS}>{r.part_type || DASH}</td>
                <td style={{ ...tdS, textAlign: 'right' }} className="num">{r.chips_per_board}</td>
                <td style={{ ...tdS, textAlign: 'right' }}><QtyCell row={r} onSave={saveQty} /></td>
                <td style={{ ...tdS, textAlign: 'right' }} className="num">{r.checklist_use_count || DASH}</td>
                <td style={{ ...tdS, textAlign: 'right' }}>
                  <button onClick={() => setDeleteTarget(r)} style={ghostBtn} title="Remove from pallet"><TrashIcon /></button>
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={6}>
                <Empty label={palletId == null ? 'No pallets yet' : 'No boards on this pallet yet'}
                  sub={palletId == null ? 'Add a pallet first.' : "Click 'Add board' to assign MPNs."} />
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <AddBoardsModal open={addOpen} palletId={palletId} existingMpnIds={existingMpnIds}
        onClose={() => setAddOpen(false)}
        onAdded={n => { load(); onChanged(); toast(`${n} board type${n === 1 ? '' : 's'} added`); }} />

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Remove board from pallet"
        footer={<>
          <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button variant="danger" onClick={handleDelete}>Remove</Button>
        </>}>
        <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.6 }}>
          Remove <b className="mono">{deleteTarget?.mpn_name}</b> from <b>{palletLabel}</b>?
          {(deleteTarget?.checklist_use_count ?? 0) > 0 && (
            <div style={{ marginTop: 8, color: 'var(--err)' }}>
              {deleteTarget!.checklist_use_count} checklist line(s) use its chips — change them first.
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}

function QtyCell({ row, onSave }: { row: PalletMPN; onSave: (r: PalletMPN, raw: string) => Promise<boolean> }) {
  const shown = row.board_qty == null ? '' : String(row.board_qty);
  const [v, setV] = useState(shown);
  useEffect(() => { setV(shown); }, [shown]);
  return (
    <input type="number" min={0} step={1} value={v} placeholder="—"
      onChange={e => setV(e.target.value)}
      onBlur={async () => { if (!(await onSave(row, v))) setV(shown); }}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      style={{ width: 84, height: 28, textAlign: 'right', border: '1px solid var(--hair-strong)', borderRadius: 3,
        padding: '0 8px', fontSize: 12.5, background: 'var(--surface)', color: 'var(--ink)', fontFamily: 'inherit' }} />
  );
}

function AddBoardsModal({ open, palletId, existingMpnIds, onClose, onAdded }: {
  open: boolean; palletId: number | null; existingMpnIds: Set<number>;
  onClose: () => void; onAdded: (n: number) => void;
}) {
  const [mpns, setMpns] = useState<MPN[]>([]);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Map<number, string>>(new Map());   // mpn id → qty text
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setQ(''); setPicked(new Map()); setError('');
    // Current MPNs only — Finished ones are hidden, as in the old Add-board dropdown.
    api.mpns.list({ status: 'current' }).then(setMpns).catch(() => setError('Failed to load MPNs'));
  }, [open]);

  const candidates = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return mpns
      .filter(m => !existingMpnIds.has(m.id) && (!needle || m.name.toLowerCase().includes(needle)))
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));   // newest first
  }, [mpns, q, existingMpnIds]);

  const toggle = (id: number) => setPicked(p => {
    const n = new Map(p); if (n.has(id)) n.delete(id); else n.set(id, ''); return n;
  });

  const submit = async () => {
    if (palletId == null || picked.size === 0) return;
    const items: { mpn: number; board_qty: number | null }[] = [];
    for (const [mpn, raw] of picked) {
      const board_qty = parseBoardQty(raw);
      if (board_qty === undefined) { setError('Board qty must be a whole number, 0 or more'); return; }
      items.push({ mpn, board_qty });
    }
    setSaving(true); setError('');
    try {
      await api.pallets.mpns.create(palletId, items);
      onAdded(items.length);
      onClose();
    } catch (e) { setError(apiErrorMessage(e) || 'Failed to add boards'); }
    finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add boards to pallet" width={560}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={submit} disabled={saving || picked.size === 0}>
          {saving ? 'Adding…' : `Add ${picked.size || ''} board type${picked.size === 1 ? '' : 's'}`}
        </Button>
      </>}>
      {error && <div style={{ marginBottom: 10, color: 'var(--err)', fontSize: 12.5 }}>{error}</div>}
      <Input value={q} onChange={setQ} placeholder="Search MPN…" autoFocus style={{ width: '100%', marginBottom: 10 }} />
      <div style={{ maxHeight: 340, overflowY: 'auto', border: '1px solid var(--hair)', borderRadius: 3 }}>
        {candidates.map(m => {
          const on = picked.has(m.id);
          return (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderBottom: '1px solid var(--hair)', background: on ? 'var(--accent-light)' : 'transparent' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, cursor: 'pointer' }}>
                <input type="checkbox" checked={on} onChange={() => toggle(m.id)} style={{ accentColor: 'var(--accent)' }} />
                <span className="mono" style={{ fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
                {m.part_type && <span style={{ fontSize: 11.5, color: 'var(--ink-4)' }}>{m.part_type}</span>}
              </label>
              {on && (
                <input type="number" min={0} step={1} placeholder="Board qty" value={picked.get(m.id) ?? ''}
                  onChange={e => { const v = e.target.value; setPicked(p => new Map(p).set(m.id, v)); }}
                  style={{ width: 96, height: 28, textAlign: 'right', border: '1px solid var(--hair-strong)', borderRadius: 3, padding: '0 8px', fontSize: 12.5, fontFamily: 'inherit' }} />
              )}
            </div>
          );
        })}
        {candidates.length === 0 && (
          <div style={{ padding: 16, fontSize: 12.5, color: 'var(--ink-4)', textAlign: 'center' }}>No matching MPNs.</div>
        )}
      </div>
    </Modal>
  );
}

const PlusIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
);
const TrashIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
  </svg>
);
```

Before writing, confirm `Button` accepts `variant="danger"` / `"ghost"` / `"primary"` and that `useToast()` is called as `toast(msg)` (see `app/ui/components/index.tsx`); adjust if a name differs.

- [ ] **Step 2: Lint the file**

Run: `cd frontend && npx eslint app/ui/pallet/PalletBoardsTab.tsx`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/ui/pallet/PalletBoardsTab.tsx
git commit -m "feat(frontend): Boards tab component for assigning MPNs to a pallet"
```

---

### Task 8: Wire the SO page — tabs, deep link, remove scan-board code, pallet forms/table

**Files:**
- Modify: `frontend/app/(main)/sos/[id]/page.tsx`
- Delete: `frontend/app/(main)/sos/[id]/boards/` (whole directory)

**Interfaces:**
- Consumes: `PalletBoardsTab` (Task 7); `Pallet.board_qty` / `board_qty_is_legacy` (Task 6).
- Produces: URL `/sos/<id>?tab=boards&pallet=<palletId>` opens the Boards tab on that pallet (used by Task 9).

- [ ] **Step 1: Imports and module-level helpers**

- Add `import PalletBoardsTab from '@/app/ui/pallet/PalletBoardsTab';`
- Type import: `import type { SODetail, Pallet, PalletPhoto, Chip, Vendor } from '@/interface/IDatatable';` (drop `Board`).
- Delete `function downloadBackup` and `function sortedPalletOptions` (L26-61).

- [ ] **Step 2: State**

In `SODetailPage` delete: `addBoardOpen`, `boardMpns`, `deleteBoardId`, the `// Board pagination + filter state` block (`boards`, `boardDateFrom`, `boardDateTo`, `boardPalletFilter`, `boardBarcodeSearch`), `loadBoards`, and `useEffect(() => { if (tab === 'boards') loadBoards(); }, ...)`. Add:

```tsx
  const [boardsPalletId, setBoardsPalletId] = useState<number | null>(null);

  // Deep link from a pallet's checklist: /sos/<id>?tab=boards&pallet=<palletId>
  useEffect(() => {
    const qp = new URLSearchParams(window.location.search);
    if (qp.get('tab') === 'boards') setTab('boards');
    const p = Number(qp.get('pallet'));
    if (p) setBoardsPalletId(p);
  }, []);
```

(Place both above the `if (loading || !so) return` early return — hooks must stay unconditional.)

- [ ] **Step 3: Derived values and handlers**

Replace the `palletOptions` block with:

```tsx
  const boardPalletOptions = so.pallets.map(p => {
    const parts = [p.licence_number, p.gateload_number].filter(Boolean);
    const label = parts.length ? parts.join('-') : `#${String(p.pallet_seq).padStart(2, '0')}`;
    return { value: String(p.id), label: `#${String(p.pallet_seq).padStart(2, '0')} · ${label}` };
  });
  // Boards tab defaults to the first pallet until one is picked or deep-linked.
  const boardsPallet = so.pallets.some(p => p.id === boardsPalletId) ? boardsPalletId : (so.pallets[0]?.id ?? null);
```

- `handleDeletePallet`: delete the `setBoards(...)` line.
- `handleAddPallet` / `handleAddPalletsBulk`: delete the `board_qty: ...` line from both `api.pallets.create` payloads and `board_qty: string` from both parameter types.
- Delete `handleDeleteBoard`, `handleOpenAddBoard`, `handleAddBoard`, `handleAddBoardBulk`.

- [ ] **Step 4: Export data source** — leave for Task 10 (it still references `api.boards`; Task 10 rewrites it). To keep this task compiling, replace only the first line of `handleExport`'s try block now:

```tsx
      const pmRows = await api.sos.palletMpns(soId);
      // One row per (pallet, MPN) carrying its board qty — replaces per-scan Board rows.
      const allBoardData = pmRows.map(r => ({
        pallet: r.pallet, mpn: r.mpn, chips: r.chips, qty: r.board_qty ?? 0, scanned_at: r.created_at,
      }));
```

and change `entry.boardCount++;` → `entry.boardCount += b.qty;` and `entry.partQty++;` → `entry.partQty += b.qty;`. (Task 10 verifies the sheets.)

- [ ] **Step 5: Tabs and tab bodies**

- Desktop + mobile tab lists: `{ value: 'boards', label: 'Boards' }` stays (it now means the new tab).
- Delete the whole `{/* Boards actions */} {tab === 'boards' && (...)}` block in the desktop tab row (the tab owns its toolbar now).
- `PalletsTab` prop: `onGoToBoards={palletId => { setBoardsPalletId(palletId); setTab('boards'); }}`
- Replace the `{tab === 'boards' && (<BoardsTab ... />)}` body with:

```tsx
        {tab === 'boards' && (
          <PalletBoardsTab
            soId={soId}
            soNumber={so.so_number}
            palletOptions={boardPalletOptions}
            palletId={boardsPallet}
            onPalletChange={setBoardsPalletId}
            onChanged={loadSO}
          />
        )}
```

- Delete the `{/* Add board modal */}` `<AddBoardModal .../>` line and the `{/* Delete board confirmation modal */}` block.
- Delete SO confirmation list: change `<li>All boards ({so?.total_board_count ?? 0} boards)</li>` to `<li>All board assignments ({so?.total_board_count ?? 0} boards)</li>` and delete the `<li>All chips and photos attached to those boards</li>` line (chips live on MPNs and survive).
- Delete pallet confirmation (~L1157) keeps `pallet.board_qty` — no change.

- [ ] **Step 6: Delete dead components**

Delete `function BoardsTab` (L1754-2027), `function MpnComboInput`, `function AddBoardModal`, and any icon constants left unused (`ChevronIcon` if only `BoardsTab` used it — check with grep).

- [ ] **Step 7: Pallets table**

In `PalletsTab` desktop table:
- Header: delete `<th ...>Board Qty (Real)</th>`.
- Row: replace the `board_qty` cell and delete the following `board_count` cell:

```tsx
                  <td style={{ ...tdS, textAlign: 'right' }} className="num">
                    {p.board_qty != null ? p.board_qty : <span style={{ color: 'var(--ink-5)' }}>—</span>}
                    {p.board_qty_is_legacy && <Badge tone="neutral" style={{ marginLeft: 6, fontSize: 10 }}>Legacy</Badge>}
                  </td>
```

- Total row: delete the cell `<span style={{ fontWeight: 600 }}>{pallets.reduce((s, p) => s + p.board_count, 0)}</span>` (its whole `<td>`).
- Empty row: `colSpan={13}` → `colSpan={12}`.
- Mobile card (~L1461): after the `Boards {p.board_qty}` span add `{p.board_qty_is_legacy && <Badge tone="neutral" style={{ fontSize: 10 }}>Legacy</Badge>}` inside the same fragment.

(Badge tones available: check `BadgeTone` in `app/ui/components/index.tsx`; use the neutral/grey one.)

- [ ] **Step 8: Pallet forms — no more board qty input**

- `EditPalletModal`: delete the `boardQty` state, its reset in the effect, the `board_qty: ...` line in the save payload, and the `<Field label="Board Qty" span={2}>…</Field>`.
- `AddPalletModal`: remove `board_qty` from `type PalletRowData`, from `blankRow()`, the `boardQty` state + `setBoardQty('')` reset, `board_qty: boardQty` in `onAdd(...)`, `board_qty: r.board_qty` in `submitBulk`, the single-mode `<Field label="Board Qty">`, the bulk header `<div ...>Board Qty</div>`, and the bulk `<BulkCellP value={r.board_qty} .../>`. In BOTH bulk `gridTemplateColumns` strings drop one `0.9fr`: `'28px 1.2fr 1.2fr 0.9fr 0.9fr 0.9fr 0.9fr 0.9fr 0.9fr 0.9fr 24px'`. Also update `onAdd` / `onAddBulk` prop types if they spell out `board_qty`. Grep `board_qty\|boardQty` in the file afterwards: the only remaining hits should be display reads of `p.board_qty` / `pallet.board_qty` and `palletTotal.boardQty`.

- [ ] **Step 9: Remove the board detail page**

```bash
git rm -r "frontend/app/(main)/sos/[id]/boards"
```

- [ ] **Step 10: Type-check and lint**

Run: `cd frontend && npx tsc --noEmit && npm run lint`
Expected: clean (fix leftovers: unused imports such as `Select` if no longer used, `Board`).

- [ ] **Step 11: Commit**

```bash
git add -A "frontend/app/(main)/sos/[id]"
git commit -m "feat(frontend): MSFT order Boards tab replaces board scanning"
```

---

### Task 9: Checklist chip dropdown (MSFT only)

**Files:**
- Modify: `frontend/app/ui/pallet/ChecklistCard.tsx`
- Modify: `frontend/app/ui/pallet/ChecklistView.tsx`

**Interfaces:**
- Consumes: `api.pallets.chipOptions`, `ChipOptionGroup`, `Checklist.chip`, deep link from Task 8.
- Produces: `ChecklistCard` props `chipMode?: boolean` (default false) and `boardsHref?: string`.

- [ ] **Step 1: ChipSelect component**

Add to `ChecklistCard.tsx` (imports: `import Link from 'next/link';`, `import type { Checklist, ChipOptionGroup } from '@/interface/IDatatable';`):

```tsx
// ── Chip picker (MSFT orders) ───────────────────────────────────────────────────
/** One dropdown, grouped by the pallet's boards (MPNs). Picking a chip sets both the
 *  brand and the model — the server copies them from the chip. */
function ChipSelect({ groups, value, onChange, boardsHref }: {
  groups: ChipOptionGroup[]; value: string; onChange: (v: string) => void; boardsHref?: string;
}) {
  if (groups.length === 0) {
    return (
      <div style={{ ...InputSty, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4, color: 'var(--ink-4)', fontSize: 13, height: 'auto', minHeight: 40 }}>
        No boards assigned to this pallet yet.
        {boardsHref && <Link href={boardsHref} style={{ color: 'var(--accent-2)', fontWeight: 600 }}>Add them on the Boards tab</Link>}
      </div>
    );
  }
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={{ ...InputSty, cursor: 'pointer' }}>
      <option value="">— Select a chip —</option>
      {groups.map(g => (
        <optgroup key={g.mpn_id} label={g.mpn_name}>
          {g.chips.map(c => (
            <option key={c.id} value={String(c.id)}>
              {[c.brand_name, c.chip_mpn].filter(Boolean).join(' · ') || `Chip #${c.id}`}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
```

- [ ] **Step 2: Edit modal**

Change `EditModal` signature and body:

```tsx
type EditPayload = { brand?: string; model?: string; chip?: number | null; qty: number | null };

function EditModal({ row, chipGroups, boardsHref, onClose, onSubmit }: {
  row: Checklist | null; chipGroups: ChipOptionGroup[] | null; boardsHref?: string;
  onClose: () => void; onSubmit: (d: EditPayload) => Promise<void>;
}) {
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [chip, setChip] = useState('');
  const [qty, setQty] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const chipMode = chipGroups !== null;

  useEffect(() => {
    if (row) {
      setBrand(row.brand || ''); setModel(row.model || '');
      setChip(row.chip == null ? '' : String(row.chip));
      setQty(row.qty == null ? '' : String(row.qty)); setError('');
    }
  }, [row]);

  const handleSubmit = async () => {
    setSaving(true); setError('');
    try {
      await onSubmit(chipMode
        // No chip picked: send nothing for it, so a legacy row keeps its text.
        ? { ...(chip ? { chip: +chip } : {}), qty: parseQty(qty) }
        : { brand: brand.trim(), model: model.trim(), qty: parseQty(qty) });
      onClose();
    } catch (e: any) { setError(apiErrorMessage(e) || e.message || 'Failed to save'); }
    finally { setSaving(false); }
  };
```

In its JSX replace the Brand/Model `<div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>…</div>` with:

```tsx
          {chipMode ? (
            <div style={{ marginBottom: 14 }}>
              <div style={FieldLabel}>Chip (brand · model)</div>
              {row.chip == null && (row.brand || row.model) && (
                <div style={{ marginBottom: 6, fontSize: 11.5, color: 'var(--ink-4)' }}>
                  Original: {[row.brand, row.model].filter(Boolean).join(' / ')}
                </div>
              )}
              <ChipSelect groups={chipGroups!} value={chip} onChange={setChip} boardsHref={boardsHref} />
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
              {/* existing Brand / Model inputs, unchanged */}
            </div>
          )}
```

(Keep the existing two input blocks verbatim inside the else branch.) Import `apiErrorMessage` from `@/app/lib/api`.

- [ ] **Step 3: Add modal**

Give `AddModal` the same `chipGroups` / `boardsHref` props and a `chip` state (reset to `''` on open). Its submit payload type becomes `{ count: number; brand: string; model: string; chip: number | null; qty: number | null }` with `chip: chip ? +chip : null` (brand/model sent as `''` in chip mode). In JSX, when `chipGroups !== null` render `<div style={{ marginBottom: 14 }}><div style={FieldLabel}>Chip <span style={OptionalSty}>optional</span></div><ChipSelect .../></div>` instead of the Brand/Model row.

- [ ] **Step 4: Card wiring**

```tsx
export default function ChecklistCard({ palletId, soNumber, palletLabel, palletBarcode, isMobile, showToast, chipMode = false, boardsHref }: {
  palletId: number; soNumber: string; palletLabel: string; palletBarcode: string;
  isMobile: boolean; showToast: ToastFn;
  /** MSFT orders: brand/model come from a chip of the pallet's boards, not free text. */
  chipMode?: boolean;
  /** Where "add boards" points when the pallet has none (MSFT Boards tab). */
  boardsHref?: string;
}) {
```

Add state and loading (inside `load`, after the rows fetch):

```tsx
  const [chipGroups, setChipGroups] = useState<ChipOptionGroup[] | null>(null);
```

```tsx
      if (chipMode) setChipGroups(await api.pallets.chipOptions(palletId));
```

(add `chipMode` to `load`'s dependency array). `handleAdd`: `items` → `({ brand: d.brand, model: d.model, chip: d.chip, qty: d.qty })`. `handleEdit` takes `EditPayload`. Pass `chipGroups={chipMode ? (chipGroups ?? []) : null}` and `boardsHref={boardsHref}` to both modals. `api.pallets.checklists.create`'s `items` type is `Partial<Checklist>[]`, which now includes `chip` — no change needed.

- [ ] **Step 5: ChecklistView**

```tsx
      <ChecklistCard palletId={pId} soNumber={soNumber} palletLabel={palletLabel}
        palletBarcode={palletBarcode} isMobile={isMobile} showToast={showToast}
        chipMode={base === 'sos'} boardsHref={`/sos/${soId}?tab=boards&pallet=${pId}`} />
```

- [ ] **Step 6: Type-check and lint**

Run: `cd frontend && npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add frontend/app/ui/pallet/ChecklistCard.tsx frontend/app/ui/pallet/ChecklistView.tsx
git commit -m "feat(frontend): MSFT checklist lines pick a chip from the pallet's boards"
```

---

### Task 10: Export, SO list, MPN labels, docs — and end-to-end verification

**Files:**
- Modify: `frontend/app/(main)/sos/[id]/page.tsx` (`handleExport`)
- Modify: `frontend/app/(main)/sos/page.tsx`
- Modify: `frontend/app/(main)/mpns/[id]/page.tsx` (L170, L198), `frontend/app/(main)/sos/[id]/mpns/[mpnId]/page.tsx` (L108)
- Modify: `CLAUDE.md`

- [ ] **Step 1: Export — Processing PCB date**

In `handleExport`'s pcbMap loop the existing `b.scanned_at` reads now carry `PalletMPN.created_at` (mapped in Task 8 Step 4). Confirm the three consumer loops (`mpnMap`, `pcbMap`, `chipBomMap`) only use `b.pallet`, `b.mpn`, `b.chips`, `b.qty`, `b.scanned_at`; rename the local `scanned_at` key to `date` in the adapter and in those loops for clarity:

```tsx
      const allBoardData = pmRows.map(r => ({
        pallet: r.pallet, mpn: r.mpn, chips: r.chips, qty: r.board_qty ?? 0,
        date: r.created_at,   // when this MPN was added to the pallet = "Date processed"
      }));
```

(update `b.scanned_at` → `b.date` in the `mpnMap` and `pcbMap` loops). The `mpnMap` entry's `mpn` is now the lite MPN shape — if `MpnEntry.mpn` is typed `MPN`, widen `chipSlots.ts` `MpnEntry.mpn` to `Pick<MPN, 'id' | 'name' | 'part_type' | 'cutboard_cost'>` and fix any resulting type errors.

- [ ] **Step 2: SO list — one board column**

In `frontend/app/(main)/sos/page.tsx`:
- `HEADER`: `'Boards(REAL)', 'Boards(Scan)'` → `'Boards'`.
- Sheet 1 rows: drop the `'Boards(Scan)'` key; rename `'Boards(REAL)'` → `'Boards'` (pallet rows use `p.board_qty ?? ''`, the no-pallet row `''`).
- Sheet 2 rows: drop the trailing `s.total_board_count` element from both `aoaData.push` calls; subtotal row uses `s.total_board_count`.
- Table: delete `<Th label="Boards(Scan)" .../>` and its `<td>` (`{so.total_board_count}`, ~L330); rename `Boards(Real)` → `Boards` and make its cell `{so.total_board_count}`.
- Adjust `COL_WIDTHS` / any column-count constants for the removed column (check the summary-row fill loop's column count).

- [ ] **Step 3: MPN labels**

Replace `'Boards (Scanned)'` with `'Boards'` in `mpns/[id]/page.tsx` (2×) and `sos/[id]/mpns/[mpnId]/page.tsx` (1×).

- [ ] **Step 4: CLAUDE.md**

- Model relationships block → `Vendor → SO → Pallet → PalletMPN → MPN → Chip → ChipBrand`, `Pallet → Checklist → Chip (nullable)`, `SO → SOPhoto`.
- Replace the `Board.mpn` / `Board.pallet` key-field bullets with:
  - `PalletMPN` — (pallet, MPN) unique, `board_qty`. Board counts come only from `Pallet.effective_board_qty` (sum of rows; legacy `Pallet.board_qty` when a pallet has none).
  - `Checklist.chip` — FK Chip (nullable, PROTECT); must belong to an MPN on the line's pallet; server copies brand/model text from it.
- Frontend pages table: remove `/sos/[id]/boards/[boardId]/`.
- Scanner section: note `board_inbound` and `scanner/boards/<pk>/photo/` were removed.
- Update procedure: add before `python manage.py migrate` — "Before migrations that drop tables (e.g. 0048_delete_board), back up: `pg_dump -U $DB_USER -h $DB_HOST $DB_NAME > ~/backup_$(date +%F).sql`", and after it — "After 0048: `rm -rf /var/www/toyoshima/media/boards`".

- [ ] **Step 5: Full checks**

Run:
```bash
cd backend/server && venv/Scripts/python.exe manage.py test product --noinput
cd ../../frontend && npm run lint && npm run build
```
Expected: tests OK; lint clean; build succeeds.

- [ ] **Step 6: End-to-end in the browser**

Start `python manage.py runserver` and `npm run dev`; log in; on an MSFT SO:
1. Pallets tab → click a pallet row → lands on Boards tab with that pallet selected.
2. Add board → pick `DCS-7060CX-32S`, qty 25 → row shows; header BOARDS and the Pallets "Board Qty" update; a pallet with no rows but an old number shows "Legacy".
3. Pallet → Boxes & checklist → Checklist → edit a line → dropdown lists only that pallet's MPN chips grouped by MPN → pick `Broadcom · BCM56960B1KFSBG`, qty 40 → table shows Broadcom / BCM56960B1KFSBG / 40.
4. Back on Boards tab: Checklist lines = 1; Remove is refused with the server message.
5. A pallet with no boards: checklist edit shows the "Add them on the Boards tab" link and it lands on the right pallet.
6. Sales Orders → a pallet checklist → edit still shows free-text Brand / Model.
7. Export the SO → Processing PCB Part Qty = 25 for that LP/MPN; Date processed = today.
8. MPN page for `DCS-7060CX-32S` → "Boards" = sum across pallets.

- [ ] **Step 7: Commit**

```bash
git add -A frontend CLAUDE.md
git commit -m "feat: export, SO list and MPN counts from pallet boards; docs"
```
