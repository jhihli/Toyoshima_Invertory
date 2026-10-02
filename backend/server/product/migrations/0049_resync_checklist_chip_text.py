from django.db import migrations


def resync(apps, schema_editor):
    """Re-copy brand/model text from the chip for every chip-linked checklist line.

    Lines saved before Chip/ChipBrand.save() started propagating edits may hold stale
    text (e.g. a chip renamed AST1050 → AST1050G afterwards).
    """
    Checklist = apps.get_model('product', 'Checklist')
    fixed = 0
    for line in Checklist.objects.filter(chip__isnull=False).select_related('chip__brand'):
        brand = line.chip.brand.name if line.chip.brand_id else ''
        model = line.chip.chip_mpn or ''
        if (line.brand, line.model) != (brand, model):
            line.brand, line.model = brand, model
            line.save(update_fields=['brand', 'model'])
            fixed += 1
    print(f'\n  checklist chip text resync: {fixed} line(s) updated')


class Migration(migrations.Migration):

    dependencies = [
        ('product', '0048_delete_board'),
    ]

    operations = [
        migrations.RunPython(resync, migrations.RunPython.noop),
    ]
