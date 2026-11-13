"""Memory slots are named by capacity class from now on: 'Memory' → '1G'.

Memory chips of the same capacity are mixed after cutting and counted per capacity
class, so the slot_group that makes them one slot must say which class: '1G', '2G'.
Every memory part on the production MPNs today is 1Gb (K4B1G1646G-BCH9, D9SFT, D9MNQ,
NT5TU64M16HG), so every 'Memory' group becomes '1G'. Matching ignores case and stray
spaces. Blank slot_groups are not touched (owner decision 2026-11-13).

Not reversible: after this runs, new '1G' chips can't be told apart from renamed ones,
so the reverse is a no-op rather than a guess.
"""
from django.db import migrations


def rename_memory(apps, schema_editor):
    Chip = apps.get_model('product', 'Chip')
    Chip.objects.filter(slot_group__iregex=r'^\s*memory\s*$').update(slot_group='1G')


class Migration(migrations.Migration):

    dependencies = [
        ('product', '0056_so_tantalum_unit'),
    ]

    operations = [
        migrations.RunPython(rename_memory, migrations.RunPython.noop),
    ]
