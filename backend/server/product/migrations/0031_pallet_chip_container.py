import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('product', '0030_chip_container_uid'),
    ]

    operations = [
        migrations.CreateModel(
            name='PalletChipContainer',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('container_uid', models.CharField(blank=True, max_length=50)),
                ('pallet', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='chip_containers', to='product.pallet')),
                ('chip', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='pallet_containers', to='product.chip')),
            ],
            options={
                'db_table': 'pallet_chip_container',
                'ordering': ['chip__chip_mpn'],
                'unique_together': {('pallet', 'chip')},
            },
        ),
    ]
