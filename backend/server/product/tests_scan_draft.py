"""product.scan_draft: transcription → draft → (dry-run | real) apply.

Fixture = sample cl2 (SO S06-000979, pallet 06LP00083239-9) against a database shaped like
production: board MPNs stored as 'SP#841631-001', '1A4262W00-600-G', 'B600GH0', the FPGA
stored with its handwriting typo 'EP4CE1SF23C9LN', NT5TU64M16HG stored without '-AC'.
"""
import copy
from datetime import date
from decimal import Decimal

from django.test import TestCase

from product.models import (
    Vendor, SO, Pallet, MPN, Chip, ChipBrand, PalletMPN, Checklist, ChecklistScan, ChecklistCorrection,
)
from product import scan_draft
from product.scan_draft import build_draft, apply_draft, preview_check, DraftError

CL2 = {
    'label': {'so_number': 'S06-000979', 'pallet_barcode': '06LP00083239-9', 'weight_text': '575 LB',
              'confidence': 'high'},
    'header_groups': [
        {'mpn_text': '841631-001', 'mpn_confidence': 'high', 'board_qty': 147, 'board_qty_confidence': 'high',
         'items': [{'text': 'SLKM8', 'confidence': 'high'}, {'text': '1G', 'confidence': 'high'},
                   {'text': 'AL', 'confidence': 'high'}]},
        {'mpn_text': '789124-001', 'mpn_confidence': 'high', 'board_qty': 12, 'board_qty_confidence': 'high',
         'items': [{'text': 'SLKM8', 'confidence': 'high'}, {'text': '1G', 'confidence': 'high'},
                   {'text': 'AL', 'confidence': 'high'}]},
        {'mpn_text': '1A42B2W00-600-G', 'mpn_confidence': 'low', 'board_qty': 31, 'board_qty_confidence': 'high',
         'items': [{'text': 'ASPEED AST2400', 'confidence': 'high'}, {'text': '2G', 'confidence': 'high'},
                   {'text': 'SLKM8', 'confidence': 'high'}]},
        {'mpn_text': 'BG00GH0', 'mpn_confidence': 'low', 'board_qty': 1, 'board_qty_confidence': 'high',
         'items': [{'text': 'SLKM8', 'confidence': 'high'}, {'text': '1G', 'confidence': 'high'}]},
    ],
    'lines': [
        {'index': 1, 'column': 'left', 'brand_text': '', 'model_text': 'SLKM8', 'model_confidence': 'high',
         'qty': 191, 'qty_confidence': 'high', 'model_candidates': []},
        {'index': 2, 'column': 'left', 'brand_text': 'ALTERA', 'model_text': 'EP4CE15F23C9LN',
         'model_confidence': 'high', 'qty': 159, 'qty_confidence': 'high', 'model_candidates': []},
        {'index': 3, 'column': 'left', 'brand_text': '', 'model_text': 'D9MNQ', 'model_confidence': 'high',
         'qty': 16, 'qty_confidence': 'high', 'model_candidates': []},
        {'index': 4, 'column': 'left', 'brand_text': '', 'model_text': 'D9SFT', 'model_confidence': 'high',
         'qty': 143, 'qty_confidence': 'high', 'model_candidates': []},
        {'index': 5, 'column': 'left', 'brand_text': '', 'model_text': 'NT5TU64M16HG-AC',
         'model_confidence': 'high', 'qty': 1, 'qty_confidence': 'high', 'model_candidates': []},
        {'index': 6, 'column': 'left', 'brand_text': '', 'model_text': 'K4B2G1646Q-BCK0',
         'model_confidence': 'high', 'qty': 31, 'qty_confidence': 'high', 'model_candidates': []},
        {'index': 7, 'column': 'right', 'brand_text': 'ASPEED', 'model_text': 'AST2400',
         'model_confidence': 'high', 'qty': 31, 'qty_confidence': 'high', 'model_candidates': []},
    ],
    'notes': '',
}


class Cl2Fixture(TestCase):
    """Production-like catalog + pallet S06-000979 / 06LP00083239 / 9 with blank rows #1–#n."""
    rows = 7

    def setUp(self):
        vendor = Vendor.objects.create(name='MSFT')
        self.so = SO.objects.create(so_number='S06-000979', vendor=vendor, inbound_date=date(2026, 11, 1))
        self.pallet = Pallet.objects.create(so=self.so, pallet_seq=1, licence_number='06LP00083239',
                                            gateload_number='9', qty=1, in_weight_gross=Decimal('575'))
        self.other = Pallet.objects.create(so=self.so, pallet_seq=2, licence_number='06LP00085063',
                                           gateload_number='3', qty=1)
        altera = ChipBrand.objects.create(name='ALTERA')
        self.m841 = MPN.objects.create(name='SP#841631-001')
        self.m789 = MPN.objects.create(name='SP#789124-001')
        self.m1a4 = MPN.objects.create(name='1A4262W00-600-G')
        self.mb6 = MPN.objects.create(name='B600GH0')
        for m in (self.m841, self.m789, self.m1a4, self.mb6):
            Chip.objects.create(mpn=m, chip_mpn='SLKM8')
        for m in (self.m841, self.m789):
            Chip.objects.create(mpn=m, chip_mpn='EP4CE1SF23C9LN', brand=altera)
        Chip.objects.create(mpn=self.m841, chip_mpn='D9SFT', slot_group='1G', item_group='Memory')
        Chip.objects.create(mpn=self.m841, chip_mpn='NT5TU64M16HG', slot_group='1G', item_group='Memory')
        for p in ('D9SFT', 'D9MNQ', 'K4B1G1646G-BCH9'):
            Chip.objects.create(mpn=self.m789, chip_mpn=p, slot_group='1G', item_group='Memory')
        Chip.objects.create(mpn=self.mb6, chip_mpn='D9SFT', slot_group='1G', item_group='Memory')
        self.barcode = self.pallet.compose_barcode()
        for i in range(1, self.rows + 1):
            Checklist.objects.create(pallet=self.pallet, barcode=f'{self.barcode}-{i}')
        self.scan = ChecklistScan.objects.create(so=self.so, image='checklist_scans/cl2.jpg', status='ready',
                                                 transcription=copy.deepcopy(CL2))

    # helpers
    def draft(self, **kw):
        return build_draft(self.scan, **kw)

    def mpn(self, d, text):
        return next(m for m in d['mpns'] if m['text'] == text)

    def line(self, d, index):
        return next(l for l in d['lines'] if l['index'] == index)

    def tick_all(self, d):
        for m in d['mpns']:
            for c in m['chips']:
                c['apply'] = True
        return d

    def live_counts(self):
        return (PalletMPN.objects.count(), MPN.objects.count(), Chip.objects.count(), ChipBrand.objects.count(),
                Checklist.objects.exclude(model='').count(), Checklist.objects.count())


class BuildDraftTests(Cl2Fixture):

    def test_pallet_identified_from_label(self):
        d = self.draft()
        self.assertEqual(d['pallet_id'], self.pallet.id)
        self.assertEqual(d['errors'], [])

    def test_mpns_match_ignoring_sp_prefix_and_near_names_are_yellow(self):
        d = self.draft()
        m = self.mpn(d, '841631-001')
        self.assertEqual((m['mpn_id'], m['match']), (self.m841.id, 'exact'))
        near = self.mpn(d, 'BG00GH0')
        self.assertEqual((near['mpn_id'], near['match']), (self.mb6.id, 'near'))
        self.assertIn('mpn', near['yellow'])
        self.assertEqual(self.mpn(d, '1A42B2W00-600-G')['mpn_id'], self.m1a4.id)
        self.assertEqual(self.mpn(d, '789124-001')['board_qty'], 12)

    def test_al_resolves_to_the_existing_typo_chip_no_duplicate(self):
        m = self.mpn(self.draft(), '841631-001')
        ep = [c for c in m['chips'] if c['part'].startswith('EP4CE1')]
        self.assertEqual(len(ep), 1)
        self.assertTrue(ep[0]['exists'])

    def test_memory_class_adds_missing_alternates_opt_in_on_a_shared_mpn(self):
        m = self.mpn(self.draft(), '841631-001')
        added = {c['part']: c for c in m['chips'] if not c['exists']}
        self.assertEqual(set(added), {'D9MNQ'})                       # D9SFT, NT5TU64M16HG already there
        self.assertEqual((added['D9MNQ']['slot_group'], added['D9MNQ']['apply'], added['D9MNQ']['shared']),
                         ('1G', False, True))

    def test_2g_part_classified_from_dictionary(self):
        d = self.draft()
        self.assertEqual((self.line(d, 6)['capacity'], self.line(d, 6)['capacity_source']), ('2G', 'dictionary'))
        planned = {c['part']: c for c in self.mpn(d, '1A42B2W00-600-G')['chips'] if not c['exists']}
        self.assertEqual(planned['K4B2G1646Q-BCK0']['slot_group'], '2G')
        self.assertEqual((planned['AST2400']['brand'], planned['AST2400']['apply']), ('ASPEED', False))

    def test_lines_resolve_to_catalog_spelling(self):
        d = self.draft()
        self.assertEqual(self.line(d, 2)['part'], 'EP4CE1SF23C9LN')
        self.assertEqual(self.line(d, 5)['part'], 'NT5TU64M16HG')
        self.assertEqual({l['action'] for l in d['lines']}, {'fill'})

    def test_build_writes_nothing_and_previews_reconciliation(self):
        before = self.live_counts()
        d = self.draft()
        self.assertEqual(self.live_counts(), before)
        # Unticked shared additions: AST2400 / K4B2G1646Q-BCK0 lines name no chip on the pallet.
        self.assertEqual(d['check']['status'], 'mismatch')
        ticked = preview_check(self.pallet, self.tick_all(d))
        self.assertEqual(ticked['status'], 'ok')
        slots = {s['label']: (s['expected'], s['actual']) for s in ticked['slots']}
        self.assertEqual(slots['SLKM8'], (191, 191))
        self.assertEqual(slots['1G'], (160, 160))
        self.assertEqual(slots['2G'], (31, 31))
        self.assertEqual(self.live_counts(), before)

    def test_label_from_another_so_is_a_red_error(self):
        self.scan.transcription['label']['so_number'] = 'S06-000999'
        d = self.draft()
        self.assertTrue(any('S06-000999' in e for e in d['errors']))

    def test_weight_mismatch_is_yellow(self):
        self.pallet.in_weight_gross = Decimal('500')
        self.pallet.save()
        d = self.draft()
        self.assertTrue(d['label']['weight_mismatch'])
        self.assertEqual((d['label']['weight'], d['label']['stored_weight']), (575.0, 500.0))

    def test_unknown_pallet_lets_the_owner_pick(self):
        self.scan.transcription['label']['pallet_barcode'] = '06LP99999999-1'
        d = self.draft()
        self.assertIsNone(d['pallet_id'])
        self.assertEqual({o['id'] for o in d['pallet_options']}, {self.pallet.id, self.other.id})
        d2 = self.draft(pallet=self.pallet)
        self.assertEqual(d2['pallet_id'], self.pallet.id)
        self.assertEqual(len(d2['lines']), 7)

    def test_pallet_mpn_missing_from_sheet_is_flagged_not_removed(self):
        extra = MPN.objects.create(name='X898568')
        PalletMPN.objects.create(pallet=self.pallet, mpn=extra, board_qty=5)
        d = self.tick_all(self.draft())
        self.assertEqual([m['name'] for m in d['missing_pallet_mpns']], ['X898568'])
        apply_draft(self.pallet, d)
        self.assertTrue(PalletMPN.objects.filter(pallet=self.pallet, mpn=extra).exists())

    def test_existing_board_qty_differs_owner_picks(self):
        PalletMPN.objects.create(pallet=self.pallet, mpn=self.m841, board_qty=140)
        m = self.mpn(self.draft(), '841631-001')
        self.assertEqual((m['current_board_qty'], m['board_qty_choice']), (140, 'keep'))
        self.assertIn('board_qty', m['yellow'])

    def test_corrections_win_over_fuzzy_matching(self):
        ChecklistCorrection.record('mpn_name', 'BG00GH0', 'B600GH0')
        self.assertEqual(self.mpn(self.draft(), 'BG00GH0')['match'], 'correction')

    def test_unknown_part_is_yellow_with_suggestions(self):
        self.scan.transcription['lines'][0]['model_text'] = 'SLKN8'
        l1 = self.line(self.draft(), 1)
        self.assertIn('part', l1['yellow'])
        self.assertIn('SLKM8', l1['candidates'])


class ApplyDraftTests(Cl2Fixture):

    def test_apply_writes_boards_chips_and_lines(self):
        d = self.tick_all(self.draft())
        result = apply_draft(self.pallet, d)
        qty = dict(PalletMPN.objects.filter(pallet=self.pallet).values_list('mpn__name', 'board_qty'))
        self.assertEqual(qty, {'SP#841631-001': 147, 'SP#789124-001': 12, '1A4262W00-600-G': 31, 'B600GH0': 1})
        row2 = Checklist.objects.get(barcode=f'{self.barcode}-2')
        self.assertEqual((row2.model, row2.brand, row2.qty), ('EP4CE1SF23C9LN', 'ALTERA', 159))
        self.assertIsNotNone(row2.chip_id)
        self.assertTrue(Checklist.chip_allowed(self.pallet, row2.chip))
        self.assertTrue(ChipBrand.objects.filter(name='ASPEED').exists())
        self.assertEqual(Chip.objects.get(mpn=self.m1a4, chip_mpn='K4B2G1646Q-BCK0').slot_group, '2G')
        self.assertEqual(Pallet.objects.get(pk=self.pallet.pk).checklist_check()['status'], 'ok')
        self.assertEqual(result['filled'], 7)

    def test_unticked_shared_chip_is_not_added(self):
        apply_draft(self.pallet, self.draft())
        self.assertFalse(Chip.objects.filter(chip_mpn='AST2400').exists())
        row7 = Checklist.objects.get(barcode=f'{self.barcode}-7')
        self.assertEqual((row7.model, row7.chip_id), ('AST2400', None))     # free text, flagged by the check

    def test_weight_is_never_written(self):
        self.pallet.in_weight_gross = Decimal('500')
        self.pallet.save()
        apply_draft(self.pallet, self.draft())
        self.assertEqual(Pallet.objects.get(pk=self.pallet.pk).in_weight_gross, Decimal('500'))

    def test_new_mpn_is_created_with_its_chips_ticked(self):
        self.scan.transcription['header_groups'][3]['mpn_text'] = 'ZZ123456'
        d = self.draft()
        m = self.mpn(d, 'ZZ123456')
        self.assertEqual((m['mpn_id'], m['match'], m['new_name']), (None, 'new', 'ZZ123456'))
        self.assertTrue(all(c['apply'] for c in m['chips']))
        apply_draft(self.pallet, d)
        made = MPN.objects.get(name='ZZ123456')
        self.assertEqual(sorted(made.chips.values_list('chip_mpn', flat=True)),
                         ['D9MNQ', 'D9SFT', 'NT5TU64M16HG', 'SLKM8'])

    def test_conflicting_row_kept_unless_owner_chooses_sheet(self):
        Checklist.objects.filter(barcode=f'{self.barcode}-3').update(model='D9SFT', qty=10)
        d = self.draft()
        l3 = self.line(d, 3)
        self.assertEqual((l3['action'], l3['use_sheet'], l3['existing']['model']), ('conflict', False, 'D9SFT'))
        apply_draft(self.pallet, copy.deepcopy(d))
        self.assertEqual(Checklist.objects.get(barcode=f'{self.barcode}-3').qty, 10)
        # Re-applying the same draft is refused (its 'fill' rows are filled now) — rebuild.
        with self.assertRaises(DraftError):
            apply_draft(self.pallet, d)
        d2 = build_draft(self.scan, previous=d)
        self.assertEqual({l['action'] for l in d2['lines'] if l['index'] != 3}, {'same'})
        self.line(d2, 3)['use_sheet'] = True
        apply_draft(self.pallet, d2)
        row = Checklist.objects.get(barcode=f'{self.barcode}-3')
        self.assertEqual((row.model, row.qty), ('D9MNQ', 16))

    def test_same_content_is_skipped(self):
        Checklist.objects.filter(barcode=f'{self.barcode}-1').update(model='slkm8', qty=191)
        self.assertEqual(self.line(self.draft(), 1)['action'], 'same')

    def test_stale_draft_is_refused_and_writes_nothing(self):
        d = self.tick_all(self.draft())
        Checklist.objects.filter(barcode=f'{self.barcode}-3').update(model='D9SFT', qty=10)
        before = self.live_counts()
        with self.assertRaises(DraftError) as cm:
            apply_draft(self.pallet, d)
        self.assertEqual(cm.exception.status, 409)
        self.assertEqual(self.live_counts(), before)

    def test_tampered_draft_cannot_name_a_chip_off_the_pallet(self):
        d = self.draft()
        d['pallet_id'] = self.other.id
        with self.assertRaises(DraftError):
            apply_draft(self.pallet, d)


class MissedScanTests(Cl2Fixture):
    rows = 5

    def test_missing_trailing_rows_are_created_with_their_numbers(self):
        d = self.draft()
        self.assertEqual([self.line(d, i)['action'] for i in (6, 7)], ['create', 'create'])
        apply_draft(self.pallet, self.tick_all(d))
        self.assertEqual(Checklist.objects.get(barcode=f'{self.barcode}-7').model, 'AST2400')
        self.assertEqual(Checklist.next_index(self.pallet), 8)


class ExtraScanTests(Cl2Fixture):
    rows = 9

    def test_trailing_empty_rows_are_proposed_for_deletion_unticked(self):
        d = self.draft()
        self.assertEqual([r['index'] for r in d['delete_rows']], [8, 9])
        self.assertFalse(any(r['apply'] for r in d['delete_rows']))
        apply_draft(self.pallet, copy.deepcopy(d))
        self.assertEqual(self.pallet.checklists.count(), 9)
        for r in d['delete_rows']:
            r['apply'] = True
        apply_draft(Pallet.objects.get(pk=self.pallet.pk), self.build_again_with(d))
        self.assertEqual(self.pallet.checklists.count(), 7)

    def build_again_with(self, d):
        # The first apply filled #1–#7; a fresh draft sees them as 'same', ticks carry over.
        fresh = build_draft(self.scan, previous=d)
        self.assertTrue(all(r['apply'] for r in fresh['delete_rows']))
        return fresh

    def test_row_with_content_is_never_proposed_for_deletion(self):
        # #9 has content, so the empty #8 is a gap in the middle, not a trailing extra:
        # neither is offered for deletion, both are flagged.
        Checklist.objects.filter(barcode=f'{self.barcode}-9').update(model='X', qty=1)
        d = self.draft()
        self.assertEqual(d['delete_rows'], [])
        self.assertEqual([r['index'] for r in d['extra_rows']], [8, 9])


class GapTests(Cl2Fixture):
    rows = 3

    def test_non_contiguous_sheet_index_is_flagged_not_created(self):
        t = self.scan.transcription
        t['lines'] = [l for l in t['lines'] if l['index'] in (1, 2, 3, 6)]
        d = self.draft()
        self.assertEqual(self.line(d, 6)['action'], 'flag')
        apply_draft(self.pallet, d)
        self.assertEqual(self.pallet.checklists.count(), 3)
        self.line(d, 6)['action'] = 'create'            # a tampered body
        with self.assertRaises(DraftError):
            apply_draft(self.pallet, d)


class LearningTests(Cl2Fixture):

    def test_owner_changes_become_corrections(self):
        self.scan.transcription['lines'][0]['model_text'] = 'S2KM8'
        d = build_draft(self.scan)
        d2 = build_draft(self.scan, overrides={'lines': {'1': {'part': 'SLKM8'}},
                                               'capacity': {'K4B2G1646Q-BCK0': '2G'}}, previous=d)
        scan_draft.learn_from_confirm(d2)
        self.assertEqual(ChecklistCorrection.lookup('chip_model', 'S2KM8'), 'SLKM8')
        # accepted near-match MPN names are remembered too
        self.assertEqual(ChecklistCorrection.lookup('mpn_name', 'BG00GH0'), 'B600GH0')
