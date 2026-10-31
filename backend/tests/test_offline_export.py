import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.export_offline_content import build_bundle, validate_bundle


class OfflineBundleTransformTests(unittest.TestCase):
    def setUp(self):
        self.core = {
            "records": [
                {
                    "record_type": "chapter",
                    "id": 1,
                    "chapter_number": 1,
                    "name_simple": "Al-Fatihah",
                    "name_arabic": "الفاتحة",
                    "verses_count": 1,
                },
                {
                    "record_type": "verse",
                    "id": 10,
                    "chapter_id": 1,
                    "verse_number": 1,
                    "verse_key": "1:1",
                    "text_uthmani": "بِسْمِ ٱللَّهِ",
                    "juz_number": 1,
                },
                {
                    "record_type": "word",
                    "id": 100,
                    "verse_id": 10,
                    "chapter_id": 1,
                    "position": 1,
                    "char_type_name": "word",
                },
            ]
        }
        self.mushaf = {
            "records": [
                {
                    "record_type": "mushaf_page",
                    "id": 1,
                    "page_number": 1,
                    "first_verse_id": 10,
                    "last_verse_id": 10,
                },
                {
                    "record_type": "mushaf_word",
                    "id": 1000,
                    "word_id": 100,
                    "text": "بِسْمِ",
                },
            ]
        }
        self.translation = {
            "records": [{"id": 1, "verse_key": "1:1", "text": "In the name of Allah."}]
        }

    def test_preserves_uthmani_text_and_maps_translation_and_words(self):
        bundle = build_bundle(
            self.core,
            self.mushaf,
            self.translation,
            [],
            {"id": 20, "name": "Saheeh International", "author_name": "Saheeh International"},
            "quran_core:1;mushafs:4;translations:20",
            "opaque-token",
            strict=False,
        )
        verse = bundle["verses"][0]
        self.assertEqual(verse["text"], "بِسْمِ ٱللَّهِ")
        self.assertEqual(verse["translation"], "In the name of Allah.")
        self.assertEqual(verse["words"], [{"position": 1, "text": "بِسْمِ"}])
        self.assertEqual(bundle["chapters"][0]["pages"], [1, 1])

    def test_validation_rejects_incomplete_quran(self):
        bundle = build_bundle(
            self.core,
            self.mushaf,
            self.translation,
            [],
            {"id": 20, "name": "Saheeh International", "author_name": "Saheeh International"},
            "quran_core:1;mushafs:4;translations:20",
            "opaque-token",
            strict=False,
        )
        with self.assertRaises(RuntimeError):
            validate_bundle(bundle)


if __name__ == "__main__":
    unittest.main()
