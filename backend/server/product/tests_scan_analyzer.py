"""The 'analyzer' backend: photos go to the office image-analyzer agent; its HMAC-signed
callback finishes the scan. HTTP to the agent is faked — no test reaches a server."""
import hashlib
import hmac
import io
import json
import shutil
import tempfile
import time
from unittest import mock

from django.core.management import call_command
from django.test import override_settings

from product import scan_analyzer
from product.models import ChecklistScan
from product.tests_scan import api_client
from product.tests_scan_api import jpeg
from product.tests_scan_draft import Cl2Fixture

MEDIA = tempfile.mkdtemp(prefix='scan-analyzer-tests-')
SECRET = 'hmac-test'
TEXTS = {
    'label': 'SO: S06-000979\nPALLET: 06LP00083239-9\nWEIGHT: 575 LB',
    'header': '841631-001 | 147 | SLKM8, 1G, AL',
    'left': '#1 |  | SLKM8 | 191\n#2 | ALTERA | EP4CE15F23C9LN | 159',
    'right': 'NONE',
}
CALLBACK = '/product/checklist-scans/analyzer-callback/'


class Resp:
    def __init__(self, status_code, body):
        self.status_code, self._body, self.text = status_code, body, json.dumps(body)

    def json(self):
        return self._body


def signed(payload, secret=SECRET, ts=None):
    body = json.dumps(payload).encode()
    ts = str(int(ts if ts is not None else time.time()))
    sig = hmac.new(secret.encode(), ts.encode() + b'.' + body, hashlib.sha256).hexdigest()
    return body, {'HTTP_X_IA_TIMESTAMP': ts, 'HTTP_X_IA_SIGNATURE': f'sha256={sig}'}


def done(task, texts=TEXTS, status='done', result_status='ok', error=''):
    return {'batch_id': 'b1', 'task_id': task, 'profile': 'checklist-sheet', 'status': status,
            'model': 'qwen3-vl:8b-instruct', 'error': '',
            'results': [{'ref': '0', 'status': result_status, 'texts': texts,
                         'usage': {'input_tokens': 900, 'output_tokens': 60}, 'error': error}]}


@override_settings(CHECKLIST_SCAN_INLINE=True, CHECKLIST_SCAN_BACKEND='analyzer', MEDIA_ROOT=MEDIA,
                   IMAGE_ANALYZER_URL='http://gpu:8101', IMAGE_ANALYZER_API_KEY='key-test',
                   IMAGE_ANALYZER_HMAC_SECRET=SECRET,
                   IMAGE_ANALYZER_CALLBACK_URL='http://job:8000/product/checklist-scans/analyzer-callback/')
class AnalyzerBackendTests(Cl2Fixture):

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(MEDIA, ignore_errors=True)

    def setUp(self):
        super().setUp()
        self.scan.delete()
        self.client = api_client('admin')

    def upload(self, reply=None):
        reply = reply or Resp(202, {'batch_id': 'b1', 'status': 'queued'})
        with mock.patch.object(scan_analyzer.requests, 'post', return_value=reply) as post:
            r = self.client.post(f'/product/sos/{self.so.id}/checklist-scans/', {'images': [jpeg()]},
                                 format='multipart')
        self.assertEqual(r.status_code, 201, r.content)
        return ChecklistScan.objects.get(pk=r.json()[0]['id']), post

    def test_upload_submits_one_image_batch_and_stays_processing(self):
        scan, post = self.upload()
        self.assertEqual(scan.status, 'processing')
        args, kw = post.call_args
        self.assertEqual(args[0], 'http://gpu:8101/v1/image-analyzer/batches')
        self.assertEqual(kw['headers'], {'X-API-Key': 'key-test'})
        self.assertEqual(kw['data']['task_id'], f'checklist-scan-{scan.id}-a1')
        self.assertEqual(kw['data']['profile'], 'checklist-sheet')
        self.assertEqual(kw['files'][0][1][2], 'image/jpeg')

    def test_signed_callback_builds_the_draft(self):
        scan, _ = self.upload()
        body, headers = signed(done(f'checklist-scan-{scan.id}-a1'))
        r = self.client.generic('POST', CALLBACK, body, content_type='application/json', **headers)
        self.assertEqual(r.status_code, 200, r.content)
        self.assertTrue(r.json()['applied'])
        scan.refresh_from_db()
        self.assertEqual(scan.status, 'ready')
        self.assertEqual(scan.pallet_id, self.pallet.id)
        self.assertEqual(scan.model, 'analyzer:qwen3-vl:8b-instruct')
        self.assertEqual(scan.input_tokens, 900)
        self.assertEqual([l['model_text'] for l in scan.transcription['lines']], ['SLKM8', 'EP4CE15F23C9LN'])
        self.assertEqual(scan.transcription['label']['so_number'], 'S06-000979')

    def test_callback_needs_a_valid_fresh_signature(self):
        scan, _ = self.upload()
        payload = done(f'checklist-scan-{scan.id}-a1')
        for body, headers in (signed(payload, secret='wrong'), signed(payload, ts=time.time() - 3600)):
            r = self.client.generic('POST', CALLBACK, body, content_type='application/json', **headers)
            self.assertEqual(r.status_code, 401)
        body, headers = signed(payload)
        r = self.client.generic('POST', CALLBACK, body + b' ', content_type='application/json', **headers)
        self.assertEqual(r.status_code, 401)                     # body tampered
        scan.refresh_from_db()
        self.assertEqual(scan.status, 'processing')

    def test_superseded_attempt_is_ignored(self):
        scan, _ = self.upload()
        scan.attempts = 2
        scan.save()
        body, headers = signed(done(f'checklist-scan-{scan.id}-a1'))
        r = self.client.generic('POST', CALLBACK, body, content_type='application/json', **headers)
        self.assertEqual(r.status_code, 200)
        self.assertFalse(r.json()['applied'])
        scan.refresh_from_db()
        self.assertEqual(scan.status, 'processing')

    def test_failed_reading_marks_scan_failed(self):
        scan, _ = self.upload()
        body, headers = signed(done(f'checklist-scan-{scan.id}-a1', status='failed', result_status='error',
                                    texts={}, error='not a readable image'))
        self.client.generic('POST', CALLBACK, body, content_type='application/json', **headers)
        scan.refresh_from_db()
        self.assertEqual(scan.status, 'failed')
        self.assertIn('not a readable image', scan.error)

    def test_unreachable_or_refusing_analyzer_fails_the_scan(self):
        import requests
        with mock.patch.object(scan_analyzer.requests, 'post', side_effect=requests.ConnectionError('x')):
            r = self.client.post(f'/product/sos/{self.so.id}/checklist-scans/', {'images': [jpeg()]},
                                 format='multipart')
        scan = ChecklistScan.objects.get(pk=r.json()[0]['id'])
        self.assertEqual(scan.status, 'failed')
        self.assertIn('office GPU server', scan.error)
        scan2, _ = self.upload(Resp(401, {'detail': 'invalid API key'}))
        scan2.refresh_from_db()
        self.assertEqual(scan2.status, 'failed')
        self.assertIn('invalid API key', scan2.error)

    @override_settings(IMAGE_ANALYZER_API_KEY='')
    def test_not_configured(self):
        scan, _ = self.upload()
        scan.refresh_from_db()
        self.assertEqual(scan.status, 'failed')
        self.assertIn('not configured', scan.error)

    def test_command_applies_a_result_whose_callback_was_lost(self):
        scan, _ = self.upload()
        with mock.patch.object(scan_analyzer.requests, 'get',
                               return_value=Resp(200, done(f'checklist-scan-{scan.id}-a1'))) as get:
            call_command('process_checklist_scans', stdout=io.StringIO())
        self.assertEqual(get.call_args[0][0], f'http://gpu:8101/v1/image-analyzer/tasks/checklist-scan-{scan.id}-a1')
        scan.refresh_from_db()
        self.assertEqual(scan.status, 'ready')

    def test_command_resubmits_a_stale_scan_the_analyzer_never_got(self):
        scan, _ = self.upload()
        ChecklistScan.objects.filter(pk=scan.pk).update(
            processing_started_at=scan.processing_started_at - ChecklistScan.STALE_AFTER * 2)
        with mock.patch.object(scan_analyzer.requests, 'get', return_value=Resp(404, {'detail': 'batch not found'})), \
                mock.patch.object(scan_analyzer.requests, 'post',
                                  return_value=Resp(202, {'batch_id': 'b2', 'status': 'queued'})) as post:
            call_command('process_checklist_scans', stdout=io.StringIO())
        scan.refresh_from_db()
        self.assertEqual(scan.attempts, 2)
        self.assertEqual(post.call_args[1]['data']['task_id'], f'checklist-scan-{scan.id}-a2')

    def test_command_leaves_a_queued_scan_alone(self):
        scan, _ = self.upload()
        with mock.patch.object(scan_analyzer.requests, 'get', return_value=Resp(200, {'status': 'waiting'})), \
                mock.patch.object(scan_analyzer.requests, 'post') as post:
            call_command('process_checklist_scans', stdout=io.StringIO())
        post.assert_not_called()
        scan.refresh_from_db()
        self.assertEqual((scan.status, scan.attempts), ('processing', 1))

    def test_list_shows_queue_position_while_reading(self):
        from django.core.cache import cache
        cache.delete(scan_analyzer.QUEUE_CACHE_KEY)
        scan, _ = self.upload()
        q = {'items': [{'position': 1, 'task_id': 'other', 'status': 'processing', 'images_ahead': 0},
                       {'position': 2, 'task_id': f'checklist-scan-{scan.id}-a1', 'status': 'queued',
                        'wait_reason': None, 'images_ahead': 1}],
             'seconds_per_image': 25, 'cold_start_seconds': 45}
        with mock.patch.object(scan_analyzer.requests, 'get', return_value=Resp(200, q)) as get:
            rows = self.client.get(f'/product/sos/{self.so.id}/checklist-scans/').json()
            self.client.get(f'/product/sos/{self.so.id}/checklist-scans/')
        self.assertEqual(get.call_count, 1)                        # cached between polls
        self.assertEqual(rows[0]['queue'], {'position': 2, 'status': 'queued', 'wait_reason': None,
                                            'images_ahead': 1, 'seconds_per_image': 25,
                                            'cold_start_seconds': 45})
        self.assertIsNotNone(rows[0]['processing_started_at'])

    def test_list_survives_an_unreachable_analyzer(self):
        import requests
        from django.core.cache import cache
        cache.delete(scan_analyzer.QUEUE_CACHE_KEY)
        self.upload()
        with mock.patch.object(scan_analyzer.requests, 'get', side_effect=requests.ConnectionError('x')):
            rows = self.client.get(f'/product/sos/{self.so.id}/checklist-scans/').json()
        self.assertIsNone(rows[0]['queue'])
