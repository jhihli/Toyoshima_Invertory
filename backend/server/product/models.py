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
    inbound_date = models.DateField()
    outbound_date = models.DateField(null=True, blank=True)
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
    location = models.CharField(max_length=20, blank=True)
    photo = models.ImageField(upload_to='pallet_photos/%Y/%m/', blank=True, null=True)
    in_weight_gross = models.DecimalField(max_digits=12, decimal_places=4, default=0)
    actual_weight = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    material_type = models.CharField(max_length=100, blank=True)
    qty = models.IntegerField()
    board_qty = models.IntegerField(null=True, blank=True)
    out_weight_gross = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    out_weight_net = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    tantalum_wt = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'pallet'
        unique_together = [['so', 'pallet_seq']]
        ordering = ['so', 'pallet_seq']

    def __str__(self):
        return f"{self.so.so_number} - Pallet #{self.pallet_seq}"


class PalletPhoto(models.Model):
    pallet = models.ForeignKey(Pallet, on_delete=models.CASCADE, related_name='photos')
    image = models.ImageField(upload_to='pallet_photos/%Y/%m/')
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['uploaded_at']

    def __str__(self):
        return f"Photo for Pallet #{self.pallet_id}"


class MPN(models.Model):
    name = models.CharField(max_length=100, unique=True)
    part_type = models.CharField(max_length=100, blank=True)
    beforecut_weight = models.DecimalField(max_digits=10, decimal_places=4, null=True, blank=True)
    aftercut_weight = models.DecimalField(max_digits=10, decimal_places=4, null=True, blank=True)
    chip_qty = models.IntegerField(null=True, blank=True)
    cutboard_cost = models.DecimalField(max_digits=10, decimal_places=4, null=True, blank=True)
    beforecut_photo = models.ImageField(upload_to='mpn_photos/%Y/%m/', blank=True, null=True)
    aftercut_photo = models.ImageField(upload_to='mpn_photos/%Y/%m/', blank=True, null=True)
    note = models.TextField(blank=True)
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
    PROCESSED_TYPE_CHOICES = [
        ('harvested', 'Harvested'),
        ('tested & reballed', 'Tested & Reballed'),
    ]
    PACKAGING_TYPE_CHOICES = [
        ('tray', 'Tray'),
        ('reel', 'Reel'),
    ]

    mpn = models.ForeignKey(MPN, on_delete=models.CASCADE, null=True, blank=True, related_name='chips')
    brand = models.ForeignKey(
        ChipBrand, on_delete=models.PROTECT, null=True, blank=True
    )
    chip_mpn = models.CharField(max_length=100, blank=True)
    chip_type = models.CharField(max_length=100, blank=True)
    chip_photo = models.ImageField(upload_to='chip_photos/%Y/%m/', blank=True, null=True)
    qty = models.IntegerField(default=1)
    cut_fail = models.IntegerField(null=True, blank=True)
    chip_cost = models.DecimalField(max_digits=10, decimal_places=4, null=True, blank=True)
    description = models.TextField(blank=True)
    processed_type = models.CharField(max_length=50, choices=PROCESSED_TYPE_CHOICES, default='harvested')
    packaging_type = models.CharField(max_length=50, choices=PACKAGING_TYPE_CHOICES, default='tray')

    class Meta:
        db_table = 'chip'
        indexes = [models.Index(fields=['mpn', 'brand'])]
        ordering = ['brand__name']

    def __str__(self):
        return f"{self.brand} x{self.qty}" if self.brand else f"Chip x{self.qty}"


class PalletChipContainer(models.Model):
    pallet = models.ForeignKey('Pallet', on_delete=models.CASCADE, related_name='chip_containers')
    chip = models.ForeignKey('Chip', on_delete=models.CASCADE, related_name='pallet_containers')
    container_uid = models.CharField(max_length=50, blank=True)
    actual_qty = models.IntegerField(null=True, blank=True)

    class Meta:
        db_table = 'pallet_chip_container'
        unique_together = [('pallet', 'chip')]
        ordering = ['chip__chip_mpn']

    def __str__(self):
        return f"{self.pallet} - {self.chip} → {self.container_uid}"


class MPNReportConfig(models.Model):
    """Singleton — only one row ever exists (id=1). Use get_config() to access."""
    recipient         = models.TextField(blank=True)  # comma-separated emails
    cc                = models.TextField(blank=True)   # comma-separated emails
    auto_send_enabled = models.BooleanField(default=True)
    send_time         = models.TimeField(default='19:00')  # local time HH:MM
    updated_at        = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'mpn_report_config'

    def __str__(self):
        return f"MPNReportConfig → {self.recipient} (auto={'on' if self.auto_send_enabled else 'off'})"

    @classmethod
    def get_config(cls):
        obj, _ = cls.objects.get_or_create(id=1)
        return obj


class MPNReportEmail(models.Model):
    STATUS_CHOICES = [('ok', 'Sent successfully'), ('error', 'Send failed')]
    sent_at      = models.DateTimeField(auto_now_add=True)
    sent_to      = models.TextField()
    cc           = models.TextField(blank=True)
    status       = models.CharField(max_length=10, choices=STATUS_CHOICES)
    error        = models.TextField(blank=True)
    triggered_by = models.CharField(max_length=20, default='cron')

    class Meta:
        db_table = 'mpn_report_email'
        ordering = ['-sent_at']

    def __str__(self):
        return f"{self.sent_at:%Y-%m-%d %H:%M} → {self.sent_to} [{self.status}]"
