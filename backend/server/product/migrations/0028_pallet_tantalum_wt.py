from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('product', '0027_pallet_out_weight_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='pallet',
            name='tantalum_wt',
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True),
        ),
    ]
