from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('product', '0037_alter_pallet_in_weight_gross'),
    ]

    operations = [
        migrations.AddField(
            model_name='chip',
            name='slot_group',
            field=models.CharField(
                blank=True,
                help_text=(
                    "Chips sharing a slot_group occupy the SAME physical board slot and are "
                    "interchangeable alternates (e.g. 'MEM' for a DRAM slot any of 5 part "
                    "numbers can fill). Blank = the chip is its own slot. Reuse the same "
                    "string across MPNs — exports union a group SO-wide."
                ),
                max_length=50,
            ),
        ),
        migrations.AddField(
            model_name='chip',
            name='item_group',
            field=models.CharField(
                blank=True,
                choices=[
                    ('Controller', 'Controller'),
                    ('Memory', 'Memory'),
                    ('FPGA', 'FPGA'),
                    ('Capacitor', 'Capacitor'),
                ],
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name='chip',
            name='qty',
            field=models.IntegerField(
                blank=True,
                default=1,
                help_text=(
                    "Quantity of this chip on ONE board (BOM qty, normally 1). "
                    "Blank = not yet known. Harvested totals are always derived, never stored here."
                ),
                null=True,
            ),
        ),
        migrations.AlterField(
            model_name='chip',
            name='packaging_type',
            field=models.CharField(
                choices=[('tray', 'Tray'), ('reel', 'Reel'), ('bag', 'Bag')],
                default='tray',
                max_length=50,
            ),
        ),
        migrations.AlterModelOptions(
            name='chip',
            options={'ordering': ['mpn', 'id']},
        ),
    ]
