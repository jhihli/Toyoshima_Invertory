"""Reading a 清單 photo with a small local vision model (Ollama on the office GPU PC).

An 8B model can't fill the whole transcription schema in one go (it loses the table
structure and loops), but it reads well when given one region at a time and asked for
plain lines. So the photo is cut into the sheet's fixed regions — printed label,
handwritten header notes, left and right halves of the table — each is enlarged and read
separately, and the lines are parsed here into the same transcription dict the Claude
reader returns. The draft builder (scan_draft) then does all matching as before.

Small models misspell part numbers in predictable ways (G/6, B/8, S/5, Z/2, O/0/Q…), so
each reading also gets `model_candidates`: the closest known parts under a handwriting
fold. The reading itself is kept as read; the draft builder picks the candidate and marks
it yellow for the owner.

Pure functions apart from `read_regions`, which makes the HTTP calls through a
`post(url, payload, timeout)` callable so tests can fake it.
"""
import base64
import io
import re
from difflib import SequenceMatcher

# Region boxes as fractions of the sheet (left, top, right, bottom). The sheets are one
# printed template, photographed whole; generous overlaps absorb framing differences.
REGIONS = {
    'label': (0.0, 0.0, 0.42, 0.16),
    'header': (0.2, 0.0, 1.0, 0.16),
    'left': (0.0, 0.10, 0.56, 1.0),
    'right': (0.48, 0.10, 1.0, 1.0),
}
UPSCALE_WIDTH = 1400

PROMPTS = {
    'label': ("This is the top-left corner of a warehouse sheet with a PRINTED label sticker (four lines: "
              "vendor, SO number like S06-000979, pallet barcode text like 06LP00083239-9, weight like 575 LB). "
              "Answer exactly three lines:\nSO: <SO number>\nPALLET: <pallet barcode text>\nWEIGHT: <weight as printed>"),
    'header': ("This is the top of a checklist sheet. Handwritten notes are arranged in groups, side by side. "
               "Each group: a board part number written on the left (digits/letters, e.g. 841631-001, X898568, "
               "B600GH0), a CIRCLED number under it, and a curly brace to its right listing items (e.g. SLKM8, 1G, "
               "2G, AL, ASPEED AST2400). Ignore the printed label sticker. List every group, one per line: "
               "PARTNUMBER | CIRCLED NUMBER | items comma-separated. Output only the lines."),
    'table': ("This is part of a handwritten checklist table with columns brand (牌子), model (型号), qty (数量). "
              "Barcode stickers labelled #1, #2, ... mark the lines. For EVERY sticker visible, give the brand "
              "(often blank), the model/part number and the quantity handwritten on its rows; a brand like ALTERA "
              "may be on the row above its part number - keep them on one line. One line per sticker: "
              "#n | brand | model | qty. Output only the lines. If there are no stickers, output NONE."),
}

# Handwriting look-alikes folded together for candidate search (wider than scan_match's
# I/S/O fold, because this is only for suggesting, never for deciding).
_HAND_FOLD = str.maketrans({'I': '1', 'L': '1', 'S': '5', 'O': '0', 'Q': '0', 'D': '0',
                            'G': '6', 'B': '8', 'Z': '2'})
CANDIDATE_MIN = 0.6


def hand_key(s):
    return re.sub(r'[^0-9A-Z]', '', (s or '').upper()).translate(_HAND_FOLD)


def candidates(text, known, limit=3):
    """Known part names closest to `text` under the handwriting fold, best first."""
    k = hand_key(text)
    if not k:
        return []
    scored = []
    for name in known:
        nk = hand_key(name)
        if not nk:
            continue
        r = 1.0 if nk == k else SequenceMatcher(None, k, nk).ratio()
        if r >= CANDIDATE_MIN:
            scored.append((r, name))
    scored.sort(key=lambda x: (-x[0], x[1]))
    return [n for _, n in scored[:limit]]


def _int(s):
    m = re.search(r'\d+', s or '')
    return int(m.group(0)) if m else None


def _cells(line):
    return [c.strip() for c in line.split('|')]


def parse_label(text):
    out = {'so_number': '', 'pallet_barcode': '', 'weight_text': '', 'confidence': 'high'}
    for line in (text or '').splitlines():
        key, _, val = line.partition(':')
        key, val = key.strip().upper(), val.strip()
        if key == 'SO':
            out['so_number'] = val
        elif key.startswith('PALLET'):
            out['pallet_barcode'] = val
        elif key.startswith('WEIGHT'):
            out['weight_text'] = val
    if not (out['so_number'] and out['pallet_barcode']):
        out['confidence'] = 'low'
    return out


def parse_header(text, known):
    groups = []
    for line in (text or '').splitlines():
        cells = _cells(line)
        if len(cells) < 2 or not cells[0] or cells[0].upper() == 'NONE':
            continue
        qty = _int(cells[1])
        items = []
        for raw in (cells[2].split(',') if len(cells) > 2 else []):
            t = ' '.join(raw.split())
            if not t:
                continue
            if re.fullmatch(r'\d+(\.\d+)?\s*[GMT]B?', t, re.I) or len(t) <= 3:
                items.append({'text': t, 'confidence': 'high'})      # 1G / 2G / AL as written
                continue
            best = candidates(t, known, limit=1)
            if best and hand_key(best[0]) != hand_key(t):
                items.append({'text': best[0], 'confidence': 'low'})  # 52Ka8 → SLKM8
            else:
                items.append({'text': best[0] if best else t, 'confidence': 'high' if best else 'low'})
        groups.append({'mpn_text': cells[0], 'mpn_confidence': 'low',
                       'board_qty': qty, 'board_qty_confidence': 'high' if qty is not None else 'low',
                       'items': items})
    return groups


def parse_table(text, column, known):
    lines = []
    for line in (text or '').splitlines():
        cells = _cells(line)
        if len(cells) < 3 or not cells[0].lstrip().startswith('#'):
            continue
        idx = _int(cells[0])
        brand, model = cells[1], ' '.join(cells[2].split())
        qty = _int(cells[3]) if len(cells) > 3 else None
        cands = candidates(model, known)
        exact = bool(cands) and hand_key(cands[0]) == hand_key(model) and cands[0].upper() == model.upper()
        lines.append({
            'index': idx, 'column': column, 'brand_text': brand, 'model_text': model,
            'model_confidence': 'high' if exact else 'low', 'qty': qty,
            'qty_confidence': 'high' if qty is not None else 'low',
            'model_candidates': [] if exact else cands,
        })
    return lines


def merge_lines(left, right):
    """Stickers are numbered continuously within a pallet, so an index is unique. A small
    model often misreads a right-half sticker ('#7' as '#1'); a right-half line whose index
    is already taken (or missing) is renumbered after the highest one, and noted."""
    notes = []
    taken = {l['index'] for l in left if l['index'] is not None}
    out = list(left)
    for l in right:
        if l['index'] is None or l['index'] in taken:
            new = max(taken | {0}) + 1
            notes.append(f"right-half sticker read as #{l['index']} renumbered #{new}")
            l = {**l, 'index': new}
        taken.add(l['index'])
        out.append(l)
    return out, notes


def transcription_from_regions(texts, known):
    """texts: {'label','header','left','right'} → raw model output per region."""
    left = parse_table(texts.get('left'), 'left', known)
    right = parse_table(texts.get('right'), 'right', known)
    lines, notes = merge_lines(left, right)
    return {
        'label': parse_label(texts.get('label')),
        'header_groups': parse_header(texts.get('header'), known),
        'lines': lines,
        'notes': '; '.join(notes),
    }


def crop_regions(image_bytes):
    """JPEG bytes per region, each enlarged to UPSCALE_WIDTH when smaller."""
    from PIL import Image
    im = Image.open(io.BytesIO(image_bytes)).convert('RGB')
    w, h = im.size
    out = {}
    for name, (l, t, r, b) in REGIONS.items():
        c = im.crop((int(w * l), int(h * t), int(w * r), int(h * b)))
        if c.width < UPSCALE_WIDTH:
            c = c.resize((UPSCALE_WIDTH, int(c.height * UPSCALE_WIDTH / c.width)), Image.LANCZOS)
        buf = io.BytesIO()
        c.save(buf, 'JPEG', quality=92)
        out[name] = buf.getvalue()
    return out


def read_regions(image_bytes, post, url, model, timeout, num_ctx=8192):
    """Ask the model about each region. Returns ({region: text}, usage). `post` raises on
    transport errors; a non-200 reply raises RuntimeError with the body."""
    texts, usage = {}, {'input_tokens': 0, 'output_tokens': 0, 'cache_read_tokens': 0, 'cache_write_tokens': 0}
    for name, data in crop_regions(image_bytes).items():
        prompt = PROMPTS['table' if name in ('left', 'right') else name]
        payload = {
            'model': model, 'stream': False, 'keep_alive': '30m',
            'options': {'temperature': 0, 'num_ctx': num_ctx, 'num_predict': 800},
            'messages': [{'role': 'user', 'content': prompt,
                          'images': [base64.standard_b64encode(data).decode('ascii')]}],
        }
        resp = post(url, payload, timeout)
        if resp.status_code != 200:
            raise RuntimeError(f'{resp.status_code}: {resp.text[:300]}')
        body = resp.json()
        texts[name] = (body.get('message') or {}).get('content', '')
        usage['input_tokens'] += body.get('prompt_eval_count', 0) or 0
        usage['output_tokens'] += body.get('eval_count', 0) or 0
    return texts, usage
