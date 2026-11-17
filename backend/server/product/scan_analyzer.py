"""Checklist photos read by the office GPU server's image-analyzer agent (asynchronous).

CHECKLIST_SCAN_BACKEND='analyzer' (production). See docs/platform/AGENT_PLATFORM.md and the
image-analyzer repo's README for the agent's side.

    upload ─► submit(): POST the prepared JPEG to the agent as a one-image batch, task id
              "checklist-scan-<id>-a<attempt>" (the agent never analyses a task id twice)
    agent  ─► POST checklist-scans/analyzer-callback/ (HMAC-signed) ─► apply_result()
    missed callback ─► poll() from `manage.py process_checklist_scans`

The agent only returns raw text per sheet region. Parsing, candidate parts and the draft are
built here, exactly as for the direct reader (scan_local + scan_draft), and finished through
scan_worker.complete() — which drops a result whose attempt has been superseded.
"""
import hashlib
import hmac
import logging
import re
import time
from decimal import Decimal

import requests
from django.conf import settings

from . import scan_local, scan_reader
from .models import ChecklistScan

log = logging.getLogger(__name__)
PROFILE = 'checklist-sheet'
MAX_SKEW = 300          # seconds a signed callback may be old
_TASK = re.compile(r'^checklist-scan-(\d+)-a(\d+)$')


class AnalyzerError(Exception):
    pass


def task_id(scan):
    return f'checklist-scan-{scan.id}-a{scan.attempts}'


def parse_task_id(value):
    m = _TASK.match(value or '')
    return (int(m.group(1)), int(m.group(2))) if m else None


def _base():
    return settings.IMAGE_ANALYZER_URL.rstrip('/') + '/v1/image-analyzer'


def _headers():
    return {'X-API-Key': settings.IMAGE_ANALYZER_API_KEY}


def submit(scan_id):
    """Hand one 'processing' scan to the agent. Failures mark the scan failed (retryable)."""
    from .scan_worker import fail
    scan = ChecklistScan.objects.filter(pk=scan_id).first()
    if scan is None or scan.status != 'processing':
        return
    attempt = scan.attempts
    if not (settings.IMAGE_ANALYZER_API_KEY and settings.IMAGE_ANALYZER_CALLBACK_URL):
        fail(scan, attempt, 'The image analyzer is not configured on the server (IMAGE_ANALYZER_* settings).')
        return
    try:
        with scan.image.open('rb') as f:
            data, media_type = scan_reader.prepare_image(f)
        r = requests.post(f'{_base()}/batches', headers=_headers(), timeout=60,
                          data={'task_id': task_id(scan), 'profile': PROFILE,
                                'callback_url': settings.IMAGE_ANALYZER_CALLBACK_URL},
                          files=[('images', (f'scan-{scan.id}.jpg', data, media_type))])
    except scan_reader.ReadError as e:
        fail(scan, attempt, str(e))
        return
    except requests.RequestException as e:
        fail(scan, attempt, f'Could not reach the image analyzer on the office GPU server: {type(e).__name__}. '
                            'Is it on? Retry once it is.')
        return
    if r.status_code not in (200, 202):
        fail(scan, attempt, f'Image analyzer refused the photo ({r.status_code}): {_detail(r)}')
        return
    body = r.json()
    if body.get('status') in ('done', 'failed'):          # duplicate of a finished task
        apply_result(body)


def _detail(r):
    try:
        return str(r.json().get('detail', ''))[:200]
    except ValueError:
        return r.text[:200]


def verify(body: bytes, timestamp: str, signature: str) -> bool:
    secret = settings.IMAGE_ANALYZER_HMAC_SECRET
    if not secret or not timestamp.isdigit() or not signature.startswith('sha256='):
        return False
    if abs(time.time() - int(timestamp)) > MAX_SKEW:
        return False
    want = hmac.new(secret.encode(), timestamp.encode() + b'.' + body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(want, signature[len('sha256='):])


def apply_result(payload):
    """A finished batch (from the callback or a poll) → transcription → draft. Returns True
    when it belonged to a live scan attempt."""
    from .scan_worker import complete, fail
    parsed = parse_task_id(payload.get('task_id'))
    if not parsed:
        return False
    scan_id, attempt = parsed
    scan = ChecklistScan.objects.select_related('so').filter(pk=scan_id).first()
    if scan is None or scan.status != 'processing' or scan.attempts != attempt:
        return False
    results = payload.get('results') or []
    first = results[0] if results else {}
    if payload.get('status') != 'done' or first.get('status') != 'ok':
        return fail(scan, attempt, 'The image analyzer could not read this photo: '
                    + (first.get('error') or payload.get('error') or 'unknown error'))
    context = scan_reader.build_context()
    transcription = scan_local.transcription_from_regions(first.get('texts') or {},
                                                          scan_reader.known_parts(context))
    usage = first.get('usage') or {}
    result = scan_reader.ReadResult(transcription=transcription,
                                    model=f"analyzer:{payload.get('model', '')}"[:64],
                                    usage=usage, cost_usd=Decimal('0'))
    return complete(scan, attempt, result)


def poll(scan):
    """Ask the agent about a 'processing' scan. Returns 'applied', 'pending', 'missing' or 'error'."""
    try:
        r = requests.get(f'{_base()}/tasks/{task_id(scan)}', headers=_headers(), timeout=30)
    except requests.RequestException:
        return 'error'
    if r.status_code == 404:
        return 'missing'
    if r.status_code != 200:
        return 'error'
    body = r.json()
    if body.get('status') in ('done', 'failed'):
        apply_result(body)
        return 'applied'
    return 'pending'


QUEUE_CACHE_KEY = 'image-analyzer-queue'


def queue_snapshot():
    """{task_id: queue item} for unfinished batches, plus timing hints under None.
    One request to the agent per 3 s at most (the review list polls every 3 s); on any
    error an empty snapshot — progress display is a convenience, never an error."""
    from django.core.cache import cache
    snap = cache.get(QUEUE_CACHE_KEY)
    if snap is not None:
        return snap
    snap = {}
    try:
        r = requests.get(f'{_base()}/queue', headers=_headers(), timeout=2)
        if r.status_code == 200:
            body = r.json()
            snap = {i['task_id']: i for i in body.get('items', [])}
            snap[None] = {'seconds_per_image': body.get('seconds_per_image'),
                          'cold_start_seconds': body.get('cold_start_seconds')}
    except (requests.RequestException, ValueError, KeyError, TypeError):
        snap = {}
    cache.set(QUEUE_CACHE_KEY, snap, 3)
    return snap


def queue_info(scan, snap):
    """What the review list shows for a scan being read: its place in the agent's line."""
    item = snap.get(task_id(scan))
    if not item:
        return None
    hints = snap.get(None) or {}
    return {'position': item.get('position'), 'status': item.get('status'),
            'wait_reason': item.get('wait_reason'), 'images_ahead': item.get('images_ahead', 0),
            'seconds_per_image': hints.get('seconds_per_image'),
            'cold_start_seconds': hints.get('cold_start_seconds')}
