from django.db import migrations, models


class Migration(migrations.Migration):
    """Tantalum keeps its value (renamed) and gains a unit; existing values were pounds."""

    dependencies = [
        ('product', '0055_so_tantalum_lb'),
    ]

    operations = [
        migrations.RenameField(model_name='so', old_name='tantalum_lb', new_name='tantalum_weight'),
        migrations.AlterField(
            model_name='so', name='tantalum_weight',
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True),
        ),
        migrations.AddField(
            model_name='so', name='tantalum_unit',
            field=models.CharField(choices=[('lb', 'lb'), ('g', 'g')], default='lb', max_length=2),
        ),
    ]
