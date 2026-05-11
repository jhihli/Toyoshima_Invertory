from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('product', '0009_pallet_field_updates'),
    ]

    operations = [
        migrations.AlterField(
            model_name='board',
            name='pallet',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='boards',
                to='product.pallet',
            ),
        ),
    ]
