from pathlib import Path
import logging
import os

from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

from routers.quran import router as quran_router  # noqa: E402
from routers.download import router as download_router  # noqa: E402
from routers.offline import router as offline_router  # noqa: E402

app = FastAPI(title="Athar Kareem API")
api_router = APIRouter(prefix="/api")


@api_router.get("/")
async def root():
    return {"message": "Athar Kareem API", "status": "ok"}


api_router.include_router(quran_router)
api_router.include_router(download_router)
api_router.include_router(offline_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)
app.include_router(api_router)
