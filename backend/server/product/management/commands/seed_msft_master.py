"""
Seed Microsoft master data: company codes, unit types, and a starter
unit-type map. Data is embedded (from 'Company Code Master.xlsx' and
'Unit Type Master.xlsx') so it works in any environment.

    python manage.py seed_msft_master
"""
from django.core.management.base import BaseCommand

from product.models import MsftCompanyCode, MsftUnitType, MsftUnitTypeMap

# code → country (combined "a / b" entries split into separate codes)
COMPANY_CODES = [
    ('1444', 'UAE'), ('1440', 'UAE'), ('1038', 'Czechia'), ('2412', 'Czech Republic'),
    ('1024', 'Finland'), ('2402', 'Finland'), ('3465', 'Finland'), ('2410', 'Croatia'),
    ('2409', 'Nigeria'), ('2403', 'Belgium'), ('2281', 'Greece'), ('2280', 'Taiwan'),
    ('2274', 'Indonesia'), ('2273', 'Poland'), ('2236', 'Spain'), ('2229', 'Israel'),
    ('2227', 'Italy'), ('2226', 'Qatar'), ('2220', 'Denmark'), ('1991', 'Chile'),
    ('1985', 'France'), ('1980', 'Austria'), ('1968', 'South Africa'), ('1960', 'Germany'),
    ('1948', 'Australia'), ('1946', 'Switzerland'), ('1898', 'Malaysia'), ('1891', 'Singapore'),
    ('1881', 'Angola'), ('1838', 'Oman'), ('1805', 'Hong Kong'), ('1714', 'Vietnam'),
    ('1705', 'Netherlands'), ('1669', 'Azerbaijan'), ('1652', 'Puerto Rico'), ('1639', 'Brazil'),
    ('1631', 'Turkey'), ('1620', 'Bahrain'), ('1544', 'Paraguay'), ('1406', 'Bulgaria'),
    ('1401', 'New Zealand'), ('1290', 'Singapore'), ('1279', 'Korea'), ('1233', 'Romania'),
    ('1222', 'United Kingdom'), ('1215', 'Canada'), ('1204', 'Saudi Arabia'), ('1203', 'Egypt'),
    ('1176', 'Norway'), ('1172', 'Sweden'), ('1127', 'Ecuador'), ('1118', 'Sri Lanka'),
    ('1113', 'Mauritius / Indian Ocean Islands'), ('1111', 'Kenya'), ('1107', 'China'),
    ('1098', 'India'), ('1088', 'Mexico'), ('1085', 'Portugal'), ('1084', 'Argentina'),
    ('1079', 'Japan'), ('1062', 'Ireland'), ('1047', 'Philippines'), ('1033', 'Colombia'),
    ('1029', 'Hungary'), ('1028', 'Morocco'), ('1021', 'Thailand'), ('1010', 'USA'),
]

UNIT_TYPES = [
    'Air Handling Unit', 'Appliance', 'Batteries', 'Cables', 'CE Misc', 'Chassis', 'Chiller',
    'Construction Material', 'CPU', 'Desktop', 'Drive', 'Expansion Card', 'Fan', 'Generator',
    'Heatsink', 'Hub', 'ITPAC', 'Linecard', 'Load Bank', 'Loose', 'Mass Storage', 'Memory',
    'Metals and Plastics', 'Module', 'Motherboard', 'Onsite Drive', 'Power Meter', 'PSU',
    'Rack', 'Router', 'San Controller', 'Server', 'Server Blade', 'Shredded Material',
    'Shredder', 'Substation', 'Switch', 'UPS',
]

# Provisional map of our internal categories → MSFT unit type (Buyback = Memory/CPU only).
# CONFIRM with Microsoft; edit in admin as needed.
UNIT_TYPE_MAP = [
    ('Memory', 'Memory'),
    ('Controller', 'CPU'),
    ('FPGA', 'CPU'),
    ('DRAM', 'Memory'),
    ('PCH', 'CPU'),
    ('DPU', 'CPU'),
]


class Command(BaseCommand):
    help = 'Seed Microsoft company codes, unit types, and starter unit-type map.'

    def handle(self, *args, **options):
        cc = 0
        for code, country in COMPANY_CODES:
            _, created = MsftCompanyCode.objects.get_or_create(code=code, defaults={'country': country})
            cc += 1 if created else 0
        ut = 0
        for name in UNIT_TYPES:
            _, created = MsftUnitType.objects.get_or_create(name=name)
            ut += 1 if created else 0
        mp = 0
        for src, tgt in UNIT_TYPE_MAP:
            _, created = MsftUnitTypeMap.objects.get_or_create(source_value=src, defaults={'unit_type': tgt})
            mp += 1 if created else 0

        self.stdout.write(self.style.SUCCESS(
            f"Seeded MSFT master: {MsftCompanyCode.objects.count()} company codes "
            f"(+{cc}), {MsftUnitType.objects.count()} unit types (+{ut}), "
            f"{MsftUnitTypeMap.objects.count()} type maps (+{mp})."
        ))
