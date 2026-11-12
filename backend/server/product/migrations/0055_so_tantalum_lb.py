from decimal import Decimal

from django.db import migrations, models

GRAMS_PER_LB = Decimal('453.59237')


def pallet_grams_to_so_pounds(apps, schema_editor):
    """Carry any per-pallet tantalum (grams) over to its SO as one total in pounds."""
    SO = apps.get_model('product', 'SO')
    Pallet = apps.get_model('product', 'Pallet')
    totals = {}
    for so_id, grams in Pallet.objects.filter(tantalum_wt__isnull=False).values_list('so_id', 'tantalum_wt'):
        totals[so_id] = totals.get(so_id, Decimal(0)) + grams
    for so_id, grams in totals.items():
        if grams:
            SO.objects.filter(pk=so_id, tantalum_lb__isnull=True).update(
                tantalum_lb=(grams / GRAMS_PER_LB).quantize(Decimal('0.01')))


class Migration(migrations.Migration):

    dependencies = [
        ('product', '0054_chip_variable_qty'),
    ]

    operations = [
        migrations.AddField(
            model_name='so',
            name='tantalum_lb',
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=8, null=True),
        ),
        migrations.RunPython(pallet_grams_to_so_pounds, migrations.RunPython.noop),
        migrations.RemoveField(
            model_name='pallet',
            name='tantalum_wt',
        ),
    ]
