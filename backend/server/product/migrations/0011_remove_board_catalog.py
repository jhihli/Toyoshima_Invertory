from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('product', '0010_board_pallet_cascade'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='board',
            name='catalog',
        ),
    ]
