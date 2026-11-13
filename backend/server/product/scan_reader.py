"""Reading a photographed 清單 with a vision model: transcription only.

`read_sheet()` is the ONE place this codebase calls a model. Two backends, picked by
CHECKLIST_SCAN_BACKEND: 'ollama' (default — a local open model on the office GPU box,
reached over Tailscale; free) or 'anthropic' (Claude, billed). It returns what is
written on the sheet, as structured JSON; it decides nothing about the database. Matching,
classification, creation plans and reconciliation are done afterwards by deterministic
server code (product.scan_draft). Tests replace `_client()` / `read_sheet()`; no test may
reach the API.

The prompt is built from two system blocks: fixed instructions, then the "experience"
dictionary (known parts, MPN names, owner corrections, recent confirmed examples). The
dictionary block carries the cache breakpoint so a batch of photos re-reads it from cache.
Everything in it is sorted so identical data renders byte-identical (a prefix cache hit).
"""
import base64
import io
import json
from dataclasses import dataclass, field
from decimal import Decimal

from django.conf import settings

# US$ per million tokens for claude-opus-5-5 (input, output, cache write 5-min, cache read).
PRICE_PER_MTOK = {
    'input': Decimal('4.00'),
    'output': Decimal('20.00'),
    'cache_write': Decimal('5.00'),
    'cache_read': Decimal('0.20'),
}

FALLBACK_BETA = 'server-side-fallback-2026-07-01'
MAX_TOKENS = 32000
MAX_EXAMPLES = 3


class ReadError(Exception):
    """The photo could not be read (bad image, no key, API error, refusal, truncation)."""


@dataclass
class ReadResult:
    transcription: dict
    model: str
    usage: dict = field(default_factory=dict)
    cost_usd: Decimal = Decimal('0')


# ─────────────────────────────────────────────────────────── output schema

_CONF = {'type': 'string', 'enum': ['high', 'low']}
_INT_OR_NULL = {'anyOf': [{'type': 'integer'}, {'type': 'null'}]}


def _obj(**props):
    return {'type': 'object', 'properties': props, 'required': list(props), 'additionalProperties': False}


TRANSCRIPTION_SCHEMA = _obj(
    label=_obj(
        so_number={'type': 'string'},
        pallet_barcode={'type': 'string'},
        weight_text={'type': 'string'},
        confidence=_CONF,
    ),
    header_groups={'type': 'array', 'items': _obj(
        mpn_text={'type': 'string'},
        mpn_confidence=_CONF,
        board_qty=_INT_OR_NULL,
        board_qty_confidence=_CONF,
        items={'type': 'array', 'items': _obj(text={'type': 'string'}, confidence=_CONF)},
    )},
    lines={'type': 'array', 'items': _obj(
        index=_INT_OR_NULL,
        column={'type': 'string', 'enum': ['left', 'right']},
        brand_text={'type': 'string'},
        model_text={'type': 'string'},
        model_confidence=_CONF,
        qty=_INT_OR_NULL,
        qty_confidence=_CONF,
        model_candidates={'type': 'array', 'items': {'type': 'string'}},
    )},
    notes={'type': 'string'},
)


# ─────────────────────────────────────────────────────────── prompt

INSTRUCTIONS = """\
You transcribe photos of a handwritten warehouse checklist sheet (清單) into JSON. Report what \
is written; do not compute, correct or reconcile anything — the server does that. One sheet \
describes one pallet of cut circuit boards.

The sheet has three zones:

1. Pallet label: a printed sticker, usually top-left, e.g.
     MSFT
     S06-000979
     06LP00083239-9
     575 LB
   = vendor, SO number, pallet barcode text, weight. Put the SO number in label.so_number, the
   pallet barcode text (third line, e.g. "06LP00083239-9") in label.pallet_barcode, the weight
   line as written in label.weight_text. If the label is missing, use the text printed on the
   checklist stickers (they show the SO number and the pallet barcode text too).

2. Header notes, handwritten above the table: one group per board type, e.g.
     841631-001 (147) { SLKM8, 1G, AL }
   = the board's MPN (part number), a CIRCLED number = how many boards of that type, and a
   brace listing the chips on that board. One header_groups entry per group: mpn_text as
   written, board_qty = the circled number, items = each brace entry as written, top to
   bottom. Brace entries are CPU-type part numbers (SLKM8, "ASPEED AST2400"), brand
   abbreviations (AL = ALTERA) or memory capacity classes (1G, 2G). Copy them; don't expand
   abbreviations. Groups may sit side by side; a brace may open to the left or right.

3. The table: columns 牌子 (brand), 型号 (model / part number), 数量 (quantity). The sheet has
   a LEFT and a RIGHT half, each with its own three columns. Checklist lines are marked by
   printed barcode stickers labelled "#1", "#2", …; a sticker can sit in either half. A line's
   handwriting is on the sticker's rows, sometimes spilling into the next row (e.g. the brand
   "ALTERA" on one row and the part number under it). One lines entry per sticker: index = the
   number after "#", column = left/right, brand_text (often blank), model_text, qty. A sticker
   with nothing written next to it is still a line: model_text "", qty null. Skip handwriting
   that belongs to no sticker, but mention it in notes.

Reading rules:
- Part numbers are alphanumeric and easily confused: 1/I/l, 5/S, 0/O/D, 2/Z, 6/b/G, 8/B, 9/g, \
7/1. Read the strokes, then prefer a spelling from the known-parts list below when the \
handwriting is consistent with it. Put up to 3 likely known parts in model_candidates \
(best first; empty when the reading is clear and known, or nothing fits).
- Set a confidence to "low" whenever you are not sure, including any digit you had to guess.
- qty and board_qty are whole numbers; null when unreadable or absent.
- Copy text without adding hyphens or prefixes that aren't written (no "SP#").
- notes: anything you could not place, crossed-out values, or doubts worth a human look. \
Empty string if none.
"""


def build_context():
    """The reader's experience, from the database: known parts, board MPN names, owner
    corrections and a few recent confirmed scans. Plain data, sorted, so it renders the
    same way every time it hasn't changed."""
    from .models import Chip, MPN, ChecklistCorrection, ChecklistScan
    parts = {}
    for c in Chip.objects.select_related('brand').order_by('id'):
        name = ' '.join((c.chip_mpn or '').split())
        if not name:
            continue
        key = name.upper()
        entry = parts.setdefault(key, {'part': name, 'brand': '', 'slot_group': '', 'item_group': ''})
        if c.brand_id and not entry['brand']:
            entry['brand'] = c.brand.name
        if (c.slot_group or '').strip() and not entry['slot_group'] and not c.variable_qty:
            entry['slot_group'] = c.slot_group.strip()
        if c.item_group and not entry['item_group']:
            entry['item_group'] = c.item_group
    corrections = [
        {'kind': k, 'written': raw, 'means': res}
        for k, raw, res in ChecklistCorrection.objects.order_by('kind', 'raw_key')
        .values_list('kind', 'raw_text', 'resolved')
    ]
    examples = []
    for s in (ChecklistScan.objects.filter(status='confirmed', transcription__isnull=False,
                                           confirmed__isnull=False)
              .order_by('-confirmed_at', '-id')[:MAX_EXAMPLES]):
        examples.append(_example(s.transcription, s.confirmed))
    return {
        'parts': sorted(parts.values(), key=lambda p: p['part'].upper()),
        'mpns': sorted(MPN.objects.values_list('name', flat=True), key=str.upper),
        'corrections': corrections,
        'examples': examples,
    }


def _example(transcription, confirmed):
    """A confirmed scan as 'what was read → what it really said', compactly."""
    read_lines = {l.get('index'): l for l in (transcription or {}).get('lines', [])}
    lines = []
    for l in (confirmed or {}).get('lines', []):
        r = read_lines.get(l.get('index'), {})
        lines.append({'index': l.get('index'), 'read': r.get('model_text', ''), 'read_qty': r.get('qty'),
                      'actual': l.get('part', ''), 'actual_qty': l.get('qty')})
    groups = []
    for m in (confirmed or {}).get('mpns', []):
        groups.append({'read': m.get('text', ''), 'actual_mpn': m.get('final_name') or m.get('new_name') or '',
                       'board_qty': m.get('board_qty')})
    return {'header_groups': groups, 'lines': lines}


def build_system(context):
    dictionary = (
        "Known chip parts (part number, brand, memory capacity class if any). Prefer these "
        "spellings when the handwriting fits:\n"
        + '\n'.join(
            '  ' + ' | '.join(x for x in (p['part'], p['brand'], p['slot_group'] and f"memory {p['slot_group']}") if x)
            for p in context.get('parts', []))
        + "\n\nKnown board MPN names (stored names may carry an 'SP#' prefix the sheet omits):\n  "
        + ', '.join(context.get('mpns', []))
        + "\n\nOwner-confirmed meanings of past handwriting:\n"
        + '\n'.join(f"  [{c['kind']}] \"{c['written']}\" means \"{c['means']}\""
                    for c in context.get('corrections', []))
        + "\n\nRecent sheets as read and as the owner confirmed them (learn from the differences):\n"
        + '\n'.join('  ' + json.dumps(e, ensure_ascii=False, sort_keys=True) for e in context.get('examples', []))
    )
    return [
        {'type': 'text', 'text': INSTRUCTIONS},
        {'type': 'text', 'text': dictionary, 'cache_control': {'type': 'ephemeral'}},
    ]


# ─────────────────────────────────────────────────────────── image + cost

def prepare_image(fileobj):
    """Upright, RGB, long edge ≤ CHECKLIST_SCAN_MAX_EDGE, JPEG. Returns (bytes, media_type).
    The original upload stays on disk untouched; this is only what the model sees."""
    from PIL import Image, ImageOps, UnidentifiedImageError
    try:
        img = Image.open(fileobj)
        img = ImageOps.exif_transpose(img)
        img = img.convert('RGB')
    except (UnidentifiedImageError, OSError, ValueError) as e:
        raise ReadError(f'Not a readable image (iPhone HEIC is not supported — use JPEG/PNG): {e}')
    edge = getattr(settings, 'CHECKLIST_SCAN_MAX_EDGE', 2000)
    img.thumbnail((edge, edge))
    out = io.BytesIO()
    img.save(out, 'JPEG', quality=90)
    return out.getvalue(), 'image/jpeg'


def compute_cost(usage):
    """US$ for one call, from {'input_tokens','output_tokens','cache_read_tokens','cache_write_tokens'}.
    Priced at claude-opus-5-5 rates; a server-side fallback to another model is billed at
    that model's rates, so treat this as an estimate when `model` differs."""
    m = Decimal(1_000_000)
    cost = (Decimal(usage.get('input_tokens', 0)) * PRICE_PER_MTOK['input']
            + Decimal(usage.get('output_tokens', 0)) * PRICE_PER_MTOK['output']
            + Decimal(usage.get('cache_write_tokens', 0)) * PRICE_PER_MTOK['cache_write']
            + Decimal(usage.get('cache_read_tokens', 0)) * PRICE_PER_MTOK['cache_read']) / m
    return cost.quantize(Decimal('0.0001'))


# ─────────────────────────────────────────────────────────── the call

def _client():
    import anthropic
    return anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY, max_retries=2, timeout=300.0)


def read_sheet(image_bytes, media_type, context):
    """Read one photo with the configured backend and return its transcription. Raises ReadError."""
    backend = getattr(settings, 'CHECKLIST_SCAN_BACKEND', 'ollama')
    if backend == 'anthropic':
        return _read_anthropic(image_bytes, media_type, context)
    if backend == 'ollama':
        return _read_ollama(image_bytes, context)
    raise ReadError(f'Unknown CHECKLIST_SCAN_BACKEND {backend!r} (use ollama or anthropic).')


def _post_ollama(url, payload, timeout):
    import requests
    return requests.post(url, json=payload, timeout=timeout)


def _read_ollama(image_bytes, context):
    """Local model (Ollama on the office GPU PC), region by region — see product.scan_local.
    Free. Known part names from the dictionary drive the misspelling candidates."""
    import requests
    from . import scan_local
    base = getattr(settings, 'OLLAMA_URL', 'http://100.125.238.26:11434').rstrip('/')
    model = getattr(settings, 'CHECKLIST_SCAN_OLLAMA_MODEL', 'qwen3-vl:8b-instruct')
    known = [p['part'] for p in context.get('parts', [])]
    known += [c['means'] for c in context.get('corrections', []) if c.get('kind') == 'chip_model']
    try:
        texts, usage = scan_local.read_regions(
            image_bytes, _post_ollama, f'{base}/api/chat', model,
            timeout=getattr(settings, 'CHECKLIST_SCAN_OLLAMA_TIMEOUT', 300),
            num_ctx=getattr(settings, 'CHECKLIST_SCAN_OLLAMA_CTX', 8192))
    except requests.RequestException as e:
        raise ReadError(f'Could not reach the local model at {base} (is the office GPU PC on?): {e}')
    except RuntimeError as e:
        raise ReadError(f'Local model error {e}')
    except (ValueError, OSError) as e:
        raise ReadError(f'Not a readable image or reply: {e}')
    transcription = scan_local.transcription_from_regions(texts, sorted(set(known)))
    return ReadResult(transcription=transcription, model=f'ollama:{model}', usage=usage, cost_usd=Decimal('0'))


def _read_anthropic(image_bytes, media_type, context):
    """Send one photo to Claude and return its transcription. Raises ReadError."""
    if not getattr(settings, 'ANTHROPIC_API_KEY', ''):
        raise ReadError('ANTHROPIC_API_KEY is not set on the server.')
    import anthropic
    model = getattr(settings, 'CHECKLIST_SCAN_MODEL', 'claude-opus-5-5')
    request = dict(
        model=model,
        max_tokens=MAX_TOKENS,
        betas=[FALLBACK_BETA],
        fallbacks='default',
        thinking={'type': 'adaptive'},
        output_config={
            'effort': getattr(settings, 'CHECKLIST_SCAN_EFFORT', 'high'),
            'format': {'type': 'json_schema', 'schema': TRANSCRIPTION_SCHEMA},
        },
        system=build_system(context),
        messages=[{'role': 'user', 'content': [
            {'type': 'image', 'source': {'type': 'base64', 'media_type': media_type,
                                         'data': base64.standard_b64encode(image_bytes).decode('ascii')}},
            {'type': 'text', 'text': 'Transcribe this checklist sheet.'},
        ]}],
    )
    try:
        with _client().beta.messages.stream(**request) as stream:
            message = stream.get_final_message()
    except anthropic.RateLimitError as e:
        raise ReadError(f'Rate limited by the API; retry in a minute ({e.message}).')
    except anthropic.APIStatusError as e:
        raise ReadError(f'API error {e.status_code}: {e.message}')
    except anthropic.APIConnectionError as e:
        raise ReadError(f'Could not reach the API: {e}')

    u = message.usage
    usage = {
        'input_tokens': getattr(u, 'input_tokens', 0) or 0,
        'output_tokens': getattr(u, 'output_tokens', 0) or 0,
        'cache_read_tokens': getattr(u, 'cache_read_input_tokens', 0) or 0,
        'cache_write_tokens': getattr(u, 'cache_creation_input_tokens', 0) or 0,
    }
    cost = compute_cost(usage)
    if message.stop_reason == 'refusal':
        cat = getattr(getattr(message, 'stop_details', None), 'category', None)
        raise ReadError(f'The model declined to read this photo (refusal{f": {cat}" if cat else ""}).')
    if message.stop_reason == 'max_tokens':
        raise ReadError('The reading was cut off (max_tokens); retry.')
    text = next((b.text for b in message.content if getattr(b, 'type', '') == 'text'), '')
    try:
        transcription = json.loads(text)
    except json.JSONDecodeError as e:
        raise ReadError(f'The reading was not valid JSON: {e}')
    return ReadResult(transcription=transcription, model=getattr(message, 'model', model) or model,
                      usage=usage, cost_usd=cost)
