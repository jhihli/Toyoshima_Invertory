from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('product', '0028_pallet_tantalum_wt'),
    ]

    operations = [
        migrations.AddField(
            model_name='chip',
            name='processed_type',
            field=models.CharField(
                choices=[('harvested', 'Harvested'), ('tested & reballed', 'Tested & Reballed')],
                default='harvested',
                max_length=50,
            ),
        ),
        migrations.AddField(
            model_name='chip',
            name='packaging_type',
            field=models.CharField(
                choices=[('tray', 'Tray'), ('reel', 'Reel')],
                default='tray',
                max_length=50,
            ),
        ),
    ]
