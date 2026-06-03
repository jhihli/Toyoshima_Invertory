from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('product', '0026_so_inbound_outbound_date'),
    ]

    operations = [
        migrations.AddField(
            model_name='pallet',
            name='out_weight_gross',
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True),
        ),
        migrations.AddField(
            model_name='pallet',
            name='out_weight_net',
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True),
        ),
    ]
