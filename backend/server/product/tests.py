from datetime import date, datetime
import json

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings

from product.models import Vendor, SO, Pallet, Box, Checklist, MPN, Chip, ChipBrand, PalletMPN


def make_pallet(so_number='SO112750', licence='hdh77', gateload='1'):
    vendor, _ = Vendor.objects.get_or_create(name='TestVendor')
    so = SO.objects.create(
        so_number=so_number, vendor=vendor, inbound_date=date(2026, 8, 10)
    )
    return Pallet.objects.create(
        so=so, pallet_seq=1, licence_number=licence,
        gateload_number=gateload, qty=1,
    )


class PalletBarcodeTests(TestCase):
    def test_all_three_segments(self):
        self.assertEqual(make_pallet().compose_barcode(), 'SO112750-hdh77-1')

    def test_blank_gateload_is_skipped(self):
        self.assertEqual(make_pallet(gateload='').compose_barcode(), 'SO112750-hdh77')

    def test_so_only(self):
        """流程②：客户只给 SO，licence/gateload 为空时不留下悬空的连字符。"""
        self.assertEqual(
            make_pallet(licence='', gateload='').compose_barcode(), 'SO112750'
        )

    def test_box_label_is_the_pallet_label(self):
        pallet = make_pallet()
        self.assertEqual(Box.compose_barcode(pallet), 'SO112750-hdh77-1')


class ChecklistNextIndexTests(TestCase):
    def test_empty_pallet_starts_at_one(self):
        self.assertEqual(Checklist.next_index(make_pallet()), 1)

    def test_continues_from_the_highest_used(self):
        pallet = make_pallet()
        Checklist.objects.create(pallet=pallet, barcode='SO112750-hdh77-1-1')
        Checklist.objects.create(pallet=pallet, barcode='SO112750-hdh77-1-2')
        self.assertEqual(Checklist.next_index(pallet), 3)

    def test_survives_a_pallet_relabel(self):
        """序号从条码末尾读，托盘的 licence 后来被改也不会重号。"""
        pallet = make_pallet()
        Checklist.objects.create(pallet=pallet, barcode='SO112750-hdh77-1-1')
        pallet.licence_number = 'newlic'
        pallet.save()
        self.assertEqual(Checklist.next_index(pallet), 2)
        self.assertEqual(
            Checklist.compose_barcode(pallet, 2), 'SO112750-newlic-1-2'
        )

    def test_non_numeric_tail_ignored(self):
        pallet = make_pallet()
        Checklist.objects.create(pallet=pallet, barcode='SO112750-hdh77-1-X')
        self.assertEqual(Checklist.next_index(pallet), 1)

    def test_numbering_is_per_pallet(self):
        a = make_pallet(so_number='SO-A')
        b = make_pallet(so_number='SO-B')
        Checklist.objects.create(pallet=a, barcode='SO-A-hdh77-1-7')
        self.assertEqual(Checklist.next_index(b), 1)


@override_settings(SCANNER_API_KEY='test-key')
class PalletLookupTests(TestCase):
    URL = '/product/scanner/pallets/lookup/'

    def test_requires_api_key(self):
        make_pallet()
        resp = self.client.get(self.URL, {'barcode': 'hdh77'})
        self.assertEqual(resp.status_code, 401)
        self.assertFalse(resp.json()['success'])

    def test_returns_pallet_fields(self):
        pallet = make_pallet()
        Box.objects.create(pallet=pallet, barcode='SO112750-hdh77-1')
        Checklist.objects.create(pallet=pallet, barcode='SO112750-hdh77-1-1')
        resp = self.client.get(
            self.URL, {'barcode': 'hdh77'}, HTTP_X_API_KEY='test-key'
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()['data']
        self.assertEqual(data['pallet_id'], pallet.id)
        self.assertEqual(data['so_number'], 'SO112750')
        self.assertEqual(data['licence_number'], 'hdh77')
        self.assertEqual(data['gateload_number'], '1')
        self.assertEqual(data['pallet_barcode'], 'SO112750-hdh77-1')
        self.assertEqual(data['existing_box_count'], 1)
        self.assertEqual(data['existing_checklist_count'], 1)
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
        make_pallet(so_number='SO-OLD')
        newer = make_pallet(so_number='SO-NEW')
        resp = self.client.get(
            self.URL, {'barcode': 'hdh77'}, HTTP_X_API_KEY='test-key'
        )
        data = resp.json()['data']
        self.assertEqual(data['pallet_id'], newer.id)
        self.assertTrue(data['multiple_matches'])


@override_settings(SCANNER_API_KEY='test-key')
class BulkBoxCreateTests(TestCase):
    """数量补齐语义：len(boxes) 是设备认为的总箱数，服务器只增不减。"""

    def url(self, pallet):
        return f'/product/scanner/pallets/{pallet.id}/boxes/bulk/'

    def post(self, pallet, boxes, key='test-key'):
        return self.client.post(
            self.url(pallet), data=json.dumps({'boxes': boxes}),
            content_type='application/json', HTTP_X_API_KEY=key,
        )

    def test_requires_api_key(self):
        pallet = make_pallet()
        resp = self.client.post(
            self.url(pallet), data=json.dumps({'boxes': []}),
            content_type='application/json',
        )
        self.assertEqual(resp.status_code, 401)

    def test_creates_up_to_the_reported_count(self):
        pallet = make_pallet()
        resp = self.post(pallet, [{'note': 'a'}, {'note': 'b'}, {'note': 'c'}])
        self.assertEqual(resp.status_code, 200)
        data = resp.json()['data']
        self.assertEqual(len(data['created']), 3)
        self.assertEqual(data['total'], 3)
        self.assertEqual(Box.objects.filter(pallet=pallet).count(), 3)
        self.assertEqual(
            list(Box.objects.filter(pallet=pallet).values_list('note', flat=True)),
            ['a', 'b', 'c'],
        )

    def test_every_box_carries_the_pallet_barcode(self):
        pallet = make_pallet()
        self.post(pallet, [{}, {}])
        self.assertEqual(
            list(Box.objects.filter(pallet=pallet).values_list('barcode', flat=True)),
            ['SO112750-hdh77-1', 'SO112750-hdh77-1'],
        )

    def test_client_supplied_barcode_is_ignored(self):
        """条码由服务器统一组装，设备传什么都不算数——否则两边各拼一次迟早拼不一样。"""
        pallet = make_pallet()
        self.post(pallet, [{'barcode': 'device-made-this-up'}])
        self.assertEqual(
            Box.objects.get(pallet=pallet).barcode, 'SO112750-hdh77-1'
        )

    def test_repeat_upload_is_a_noop(self):
        pallet = make_pallet()
        self.post(pallet, [{}, {}])
        resp = self.post(pallet, [{}, {}])
        data = resp.json()['data']
        self.assertEqual(data['created'], [])
        self.assertEqual(data['total'], 2)
        self.assertEqual(Box.objects.filter(pallet=pallet).count(), 2)

    def test_tops_up_the_difference_only(self):
        pallet = make_pallet()
        self.post(pallet, [{}, {}])
        resp = self.post(pallet, [{}, {}, {'note': 'third'}])
        data = resp.json()['data']
        self.assertEqual(len(data['created']), 1)
        self.assertEqual(len(data['skipped']), 2)
        self.assertEqual(data['total'], 3)
        newest = Box.objects.filter(pallet=pallet).order_by('id').last()
        self.assertEqual(newest.note, 'third')

    def test_smaller_upload_never_deletes(self):
        pallet = make_pallet()
        self.post(pallet, [{}, {}, {}])
        resp = self.post(pallet, [{}])
        self.assertEqual(resp.json()['data']['total'], 3)
        self.assertEqual(Box.objects.filter(pallet=pallet).count(), 3)

    def test_legacy_suffixed_rows_count_toward_the_total(self):
        """旧的 -C{n} 行仍然算箱数，不会被再补一遍。"""
        pallet = make_pallet()
        Box.objects.create(pallet=pallet, barcode='SO112750-hdh77-1-C1')
        Box.objects.create(pallet=pallet, barcode='SO112750-hdh77-1-C2')
        resp = self.post(pallet, [{}, {}, {}])
        self.assertEqual(len(resp.json()['data']['created']), 1)
        self.assertEqual(Box.objects.filter(pallet=pallet).count(), 3)

    def test_empty_list_is_success(self):
        pallet = make_pallet()
        resp = self.post(pallet, [])
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(
            resp.json()['data'], {'created': [], 'skipped': [], 'total': 0}
        )

    def test_unknown_pallet_returns_404(self):
        resp = self.client.post(
            '/product/scanner/pallets/999999/boxes/bulk/',
            data=json.dumps({'boxes': []}),
            content_type='application/json', HTTP_X_API_KEY='test-key',
        )
        self.assertEqual(resp.status_code, 404)
        self.assertFalse(resp.json()['success'])

    def test_bare_string_element_rejected(self):
        pallet = make_pallet()
        resp = self.client.post(
            self.url(pallet), data=json.dumps({'boxes': ['bare-string']}),
            content_type='application/json', HTTP_X_API_KEY='test-key',
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn('object', resp.json()['error'].lower())

    def test_list_element_rejected(self):
        pallet = make_pallet()
        resp = self.client.post(
            self.url(pallet), data=json.dumps({'boxes': [['list', 'item']]}),
            content_type='application/json', HTTP_X_API_KEY='test-key',
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn('object', resp.json()['error'].lower())

    def test_non_string_note_rejected(self):
        pallet = make_pallet()
        resp = self.client.post(
            self.url(pallet), data=json.dumps({'boxes': [{'note': 123}]}),
            content_type='application/json', HTTP_X_API_KEY='test-key',
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn('string', resp.json()['error'].lower())

    def test_top_level_array_body_rejected_not_500(self):
        """A top-level JSON array makes request.data a list, which has no
        .get(). Must be caught and answered with the {"success": ...}
        envelope, not surfaced as an unhandled 500."""
        pallet = make_pallet()
        resp = self.client.post(
            self.url(pallet), data=json.dumps([{'note': 'x'}]),
            content_type='application/json', HTTP_X_API_KEY='test-key',
        )
        self.assertEqual(resp.status_code, 400)
        self.assertFalse(resp.json()['success'])


@override_settings(SCANNER_API_KEY='test-key')
class ScannerBoxListTests(TestCase):
    def url(self, pallet):
        return f'/product/scanner/pallets/{pallet.id}/boxes/'

    def test_requires_api_key(self):
        pallet = make_pallet()
        self.assertEqual(self.client.get(self.url(pallet)).status_code, 401)

    def test_lists_boxes(self):
        pallet = make_pallet()
        Box.objects.create(pallet=pallet, barcode='SO112750-hdh77-1', note='n')
        Box.objects.create(pallet=pallet, barcode='SO112750-hdh77-1')
        resp = self.client.get(self.url(pallet), HTTP_X_API_KEY='test-key')
        self.assertEqual(resp.status_code, 200)
        boxes = resp.json()['data']['boxes']
        self.assertEqual(len(boxes), 2)
        self.assertEqual(boxes[0]['barcode'], 'SO112750-hdh77-1')
        self.assertEqual(boxes[0]['note'], 'n')
        # Pin the wire format: it must be a timezone-aware ISO-8601 string
        # (USE_TZ=True / TIME_ZONE='UTC' means this is really UTC, not
        # local time) so the Dart client's DateTime.parse(...).toLocal()
        # contract has something real to parse.
        parsed = datetime.fromisoformat(boxes[0]['created_at'])
        self.assertIsNotNone(parsed.tzinfo)
        self.assertIsNotNone(parsed.tzinfo.utcoffset(parsed))

    def test_empty_pallet(self):
        pallet = make_pallet()
        resp = self.client.get(self.url(pallet), HTTP_X_API_KEY='test-key')
        self.assertEqual(resp.json()['data']['boxes'], [])

    def test_unknown_pallet_returns_404(self):
        resp = self.client.get(
            '/product/scanner/pallets/999999/boxes/', HTTP_X_API_KEY='test-key'
        )
        self.assertEqual(resp.status_code, 404)
        self.assertFalse(resp.json()['success'])


@override_settings(SCANNER_API_KEY='test-key')
class ScannerChecklistCreateTests(TestCase):
    def url(self, pallet):
        return f'/product/scanner/pallets/{pallet.id}/checklists/bulk/'

    def post(self, pallet, body, key='test-key'):
        return self.client.post(
            self.url(pallet), data=json.dumps(body),
            content_type='application/json', HTTP_X_API_KEY=key,
        )

    def test_requires_api_key(self):
        pallet = make_pallet()
        resp = self.client.post(
            self.url(pallet), data=json.dumps({'count': 1}),
            content_type='application/json',
        )
        self.assertEqual(resp.status_code, 401)

    def test_server_composes_sequential_barcodes(self):
        pallet = make_pallet()
        resp = self.post(pallet, {'items': [{}, {}, {}]})
        self.assertEqual(resp.status_code, 200)
        rows = resp.json()['data']['checklists']
        self.assertEqual(
            [r['barcode'] for r in rows],
            ['SO112750-hdh77-1-1', 'SO112750-hdh77-1-2', 'SO112750-hdh77-1-3'],
        )

    def test_second_call_continues_the_sequence(self):
        pallet = make_pallet()
        self.post(pallet, {'items': [{}, {}]})
        resp = self.post(pallet, {'items': [{}]})
        self.assertEqual(
            [r['barcode'] for r in resp.json()['data']['checklists']],
            ['SO112750-hdh77-1-3'],
        )

    def test_stores_brand_model_qty(self):
        pallet = make_pallet()
        resp = self.post(pallet, {'items': [
            {'brand': 'Dell', 'model': 'OptiPlex 7010', 'qty': 12},
        ]})
        row = resp.json()['data']['checklists'][0]
        self.assertEqual(row['brand'], 'Dell')
        self.assertEqual(row['model'], 'OptiPlex 7010')
        self.assertEqual(row['qty'], 12)

    def test_all_three_fields_are_optional(self):
        pallet = make_pallet()
        row = self.post(pallet, {'items': [{}]}).json()['data']['checklists'][0]
        self.assertEqual(row['brand'], '')
        self.assertEqual(row['model'], '')
        self.assertIsNone(row['qty'])

    def test_count_shorthand_creates_blank_rows(self):
        pallet = make_pallet()
        resp = self.post(pallet, {'count': 2})
        self.assertEqual(len(resp.json()['data']['checklists']), 2)

    def test_neither_items_nor_count_rejected(self):
        pallet = make_pallet()
        resp = self.post(pallet, {})
        self.assertEqual(resp.status_code, 400)
        self.assertFalse(resp.json()['success'])

    def test_empty_items_rejected(self):
        pallet = make_pallet()
        resp = self.post(pallet, {'items': []})
        self.assertEqual(resp.status_code, 400)

    def test_bare_string_item_rejected(self):
        pallet = make_pallet()
        resp = self.post(pallet, {'items': ['bare-string']})
        self.assertEqual(resp.status_code, 400)
        self.assertIn('object', resp.json()['error'].lower())

    def test_non_string_brand_rejected(self):
        pallet = make_pallet()
        resp = self.post(pallet, {'items': [{'brand': 123}]})
        self.assertEqual(resp.status_code, 400)
        self.assertIn('string', resp.json()['error'].lower())

    def test_unparseable_qty_stored_as_null(self):
        pallet = make_pallet()
        row = self.post(
            pallet, {'items': [{'qty': 'abc'}]}
        ).json()['data']['checklists'][0]
        self.assertIsNone(row['qty'])

    def test_top_level_array_body_rejected_not_500(self):
        pallet = make_pallet()
        resp = self.client.post(
            self.url(pallet), data=json.dumps([{'brand': 'Dell'}]),
            content_type='application/json', HTTP_X_API_KEY='test-key',
        )
        self.assertEqual(resp.status_code, 400)
        self.assertFalse(resp.json()['success'])

    def test_unknown_pallet_returns_404(self):
        resp = self.client.post(
            '/product/scanner/pallets/999999/checklists/bulk/',
            data=json.dumps({'count': 1}),
            content_type='application/json', HTTP_X_API_KEY='test-key',
        )
        self.assertEqual(resp.status_code, 404)
        self.assertFalse(resp.json()['success'])


@override_settings(SCANNER_API_KEY='test-key')
class ScannerChecklistListTests(TestCase):
    def url(self, pallet):
        return f'/product/scanner/pallets/{pallet.id}/checklists/'

    def test_requires_api_key(self):
        pallet = make_pallet()
        self.assertEqual(self.client.get(self.url(pallet)).status_code, 401)

    def test_lists_checklists(self):
        pallet = make_pallet()
        Checklist.objects.create(
            pallet=pallet, barcode='SO112750-hdh77-1-1', brand='Dell', qty=4
        )
        resp = self.client.get(self.url(pallet), HTTP_X_API_KEY='test-key')
        self.assertEqual(resp.status_code, 200)
        rows = resp.json()['data']['checklists']
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['barcode'], 'SO112750-hdh77-1-1')
        self.assertEqual(rows[0]['brand'], 'Dell')
        self.assertEqual(rows[0]['qty'], 4)
        parsed = datetime.fromisoformat(rows[0]['created_at'])
        self.assertIsNotNone(parsed.tzinfo)

    def test_empty_pallet(self):
        pallet = make_pallet()
        resp = self.client.get(self.url(pallet), HTTP_X_API_KEY='test-key')
        self.assertEqual(resp.json()['data']['checklists'], [])

    def test_unknown_pallet_returns_404(self):
        resp = self.client.get(
            '/product/scanner/pallets/999999/checklists/',
            HTTP_X_API_KEY='test-key',
        )
        self.assertEqual(resp.status_code, 404)
        self.assertFalse(resp.json()['success'])


class DeletionSemanticsTests(TestCase):
    """Pins what deleting rows does across the Pallet -> Box / Checklist edges.

    These are deliberate product decisions, not accidents of the schema — if one of
    these tests starts failing, the behaviour was changed, not fixed.
    """

    def _stock(self, pallet, boxes=3, labels=5):
        for _ in range(boxes):
            Box.objects.create(pallet=pallet, barcode=Box.compose_barcode(pallet))
        for n in range(1, labels + 1):
            Checklist.objects.create(pallet=pallet, barcode=Checklist.compose_barcode(pallet, n))

    def test_deleting_every_box_leaves_the_checklist_intact(self):
        """清單 挂在 Pallet 而不是 Box：切完之后箱子已经拆开了,
        贴在切出来的料上的标签不是箱子的子记录。"""
        pallet = make_pallet()
        self._stock(pallet)
        pallet.boxes.all().delete()
        self.assertEqual(pallet.boxes.count(), 0)
        self.assertEqual(pallet.checklists.count(), 5)

    def test_deleting_boxes_does_not_disturb_checklist_numbering(self):
        pallet = make_pallet()
        self._stock(pallet)
        pallet.boxes.all().delete()
        self.assertEqual(Checklist.next_index(pallet), 6)

    def test_checklist_numbers_are_reused_after_deletion(self):
        """Deliberate: 删除一行 = 这张标签作废(打错了、没发出去),
        号码收回重用。前提是工人只在标签贴出去之前删。"""
        pallet = make_pallet()
        self._stock(pallet)
        pallet.checklists.filter(barcode__endswith='-5').delete()
        pallet.checklists.filter(barcode__endswith='-4').delete()
        self.assertEqual(Checklist.next_index(pallet), 4)

        pallet.checklists.all().delete()
        self.assertEqual(Checklist.next_index(pallet), 1)

    def test_deleting_the_pallet_cascades_to_both(self):
        pallet = make_pallet()
        self._stock(pallet)
        pallet.delete()
        self.assertEqual(Box.objects.count(), 0)
        self.assertEqual(Checklist.objects.count(), 0)


class MpnStatusTests(TestCase):
    """Current / Finished lifecycle on MPN: the ?status= filter and the bulk move."""

    def setUp(self):
        from rest_framework.test import APIClient
        User = get_user_model()
        self.user = User.objects.create_user(username='u', password='p')
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_list_filters_by_status(self):
        MPN.objects.create(name='CUR')
        MPN.objects.create(name='FIN', is_finished=True)
        # No param → everything (unchanged, backward compatible)
        resp = self.client.get('/product/mpns/')
        self.assertEqual({m['name'] for m in resp.json()}, {'CUR', 'FIN'})
        # Current only
        resp = self.client.get('/product/mpns/', {'status': 'current'})
        self.assertEqual({m['name'] for m in resp.json()}, {'CUR'})
        # Finished only
        resp = self.client.get('/product/mpns/', {'status': 'finished'})
        self.assertEqual({m['name'] for m in resp.json()}, {'FIN'})

    def test_serializer_exposes_is_finished(self):
        MPN.objects.create(name='X', is_finished=True)
        row = self.client.get('/product/mpns/', {'status': 'finished'}).json()[0]
        self.assertTrue(row['is_finished'])

    def test_bulk_status_moves_only_the_named_ids(self):
        a = MPN.objects.create(name='A')
        b = MPN.objects.create(name='B')
        c = MPN.objects.create(name='C')
        resp = self.client.post(
            '/product/mpns/bulk-status/',
            {'ids': [a.id, b.id], 'is_finished': True}, format='json',
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()['updated'], 2)
        a.refresh_from_db(); b.refresh_from_db(); c.refresh_from_db()
        self.assertTrue(a.is_finished)
        self.assertTrue(b.is_finished)
        self.assertFalse(c.is_finished)

    def test_bulk_status_moves_back_to_current(self):
        a = MPN.objects.create(name='A', is_finished=True)
        self.client.post(
            '/product/mpns/bulk-status/',
            {'ids': [a.id], 'is_finished': False}, format='json',
        )
        a.refresh_from_db()
        self.assertFalse(a.is_finished)

    def test_bulk_status_requires_auth(self):
        a = MPN.objects.create(name='A')
        self.client.force_authenticate(user=None)
        resp = self.client.post(
            '/product/mpns/bulk-status/',
            {'ids': [a.id], 'is_finished': True}, format='json',
        )
        self.assertIn(resp.status_code, (401, 403))

    def test_bulk_status_rejects_empty_ids(self):
        resp = self.client.post(
            '/product/mpns/bulk-status/',
            {'ids': [], 'is_finished': True}, format='json',
        )
        self.assertEqual(resp.status_code, 400)

    def test_bulk_status_rejects_non_boolean_flag(self):
        a = MPN.objects.create(name='A')
        resp = self.client.post(
            '/product/mpns/bulk-status/',
            {'ids': [a.id], 'is_finished': 'yes'}, format='json',
        )
        self.assertEqual(resp.status_code, 400)


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
        Pallet.objects.create(so=self.so, pallet_seq=3, qty=1, board_qty=7)
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

    @override_settings(SCANNER_API_KEY='k')
    def test_scanner_bulk_ignores_chip(self):
        resp = self.client.post(f'/product/scanner/pallets/{self.p24.id}/checklists/bulk/',
                                {'items': [{'brand': 'B', 'model': 'M', 'chip': self.chip.id}]},
                                format='json', HTTP_X_API_KEY='k')
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(Checklist.objects.filter(chip=self.chip).exists())


class BoardRemovedTests(TestCase):
    def test_board_routes_gone(self):
        from django.urls import resolve, Resolver404
        for path in ('/product/sos/1/boards/', '/product/sos/1/boards/bulk/', '/product/boards/1/',
                     '/product/boards/1/photo/', '/product/boards/1/chips/', '/product/scanner/boards/1/photo/'):
            with self.assertRaises(Resolver404, msg=path):
                resolve(path)

    @override_settings(SCANNER_API_KEY='k')
    def test_board_inbound_action_gone(self):
        from rest_framework.test import APIClient
        so, _ = make_so_with_pallets(1)
        resp = APIClient().post('/product/scanner/', {'action': 'board_inbound', 'so_number': so.so_number,
                                                     'barcode': 'X'}, format='json', HTTP_X_API_KEY='k')
        self.assertEqual(resp.status_code, 400)
        self.assertIn('Unknown action', resp.json()['error'])
