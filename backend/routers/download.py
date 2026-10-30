import os
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

router = APIRouter(prefix="/download", tags=["download"])
ARCHIVE = Path(os.environ.get("PROJECT_ARCHIVE_PATH", "/app/downloads/athar-kareem.zip"))


@router.get("/project")
async def download_project():
    """Source-code archive of the project, sent as an attachment (forces a download)."""
    if not ARCHIVE.is_file():
        raise HTTPException(status_code=404, detail="ملف المشروع غير متوفر")
    return FileResponse(ARCHIVE, media_type="application/zip", filename="athar-kareem.zip",
                        headers={"Content-Disposition": 'attachment; filename="athar-kareem.zip"', "Cache-Control": "no-store"})
