"""
Build Microsoft Recycling API (Buyback) JSON payloads from our models.

Field names & structure follow the Recycling API PDF (Credit Details p.116,
PO Document p.147, Payment Notifications p.143) and were verified end-to-end
against the TEST endpoint on 2026-07-23.

Each builder raises PayloadError with a human-readable message when required
data is missing / invalid; callers log that as an error (no push attempted).
"""
import base64
import os

from django.conf import settings

from product.models import MsftCreditUnit, MsftPaymentNotice, MSFT_BUYBACK_UNIT_TYPES


class PayloadError(Exception):
    pass


def _num(v):
    """Decimal/None → JSON number (float) or None."""
    return float(v) if v is not None else None


def _iso(d):
    """date/None → 'YYYY-MM-DDT00:00:00.000Z' or None."""
    return f"{d.isoformat()}T00:00:00.000Z" if d else None


def _supplier():
    cfg = settings.MSFT_API
    sid = cfg.get('SUPPLIER_ID')
    if not sid:
        raise PayloadError("MSFT_SUPPLIER_ID is not set in .env.")
    return sid, cfg.get('SUPPLIER_NAME', '')


# ─── ① Credit Details ──────────────────────────────────────────────────────
def build_credit_details(so) -> dict:
    job = getattr(so, 'msft_job', None)
    if job is None:
        raise PayloadError(f"SO {so.so_number} has no MSFT job info - fill it first.")

    units = list(MsftCreditUnit.objects.filter(so=so))
    if not units:
        raise PayloadError(f"SO {so.so_number} has no credit units to report.")

    problems = []
    if not job.ms_company_code:
        problems.append("msCompanyCode is empty")
    for u in units:
        if not u.supplier_unit_id:
            problems.append(f"unit #{u.id}: supplierUnitId is empty")
        if u.unit_type not in MSFT_BUYBACK_UNIT_TYPES:
            problems.append(
                f"unit {u.supplier_unit_id or u.id}: unitType {u.unit_type!r} - "
                f"Buyback allows only {MSFT_BUYBACK_UNIT_TYPES}"
            )
        if not (u.supplier_po_number or job.supplier_po_number):
            problems.append(f"unit {u.supplier_unit_id or u.id}: supplierPoNumber is empty")
    if problems:
        raise PayloadError("Credit Details validation failed: " + "; ".join(problems))

    supplier_id, supplier_name = _supplier()
    return {
        "supplierId": supplier_id,
        "supplierName": supplier_name,
        "supplierJobID": so.so_number,
        "supplierJobType": job.supplier_job_type or "Buyback",
        "msCompanyCode": job.ms_company_code,
        "jobStatus": job.job_status or "ACTIVE",
        "supplierPoCurrency": job.supplier_po_currency or "USD",
        "billingCountry": job.billing_country or "US",
        "creditDetails": [
            {
                "supplierUnitID": u.supplier_unit_id,
                "supplierUnitType": u.unit_type,
                "dateSold": _iso(u.date_sold),
                "salePrice": _num(u.sale_price),
                "supplierCommission": _num(u.supplier_commission),
                "msRevenueShare": _num(u.ms_revenue_share),
                "supplierPoNumber": u.supplier_po_number or job.supplier_po_number,
            }
            for u in units
        ],
    }


# ─── ② PO Document ─────────────────────────────────────────────────────────
def build_po_document(so) -> dict:
    job = getattr(so, 'msft_job', None)
    if job is None:
        raise PayloadError(f"SO {so.so_number} has no MSFT job info.")
    if not job.supplier_po_number:
        raise PayloadError("supplierPoNumber is empty - set it (must match Credit Details).")
    if not job.ms_company_code:
        raise PayloadError("msCompanyCode is empty.")
    if not job.po_document:
        raise PayloadError("No PO document uploaded - upload the PO PDF first.")
    # PO number should exist among the reported credit units (MS validates this).
    has_po = MsftCreditUnit.objects.filter(so=so).filter(
        supplier_po_number=job.supplier_po_number
    ).exists() or MsftCreditUnit.objects.filter(so=so, supplier_po_number='').exists()
    if not has_po:
        raise PayloadError(
            f"supplierPoNumber {job.supplier_po_number!r} is not on any credit unit - "
            "upload Credit Details with this PO first."
        )

    supplier_id, _ = _supplier()
    with job.po_document.open('rb') as fh:
        content = base64.b64encode(fh.read()).decode('ascii')
    return {
        "supplierId": supplier_id,
        "supplierPoNumber": job.supplier_po_number,
        "msCompanyCode": job.ms_company_code,
        "fileName": os.path.basename(job.po_document.name),
        "fileContent": content,
    }


# ─── ③ Payment Notifications (PNR) ─────────────────────────────────────────
def build_payment_notifications(so) -> dict:
    notices = list(MsftPaymentNotice.objects.filter(so=so))
    if not notices:
        raise PayloadError(f"SO {so.so_number} has no payment notices to report.")

    problems = []
    for n in notices:
        if not n.supplier_po_number:
            problems.append(f"notice #{n.id}: supplierPoNumber is empty")
        if not n.ms_invoice_number:
            problems.append(f"notice #{n.id}: msInvoiceNumber is empty")
    if problems:
        raise PayloadError("Payment Notification validation failed: " + "; ".join(problems))

    supplier_id, supplier_name = _supplier()
    return {
        "supplierId": supplier_id,
        "supplierName": supplier_name,
        "paymentDetails": [
            {
                "supplierPoNumber": n.supplier_po_number,
                "supplierPoCurrency": n.supplier_po_currency or "USD",
                "msInvoiceNumber": n.ms_invoice_number,
                "paymentDate": _iso(n.payment_date),
                "paymentAmount": _num(n.payment_amount),
                "paymentAmountUSD": _num(n.payment_amount_usd),
            }
            for n in notices
        ],
    }


BUILDERS = {
    'credit': build_credit_details,
    'podoc':  build_po_document,
    'pnr':    build_payment_notifications,
}


def build(report_type: str, so) -> dict:
    try:
        builder = BUILDERS[report_type]
    except KeyError:
        raise PayloadError(f"Unknown report type: {report_type!r}")
    return builder(so)
