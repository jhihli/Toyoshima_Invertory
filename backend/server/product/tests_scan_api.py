"""Checklist scan endpoints + background worker, with the model call faked.

CHECKLIST_SCAN_INLINE makes uploads read synchronously; scan_reader.read_sheet is patched
in every test (an unpatched call would fail anyway: ANTHROPIC_API_KEY is blank here).
"""
import copy
import io
import shutil
import tempfile
from datetime import timedelta
from decimal import Decimal
from unittest import mock

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.utils import timezone
from PIL import Image

from product import scan_reader
from product.models import Checklist, ChecklistScan, ChecklistCorrection, PalletMPN
from product.tests_scan import api_client
from product.tests_scan_draft import CL2, Cl2Fixture

MEDIA = tempfile.mkdtemp(prefix='scan-tests-')


def jpeg(name='cl2.jpg'):
    buf = io.BytesIO()
    Image.new('RGB', (60, 80), 'white').save(buf, 'JPEG')
    return SimpleUploadedFile(name, buf.getvalue(), content_type='image/jpeg')


def ok_read(transcription=CL2):
    return scan_reader.ReadResult(transcription=copy.deepcopy(transcription), model='claude-opus-5-5',
                                  usage={'input_tokens': 5000, 'output_tokens': 3000,
                                         'cache_read_tokens': 0, 'cache_write_tokens': 4000},
                                  cost_usd=Decimal('0.1000'))


@override_settings(CHECKLIST_SCAN_INLINE=True, MEDIA_ROOT=MEDIA, ANTHROPIC_API_KEY='')
class ScanApiTests(Cl2Fixture):

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(MEDIA, ignore_errors=True)

    def setUp(self):
        super().setUp()
        self.scan.delete()            # the fixture's scan; these tests upload their own
        self.client = api_client('admin')
        self.url = f'/product/sos/{self.so.id}/checklist-scans/'

    def upload(self, *files, read=None):
        read = read or mock.Mock(return_value=ok_read())
        with mock.patch.object(scan_reader, 'read_sheet', read):
            return self.client.post(self.url, {'images': list(files) or [jpeg()]}, format='multipart')

    def test_upload_reads_each_photo_into_a_ready_draft(self):
        resp = self.upload(jpeg('a.jpg'), jpeg('b.jpg'))
        self.assertEqual(resp.status_code, 201, resp.content)
        self.assertEqual(len(resp.json()), 2)
        scans = ChecklistScan.objects.order_by('id')
        self.assertEqual([s.status for s in scans], ['ready', 'ready'])
        s = scans[0]
        self.assertEqual((s.pallet_id, s.draft['pallet_id'], s.cost_usd), (self.pallet.id, self.pallet.id,
                                                                            Decimal('0.1000')))
        self.assertEqual((s.input_tokens, s.cache_write_tokens, s.attempts), (5000, 4000, 1))
        listed = self.client.get(self.url).json()
        self.assertEqual({x['status'] for x in listed}, {'ready'})
        self.assertEqual(listed[0]['pallet_label'], '06LP00083239')

    def test_only_admin_or_manager(self):
        self.client = api_client('n_user')
        self.assertEqual(self.upload().status_code, 403)
        self.assertEqual(self.client.get(self.url).status_code, 403)
        self.assertEqual(api_client('manager').get(self.url).status_code, 200)

    def test_non_image_is_rejected_and_nothing_is_stored(self):
        pdf = SimpleUploadedFile('sheet.pdf', b'%PDF-1.4 hello', content_type='application/pdf')
        resp = self.upload(jpeg(), pdf)
        self.assertEqual(resp.status_code, 400)
        self.assertIn('sheet.pdf', resp.json()['error'])
        self.assertEqual(ChecklistScan.objects.count(), 0)

    def test_no_images_is_400(self):
        self.assertEqual(self.client.post(self.url, {}, format='multipart').status_code, 400)

    def test_read_failure_marks_failed_and_retry_recovers(self):
        resp = self.upload(read=mock.Mock(side_effect=scan_reader.ReadError('API error 529: overloaded')))
        sid = resp.json()[0]['id']
        s = ChecklistScan.objects.get(pk=sid)
        self.assertEqual((s.status, s.error), ('failed', 'API error 529: overloaded'))
        with mock.patch.object(scan_reader, 'read_sheet', mock.Mock(return_value=ok_read())):
            r = self.client.post(f'/product/checklist-scans/{sid}/retry/')
        self.assertEqual(r.status_code, 200, r.content)
        s.refresh_from_db()
        self.assertEqual((s.status, s.error, s.attempts), ('ready', '', 2))

    def test_fresh_processing_cannot_be_retried_but_stale_can(self):
        s = ChecklistScan.objects.create(so=self.so, image='checklist_scans/x.jpg', status='processing',
                                         processing_started_at=timezone.now(), attempts=1)
        self.assertEqual(self.client.post(f'/product/checklist-scans/{s.id}/retry/').status_code, 400)
        s.processing_started_at = timezone.now() - timedelta(minutes=30)
        s.save()
        with mock.patch('product.scan_worker.start_processing') as start:
            r = self.client.post(f'/product/checklist-scans/{s.id}/retry/')
        self.assertEqual(r.status_code, 200)
        start.assert_called_once_with(s.id)
        self.assertEqual(r.json()['attempts'], 2)

    def scan_ready(self):
        sid = self.upload().json()[0]['id']
        return sid, self.client.get(f'/product/checklist-scans/{sid}/').json()

    def test_detail_404(self):
        r = self.client.get('/product/checklist-scans/999999/')
        self.assertEqual((r.status_code, r.json()), (404, {'error': 'Checklist scan not found'}))

    def test_confirm_applies_and_learns(self):
        sid, scan = self.scan_ready()
        # owner fixes line #1 and ticks every chip addition
        r = self.client.post(f'/product/checklist-scans/{sid}/rebuild/',
                             {'overrides': {'lines': {'1': {'part': 'SLKM8', 'qty': 191}}}}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        draft = r.json()['draft']
        for m in draft['mpns']:
            for c in m['chips']:
                c['apply'] = True
        prev = self.client.post(f'/product/checklist-scans/{sid}/preview/', {'draft': draft}, format='json')
        self.assertEqual(prev.json()['check']['status'], 'ok')
        r = self.client.post(f'/product/checklist-scans/{sid}/confirm/', {'draft': draft}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['status'], 'confirmed')
        self.assertEqual(r.json()['result']['filled'], 7)
        self.assertEqual(PalletMPN.objects.filter(pallet=self.pallet).count(), 4)
        self.assertEqual(ChecklistCorrection.lookup('mpn_name', 'BG00GH0'), 'B600GH0')
        # twice → refused
        again = self.client.post(f'/product/checklist-scans/{sid}/confirm/', {'draft': draft}, format='json')
        self.assertEqual(again.status_code, 400)

    def test_stale_confirm_is_409_and_writes_nothing(self):
        sid, scan = self.scan_ready()
        Checklist.objects.filter(barcode=f'{self.barcode}-3').update(model='D9SFT', qty=10)
        r = self.client.post(f'/product/checklist-scans/{sid}/confirm/', {'draft': scan['draft']}, format='json')
        self.assertEqual(r.status_code, 409, r.content)
        self.assertEqual(PalletMPN.objects.count(), 0)
        self.assertEqual(ChecklistScan.objects.get(pk=sid).status, 'ready')

    def test_sheet_of_another_so_cannot_be_confirmed(self):
        t = copy.deepcopy(CL2)
        t['label']['so_number'] = 'S06-000999'
        sid = self.upload(read=mock.Mock(return_value=ok_read(t))).json()[0]['id']
        draft = self.client.get(f'/product/checklist-scans/{sid}/').json()['draft']
        draft['errors'] = []                          # a client can't wave the check away
        r = self.client.post(f'/product/checklist-scans/{sid}/confirm/', {'draft': draft}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('S06-000999', r.json()['error'])

    def test_rebuild_with_a_picked_pallet(self):
        sid, _ = self.scan_ready()
        r = self.client.post(f'/product/checklist-scans/{sid}/rebuild/', {'pallet_id': self.other.id},
                             format='json')
        self.assertEqual(r.json()['draft']['pallet_id'], self.other.id)
        self.assertEqual(r.json()['pallet_id'], self.other.id)
        bad = self.client.post(f'/product/checklist-scans/{sid}/rebuild/', {'pallet_id': 999999}, format='json')
        self.assertEqual(bad.status_code, 400)

    def test_discard(self):
        sid, _ = self.scan_ready()
        r = self.client.post(f'/product/checklist-scans/{sid}/discard/')
        self.assertEqual(r.json()['status'], 'discarded')
        self.assertEqual(self.client.post(f'/product/checklist-scans/{sid}/confirm/', {'draft': {}},
                                          format='json').status_code, 400)

    def test_management_command_rereads_only_stale_scans(self):
        from django.core.management import call_command
        old = timezone.now() - timedelta(minutes=30)
        stale = ChecklistScan.objects.create(so=self.so, image=jpeg('s.jpg'), status='processing',
                                             processing_started_at=old, attempts=1)
        fresh = ChecklistScan.objects.create(so=self.so, image=jpeg('f.jpg'), status='processing',
                                             processing_started_at=timezone.now(), attempts=1)
        out = io.StringIO()
        with mock.patch.object(scan_reader, 'read_sheet', mock.Mock(return_value=ok_read())):
            call_command('process_checklist_scans', stdout=out)
        stale.refresh_from_db()
        fresh.refresh_from_db()
        self.assertEqual((stale.status, stale.attempts, fresh.status), ('ready', 2, 'processing'))

    def test_superseded_attempt_does_not_overwrite(self):
        """A slow first read finishing after a retry must not clobber the retry's result."""
        from product import scan_worker
        s = ChecklistScan.objects.create(so=self.so, image=jpeg('x.jpg'), status='processing',
                                         processing_started_at=timezone.now(), attempts=1)

        def slow_read(*a, **kw):
            ChecklistScan.objects.filter(pk=s.pk).update(attempts=2)    # a retry happened meanwhile
            return ok_read()
        with mock.patch.object(scan_reader, 'read_sheet', slow_read):
            scan_worker.process_scan(s.id)
        s.refresh_from_db()
        self.assertEqual((s.status, s.draft), ('processing', None))

    @override_settings(CHECKLIST_SCAN_INLINE=False)
    def test_upload_returns_at_once_and_reads_in_a_thread_after_commit(self):
        from product import scan_worker
        read = mock.Mock(return_value=ok_read())
        with mock.patch.object(scan_worker.threading, 'Thread') as Thread, \
                mock.patch.object(scan_reader, 'read_sheet', read):
            with self.captureOnCommitCallbacks(execute=False) as callbacks:
                resp = self.client.post(self.url, {'images': [jpeg()]}, format='multipart')
            self.assertEqual(resp.json()[0]['status'], 'processing')
            Thread.assert_not_called()                  # nothing starts before commit
            for cb in callbacks:
                cb()
        Thread.assert_called_once()
        self.assertIs(Thread.call_args.kwargs['target'], scan_worker._run)
        self.assertTrue(Thread.call_args.kwargs['daemon'])
        Thread.return_value.start.assert_called_once()
        read.assert_not_called()                        # the request itself never calls the model

    def test_list_filters_by_pallet(self):
        self.upload()
        self.assertEqual(len(self.client.get(self.url, {'pallet': self.pallet.id}).json()), 1)
        self.assertEqual(len(self.client.get(self.url, {'pallet': self.other.id}).json()), 0)


@override_settings(CHECKLIST_SCAN_INLINE=True, MEDIA_ROOT=MEDIA, ANTHROPIC_API_KEY='')
class PalletScanCountTests(Cl2Fixture):
    """The SO detail's pallets carry scan_count (discarded excluded) for the row's photo icon."""

    def test_scan_count_on_so_detail_pallets(self):
        ChecklistScan.objects.filter(pk=self.scan.pk).update(pallet=self.pallet, status='confirmed')
        ChecklistScan.objects.create(so=self.so, pallet=self.pallet, image='x.jpg', status='discarded')
        ChecklistScan.objects.create(so=self.so, pallet=self.pallet, image='y.jpg', status='ready')
        resp = api_client('admin').get(f'/product/sos/{self.so.id}/')
        self.assertEqual(resp.status_code, 200, resp.content)
        row = next(p for p in resp.json()['pallets'] if p['id'] == self.pallet.id)
        self.assertEqual(row['scan_count'], 2)
