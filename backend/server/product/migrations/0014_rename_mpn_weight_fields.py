from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('product', '0013_remove_board_note'),
    ]

    operations = [
        migrations.RenameField(
            model_name='mpn',
            old_name='beforecut_qty',
            new_name='beforecut_weight',
        ),
        migrations.RenameField(
            model_name='mpn',
            old_name='aftercut_qty',
            new_name='aftercut_weight',
        ),
    ]
