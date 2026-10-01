"""One-off conversion of scanned Board rows into PalletMPN rows (migration 0047).

Takes the model classes as arguments so the migration can pass its historical models.
"""
from django.db.models import Min, Q, Sum


def backfill_pallet_mpns(Board, PalletMPN):
    """Collapse Board rows into one PalletMPN per (pallet, mpn).

    board_qty = Sum(qty) of the group, created_at = earliest scan. Boards missing a
    pallet or an MPN cannot be placed and are skipped. Existing PalletMPN rows are
    left alone, so running twice creates nothing new.

    Returns (created, skipped).
    """
    skipped = Board.objects.filter(Q(pallet__isnull=True) | Q(mpn__isnull=True)).count()
    groups = (
        Board.objects
        .filter(pallet__isnull=False, mpn__isnull=False)
        # Clear Board's default '-scanned_at' ordering: left in, it joins the GROUP BY
        # and yields one group per board instead of one per (pallet, mpn).
        .order_by()
        .values('pallet_id', 'mpn_id')
        .annotate(total=Sum('qty'), first=Min('scanned_at'))
    )
    created = 0
    for g in groups:
        _, made = PalletMPN.objects.get_or_create(
            pallet_id=g['pallet_id'], mpn_id=g['mpn_id'],
            defaults={'board_qty': g['total'], 'created_at': g['first']},
        )
        created += int(made)
    return created, skipped
