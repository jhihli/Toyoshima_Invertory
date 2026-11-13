"""Tests for the checklist-photo auto-fill feature (ChecklistScan & friends).

No test here may reach the Anthropic API: the model call lives in
product.scan_reader.read_sheet(), which every API-level test patches.
"""
import importlib
from datetime import date

from django.apps import apps as django_apps
from django.contrib.auth import get_user_model
from django.test import TestCase

from product.models import Vendor, SO, Pallet, MPN, Chip, ChipBrand


def api_client(role='admin'):
    from rest_framework.test import APIClient
    client = APIClient()
    user = get_user_model().objects.create_user(username=f'u-{role}', password='p', role=role)
    client.force_authenticate(user=user)
    return client


class SlotGroupRenameMigrationTests(TestCase):
    """Decision 1: memory slots are named by capacity. 'Memory' becomes '1G'."""

    def test_memory_becomes_1g_and_others_are_left_alone(self):
        mpn = MPN.objects.create(name='SP#841631-001')
        a = Chip.objects.create(mpn=mpn, chip_mpn='D9SFT', slot_group='Memory')
        b = Chip.objects.create(mpn=mpn, chip_mpn='D9MNQ', slot_group=' memory ')
        c = Chip.objects.create(mpn=mpn, chip_mpn='SLKM8', slot_group='')
        d = Chip.objects.create(mpn=mpn, chip_mpn='X1', slot_group='MEM2')
        mig = importlib.import_module('product.migrations.0057_memory_slot_group_to_1g')
        mig.rename_memory(django_apps, None)
        got = {x.chip_mpn: Chip.objects.get(pk=x.pk).slot_group for x in (a, b, c, d)}
        self.assertEqual(got, {'D9SFT': '1G', 'D9MNQ': '1G', 'SLKM8': '', 'X1': 'MEM2'})

    def test_catalog_carries_slot_group(self):
        mpn = MPN.objects.create(name='SP#841631-001')
        Chip.objects.create(mpn=mpn, chip_mpn='D9SFT', slot_group='1G')
        data = {d['chip_mpn']: d for d in api_client().get('/product/chips/catalog/').json()}
        self.assertEqual(data['D9SFT']['slot_group'], '1G')


class CorrectionTests(TestCase):
    """ChecklistCorrection: the owner-confirmed dictionary the reader learns from."""

    def test_seeded_capacity_classes_and_brand_abbrev(self):
        from product.models import ChecklistCorrection as CC
        self.assertEqual(CC.lookup('capacity_class', 'd9sft'), '1G')
        self.assertEqual(CC.lookup('capacity_class', 'D9MNQ'), '1G')
        self.assertEqual(CC.lookup('capacity_class', 'K4B1G1646G-BCH9'), '1G')
        self.assertEqual(CC.lookup('capacity_class', 'NT5TU64M16HG-AC'), '1G')
        self.assertEqual(CC.lookup('capacity_class', 'K4B2G1646Q-BCK0'), '2G')
        self.assertEqual(CC.lookup('brand_abbrev', 'AL'), 'ALTERA')
        self.assertIsNone(CC.lookup('capacity_class', 'SLKM8'))

    def test_lookup_is_handwriting_tolerant(self):
        from product.models import ChecklistCorrection as CC
        self.assertEqual(CC.lookup('capacity_class', 'D95FT'), '1G')   # S written as 5

    def test_record_upserts_and_counts(self):
        from product.models import ChecklistCorrection as CC
        CC.record('chip_model', 'S2km8', 'SLKM8')
        CC.record('chip_model', 's2KM8', 'SLKM8')
        row = CC.objects.get(kind='chip_model')
        self.assertEqual((row.count, row.resolved, CC.lookup('chip_model', 'S2KM8')), (2, 'SLKM8', 'SLKM8'))
        CC.record('chip_model', 'S2km8', 'SLKM9')        # the owner changed their mind
        self.assertEqual(CC.lookup('chip_model', 'S2km8'), 'SLKM9')

    def test_scan_staleness(self):
        from datetime import timedelta
        from django.utils import timezone
        from product.models import ChecklistScan
        so = SO.objects.create(so_number='S06-000979', vendor=Vendor.objects.create(name='MSFT'),
                               inbound_date=date(2026, 11, 1))
        s = ChecklistScan.objects.create(so=so, image='checklist_scans/x.jpg', status='processing',
                                         processing_started_at=timezone.now())
        self.assertFalse(s.is_stale)
        s.processing_started_at = timezone.now() - timedelta(minutes=11)
        self.assertTrue(s.is_stale)
        s.status = 'ready'
        self.assertFalse(s.is_stale)
