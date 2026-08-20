from datetime import date, datetime
import json

from django.test import TestCase, override_settings

from product.models import Vendor, SO, Pallet, Box, Checklist


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
