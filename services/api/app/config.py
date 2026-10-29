import os
from pathlib import Path

# Base directory for the API service (services/api)
BASE_DIR = Path(__file__).resolve().parent.parent

# Database file location - deterministic and independent of current working directory
DEFAULT_DB_FILE = BASE_DIR / "sentinel_exam.db"

class Settings:
    PROJECT_NAME: str = "Sentinel Exam API"
    VERSION: str = "0.1.0"
    API_PREFIX: str = "/api"
    HOST: str = os.getenv("SENTINEL_API_HOST", "127.0.0.1")
    PORT: int = int(os.getenv("SENTINEL_API_PORT", "8000"))
    ENVIRONMENT: str = os.getenv("SENTINEL_ENVIRONMENT", "development")
    
    # SQLite Database URI
    DB_PATH: Path = Path(os.getenv("SENTINEL_DB_PATH", str(DEFAULT_DB_FILE))).resolve()

    # Groq AI Vision Configuration
    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")
    GROQ_VISION_MODEL: str = os.getenv("GROQ_VISION_MODEL", "llama-3.2-11b-vision-preview")

    # Teacher Authorization Code for integrity lockouts
    TEACHER_UNLOCK_CODE: str = os.getenv("SENTINEL_TEACHER_CODE", "TEACHER-UNLOCK-2026")
    ALLOWED_TEACHER_CODES: list = ["TEACHER-UNLOCK-2026", "ELEV8-2026", "778899"]

    @property
    def SQLALCHEMY_DATABASE_URI(self) -> str:
        # SQLite URL with absolute path
        # Replace backslashes on Windows for valid URI syntax
        clean_path = str(self.DB_PATH).replace("\\", "/")
        return f"sqlite:///{clean_path}"

settings = Settings()
