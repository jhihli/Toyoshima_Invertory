from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('product', '0019_mpn_name_not_unique_chip_drop_board_fk'),
    ]

    operations = [
        migrations.AlterField(
            model_name='mpn',
            name='name',
            field=models.CharField(max_length=100, unique=True),
        ),
    ]
