"""Reset Chip.qty to the per-board BOM quantity.

Chip.qty used to be written by the MPN detail page as a snapshot of MPN.board_count
(a GLOBAL count of every board scanned for that MPN, across every SO, for all time).
That is not a quantity of anything on a board, it went stale on the next scan, and the
SO export read it as if it were per-SO. Every existing value is therefore meaningless.

Chip.qty now means: how many of this chip sit on ONE board. That is 1 for every chip in
the current data, so reset the column. Anything genuinely >1 must be re-entered by hand
on the MPN page.

Destructive but reversible-as-noop: the prior values carry no information to restore.
"""
from django.db import migrations


def reset_qty(apps, schema_editor):
    Chip = apps.get_model('product', 'Chip')
    Chip.objects.update(qty=1)


class Migration(migrations.Migration):

    dependencies = [
        ('product', '0038_chip_slot_group_item_group'),
    ]

    operations = [
        migrations.RunPython(reset_qty, migrations.RunPython.noop),
    ]
