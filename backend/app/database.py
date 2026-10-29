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
    import app.models  # noqa: F401
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

            # Migrate integrity_events table for proctor review status
            ev_cursor = conn.execute(text("PRAGMA table_info(integrity_events)"))
            ev_cols = [row[1] for row in ev_cursor.fetchall()]
            if ev_cols:
                if "review_status" not in ev_cols:
                    conn.execute(text("ALTER TABLE integrity_events ADD COLUMN review_status VARCHAR(30) DEFAULT 'unreviewed'"))
                if "review_notes" not in ev_cols:
                    conn.execute(text("ALTER TABLE integrity_events ADD COLUMN review_notes TEXT"))
                if "reviewed_by" not in ev_cols:
                    conn.execute(text("ALTER TABLE integrity_events ADD COLUMN reviewed_by VARCHAR(100)"))
                if "reviewed_at" not in ev_cols:
                    conn.execute(text("ALTER TABLE integrity_events ADD COLUMN reviewed_at DATETIME"))
                conn.commit()
    except Exception:
        pass
