from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('product', '0029_chip_processed_packaging_type'),
    ]

    operations = [
        migrations.AddField(
            model_name='chip',
            name='container_uid',
            field=models.CharField(blank=True, max_length=50),
        ),
    ]
