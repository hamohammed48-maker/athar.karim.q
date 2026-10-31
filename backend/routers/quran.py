import random
import re
from typing import List

from fastapi import APIRouter, HTTPException, Query

from lib import quran_source as qs
from lib.topics import TOPICS, TOPIC_NOTE
from models.quran import (
    Chapter, ChapterAudio, ChapterDetail, IntegrityReport, Reciter, SearchResponse, Topic, TopicDetail, Verse,
)

router = APIRouter(prefix="/quran", tags=["quran"])
KEY_RE = re.compile(r"^(\\d{1,3}):(\\d{1,3})$")


def _upstream(exc: Exception) -> HTTPException:
    return HTTPException(status_code=502, detail="تعذّر الوصول إلى مصدر بيانات القرآن حالياً")


async def _verses_by_keys(keys: List[str]) -> List[Verse]:
    parsed = []
    for key in keys:
        match = KEY_RE.match(key.strip())
        if not match:
            raise HTTPException(status_code=400, detail=f"مرجع آية غير صالح: {key}")
        parsed.append((int(match.group(1)), int(match.group(2))))
    if any(not 1 <= chapter <= qs.EXPECTED_CHAPTERS for chapter, _ in parsed):
        raise HTTPException(status_code=404, detail="السورة غير موجودة")

    by_key: dict[str, dict] = {}
    for chapter in sorted({chapter for chapter, _ in parsed}):
        meta = await qs.get_chapter_meta(chapter)
        if not meta:
            raise HTTPException(status_code=404, detail="السورة غير موجودة")
        try:
            chapter_verses = await qs.ensure_chapter(chapter)
        except qs.UpstreamError as exc:
            raise _upstream(exc)
        if any(c == chapter and not 1 <= verse <= meta["verses_count"] for c, verse in parsed):
            raise HTTPException(status_code=404, detail="رقم الآية خارج نطاق السورة")
        by_key.update({verse["key"]: verse for verse in chapter_verses})
    return [
        Verse(**by_key[f"{chapter}:{number}"])
        for chapter, number in parsed
        if f"{chapter}:{number}" in by_key
    ]


@router.get("/chapters", response_model=List[Chapter])
async def list_chapters():
    try:
        return [Chapter(**chapter) for chapter in await qs.get_chapters()]
    except qs.UpstreamError as exc:
        raise _upstream(exc)


@router.get("/chapters/{n}", response_model=ChapterDetail)
async def chapter_detail(n: int):
    meta = await qs.get_chapter_meta(n)
    if not meta:
        raise HTTPException(status_code=404, detail="السورة غير موجودة")
    try:
        verses = await qs.ensure_chapter(n)
    except qs.UpstreamError as exc:
        raise _upstream(exc)
    return ChapterDetail(chapter=Chapter(**meta), verses=[Verse(**verse) for verse in verses])


@router.get("/verses", response_model=List[Verse])
async def verses(keys: str = Query(..., description="comma separated verse keys, e.g. 2:153,94:5")):
    items = [key for key in keys.split(",") if key.strip()][:200]
    if not items:
        raise HTTPException(status_code=400, detail="لا توجد مراجع آيات")
    return await _verses_by_keys(items)


@router.get("/search", response_model=SearchResponse)
async def search(q: str = Query(..., min_length=2, max_length=80), chapter: int | None = None, limit: int = 40):
    results, total, indexed = qs.search_cached_verses(q, chapter, limit)
    return SearchResponse(
        query=q,
        total=total,
        results=[Verse(**verse) for verse in results],
        indexed_chapters=indexed,
    )


@router.get("/random", response_model=Verse)
async def random_verse(exclude: str = ""):
    excluded = {key for key in exclude.split(",") if key}
    available = [verse for verse in qs.cached_verses() if verse["key"] not in excluded]
    if not available:
        chapter_id = random.randint(1, qs.EXPECTED_CHAPTERS)
        try:
            available = await qs.ensure_chapter(chapter_id)
        except qs.UpstreamError as exc:
            raise _upstream(exc)
        available = [verse for verse in available if verse["key"] not in excluded]
    if not available:
        raise HTTPException(status_code=404, detail="لا توجد آيات متاحة")
    return Verse(**random.choice(available))


def _topic(topic: dict) -> dict:
    return {
        "id": topic["id"],
        "name": topic["name"],
        "description": topic["description"],
        "verse_keys": topic["keys"],
        "complete": False,
        "note": TOPIC_NOTE,
    }


@router.get("/topics", response_model=List[Topic])
async def topics():
    return [Topic(**_topic(topic)) for topic in TOPICS]


@router.get("/topics/{topic_id}", response_model=TopicDetail)
async def topic_detail(topic_id: str):
    topic = next((item for item in TOPICS if item["id"] == topic_id), None)
    if not topic:
        raise HTTPException(status_code=404, detail="الموضوع غير موجود")
    return TopicDetail(**_topic(topic), verses=await _verses_by_keys(topic["keys"]))


@router.get("/reciters", response_model=List[Reciter])
async def reciters():
    try:
        return [Reciter(**reciter) for reciter in await qs.get_reciters()]
    except qs.UpstreamError as exc:
        raise _upstream(exc)


@router.get("/audio/{reciter_id}/{chapter}", response_model=ChapterAudio)
async def chapter_audio(reciter_id: int, chapter: int):
    if not 1 <= chapter <= qs.EXPECTED_CHAPTERS:
        raise HTTPException(status_code=404, detail="السورة غير موجودة")
    try:
        reciter_ids = {reciter["id"] for reciter in await qs.get_reciters()}
        if reciter_id not in reciter_ids:
            raise HTTPException(status_code=404, detail="القارئ غير متاح")
        data = await qs.get_chapter_audio(reciter_id, chapter)
    except qs.UpstreamError as exc:
        raise _upstream(exc)
    if not data:
        raise HTTPException(status_code=404, detail="التلاوة غير متوفرة لهذه السورة")
    return ChapterAudio(**data)


@router.get("/integrity", response_model=IntegrityReport)
async def integrity():
    try:
        chapters = await qs.get_chapters()
    except qs.UpstreamError as exc:
        raise _upstream(exc)
    verses = qs.cached_verses()
    issues: list[str] = []
    if len(chapters) != qs.EXPECTED_CHAPTERS:
        issues.append(f"عدد السور {len(chapters)} بدلاً من 114")
    if [chapter["id"] for chapter in chapters] != list(range(1, 115)):
        issues.append("ترتيب معرّفات السور غير متسلسل")
    if sum(chapter["verses_count"] for chapter in chapters) != qs.EXPECTED_VERSES:
        issues.append("مجموع الآيات في بيانات السور لا يساوي 6236")
    by_chapter: dict[int, list[int]] = {}
    seen: set[str] = set()
    for verse in verses:
        if verse["key"] in seen:
            issues.append(f"معرّف مكرر {verse['key']}")
        seen.add(verse["key"])
        if verse["key"] != f"{verse['chapter']}:{verse['number']}":
            issues.append(f"مرجع غير متطابق {verse['key']}")
        if not verse["text"].strip() or not verse["words"] or not verse["translation"].strip():
            issues.append(f"بيانات ناقصة في {verse['key']}")
        by_chapter.setdefault(verse["chapter"], []).append(verse["number"])
    for chapter in chapters:
        numbers = sorted(by_chapter.get(chapter["id"], []))
        if numbers and numbers != list(range(1, chapter["verses_count"] + 1)):
            issues.append(f"سورة {chapter['id']}: آيات ناقصة أو زائدة ({len(numbers)}/{chapter['verses_count']})")
    return IntegrityReport(
        ok=not issues,
        chapters_count=len(chapters),
        expected_chapters=qs.EXPECTED_CHAPTERS,
        cached_chapters=len(by_chapter),
        verses_count=len(verses),
        expected_verses=qs.EXPECTED_VERSES,
        issues=issues[:50],
        source="Quran.com API v4 (Quran Foundation) — text_uthmani, Saheeh International (id 20); server memory cache only",
    )
