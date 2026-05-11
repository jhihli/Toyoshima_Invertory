from django.db import models
from django.db.models import Sum
from django.utils import timezone


class Vendor(models.Model):
    WEIGHT_RULE_CHOICES = [
        ('per_pallet', 'Per Pallet'),
        ('aggregated', 'Aggregated'),
    ]
    name = models.CharField(max_length=100, unique=True)
    default_weight_rule = models.CharField(
        max_length=20,
        choices=WEIGHT_RULE_CHOICES,
        default='per_pallet'
    )

    class Meta:
        db_table = 'vendor'
        ordering = ['name']

    def __str__(self):
        return self.name


class SO(models.Model):
    WEIGHT_RULE_CHOICES = Vendor.WEIGHT_RULE_CHOICES

    so_number = models.CharField(max_length=50, unique=True, db_index=True)
    vendor = models.ForeignKey(Vendor, on_delete=models.PROTECT, related_name='sos')
    weight_rule = models.CharField(max_length=20, blank=True)
    date = models.DateField()
    note = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'so'
        ordering = ['-created_at']

    def __str__(self):
        return self.so_number

    @property
    def effective_weight_rule(self):
        return self.weight_rule or self.vendor.default_weight_rule

    @property
    def total_pallet_count(self):
        result = self.pallets.aggregate(total=Sum('qty'))['total']
        return result or 0

    @property
    def pallet_record_count(self):
        return self.pallets.count()

    @property
    def total_pallet_weight(self):
        result = self.pallets.aggregate(total=Sum('in_weight_gross'))['total']
        return result or 0

    @property
    def total_board_count(self):
        return self.boards.count()

    @property
    def total_board_qty(self):
        result = self.pallets.aggregate(total=Sum('board_qty'))['total']
        return result

    def save(self, *args, **kwargs):
        if not self.weight_rule and self.vendor_id:
            self.weight_rule = self.vendor.default_weight_rule
        super().save(*args, **kwargs)


class SOPhoto(models.Model):
    so = models.ForeignKey(SO, on_delete=models.CASCADE, related_name='photos')
    image = models.ImageField(upload_to='so_photos/%Y/%m/')
    caption = models.CharField(max_length=200, blank=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'so_photo'
        ordering = ['uploaded_at']

    def __str__(self):
        return f"Photo for {self.so.so_number}"


class Pallet(models.Model):
    so = models.ForeignKey(SO, on_delete=models.CASCADE, related_name='pallets')
    pallet_seq = models.IntegerField()
    licence_number = models.CharField(max_length=50, blank=True)
    gateload_number = models.CharField(max_length=50, blank=True)
    in_weight_gross = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    actual_weight = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    material_type = models.CharField(max_length=100, blank=True)
    qty = models.IntegerField()
    board_qty = models.IntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'pallet'
        unique_together = [['so', 'pallet_seq']]
        ordering = ['so', 'pallet_seq']

    def __str__(self):
        return f"{self.so.so_number} - Pallet #{self.pallet_seq}"


class MPN(models.Model):
    name = models.CharField(max_length=100, unique=True, db_index=True)
    part_type = models.CharField(max_length=100, blank=True)
    beforecut_weight = models.IntegerField(null=True, blank=True)
    aftercut_weight = models.IntegerField(null=True, blank=True)
    chip_qty = models.IntegerField(null=True, blank=True)
    beforecut_photo = models.ImageField(upload_to='mpn_photos/%Y/%m/', blank=True, null=True)
    aftercut_photo = models.ImageField(upload_to='mpn_photos/%Y/%m/', blank=True, null=True)
    created_at = models.DateTimeField(default=timezone.now, editable=False)

    class Meta:
        db_table = 'mpn'
        ordering = ['name']

    def __str__(self):
        return self.name


class Board(models.Model):
    so = models.ForeignKey(SO, on_delete=models.CASCADE, related_name='boards')
    pallet = models.ForeignKey(Pallet, on_delete=models.CASCADE, null=True, blank=True, related_name='boards')
    barcode = models.CharField(max_length=100, blank=True, db_index=True)
    mpn = models.ForeignKey(MPN, on_delete=models.PROTECT, null=True, blank=True, related_name='boards')
    qty = models.IntegerField(default=1)
    photo = models.ImageField(upload_to='boards/%Y/%m/', blank=True, null=True)
    scanned_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'board'
        ordering = ['-scanned_at']

    def __str__(self):
        mpn_str = self.mpn.name if self.mpn_id else ''
        return f"{self.barcode or mpn_str or 'Unknown'} (SO: {self.so.so_number})"

    @property
    def total_chip_count(self):
        if not self.mpn_id:
            return 0
        result = self.mpn.chips.aggregate(total=Sum('qty'))['total']
        return result or 0

    @property
    def chip_brand_count(self):
        if not self.mpn_id:
            return 0
        return self.mpn.chips.values('brand').distinct().count()


class ChipBrand(models.Model):
    name = models.CharField(max_length=100, unique=True)

    class Meta:
        db_table = 'chip_brand'
        ordering = ['name']

    def __str__(self):
        return self.name


class Chip(models.Model):
    mpn = models.ForeignKey(MPN, on_delete=models.CASCADE, null=True, blank=True, related_name='chips')
    brand = models.ForeignKey(
        ChipBrand, on_delete=models.PROTECT, null=True, blank=True
    )
    chip_mpn = models.CharField(max_length=100, blank=True)
    chip_type = models.CharField(max_length=100, blank=True)
    chip_photo = models.ImageField(upload_to='chip_photos/%Y/%m/', blank=True, null=True)
    qty = models.IntegerField(default=1)
    description = models.TextField(blank=True)

    class Meta:
        db_table = 'chip'
        indexes = [models.Index(fields=['mpn', 'brand'])]
        ordering = ['brand__name']

    def __str__(self):
        return f"{self.brand} x{self.qty}" if self.brand else f"Chip x{self.qty}"
