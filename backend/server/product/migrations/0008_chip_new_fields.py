from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('product', '0007_alter_board_mpn'),
    ]

    operations = [
        migrations.RenameField(
            model_name='chip',
            old_name='note',
            new_name='description',
        ),
        migrations.AddField(
            model_name='chip',
            name='chip_mpn',
            field=models.CharField(blank=True, max_length=100),
        ),
        migrations.AddField(
            model_name='chip',
            name='chip_type',
            field=models.CharField(blank=True, max_length=100),
        ),
        migrations.AddField(
            model_name='chip',
            name='chip_photo',
            field=models.ImageField(blank=True, null=True, upload_to='chip_photos/%Y/%m/'),
        ),
    ]
