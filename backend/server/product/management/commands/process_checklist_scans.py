"""Re-read checklist scans whose background read died with its process.

A scan left in 'processing' longer than ChecklistScan.STALE_AFTER lost its thread (a
restart or deploy mid-read). This reads them again, synchronously, in this process — safe
to run by hand after a deploy or from cron. Each re-read is a billed model call.

    python manage.py process_checklist_scans            # stale 'processing' scans
    python manage.py process_checklist_scans --failed   # also re-read 'failed' ones
    python manage.py process_checklist_scans --id 12    # just this scan
"""
from django.core.management.base import BaseCommand
from django.utils import timezone

from product import scan_worker
from product.models import ChecklistScan


class Command(BaseCommand):
    help = "Re-read stale (and optionally failed) checklist photo scans."

    def add_arguments(self, parser):
        parser.add_argument('--failed', action='store_true', help="also re-read failed scans")
        parser.add_argument('--id', type=int, help="re-read only this scan")

    def handle(self, *args, **opts):
        if opts['id']:
            scans = list(ChecklistScan.objects.filter(pk=opts['id']))
        else:
            cutoff = timezone.now() - ChecklistScan.STALE_AFTER
            scans = list(ChecklistScan.objects.filter(status='processing', processing_started_at__lt=cutoff))
            if opts['failed']:
                scans += list(ChecklistScan.objects.filter(status='failed'))
        if not scans:
            self.stdout.write('Nothing to re-read.')
            return
        for s in scans:
            s.status = 'processing'
            s.attempts += 1
            s.error = ''
            s.processing_started_at = timezone.now()
            s.save(update_fields=['status', 'attempts', 'error', 'processing_started_at', 'updated_at'])
            scan_worker.process_scan(s.id)          # synchronously, in this process
            s.refresh_from_db()
            self.stdout.write(f'scan {s.id}: {s.status}' + (f' — {s.error}' if s.error else ''))
