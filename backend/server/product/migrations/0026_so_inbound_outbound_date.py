from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('product', '0025_mpnreportconfig_add_send_time'),
    ]

    operations = [
        migrations.RenameField(
            model_name='so',
            old_name='date',
            new_name='inbound_date',
        ),
        migrations.AddField(
            model_name='so',
            name='outbound_date',
            field=models.DateField(blank=True, null=True),
        ),
    ]
