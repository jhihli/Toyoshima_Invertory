from datetime import date

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
