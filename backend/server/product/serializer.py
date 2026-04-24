from rest_framework import serializers
from django.conf import settings
from .models import Vendor, SO, SOPhoto, Pallet, Board, ChipBrand, Chip, MPN
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


class PalletSerializer(serializers.ModelSerializer):
    class Meta:
        model = Pallet
        fields = ['id', 'so', 'pallet_seq', 'licence_number', 'payload_number', 'weight', 'qty', 'board_qty', 'created_at']
        read_only_fields = ['created_at']


class ChipSerializer(serializers.ModelSerializer):
    brand_name = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Chip
        fields = ['id', 'mpn', 'brand', 'brand_name', 'qty', 'note']

    def get_brand_name(self, obj):
        if obj.brand:
            return obj.brand.name
        return None


class MPNField(serializers.Field):
    """Serializes Board.mpn FK as a plain string; accepts a string on write and auto get_or_creates the MPN record."""

    def to_representation(self, value):
        return value.name if value else ''

    def to_internal_value(self, data):
        if not data or not str(data).strip():
            return None
        mpn, _ = MPN.objects.get_or_create(name=str(data).strip())
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
            'id', 'so', 'pallet', 'pallet_label', 'barcode', 'catalog',
            'mpn', 'weight', 'qty',
            'photo', 'photo_url', 'note', 'scanned_at',
            'chips', 'chip_count',
        ]
        read_only_fields = ['scanned_at']

    def get_chips(self, obj):
        if not obj.mpn_id:
            return []
        return ChipSerializer(obj.mpn.chips.all(), many=True).data

    def get_chip_count(self, obj):
        if not obj.mpn_id:
            return 0
        return sum(c.qty for c in obj.mpn.chips.all())

    def get_pallet_label(self, obj):
        if not obj.pallet_id:
            return None
        p = obj.pallet
        parts = [x for x in [p.licence_number, p.payload_number] if x]
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


class SOSerializer(serializers.ModelSerializer):
    vendor_name = serializers.SerializerMethodField(read_only=True)
    vendor_weight_rule = serializers.SerializerMethodField(read_only=True)
    effective_weight_rule = serializers.SerializerMethodField(read_only=True)
    total_pallet_count = serializers.SerializerMethodField(read_only=True)
    pallet_record_count = serializers.SerializerMethodField(read_only=True)
    total_pallet_weight = serializers.SerializerMethodField(read_only=True)
    total_board_count = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = SO
        fields = [
            'id', 'so_number', 'vendor', 'vendor_name', 'vendor_weight_rule',
            'weight_rule', 'effective_weight_rule',
            'date', 'note', 'created_at',
            'total_pallet_count', 'pallet_record_count', 'total_pallet_weight',
            'total_board_count',
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
