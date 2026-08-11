from datetime import date
import json

from django.test import TestCase, override_settings

from product.models import Vendor, SO, Pallet, Cargo


def make_pallet(so_number='SO112750', licence='hdh77', gateload='1'):
    vendor, _ = Vendor.objects.get_or_create(name='TestVendor')
    so = SO.objects.create(
        so_number=so_number, vendor=vendor, inbound_date=date(2026, 8, 10)
    )
    return Pallet.objects.create(
        so=so, pallet_seq=1, licence_number=licence,
        gateload_number=gateload, qty=1,
    )


class NextIndexTests(TestCase):
    def test_empty_pallet_starts_at_one(self):
        pallet = make_pallet()
        self.assertEqual(Cargo.next_index(pallet), 1)

    def test_counts_web_created_barcodes(self):
        pallet = make_pallet()
        Cargo.objects.create(pallet=pallet, barcode='SO112750-hdh77-1-C1')
        Cargo.objects.create(pallet=pallet, barcode='SO112750-hdh77-1-C2')
        self.assertEqual(Cargo.next_index(pallet), 3)

    def test_device_barcode_does_not_poison_next_index(self):
        """设备码为 C 的设备条码不得被当成 C 序号。"""
        pallet = make_pallet()
        Cargo.objects.create(pallet=pallet, barcode='SO112750-hdh77-1-C1')
        Cargo.objects.create(
            pallet=pallet, barcode='SO112750-hdh77-1-C20260810022801'
        )
        self.assertEqual(Cargo.next_index(pallet), 2)

    def test_device_barcode_with_seq_does_not_poison(self):
        pallet = make_pallet()
        Cargo.objects.create(
            pallet=pallet, barcode='SO112750-hdh77-1-C220260810022801'
        )
        self.assertEqual(Cargo.next_index(pallet), 1)

    def test_non_c_device_codes_are_ignored(self):
        pallet = make_pallet()
        Cargo.objects.create(
            pallet=pallet, barcode='SO112750-hdh77-1-A20260810022801'
        )
        self.assertEqual(Cargo.next_index(pallet), 1)


@override_settings(SCANNER_API_KEY='test-key')
class PalletLookupTests(TestCase):
    URL = '/product/scanner/pallets/lookup/'

    def test_requires_api_key(self):
        pallet = make_pallet()
        resp = self.client.get(self.URL, {'barcode': 'hdh77'})
        self.assertEqual(resp.status_code, 401)
        self.assertFalse(resp.json()['success'])

    def test_returns_pallet_fields(self):
        pallet = make_pallet()
        Cargo.objects.create(pallet=pallet, barcode='SO112750-hdh77-1-C1')
        resp = self.client.get(
            self.URL, {'barcode': 'hdh77'}, HTTP_X_API_KEY='test-key'
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()['data']
        self.assertEqual(data['pallet_id'], pallet.id)
        self.assertEqual(data['so_number'], 'SO112750')
        self.assertEqual(data['licence_number'], 'hdh77')
        self.assertEqual(data['gateload_number'], '1')
        self.assertEqual(data['existing_cargo_count'], 1)
        self.assertFalse(data['multiple_matches'])

    def test_missing_pallet_returns_404(self):
        resp = self.client.get(
            self.URL, {'barcode': 'nope'}, HTTP_X_API_KEY='test-key'
        )
        self.assertEqual(resp.status_code, 404)
        self.assertFalse(resp.json()['success'])

    def test_blank_barcode_returns_404(self):
        resp = self.client.get(self.URL, HTTP_X_API_KEY='test-key')
        self.assertEqual(resp.status_code, 404)

    def test_duplicate_licence_takes_newest_and_flags(self):
        older = make_pallet(so_number='SO-OLD')
        newer = make_pallet(so_number='SO-NEW')
        resp = self.client.get(
            self.URL, {'barcode': 'hdh77'}, HTTP_X_API_KEY='test-key'
        )
        data = resp.json()['data']
        self.assertEqual(data['pallet_id'], newer.id)
        self.assertTrue(data['multiple_matches'])


@override_settings(SCANNER_API_KEY='test-key')
class BulkCargoCreateTests(TestCase):
    def url(self, pallet):
        return f'/product/scanner/pallets/{pallet.id}/cargos/bulk/'

    def post(self, pallet, cargos, key='test-key'):
        return self.client.post(
            self.url(pallet), data=json.dumps({'cargos': cargos}),
            content_type='application/json', HTTP_X_API_KEY=key,
        )

    def test_requires_api_key(self):
        pallet = make_pallet()
        resp = self.client.post(
            self.url(pallet), data=json.dumps({'cargos': []}),
            content_type='application/json',
        )
        self.assertEqual(resp.status_code, 401)

    def test_stores_barcode_verbatim(self):
        pallet = make_pallet()
        bc = 'SO112750-hdh77-1-A20260810022801'
        resp = self.post(pallet, [{'barcode': bc, 'note': 'x'}])
        self.assertEqual(resp.status_code, 200)
        data = resp.json()['data']
        self.assertEqual([c['barcode'] for c in data['created']], [bc])
        self.assertEqual(data['skipped'], [])
        saved = Cargo.objects.get(pallet=pallet)
        self.assertEqual(saved.barcode, bc)
        self.assertEqual(saved.note, 'x')

    def test_skips_duplicates_idempotently(self):
        pallet = make_pallet()
        bc = 'SO112750-hdh77-1-A20260810022801'
        self.post(pallet, [{'barcode': bc}])
        resp = self.post(pallet, [{'barcode': bc}])
        data = resp.json()['data']
        self.assertEqual(data['created'], [])
        self.assertEqual(data['skipped'], [bc])
        self.assertEqual(Cargo.objects.filter(pallet=pallet).count(), 1)

    def test_mixed_batch(self):
        pallet = make_pallet()
        old = 'SO112750-hdh77-1-A20260810022801'
        new = 'SO112750-hdh77-1-A20260810022802'
        self.post(pallet, [{'barcode': old}])
        resp = self.post(pallet, [{'barcode': old}, {'barcode': new}])
        data = resp.json()['data']
        self.assertEqual([c['barcode'] for c in data['created']], [new])
        self.assertEqual(data['skipped'], [old])

    def test_duplicates_within_one_request_collapse(self):
        pallet = make_pallet()
        bc = 'SO112750-hdh77-1-A20260810022801'
        resp = self.post(pallet, [{'barcode': bc}, {'barcode': bc}])
        data = resp.json()['data']
        self.assertEqual(len(data['created']), 1)
        self.assertEqual(data['skipped'], [bc])
        self.assertEqual(Cargo.objects.filter(pallet=pallet).count(), 1)

    def test_empty_list_is_success(self):
        pallet = make_pallet()
        resp = self.post(pallet, [])
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()['data'], {'created': [], 'skipped': []})

    def test_blank_barcode_rejected(self):
        pallet = make_pallet()
        resp = self.post(pallet, [{'barcode': '  '}])
        self.assertEqual(resp.status_code, 400)
        self.assertFalse(resp.json()['success'])

    def test_unknown_pallet_returns_404(self):
        resp = self.client.post(
            '/product/scanner/pallets/999999/cargos/bulk/',
            data=json.dumps({'cargos': []}),
            content_type='application/json', HTTP_X_API_KEY='test-key',
        )
        self.assertEqual(resp.status_code, 404)
        self.assertFalse(resp.json()['success'])

    def test_bare_string_element_rejected(self):
        pallet = make_pallet()
        resp = self.client.post(
            self.url(pallet), data=json.dumps({'cargos': ['bare-string']}),
            content_type='application/json', HTTP_X_API_KEY='test-key',
        )
        self.assertEqual(resp.status_code, 400)
        self.assertFalse(resp.json()['success'])
        self.assertIn('object', resp.json()['error'].lower())

    def test_list_element_rejected(self):
        pallet = make_pallet()
        resp = self.client.post(
            self.url(pallet), data=json.dumps({'cargos': [['list', 'item']]}),
            content_type='application/json', HTTP_X_API_KEY='test-key',
        )
        self.assertEqual(resp.status_code, 400)
        self.assertFalse(resp.json()['success'])
        self.assertIn('object', resp.json()['error'].lower())

    def test_non_string_barcode_rejected(self):
        pallet = make_pallet()
        resp = self.client.post(
            self.url(pallet), data=json.dumps({'cargos': [{'barcode': 123}]}),
            content_type='application/json', HTTP_X_API_KEY='test-key',
        )
        self.assertEqual(resp.status_code, 400)
        self.assertFalse(resp.json()['success'])
        self.assertIn('string', resp.json()['error'].lower())


@override_settings(SCANNER_API_KEY='test-key')
class ScannerCargoListTests(TestCase):
    def url(self, pallet):
        return f'/product/scanner/pallets/{pallet.id}/cargos/'

    def test_requires_api_key(self):
        pallet = make_pallet()
        self.assertEqual(self.client.get(self.url(pallet)).status_code, 401)

    def test_lists_cargos(self):
        pallet = make_pallet()
        Cargo.objects.create(pallet=pallet, barcode='SO112750-hdh77-1-A20260810022801', note='n')
        Cargo.objects.create(pallet=pallet, barcode='SO112750-hdh77-1-B20260810022802')
        resp = self.client.get(self.url(pallet), HTTP_X_API_KEY='test-key')
        self.assertEqual(resp.status_code, 200)
        cargos = resp.json()['data']['cargos']
        self.assertEqual(len(cargos), 2)
        self.assertEqual(cargos[0]['barcode'], 'SO112750-hdh77-1-A20260810022801')
        self.assertEqual(cargos[0]['note'], 'n')
        self.assertIn('created_at', cargos[0])

    def test_empty_pallet(self):
        pallet = make_pallet()
        resp = self.client.get(self.url(pallet), HTTP_X_API_KEY='test-key')
        self.assertEqual(resp.json()['data']['cargos'], [])

    def test_unknown_pallet_returns_404(self):
        resp = self.client.get(
            '/product/scanner/pallets/999999/cargos/', HTTP_X_API_KEY='test-key'
        )
        self.assertEqual(resp.status_code, 404)
        self.assertFalse(resp.json()['success'])
