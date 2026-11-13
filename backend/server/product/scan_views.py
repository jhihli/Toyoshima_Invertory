"""Checklist photo scans: upload, poll, review, confirm. Admin / manager only.

    POST sos/<so_pk>/checklist-scans/          multipart `images` (1–20) → 201 [scan]
    GET  sos/<so_pk>/checklist-scans/          [scan] (?pallet=<id>)
    GET  checklist-scans/<pk>/                 scan + draft + transcription
    POST checklist-scans/<pk>/preview/         {draft} → {check}  (dry run, writes nothing)
    POST checklist-scans/<pk>/rebuild/         {pallet_id?, overrides?} → scan (no model call)
    POST checklist-scans/<pk>/confirm/         {draft} → scan; 400/409 {error}
    POST checklist-scans/<pk>/discard/         → scan
    POST checklist-scans/<pk>/retry/           → scan (failed, ready, or stale processing)
"""
import os

from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from . import scan_worker
from .models import SO, ChecklistScan
from .scan_draft import DraftError, apply_draft, build_draft, learn_from_confirm, preview_check
from .scan_match import fuzzy_key
from .views import IsAdminOrManager

MAX_IMAGES = 20
MAX_IMAGE_BYTES = 25 * 1024 * 1024
PERMS = [IsAuthenticated, IsAdminOrManager]


def _not_found():
    return Response({'error': 'Checklist scan not found'}, status=status.HTTP_404_NOT_FOUND)


def _bad(msg, code=status.HTTP_400_BAD_REQUEST):
    return Response({'error': msg}, status=code)


def _image_url(request, scan):
    if not scan.image:
        return None
    public_domain = os.getenv('PUBLIC_DOMAIN', '')
    if public_domain:
        return f'{public_domain}{scan.image.url}'
    return request.build_absolute_uri(scan.image.url) if request else scan.image.url


def _summary(request, s):
    p = s.pallet
    return {
        'id': s.id, 'so': s.so_id, 'status': s.status, 'is_stale': s.is_stale,
        'pallet_id': s.pallet_id,
        'pallet_label': (p.licence_number or f'Pallet #{p.pallet_seq}') if p else '',
        'image_url': _image_url(request, s), 'error': s.error, 'attempts': s.attempts,
        'model': s.model, 'cost_usd': str(s.cost_usd) if s.cost_usd is not None else None,
        'created_at': s.created_at.isoformat(), 'updated_at': s.updated_at.isoformat(),
        'confirmed_at': s.confirmed_at.isoformat() if s.confirmed_at else None,
        'result': s.result,
    }


def _full(request, s):
    return {**_summary(request, s), 'draft': s.draft, 'transcription': s.transcription}


def _get(pk, lock=False):
    qs = ChecklistScan.objects.select_related('so', 'pallet')
    if lock:
        qs = qs.select_for_update(of=('self',))
    return qs.filter(pk=pk).first()


def _check_image(f):
    """Pillow must be able to open it — the reader converts to JPEG with Pillow."""
    from PIL import Image, UnidentifiedImageError
    if f.size > MAX_IMAGE_BYTES:
        return f'{f.name}: larger than {MAX_IMAGE_BYTES // (1024 * 1024)} MB'
    try:
        Image.open(f).verify()
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError):
        return f'{f.name}: not a readable image (JPEG / PNG; iPhone HEIC is not supported)'
    finally:
        f.seek(0)
    return None


@api_view(['GET', 'POST'])
@permission_classes(PERMS)
def scan_list_create(request, so_pk):
    so = SO.objects.filter(pk=so_pk).first()
    if so is None:
        return _bad('SO not found', status.HTTP_404_NOT_FOUND)
    if request.method == 'GET':
        qs = so.checklist_scans.select_related('pallet')
        pallet = request.query_params.get('pallet')
        if pallet:
            qs = qs.filter(pallet_id=pallet)
        return Response([_summary(request, s) for s in qs])

    files = request.FILES.getlist('images') or request.FILES.getlist('image')
    if not files:
        return _bad('No images provided')
    if len(files) > MAX_IMAGES:
        return _bad(f'At most {MAX_IMAGES} photos per upload')
    problems = [p for p in (_check_image(f) for f in files) if p]
    if problems:
        return _bad('; '.join(problems))
    now = timezone.now()
    with transaction.atomic():
        scans = [ChecklistScan.objects.create(so=so, image=f, status='processing', attempts=1,
                                              processing_started_at=now, uploaded_by=request.user)
                 for f in files]
        for s in scans:
            scan_worker.start_processing(s.id)        # after commit (or inline in tests)
    for s in scans:
        s.refresh_from_db()
    return Response([_summary(request, s) for s in scans], status=status.HTTP_201_CREATED)


@api_view(['GET'])
@permission_classes(PERMS)
def scan_detail(request, pk):
    s = _get(pk)
    return Response(_full(request, s)) if s else _not_found()


def _draft_pallet(scan, draft):
    if not isinstance(draft, dict):
        raise DraftError('draft must be an object')
    pallet = scan.so.pallets.filter(pk=draft.get('pallet_id')).first() if draft.get('pallet_id') else None
    if pallet is None:
        raise DraftError('Pick the pallet this sheet belongs to.')
    return pallet


@api_view(['POST'])
@permission_classes(PERMS)
def scan_preview(request, pk):
    s = _get(pk)
    if s is None:
        return _not_found()
    try:
        pallet = _draft_pallet(s, request.data.get('draft'))
    except DraftError as e:
        return _bad(str(e))
    return Response({'check': preview_check(pallet, request.data['draft'])})


@api_view(['POST'])
@permission_classes(PERMS)
def scan_rebuild(request, pk):
    s = _get(pk)
    if s is None:
        return _not_found()
    if s.status not in ('ready', 'failed') or not s.transcription:
        return _bad(f'Cannot rebuild a {s.status} scan.')
    previous = s.draft or {}
    pallet = None
    if request.data.get('pallet_id') not in (None, ''):
        pallet = s.so.pallets.filter(pk=request.data.get('pallet_id')).first()
        if pallet is None:
            return _bad('That pallet is not on this order.')
        if pallet.id != previous.get('pallet_id'):
            # Row-level choices belong to the old pallet; keep only the owner's content edits.
            previous = {'overrides': previous.get('overrides'), 'initial': previous.get('initial'),
                        'mpns': previous.get('mpns', [])}
    overrides = request.data.get('overrides')
    if overrides is not None and not isinstance(overrides, dict):
        return _bad('overrides must be an object')
    if isinstance(request.data.get('previous'), dict):
        # The client's current choices (ticks) are newer than the stored draft's.
        previous = {**previous, **{k: v for k, v in request.data['previous'].items()
                                   if k in ('mpns', 'lines', 'delete_rows')}}
    s.draft = build_draft(s, pallet=pallet, overrides=overrides, previous=previous)
    s.pallet_id = s.draft['pallet_id']
    s.status, s.error = 'ready', ''
    s.save(update_fields=['draft', 'pallet', 'status', 'error', 'updated_at'])
    return Response(_full(request, s))


def _label_so_mismatch(scan):
    so_text = ((scan.transcription or {}).get('label') or {}).get('so_number') or ''
    if so_text and fuzzy_key(so_text) != fuzzy_key(scan.so.so_number):
        return f'This sheet belongs to {so_text}, not {scan.so.so_number}; it cannot be confirmed here.'
    return None


@api_view(['POST'])
@permission_classes(PERMS)
def scan_confirm(request, pk):
    draft = request.data.get('draft')
    try:
        with transaction.atomic():
            s = _get(pk, lock=True)
            if s is None:
                return _not_found()
            if s.status != 'ready':
                return _bad(f'This scan is {s.status}; only a ready scan can be confirmed.')
            mismatch = _label_so_mismatch(s)
            if mismatch:
                return _bad(mismatch)
            pallet = _draft_pallet(s, draft)
            result = apply_draft(pallet, draft)
            learned = learn_from_confirm(draft)
            result['corrections_recorded'] = len(learned)
            s.confirmed, s.result, s.pallet = draft, result, pallet
            s.status, s.confirmed_at = 'confirmed', timezone.now()
            s.save(update_fields=['confirmed', 'result', 'pallet', 'status', 'confirmed_at', 'updated_at'])
    except DraftError as e:
        return _bad(str(e), e.status)
    return Response(_full(request, s))


@api_view(['POST'])
@permission_classes(PERMS)
def scan_discard(request, pk):
    s = _get(pk)
    if s is None:
        return _not_found()
    if s.status == 'confirmed':
        return _bad('A confirmed scan cannot be discarded.')
    s.status = 'discarded'
    s.save(update_fields=['status', 'updated_at'])
    return Response(_full(request, s))


@api_view(['POST'])
@permission_classes(PERMS)
def scan_retry(request, pk):
    s = _get(pk)
    if s is None:
        return _not_found()
    if not (s.status in ('failed', 'ready') or s.is_stale):
        return _bad('Only a failed, ready or stuck scan can be read again.' if s.status != 'processing'
                    else 'Still reading this photo; retry is possible once it has been stuck for '
                         f'{int(ChecklistScan.STALE_AFTER.total_seconds() // 60)} minutes.')
    scan_worker.queue_retry(s)
    s.refresh_from_db()
    return Response(_full(request, s))
