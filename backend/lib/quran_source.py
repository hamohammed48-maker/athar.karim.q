"""Quran.com API adapter without a server database.

The backend keeps only a short-lived in-process cache while it is running.
Durable offline Quran data is stored separately by each installed app.
"""
import asyncio
import logging
import os
import re
from datetime import datetime, timedelta, timezone

import httpx

from lib.arabic import normalize

logger = logging.getLogger(__name__)
QURAN_BASE = os.environ.get("QURAN_API_BASE", "https://api.quran.com/api/v4")
QDC_BASE = os.environ.get("QDC_API_BASE", "https://api.qurancdn.com/api/qdc")
TRANSLATION_ID = 20
CACHE_TTL = timedelta(days=6)
EXPECTED_CHAPTERS = 114
EXPECTED_VERSES = 6236
ALLOWED_AUDIO_HOSTS = ("download.quranicaudio.com", "verses.quran.com", "audio.qurancdn.com")
EXCLUDED_RECITERS = {168}

_chapters_cache = None
_chapter_cache: dict[int, tuple[datetime, list[dict]]] = {}
_reciters_cache = None
_audio_cache: dict[tuple[int, int], tuple[datetime, dict]] = {}
_locks: dict[str, asyncio.Lock] = {}


class UpstreamError(Exception):
    pass


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _fresh(entry) -> bool:
    return bool(entry and _now() - entry[0] < CACHE_TTL)


def _lock(name: str) -> asyncio.Lock:
    return _locks.setdefault(name, asyncio.Lock())


async def _get(url: str, params: dict | None = None) -> dict:
    async with httpx.AsyncClient(timeout=40) as client:
        for attempt in range(3):
            try:
                response = await client.get(url, params=params)
            except httpx.HTTPError as exc:
                if attempt == 2:
                    raise UpstreamError(str(exc)) from exc
                await asyncio.sleep(1.5 * (attempt + 1))
                continue
            if response.status_code == 429 or response.status_code >= 500:
                await asyncio.sleep(1.5 * (attempt + 1))
                continue
            if response.status_code >= 400:
                raise UpstreamError(f"upstream {response.status_code}")
            try:
                return response.json()
            except ValueError as exc:
                raise UpstreamError("upstream returned invalid JSON") from exc
    raise UpstreamError("upstream unavailable")


def _clean_translation(html: str) -> str:
    text = re.sub(r"<sup[^>]*>.*?</sup>", "", html or "", flags=re.S)
    text = re.sub(r"<[^>]+>", "", text)
    return re.sub(r"\\s+", " ", text).strip()


async def get_chapters() -> list[dict]:
    global _chapters_cache
    if _fresh(_chapters_cache):
        return _chapters_cache[1]
    async with _lock("chapters"):
        if _fresh(_chapters_cache):
            return _chapters_cache[1]
        try:
            data = await _get(f"{QURAN_BASE}/chapters", {"language": "ar"})
        except UpstreamError:
            if _chapters_cache:
                return _chapters_cache[1]
            raise
        chapters = [
            {
                "id": c["id"],
                "name_arabic": c["name_arabic"],
                "name_simple": c["name_simple"],
                "translated_name": (c.get("translated_name") or {}).get("name", ""),
                "revelation_place": c["revelation_place"],
                "revelation_order": c["revelation_order"],
                "verses_count": c["verses_count"],
                "bismillah_pre": bool(c["bismillah_pre"]),
                "pages": c.get("pages", []),
            }
            for c in data["chapters"]
        ]
        _chapters_cache = (_now(), chapters)
        return chapters


async def get_chapter_meta(n: int) -> dict | None:
    if not 1 <= n <= EXPECTED_CHAPTERS:
        return None
    return next((item for item in await get_chapters() if item["id"] == n), None)


async def ensure_chapter(n: int) -> list[dict]:
    if not 1 <= n <= EXPECTED_CHAPTERS:
        raise UpstreamError(f"invalid chapter id: {n}")
    cached = _chapter_cache.get(n)
    if _fresh(cached):
        return cached[1]
    async with _lock(f"chapter:{n}"):
        cached = _chapter_cache.get(n)
        if _fresh(cached):
            return cached[1]
        try:
            data = await _get(
                f"{QURAN_BASE}/verses/by_chapter/{n}",
                {
                    "language": "ar",
                    "words": "true",
                    "word_fields": "text_uthmani",
                    "fields": "text_uthmani,text_imlaei_simple",
                    "translations": str(TRANSLATION_ID),
                    "per_page": 300,
                },
            )
        except UpstreamError:
            if cached:
                return cached[1]
            raise
        docs = []
        for verse in data.get("verses", []):
            words = [
                {"position": word["position"], "text": word.get("text_uthmani") or word.get("text", "")}
                for word in verse.get("words", [])
                if word.get("char_type_name") == "word"
            ]
            translation = (verse.get("translations") or [{}])[0].get("text", "")
            docs.append({
                "key": verse["verse_key"],
                "chapter": n,
                "number": verse["verse_number"],
                "text": verse["text_uthmani"],
                "words": words,
                "translation": _clean_translation(translation),
                "juz": verse.get("juz_number", 0),
                "page": verse.get("page_number", 0),
                "norm": normalize(verse.get("text_imlaei_simple") or verse["text_uthmani"]),
            })
        if not docs:
            raise UpstreamError(f"chapter {n} returned no verses")
        _chapter_cache[n] = (_now(), docs)
        return docs


def cached_verses() -> list[dict]:
    return [verse for _, verses in _chapter_cache.values() for verse in verses]


def search_cached_verses(query: str, chapter: int | None = None, limit: int = 40) -> tuple[list[dict], int, int]:
    needle = normalize(query)
    available = [
        verse
        for chapter_id, (_, verses) in _chapter_cache.items()
        if chapter is None or chapter_id == chapter
        for verse in verses
    ]
    matches = [verse for verse in available if needle in verse["norm"]]
    matches.sort(key=lambda verse: (verse["chapter"], verse["number"]))
    return matches[:max(1, min(limit, 100))], len(matches), len(_chapter_cache)


async def get_reciters() -> list[dict]:
    global _reciters_cache
    if _fresh(_reciters_cache):
        return _reciters_cache[1]
    async with _lock("reciters"):
        if _fresh(_reciters_cache):
            return _reciters_cache[1]
        try:
            data = await _get(f"{QDC_BASE}/audio/reciters", {"locale": "ar"})
        except UpstreamError:
            if _reciters_cache:
                return _reciters_cache[1]
            raise
        reciters = [
            {
                "id": reciter["id"],
                "name": (reciter.get("translated_name") or {}).get("name") or reciter["name"],
                "name_en": reciter["name"],
                "style": (reciter.get("style") or {}).get("name", ""),
            }
            for reciter in data["reciters"]
            if reciter["id"] not in EXCLUDED_RECITERS
        ]
        _reciters_cache = (_now(), reciters)
        return reciters


def _valid_audio_url(url: str) -> bool:
    match = re.match(r"^https://([^/]+)/", url or "")
    return bool(match and match.group(1) in ALLOWED_AUDIO_HOSTS)


async def get_chapter_audio(reciter_id: int, chapter: int) -> dict | None:
    key = (reciter_id, chapter)
    cached = _audio_cache.get(key)
    if _fresh(cached):
        return cached[1]
    try:
        data = await _get(
            f"{QDC_BASE}/audio/reciters/{reciter_id}/audio_files",
            {"chapter": chapter, "segments": "true"},
        )
    except UpstreamError:
        if cached:
            return cached[1]
        raise
    files = data.get("audio_files") or []
    if not files or not _valid_audio_url(files[0].get("audio_url", "")):
        return None
    file_data = files[0]
    timings = []
    for timing in file_data.get("verse_timings") or []:
        segments = [
            [int(segment[0]), int(segment[1]), int(segment[2])]
            for segment in (timing.get("segments") or [])
            if isinstance(segment, list) and len(segment) == 3
            and all(isinstance(value, (int, float)) for value in segment)
        ]
        timings.append({
            "verse_key": timing["verse_key"],
            "start_ms": int(timing.get("timestamp_from") or 0),
            "end_ms": int(timing.get("timestamp_to") or 0),
            "segments": segments,
        })
    result = {
        "reciter_id": reciter_id,
        "chapter": chapter,
        "audio_url": file_data["audio_url"],
        "duration_ms": int(file_data.get("duration") or 0),
        "has_word_timing": any(item["segments"] for item in timings),
        "timings": timings,
    }
    _audio_cache[key] = (_now(), result)
    return result
