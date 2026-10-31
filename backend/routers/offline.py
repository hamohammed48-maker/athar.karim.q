import logging

from fastapi import APIRouter, HTTPException, Query
from starlette.concurrency import run_in_threadpool

from lib.qf_offline import QuranFoundationError, get_offline_quran_bundle

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/offline", tags=["offline"])


@router.get("/quran-bundle")
async def quran_bundle(known_version: str | None = Query(default=None, max_length=80)):
    """Initial Content Sync download or a lightweight six-day update check."""
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
