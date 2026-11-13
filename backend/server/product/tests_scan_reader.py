"""product.scan_reader: prompt, schema, image prep and the (faked) model call.

The Anthropic client is replaced by a fake in every test here; nothing is sent anywhere.
"""
import base64
import io
import json
from decimal import Decimal
from types import SimpleNamespace
from unittest import mock

from django.test import TestCase, override_settings
from PIL import Image

from product import scan_reader
from product.models import MPN, Chip, ChipBrand


def walk_objects(schema):
    """Every object-typed node of a JSON schema."""
    if isinstance(schema, dict):
        if schema.get('type') == 'object':
            yield schema
        for v in schema.values():
            yield from walk_objects(v)
    elif isinstance(schema, list):
        for v in schema:
            yield from walk_objects(v)


class FakeStream:
    def __init__(self, message):
        self.message = message

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def get_final_message(self):
        return self.message


def fake_message(text='{}', stop_reason='end_turn', **usage):
    u = dict(input_tokens=1000, output_tokens=2000, cache_read_input_tokens=0,
             cache_creation_input_tokens=0)
    u.update(usage)
    return SimpleNamespace(
        model='claude-opus-5-5', stop_reason=stop_reason,
        stop_details=SimpleNamespace(category='cyber', explanation='x') if stop_reason == 'refusal' else None,
        content=[SimpleNamespace(type='thinking', thinking=''), SimpleNamespace(type='text', text=text)],
        usage=SimpleNamespace(**u),
    )


def fake_client(message):
    calls = []

    def stream(**kw):
        calls.append(kw)
        return FakeStream(message)
    client = SimpleNamespace(beta=SimpleNamespace(messages=SimpleNamespace(stream=stream)))
    return client, calls


class ScanReaderTests(TestCase):

    def test_schema_objects_are_closed_and_fully_required(self):
        nodes = list(walk_objects(scan_reader.TRANSCRIPTION_SCHEMA))
        self.assertGreater(len(nodes), 4)
        for node in nodes:
            self.assertIs(node['additionalProperties'], False)
            self.assertEqual(sorted(node['required']), sorted(node['properties']))

    def test_system_prompt_is_deterministic_and_cached(self):
        brand = ChipBrand.objects.create(name='ALTERA')
        m = MPN.objects.create(name='SP#841631-001')
        Chip.objects.create(mpn=m, chip_mpn='EP4CE1SF23C9LN', brand=brand)
        Chip.objects.create(mpn=m, chip_mpn='D9SFT', slot_group='1G')
        a = scan_reader.build_system(scan_reader.build_context())
        b = scan_reader.build_system(scan_reader.build_context())
        self.assertEqual(json.dumps(a), json.dumps(b))
        self.assertEqual(a[-1]['cache_control'], {'type': 'ephemeral'})
        text = '\n'.join(block['text'] for block in a)
        self.assertIn('EP4CE1SF23C9LN', text)
        self.assertIn('SP#841631-001', text)
        self.assertIn('D9SFT', text)
        self.assertIn('AL', text)          # seeded brand abbreviation

    def test_prepare_image_downscales_to_jpeg(self):
        buf = io.BytesIO()
        Image.new('RGB', (4000, 3000), 'white').save(buf, 'PNG')
        buf.seek(0)
        data, media_type = scan_reader.prepare_image(buf)
        self.assertEqual(media_type, 'image/jpeg')
        img = Image.open(io.BytesIO(data))
        self.assertLessEqual(max(img.size), 2000)
        self.assertEqual(img.format, 'JPEG')

    def test_prepare_image_rejects_non_images(self):
        with self.assertRaises(scan_reader.ReadError):
            scan_reader.prepare_image(io.BytesIO(b'%PDF-1.4 not an image'))

    def test_compute_cost(self):
        usage = {'input_tokens': 1_000_000, 'output_tokens': 100_000,
                 'cache_read_tokens': 1_000_000, 'cache_write_tokens': 100_000}
        # 4.00 + 2.00 + 0.20 + 0.50
        self.assertEqual(scan_reader.compute_cost(usage), Decimal('6.7000'))

    @override_settings(ANTHROPIC_API_KEY='test-key', CHECKLIST_SCAN_BACKEND='anthropic')
    def test_read_sheet_sends_the_agreed_request_and_parses_json(self):
        payload = {'label': {'so_number': 'S06-000979'}}
        client, calls = fake_client(fake_message(json.dumps(payload), cache_read_input_tokens=500))
        with mock.patch.object(scan_reader, '_client', return_value=client):
            res = scan_reader.read_sheet(b'jpegbytes', 'image/jpeg', {'parts': [], 'mpns': [],
                                                                       'corrections': [], 'examples': []})
        self.assertEqual(res.transcription, payload)
        self.assertEqual(res.usage['cache_read_tokens'], 500)
        self.assertGreater(res.cost_usd, 0)
        kw = calls[0]
        self.assertEqual(kw['model'], 'claude-opus-5-5')
        self.assertEqual(kw['fallbacks'], 'default')
        self.assertEqual(kw['betas'], ['server-side-fallback-2026-07-01'])
        self.assertEqual(kw['thinking'], {'type': 'adaptive'})
        self.assertEqual(kw['output_config']['effort'], 'high')
        self.assertEqual(kw['output_config']['format']['type'], 'json_schema')
        image = kw['messages'][0]['content'][0]
        self.assertEqual((image['type'], image['source']['media_type']), ('image', 'image/jpeg'))

    @override_settings(ANTHROPIC_API_KEY='test-key', CHECKLIST_SCAN_BACKEND='anthropic')
    def test_refusal_is_a_read_error(self):
        client, _ = fake_client(fake_message('', stop_reason='refusal'))
        with mock.patch.object(scan_reader, '_client', return_value=client):
            with self.assertRaises(scan_reader.ReadError):
                scan_reader.read_sheet(b'x', 'image/jpeg', {'parts': [], 'mpns': [], 'corrections': [], 'examples': []})

    @override_settings(ANTHROPIC_API_KEY='test-key', CHECKLIST_SCAN_BACKEND='anthropic')
    def test_truncated_output_is_a_read_error(self):
        client, _ = fake_client(fake_message('{"label": ', stop_reason='max_tokens'))
        with mock.patch.object(scan_reader, '_client', return_value=client):
            with self.assertRaises(scan_reader.ReadError):
                scan_reader.read_sheet(b'x', 'image/jpeg', {'parts': [], 'mpns': [], 'corrections': [], 'examples': []})

    @override_settings(ANTHROPIC_API_KEY='', CHECKLIST_SCAN_BACKEND='anthropic')
    def test_missing_key_is_a_read_error(self):
        with self.assertRaises(scan_reader.ReadError):
            scan_reader.read_sheet(b'x', 'image/jpeg', {'parts': [], 'mpns': [], 'corrections': [], 'examples': []})



class FakeResp:
    def __init__(self, status, body):
        self.status_code, self._body = status, body
        self.text = body if isinstance(body, str) else json.dumps(body)

    def json(self):
        return self._body


def png(w=300, h=400):
    buf = io.BytesIO()
    Image.new('RGB', (w, h), 'white').save(buf, 'PNG')
    return buf.getvalue()


REGION_REPLIES = {
    'top-left corner': 'SO: S06-000979\nPALLET: 06LP00083239-9\nWEIGHT: 575 LB',
    'Handwritten notes are arranged': '841631-001 | 147 | SLKM8, 1G, AL\nBG00GH0 | 1 | 52Ka8, 1G',
}


def fake_post(calls):
    def post(url, payload, timeout):
        calls.append((url, payload))
        prompt = payload['messages'][0]['content']
        for key, reply in REGION_REPLIES.items():
            if key in prompt:
                return FakeResp(200, {'message': {'content': reply}, 'prompt_eval_count': 10, 'eval_count': 5})
        # table halves: the left call comes first
        n_tables = sum(1 for _, p in calls if 'checklist table' in p['messages'][0]['content'])
        reply = ('#1 |  | SLKMB | 191\n#2 | ALTERA | EP4CE15F23C9IN | 159' if n_tables == 1
                 else '#1 | ASPEEP | AST2400 | 31')
        return FakeResp(200, {'message': {'content': reply}, 'prompt_eval_count': 10, 'eval_count': 5})
    return post


CTX = {'parts': [{'part': p, 'brand': '', 'slot_group': '', 'item_group': ''}
                 for p in ('SLKM8', 'EP4CE1SF23C9LN', 'AST2400', 'D9SFT')],
       'mpns': ['B600GH0'], 'corrections': [], 'examples': []}


@override_settings(CHECKLIST_SCAN_BACKEND='ollama', OLLAMA_URL='http://gpu:11434/',
                   CHECKLIST_SCAN_OLLAMA_MODEL='qwen3-vl:8b-instruct')
class OllamaReaderTests(TestCase):

    def test_reads_four_regions_and_builds_the_transcription(self):
        calls = []
        with mock.patch.object(scan_reader, '_post_ollama', fake_post(calls)):
            res = scan_reader.read_sheet(png(), 'image/jpeg', CTX)
        self.assertEqual(len(calls), 4)
        self.assertTrue(all(u == 'http://gpu:11434/api/chat' for u, _ in calls))
        self.assertTrue(all(p['model'] == 'qwen3-vl:8b-instruct' and p['messages'][0]['images'] for _, p in calls))
        t = res.transcription
        self.assertEqual((t['label']['so_number'], t['label']['pallet_barcode'], t['label']['weight_text']),
                         ('S06-000979', '06LP00083239-9', '575 LB'))
        g = t['header_groups']
        self.assertEqual([(x['mpn_text'], x['board_qty']) for x in g], [('841631-001', 147), ('BG00GH0', 1)])
        self.assertEqual([i['text'] for i in g[1]['items']], ['SLKM8', '1G'])     # 52Ka8 snapped
        lines = {l['index']: l for l in t['lines']}
        self.assertEqual(sorted(lines), [1, 2, 3])                                   # right #1 → #3
        self.assertEqual(lines[1]['model_text'], 'SLKMB')
        self.assertEqual(lines[1]['model_candidates'][0], 'SLKM8')
        self.assertEqual((lines[2]['brand_text'], lines[2]['model_candidates'][0]), ('ALTERA', 'EP4CE1SF23C9LN'))
        self.assertEqual((lines[3]['column'], lines[3]['model_text'], lines[3]['qty']), ('right', 'AST2400', 31))
        self.assertEqual(lines[3]['model_candidates'], [])                           # exact known part
        self.assertIn('renumbered #3', t['notes'])
        self.assertEqual((res.model, res.cost_usd, res.usage['input_tokens']),
                         ('ollama:qwen3-vl:8b-instruct', Decimal('0'), 40))

    def test_unreachable_box_is_a_read_error(self):
        import requests
        with mock.patch.object(scan_reader, '_post_ollama', mock.Mock(side_effect=requests.ConnectionError('down'))):
            with self.assertRaisesRegex(scan_reader.ReadError, 'office GPU PC'):
                scan_reader.read_sheet(png(), 'image/jpeg', CTX)

    def test_http_error_is_a_read_error(self):
        with mock.patch.object(scan_reader, '_post_ollama', mock.Mock(return_value=FakeResp(404, 'model not found'))):
            with self.assertRaisesRegex(scan_reader.ReadError, '404'):
                scan_reader.read_sheet(png(), 'image/jpeg', CTX)


class ScanLocalParsingTests(TestCase):
    from product import scan_local as sl

    def test_candidates_fold_handwriting_lookalikes(self):
        known = ['K4B1G1646G-BCH9', 'D9MNQ', 'D9SFT', 'NT5TU64M16HG-AC', 'SLKM8']
        c = self.sl.candidates
        self.assertEqual(c('K4B1616466-BCH9', known)[0], 'K4B1G1646G-BCH9')
        self.assertEqual(c('NTSTU64M16HC-AC', known)[0], 'NT5TU64M16HG-AC')
        self.assertEqual(c('S2km8', known)[0], 'SLKM8')
        self.assertEqual(c('D9MVB', known)[0], 'D9MNQ')
        self.assertEqual(c('ZZZZZZ', known), [])

    def test_table_skips_none_and_non_sticker_lines(self):
        self.assertEqual(self.sl.parse_table('NONE', 'right', []), [])
        rows = self.sl.parse_table('Here you go:\n#4 |  | D9MNQ | 1\n', 'left', ['D9MNQ'])
        self.assertEqual([(r['index'], r['model_text'], r['qty'], r['model_confidence']) for r in rows],
                         [(4, 'D9MNQ', 1, 'high')])

    def test_header_qty_with_suffix_and_missing_qty(self):
        g = self.sl.parse_header('X898568 | 212pcs | SLKM8, 1G\nB69640 |  | SLKM8', ['SLKM8'])
        self.assertEqual([(x['board_qty'], x['board_qty_confidence']) for x in g], [(212, 'high'), (None, 'low')])

    def test_label_missing_fields_is_low_confidence(self):
        self.assertEqual(self.sl.parse_label('WEIGHT: 731 LB')['confidence'], 'low')
