"""Quran.com (Quran Foundation) public API client with a MongoDB cache.

Upstream terms limit caching of regular API content to one week, so every cached
item carries a fetched_at and is refreshed after CACHE_TTL (6 days).
Quran text is stored exactly as returned (text_uthmani); only a separate `norm`
field is derived for search matching.
"""
import asyncio
import logging
import os
import re
from datetime import datetime, timedelta, timezone

import httpx

from lib.arabic import normalize
from lib.db import db

logger = logging.getLogger(__name__)

QURAN_BASE = os.environ.get("QURAN_API_BASE", "https://api.quran.com/api/v4")
QDC_BASE = os.environ.get("QDC_API_BASE", "https://api.qurancdn.com/api/qdc")
TRANSLATION_ID = 20  # Saheeh International
CACHE_TTL = timedelta(days=6)
EXPECTED_CHAPTERS = 114
EXPECTED_VERSES = 6236
ALLOWED_AUDIO_HOSTS = ("download.quranicaudio.com", "verses.quran.com", "audio.qurancdn.com")
EXCLUDED_RECITERS = {168}  # "kids repeat" edition — not a standard recitation

_locks: dict[str, asyncio.Lock] = {}


class UpstreamError(Exception):
    pass


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _fresh(doc: dict | None) -> bool:
    if not doc or not doc.get("fetched_at"):
        return False
    ts = doc["fetched_at"]
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return _now() - ts < CACHE_TTL


def _lock(name: str) -> asyncio.Lock:
    return _locks.setdefault(name, asyncio.Lock())


async def _get(url: str, params: dict | None = None) -> dict:
    async with httpx.AsyncClient(timeout=40) as client:
        for attempt in range(3):
            try:
                r = await client.get(url, params=params)
            except httpx.HTTPError as exc:
                if attempt == 2:
                    raise UpstreamError(str(exc)) from exc
                await asyncio.sleep(1.5 * (attempt + 1))
                continue
            if r.status_code == 429 or r.status_code >= 500:
                await asyncio.sleep(1.5 * (attempt + 1))
                continue
            if r.status_code >= 400:
                raise UpstreamError(f"upstream {r.status_code}")
            return r.json()
    raise UpstreamError("upstream unavailable")


def _clean_translation(html: str) -> str:
    text = re.sub(r"<sup[^>]*>.*?</sup>", "", html or "", flags=re.S)
    text = re.sub(r"<[^>]+>", "", text)
    return re.sub(r"\s+", " ", text).strip()


# ---------- chapters ----------
async def get_chapters() -> list[dict]:
    meta = await db.meta.find_one({"_id": "chapters"})
    if _fresh(meta):
        return meta["chapters"]
    async with _lock("chapters"):
        meta = await db.meta.find_one({"_id": "chapters"})
        if _fresh(meta):
            return meta["chapters"]
        try:
            data = await _get(f"{QURAN_BASE}/chapters", {"language": "ar"})
        except UpstreamError:
            if meta:
                return meta["chapters"]  # stale is better than nothing
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
        await db.meta.replace_one({"_id": "chapters"}, {"_id": "chapters", "chapters": chapters, "fetched_at": _now()}, upsert=True)
        return chapters


async def get_chapter_meta(n: int) -> dict | None:
    return next((c for c in await get_chapters() if c["id"] == n), None)


# ---------- verses ----------
async def ensure_chapter(n: int) -> None:
    state = await db.chapter_cache.find_one({"chapter": n})
    if _fresh(state):
        return
    async with _lock(f"ch{n}"):
        state = await db.chapter_cache.find_one({"chapter": n})
        if _fresh(state):
            return
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
            if state:
                return  # keep stale cache
            raise
        docs = []
        for v in data["verses"]:
            words = [
                {"position": w["position"], "text": w.get("text_uthmani") or w.get("text", "")}
                for w in v.get("words", [])
                if w.get("char_type_name") == "word"
            ]
            tr = (v.get("translations") or [{}])[0].get("text", "")
            docs.append({
                "key": v["verse_key"],
                "chapter": n,
                "number": v["verse_number"],
                "text": v["text_uthmani"],
                "words": words,
                "translation": _clean_translation(tr),
                "juz": v.get("juz_number", 0),
                "page": v.get("page_number", 0),
                "norm": normalize(v.get("text_imlaei_simple") or v["text_uthmani"]),
            })
        if not docs:
            raise UpstreamError(f"chapter {n} returned no verses")
        await db.verses.delete_many({"chapter": n})
        await db.verses.insert_many(docs)
        await db.chapter_cache.replace_one({"chapter": n}, {"chapter": n, "count": len(docs), "fetched_at": _now()}, upsert=True)


async def sync_all() -> None:
    """Background warm-up: caches all chapters (throttled) so search/random cover the whole Quran."""
    try:
        await get_chapters()
    except Exception as exc:
        logger.warning("chapter list sync failed: %s", exc)
        return
    sem = asyncio.Semaphore(3)

    async def one(n: int):
        async with sem:
            try:
                await ensure_chapter(n)
            except Exception as exc:
                logger.warning("chapter %s sync failed: %s", n, exc)

    await asyncio.gather(*(one(n) for n in range(1, EXPECTED_CHAPTERS + 1)))
    logger.info("quran sync complete")


# ---------- reciters / audio ----------
async def get_reciters() -> list[dict]:
    meta = await db.meta.find_one({"_id": "reciters"})
    if _fresh(meta):
        return meta["reciters"]
    try:
        data = await _get(f"{QDC_BASE}/audio/reciters", {"locale": "ar"})
    except UpstreamError:
        if meta:
            return meta["reciters"]
        raise
    reciters = [
        {
            "id": r["id"],
            "name": (r.get("translated_name") or {}).get("name") or r["name"],
            "name_en": r["name"],
            "style": (r.get("style") or {}).get("name", ""),
        }
        for r in data["reciters"]
        if r["id"] not in EXCLUDED_RECITERS
    ]
    await db.meta.replace_one({"_id": "reciters"}, {"_id": "reciters", "reciters": reciters, "fetched_at": _now()}, upsert=True)
    return reciters


def _valid_audio_url(url: str) -> bool:
    m = re.match(r"^https://([^/]+)/", url or "")
    return bool(m and m.group(1) in ALLOWED_AUDIO_HOSTS)


async def get_chapter_audio(reciter_id: int, chapter: int) -> dict | None:
    doc = await db.audio_cache.find_one({"reciter_id": reciter_id, "chapter": chapter})
    if _fresh(doc):
        return doc["data"]
    try:
        data = await _get(f"{QDC_BASE}/audio/reciters/{reciter_id}/audio_files", {"chapter": chapter, "segments": "true"})
    except UpstreamError:
        if doc:
            return doc["data"]
        raise
    files = data.get("audio_files") or []
    if not files or not _valid_audio_url(files[0].get("audio_url", "")):
        return None
    f = files[0]
    timings = []
    for t in f.get("verse_timings") or []:
        segs = [
            [int(s[0]), int(s[1]), int(s[2])]
            for s in (t.get("segments") or [])
            if isinstance(s, list) and len(s) == 3 and all(isinstance(x, (int, float)) for x in s)
        ]
        timings.append({
            "verse_key": t["verse_key"],
            "start_ms": int(t.get("timestamp_from") or 0),
            "end_ms": int(t.get("timestamp_to") or 0),
            "segments": segs,
        })
    out = {
        "reciter_id": reciter_id,
        "chapter": chapter,
        "audio_url": f["audio_url"],
        "duration_ms": int(f.get("duration") or 0),
        "has_word_timing": any(t["segments"] for t in timings),
        "timings": timings,
    }
    await db.audio_cache.replace_one(
        {"reciter_id": reciter_id, "chapter": chapter},
        {"reciter_id": reciter_id, "chapter": chapter, "data": out, "fetched_at": _now()},
        upsert=True,
    )
    return out
