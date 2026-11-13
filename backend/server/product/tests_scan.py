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
