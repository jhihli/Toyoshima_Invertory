import django.db.models.deletion
from django.db import migrations, models


def populate_board_mpn(apps, schema_editor):
    Board = apps.get_model('product', 'Board')
    MPN = apps.get_model('product', 'MPN')
    mpn_map = {}
    for row in Board.objects.exclude(mpn_str='').values('id', 'mpn_str'):
        name = row['mpn_str']
        if name not in mpn_map:
            obj, _ = MPN.objects.get_or_create(name=name)
            mpn_map[name] = obj.id
        Board.objects.filter(pk=row['id']).update(mpn_fk_id=mpn_map[name])


def populate_chip_mpn(apps, schema_editor):
    Chip = apps.get_model('product', 'Chip')
    Board = apps.get_model('product', 'Board')
    board_mpn = dict(Board.objects.values_list('id', 'mpn_fk'))
    for row in Chip.objects.values('id', 'board_id'):
        if row['board_id'] and board_mpn.get(row['board_id']):
            Chip.objects.filter(pk=row['id']).update(mpn_new_id=board_mpn[row['board_id']])


class Migration(migrations.Migration):

    dependencies = [
        ('product', '0003_board_pallet'),
    ]

    operations = [
        # 1. Create MPN table
        migrations.CreateModel(
            name='MPN',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False)),
                ('name', models.CharField(db_index=True, max_length=100, unique=True)),
            ],
            options={
                'db_table': 'mpn',
                'ordering': ['name'],
            },
        ),

        # 2. Rename Board.mpn CharField to mpn_str so both can coexist
        migrations.RenameField(model_name='board', old_name='mpn', new_name='mpn_str'),

        # 3. Add Board.mpn_fk (nullable FK to MPN)
        migrations.AddField(
            model_name='board',
            name='mpn_fk',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='boards', to='product.mpn',
            ),
        ),

        # 4. Data migration: create MPN objects, populate Board.mpn_fk
        migrations.RunPython(populate_board_mpn, migrations.RunPython.noop),

        # 5. Add Chip.mpn_new (nullable FK to MPN)
        migrations.AddField(
            model_name='chip',
            name='mpn_new',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='chips', to='product.mpn',
            ),
        ),

        # 6. Data migration: populate Chip.mpn_new from chip.board.mpn_fk
        migrations.RunPython(populate_chip_mpn, migrations.RunPython.noop),

        # 7. Remove old Board.mpn_str CharField
        migrations.RemoveField(model_name='board', name='mpn_str'),

        # 8. Remove old Chip.board FK
        migrations.RemoveField(model_name='chip', name='board'),

        # 9. Rename Board.mpn_fk -> Board.mpn
        migrations.RenameField(model_name='board', old_name='mpn_fk', new_name='mpn'),

        # 10. Rename Chip.mpn_new -> Chip.mpn
        migrations.RenameField(model_name='chip', old_name='mpn_new', new_name='mpn'),

        # 11. Update Chip index to use mpn instead of board
        migrations.AlterIndexTogether(
            name='chip',
            index_together=set(),
        ),
        migrations.AddIndex(
            model_name='chip',
            index=models.Index(fields=['mpn', 'brand'], name='chip_mpn_brand_idx'),
        ),
    ]
