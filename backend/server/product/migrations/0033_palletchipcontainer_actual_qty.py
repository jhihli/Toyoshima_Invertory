from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('product', '0032_remove_chip_container_uid'),
    ]

    operations = [
        migrations.AddField(
            model_name='palletchipcontainer',
            name='actual_qty',
            field=models.IntegerField(blank=True, null=True),
        ),
    ]
