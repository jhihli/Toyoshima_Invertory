from rest_framework.decorators import api_view, permission_classes,authentication_classes
from rest_framework.permissions import IsAuthenticated, AllowAny, BasePermission
from rest_framework.response import Response
from rest_framework import status
from rest_framework.views import APIView
from django.shortcuts import get_object_or_404
from django.db.models import Q
from django.db import transaction
from django.db.models import ProtectedError
from django.conf import settings


def _as_int(val, default):
    try:
        return int(val)
    except (TypeError, ValueError):
        return default


def _check_scanner_key(request):
    key = request.META.get('HTTP_X_API_KEY', '')
    if not key or key != settings.SCANNER_API_KEY:
        return Response({'success': False, 'error': 'Unauthorized'}, status=401)
    return None


class IsAdminOrManager(BasePermission):
    """Only admin/manager roles. Used to gate the Microsoft Recycling API endpoints."""
    message = 'Requires admin or manager role.'

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and getattr(user, 'is_admin_or_manager', False))
from .models import (
    Vendor, SO, SOPhoto, Pallet, PalletPhoto, Board, ChipBrand, Chip, MPN,
    MPNReportConfig, MPNReportEmail, PalletChipContainer, Box, Checklist,
)
from .serializer import (
    VendorSerializer, SOSerializer, SODetailSerializer,
    SOPhotoSerializer, PalletSerializer, PalletPhotoSerializer, BoardSerializer, BoardListSerializer,
    ChipBrandSerializer, ChipSerializer, MPNSerializer, MPNDetailSerializer,
    MPNReportConfigSerializer, MPNReportEmailSerializer,
    PalletChipContainerSerializer, PalletChipContainerWithChipSerializer, PalletPhotoSerializer,
    BoxSerializer, ChecklistSerializer,
)


# ─────────────────────────────────────────────────── MPN
@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def mpn_list(request):
    if request.method == 'GET':
        q = request.query_params.get('q', '').strip()
        qs = MPN.objects.all()
        if q:
            qs = qs.filter(name__icontains=q)
        return Response(MPNSerializer(qs, many=True, context={'request': request}).data)
    serializer = MPNSerializer(data=request.data)
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET', 'PUT', 'DELETE'])
@permission_classes([IsAuthenticated])
def mpn_detail(request, pk):
    mpn = get_object_or_404(MPN, pk=pk)
    if request.method == 'GET':
        return Response(MPNDetailSerializer(mpn, context={'request': request}).data)
    if request.method == 'PUT':
        serializer = MPNSerializer(mpn, data=request.data, partial=True, context={'request': request})
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    try:
        mpn.delete()
    except ProtectedError:
        count = mpn.boards.count()
        return Response(
            {'error': f'Cannot delete: {count} board(s) are still assigned to this MPN. Reassign them first.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(['POST', 'DELETE'])
@permission_classes([IsAuthenticated])
def mpn_beforecut_photo(request, pk):
    mpn = get_object_or_404(MPN, pk=pk)
    if request.method == 'POST':
        if not request.FILES.get('photo'):
            return Response({'error': 'No photo provided'}, status=status.HTTP_400_BAD_REQUEST)
        if mpn.beforecut_photo:
            mpn.beforecut_photo.delete(save=False)
        mpn.beforecut_photo = request.FILES['photo']
        mpn.save()
        mpn.refresh_from_db()
        return Response(MPNDetailSerializer(mpn, context={'request': request}).data)
    if mpn.beforecut_photo:
        mpn.beforecut_photo.delete(save=False)
        mpn.beforecut_photo = None
        mpn.save()
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(['POST', 'DELETE'])
@permission_classes([IsAuthenticated])
def mpn_aftercut_photo(request, pk):
    mpn = get_object_or_404(MPN, pk=pk)
    if request.method == 'POST':
        if not request.FILES.get('photo'):
            return Response({'error': 'No photo provided'}, status=status.HTTP_400_BAD_REQUEST)
        if mpn.aftercut_photo:
            mpn.aftercut_photo.delete(save=False)
        mpn.aftercut_photo = request.FILES['photo']
        mpn.save()
        mpn.refresh_from_db()
        return Response(MPNDetailSerializer(mpn, context={'request': request}).data)
    if mpn.aftercut_photo:
        mpn.aftercut_photo.delete(save=False)
        mpn.aftercut_photo = None
        mpn.save()
    return Response(status=status.HTTP_204_NO_CONTENT)


# ─────────────────────────────────────────────────── Vendor
@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def vendor_list(request):
    if request.method == 'GET':
        vendors = Vendor.objects.all()
        return Response(VendorSerializer(vendors, many=True).data)
    serializer = VendorSerializer(data=request.data)
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET', 'PUT', 'DELETE'])
@permission_classes([IsAuthenticated])
def vendor_detail(request, pk):
    vendor = get_object_or_404(Vendor, pk=pk)
    if request.method == 'GET':
        return Response(VendorSerializer(vendor).data)
    if request.method == 'PUT':
        serializer = VendorSerializer(vendor, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    vendor.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


# ─────────────────────────────────────────────────── SO
@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def so_list(request):
    if request.method == 'GET':
        qs = SO.objects.select_related('vendor').all()
        q = request.query_params.get('q', '').strip()
        vendor_id = request.query_params.get('vendor', '').strip()
        date_from = request.query_params.get('date_from', '').strip()
        date_to = request.query_params.get('date_to', '').strip()
        if q:
            qs = qs.filter(Q(so_number__icontains=q))
        if vendor_id:
            qs = qs.filter(vendor_id=vendor_id)
        if date_from:
            qs = qs.filter(inbound_date__gte=date_from)
        if date_to:
            qs = qs.filter(inbound_date__lte=date_to)

        page = max(1, int(request.query_params.get('page', 1)))
        page_size = min(max(1, int(request.query_params.get('page_size', 15))), 200)
        total = qs.count()
        start = (page - 1) * page_size
        end = start + page_size
        data = SOSerializer(qs[start:end], many=True).data
        return Response({'total': total, 'page': page, 'page_size': page_size, 'results': data})

    serializer = SOSerializer(data=request.data)
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET', 'PUT', 'DELETE'])
@permission_classes([IsAuthenticated])
def so_detail(request, pk):
    so = get_object_or_404(
        SO.objects.select_related('vendor').prefetch_related('pallets__boards', 'photos'),
        pk=pk
    )
    if request.method == 'GET':
        return Response(SODetailSerializer(so, context={'request': request}).data)
    if request.method == 'PUT':
        serializer = SOSerializer(so, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    so.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


# ─────────────────────────────────────────────────── SO Photos
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def so_photo_upload(request, so_pk):
    so = get_object_or_404(SO, pk=so_pk)
    data = request.data.copy()
    data['so'] = so.pk
    serializer = SOPhotoSerializer(data=data, context={'request': request})
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def so_photo_delete(request, so_pk, pk):
    photo = get_object_or_404(SOPhoto, pk=pk, so_id=so_pk)
    photo.image.delete(save=False)
    photo.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


# ─────────────────────────────────────────────────── Pallets
@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def pallet_list(request, so_pk):
    so = get_object_or_404(SO, pk=so_pk)
    if request.method == 'GET':
        return Response(PalletSerializer(so.pallets.all(), many=True).data)
    data = request.data.copy()
    data['so'] = so.pk
    if 'pallet_seq' not in data:
        last_seq = so.pallets.order_by('-pallet_seq').values_list('pallet_seq', flat=True).first()
        data['pallet_seq'] = (last_seq or 0) + 1
    serializer = PalletSerializer(data=data)
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['PUT', 'DELETE'])
@permission_classes([IsAuthenticated])
def pallet_detail(request, so_pk, pk):
    pallet = get_object_or_404(Pallet, pk=pk, so_id=so_pk)
    if request.method == 'PUT':
        serializer = PalletSerializer(pallet, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    pallet.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(['POST', 'DELETE'])
@permission_classes([IsAuthenticated])
def pallet_photo(request, pk):
    pallet = get_object_or_404(Pallet, pk=pk)
    if request.method == 'POST':
        if not request.FILES.get('photo'):
            return Response({'error': 'No photo provided'}, status=status.HTTP_400_BAD_REQUEST)
        if pallet.photo:
            pallet.photo.delete(save=False)
        pallet.photo = request.FILES['photo']
        pallet.save()
        pallet.refresh_from_db()
        return Response(PalletSerializer(pallet, context={'request': request}).data)
    if pallet.photo:
        pallet.photo.delete(save=False)
        pallet.photo = None
        pallet.save()
    return Response(status=status.HTTP_204_NO_CONTENT)


# ─────────────────────────────────────────────────── Pallet Multi-Photos
@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def pallet_photos_list(request, pallet_pk):
    pallet = get_object_or_404(Pallet, pk=pallet_pk)
    if request.method == 'GET':
        photos = pallet.photos.all()
        return Response(PalletPhotoSerializer(photos, many=True, context={'request': request}).data)
    if 'image' not in request.FILES:
        return Response({'error': 'No image provided'}, status=status.HTTP_400_BAD_REQUEST)
    photo = PalletPhoto.objects.create(pallet=pallet, image=request.FILES['image'])
    return Response(PalletPhotoSerializer(photo, context={'request': request}).data, status=status.HTTP_201_CREATED)


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def pallet_photo_detail(request, pallet_pk, pk):
    photo = get_object_or_404(PalletPhoto, pk=pk, pallet_id=pallet_pk)
    photo.image.delete(save=False)
    photo.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


# ─────────────────────────────────────────────────── Box
@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def box_list(request, pallet_pk):
    pallet = get_object_or_404(Pallet.objects.select_related('so'), pk=pallet_pk)
    if request.method == 'GET':
        return Response(BoxSerializer(pallet.boxes.all(), many=True).data)

    # POST — add N boxes to the pallet. Every one carries the pallet's own barcode.
    count = max(1, min(_as_int(request.data.get('count', 1), 1), 500))
    note = request.data.get('note', '') or ''

    barcode = Box.compose_barcode(pallet)
    with transaction.atomic():
        created = [
            Box.objects.create(pallet=pallet, note=note, barcode=barcode)
            for _ in range(count)
        ]
    return Response(BoxSerializer(created, many=True).data, status=status.HTTP_201_CREATED)


@api_view(['PUT', 'DELETE'])
@permission_classes([IsAuthenticated])
def box_detail(request, pallet_pk, pk):
    box = get_object_or_404(Box, pk=pk, pallet_id=pallet_pk)
    if request.method == 'PUT':
        serializer = BoxSerializer(box, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    box.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def box_search(request):
    """Find box items by barcode (partial match), with the SO + pallet they live under so
    the caller can navigate straight to the box page."""
    q = request.query_params.get('q', '').strip()
    if not q:
        return Response([])
    qs = (Box.objects
          .select_related('pallet', 'pallet__so')
          .filter(barcode__icontains=q)
          .order_by('barcode')[:20])
    data = [{
        'id': c.id,
        'barcode': c.barcode,
        'note': c.note,
        'pallet_id': c.pallet_id,
        'pallet_label': c.pallet.licence_number or f'Pallet #{c.pallet.pallet_seq}',
        'so_id': c.pallet.so_id,
        'so_number': c.pallet.so.so_number,
    } for c in qs]
    return Response(data)


# ─────────────────────────────────────────────────── Checklist
def _clean_checklist_rows(items):
    """Normalise client-supplied checklist items. Returns (rows, error_message)."""
    rows = []
    for item in items:
        if not isinstance(item, dict):
            return None, 'each item must be an object'
        brand = item.get('brand') or ''
        model = item.get('model') or ''
        if not isinstance(brand, str) or not isinstance(model, str):
            return None, 'brand and model must be strings'
        rows.append({
            'brand': brand.strip()[:100],
            'model': model.strip()[:100],
            'qty': _as_int(item.get('qty'), None),
        })
    return rows, None


def _create_checklists(pallet, rows):
    """Allocate a contiguous block of checklist numbers and create one row per entry.

    Numbers are assigned here, never by the caller: two scanners each working out the
    next index on their own would both pick the same one. Locking the pallet row
    serialises concurrent allocations for the same pallet.
    """
    with transaction.atomic():
        Pallet.objects.select_for_update().filter(pk=pallet.pk).first()
        start = Checklist.next_index(pallet)
        return [
            Checklist.objects.create(
                pallet=pallet,
                barcode=Checklist.compose_barcode(pallet, start + offset),
                brand=row['brand'],
                model=row['model'],
                qty=row['qty'],
            )
            for offset, row in enumerate(rows)
        ]


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def checklist_list(request, pallet_pk):
    pallet = get_object_or_404(Pallet.objects.select_related('so'), pk=pallet_pk)
    if request.method == 'GET':
        return Response(ChecklistSerializer(pallet.checklists.all(), many=True).data)

    # POST — allocate N checklist labels. Takes either {"items": [{brand, model, qty}, ...]}
    # to pre-fill the rows, or {"count": N} for blank ones to be filled in later.
    items = request.data.get('items')
    if isinstance(items, list):
        rows, error = _clean_checklist_rows(items[:500])
        if error:
            return Response({'error': error}, status=status.HTTP_400_BAD_REQUEST)
    else:
        count = max(1, min(_as_int(request.data.get('count', 1), 1), 500))
        rows = [{'brand': '', 'model': '', 'qty': None} for _ in range(count)]

    created = _create_checklists(pallet, rows)
    return Response(ChecklistSerializer(created, many=True).data, status=status.HTTP_201_CREATED)


@api_view(['PUT', 'DELETE'])
@permission_classes([IsAuthenticated])
def checklist_detail(request, pallet_pk, pk):
    row = get_object_or_404(Checklist, pk=pk, pallet_id=pallet_pk)
    if request.method == 'PUT':
        serializer = ChecklistSerializer(row, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    row.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def checklist_search(request):
    """Find checklist lines by barcode (partial match), with the SO + pallet they belong to
    so a label picked up off the floor navigates straight to its pallet."""
    q = request.query_params.get('q', '').strip()
    if not q:
        return Response([])
    qs = (Checklist.objects
          .select_related('pallet', 'pallet__so')
          .filter(barcode__icontains=q)
          .order_by('barcode')[:20])
    data = [{
        'id': c.id,
        'barcode': c.barcode,
        'brand': c.brand,
        'model': c.model,
        'qty': c.qty,
        'pallet_id': c.pallet_id,
        'pallet_label': c.pallet.licence_number or f'Pallet #{c.pallet.pallet_seq}',
        'so_id': c.pallet.so_id,
        'so_number': c.pallet.so.so_number,
    } for c in qs]
    return Response(data)


# ─────────────────────────────────────────────────── Boards
@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def board_list_by_so(request, so_pk):
    so = get_object_or_404(SO, pk=so_pk)
    if request.method == 'POST':
        data = request.data.copy()
        data['so'] = so.pk
        serializer = BoardSerializer(data=data, context={'request': request})
        if serializer.is_valid():
            serializer.save()
            board = Board.objects.select_related('pallet', 'mpn').prefetch_related('mpn__chips__brand').get(pk=serializer.data['id'])
            return Response(BoardSerializer(board, context={'request': request}).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    # The boards tab only needs barcode / mpn / pallet, so it gets the lightweight
    # BoardListSerializer. Callers that need the chip BOM (the Excel export) pass
    # ?include_chips=1 to get the full BoardSerializer with nested chips.
    include_chips = request.query_params.get('include_chips', '').strip() in ('1', 'true', 'yes')
    if include_chips:
        qs = so.boards.select_related('pallet', 'mpn').prefetch_related('mpn__chips__brand')
        serializer_cls = BoardSerializer
    else:
        qs = so.boards.select_related('pallet', 'mpn').prefetch_related('mpn__chips')
        serializer_cls = BoardListSerializer
    date_from = request.query_params.get('date_from', '').strip()
    date_to = request.query_params.get('date_to', '').strip()
    pallet_id = request.query_params.get('pallet', '').strip()
    if date_from:
        qs = qs.filter(scanned_at__date__gte=date_from)
    if date_to:
        qs = qs.filter(scanned_at__date__lte=date_to)
    if pallet_id:
        qs = qs.filter(pallet_id=pallet_id)
    page = max(1, int(request.query_params.get('page', 1)))
    page_size = min(max(1, int(request.query_params.get('page_size', 8))), 10000)
    total = qs.count()
    start = (page - 1) * page_size
    data = serializer_cls(qs[start:start + page_size], many=True, context={'request': request}).data
    return Response({'total': total, 'page': page, 'page_size': page_size, 'results': data})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def board_bulk_create(request, so_pk):
    so = get_object_or_404(SO, pk=so_pk)
    items = request.data if isinstance(request.data, list) else []
    if not items:
        return Response({'error': 'No boards provided'}, status=status.HTTP_400_BAD_REQUEST)
    with transaction.atomic():
        created_ids = []
        for item in items:
            data = dict(item)
            data['so'] = so.pk
            serializer = BoardSerializer(data=data, context={'request': request})
            if not serializer.is_valid():
                return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
            serializer.save()
            created_ids.append(serializer.data['id'])
    boards = Board.objects.select_related('pallet', 'mpn').prefetch_related('mpn__chips__brand').filter(pk__in=created_ids)
    return Response(BoardSerializer(boards, many=True, context={'request': request}).data, status=status.HTTP_201_CREATED)


@api_view(['GET', 'PUT', 'DELETE'])
@permission_classes([IsAuthenticated])
def board_detail(request, pk):
    board = get_object_or_404(Board.objects.select_related('pallet', 'mpn').prefetch_related('mpn__chips__brand'), pk=pk)
    if request.method == 'GET':
        return Response(BoardSerializer(board, context={'request': request}).data)
    if request.method == 'PUT':
        serializer = BoardSerializer(board, data=request.data, partial=True, context={'request': request})
        if serializer.is_valid():
            serializer.save()
            board.refresh_from_db()
            return Response(BoardSerializer(board, context={'request': request}).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    board.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(['POST', 'DELETE'])
@permission_classes([IsAuthenticated])
def board_photo(request, pk):
    board = get_object_or_404(Board, pk=pk)
    if request.method == 'POST':
        if not request.FILES.get('photo'):
            return Response({'error': 'No photo provided'}, status=status.HTTP_400_BAD_REQUEST)
        if board.photo:
            board.photo.delete(save=False)
        board.photo = request.FILES['photo']
        board.save()
        board.refresh_from_db()
        return Response(BoardSerializer(board, context={'request': request}).data)
    # DELETE — remove photo
    if board.photo:
        board.photo.delete(save=False)
        board.photo = None
        board.save()
    return Response(status=status.HTTP_204_NO_CONTENT)


# ─────────────────────────────────────────────────── Chips
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def chip_create(request, board_pk):
    board = get_object_or_404(Board, pk=board_pk)
    if not board.mpn_id:
        return Response({'error': 'Board has no MPN set'}, status=status.HTTP_400_BAD_REQUEST)
    data = request.data.copy()
    data['mpn'] = board.mpn_id
    serializer = ChipSerializer(data=data)
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['PUT', 'DELETE'])
@permission_classes([IsAuthenticated])
def chip_detail(request, board_pk, pk):
    board = get_object_or_404(Board, pk=board_pk)
    chip = get_object_or_404(Chip, pk=pk, mpn=board.mpn)
    if request.method == 'PUT':
        serializer = ChipSerializer(chip, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    chip.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def mpn_chip_create(request, mpn_pk):
    mpn = get_object_or_404(MPN, pk=mpn_pk)
    data = request.data.copy()
    data['mpn'] = mpn.pk
    serializer = ChipSerializer(data=data)
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['PUT', 'DELETE'])
@permission_classes([IsAuthenticated])
def mpn_chip_detail(request, mpn_pk, pk):
    mpn = get_object_or_404(MPN, pk=mpn_pk)
    chip = get_object_or_404(Chip, pk=pk, mpn=mpn)
    if request.method == 'PUT':
        serializer = ChipSerializer(chip, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    chip.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(['POST', 'DELETE'])
@permission_classes([IsAuthenticated])
def chip_photo(request, mpn_pk, pk):
    chip = get_object_or_404(Chip, pk=pk, mpn_id=mpn_pk)
    if request.method == 'POST':
        if not request.FILES.get('photo'):
            return Response({'error': 'No photo provided'}, status=status.HTTP_400_BAD_REQUEST)
        if chip.chip_photo:
            chip.chip_photo.delete(save=False)
        chip.chip_photo = request.FILES['photo']
        chip.save()
        chip.refresh_from_db()
        return Response(ChipSerializer(chip, context={'request': request}).data)
    if chip.chip_photo:
        chip.chip_photo.delete(save=False)
        chip.chip_photo = None
        chip.save()
    return Response(status=status.HTTP_204_NO_CONTENT)


# ─────────────────────────────────────────────────── ChipBrand
@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def chipbrand_list(request):
    if request.method == 'GET':
        return Response(ChipBrandSerializer(ChipBrand.objects.all(), many=True).data)
    serializer = ChipBrandSerializer(data=request.data)
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['PUT', 'DELETE'])
@permission_classes([IsAuthenticated])
def chipbrand_detail(request, pk):
    brand = get_object_or_404(ChipBrand, pk=pk)
    if request.method == 'PUT':
        serializer = ChipBrandSerializer(brand, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    brand.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


# ─────────────────────────────────────────────────── Scanner (Zebra)
@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def scanner_so_photo_upload(request, so_pk):
    err = _check_scanner_key(request)
    if err:
        return err
    so = get_object_or_404(SO, pk=so_pk)
    data = request.data.copy()
    data['so'] = so.pk
    serializer = SOPhotoSerializer(data=data, context={'request': request})
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def scanner_board_photo(request, board_pk):
    err = _check_scanner_key(request)
    if err:
        return err
    board = get_object_or_404(Board, pk=board_pk)
    if not request.FILES.get('photo'):
        return Response({'error': 'No photo provided'}, status=status.HTTP_400_BAD_REQUEST)
    if board.photo:
        board.photo.delete(save=False)
    board.photo = request.FILES['photo']
    board.save()
    return Response({'success': True})

@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def scanner_so_pallets(request, so_pk):
    err = _check_scanner_key(request)
    if err:
        return err
    so = get_object_or_404(SO, pk=so_pk)
    return Response(PalletSerializer(so.pallets.all(), many=True).data)

@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def scanner_vendor_list(request):
    err = _check_scanner_key(request)
    if err:
        return err
    vendors = Vendor.objects.all()
    return Response(VendorSerializer(vendors, many=True).data)


@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def scanner_vendor_detail(request, pk):
    err = _check_scanner_key(request)
    if err:
        return err
    vendor = get_object_or_404(Vendor, pk=pk)
    return Response(VendorSerializer(vendor).data)


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def scanner_api(request):
    err = _check_scanner_key(request)
    if err:
        return err
    data = request.data
    action = data.get('action', '')
    try:
        if action == 'lot_inbound':
            return _lot_inbound(data)
        elif action == 'board_inbound':
            return _board_inbound(data)
        elif action == 'find_so_number':
            return _find_so_number(data)
        elif action == 'so_search':
            return _so_search(data)
        else:
            return Response({'success': False, 'error': f'Unknown action: {action}'}, status=400)
    except Exception as e:
        return Response({'success': False, 'error': str(e)}, status=500)


def _find_so_number(data):
    barcode = data.get('barcode', '')
    so = SO.objects.filter(so_number=barcode).select_related('vendor').first()
    if not so:
        return Response({'success': False, 'error': 'SO not found'}, status=404)
    return Response({'success': True, 'data': SOSerializer(so).data})


def _lot_inbound(data):
    so_number = data.get('so_number', '').strip()
    vendor_name = data.get('vender', data.get('vendor', '')).strip()
    date_str = data.get('date', '')
    pallet_weight = data.get('pallet_weight', 0)
    pallet_qty = data.get('pallet_qty', 1)
    weight_rule = data.get('weight_rule', '').strip()

    if not so_number:
        return Response({'success': False, 'error': 'so_number required'}, status=400)

    vendor, _ = Vendor.objects.get_or_create(
        name=vendor_name or 'Unknown',
        defaults={'default_weight_rule': 'per_pallet'}
    )
    so_defaults = {
        'vendor': vendor,
        'inbound_date': date_str or '2000-01-01',
    }
    if weight_rule in ('per_pallet', 'aggregated'):
        so_defaults['weight_rule'] = weight_rule
    so, _ = SO.objects.get_or_create(
        so_number=so_number,
        defaults=so_defaults,
    )
    last_seq = so.pallets.order_by('-pallet_seq').values_list('pallet_seq', flat=True).first()
    pallet = Pallet.objects.create(
        so=so,
        pallet_seq=(last_seq or 0) + 1,
        in_weight_gross=pallet_weight or 0,
        qty=pallet_qty or 1,
        licence_number=data.get('licence_number', ''),
        gateload_number=data.get('gateload_number', ''),
        material_type=data.get('material_type', ''),     # ← add
        location=data.get('location', ''),               # ← add
        board_qty=data.get('board_qty') or None,
    )
    return Response({'success': True, 'data': {
        'so': SOSerializer(so).data,
        'pallet': PalletSerializer(pallet).data,
    }})


def _board_inbound(data):
    so_number = data.get('so_number', '').strip()
    if not so_number:
        return Response({'success': False, 'error': 'so_number required'}, status=400)
    so = SO.objects.filter(so_number=so_number).first()
    if not so:
        return Response({'success': False, 'error': 'SO not found'}, status=404)

    barcodes = data.get('barcodes', [])
    if not barcodes:
        bc = data.get('barcode', '')
        if bc:
            barcodes = [bc]

    pallet_id = data.get('pallet_id')
    pallet_obj = None
    if pallet_id:
        pallet_obj = Pallet.objects.filter(pk=pallet_id, so=so).first()


    mpn_name = data.get('mpn', '').strip()
    mpn_obj = None
    if mpn_name:
        mpn_obj, _ = MPN.objects.get_or_create(name=mpn_name)
    created = []
    for bc in barcodes:
        board = Board.objects.create(
            so=so,
            pallet=pallet_obj,
            barcode=bc,
            qty=data.get('qty', 1),
            mpn=mpn_obj,
        )
        created.append(board)
    return Response({'success': True, 'data': BoardSerializer(created, many=True).data})

def _so_search(data):
    q = data.get('q', '').strip()
    if not q:
        return Response({'success': True, 'data': []})
    sos = SO.objects.select_related('vendor').filter(
        Q(so_number__icontains=q)
    )[:20]
    results = [
        {
            'id': so.id,
            'so_number': so.so_number,
            'vendor_name': so.vendor.name,
            'date': str(so.inbound_date),
            'effective_weight_rule': so.effective_weight_rule,
        }
        for so in sos
    ]
    return Response({'success': True, 'data': results})

@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def scanner_pallet_photo_upload(request, pallet_pk):
    err = _check_scanner_key(request)
    if err:
        return err
    pallet = get_object_or_404(Pallet, pk=pallet_pk)
    serializer = PalletPhotoSerializer(data=request.data, context={'request': request})
    if serializer.is_valid():
        serializer.save(pallet=pallet)
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

# ─────────────────────────────────────────────────── Scanner: box label printer

@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def scanner_pallet_lookup(request):
    """按 licence_number 查托盘。licence_number 在库层面并不唯一，
    因此取最新一条，并用 multiple_matches 告知调用方需要人工核对。"""
    err = _check_scanner_key(request)
    if err:
        return err

    barcode = request.query_params.get('barcode', '').strip()
    if not barcode:
        return Response({'success': False, 'error': 'Pallet not found'}, status=404)

    # 按 id 二次排序：同一秒内建的两条托盘 created_at 可能相同，
    # 只按 created_at 排会导致「取最新」不确定。
    matches = (Pallet.objects
               .select_related('so')
               .filter(licence_number=barcode)
               .order_by('-created_at', '-id'))
    pallet = matches.first()
    if pallet is None:
        return Response({'success': False, 'error': 'Pallet not found'}, status=404)

    return Response({'success': True, 'data': {
        'pallet_id': pallet.id,
        'so_id': pallet.so_id,
        'so_number': pallet.so.so_number,
        'licence_number': pallet.licence_number,
        'gateload_number': pallet.gateload_number,
        # 服务器直接给出组装好的托盘条码，设备照它打印即可，不必自己再拼一次
        # so/licence/gateload——两边各拼一次迟早会拼出不一样的结果。
        'pallet_barcode': pallet.compose_barcode(),
        'existing_box_count': pallet.boxes.count(),
        'existing_checklist_count': pallet.checklists.count(),
        'multiple_matches': matches.count() > 1,
    }})

@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def scanner_box_bulk_create(request, pallet_pk):
    """把托盘的箱数补齐到设备上报的数量。

    箱子条码现在与托盘条码完全相同，无法再按条码去重，因此改成数量语义：
    len(boxes) 表示设备认为这个托盘一共有几箱，服务器只增不减地补到该数量。
    同一台设备重复上传同一个数量即无操作（幂等）。

    请求体里的 barcode 字段被忽略——条码由服务器按托盘统一组装，避免设备端和
    服务器端各拼一次而拼出不同结果。note 按顺序分配给真正新建的那几行。

    多设备注意：两台设备各自只知道自己扫的箱数时，服务器会取较大值而不是相加。
    设备应先 GET scanner/pallets/<pk>/boxes/ 拿到服务器当前箱数，合并后再上报总数。
    """
    err = _check_scanner_key(request)
    if err:
        return err

    try:
        pallet = Pallet.objects.select_related('so').get(pk=pallet_pk)
    except Pallet.DoesNotExist:
        return Response({'success': False, 'error': 'Pallet not found'}, status=404)
    if not isinstance(request.data, dict):
        return Response({'success': False, 'error': 'request body must be a JSON object'}, status=400)
    items = request.data.get('boxes') or []
    if not isinstance(items, list):
        return Response({'success': False, 'error': 'boxes must be a list'}, status=400)

    notes = []
    for item in items:
        if not isinstance(item, dict):
            return Response({'success': False, 'error': 'each box must be an object'}, status=400)
        note = item.get('note') or ''
        if not isinstance(note, str):
            return Response({'success': False, 'error': 'note must be a string'}, status=400)
        notes.append(note)

    target = min(len(notes), 500)
    barcode = Box.compose_barcode(pallet)
    created = []

    with transaction.atomic():
        Pallet.objects.select_for_update().filter(pk=pallet.pk).first()
        existing = list(pallet.boxes.values_list('barcode', flat=True))
        for i in range(len(existing), target):
            box = Box.objects.create(pallet=pallet, barcode=barcode, note=notes[i])
            created.append({'id': box.id, 'barcode': box.barcode})

    return Response({'success': True, 'data': {
        'created': created,
        'skipped': existing[:target],
        'total': len(existing) + len(created),
    }})


@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def scanner_box_list(request, pallet_pk):
    """设备端读取某托盘服务器上的全部 box，用于多设备下的标签列表合并。"""
    err = _check_scanner_key(request)
    if err:
        return err

    try:
        pallet = Pallet.objects.get(pk=pallet_pk)
    except Pallet.DoesNotExist:
        return Response({'success': False, 'error': 'Pallet not found'}, status=404)

    boxes = [{
        'id': c.id,
        'barcode': c.barcode,
        'note': c.note,
        'created_at': c.created_at.isoformat(),
    } for c in pallet.boxes.all()]
    return Response({'success': True, 'data': {'boxes': boxes}})


def _checklist_payload(c):
    return {
        'id': c.id,
        'barcode': c.barcode,
        'brand': c.brand,
        'model': c.model,
        'qty': c.qty,
        'created_at': c.created_at.isoformat(),
    }


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def scanner_checklist_bulk_create(request, pallet_pk):
    """切板后开清單：设备上报要几条以及每条的 brand/model/qty，服务器分配连续序号、
    组装条码并回传，供设备打印。

    条码由服务器生成而不是设备拼装——两台设备各自推算下一个序号会同时算出 -1。
    请求体 {"items": [{"brand", "model", "qty"}, ...]}；也接受 {"count": N} 建空行。
    """
    err = _check_scanner_key(request)
    if err:
        return err

    try:
        pallet = Pallet.objects.select_related('so').get(pk=pallet_pk)
    except Pallet.DoesNotExist:
        return Response({'success': False, 'error': 'Pallet not found'}, status=404)
    if not isinstance(request.data, dict):
        return Response({'success': False, 'error': 'request body must be a JSON object'}, status=400)

    items = request.data.get('items')
    if items is None:
        count = min(_as_int(request.data.get('count', 0), 0), 500)
        if count < 1:
            return Response({'success': False, 'error': 'items or count required'}, status=400)
        rows = [{'brand': '', 'model': '', 'qty': None} for _ in range(count)]
    else:
        if not isinstance(items, list):
            return Response({'success': False, 'error': 'items must be a list'}, status=400)
        if not items:
            return Response({'success': False, 'error': 'items must not be empty'}, status=400)
        rows, error = _clean_checklist_rows(items[:500])
        if error:
            return Response({'success': False, 'error': error}, status=400)

    created = _create_checklists(pallet, rows)
    return Response({'success': True, 'data': {
        'checklists': [_checklist_payload(c) for c in created],
    }})


@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def scanner_checklist_list(request, pallet_pk):
    """设备端读取某托盘服务器上的全部清單，用于多设备下的标签列表合并。"""
    err = _check_scanner_key(request)
    if err:
        return err

    try:
        pallet = Pallet.objects.get(pk=pallet_pk)
    except Pallet.DoesNotExist:
        return Response({'success': False, 'error': 'Pallet not found'}, status=404)

    return Response({'success': True, 'data': {
        'checklists': [_checklist_payload(c) for c in pallet.checklists.all()],
    }})


# ─────────────────────────────────────────────────── Dashboard
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def dashboard_stats(request):
    from django.utils import timezone
    from datetime import timedelta
    from django.db.models import Count, Sum

    today = timezone.localdate()
    today_so_count = SO.objects.filter(inbound_date=today).count()

    month_start = today.replace(day=1)
    pallets_this_month = Pallet.objects.filter(
        created_at__date__gte=month_start
    ).aggregate(total=Sum('qty'))['total'] or 0

    thirty_days_ago = today - timedelta(days=29)
    daily_counts_qs = (
        SO.objects.filter(inbound_date__gte=thirty_days_ago)
        .values('inbound_date')
        .annotate(count=Count('id'))
        .order_by('inbound_date')
    )
    daily_map = {str(row['inbound_date']): row['count'] for row in daily_counts_qs}
    daily_counts = [
        {'date': str(thirty_days_ago + timedelta(days=i)),
         'count': daily_map.get(str(thirty_days_ago + timedelta(days=i)), 0)}
        for i in range(30)
    ]

    top_vendors = list(
        Vendor.objects.annotate(pallet_count=Sum('sos__pallets__qty'))
        .filter(pallet_count__isnull=False)
        .order_by('-pallet_count')[:5]
        .values('name', 'pallet_count')
    )

    recent_pallets = Pallet.objects.select_related('so__vendor').order_by('-created_at')[:10]
    recent_data = [{
        'id': p.id,
        'licence_number': p.licence_number,
        'pallet_seq': p.pallet_seq,
        'so_number': p.so.so_number,
        'so_id': p.so_id,
        'vendor': p.so.vendor.name,
        'created_at': p.created_at.strftime('%Y-%m-%d %H:%M'),
    } for p in recent_pallets]

    return Response({
        'today_so_count': today_so_count,
        'pallets_this_month': pallets_this_month,
        'daily_counts': daily_counts,
        'top_vendors': top_vendors,
        'recent_pallets': recent_data,
    })


# ─────────────────────────────────────────────── MPN Report Email

@api_view(['GET', 'PUT'])
@permission_classes([IsAuthenticated])
def mpn_report_config(request):
    config = MPNReportConfig.get_config()
    if request.method == 'GET':
        return Response(MPNReportConfigSerializer(config).data)
    s = MPNReportConfigSerializer(config, data=request.data, partial=True)
    if not s.is_valid():
        return Response(s.errors, status=status.HTTP_400_BAD_REQUEST)
    s.save()
    return Response(s.data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def mpn_report_last_send(request):
    record = MPNReportEmail.objects.first()  # Meta ordering=-sent_at
    return Response({'record': MPNReportEmailSerializer(record).data if record else None})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def mpn_report_send_now(request):
    from django.core.management import call_command
    try:
        call_command('send_mpn_report', triggered_by='manual')
    except Exception:
        pass  # error already persisted in MPNReportEmail
    record = MPNReportEmail.objects.first()
    if record is None:
        return Response({'error': 'No recipient configured.'}, status=status.HTTP_400_BAD_REQUEST)
    return Response(MPNReportEmailSerializer(record).data, status=status.HTTP_201_CREATED)


# ─────────────────────────────────────────────────── Pallet Chip Containers
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def so_chip_containers(request, so_pk):
    so = get_object_or_404(SO, pk=so_pk)
    # Blank-UID containers are returned too: their actual_qty still counts toward the
    # per-chip harvested totals in the export. Callers that render an inventory listing
    # filter them out themselves.
    qs = (
        PalletChipContainer.objects
        .filter(pallet__so=so)
        .select_related('chip', 'chip__brand', 'pallet')
        .order_by('pallet__pallet_seq', 'id')
    )
    return Response(PalletChipContainerWithChipSerializer(qs, many=True).data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def pallet_chip_container_list(request, pallet_pk):
    pallet = get_object_or_404(Pallet, pk=pallet_pk)
    qs = PalletChipContainer.objects.filter(pallet=pallet).select_related('chip')
    mpn_id = request.query_params.get('mpn_id')
    if mpn_id:
        qs = qs.filter(chip__mpn_id=mpn_id)
    return Response(PalletChipContainerSerializer(qs, many=True).data)


@api_view(['PUT'])
@permission_classes([IsAuthenticated])
def pallet_chip_container_upsert(request, pallet_pk, chip_pk):
    pallet = get_object_or_404(Pallet, pk=pallet_pk)
    chip = get_object_or_404(Chip, pk=chip_pk)
    container_uid = request.data.get('container_uid', '')
    actual_qty = request.data.get('actual_qty', None)
    if actual_qty is not None:
        try:
            actual_qty = int(actual_qty)
        except (TypeError, ValueError):
            actual_qty = None
    obj, _ = PalletChipContainer.objects.update_or_create(
        pallet=pallet, chip=chip,
        defaults={'container_uid': container_uid, 'actual_qty': actual_qty},
    )
    return Response(PalletChipContainerSerializer(obj).data)
