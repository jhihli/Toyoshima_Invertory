"""Eval: read the sample checklist photos with the real model and score the readings.

With CHECKLIST_SCAN_BACKEND=anthropic THIS SPENDS MONEY (one billed call per photo) and it
refuses to run without --yes. With the default ollama backend it is free.

    python manage.py eval_checklist_scans --dir "../../asset/checklist screenshot" --yes
    python manage.py eval_checklist_scans --dir ... --samples cl2,cl4 --yes --out eval.json
    python manage.py eval_checklist_scans --dir ... --no-context --yes   # without the dictionary

Scores the model's TRANSCRIPTION only (what is written), per field, against the
expected answers in the design doc's appendix (2026-11-13; '?' items accept either
spelling). The prompt's dictionary comes from this machine's database — run it against a
database that looks like production for representative numbers, or with --no-context.
Nothing is written to the database.
"""
import json
from decimal import Decimal
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from product.scan_match import fuzzy_key, mpn_key, same_part, similarity, parse_weight

# Expected readings — docs/superpowers/specs/2026-11-13-checklist-photo-autofill-design.md, appendix.
# 'mpn' / 'model' are lists of accepted spellings (first = as written on the sheet).
EXPECTED = {
    'cl1': {
        'so_number': 'S06-000979', 'pallet_barcode': '06LP00085063-3', 'weight': 731,
        'groups': [{'mpn': ['X898568'], 'board_qty': 212, 'items': ['SLKM8', '1G']}],
        'lines': [{'index': 1, 'model': ['SLKM8'], 'qty': 212},
                  {'index': 2, 'model': ['K4B1G1646G-BCH9'], 'qty': 212}],
    },
    'cl2': {
        'so_number': 'S06-000979', 'pallet_barcode': '06LP00083239-9', 'weight': 575,
        'groups': [
            {'mpn': ['841631-001'], 'board_qty': 147, 'items': ['SLKM8', '1G', 'AL']},
            {'mpn': ['789124-001'], 'board_qty': 12, 'items': ['SLKM8', '1G', 'AL']},
            {'mpn': ['1A42B2W00-600-G', '1A4262W00-600-G'], 'board_qty': 31,
             'items': ['ASPEED AST2400', '2G', 'SLKM8']},
            {'mpn': ['BG00GH0', 'B600GH0'], 'board_qty': 1, 'items': ['SLKM8', '1G']},
        ],
        'lines': [{'index': 1, 'model': ['SLKM8'], 'qty': 191},
                  {'index': 2, 'model': ['EP4CE15F23C9LN'], 'qty': 159, 'brand': 'ALTERA'},
                  {'index': 3, 'model': ['D9MNQ'], 'qty': 16},
                  {'index': 4, 'model': ['D9SFT'], 'qty': 143},
                  {'index': 5, 'model': ['NT5TU64M16HG-AC'], 'qty': 1},
                  {'index': 6, 'model': ['K4B2G1646Q-BCK0'], 'qty': 31},
                  {'index': 7, 'model': ['AST2400'], 'qty': 31, 'brand': 'ASPEED'}],
    },
    'cl3': {
        'so_number': 'S06-000979', 'pallet_barcode': '06LP00086194-5', 'weight': 984,
        'groups': [
            {'mpn': ['X898568'], 'board_qty': 205, 'items': ['SLKM8', '1G']},
            {'mpn': ['841631', '841631-001'], 'board_qty': 90, 'items': ['SLKM8', '1G', 'AL']},
            {'mpn': ['B69640185226010', 'B696402852261010'], 'board_qty': 1, 'items': ['SLKM8', '1G']},
            {'mpn': ['B69640185218840', 'B696401852188010'], 'board_qty': 1, 'items': ['SLKM8', '1G']},
        ],
        'lines': [{'index': 1, 'model': ['SLKM8'], 'qty': 297},
                  {'index': 2, 'model': ['D9SFT'], 'qty': 95},
                  {'index': 3, 'model': ['K4B1G1646G-BCH9'], 'qty': 202},
                  {'index': 4, 'model': ['EP4CE15F23C9LN'], 'qty': 90, 'brand': 'ALTERA'}],
    },
    'cl4': {
        'so_number': 'S06-000979', 'pallet_barcode': '06LP00084995-13', 'weight': 1060,
        'groups': [
            {'mpn': ['X898568'], 'board_qty': 276, 'items': ['SLKM8', '1G']},
            {'mpn': ['B600GH0', 'BG00GH0'], 'board_qty': 40, 'items': ['SLKM8', '1G']},
        ],
        'lines': [{'index': 1, 'model': ['SLKM8'], 'qty': 316},
                  {'index': 2, 'model': ['K4B1G1646G-BCH9'], 'qty': 274},
                  {'index': 3, 'model': ['NT5TU64M16HG-AC'], 'qty': 41},
                  {'index': 4, 'model': ['D9MNQ'], 'qty': 1}],          # written like "D7MNQ"
    },
}

FIELDS = ['label_so', 'label_pallet', 'label_weight', 'group_found', 'group_mpn', 'group_board_qty',
          'group_items', 'line_index', 'line_model', 'line_model_or_candidate', 'line_qty']


def _items_key(items):
    return sorted(fuzzy_key(i) for i in items)


def score(expected, t):
    """{field: (correct, total)} for one transcription against its expected answer."""
    s = {f: [0, 0] for f in FIELDS}

    def mark(field, ok):
        s[field][1] += 1
        s[field][0] += 1 if ok else 0

    label = t.get('label') or {}
    mark('label_so', fuzzy_key(label.get('so_number')) == fuzzy_key(expected['so_number']))
    mark('label_pallet', fuzzy_key(label.get('pallet_barcode')) == fuzzy_key(expected['pallet_barcode']))
    w = parse_weight(label.get('weight_text', ''))
    mark('label_weight', w is not None and abs(w - expected['weight']) < 0.5)

    groups = list(t.get('header_groups') or [])
    for g in expected['groups']:
        best = max(groups, key=lambda x: max(similarity(x.get('mpn_text', ''), m) for m in g['mpn']),
                   default=None)
        if best is not None and max(similarity(best.get('mpn_text', ''), m) for m in g['mpn']) < 0.5:
            best = None
        mark('group_found', best is not None)
        mark('group_mpn', best is not None and any(mpn_key(best.get('mpn_text')) == mpn_key(m) for m in g['mpn']))
        mark('group_board_qty', best is not None and best.get('board_qty') == g['board_qty'])
        mark('group_items', best is not None and
             _items_key(i.get('text', '') for i in best.get('items') or []) == _items_key(g['items']))
        if best is not None:
            groups.remove(best)

    lines = {l.get('index'): l for l in t.get('lines') or [] if l.get('index') is not None}
    for e in expected['lines']:
        got = lines.get(e['index'])
        mark('line_index', got is not None)
        model_ok = got is not None and any(same_part(got.get('model_text'), m) for m in e['model'])
        mark('line_model', model_ok)
        mark('line_model_or_candidate', model_ok or (got is not None and any(
            same_part(c, m) for c in (got.get('model_candidates') or [])[:1] for m in e['model'])))
        mark('line_qty', got is not None and got.get('qty') == e['qty'])
    return {f: tuple(v) for f, v in s.items()}


class Command(BaseCommand):
    help = "Read the sample checklist photos with the real model (BILLED) and score them."

    def add_arguments(self, parser):
        parser.add_argument('--dir', required=True, help="folder holding cl1.png … cl4.png")
        parser.add_argument('--samples', default=','.join(EXPECTED), help="comma-separated, default all")
        parser.add_argument('--yes', action='store_true', help="confirm the spend (one billed call per photo)")
        parser.add_argument('--no-context', action='store_true', help="send no dictionary / examples")
        parser.add_argument('--out', help="write readings + scores as JSON here")
        parser.add_argument('--context-file', help="JSON dictionary to send instead of this database's "
                                                   "(e.g. dumped from production with build_context())")

    def handle(self, *args, **opts):
        from django.conf import settings
        billed = getattr(settings, 'CHECKLIST_SCAN_BACKEND', 'ollama') == 'anthropic'
        if billed and not opts['yes']:
            raise CommandError('This makes one billed API call per photo. Re-run with --yes to proceed.')
        from product import scan_reader
        folder = Path(opts['dir'])
        names = [n.strip() for n in opts['samples'].split(',') if n.strip()]
        unknown = [n for n in names if n not in EXPECTED]
        if unknown:
            raise CommandError(f'No expected answers for: {", ".join(unknown)}')
        if opts['no_context']:
            context = {'parts': [], 'mpns': [], 'corrections': [], 'examples': []}
        elif opts['context_file']:
            context = json.loads(Path(opts['context_file']).read_text(encoding='utf-8'))
        else:
            context = scan_reader.build_context()

        totals = {f: [0, 0] for f in FIELDS}
        cost_total, report = Decimal('0'), {}
        for name in names:
            path = next((p for p in (folder / f'{name}.png', folder / f'{name}.jpg') if p.exists()), None)
            if path is None:
                self.stderr.write(f'{name}: no {name}.png / .jpg in {folder}')
                continue
            with open(path, 'rb') as f:
                data, media_type = scan_reader.prepare_image(f)
            try:
                res = scan_reader.read_sheet(data, media_type, context)
            except scan_reader.ReadError as e:
                self.stderr.write(f'{name}: FAILED — {e}')
                report[name] = {'error': str(e)}
                continue
            s = score(EXPECTED[name], res.transcription)
            for f, (ok, n) in s.items():
                totals[f][0] += ok
                totals[f][1] += n
            cost_total += res.cost_usd
            u = res.usage
            self.stdout.write(f'\n{name}: ${res.cost_usd} (in {u["input_tokens"]}, out {u["output_tokens"]}, '
                              f'cache read {u["cache_read_tokens"]}, cache write {u["cache_write_tokens"]}, '
                              f'model {res.model})')
            self.stdout.write('  ' + '  '.join(f'{f} {ok}/{n}' for f, (ok, n) in s.items()))
            report[name] = {'score': s, 'usage': u, 'cost_usd': str(res.cost_usd), 'model': res.model,
                            'transcription': res.transcription}

        self.stdout.write('\nTOTAL per field:')
        for f, (ok, n) in totals.items():
            pct = f'{100 * ok / n:.0f}%' if n else '—'
            self.stdout.write(f'  {f:<26} {ok:>3}/{n:<3} {pct}')
        done = sum(1 for r in report.values() if 'score' in r)
        self.stdout.write(f'\nCost: ${cost_total} for {done} photo(s)'
                          + (f', ${(cost_total / done).quantize(Decimal("0.0001"))} per photo' if done else ''))
        if opts['out']:
            Path(opts['out']).write_text(json.dumps(report, indent=2, ensure_ascii=False, default=str),
                                         encoding='utf-8')
            self.stdout.write(f'Wrote {opts["out"]}')
