from rest_framework.decorators import api_view, permission_classes,authentication_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework import status
from rest_framework.views import APIView
from django.shortcuts import get_object_or_404
from django.db.models import Q
from django.db import transaction
from .models import Vendor, SO, SOPhoto, Pallet, Board, ChipBrand, Chip, MPN
from .serializer import (
    VendorSerializer, SOSerializer, SODetailSerializer,
    SOPhotoSerializer, PalletSerializer, BoardSerializer,
    ChipBrandSerializer, ChipSerializer,
)


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
            qs = qs.filter(date__gte=date_from)
        if date_to:
            qs = qs.filter(date__lte=date_to)

        page = int(request.query_params.get('page', 1))
        page_size = int(request.query_params.get('page_size', 15))
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
        SO.objects.select_related('vendor').prefetch_related('pallets', 'photos'),
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
    qs = so.boards.select_related('pallet', 'mpn').prefetch_related('mpn__chips__brand')
    date_from = request.query_params.get('date_from', '').strip()
    date_to = request.query_params.get('date_to', '').strip()
    pallet_id = request.query_params.get('pallet', '').strip()
    if date_from:
        qs = qs.filter(scanned_at__date__gte=date_from)
    if date_to:
        qs = qs.filter(scanned_at__date__lte=date_to)
    if pallet_id:
        qs = qs.filter(pallet_id=pallet_id)
    page = int(request.query_params.get('page', 1))
    page_size = int(request.query_params.get('page_size', 8))
    total = qs.count()
    start = (page - 1) * page_size
    data = BoardSerializer(qs[start:start + page_size], many=True, context={'request': request}).data
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
    mpn_id = board.mpn_id
    board.delete()
    if mpn_id and not Board.objects.filter(mpn_id=mpn_id).exists():
        MPN.objects.filter(pk=mpn_id).delete()
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
    so = get_object_or_404(SO, pk=so_pk)
    return Response(PalletSerializer(so.pallets.all(), many=True).data)

@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def scanner_vendor_list(request):
    vendors = Vendor.objects.all()
    return Response(VendorSerializer(vendors, many=True).data)


@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def scanner_vendor_detail(request, pk):
    vendor = get_object_or_404(Vendor, pk=pk)
    return Response(VendorSerializer(vendor).data)


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def scanner_api(request):
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
        'date': date_str or '2000-01-01',
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
        weight=pallet_weight or 0,
        qty=pallet_qty or 1,
        licence_number=data.get('licence_number', ''),
        payload_number=data.get('payload_number', ''),
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
            catalog=data.get('catalog', ''),
            weight=data.get('weight') or None,
            qty=data.get('qty', 1),
            mpn=mpn_obj,
            note=data.get('noted', data.get('note', '')),
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
            'date': str(so.date),
            'effective_weight_rule': so.effective_weight_rule,
        }
        for so in sos
    ]
    return Response({'success': True, 'data': results})

# ─────────────────────────────────────────────────── Dashboard
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def dashboard_stats(request):
    from django.utils import timezone
    from datetime import timedelta
    from django.db.models import Count, Sum

    today = timezone.localdate()
    today_so_count = SO.objects.filter(date=today).count()

    month_start = today.replace(day=1)
    pallets_this_month = Pallet.objects.filter(
        created_at__date__gte=month_start
    ).aggregate(total=Sum('qty'))['total'] or 0

    thirty_days_ago = today - timedelta(days=29)
    daily_counts_qs = (
        SO.objects.filter(date__gte=thirty_days_ago)
        .values('date')
        .annotate(count=Count('id'))
        .order_by('date')
    )
    daily_map = {str(row['date']): row['count'] for row in daily_counts_qs}
    daily_counts = [
        {'date': str(thirty_days_ago + timedelta(days=i)),
         'count': daily_map.get(str(thirty_days_ago + timedelta(days=i)), 0)}
        for i in range(30)
    ]

    top_vendors = list(
        Vendor.objects.annotate(board_count=Count('sos__boards'))
        .order_by('-board_count')[:5]
        .values('name', 'board_count')
    )

    recent_boards = Board.objects.select_related('so__vendor', 'mpn').order_by('-scanned_at')[:10]
    recent_data = [{
        'id': b.id,
        'barcode': b.barcode,
        'so_number': b.so.so_number,
        'so_id': b.so_id,
        'vendor': b.so.vendor.name,
        'mpn': b.mpn.name if b.mpn_id else '',
        'qty': b.qty,
        'scanned_at': b.scanned_at.strftime('%Y-%m-%d %H:%M'),
    } for b in recent_boards]

    return Response({
        'today_so_count': today_so_count,
        'pallets_this_month': pallets_this_month,
        'daily_counts': daily_counts,
        'top_vendors': top_vendors,
        'recent_boards': recent_data,
    })
