"""Scoring of the checklist-photo eval (no API calls: transcriptions are hand-made)."""
from datetime import date

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import override_settings
from django.test import SimpleTestCase, TestCase

from product.management.commands.eval_checklist_scans import EXPECTED, score
from product.models import Vendor, SO, Pallet, MPN, Chip, ChipBrand, Checklist, ChecklistScan
from product.scan_draft import build_draft, preview_check, apply_draft


def perfect(name):
    """A transcription that says exactly what the expected answer says."""
    e = EXPECTED[name]
    return {
        'label': {'so_number': e['so_number'], 'pallet_barcode': e['pallet_barcode'],
                  'weight_text': f"{e['weight']} LB", 'confidence': 'high'},
        'header_groups': [{'mpn_text': g['mpn'][0], 'mpn_confidence': 'high', 'board_qty': g['board_qty'],
                           'board_qty_confidence': 'high',
                           'items': [{'text': i, 'confidence': 'high'} for i in g['items']]}
                          for g in e['groups']],
        'lines': [{'index': l['index'], 'column': 'left', 'brand_text': l.get('brand', ''),
                   'model_text': l['model'][0], 'model_confidence': 'high', 'qty': l['qty'],
                   'qty_confidence': 'high', 'model_candidates': []} for l in e['lines']],
        'notes': '',
    }


class EvalScoringTests(SimpleTestCase):

    def test_perfect_reading_scores_full_marks(self):
        for name in EXPECTED:
            s = score(EXPECTED[name], perfect(name))
            for field, (ok, total) in s.items():
                self.assertEqual(ok, total, f'{name} {field}')

    def test_mistakes_are_counted_per_field(self):
        t = perfect('cl2')
        t['lines'][0]['qty'] = 190                    # #1 SLKM8 191 → 190
        t['lines'][4]['model_text'] = 'NT5TU64M16HG'   # suffix dropped: still the same part
        t['lines'][5]['model_text'] = 'K4B1G1646Q-BCK0'  # wrong part
        t['header_groups'][0]['board_qty'] = 141
        del t['lines'][6]                             # #7 missed
        s = score(EXPECTED['cl2'], t)
        self.assertEqual(s['line_qty'], (5, 7))
        self.assertEqual(s['line_model'], (5, 7))
        self.assertEqual(s['group_board_qty'], (3, 4))
        self.assertEqual(s['line_index'], (6, 7))

    def test_alternative_expected_spellings_accepted(self):
        t = perfect('cl2')
        t['header_groups'][3]['mpn_text'] = 'B600GH0'  # cl2 'BG00GH0' may really be B600GH0
        self.assertEqual(score(EXPECTED['cl2'], t)['group_mpn'], (4, 4))

    @override_settings(CHECKLIST_SCAN_BACKEND='anthropic')
    def test_refuses_to_spend_without_yes(self):
        with self.assertRaises(CommandError):
            call_command('eval_checklist_scans', '--dir', '.')


class AllSamplesReconcileTests(TestCase):
    """The design doc: 'All four samples reconcile exactly.' Each expected reading, built
    into a draft against a production-shaped database (stored names with SP#, the
    EP4CE1SF23C9LN typo, NT5TU64M16HG without -AC, blank checklist rows #1–#n) and with
    every planned chip addition ticked, must preview as checklist_check() 'ok'."""

    def setUp(self):
        vendor = Vendor.objects.create(name='MSFT')
        self.so = SO.objects.create(so_number='S06-000979', vendor=vendor, inbound_date=date(2026, 11, 1))
        altera = ChipBrand.objects.create(name='ALTERA')
        mem = ('K4B1G1646G-BCH9', 'D9SFT', 'D9MNQ', 'NT5TU64M16HG')
        for name in ('SP#841631-001', 'SP#789124-001', 'x898568', '1A4262W00-600-G', 'B600GH0',
                     'B696401852188010', 'B696402852261010'):
            m = MPN.objects.create(name=name)
            Chip.objects.create(mpn=m, chip_mpn='SLKM8')
            if name.startswith(('SP#841631', 'SP#789124')):
                Chip.objects.create(mpn=m, chip_mpn='EP4CE1SF23C9LN', brand=altera)
            if name != '1A4262W00-600-G':
                for p in mem:
                    Chip.objects.create(mpn=m, chip_mpn=p, slot_group='1G', item_group='Memory')

    def pallet_for(self, barcode, rows):
        licence, gateload = barcode.rsplit('-', 1)
        p = Pallet.objects.create(so=self.so, pallet_seq=Pallet.objects.count() + 1, licence_number=licence,
                                  gateload_number=gateload, qty=1)
        for i in range(1, rows + 1):
            Checklist.objects.create(pallet=p, barcode=f'{p.compose_barcode()}-{i}')
        return p

    def test_every_sample_reconciles(self):
        for name, e in EXPECTED.items():
            with self.subTest(name):
                pallet = self.pallet_for(e['pallet_barcode'], len(e['lines']))
                scan = ChecklistScan.objects.create(so=self.so, image=f'checklist_scans/{name}.jpg',
                                                    status='ready', transcription=perfect(name))
                d = build_draft(scan)
                self.assertEqual(d['pallet_id'], pallet.id)
                self.assertEqual(d['errors'], [])
                self.assertTrue(all(m['mpn_id'] or m['new_name'] for m in d['mpns']))
                for m in d['mpns']:
                    for c in m['chips']:
                        c['apply'] = True
                check = preview_check(pallet, d)
                self.assertEqual(check['status'], 'ok', (name, check))
                apply_draft(pallet, d)
                self.assertEqual(Pallet.objects.get(pk=pallet.pk).checklist_check()['status'], 'ok')
