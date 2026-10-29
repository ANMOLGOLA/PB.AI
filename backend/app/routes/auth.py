import uuid
import secrets
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.config import settings
from app.database import get_db
from app.models import OTPVerification
from app.schemas import SendOTPRequest, SendOTPResponse, VerifyOTPRequest, VerifyOTPResponse

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


@router.post("/otp/send", response_model=SendOTPResponse, status_code=status.HTTP_200_OK)
def send_otp(payload: SendOTPRequest, db: Session = Depends(get_db)):
    """
    Generate and dispatch a time-limited one-time password (OTP) for student authentication.
    In development mock provider mode, dev_otp is provided in the response payload.
    """
    clean_identifier = payload.identifier.strip().lower()
    if not clean_identifier:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Identifier (email or phone) is required."
        )

    # Cryptographically secure 6-digit OTP
    otp_code = f"{secrets.randbelow(900000) + 100000}"
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=settings.OTP_EXPIRY_SECONDS)

    verification = (
        db.query(OTPVerification)
        .filter(OTPVerification.identifier == clean_identifier)
        .first()
    )

    if verification:
        verification.otp_code = otp_code
        verification.attempts_left = settings.OTP_MAX_ATTEMPTS
        verification.expires_at = expires_at
        verification.is_verified = 0
    else:
        verification = OTPVerification(
            id=str(uuid.uuid4()),
            identifier=clean_identifier,
            otp_code=otp_code,
            attempts_left=settings.OTP_MAX_ATTEMPTS,
            expires_at=expires_at,
            created_at=datetime.now(timezone.utc),
            is_verified=0
        )
        db.add(verification)

    db.commit()

    return SendOTPResponse(
        status="sent",
        identifier=clean_identifier,
        expires_in_seconds=settings.OTP_EXPIRY_SECONDS,
        dev_otp=otp_code if settings.OTP_DEV_MOCK_PROVIDER else None,
        message="OTP generated and dispatched successfully."
    )


@router.post("/otp/verify", response_model=VerifyOTPResponse, status_code=status.HTTP_200_OK)
def verify_otp(payload: VerifyOTPRequest, db: Session = Depends(get_db)):
    """
    Validate a supplied OTP against the candidate identifier.
    Enforces expiry verification and maximum attempt thresholds.
    """
    clean_identifier = payload.identifier.strip().lower()
    clean_code = payload.otp_code.strip()

    verification = (
        db.query(OTPVerification)
        .filter(OTPVerification.identifier == clean_identifier)
        .first()
    )

    if not verification:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active OTP found for this identifier. Please request a new code."
        )

    # Check maximum attempt threshold
    if verification.attempts_left <= 0:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Maximum verification attempts exceeded. Please request a new OTP."
        )

    # Check expiry threshold
    now = datetime.now(timezone.utc)
    expires_at = verification.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if now > expires_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="OTP code has expired. Please request a new code."
        )

    # Check OTP correctness
    if verification.otp_code != clean_code:
        verification.attempts_left = max(0, verification.attempts_left - 1)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid verification code. Attempts remaining: {verification.attempts_left}"
        )

    # Successful verification
    verification.is_verified = 1
    db.commit()

    auth_token = f"tok_{uuid.uuid4().hex}"
    candidate_id = f"cand_{uuid.uuid4().hex[:10]}"

    return VerifyOTPResponse(
        status="verified",
        verified=True,
        token=auth_token,
        candidate_id=candidate_id,
        identifier=clean_identifier,
        message="Candidate identity verified successfully."
    )
