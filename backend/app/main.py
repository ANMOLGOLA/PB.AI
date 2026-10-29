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

# Path to compiled desktop/web renderer bundle
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
RENDERER_DIST = PROJECT_ROOT / "frontend" / "dist" / "renderer"
if not RENDERER_DIST.exists():
    RENDERER_DIST = PROJECT_ROOT / "apps" / "desktop" / "dist" / "renderer"


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
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "http://localhost:3000",
        "http://127.0.0.1:3000"
    ],
    allow_origin_regex=r"^http://(localhost|127\.0\.0\.1):[0-9]+$",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"]
)

# API Route registration (registered before static files so API takes precedence)
app.include_router(health_router)
app.include_router(exams_router)
app.include_router(sessions_router)

# Mount renderer static files at root if built, or provide informative status endpoint
if RENDERER_DIST.exists() and (RENDERER_DIST / "index.html").exists():
    app.mount("/", StaticFiles(directory=str(RENDERER_DIST), html=True), name="static")
else:
    @app.get("/")
    def root():
        return {
            "service": "sentinel-exam-api",
            "status": "ok",
            "message": "Sentinel Exam backend is running. Build the frontend or visit /docs for API documentation.",
            "health": "/health",
            "exams": "/api/exams",
            "docs": "/docs"
        }
