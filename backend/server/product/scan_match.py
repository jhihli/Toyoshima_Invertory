"""Normalisation and matching for handwritten checklist sheets. Pure functions, no DB.

Part numbers on the sheets are handwritten and the stored `Chip.chip_mpn` values were
typed from the same handwriting, so both sides carry the classic confusions — I/1, S/5,
O/0 (`EP4CE1SF23C9LN` is EP4CE15F23C9LN) — and suffixes come and go
(`NT5TU64M16HG` vs `NT5TU64M16HG-AC`). Matching therefore runs on a *fuzzy key* that
folds those confusions, plus a guarded prefix rule. It never decides on its own that two
different-looking names are the same board type: MPN near-matches are only suggestions
shown to the owner (`similarity`).
"""
import re
from difflib import SequenceMatcher

# Characters handwriting (and the stored data typed from it) confuses, folded together.
_CONFUSABLE = str.maketrans({'I': '1', 'S': '5', 'O': '0'})

# The shorter part number must be at least this long for a prefix to count as the same
# part (NT5TU64M16HG ⊂ NT5TU64M16HG-AC); anything shorter is too ambiguous.
MIN_PREFIX_LEN = 8


def norm(s):
    """Exactly Pallet.checklist_check()'s key: collapse whitespace, upper-case."""
    return ' '.join((s or '').split()).upper()


def fuzzy_key(s):
    """Alphanumerics only, upper-case, I→1 S→5 O→0. Equal keys = same handwriting."""
    return re.sub(r'[^0-9A-Z]', '', (s or '').upper()).translate(_CONFUSABLE)


def same_part(a, b):
    """Are two chip part numbers the same part? Equal fuzzy keys, or one is a prefix of
    the other and the shorter is at least MIN_PREFIX_LEN characters."""
    ka, kb = fuzzy_key(a), fuzzy_key(b)
    if not ka or not kb:
        return False
    if ka == kb:
        return True
    short, long_ = sorted((ka, kb), key=len)
    return len(short) >= MIN_PREFIX_LEN and long_.startswith(short)


_SP_PREFIX = re.compile(r'^\s*SP\s*(#|(?=\d))\s*', re.I)


def mpn_key(s):
    """Board MPN key: production names carry an 'SP#' prefix the handwriting omits
    (SP#841631-001 ↔ 841631-001), and case varies (x898568 ↔ X898568)."""
    return fuzzy_key(_SP_PREFIX.sub('', s or ''))


def similarity(a, b):
    """0..1 closeness of two MPN names, on their mpn keys (for near-match suggestions)."""
    ka, kb = mpn_key(a), mpn_key(b)
    if not ka or not kb:
        return 0.0
    return SequenceMatcher(None, ka, kb).ratio()


_CAPACITY = re.compile(r'^\s*(\d+(?:\.\d+)?)\s*([GMT])\s*B?\s*$', re.I)


def capacity_class(text):
    """A brace entry that names a memory capacity class ('1G', '1GB', '2 g', '512M') →
    the canonical class string ('1G', '2G', '512M'); anything else → None."""
    m = _CAPACITY.match(text or '')
    if not m:
        return None
    return f'{m.group(1)}{m.group(2).upper()}'


def _mbits_to_class(mbits):
    if mbits >= 1024 and mbits % 1024 == 0:
        return f'{mbits // 1024}G'
    return f'{mbits}M'


# Density written straight into the part number (Gbit): Samsung K4B1G…, Hynix H5TQ2G….
_DENSITY_G = [re.compile(r'^K4[A-Z](\d+)G'), re.compile(r'^H5[A-Z]{2}(\d+)G')]
# Density as organisation depth×width (Mbit): Nanya NT5TU64M16 = 64M×16 = 1Gbit,
# Micron MT41K256M16 = 4Gbit.
_DENSITY_ORG = re.compile(r'^(?:NT5[A-Z]{2}|MT4\d[A-Z]+?)(\d+)M(\d+)')


def decode_capacity(part):
    """Capacity class decoded from a DRAM part number, or None when it can't be read off
    the number (e.g. Micron FBGA codes like D9SFT — those come from the dictionary)."""
    p = re.sub(r'[^0-9A-Z]', '', (part or '').upper())
    for rx in _DENSITY_G:
        m = rx.match(p)
        if m:
            return f'{int(m.group(1))}G'
    m = _DENSITY_ORG.match(p)
    if m:
        return _mbits_to_class(int(m.group(1)) * int(m.group(2)))
    return None


def parse_weight(text):
    """'575 LB' / '1,060 lb' → 575.0 / 1060.0; no number → None."""
    m = re.search(r'\d[\d,]*(?:\.\d+)?', text or '')
    if not m:
        return None
    return float(m.group(0).replace(',', ''))
