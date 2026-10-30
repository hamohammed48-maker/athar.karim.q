"""Arabic normalisation used ONLY for search matching — displayed Quran text is never altered."""
import re

_TASHKEEL = re.compile(r"[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u08D3-\u08FF\u0640]")
_MAP = str.maketrans({
    "أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا", "ٲ": "ا", "ٳ": "ا",
    "ى": "ي", "ئ": "ي", "ؤ": "و", "ة": "ه", "ۀ": "ه",
})


def normalize(text: str) -> str:
    text = _TASHKEEL.sub("", text or "")
    text = text.translate(_MAP)
    text = re.sub(r"[^\u0621-\u064A\s]", " ", text)
    return re.sub(r"\s+", " ", text).strip()
