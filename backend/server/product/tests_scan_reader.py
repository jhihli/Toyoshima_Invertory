"""product.scan_reader: prompt, schema, image prep and the (faked) model call.

The Anthropic client is replaced by a fake in every test here; nothing is sent anywhere.
"""
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

    @override_settings(ANTHROPIC_API_KEY='test-key')
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

    @override_settings(ANTHROPIC_API_KEY='test-key')
    def test_refusal_is_a_read_error(self):
        client, _ = fake_client(fake_message('', stop_reason='refusal'))
        with mock.patch.object(scan_reader, '_client', return_value=client):
            with self.assertRaises(scan_reader.ReadError):
                scan_reader.read_sheet(b'x', 'image/jpeg', {'parts': [], 'mpns': [], 'corrections': [], 'examples': []})

    @override_settings(ANTHROPIC_API_KEY='test-key')
    def test_truncated_output_is_a_read_error(self):
        client, _ = fake_client(fake_message('{"label": ', stop_reason='max_tokens'))
        with mock.patch.object(scan_reader, '_client', return_value=client):
            with self.assertRaises(scan_reader.ReadError):
                scan_reader.read_sheet(b'x', 'image/jpeg', {'parts': [], 'mpns': [], 'corrections': [], 'examples': []})

    @override_settings(ANTHROPIC_API_KEY='')
    def test_missing_key_is_a_read_error(self):
        with self.assertRaises(scan_reader.ReadError):
            scan_reader.read_sheet(b'x', 'image/jpeg', {'parts': [], 'mpns': [], 'corrections': [], 'examples': []})
