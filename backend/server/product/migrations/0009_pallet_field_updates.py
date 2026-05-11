from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('product', '0008_chip_new_fields'),
    ]

    operations = [
        migrations.RenameField(
            model_name='pallet',
            old_name='weight',
            new_name='in_weight_gross',
        ),
        migrations.AddField(
            model_name='pallet',
            name='actual_weight',
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True),
        ),
        migrations.AddField(
            model_name='pallet',
            name='material_type',
            field=models.CharField(blank=True, max_length=100),
        ),
    ]
