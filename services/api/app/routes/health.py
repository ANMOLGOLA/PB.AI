from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.config import settings
from app.database import get_db
from app.schemas import HealthResponse

router = APIRouter(tags=["Health"])


@router.get("/health", response_model=HealthResponse, status_code=status.HTTP_200_OK)
def get_health(db: Session = Depends(get_db)):
    """
    Health check endpoint reporting API operational status and verified database connectivity.
    """
    db_status = "disconnected"
    try:
        # Actively verify database readiness
        db.execute(text("SELECT 1"))
        db_status = "connected"
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Database readiness verification failed: {str(exc)}"
        ) from exc

    return HealthResponse(
        status="ok",
        service="sentinel-exam-api",
        version=settings.VERSION,
        database=db_status
    )
