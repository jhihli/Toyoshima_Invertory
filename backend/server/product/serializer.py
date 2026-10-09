from rest_framework import serializers
from django.conf import settings
from .models import (
    Vendor, SO, SOPhoto, Pallet, PalletPhoto, ChipBrand, Chip, MPN,
    MPNReportConfig, MPNReportEmail, PalletChipContainer, Box, Checklist, PalletMPN,
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
    board_qty = serializers.SerializerMethodField(read_only=True)
    board_qty_is_legacy = serializers.SerializerMethodField(read_only=True)
    ng_qty = serializers.SerializerMethodField(read_only=True)
    box_count = serializers.SerializerMethodField(read_only=True)
    checklist_count = serializers.SerializerMethodField(read_only=True)
    photo_url = serializers.SerializerMethodField(read_only=True)
    photos = PalletPhotoSerializer(many=True, read_only=True)

    class Meta:
        model = Pallet
        fields = ['id', 'so', 'pallet_seq', 'licence_number', 'gateload_number', 'location', 'photo', 'photo_url', 'photos', 'in_weight_gross', 'actual_weight', 'out_weight_gross', 'out_weight_net', 'tantalum_wt', 'material_type', 'qty', 'board_qty', 'board_qty_is_legacy', 'ng_qty', 'box_count', 'checklist_count', 'created_at']
        read_only_fields = ['created_at', 'photo_url', 'photos']

    def get_board_qty(self, obj):
        return obj.effective_board_qty

    def get_board_qty_is_legacy(self, obj):
        return obj.board_qty_is_legacy

    def get_ng_qty(self, obj):
        return obj.ng_qty

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
        fields = ['id', 'pallet', 'barcode', 'chip', 'brand', 'model', 'qty', 'created_at']
        # barcode is composed server-side; a client editing it would break next_index().
        read_only_fields = ['pallet', 'barcode', 'created_at']

    def validate(self, attrs):
        # Only used for edits (creation goes through views._create_checklists), so
        # self.instance is always set here.
        chip = attrs.get('chip')
        if chip is not None:
            if not Checklist.chip_allowed(self.instance.pallet, chip):
                raise serializers.ValidationError({'chip': 'This chip is not on a board assigned to this pallet.'})
            attrs['brand'], attrs['model'] = Checklist.text_from_chip(chip)
        return attrs


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
    so_board_count = serializers.SerializerMethodField(read_only=True)
    chip_brands = serializers.SerializerMethodField(read_only=True)
    latest_board_date = serializers.SerializerMethodField(read_only=True)
    so_latest_board_date = serializers.SerializerMethodField(read_only=True)
    slot_count = serializers.IntegerField(read_only=True)
    chips_per_board = serializers.IntegerField(read_only=True)

    class Meta:
        model = MPN
        fields = ['id', 'name', 'part_type', 'beforecut_weight', 'aftercut_weight', 'chip_qty', 'cutboard_cost', 'note', 'is_finished', 'created_at', 'beforecut_photo_url', 'aftercut_photo_url', 'board_count', 'so_board_count', 'chip_brands', 'latest_board_date', 'so_latest_board_date', 'slot_count', 'chips_per_board']
        read_only_fields = ['created_at']

    def get_board_count(self, obj):
        return obj.board_total()

    def get_so_board_count(self, obj):
        """Boards of this MPN within ONE SO — populated only when the caller scopes
        the list with ?so=<id>. The same MPN legitimately recurs across SOs, so
        board_count (all-time, all-SO) reads as a confusing running total; this is
        the per-shipment count. None when no SO scope was requested."""
        so_id = self.context.get('so_id')
        if not so_id:
            return None
        return obj.board_total(so_id=so_id)

    def get_chip_brands(self, obj):
        return list(obj.chips.values_list('brand__name', flat=True))

    def get_latest_board_date(self, obj):
        d = obj.latest_board_added()
        return d.strftime('%Y-%m-%d') if d else None

    def get_so_latest_board_date(self, obj):
        """When this MPN was last added to a pallet of ONE SO — only under ?so=<id>."""
        so_id = self.context.get('so_id')
        if not so_id:
            return None
        d = obj.latest_board_added(so_id=so_id)
        return d.strftime('%Y-%m-%d') if d else None

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


class MPNLiteSerializer(serializers.ModelSerializer):
    """Trimmed MPN payload for the SO export rows (PalletMPNExportSerializer).

    Omits MPNSerializer's SerializerMethodFields — each fires its own aggregate query.
    `chips_per_board` is a model property served off the prefetched chips.
    """
    chips_per_board = serializers.IntegerField(read_only=True)

    class Meta:
        model = MPN
        fields = ['id', 'name', 'part_type', 'cutboard_cost', 'created_at', 'chips_per_board']


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


class PalletMPNSerializer(serializers.ModelSerializer):
    mpn_name = serializers.CharField(source='mpn.name', read_only=True)
    part_type = serializers.CharField(source='mpn.part_type', read_only=True)
    # This pallet's batch (the BOM chips its checklist names) vs the MPN's full BOM.
    chips_per_board = serializers.IntegerField(read_only=True)
    bom_chips_per_board = serializers.IntegerField(source='mpn.chips_per_board', read_only=True)
    board_qty = serializers.IntegerField(allow_null=True, required=False, min_value=0)
    chips = serializers.SerializerMethodField(read_only=True)
    checklist_use_count = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = PalletMPN
        fields = ['id', 'pallet', 'mpn', 'mpn_name', 'part_type', 'chips_per_board', 'bom_chips_per_board',
                  'board_qty', 'chips', 'checklist_use_count', 'created_at']
        read_only_fields = ['pallet', 'created_at']
        # (pallet, mpn) uniqueness is checked in the view: pallet is read-only here,
        # so DRF's auto UniqueTogetherValidator would demand it in the payload.
        validators = []

    def get_chips(self, obj):
        present = obj.present_chip_ids()
        return [{'id': c.id, 'brand_name': c.brand.name if c.brand_id else '', 'chip_mpn': c.chip_mpn,
                 'present': c.id in present} for c in obj.mpn.chips.all()]

    def get_checklist_use_count(self, obj):
        return obj.checklist_use_count()


class PalletMPNExportSerializer(serializers.ModelSerializer):
    """One (pallet, MPN) row with the MPN's chip BOM, for the SO Excel export."""
    mpn = MPNLiteSerializer(read_only=True)
    chips = serializers.SerializerMethodField(read_only=True)
    present_chip_ids = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = PalletMPN
        fields = ['id', 'pallet', 'board_qty', 'created_at', 'mpn', 'chips', 'present_chip_ids']

    def get_present_chip_ids(self, obj):
        return sorted(obj.present_chip_ids())

    def get_chips(self, obj):
        return ChipSerializer(obj.mpn.chips.all(), many=True, context=self.context).data
