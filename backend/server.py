import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, APIRouter
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
from pathlib import Path


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
from lib.db import client, ensure_indexes  # noqa: E402
from lib.quran_source import sync_all  # noqa: E402
from routers.quran import router as quran_router  # noqa: E402
from routers.download import router as download_router  # noqa: E402


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.index_task = asyncio.create_task(ensure_indexes())
    app.state.sync_task = asyncio.create_task(sync_all())  # background warm-up of the Quran cache
    yield
    app.state.sync_task.cancel()
    client.close()


app = FastAPI(lifespan=lifespan, title="Athar Kareem API")

api_router = APIRouter(prefix="/api")


@api_router.get("/")
async def root():
    return {"message": "Athar Kareem API", "status": "ok"}


api_router.include_router(quran_router)
api_router.include_router(download_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Include the router in the main app — keep last
app.include_router(api_router)
