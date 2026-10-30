import random
import re
from typing import List

from fastapi import APIRouter, HTTPException, Query

from lib import quran_source as qs
from lib.arabic import normalize
from lib.db import db
from lib.topics import TOPICS, TOPIC_NOTE
from models.quran import (
    Chapter, ChapterAudio, ChapterDetail, IntegrityReport, Reciter, SearchResponse, Topic, TopicDetail, Verse,
)

router = APIRouter(prefix="/quran", tags=["quran"])
KEY_RE = re.compile(r"^(\d{1,3}):(\d{1,3})$")
PROJECTION = {"_id": 0, "norm": 0}


def _upstream(exc: Exception) -> HTTPException:
    return HTTPException(status_code=502, detail="تعذّر الوصول إلى مصدر بيانات القرآن حالياً")


async def _chapter_or_404(n: int) -> dict:
    try:
        meta = await qs.get_chapter_meta(n)
    except qs.UpstreamError as exc:
        raise _upstream(exc)
    if not meta:
        raise HTTPException(status_code=404, detail="السورة غير موجودة")
    return meta


async def _verses_by_keys(keys: List[str]) -> List[Verse]:
    parsed = []
    for k in keys:
        m = KEY_RE.match(k.strip())
        if not m:
            raise HTTPException(status_code=400, detail=f"مرجع آية غير صالح: {k}")
        parsed.append((int(m.group(1)), int(m.group(2))))
    for ch in sorted({c for c, _ in parsed}):
        meta = await _chapter_or_404(ch)
        try:
            await qs.ensure_chapter(ch)
        except qs.UpstreamError as exc:
            raise _upstream(exc)
        if any(c == ch and not (1 <= v <= meta["verses_count"]) for c, v in parsed):
            raise HTTPException(status_code=404, detail="رقم الآية خارج نطاق السورة")
    norm_keys = [f"{c}:{v}" for c, v in parsed]
    docs = await db.verses.find({"key": {"$in": norm_keys}}, PROJECTION).to_list(len(norm_keys) + 5)
    by_key = {d["key"]: d for d in docs}
    return [Verse(**by_key[k]) for k in norm_keys if k in by_key]


@router.get("/chapters", response_model=List[Chapter])
async def list_chapters():
    try:
        return [Chapter(**c) for c in await qs.get_chapters()]
    except qs.UpstreamError as exc:
        raise _upstream(exc)


@router.get("/chapters/{n}", response_model=ChapterDetail)
async def chapter_detail(n: int):
    meta = await _chapter_or_404(n)
    try:
        await qs.ensure_chapter(n)
    except qs.UpstreamError as exc:
        raise _upstream(exc)
    docs = await db.verses.find({"chapter": n}, PROJECTION).sort("number", 1).to_list(400)
    return ChapterDetail(chapter=Chapter(**meta), verses=[Verse(**d) for d in docs])


@router.get("/verses", response_model=List[Verse])
async def verses(keys: str = Query(..., description="comma separated verse keys, e.g. 2:153,94:5")):
    items = [k for k in keys.split(",") if k.strip()][:200]
    if not items:
        raise HTTPException(status_code=400, detail="لا توجد مراجع آيات")
    return await _verses_by_keys(items)


@router.get("/search", response_model=SearchResponse)
async def search(q: str = Query(..., min_length=2, max_length=80), chapter: int | None = None, limit: int = 40):
    nq = normalize(q)
    if len(nq) < 2:
        raise HTTPException(status_code=400, detail="أدخل كلمة بحث عربية من حرفين على الأقل")
    flt: dict = {"norm": {"$regex": re.escape(nq)}}
    if chapter:
        flt["chapter"] = chapter
        try:
            await qs.ensure_chapter(chapter)
        except qs.UpstreamError as exc:
            raise _upstream(exc)
    total = await db.verses.count_documents(flt)
    docs = await db.verses.find(flt, PROJECTION).sort([("chapter", 1), ("number", 1)]).limit(min(limit, 100)).to_list(100)
    indexed = await db.chapter_cache.count_documents({})
    return SearchResponse(query=q, total=total, results=[Verse(**d) for d in docs], indexed_chapters=indexed)


@router.get("/random", response_model=Verse)
async def random_verse(exclude: str = ""):
    excluded = [k for k in exclude.split(",") if k][:50]
    pipeline = [{"$match": {"key": {"$nin": excluded}}}, {"$sample": {"size": 1}}, {"$project": PROJECTION}]
    docs = await db.verses.aggregate(pipeline).to_list(1)
    if not docs:  # cache still empty: fetch a random chapter first
        ch = random.randint(1, qs.EXPECTED_CHAPTERS)
        try:
            await qs.ensure_chapter(ch)
        except qs.UpstreamError as exc:
            raise _upstream(exc)
        docs = await db.verses.aggregate(pipeline).to_list(1)
    if not docs:
        raise HTTPException(status_code=404, detail="لا توجد آيات")
    return Verse(**docs[0])


def _topic(t: dict) -> dict:
    return {"id": t["id"], "name": t["name"], "description": t["description"], "verse_keys": t["keys"], "complete": False, "note": TOPIC_NOTE}


@router.get("/topics", response_model=List[Topic])
async def topics():
    return [Topic(**_topic(t)) for t in TOPICS]


@router.get("/topics/{topic_id}", response_model=TopicDetail)
async def topic_detail(topic_id: str):
    t = next((t for t in TOPICS if t["id"] == topic_id), None)
    if not t:
        raise HTTPException(status_code=404, detail="الموضوع غير موجود")
    return TopicDetail(**_topic(t), verses=await _verses_by_keys(t["keys"]))


@router.get("/reciters", response_model=List[Reciter])
async def reciters():
    try:
        return [Reciter(**r) for r in await qs.get_reciters()]
    except qs.UpstreamError as exc:
        raise _upstream(exc)


@router.get("/audio/{reciter_id}/{chapter}", response_model=ChapterAudio)
async def chapter_audio(reciter_id: int, chapter: int):
    if not 1 <= chapter <= qs.EXPECTED_CHAPTERS:
        raise HTTPException(status_code=404, detail="السورة غير موجودة")
    try:
        ids = {r["id"] for r in await qs.get_reciters()}
        if reciter_id not in ids:
            raise HTTPException(status_code=404, detail="القارئ غير متاح")
        data = await qs.get_chapter_audio(reciter_id, chapter)
    except qs.UpstreamError as exc:
        raise _upstream(exc)
    if not data:
        raise HTTPException(status_code=404, detail="التلاوة غير متوفرة لهذه السورة")
    return ChapterAudio(**data)


@router.get("/integrity", response_model=IntegrityReport)
async def integrity():
    issues: list[str] = []
    try:
        chapters = await qs.get_chapters()
    except qs.UpstreamError as exc:
        raise _upstream(exc)
    if len(chapters) != qs.EXPECTED_CHAPTERS:
        issues.append(f"عدد السور {len(chapters)} بدلاً من 114")
    if [c["id"] for c in chapters] != list(range(1, len(chapters) + 1)):
        issues.append("ترتيب معرّفات السور غير متسلسل")
    meta_total = sum(c["verses_count"] for c in chapters)
    if meta_total != qs.EXPECTED_VERSES:
        issues.append(f"مجموع الآيات في بيانات السور {meta_total} بدلاً من 6236")
    docs = await db.verses.find({}, {"_id": 0, "key": 1, "chapter": 1, "number": 1, "text": 1, "words": 1}).to_list(7000)
    by_ch: dict[int, list[int]] = {}
    seen: set[str] = set()
    for d in docs:
        if d["key"] in seen:
            issues.append(f"معرّف مكرر {d['key']}")
        seen.add(d["key"])
        if d["key"] != f"{d['chapter']}:{d['number']}":
            issues.append(f"مرجع غير متطابق {d['key']}")
        if not (d.get("text") or "").strip() or not d.get("words"):
            issues.append(f"نص فارغ في {d['key']}")
        by_ch.setdefault(d["chapter"], []).append(d["number"])
    for c in chapters:
        nums = sorted(by_ch.get(c["id"], []))
        if nums and nums != list(range(1, c["verses_count"] + 1)):
            issues.append(f"سورة {c['id']}: آيات ناقصة أو زائدة ({len(nums)}/{c['verses_count']})")
    cached = len(by_ch)
    if cached < qs.EXPECTED_CHAPTERS:
        issues.append(f"لم يكتمل التخزين المحلي بعد: {cached}/114 سورة")
    return IntegrityReport(
        ok=not issues, chapters_count=len(chapters), expected_chapters=qs.EXPECTED_CHAPTERS, cached_chapters=cached,
        verses_count=len(docs), expected_verses=qs.EXPECTED_VERSES, issues=issues[:50],
        source="Quran.com API v4 (Quran Foundation) — text_uthmani, Saheeh International (id 20)",
    )
