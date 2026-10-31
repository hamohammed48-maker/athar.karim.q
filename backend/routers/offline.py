import logging

from fastapi import APIRouter, HTTPException, Query
from starlette.concurrency import run_in_threadpool

from lib.qf_offline import QuranFoundationError, get_offline_quran_bundle

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/offline", tags=["offline"])


def _current_bundle() -> dict:
    result = get_offline_quran_bundle()
    bundle = result.get("bundle")
    if not isinstance(bundle, dict):
        raise QuranFoundationError("لم تتوفر نسخة محتوى متزامنة لعرض السورة.")
    return bundle


@router.get("/chapters/{chapter_id}")
async def offline_chapter(chapter_id: int):
    """Serve only the requested chapter from the verified Content Sync copy."""
    if not 1 <= chapter_id <= 114:
        raise HTTPException(status_code=404, detail="السورة غير موجودة")
    try:
        bundle = await run_in_threadpool(_current_bundle)
        chapter = next((item for item in bundle["chapters"] if item["id"] == chapter_id), None)
        if chapter is None:
            raise HTTPException(status_code=404, detail="السورة غير موجودة")
        verses = [item for item in bundle["verses"] if item["chapter"] == chapter_id]
        if len(verses) != chapter["verses_count"]:
            raise QuranFoundationError(f"بيانات السورة {chapter_id} غير مكتملة.")
        return {"chapter": chapter, "verses": verses}
    except QuranFoundationError as exc:
        logger.warning("offline Quran chapter unavailable: %s", exc)
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("offline Quran chapter delivery failed")
        raise HTTPException(
            status_code=502,
            detail="تعذّر جلب السورة من مصدر القرآن حالياً.",
        ) from exc


@router.get("/quran-bundle")
async def quran_bundle(known_version: str | None = Query(default=None, max_length=80)):
    """Legacy full-bundle endpoint; retained temporarily for backward compatibility."""
    try:
        return await run_in_threadpool(get_offline_quran_bundle, known_version)
    except QuranFoundationError as exc:
        logger.warning("offline Quran sync unavailable: %s", exc)
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("offline Quran Content Sync failed")
        raise HTTPException(
            status_code=502,
            detail="تعذّر تنزيل أو تحديث بيانات القرآن من المصدر الرسمي حالياً.",
        ) from exc
