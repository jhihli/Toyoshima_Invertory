from django.contrib import admin

# Register your models here.

# Local-only Microsoft Recycling API (Buyback) admin. The package is gitignored
# and absent in production, so this import is expected to fail there. Local data
# entry for that feature happens through /admin/ - see docs/MSFT_LOCAL.md.
try:
    from .msft import admin as _msft_admin  # noqa: F401
except ImportError:
    pass
