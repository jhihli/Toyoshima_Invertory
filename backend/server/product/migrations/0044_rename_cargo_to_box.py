from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    """Rename the Cargo entity to Box.

    What sits inside a pallet is a box, not cargo. RenameModel is Django-state-only
    here because db_table was set explicitly, so AlterModelTable is what actually
    emits ALTER TABLE cargo RENAME TO box. Rows, primary keys and the pallet FK are
    preserved; barcode values (which still carry the legacy -C{n} suffix) are not
    touched, because those labels are already printed and stuck to physical boxes.
    """

    dependencies = [
        ('product', '0043_alter_so_so_number'),
    ]

    operations = [
        migrations.RenameModel(
            old_name='Cargo',
            new_name='Box',
        ),
        migrations.AlterModelTable(
            name='box',
            table='box',
        ),
        migrations.AlterField(
            model_name='box',
            name='pallet',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='boxes',
                to='product.pallet',
            ),
        ),
        migrations.AlterField(
            model_name='box',
            name='barcode',
            field=models.CharField(
                blank=True,
                db_index=True,
                help_text=(
                    "Composed at creation: {so_number}-{licence_number}-{gateload_number}-C{n}, "
                    "where n is the next free index parsed from this pallet's existing box barcodes."
                ),
                max_length=200,
            ),
        ),
    ]
