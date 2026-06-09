from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('product', '0031_pallet_chip_container'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='chip',
            name='container_uid',
        ),
    ]
