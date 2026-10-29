from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.config import settings
from app.database import init_db, SessionLocal
from app.seed import seed_database
from app.routes.health import router as health_router
from app.routes.exams import router as exams_router
from app.routes.sessions import router as sessions_router
from app.routes.webrtc import router as webrtc_router
from app.routes.auth import router as auth_router

# Path to compiled desktop/web renderer bundle and proctor web bundle
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
RENDERER_DIST = PROJECT_ROOT / "frontend" / "dist" / "renderer"
if not RENDERER_DIST.exists():
    RENDERER_DIST = PROJECT_ROOT / "apps" / "desktop" / "dist" / "renderer"
PROCTOR_DIST = PROJECT_ROOT / "apps" / "proctor-web" / "dist"
STATIC_DIR = Path(__file__).resolve().parent / "static"
DOWNLOAD_DIR = STATIC_DIR / "download"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Ensure database tables and demo seed are present on service startup."""
    init_db()
    # Ensure demo exam is seeded if database is fresh
    db = SessionLocal()
    try:
        seed_database(db)
    finally:
        db.close()
    yield


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="REST backend service for Sentinel Exam secure desktop assessment platform",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS configuration for desktop, web, and local development environments
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_origin_regex=r"^https?://.*$",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"]
)

# API Route registration (registered before static files so API takes precedence)
app.include_router(health_router)
app.include_router(auth_router)
app.include_router(exams_router)
app.include_router(sessions_router)
app.include_router(webrtc_router)

# Mount static downloads directory (sentinel-exam-client.zip, start-exam.bat)
if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="downloads_static")


# Student Assessment & Client Download Portal
@app.get("/download")
@app.get("/portal")
def download_portal():
    from fastapi.responses import FileResponse, RedirectResponse
    index_file = DOWNLOAD_DIR / "index.html"
    if index_file.exists():
        return FileResponse(str(index_file))
    return RedirectResponse(url="/docs")


# Mount dedicated proctor web dashboard static files if built
if PROCTOR_DIST.exists() and (PROCTOR_DIST / "index.html").exists():
    @app.get("/proctor")
    def proctor_redirect():
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url="/proctor/")

    app.mount("/proctor", StaticFiles(directory=str(PROCTOR_DIST), html=True), name="proctor_static")

# Mount desktop renderer static files at root if built, or provide informative status endpoint
if RENDERER_DIST.exists() and (RENDERER_DIST / "index.html").exists():
    app.mount("/", StaticFiles(directory=str(RENDERER_DIST), html=True), name="static")
else:
    @app.get("/")
    def root():
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url="/download")
