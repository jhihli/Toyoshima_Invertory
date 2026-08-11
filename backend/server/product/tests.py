from datetime import date

from django.test import TestCase

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
