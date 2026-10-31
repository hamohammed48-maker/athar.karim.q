import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from lib.qf_offline import _build_bundle, _find_saheeh_translation, _validate_bundle, QuranFoundationError


class OfflineBundleTransformTests(unittest.TestCase):
    def setUp(self):
        self.core = {
            "records": [
                {"record_type": "chapter", "id": 1, "chapter_number": 1,
                 "name_simple": "Al-Fatihah", "name_arabic": "الفاتحة", "verses_count": 1},
                {"record_type": "verse", "id": 10, "chapter_id": 1, "verse_number": 1,
                 "verse_key": "1:1", "text_uthmani": "بِسْمِ ٱللَّهِ", "juz_number": 1},
                {"record_type": "word", "id": 100, "verse_id": 10, "chapter_id": 1,
                 "position": 1, "char_type_name": "word"},
            ]
        }
        self.mushaf = {
            "records": [
                {"record_type": "mushaf_page", "id": 1, "page_number": 1,
                 "first_verse_id": 10, "last_verse_id": 10},
                {"record_type": "mushaf_word", "id": 1000, "word_id": 100, "text": "بِسْمِ"},
            ]
        }
        self.translation = {"records": [{"id": 1, "verse_key": "1:1", "text": "In the name of Allah.<sup foot_note=\"1\">1</sup>"}]}

    def test_preserves_uthmani_text_and_maps_translation_and_words(self):
        # Use the production transformer with integrity checks disabled only for this one-row fixture.
        from lib.qf_offline import _build_bundle_for_test
        bundle = _build_bundle_for_test(
            self.core, self.mushaf, self.translation,
            {"id": 20, "name": "Saheeh International", "author_name": "Saheeh International"},
            "quran_core:1;mushafs:4;translations:20", "opaque-token",
        )
        verse = bundle["verses"][0]
        self.assertEqual(verse["text"], "بِسْمِ ٱللَّهِ")
        self.assertEqual(verse["translation"], "In the name of Allah.")
        self.assertEqual(verse["words"], [{"position": 1, "text": "بِسْمِ"}])
        self.assertEqual(bundle["chapters"][0]["pages"], [1, 1])

    def test_translation_lookup_selects_saheeh_international(self):
        class FakeClient:
            def get(self, path, params=None):
                assert path == "resources/translations"
                return {
                    "translations": [
                        {"id": 131, "name": "M.A.S. Abdel Haleem", "author_name": "Abdel Haleem"},
                        {"id": 20, "name": "Saheeh International", "author_name": "Saheeh International"},
                    ]
                }

        selected = _find_saheeh_translation(FakeClient())
        self.assertEqual(selected["id"], 20)
        self.assertEqual(selected["name"], "Saheeh International")

    def test_translation_lookup_rejects_missing_saheeh_instead_of_substituting(self):
        class FakeClient:
            def get(self, path, params=None):
                return {"translations": [{"id": 131, "name": "M.A.S. Abdel Haleem"}]}

        with self.assertRaisesRegex(QuranFoundationError, "Saheeh International"):
            _find_saheeh_translation(FakeClient())

    def test_validation_rejects_incomplete_quran(self):
        with self.assertRaises(QuranFoundationError):
            _validate_bundle({"chapters": [], "verses": []})


if __name__ == "__main__":
    unittest.main()
