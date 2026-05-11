from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('product', '0014_rename_mpn_weight_fields'),
    ]

    operations = [
        migrations.RenameField(
            model_name='pallet',
            old_name='payload_number',
            new_name='gateload_number',
        ),
    ]
