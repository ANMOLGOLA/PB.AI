from typing import Generator
from sqlalchemy import create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker, Session
from app.config import settings

# Engine setup with SQLite thread safety for FastAPI
engine = create_engine(
    settings.SQLALCHEMY_DATABASE_URI,
    connect_args={"check_same_thread": False},
    echo=False
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db() -> Generator[Session, None, None]:
    """Dependency that provides an active database session and ensures cleanup."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Create all registered database tables if they do not already exist."""
    # Ensure parent directory exists
    settings.DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    Base.metadata.create_all(bind=engine)

    # Lightweight SQLite column schema migration
    try:
        with engine.connect() as conn:
            cursor = conn.execute(text("PRAGMA table_info(sessions)"))
            cols = [row[1] for row in cursor.fetchall()]
            if cols:
                if "face_id" not in cols:
                    conn.execute(text("ALTER TABLE sessions ADD COLUMN face_id VARCHAR(50)"))
                if "face_signature" not in cols:
                    conn.execute(text("ALTER TABLE sessions ADD COLUMN face_signature TEXT"))
                if "is_locked" not in cols:
                    conn.execute(text("ALTER TABLE sessions ADD COLUMN is_locked INTEGER DEFAULT 0"))
                conn.commit()
    except Exception:
        pass
