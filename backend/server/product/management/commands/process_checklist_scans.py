"""Recover checklist scans whose read was lost.

With the 'analyzer' backend (production) a scan in 'processing' is waiting for the office
image-analyzer's callback. This asks the analyzer about each one and applies any finished
result whose callback never arrived; a stale scan the analyzer has never heard of (or the
upload never reached it) is submitted again as a new attempt. With a direct backend, stale
scans are re-read synchronously in this process.

    python manage.py process_checklist_scans            # processing / stale scans
    python manage.py process_checklist_scans --failed   # also re-read 'failed' ones
    python manage.py process_checklist_scans --id 12    # just this scan
"""
from django.core.management.base import BaseCommand
from django.utils import timezone

from product import scan_analyzer, scan_worker
from product.models import ChecklistScan


def _new_attempt(s):
    s.status = 'processing'
    s.attempts += 1
    s.error = ''
    s.processing_started_at = timezone.now()
    s.save(update_fields=['status', 'attempts', 'error', 'processing_started_at', 'updated_at'])


class Command(BaseCommand):
    help = "Recover stale (and optionally failed) checklist photo scans."

    def add_arguments(self, parser):
        parser.add_argument('--failed', action='store_true', help="also re-read failed scans")
        parser.add_argument('--id', type=int, help="only this scan")

    def handle(self, *args, **opts):
        analyzer = scan_worker.uses_analyzer()
        if opts['id']:
            scans = list(ChecklistScan.objects.filter(pk=opts['id']))
        else:
            qs = ChecklistScan.objects.filter(status='processing')
            if not analyzer:              # direct reads: only the stale ones lost their thread
                qs = qs.filter(processing_started_at__lt=timezone.now() - ChecklistScan.STALE_AFTER)
            scans = list(qs)
            if opts['failed']:
                scans += list(ChecklistScan.objects.filter(status='failed'))
        if not scans:
            self.stdout.write('Nothing to recover.')
            return
        for s in scans:
            if analyzer:
                self._via_analyzer(s, explicit=bool(opts['id']))
            else:
                _new_attempt(s)
                scan_worker.process_scan(s.id)          # synchronously, in this process
            s.refresh_from_db()
            self.stdout.write(f'scan {s.id}: {s.status}' + (f' — {s.error}' if s.error else ''))

    def _via_analyzer(self, s, explicit):
        if s.status == 'processing':
            state = scan_analyzer.poll(s)
            if state != 'missing':                    # finished now, still queued, or unreachable
                return
            if not (s.is_stale or explicit):          # missing but young: upload still in flight
                return
        elif s.status not in ('failed', 'ready'):     # never touch confirmed / discarded
            return
        _new_attempt(s)
        scan_analyzer.submit(s.id)
