"""
Push a Microsoft Recycling API (Buyback) report for one SO.

    python manage.py push_msft_report --report credit --so 12
    python manage.py push_msft_report --report credit --so 12 --dry-run
    python manage.py push_msft_report --report podoc --so 12
    python manage.py push_msft_report --report pnr   --so 12

--dry-run assembles + validates the JSON and logs it WITHOUT any network call
(no credentials needed). Every run writes one MsftApiLog row.
"""
import json
import traceback

from django.core.management.base import BaseCommand

from product.models import SO, MsftApiLog
from product.msft import payloads
from product.msft.client import MsftClient, MsftApiError


def _po_of(report_type, payload):
    """A representative supplierPoNumber for logging."""
    if not isinstance(payload, dict):
        return ''
    if report_type == 'podoc':
        return payload.get('supplierPoNumber', '')
    if report_type == 'credit':
        units = payload.get('creditDetails') or []
        return units[0].get('supplierPoNumber', '') if units else ''
    if report_type == 'pnr':
        details = payload.get('paymentDetails') or []
        return details[0].get('supplierPoNumber', '') if details else ''
    return ''


class Command(BaseCommand):
    help = 'Assemble and push a Buyback report (credit/podoc/pnr) to Microsoft.'

    def add_arguments(self, parser):
        parser.add_argument('--report', required=True, choices=['credit', 'podoc', 'pnr'])
        parser.add_argument('--so', required=True, type=int, help='SO primary key')
        parser.add_argument('--dry-run', action='store_true',
                            help='Assemble + log the payload without sending.')

    def handle(self, *args, **options):
        report = options['report']
        dry_run = options['dry_run']
        try:
            so = SO.objects.get(pk=options['so'])
        except SO.DoesNotExist:
            self.stderr.write(f"SO {options['so']} not found.")
            return

        # 1) Build payload (validation happens here).
        try:
            payload = payloads.build(report, so)
        except payloads.PayloadError as e:
            MsftApiLog.objects.create(
                so=so, report_type=report, status='error', error=str(e),
            )
            self.stderr.write(f"[{report}] payload error: {e}")
            return

        po = _po_of(report, payload)

        # 2) Push (or dry-run).
        try:
            result = MsftClient().put(report, payload, dry_run=dry_run)
        except MsftApiError as e:
            MsftApiLog.objects.create(
                so=so, report_type=report, supplier_po_number=po,
                request_payload=payload, status='error', error=str(e),
            )
            self.stderr.write(f"[{report}] push error: {e}")
            return
        except Exception:
            err = traceback.format_exc()
            MsftApiLog.objects.create(
                so=so, report_type=report, supplier_po_number=po,
                request_payload=payload, status='error', error=err,
            )
            self.stderr.write(f"[{report}] unexpected error:\n{err}")
            return

        # 3) Log outcome.
        if result['dry_run']:
            status = 'dryrun'
        elif result['error_count'] == 0 and (result['http_status'] or 0) < 400:
            status = 'ok'
        else:
            status = 'error'

        MsftApiLog.objects.create(
            so=so, report_type=report, supplier_po_number=po,
            correlation_id=result['correlation_id'], endpoint=result['endpoint'],
            http_status=result['http_status'], request_payload=payload,
            response=result['response'], success_count=result['success_count'],
            error_count=result['error_count'], status=status,
        )

        if dry_run:
            self.stdout.write(self.style.SUCCESS(f"[{report}] DRY RUN — payload:"))
            self.stdout.write(json.dumps(payload, indent=2, ensure_ascii=False))
            self.stdout.write(f"Would PUT -> {result['endpoint']}")
        elif status == 'ok':
            self.stdout.write(self.style.SUCCESS(
                f"[{report}] OK ({result['http_status']}) — "
                f"{result['success_count']} accepted, corr={result['correlation_id']}"
            ))
        else:
            self.stderr.write(
                f"[{report}] returned errors ({result['http_status']}): "
                f"{json.dumps(result['response'], ensure_ascii=False)}"
            )
