"""Checklist photo → draft → apply. Deterministic; the model only transcribes.

build_draft(scan)       the model's transcription, matched against the database and the
                        pallet's CURRENT state, as a reviewable plan (plain JSON).
apply_draft(pallet, d)  every write the plan makes, re-validated against the database at
                        apply time, in one transaction. Raises DraftError (nothing written).
preview_check(pallet,d) apply_draft inside a savepoint that is always rolled back, then
                        Pallet.checklist_check() on the would-be state: reconciliation is the
                        existing checker run on the draft, never a second implementation.
learn_from_confirm(d)   owner corrections → ChecklistCorrection.

Owner edits come in two kinds. Choices (tick a chip addition, use the sheet value for a
conflicting row, keep/replace a board count, tick a deletion) are flipped in the draft
itself. Content edits (a part number, a qty, a capacity class, which MPN a header means)
go into `overrides` and the draft is rebuilt, so chip plans and line actions are always
derived by this module; `previous=` carries the choices across a rebuild.

Draft shape (all keys always present):
  pallet_id, pallet_options[{id,label,barcode}], errors[] (red), warnings[] (yellow),
  label{so_number,pallet_barcode,weight_text,weight,stored_weight,weight_mismatch},
  mpns[{key,text,board_qty,current_board_qty,board_qty_choice('sheet'|'keep'),match
        ('exact'|'correction'|'near'|'new'|'owner'),mpn_id,new_name,name,suggestions[],
        yellow[],skip,chips[{part,brand,slot_group,item_group,exists,apply,shared,note}],
        unresolved[{text,options[]}],notes[]}],
  missing_pallet_mpns[{mpn_id,name,board_qty}],
  lines[{index,column,brand,part,raw_model,qty,capacity,capacity_source,candidates[],
         yellow[],action('fill'|'same'|'conflict'|'create'|'flag'),row_id,existing,
         use_sheet,flag}],
  delete_rows[{row_id,index,barcode,apply}], extra_rows[{row_id,index,model,qty,reason}],
  capacity_classes[], overrides{}, initial{}, check{}
"""
import re

from django.db import transaction

from .models import (
    Pallet, MPN, Chip, ChipBrand, PalletMPN, Checklist, PalletChipNG, ChecklistCorrection,
)
from .scan_match import (
    norm, fuzzy_key, mpn_key, same_part, similarity, capacity_class, decode_capacity, parse_weight,
)

NEAR_MPN = 0.8          # best MPN similarity at/above which it is pre-selected (yellow)
SUGGEST_MPN = 0.6       # MPN names at/above this are offered as suggestions
SUGGEST_PART = 0.75     # part numbers at/above this are offered as suggestions
WEIGHT_TOLERANCE = 0.5  # lb
_CAPACITY_SHAPED = re.compile(r'^\d+(\.\d+)?[GMT]$')
_ITEM_GROUPS = {v for v, _ in Chip.ITEM_GROUP_CHOICES}


class DraftError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


# ─────────────────────────────────────────────────────────── catalog

class Catalog:
    """Every known chip part number (deduplicated on the fuzzy key) and every MPN."""

    def __init__(self):
        self.parts = {}     # fuzzy key → {part, brand, slot_group, capacity, item_group}
        for c in Chip.objects.select_related('brand').order_by('id'):
            name = ' '.join((c.chip_mpn or '').split())
            k = fuzzy_key(name)
            if not k:
                continue
            e = self.parts.setdefault(k, {'part': name, 'brand': '', 'slot_group': '', 'capacity': None,
                                          'item_group': ''})
            if c.brand_id and not e['brand']:
                e['brand'] = c.brand.name
            g = (c.slot_group or '').strip()
            if g and not c.variable_qty and not e['slot_group']:
                e['slot_group'] = g
                if _CAPACITY_SHAPED.match(g.upper()):
                    e['capacity'] = g.upper()
            if c.item_group and not e['item_group']:
                e['item_group'] = c.item_group
        self.mpns = list(MPN.objects.order_by('name').values_list('id', 'name'))
        self.brands = {b.upper(): b for b in ChipBrand.objects.values_list('name', flat=True)}

    def find(self, text):
        """The catalog entry for a written part number: same fuzzy key, else a unique
        guarded-prefix match (same_part). None when unknown or ambiguous."""
        k = fuzzy_key(text)
        if not k:
            return None
        if k in self.parts:
            return self.parts[k]
        hits = [e for e in self.parts.values() if same_part(e['part'], text)]
        return hits[0] if len(hits) == 1 else None

    def suggest(self, text, limit=3):
        k = fuzzy_key(text)
        if not k:
            return []
        from difflib import SequenceMatcher
        scored = sorted(((SequenceMatcher(None, k, pk).ratio(), e['part']) for pk, e in self.parts.items()),
                        reverse=True)
        return [p for s, p in scored[:limit] if s >= SUGGEST_PART]

    def brand_name(self, text):
        """Written brand → canonical name: owner abbreviation, else an existing ChipBrand
        (case-insensitive), else the text as written."""
        t = ' '.join((text or '').split())
        if not t:
            return ''
        abbrev = ChecklistCorrection.lookup('brand_abbrev', t)
        if abbrev:
            return self.brands.get(abbrev.upper(), abbrev)
        return self.brands.get(t.upper(), t)


# ─────────────────────────────────────────────────────────── helpers

def _row_index(row):
    tail = (row.barcode or '').rsplit('-', 1)[-1]
    return int(tail) if tail.isdigit() else None


def _has_content(row):
    return bool((row.model or '').strip() or (row.brand or '').strip() or row.qty is not None
                or row.chip_id or row.is_ng)


def _snapshot(row):
    return {'brand': row.brand or '', 'model': row.model or '', 'qty': row.qty}


def _as_qty(v):
    if v in (None, ''):
        return None
    try:
        n = int(v)
    except (TypeError, ValueError):
        raise DraftError(f'Not a whole number: {v!r}')
    if n < 0:
        raise DraftError(f'Negative quantity: {n}')
    return n


def _pallet_label(p):
    return p.licence_number or f'Pallet #{p.pallet_seq}'


def match_pallet(so, label_barcode):
    """The pallet of `so` whose label text the sheet shows ('06LP00083239-9' is the
    composed barcode 'S06-000979-06LP00083239-9' minus the SO). Unique match or None."""
    k = fuzzy_key(label_barcode)
    if not k:
        return None
    hits = []
    for p in so.pallets.select_related('so'):
        full = fuzzy_key(p.compose_barcode())
        own = fuzzy_key(f'{p.licence_number}{p.gateload_number}')
        if k in (full, own) or (own and full.endswith(k) and len(k) >= len(own)):
            hits.append(p)
    return hits[0] if len(hits) == 1 else None


def _merge_overrides(prev, new):
    out = {'lines': {}, 'mpns': {}, 'capacity': {}}
    for src in (prev or {}, new or {}):
        for section in out:
            for k, v in (src.get(section) or {}).items():
                if isinstance(v, dict) and isinstance(out[section].get(str(k)), dict):
                    out[section][str(k)] = {**out[section][str(k)], **v}
                else:
                    out[section][str(k)] = v
    return out


# ─────────────────────────────────────────────────────────── build

def build_draft(scan, pallet=None, overrides=None, previous=None):
    """Turn scan.transcription into a draft against the current database state.
    Writes nothing (the preview runs inside a rolled-back savepoint)."""
    t = scan.transcription or {}
    so = scan.so
    cat = Catalog()
    ov = _merge_overrides((previous or {}).get('overrides'), overrides)
    prev = previous or {}

    errors, warnings = [], []
    label_in = t.get('label') or {}
    label = {
        'so_number': label_in.get('so_number', ''),
        'pallet_barcode': label_in.get('pallet_barcode', ''),
        'weight_text': label_in.get('weight_text', ''),
        'weight': parse_weight(label_in.get('weight_text', '')),
        'stored_weight': None, 'weight_mismatch': False,
    }
    if label['so_number'] and fuzzy_key(label['so_number']) != fuzzy_key(so.so_number):
        errors.append(f"This sheet belongs to {label['so_number']}, not {so.so_number}.")

    if pallet is None and prev.get('pallet_id'):
        pallet = so.pallets.filter(pk=prev['pallet_id']).first()
    if pallet is None:
        pallet = match_pallet(so, label['pallet_barcode'])
    if pallet is None:
        errors.append(f"No pallet of {so.so_number} matches the label '{label['pallet_barcode']}'. "
                      f"Pick the pallet.")
    else:
        label['stored_weight'] = float(pallet.in_weight_gross or 0)
        if label['weight'] is not None and abs(label['weight'] - label['stored_weight']) > WEIGHT_TOLERANCE:
            label['weight_mismatch'] = True
            warnings.append(f"Label weight {label['weight_text']} differs from the stored "
                            f"{label['stored_weight']:g} lb (not changed).")

    # ── lines: resolve parts first; header braces refer to them ('AL', '1G')
    lines = []
    for raw in t.get('lines') or []:
        idx = raw.get('index')
        lo = (ov['lines'].get(str(idx)) or {}) if idx is not None else {}
        lines.append(_resolve_line(raw, lo, cat, ov['capacity']))
    lines.sort(key=lambda l: (l['index'] is None, l['index'] or 0))

    header_classes = []
    for g in t.get('header_groups') or []:
        for it in g.get('items') or []:
            c = capacity_class(it.get('text', ''))
            if c and c not in header_classes:
                header_classes.append(c)

    # ── header groups → MPNs and their chips
    mpns, referenced = [], set()
    prev_mpns = {m['key']: m for m in prev.get('mpns', [])}
    current_on_pallet = {}
    if pallet is not None:
        current_on_pallet = {r.mpn_id: r for r in pallet.pallet_mpns.select_related('mpn')}
    for gi, g in enumerate(t.get('header_groups') or []):
        key = f'g{gi + 1}'
        mpns.append(_resolve_group(key, g, ov['mpns'].get(key) or {}, prev_mpns.get(key),
                                   lines, cat, current_on_pallet, referenced))

    # A line nobody's brace names and with no class may be an unclassified memory part.
    for l in lines:
        if l['part'] and not l['capacity'] and fuzzy_key(l['part']) not in referenced and header_classes:
            l['yellow'].append('capacity')
            l['capacity_options'] = header_classes

    matched_ids = {m['mpn_id'] for m in mpns if m['mpn_id']}
    missing = [{'mpn_id': r.mpn_id, 'name': r.mpn.name, 'board_qty': r.board_qty}
               for r in current_on_pallet.values() if r.mpn_id not in matched_ids]
    if missing:
        warnings.append('On the pallet but not on the sheet (kept): ' + ', '.join(m['name'] for m in missing))

    delete_rows, extra_rows = [], []
    if pallet is not None:
        delete_rows, extra_rows = _plan_rows(pallet, lines, prev)
    else:
        for l in lines:
            l['action'], l['flag'] = 'flag', 'Pick the pallet first.'

    draft = {
        'pallet_id': pallet.id if pallet else None,
        'pallet_options': [{'id': p.id, 'label': _pallet_label(p), 'barcode': p.compose_barcode()}
                           for p in so.pallets.select_related('so').order_by('pallet_seq')],
        'errors': errors, 'warnings': warnings, 'label': label,
        'mpns': mpns, 'missing_pallet_mpns': missing, 'lines': lines,
        'delete_rows': delete_rows, 'extra_rows': extra_rows,
        'capacity_classes': header_classes, 'overrides': ov,
        'notes': t.get('notes', ''),
    }
    draft['initial'] = prev.get('initial') or _initial_snapshot(draft)
    draft['check'] = preview_check(pallet, draft) if pallet is not None else {'status': 'none', 'slots': [],
                                                                              'modules': [], 'unmatched': []}
    return draft


def _resolve_line(raw, lo, cat, cap_overrides):
    raw_model = ' '.join((raw.get('model_text') or '').split())
    brand_text = raw.get('brand_text') or ''
    yellow = []
    # A brand written into the model cell ("ASPEED AST2400").
    toks = raw_model.split(' ')
    if not brand_text and len(toks) > 1 and cat.find(' '.join(toks[1:])) and not cat.find(raw_model):
        brand_text, raw_model = toks[0], ' '.join(toks[1:])

    candidates = [c for c in (raw.get('model_candidates') or []) if c]
    if 'part' in lo:
        part, source = ' '.join(str(lo['part']).split()), 'owner'
        e = cat.find(part)
        if e and fuzzy_key(e['part']) == fuzzy_key(part):
            part = e['part']
    elif not raw_model:
        part, source = '', 'blank'
    else:
        part, source = _resolve_part(raw_model, candidates, cat)
    if source in ('candidate', 'near', 'unknown') or raw.get('model_confidence') == 'low':
        yellow.append('part')
    sugg = []
    if source in ('candidate', 'near', 'unknown'):
        sugg = list(dict.fromkeys([*(e['part'] for e in (cat.find(c) for c in candidates) if e),
                                   *cat.suggest(raw_model)]))
        sugg = [s for s in sugg if fuzzy_key(s) != fuzzy_key(part)]

    qty = lo['qty'] if 'qty' in lo else raw.get('qty')
    if qty is None or (raw.get('qty_confidence') == 'low' and 'qty' not in lo):
        yellow.append('qty')
    if raw.get('index') is None:
        yellow.append('index')

    entry = cat.find(part) if part else None
    brand = lo['brand'] if 'brand' in lo else (cat.brand_name(brand_text) or (entry['brand'] if entry else ''))

    capacity, cap_source = None, None
    if part:
        capacity, cap_source = classify_capacity(part, cat, cap_overrides)
    return {
        'index': raw.get('index'), 'column': raw.get('column', 'left'),
        'brand': brand, 'part': part, 'raw_model': raw.get('model_text') or '', 'part_source': source,
        'qty': qty, 'capacity': capacity, 'capacity_source': cap_source, 'capacity_options': [],
        'candidates': sugg, 'yellow': yellow,
        'action': None, 'row_id': None, 'existing': None, 'use_sheet': False, 'flag': '',
    }


def _resolve_part(text, candidates, cat):
    fixed = ChecklistCorrection.lookup('chip_model', text)
    if fixed:
        e = cat.find(fixed)
        return (e['part'] if e else fixed), 'correction'
    e = cat.find(text)
    if e:
        return e['part'], 'catalog'
    for c in candidates:
        e = cat.find(c)
        if e:
            return e['part'], 'candidate'
    near = cat.suggest(text, limit=1)
    if near:
        return norm(text), 'near'
    return norm(text), 'unknown'


def classify_capacity(part, cat, cap_overrides=None):
    """Memory capacity class of a part: owner override, the catalog's slot_group, the
    owner-confirmed dictionary, decoding the number. (None, None) when it isn't known."""
    for k, v in (cap_overrides or {}).items():
        if same_part(k, part):
            return (v or None), 'owner'
    e = cat.find(part)
    if e and e['capacity']:
        return e['capacity'], 'catalog'
    d = ChecklistCorrection.lookup('capacity_class', part)
    if d:
        return d, 'dictionary'
    d = decode_capacity(part)
    if d:
        return d, 'decoded'
    return None, None


def _resolve_group(key, g, ov, prev, lines, cat, current_on_pallet, referenced):
    text = ' '.join((g.get('mpn_text') or '').split())
    yellow, suggestions = [], []
    scored = sorted(((similarity(text, name), mid, name) for mid, name in cat.mpns), reverse=True)
    suggestions = [{'id': mid, 'name': name, 'score': round(s, 2)} for s, mid, name in scored[:3] if s >= SUGGEST_MPN]

    mpn_id, new_name, match = None, '', 'new'
    if 'mpn_id' in ov or 'new_name' in ov:
        mpn_id = ov.get('mpn_id') or None
        new_name = '' if mpn_id else ' '.join(str(ov.get('new_name') or text).split())
        match = 'owner'
    else:
        fixed = ChecklistCorrection.lookup('mpn_name', text)
        exact = [mid for mid, name in cat.mpns if mpn_key(name) == mpn_key(text)]
        fixed_id = next((mid for mid, name in cat.mpns if fixed and name.upper() == fixed.upper()), None)
        if fixed_id:
            mpn_id, match = fixed_id, 'correction'
        elif len(exact) == 1:
            mpn_id, match = exact[0], 'exact'
        elif scored and scored[0][0] >= NEAR_MPN and (len(scored) < 2 or scored[0][0] > scored[1][0]):
            mpn_id, match = scored[0][1], 'near'
        else:
            new_name = text
    if match in ('near', 'new') or g.get('mpn_confidence') == 'low':
        yellow.append('mpn')
    name = dict(cat.mpns).get(mpn_id, '') if mpn_id else new_name

    board_qty = ov['board_qty'] if 'board_qty' in ov else g.get('board_qty')
    if board_qty is None or (g.get('board_qty_confidence') == 'low' and 'board_qty' not in ov):
        yellow.append('board_qty')
    row = current_on_pallet.get(mpn_id) if mpn_id else None
    current = row.board_qty if row else None
    conflict = row is not None and current is not None and current != board_qty
    choice = (prev or {}).get('board_qty_choice') if prev and prev.get('mpn_id') == mpn_id else None
    choice = choice or ('keep' if conflict else 'sheet')
    if conflict and 'board_qty' not in yellow:
        yellow.append('board_qty')

    existing = list(MPN.objects.get(pk=mpn_id).chips.all()) if mpn_id else []
    is_new = mpn_id is None
    prev_apply = {fuzzy_key(c['part']): c.get('apply') for c in (prev or {}).get('chips', [])}
    chips, unresolved, notes = [], [], []
    item_overrides = ov.get('items') or {}
    for it in g.get('items') or []:
        itext = ' '.join((it.get('text') or '').split())
        if not itext:
            continue
        resolved, why = _resolve_item(itext, item_overrides.get(itext), lines, cat)
        if why:
            if why.startswith('unresolved'):
                unresolved.append({'text': itext, 'options': [l['part'] for l in lines if l['part']]})
            else:
                notes.append(why)
        for part, brand, slot_group, item_group, is_ref in resolved:
            if is_ref:
                referenced.add(fuzzy_key(part))
            k = fuzzy_key(part)
            if any(fuzzy_key(c['part']) == k for c in chips):
                continue
            have = next((c for c in existing if same_part(c.chip_mpn, part)), None)
            if have:
                note = ''
                if slot_group and (have.slot_group or '').strip() != slot_group:
                    note = f"stored slot group is '{have.slot_group or ''}' (not changed)"
                chips.append({'part': have.chip_mpn, 'brand': have.brand.name if have.brand_id else '',
                              'slot_group': have.slot_group or '', 'item_group': have.item_group or '',
                              'exists': True, 'apply': False, 'shared': False, 'note': note})
            else:
                apply = prev_apply.get(k)
                chips.append({'part': part, 'brand': brand, 'slot_group': slot_group, 'item_group': item_group,
                              'exists': False, 'apply': is_new if apply is None else bool(apply),
                              'shared': not is_new, 'note': ''})
    return {
        'key': key, 'text': text, 'board_qty': board_qty, 'current_board_qty': current,
        'board_qty_choice': choice, 'match': match, 'mpn_id': mpn_id, 'new_name': new_name, 'name': name,
        'suggestions': suggestions, 'yellow': yellow, 'skip': bool((prev or {}).get('skip')),
        'chips': chips, 'unresolved': unresolved, 'notes': notes,
    }


def _resolve_item(text, override, lines, cat):
    """A brace entry → [(part, brand, slot_group, item_group, is_cpu_reference)], note."""
    def entry(part, brand=''):
        e = cat.find(part)
        line = next((l for l in lines if l['part'] and same_part(l['part'], part)), None)
        b = brand or (line['brand'] if line else '') or (e['brand'] if e else '')
        return (e['part'] if e else part), b, (e['slot_group'] if e and not e['capacity'] else ''), \
            (e['item_group'] if e else '')

    if override:
        p, b, sg, ig = entry(' '.join(str(override).split()))
        return [(p, b, sg, ig, True)], ''

    cls = capacity_class(text)
    if cls:
        parts = []
        for l in lines:
            if l['part'] and l['capacity'] == cls and not any(same_part(l['part'], p[0]) for p in parts):
                e = cat.find(l['part'])
                parts.append((l['part'], l['brand'] or (e['brand'] if e else ''), cls, 'Memory', False))
        return parts, ('' if parts else f'no {cls} line on this sheet')

    brand = ChecklistCorrection.lookup('brand_abbrev', text)
    if brand:
        parts = []
        for l in lines:
            e = cat.find(l['part']) if l['part'] else None
            if l['part'] and brand.upper() in ((l['brand'] or '').upper(), (e['brand'] if e else '').upper()):
                if not any(same_part(l['part'], p) for p in parts):
                    parts.append(l['part'])
        if len(parts) == 1:
            p, b, sg, ig = entry(parts[0], brand)
            return [(p, b, sg, ig, True)], ''
        return [], f'unresolved: {text} ({brand}) matches {len(parts)} lines'

    toks = text.split(' ')
    for k in range(len(toks)):
        suffix, prefix = ' '.join(toks[k:]), ' '.join(toks[:k])
        line = next((l for l in lines if l['part'] and same_part(l['part'], suffix)), None)
        if line:
            p, b, sg, ig = entry(line['part'], cat.brand_name(prefix))
            return [(p, b, sg, ig, True)], ''
        if cat.find(suffix):
            p, b, sg, ig = entry(cat.find(suffix)['part'], cat.brand_name(prefix))
            return [(p, b, sg, ig, True)], ''
    if len(text) <= 3 and text.isalpha():
        return [], f'unresolved: {text}'
    p, b, sg, ig = entry(norm(text))
    return [(p, b, sg, ig, True)], ''


def _plan_rows(pallet, lines, prev):
    rows = {}
    others = []
    for r in pallet.checklists.order_by('id'):
        i = _row_index(r)
        if i is None or i in rows:
            others.append(r)
        else:
            rows[i] = r
    prev_lines = {l['index']: l for l in prev.get('lines', [])}
    prev_del = {r['index']: r.get('apply') for r in prev.get('delete_rows', [])}

    seen = {}
    for l in lines:
        if l['index'] is not None:
            seen[l['index']] = seen.get(l['index'], 0) + 1
    next_i = Checklist.next_index(pallet)
    missing = sorted(i for i in seen if i not in rows)
    creatable, want = set(), next_i
    for i in missing:
        if i == want:
            creatable.add(i)
            want += 1

    for l in lines:
        i = l['index']
        if i is None:
            l['action'], l['flag'] = 'flag', 'No sticker number read — fix the # or leave it out.'
            continue
        if seen[i] > 1:
            l['action'], l['flag'] = 'flag', f'#{i} appears twice on the sheet.'
            continue
        row = rows.get(i)
        empty_line = not l['part'] and l['qty'] is None
        if row is None:
            if empty_line:
                l['action'], l['flag'] = 'flag', f'#{i} is blank on the sheet and not in the system.'
            elif i in creatable:
                l['action'] = 'create'
            else:
                gap = ', '.join(f'#{n}' for n in range(next_i, i) if n not in creatable) or f'#{next_i}'
                l['action'], l['flag'] = 'flag', (f'#{i} is not in the system and {gap} is missing before it; '
                                                  f'not created.')
            continue
        l['row_id'] = row.id
        if not _has_content(row):
            l['action'] = 'same' if empty_line else 'fill'
        elif same_part(row.model, l['part']) and row.qty == l['qty']:
            l['action'] = 'same'
        else:
            l['action'] = 'conflict'
            l['existing'] = _snapshot(row)
            p = prev_lines.get(i) or {}
            l['use_sheet'] = bool(p.get('use_sheet')) if p.get('action') == 'conflict' else False

    top = max(seen) if seen else 0
    delete_rows, extra_rows = [], []
    for i in sorted(rows):
        if i in seen:
            continue
        r = rows[i]
        if i > top and not _has_content(r):
            delete_rows.append({'row_id': r.id, 'index': i, 'barcode': r.barcode, 'apply': bool(prev_del.get(i))})
        else:
            extra_rows.append({'row_id': r.id, 'index': i, 'model': r.model, 'qty': r.qty,
                               'reason': 'has content' if _has_content(r) else 'skipped by the sheet'})
    # A delete is only offered for a trailing run of empty rows.
    if delete_rows and extra_rows:
        last_kept = max(e['index'] for e in extra_rows)
        for d in [d for d in delete_rows if d['index'] < last_kept]:
            delete_rows.remove(d)
            extra_rows.append({'row_id': d['row_id'], 'index': d['index'], 'model': '', 'qty': None,
                               'reason': 'empty, but rows after it have content'})
        extra_rows.sort(key=lambda e: e['index'])
    for r in others:
        extra_rows.append({'row_id': r.id, 'index': None, 'model': r.model, 'qty': r.qty,
                           'reason': 'barcode without a number'})
    return delete_rows, extra_rows


def _initial_snapshot(draft):
    return {
        'lines': {str(l['index']): {'raw_model': l['raw_model'], 'part': l['part'], 'source': l['part_source'],
                                    'capacity': l['capacity'], 'capacity_source': l['capacity_source']}
                  for l in draft['lines'] if l['index'] is not None},
        'mpns': {m['key']: {'text': m['text'], 'mpn_id': m['mpn_id'], 'name': m['name'], 'match': m['match']}
                 for m in draft['mpns']},
    }


# ─────────────────────────────────────────────────────────── apply

def apply_draft(pallet, draft):
    """Write the draft. One transaction; any problem → DraftError and nothing written.

    Re-validated here, not trusted from the draft: the target pallet, every MPN, a
    chip being missing before it is added, a row being empty before it is filled, a
    conflicting row still holding what the owner saw, numbering of created rows (only
    Checklist.next_index under a pallet lock), and every deletion being an empty
    trailing row. A line's chip is chosen here, from the pallet's own MPNs."""
    if draft.get('pallet_id') != pallet.id:
        raise DraftError('This draft is for a different pallet; rebuild it.')
    res = {'mpns_created': 0, 'chips_created': 0, 'brands_created': 0, 'pallet_mpns_created': 0,
           'pallet_mpns_updated': 0, 'filled': 0, 'replaced': 0, 'created': 0, 'deleted': 0}
    with transaction.atomic():
        Pallet.objects.select_for_update().filter(pk=pallet.pk).first()
        brands = {}

        def brand_obj(name):
            name = ' '.join((name or '').split())
            if not name:
                return None
            if name.upper() not in brands:
                b = ChipBrand.objects.filter(name__iexact=name).first()
                if b is None:
                    b = ChipBrand.objects.create(name=name)
                    res['brands_created'] += 1
                brands[name.upper()] = b
            return brands[name.upper()]

        for m in draft.get('mpns') or []:
            if m.get('skip'):
                continue
            if m.get('mpn_id'):
                mpn = MPN.objects.filter(pk=m['mpn_id']).first()
                if mpn is None:
                    raise DraftError(f"MPN {m['mpn_id']} no longer exists; rebuild the draft.", 409)
            else:
                name = ' '.join((m.get('new_name') or '').split())
                if not name:
                    raise DraftError(f"Board type '{m.get('text', '')}' needs an MPN name.")
                mpn = MPN.objects.filter(name__iexact=name).first()
                if mpn is None:
                    mpn = MPN.objects.create(name=name[:100])
                    res['mpns_created'] += 1
            have = list(mpn.chips.all())
            for c in m.get('chips') or []:
                part = ' '.join((c.get('part') or '').split())
                if c.get('exists') or not c.get('apply') or not part:
                    continue
                if any(same_part(h.chip_mpn, part) for h in have):
                    continue
                ig = c.get('item_group') if c.get('item_group') in _ITEM_GROUPS else ''
                have.append(Chip.objects.create(mpn=mpn, chip_mpn=part[:100], brand=brand_obj(c.get('brand')),
                                                slot_group=(c.get('slot_group') or '')[:50], item_group=ig, qty=1))
                res['chips_created'] += 1
            qty = _as_qty(m.get('board_qty'))
            row = PalletMPN.objects.filter(pallet=pallet, mpn=mpn).first()
            if row is None:
                PalletMPN.objects.create(pallet=pallet, mpn=mpn, board_qty=qty)
                res['pallet_mpns_created'] += 1
            elif m.get('board_qty_choice', 'sheet') == 'sheet' and row.board_qty != qty:
                row.board_qty = qty
                row.save(update_fields=['board_qty'])
                res['pallet_mpns_updated'] += 1

        rows = {}
        for r in pallet.checklists.select_related('chip').order_by('id'):
            i = _row_index(r)
            if i is not None and i not in rows:
                rows[i] = r
        pallet_chips = list(Chip.objects.filter(mpn__pallet_mpns__pallet=pallet).select_related('brand')
                            .order_by('id').distinct())

        def chip_for(part):
            k = fuzzy_key(part)
            return (next((c for c in pallet_chips if fuzzy_key(c.chip_mpn) == k), None)
                    or next((c for c in pallet_chips if same_part(c.chip_mpn, part)), None))

        def content(line):
            part = ' '.join((line.get('part') or '').split())
            qty = _as_qty(line.get('qty'))
            chip = chip_for(part) if part else None
            brand, model = Checklist.text_from_chip(chip) if chip else (line.get('brand') or '', part)
            return {'brand': brand.strip()[:100], 'model': model.strip()[:100], 'qty': qty, 'chip': chip}

        sheet_top = 0
        creates = []
        for l in sorted(draft.get('lines') or [], key=lambda l: (l.get('index') is None, l.get('index') or 0)):
            act, i = l.get('action'), l.get('index')
            if i is not None:
                sheet_top = max(sheet_top, i)
            if act in ('flag', 'same'):
                continue
            if act not in ('fill', 'conflict', 'create'):
                raise DraftError(f'Unknown line action {act!r}.')
            if act == 'conflict' and not l.get('use_sheet'):
                continue
            c = content(l)
            if act == 'create':
                creates.append((i, c))
                continue
            row = rows.get(i)
            if row is None:
                raise DraftError(f'Checklist #{i} no longer exists; rebuild the draft.', 409)
            if act == 'fill' and _has_content(row):
                raise DraftError(f'Checklist #{i} was filled in after this draft was built; rebuild it.', 409)
            if act == 'conflict' and _snapshot(row) != (l.get('existing') or {}):
                raise DraftError(f'Checklist #{i} changed after this draft was built; rebuild it.', 409)
            old_chip = row.chip
            row.brand, row.model, row.qty, row.chip = c['brand'], c['model'], c['qty'], c['chip']
            row.save(update_fields=['brand', 'model', 'qty', 'chip'])
            if row.is_ng:
                for ch in {old_chip, row.chip}:
                    PalletChipNG.recompute(pallet, ch)
            res['filled' if act == 'fill' else 'replaced'] += 1

        start = Checklist.next_index(pallet)
        for off, (i, c) in enumerate(sorted(creates, key=lambda x: x[0])):
            if i != start + off:
                raise DraftError(f'Checklist #{i} cannot be created: the next free number is #{start + off}.',
                                 409 if i > start + off else 400)
            Checklist.objects.create(pallet=pallet, barcode=Checklist.compose_barcode(pallet, i),
                                     brand=c['brand'], model=c['model'], qty=c['qty'], chip=c['chip'])
            res['created'] += 1

        for d in draft.get('delete_rows') or []:
            if not d.get('apply'):
                continue
            row = rows.get(d.get('index'))
            if row is None:
                continue
            if _has_content(row):
                raise DraftError(f"Checklist #{d['index']} has content now; it was not deleted.", 409)
            if d['index'] <= sheet_top:
                raise DraftError(f"Checklist #{d['index']} is not after the sheet's last line; not deleted.")
            row.delete()
            res['deleted'] += 1
    return res


class _Rollback(Exception):
    def __init__(self, check):
        self.check = check


def preview_check(pallet, draft):
    """checklist_check() of the state the draft would produce. Always rolled back."""
    if pallet is None:
        return {'status': 'none', 'slots': [], 'modules': [], 'unmatched': []}
    try:
        with transaction.atomic():
            fresh = Pallet.objects.select_related('so').get(pk=pallet.pk)
            apply_draft(fresh, draft)
            after = (Pallet.objects.prefetch_related('checklists', 'pallet_mpns__mpn__chips')
                     .get(pk=pallet.pk))
            raise _Rollback(after.checklist_check())
    except _Rollback as r:
        return r.check
    except DraftError as e:
        return {'status': 'error', 'error': str(e), 'slots': [], 'modules': [], 'unmatched': []}


# ─────────────────────────────────────────────────────────── learning

def learn_from_confirm(draft):
    """Corrections from what the owner settled on vs. the first reading.

    Recorded: a line's part number the owner changed, or a fuzzy/near reading they
    accepted; a capacity class they supplied; a header MPN they changed or a near-match
    they accepted; a brace entry they resolved by hand."""
    initial = draft.get('initial') or {}
    out = []
    for l in draft.get('lines') or []:
        first = (initial.get('lines') or {}).get(str(l.get('index'))) or {}
        raw, part = first.get('raw_model') or '', l.get('part') or ''
        if raw and part and l.get('action') != 'flag':
            changed = fuzzy_key(first.get('part')) != fuzzy_key(part)
            accepted = first.get('source') in ('candidate', 'near') and fuzzy_key(raw) != fuzzy_key(part)
            if changed or accepted:
                out.append(ChecklistCorrection.record('chip_model', raw, part))
        if part and l.get('capacity') and l.get('capacity_source') == 'owner':
            out.append(ChecklistCorrection.record('capacity_class', part, l['capacity']))
    names = dict(MPN.objects.values_list('id', 'name'))
    for m in draft.get('mpns') or []:
        if m.get('skip'):
            continue
        first = (initial.get('mpns') or {}).get(m.get('key')) or {}
        final = names.get(m.get('mpn_id')) if m.get('mpn_id') else (m.get('new_name') or '')
        text = m.get('text') or ''
        if text and final and mpn_key(text) != mpn_key(final):
            if first.get('mpn_id') != m.get('mpn_id') or first.get('match') in ('near', 'owner') \
                    or m.get('match') == 'owner':
                out.append(ChecklistCorrection.record('mpn_name', text, final))
        for itext, part in ((draft.get('overrides') or {}).get('mpns', {}).get(m.get('key'), {})
                            .get('items', {}) or {}).items():
            brand = next((c['brand'] for c in m.get('chips', []) if same_part(c['part'], part) and c['brand']), '')
            if len(itext) <= 3 and itext.isalpha() and brand:
                out.append(ChecklistCorrection.record('brand_abbrev', itext, brand))
            else:
                out.append(ChecklistCorrection.record('chip_model', itext, part))
    return [c for c in out if c]
