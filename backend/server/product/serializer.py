from rest_framework import serializers
from django.conf import settings
from .models import (
    Vendor, SO, SOPhoto, Pallet, PalletPhoto, Board, ChipBrand, Chip, MPN,
    MPNReportConfig, MPNReportEmail, PalletChipContainer, Box, Checklist,
    MsftApiConfig, MsftJobInfo, MsftCreditUnit, MsftPaymentNotice, MsftApiLog,
    MsftCompanyCode, MsftUnitType, MSFT_BUYBACK_UNIT_TYPES,
)
import os


class VendorSerializer(serializers.ModelSerializer):
    so_count = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Vendor
        fields = ['id', 'name', 'default_weight_rule', 'so_count']

    def get_so_count(self, obj):
        return obj.sos.count()


class SOPhotoSerializer(serializers.ModelSerializer):
    image_url = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = SOPhoto
        fields = ['id', 'so', 'image', 'caption', 'uploaded_at', 'image_url']
        read_only_fields = ['uploaded_at']

    def get_image_url(self, obj):
        if not obj.image:
            return None
        public_domain = os.getenv('PUBLIC_DOMAIN', '')
        if public_domain:
            return f"{public_domain}{obj.image.url}"
        request = self.context.get('request')
        if request:
            return request.build_absolute_uri(obj.image.url)
        return obj.image.url


class PalletPhotoSerializer(serializers.ModelSerializer):
    image_url = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = PalletPhoto
        fields = ['id', 'image', 'image_url', 'uploaded_at']
        read_only_fields = ['uploaded_at', 'image_url']

    def get_image_url(self, obj):
        if not obj.image:
            return None
        public_domain = os.getenv('PUBLIC_DOMAIN', '')
        if public_domain:
            return f"{public_domain}/media/{obj.image.name}"
        request = self.context.get('request')
        if request:
            return request.build_absolute_uri(obj.image.url)
        return obj.image.url


class PalletSerializer(serializers.ModelSerializer):
    board_count = serializers.SerializerMethodField(read_only=True)
    box_count = serializers.SerializerMethodField(read_only=True)
    checklist_count = serializers.SerializerMethodField(read_only=True)
    photo_url = serializers.SerializerMethodField(read_only=True)
    photos = PalletPhotoSerializer(many=True, read_only=True)

    class Meta:
        model = Pallet
        fields = ['id', 'so', 'pallet_seq', 'licence_number', 'gateload_number', 'location', 'photo', 'photo_url', 'photos', 'in_weight_gross', 'actual_weight', 'out_weight_gross', 'out_weight_net', 'tantalum_wt', 'material_type', 'qty', 'board_qty', 'board_count', 'box_count', 'checklist_count', 'created_at']
        read_only_fields = ['created_at', 'photo_url', 'photos']

    def get_board_count(self, obj):
        return obj.boards.count()

    def get_box_count(self, obj):
        return obj.boxes.count()

    def get_checklist_count(self, obj):
        return obj.checklists.count()

    def get_photo_url(self, obj):
        if not obj.photo:
            return None
        public_domain = os.getenv('PUBLIC_DOMAIN', '')
        if public_domain:
            return f"{public_domain}/media/{obj.photo.name}"
        request = self.context.get('request')
        if request:
            return request.build_absolute_uri(obj.photo.url)
        return obj.photo.url


class BoxSerializer(serializers.ModelSerializer):
    class Meta:
        model = Box
        fields = ['id', 'pallet', 'barcode', 'note', 'created_at']
        read_only_fields = ['pallet', 'barcode', 'created_at']


class ChecklistSerializer(serializers.ModelSerializer):
    class Meta:
        model = Checklist
        fields = ['id', 'pallet', 'barcode', 'brand', 'model', 'qty', 'created_at']
        # barcode is composed server-side; a client editing it would break next_index().
        read_only_fields = ['pallet', 'barcode', 'created_at']


class ChipSerializer(serializers.ModelSerializer):
    brand_name = serializers.SerializerMethodField(read_only=True)
    chip_photo_url = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Chip
        fields = ['id', 'mpn', 'brand', 'brand_name', 'chip_mpn', 'chip_type', 'chip_photo', 'chip_photo_url', 'qty', 'slot_group', 'item_group', 'chip_cost', 'description', 'processed_type', 'packaging_type']

    def get_brand_name(self, obj):
        if obj.brand:
            return obj.brand.name
        return None

    def get_chip_photo_url(self, obj):
        if not obj.chip_photo:
            return None
        public_domain = os.getenv('PUBLIC_DOMAIN', '')
        if public_domain:
            return f"{public_domain}{obj.chip_photo.url}"
        request = self.context.get('request')
        if request:
            return request.build_absolute_uri(obj.chip_photo.url)
        return obj.chip_photo.url


class MPNSerializer(serializers.ModelSerializer):
    beforecut_photo_url = serializers.SerializerMethodField(read_only=True)
    aftercut_photo_url = serializers.SerializerMethodField(read_only=True)
    board_count = serializers.SerializerMethodField(read_only=True)
    chip_brands = serializers.SerializerMethodField(read_only=True)
    latest_board_date = serializers.SerializerMethodField(read_only=True)
    slot_count = serializers.IntegerField(read_only=True)
    chips_per_board = serializers.IntegerField(read_only=True)

    class Meta:
        model = MPN
        fields = ['id', 'name', 'part_type', 'beforecut_weight', 'aftercut_weight', 'chip_qty', 'cutboard_cost', 'note', 'created_at', 'beforecut_photo_url', 'aftercut_photo_url', 'board_count', 'chip_brands', 'latest_board_date', 'slot_count', 'chips_per_board']
        read_only_fields = ['created_at']

    def get_board_count(self, obj):
        return obj.boards.count()

    def get_chip_brands(self, obj):
        return list(obj.chips.values_list('brand__name', flat=True))

    def get_latest_board_date(self, obj):
        from django.db.models import Max
        result = obj.boards.aggregate(latest=Max('scanned_at'))['latest']
        if result:
            return result.strftime('%Y-%m-%d')
        return None

    def get_beforecut_photo_url(self, obj):
        if not obj.beforecut_photo:
            return None
        public_domain = os.getenv('PUBLIC_DOMAIN', '')
        if public_domain:
            return f"{public_domain}{obj.beforecut_photo.url}"
        request = self.context.get('request')
        if request:
            return request.build_absolute_uri(obj.beforecut_photo.url)
        return obj.beforecut_photo.url

    def get_aftercut_photo_url(self, obj):
        if not obj.aftercut_photo:
            return None
        public_domain = os.getenv('PUBLIC_DOMAIN', '')
        if public_domain:
            return f"{public_domain}{obj.aftercut_photo.url}"
        request = self.context.get('request')
        if request:
            return request.build_absolute_uri(obj.aftercut_photo.url)
        return obj.aftercut_photo.url


class MPNDetailSerializer(MPNSerializer):
    chips = ChipSerializer(many=True, read_only=True)

    class Meta(MPNSerializer.Meta):
        fields = MPNSerializer.Meta.fields + ['chips']


class MPNField(serializers.Field):
    """Serializes Board.mpn as a full MPN object; accepts a string name or {id, name} dict on write."""

    def to_representation(self, value):
        if not value:
            return None
        return MPNSerializer(value).data

    def to_internal_value(self, data):
        if data is None or data == '':
            return None
        if isinstance(data, int):
            try:
                return MPN.objects.get(pk=data)
            except MPN.DoesNotExist:
                raise serializers.ValidationError(f'MPN with id {data} not found.')
        if isinstance(data, dict):
            mpn_id = data.get('id')
            if mpn_id:
                try:
                    return MPN.objects.get(pk=mpn_id)
                except MPN.DoesNotExist:
                    pass
            name = str(data.get('name', '')).strip()
            if name:
                mpn, _ = MPN.objects.get_or_create(name=name)
                return mpn
            return None
        name = str(data).strip()
        if not name:
            return None
        mpn, _ = MPN.objects.get_or_create(name=name)
        return mpn


class BoardSerializer(serializers.ModelSerializer):
    mpn = MPNField(allow_null=True, required=False, default=None)
    chips = serializers.SerializerMethodField(read_only=True)
    chip_count = serializers.SerializerMethodField(read_only=True)
    photo_url = serializers.SerializerMethodField(read_only=True)
    pallet_label = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Board
        fields = [
            'id', 'so', 'pallet', 'pallet_label', 'barcode',
            'mpn', 'qty',
            'photo', 'photo_url', 'scanned_at',
            'chips', 'chip_count',
        ]
        read_only_fields = ['scanned_at']

    def get_chips(self, obj):
        if not obj.mpn_id:
            return []
        return ChipSerializer(obj.mpn.chips.all(), many=True, context=self.context).data

    def get_chip_count(self, obj):
        if not obj.mpn_id:
            return 0
        return sum(c.qty or 0 for c in obj.mpn.chips.all())

    def get_pallet_label(self, obj):
        if not obj.pallet_id:
            return None
        p = obj.pallet
        parts = [x for x in [p.licence_number, p.gateload_number] if x]
        return '-'.join(parts) if parts else f'#{p.pallet_seq:02d}'

    def get_photo_url(self, obj):
        if not obj.photo:
            return None
        public_domain = os.getenv('PUBLIC_DOMAIN', '')
        if public_domain:
            return f"{public_domain}{obj.photo.url}"
        request = self.context.get('request')
        if request:
            return request.build_absolute_uri(obj.photo.url)
        return obj.photo.url


class MPNLiteSerializer(serializers.ModelSerializer):
    """Trimmed MPN payload for the boards-list grouping UI.

    Deliberately omits MPNSerializer's SerializerMethodFields (board_count, chip_brands,
    latest_board_date) — each fires its own COUNT/aggregate query, so including them means
    one extra query per board (hundreds per page). `chips_per_board` is a model property
    served off the prefetched chips, so it costs no extra query. The boards tab only needs
    these fields.
    """
    chips_per_board = serializers.IntegerField(read_only=True)

    class Meta:
        model = MPN
        fields = ['id', 'name', 'part_type', 'created_at', 'chips_per_board']


class BoardListSerializer(serializers.ModelSerializer):
    """Lightweight board row for the SO boards tab.

    Drops the per-board `chips`/`chip_count` payload — it is unused by the list UI and is
    identical for every board of the same MPN — and swaps the full MPN object for
    MPNLiteSerializer. Use the full BoardSerializer (via ?include_chips=1) when the chip BOM
    is actually needed, e.g. the Excel export.
    """
    mpn = MPNLiteSerializer(read_only=True)
    pallet_label = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Board
        fields = ['id', 'so', 'pallet', 'pallet_label', 'barcode', 'mpn', 'qty', 'scanned_at']
        read_only_fields = ['scanned_at']

    def get_pallet_label(self, obj):
        if not obj.pallet_id:
            return None
        p = obj.pallet
        parts = [x for x in [p.licence_number, p.gateload_number] if x]
        return '-'.join(parts) if parts else f'#{p.pallet_seq:02d}'


class SOSerializer(serializers.ModelSerializer):
    vendor_name = serializers.SerializerMethodField(read_only=True)
    vendor_weight_rule = serializers.SerializerMethodField(read_only=True)
    effective_weight_rule = serializers.SerializerMethodField(read_only=True)
    total_pallet_count = serializers.SerializerMethodField(read_only=True)
    pallet_record_count = serializers.SerializerMethodField(read_only=True)
    total_pallet_weight = serializers.SerializerMethodField(read_only=True)
    total_board_count = serializers.SerializerMethodField(read_only=True)
    total_board_qty = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = SO
        fields = [
            'id', 'so_number', 'vendor', 'vendor_name', 'vendor_weight_rule',
            'weight_rule', 'effective_weight_rule',
            'inbound_date', 'outbound_date', 'note', 'created_at',
            'total_pallet_count', 'pallet_record_count', 'total_pallet_weight',
            'total_board_count', 'total_board_qty',
        ]
        read_only_fields = ['created_at']

    def get_vendor_name(self, obj):
        return obj.vendor.name if obj.vendor_id else None

    def get_vendor_weight_rule(self, obj):
        return obj.vendor.default_weight_rule if obj.vendor_id else None

    def get_effective_weight_rule(self, obj):
        return obj.effective_weight_rule

    def get_total_pallet_count(self, obj):
        return obj.total_pallet_count

    def get_pallet_record_count(self, obj):
        return obj.pallet_record_count

    def get_total_pallet_weight(self, obj):
        w = obj.total_pallet_weight
        return str(w) if w is not None else '0'

    def get_total_board_count(self, obj):
        return obj.total_board_count

    def get_total_board_qty(self, obj):
        return obj.total_board_qty


class SODetailSerializer(SOSerializer):
    """Extended SO serializer that includes pallets and boards."""
    pallets = PalletSerializer(many=True, read_only=True)
    photos = SOPhotoSerializer(many=True, read_only=True)

    class Meta(SOSerializer.Meta):
        fields = SOSerializer.Meta.fields + ['pallets', 'photos']


class ChipBrandSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChipBrand
        fields = ['id', 'name']


class MPNReportConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = MPNReportConfig
        fields = ['recipient', 'cc', 'auto_send_enabled', 'send_time', 'updated_at']
        read_only_fields = ['updated_at']


class MPNReportEmailSerializer(serializers.ModelSerializer):
    class Meta:
        model = MPNReportEmail
        fields = ['id', 'sent_at', 'sent_to', 'cc', 'status', 'error', 'triggered_by']
        read_only_fields = ['id', 'sent_at', 'sent_to', 'cc', 'status', 'error', 'triggered_by']


class PalletChipContainerSerializer(serializers.ModelSerializer):
    class Meta:
        model = PalletChipContainer
        fields = ['id', 'pallet', 'chip', 'container_uid', 'actual_qty']


class PalletChipContainerWithChipSerializer(serializers.ModelSerializer):
    chip_mpn = serializers.CharField(source='chip.chip_mpn', read_only=True)
    processed_type = serializers.CharField(source='chip.processed_type', read_only=True)
    packaging_type = serializers.CharField(source='chip.packaging_type', read_only=True)
    qty = serializers.IntegerField(source='chip.qty', read_only=True)
    inventory_qty = serializers.SerializerMethodField(read_only=True)
    pallet_seq = serializers.IntegerField(source='pallet.pallet_seq', read_only=True)
    chip_brand = serializers.CharField(source='chip.brand.name', read_only=True, default='')
    chip_type = serializers.CharField(source='chip.chip_type', read_only=True)
    chip_description = serializers.CharField(source='chip.description', read_only=True)
    chip_item_group = serializers.CharField(source='chip.item_group', read_only=True)
    chip_slot_group = serializers.CharField(source='chip.slot_group', read_only=True)

    class Meta:
        model = PalletChipContainer
        fields = [
            'id', 'pallet', 'chip', 'container_uid', 'actual_qty',
            'chip_mpn', 'processed_type', 'packaging_type', 'qty', 'inventory_qty',
            'pallet_seq', 'chip_brand', 'chip_type', 'chip_description',
            'chip_item_group', 'chip_slot_group',
        ]

    def get_inventory_qty(self, obj):
        return obj.actual_qty if obj.actual_qty is not None else (obj.chip.qty or 0)


# ─── Microsoft Recycling API (Buyback) ──────────────────────────────────────
class MsftApiConfigSerializer(serializers.ModelSerializer):
    environment = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = MsftApiConfig
        fields = ['enabled', 'default_job_status', 'default_po_currency',
                  'default_billing_country', 'environment', 'updated_at']
        read_only_fields = ['updated_at']

    def get_environment(self, obj):
        return settings.MSFT_API.get('ENVIRONMENT', 'test')


class MsftJobInfoSerializer(serializers.ModelSerializer):
    so_number = serializers.CharField(source='so.so_number', read_only=True)
    po_document_name = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = MsftJobInfo
        fields = ['id', 'so', 'so_number', 'supplier_job_type', 'ms_company_code',
                  'supplier_po_number', 'supplier_po_currency', 'billing_country',
                  'job_status', 'po_document_name', 'updated_at']
        read_only_fields = ['so', 'updated_at']

    def get_po_document_name(self, obj):
        import os as _os
        return _os.path.basename(obj.po_document.name) if obj.po_document else None


class MsftCreditUnitSerializer(serializers.ModelSerializer):
    # Allow blank drafts: a new row is created empty, then filled inline.
    supplier_unit_id = serializers.CharField(required=False, allow_blank=True, max_length=100)

    class Meta:
        model = MsftCreditUnit
        fields = ['id', 'so', 'supplier_unit_id', 'unit_type', 'date_sold',
                  'sale_price', 'supplier_commission', 'ms_revenue_share',
                  'supplier_po_number', 'quantity', 'created_at']
        read_only_fields = ['so', 'created_at']

    def validate_unit_type(self, value):
        if value and value not in MSFT_BUYBACK_UNIT_TYPES:
            raise serializers.ValidationError(
                f"Buyback unit type must be one of {MSFT_BUYBACK_UNIT_TYPES}."
            )
        return value


class MsftPaymentNoticeSerializer(serializers.ModelSerializer):
    supplier_po_number = serializers.CharField(required=False, allow_blank=True, max_length=100)

    class Meta:
        model = MsftPaymentNotice
        fields = ['id', 'so', 'supplier_po_number', 'supplier_po_currency',
                  'ms_invoice_number', 'payment_date', 'payment_amount',
                  'payment_amount_usd', 'created_at']
        read_only_fields = ['so', 'created_at']


class MsftApiLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = MsftApiLog
        fields = ['id', 'so', 'report_type', 'supplier_po_number', 'correlation_id',
                  'endpoint', 'http_status', 'request_payload', 'response',
                  'success_count', 'error_count', 'status', 'error', 'created_at']


class MsftCompanyCodeSerializer(serializers.ModelSerializer):
    class Meta:
        model = MsftCompanyCode
        fields = ['code', 'country']


class MsftUnitTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = MsftUnitType
        fields = ['name']
