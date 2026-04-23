from django.db import models
from django.db.models import Sum


## Keep using account_customuser for user management and authentication, with the following fields:
- `account_customuser`: extends AbstractUser + `role` (`admin`, `manager`, `vz_user`, `r2_user`, `n_user`)

## New Data models
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

    def __str__(self):
        return self.name


class SO(models.Model):
    WEIGHT_RULE_CHOICES = Vendor.WEIGHT_RULE_CHOICES

    so_number = models.CharField(max_length=50, unique=True, db_index=True)
    vendor = models.ForeignKey(Vendor, on_delete=models.PROTECT, related_name='sos')
    weight_rule = models.CharField(
        max_length=20,
        choices=WEIGHT_RULE_CHOICES,
        blank=True,  # 为空 = 使用 vendor 的默认规则
    )
    date = models.DateField()
    licence_number = models.CharField(max_length=50, blank=True)
    payload_number = models.CharField(max_length=50, blank=True)
    note = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-date', '-created_at']

    def __str__(self):
        return self.so_number

    @property
    def effective_weight_rule(self):
        """返回实际生效的规则(优先 SO 自己的,没有就用 vendor 默认)"""
        return self.weight_rule or self.vendor.default_weight_rule

    @property
    def total_pallet_count(self):
        """
        物理托盘总数。
        Per Pallet 模式:等于 Pallet 记录数(每行 qty=1)
        Aggregated 模式:累加每行的 qty
        """
        result = self.pallets.aggregate(total=Sum('qty'))['total']
        return result or 0

    @property
    def pallet_record_count(self):
        """Pallet 表的行数(用于 UI 的 Pallets tab badge)"""
        return self.pallets.count()

    @property
    def total_pallet_weight(self):
        """
        物理托盘总重量(kg)。
        两种模式都是 Sum('weight') - 因为 weight 字段的语义统一是
        "这一行所有托盘的总重":
        - Per Pallet: 1 个托盘的重量
        - Aggregated: 多个托盘的汇总重量
        """
        result = self.pallets.aggregate(total=Sum('weight'))['total']
        return result or 0

    @property
    def total_board_count(self):
        """该 SO 下板材总数"""
        return self.boards.count()

    def save(self, *args, **kwargs):
        # 新建时如果没选,自动填入 vendor 的默认值
        if not self.weight_rule and self.vendor_id:
            self.weight_rule = self.vendor.default_weight_rule
        super().save(*args, **kwargs)


class SOPhoto(models.Model):
    so = models.ForeignKey(SO, on_delete=models.CASCADE, related_name='photos')
    image = models.ImageField(upload_to='so_photos/%Y/%m/')
    caption = models.CharField(max_length=200, blank=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['uploaded_at']

    def __str__(self):
        return f"Photo for {self.so.so_number}"


class Pallet(models.Model):
    so = models.ForeignKey(SO, on_delete=models.CASCADE, related_name='pallets')
    pallet_seq = models.IntegerField()
    weight = models.DecimalField(
        max_digits=10, decimal_places=2,
        help_text="Total weight in kg for all pallets in this row. "
                  "Per Pallet mode: weight of the single pallet. "
                  "Aggregated mode: combined weight of all pallets represented by qty."
    )
    qty = models.IntegerField(
        help_text="Number of physical pallets this row represents. "
                  "Per Pallet mode: always 1. "
                  "Aggregated mode: total count of pallets sharing this weight record."
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [['so', 'pallet_seq']]
        ordering = ['so', 'pallet_seq']

    def __str__(self):
        return f"{self.so.so_number} - Pallet #{self.pallet_seq}"


class Board(models.Model):
    so = models.ForeignKey(SO, on_delete=models.CASCADE, related_name='boards')
    barcode = models.CharField(max_length=100, db_index=True)
    catalog = models.CharField(max_length=100, blank=True)
    weight = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    qty = models.IntegerField(default=1)
    mpn = models.CharField(max_length=100, blank=True, db_index=True)
    photo = models.ImageField(upload_to='boards/%Y/%m/', blank=True, null=True)
    note = models.TextField(blank=True)
    scanned_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-scanned_at']

    def __str__(self):
        return f"{self.barcode} (SO: {self.so.so_number})"

    @property
    def total_chip_count(self):
        """该 board 上芯片总颗数(累加各品牌的 qty)"""
        result = self.chips.aggregate(total=Sum('qty'))['total']
        return result or 0

    @property
    def chip_brand_count(self):
        """该 board 上涉及的芯片品牌数"""
        return self.chips.values('brand').distinct().count()


class ChipBrand(models.Model):
    name = models.CharField(max_length=100, unique=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class Chip(models.Model):
    board = models.ForeignKey(Board, on_delete=models.CASCADE, related_name='chips')
    brand = models.ForeignKey(
        ChipBrand, on_delete=models.PROTECT, null=True, blank=True
    )
    qty = models.IntegerField(default=1)
    note = models.TextField(blank=True)

    class Meta:
        indexes = [models.Index(fields=['board', 'brand'])]
        ordering = ['brand__name']

    def __str__(self):
        return f"{self.brand} x{self.qty}" if self.brand else f"Chip x{self.qty}"