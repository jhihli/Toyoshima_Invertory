"""Reading checklist photos off the request path.

There is no task queue in this deployment, so each photo gets a daemon thread, started
once the upload's transaction has committed. The request returns immediately; the gunicorn
worker is never blocked for the length of a model call. A thread dies with its process
(restart, deploy, gunicorn max-requests recycling): the scan then sits in 'processing',
becomes stale after ChecklistScan.STALE_AFTER and can be retried from the UI, or in bulk
with `manage.py process_checklist_scans`.

Two runs of one scan can overlap (a retry of a scan whose thread was only slow). Each run
remembers the attempt number it started for and writes its result only if that is still
the scan's current attempt, so the newest retry always wins.
"""
import logging
import threading

from django.conf import settings
from django.db import close_old_connections, connection, transaction
from django.utils import timezone

from . import scan_reader
from .models import ChecklistScan

log = logging.getLogger(__name__)


def uses_analyzer():
    return getattr(settings, 'CHECKLIST_SCAN_BACKEND', 'analyzer') == 'analyzer'


def start_processing(scan_id):
    """Read scan `scan_id` in the background (synchronously when CHECKLIST_SCAN_INLINE).
    With the 'analyzer' backend the background step only hands the photo to the office
    image-analyzer; its signed callback finishes the scan (scan_analyzer.apply_result)."""
    work = _submit if uses_analyzer() else process_scan
    if getattr(settings, 'CHECKLIST_SCAN_INLINE', False):
        work(scan_id)
        return
    transaction.on_commit(lambda: threading.Thread(
        target=_run, args=(scan_id, work), daemon=True, name=f'checklist-scan-{scan_id}').start())


def _submit(scan_id):
    from . import scan_analyzer
    scan_analyzer.submit(scan_id)


def _run(scan_id, work):
    close_old_connections()
    try:
        work(scan_id)
    except Exception:            # never let a thread die silently with the scan 'processing'
        log.exception('checklist scan %s crashed', scan_id)
        ChecklistScan.objects.filter(pk=scan_id, status='processing').update(
            status='failed', error='Unexpected server error while reading; retry.')
    finally:
        connection.close()


def _finish(scan, attempt, **fields):
    fields['updated_at'] = timezone.now()
    n = ChecklistScan.objects.filter(pk=scan.pk, attempts=attempt, status='processing').update(**fields)
    if not n:
        log.info('checklist scan %s attempt %s superseded; result dropped', scan.pk, attempt)
    return bool(n)


def fail(scan, attempt, error, **fields):
    return _finish(scan, attempt, status='failed', error=error, **fields)


def complete(scan, attempt, result):
    """A transcription is in (any backend): build the draft and mark the scan ready."""
    from .scan_draft import build_draft
    usage = result.usage or {}
    fields = dict(transcription=result.transcription, model=result.model,
                  input_tokens=usage.get('input_tokens', 0), output_tokens=usage.get('output_tokens', 0),
                  cache_read_tokens=usage.get('cache_read_tokens', 0),
                  cache_write_tokens=usage.get('cache_write_tokens', 0), cost_usd=result.cost_usd, error='')
    scan.transcription = result.transcription
    try:
        draft = build_draft(scan)
    except Exception as e:
        log.exception('checklist scan %s: draft failed', scan.pk)
        return _finish(scan, attempt, status='failed', error=f'Read OK, but building the draft failed: {e}', **fields)
    return _finish(scan, attempt, status='ready', draft=draft, pallet_id=draft['pallet_id'], **fields)


def process_scan(scan_id):
    """Read one 'processing' scan synchronously (direct backends): transcription, then draft."""
    scan = ChecklistScan.objects.select_related('so').filter(pk=scan_id).first()
    if scan is None or scan.status != 'processing':
        return
    attempt = scan.attempts
    try:
        with scan.image.open('rb') as f:
            data, media_type = scan_reader.prepare_image(f)
        result = scan_reader.read_sheet(data, media_type, scan_reader.build_context())
    except scan_reader.ReadError as e:
        _finish(scan, attempt, status='failed', error=str(e))
        return
    except Exception as e:
        log.exception('checklist scan %s: read failed', scan_id)
        _finish(scan, attempt, status='failed', error=f'Unexpected error while reading: {e}')
        return

    complete(scan, attempt, result)


def queue_retry(scan):
    """Put a scan back to 'processing' for a fresh read (new attempt number) and start it."""
    scan.status = 'processing'
    scan.attempts += 1
    scan.error = ''
    scan.processing_started_at = timezone.now()
    scan.save(update_fields=['status', 'attempts', 'error', 'processing_started_at', 'updated_at'])
    start_processing(scan.id)
