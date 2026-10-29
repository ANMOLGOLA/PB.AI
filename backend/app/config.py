import os
from pathlib import Path
from dotenv import load_dotenv

# Base directory for the API service (backend)
BASE_DIR = Path(__file__).resolve().parent.parent

# Load environment variables from .env if present
load_dotenv(BASE_DIR / ".env")
load_dotenv(BASE_DIR.parent / ".env")

# Database file location - deterministic and independent of current working directory
DEFAULT_DB_FILE = BASE_DIR / "sentinel_exam.db"


class Settings:
    PROJECT_NAME: str = "Sentinel Exam Secure Backend"
    VERSION: str = "0.1.0"

    # SQLite Database Path
    DB_PATH: Path = Path(os.getenv("SENTINEL_DB_PATH", str(DEFAULT_DB_FILE))).resolve()

    # Teacher / Proctor Override Codes
    TEACHER_UNLOCK_CODE: str = os.getenv("TEACHER_UNLOCK_CODE", "TEACHER-UNLOCK-2026")
    ALLOWED_TEACHER_CODES: list = [
        "TEACHER-UNLOCK-2026",
        "ELEV8-2026",
        "SUPERVISOR-KEY",
        "ADMIN-PASS",
        "778899"
    ]

    # Groq API Configuration for Vision Proctoring Analysis (Decommissioned)
    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")
    GROQ_VISION_MODEL: str = os.getenv("GROQ_VISION_MODEL", "llama-3.2-11b-vision-preview")

    # Gemini API Configuration for Multimodal VLM Incident Review
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    GEMINI_VISION_MODEL: str = os.getenv("GEMINI_VISION_MODEL", "gemini-1.5-flash")

    # WebRTC STUN/TURN Relays for Cross-Network Screen Sharing
    WEBRTC_STUN_SERVER: str = os.getenv("WEBRTC_STUN_SERVER", "stun:stun.l.google.com:19302")
    WEBRTC_TURN_SERVER: str = os.getenv("WEBRTC_TURN_SERVER", "")
    WEBRTC_TURN_USERNAME: str = os.getenv("WEBRTC_TURN_USERNAME", "")
    WEBRTC_TURN_CREDENTIAL: str = os.getenv("WEBRTC_TURN_CREDENTIAL", "")

    # Airtable Integration for MCQ Assessments (Optional sync with local cache fallback)
    AIRTABLE_API_KEY: str = os.getenv("AIRTABLE_API_KEY", "")
    AIRTABLE_BASE_ID: str = os.getenv("AIRTABLE_BASE_ID", "")
    AIRTABLE_TABLE_NAME: str = os.getenv("AIRTABLE_TABLE_NAME", "Questions")

    # OTP Authentication & Attempt Policy
    OTP_EXPIRY_SECONDS: int = int(os.getenv("OTP_EXPIRY_SECONDS", "300"))  # 5 minutes
    OTP_MAX_ATTEMPTS: int = int(os.getenv("OTP_MAX_ATTEMPTS", "3"))        # 3 attempts
    OTP_DEV_MOCK_PROVIDER: bool = os.getenv("OTP_DEV_MOCK_PROVIDER", "true").lower() in ("true", "1", "yes")

    # Policy Engine & Violation Thresholds
    POLICY_WARN_THRESHOLD: int = int(os.getenv("POLICY_WARN_THRESHOLD", "3"))
    POLICY_AUTO_SUBMIT_THRESHOLD: int = int(os.getenv("POLICY_AUTO_SUBMIT_THRESHOLD", "5"))
    POLICY_CRITICAL_SCORE_THRESHOLD: int = int(os.getenv("POLICY_CRITICAL_SCORE_THRESHOLD", "85"))

    @property
    def SQLALCHEMY_DATABASE_URI(self) -> str:
        # SQLite URL with absolute path
        clean_path = str(self.DB_PATH).replace("\\", "/")
        return f"sqlite:///{clean_path}"


settings = Settings()
