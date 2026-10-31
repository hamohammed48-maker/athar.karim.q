import logging
import os

from fastapi import APIRouter, HTTPException
from starlette.concurrency import run_in_threadpool

from lib import quran_source
from fastapi import APIRouter, HTTPException
from starlette.concurrency import run_in_threadpool

from lib.qf_offline import QuranFoundationError, get_offline_quran_bundle

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/offline", tags=["offline"])


@router.get("/status")
async def offline_status():
    """Check/sync the Content Sync copy without sending Quran text to the device."""
    try:
        return await run_in_threadpool(get_offline_quran_bundle, None, None, True)
    except QuranFoundationError as exc:
        logger.warning("offline Quran sync status unavailable: %s", exc)
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("offline Quran sync status failed")
        raise HTTPException(status_code=502, detail="تعذّر التحقق من تحديث بيانات القرآن حالياً.") from exc


@router.get("/chapters/{chapter_id}")
async def offline_chapter(chapter_id: int):
    """Return only one verified chapter; the full Content Sync copy stays on the backend."""
    if not 1 <= chapter_id <= 114:
        raise HTTPException(status_code=404, detail="السورة غير موجودة")
    # Pre-live Content Sync intentionally exposes no quran_core snapshot.
    # For app smoke-testing only, serve the two sample chapters through the
    # existing Quran.com adapter; the app persists them locally in IndexedDB.
    if os.environ.get("QF_ENV", "production").strip().lower() == "prelive":
        if chapter_id not in {1, 2}:
            raise HTTPException(status_code=404, detail="نسخة Pre-live التجريبية تتيح الفاتحة والبقرة فقط.")
        try:
            meta = await quran_source.get_chapter_meta(chapter_id)
            if not meta:
                raise HTTPException(status_code=404, detail="السورة غير موجودة")
            verses = await quran_source.ensure_chapter(chapter_id)
            if len(verses) != meta["verses_count"]:
                raise QuranFoundationError(f"بيانات السورة {chapter_id} غير مكتملة.")
            return {"chapter": meta, "verses": verses}
        except quran_source.UpstreamError as exc:
            logger.warning("prelive sample chapter unavailable: %s", exc)
            raise HTTPException(status_code=503, detail="تعذّر جلب السورة التجريبية حالياً.") from exc

    try:
        result = await run_in_threadpool(get_offline_quran_bundle, None, chapter_id)
        if result.get("status") != "updated":
            raise QuranFoundationError("لم تتوفر نسخة محدثة من السورة.")
        chapter = result.get("chapter")
        verses = result.get("verses")
        if not chapter or not isinstance(verses, list) or len(verses) != chapter.get("verses_count"):
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
