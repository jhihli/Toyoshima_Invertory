"""Pure normalisation / matching helpers for checklist photos (product.scan_match)."""
from django.test import SimpleTestCase

from product.scan_match import (
    same_part, mpn_key, fuzzy_key, capacity_class, decode_capacity, similarity, parse_weight,
)


class ScanMatchTests(SimpleTestCase):

    def test_same_part_tolerates_handwriting_typos_and_suffixes(self):
        self.assertTrue(same_part('EP4CE15F23C9LN', 'EP4CE1SF23C9LN'))     # S/5 typo in stored data
        self.assertTrue(same_part('NT5TU64M16HG-AC', 'NT5TU64M16HG'))      # stored without -AC
        self.assertTrue(same_part('k4b1g1646g-bch9', 'K4B1G1646G-BCH9'))
        self.assertTrue(same_part('AST2400', 'AST24OO'))                    # O/0
        self.assertFalse(same_part('SLKM8', 'SLKM9'))
        self.assertFalse(same_part('D9SFT', 'D9MNQ'))
        self.assertFalse(same_part('SLKM8', ''))

    def test_short_prefix_is_not_the_same_part(self):
        self.assertFalse(same_part('K4B1G', 'K4B1G1646G-BCH9'))

    def test_fuzzy_key_folds_confusable_characters(self):
        self.assertEqual(fuzzy_key('EP4CE1SF23C9LN'), fuzzy_key('ep4ce15f23c9ln'))
        self.assertEqual(fuzzy_key(' D9 SFT '), fuzzy_key('D9SFT'))

    def test_mpn_key_ignores_sp_prefix_and_case(self):
        self.assertEqual(mpn_key('SP#841631-001'), mpn_key('841631-001'))
        self.assertEqual(mpn_key('x898568'), mpn_key('X898568'))
        self.assertNotEqual(mpn_key('841631-001'), mpn_key('789124-001'))

    def test_capacity_class_of_a_brace_item(self):
        self.assertEqual(capacity_class('1G'), '1G')
        self.assertEqual(capacity_class('1GB'), '1G')
        self.assertEqual(capacity_class(' 2 g '), '2G')
        self.assertEqual(capacity_class('512M'), '512M')
        self.assertIsNone(capacity_class('SLKM8'))
        self.assertIsNone(capacity_class('AL'))

    def test_decode_capacity_from_part_number(self):
        self.assertEqual(decode_capacity('K4B1G1646G-BCH9'), '1G')
        self.assertEqual(decode_capacity('K4B2G1646Q-BCK0'), '2G')
        self.assertEqual(decode_capacity('NT5TU64M16HG-AC'), '1G')
        self.assertEqual(decode_capacity('NT5CB128M16FP'), '2G')
        self.assertEqual(decode_capacity('MT41K256M16TW'), '4G')
        self.assertEqual(decode_capacity('H5TQ2G63FFR'), '2G')
        self.assertIsNone(decode_capacity('D9SFT'))          # Micron FBGA code: not decodable
        self.assertIsNone(decode_capacity('SLKM8'))
        self.assertIsNone(decode_capacity('EP4CE15F23C9LN'))

    def test_similarity_ranks_near_mpn_names(self):
        self.assertGreater(similarity('BG00GH0', 'B600GH0'), 0.8)
        self.assertGreater(similarity('1A42B2W00-600-G', '1A4262W00-600-G'), 0.9)
        self.assertLess(similarity('X898568', '841631-001'), 0.5)

    def test_parse_weight(self):
        self.assertEqual(parse_weight('575 LB'), 575)
        self.assertEqual(parse_weight('1,060 lb'), 1060)
        self.assertEqual(parse_weight('731.5LB'), 731.5)
        self.assertIsNone(parse_weight(''))
