from datetime import datetime, timezone
from typing import Dict, Any, Optional
import uuid
from pydantic import BaseModel, Field


class UnifiedEvent(BaseModel):
    """
    Canonical standardized representation of all behavioral and security telemetry events.
    Format: {id, session_id, ts, type, severity, confidence, source, metadata}
    """
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    session_id: str
    ts: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    type: str  # e.g., TAB_BLUR, EXTERNAL_NAVIGATION, AI_QUERY, NO_FACE_DETECTED, etc.
    severity: str = "info"  # info, low, medium, high, critical
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)
    source: str = "system"  # browser_agent, electron_main, cv_engine, web_telemetry, etc.
    metadata: Dict[str, Any] = Field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "session_id": self.session_id,
            "ts": self.ts.isoformat(),
            "type": self.type,
            "severity": self.severity,
            "confidence": self.confidence,
            "source": self.source,
            "metadata": self.metadata
        }
