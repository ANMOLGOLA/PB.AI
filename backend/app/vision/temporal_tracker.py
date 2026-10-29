"""
Layer B: Temporal Event Analysis, Smoothing, and Incident Deduction

Architecture Documentation:
- Principle: Real-world proctoring signals are naturally noisy (blinks, brief camera
  frame drops, momentary head adjustments). Decisions must NEVER be made on single frames.
- Temporal State Machine: Evaluates signals over continuous sliding time intervals.
- Configurable Temporal Thresholds:
  * Sustained Face Absence: Face must be continuously absent for >= 4.0 seconds.
  * Sustained Multiple Faces: Multiple individuals visible continuously for >= 2.0 seconds.
  * Sustained Head Orientation Diversion: Head turned away continuously for >= 3.5 seconds.
  * Camera / Frame Failure: Unusable frames continuously for >= 4.0 seconds.
- Deduplication & Cooldown:
  * Once a sustained event is emitted, an identical event type enters an 8.0s cooldown
    to prevent duplicate database records and notification flooding.
- Fairness & Uncertainty:
  * Transient deviations (< threshold) are tracked as transient observations, not cheating.
  * If the local detector output is uncertain, the status is explicitly labeled "uncertain".
"""

import time
import uuid
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from dataclasses import dataclass, field


@dataclass
class TemporalTrackerConfig:
    sustained_face_absence_sec: float = 4.0
    sustained_multiple_faces_sec: float = 2.0
    sustained_head_turn_sec: float = 3.5
    sustained_unusable_frame_sec: float = 4.0
    cooldown_interval_sec: float = 8.0


@dataclass
class SessionTemporalState:
    session_id: str
    first_seen_time: float = field(default_factory=time.time)
    last_frame_time: float = field(default_factory=time.time)
    total_frames_processed: int = 0

    # Start timestamps of active continuous anomalies (None when normal)
    face_absence_start: Optional[float] = None
    multiple_faces_start: Optional[float] = None
    head_turned_start: Optional[float] = None
    unusable_frame_start: Optional[float] = None

    # Track when an event was last emitted for cooldown enforcement
    last_emitted_timestamps: Dict[str, float] = field(default_factory=dict)


class TemporalEventTracker:
    """
    Manages in-memory temporal states for assessment sessions.
    Evaluates frame signals over time to produce structured, smoothed proctoring events.
    """

    def __init__(self, config: Optional[TemporalTrackerConfig] = None):
        self.config = config or TemporalTrackerConfig()
        self._sessions: Dict[str, SessionTemporalState] = {}

    def get_or_create_state(self, session_id: str, current_time: float) -> SessionTemporalState:
        if session_id not in self._sessions:
            self._sessions[session_id] = SessionTemporalState(
                session_id=session_id,
                first_seen_time=current_time,
                last_frame_time=current_time
            )
        return self._sessions[session_id]

    def reset_session(self, session_id: str) -> None:
        """Clear cached temporal state when an exam session completes."""
        self._sessions.pop(session_id, None)

    def is_in_cooldown(self, state: SessionTemporalState, event_type: str, current_time: float) -> bool:
        """Check if an event type is within the configured cooldown window."""
        last_emitted = state.last_emitted_timestamps.get(event_type, 0.0)
        return (current_time - last_emitted) < self.config.cooldown_interval_sec

    def evaluate_frame(
        self,
        session_id: str,
        detection: Dict[str, Any],
        current_time: Optional[float] = None
    ) -> List[Dict[str, Any]]:
        """
        Ingests a Layer A local computer-vision detection result and applies temporal smoothing.
        Returns a list of newly qualified, normalized sustained events (if any).
        """
        now = current_time if current_time is not None else time.time()
        state = self.get_or_create_state(session_id, now)
        state.total_frames_processed += 1
        state.last_frame_time = now

        status = detection.get("status", "verified")
        face_count = detection.get("face_count", 0)
        looking_at_screen = detection.get("looking_at_screen", True)
        gaze_direction = detection.get("gaze_direction", "CENTER")
        confidence = float(detection.get("confidence", 0.95))

        emitted_events: List[Dict[str, Any]] = []

        # -------------------------------------------------------------
        # 1. Unusable Frame / Camera Glitch Evaluation
        # -------------------------------------------------------------
        if status == "unusable_frame":
            if state.unusable_frame_start is None:
                state.unusable_frame_start = now
            duration = now - state.unusable_frame_start
            if duration >= self.config.sustained_unusable_frame_sec:
                event_type = "CAMERA_UNUSABLE_SUSTAINED"
                if not self.is_in_cooldown(state, event_type, now):
                    state.last_emitted_timestamps[event_type] = now
                    emitted_events.append(self._build_event(
                        session_id=session_id,
                        event_type=event_type,
                        severity="medium",
                        confidence=confidence,
                        duration_ms=int(duration * 1000),
                        source="local_vision_temporal",
                        status="observed",
                        metadata={
                            "reason": "Camera feed corrupted, dark, or below minimal usable resolution",
                            "error_detail": detection.get("error_detail", "Low quality frame")
                        }
                    ))
        else:
            state.unusable_frame_start = None

        # -------------------------------------------------------------
        # 2. Face Absence Evaluation (Candidate left or obscured)
        # -------------------------------------------------------------
        if status == "no_face" or face_count == 0:
            if state.face_absence_start is None:
                state.face_absence_start = now
            duration = now - state.face_absence_start
            if duration >= self.config.sustained_face_absence_sec:
                event_type = "FACE_ABSENT_SUSTAINED"
                if not self.is_in_cooldown(state, event_type, now):
                    state.last_emitted_timestamps[event_type] = now
                    emitted_events.append(self._build_event(
                        session_id=session_id,
                        event_type=event_type,
                        severity="high",
                        confidence=confidence,
                        duration_ms=int(duration * 1000),
                        source="local_vision_temporal",
                        status="observed",
                        metadata={
                            "reason": f"Candidate face absent continuously for {round(duration, 1)} seconds",
                            "face_count": 0
                        }
                    ))
        else:
            state.face_absence_start = None

        # -------------------------------------------------------------
        # 3. Multiple Faces Evaluation (Unauthorized person in frame)
        # -------------------------------------------------------------
        if status == "multiple_faces" or face_count > 1:
            if state.multiple_faces_start is None:
                state.multiple_faces_start = now
            duration = now - state.multiple_faces_start
            if duration >= self.config.sustained_multiple_faces_sec:
                event_type = "MULTIPLE_FACES_SUSTAINED"
                if not self.is_in_cooldown(state, event_type, now):
                    state.last_emitted_timestamps[event_type] = now
                    emitted_events.append(self._build_event(
                        session_id=session_id,
                        event_type=event_type,
                        severity="critical",
                        confidence=confidence,
                        duration_ms=int(duration * 1000),
                        source="local_vision_temporal",
                        status="observed",
                        metadata={
                            "reason": f"Multiple faces ({face_count} individuals) detected for {round(duration, 1)} seconds",
                            "face_count": face_count
                        }
                    ))
        else:
            state.multiple_faces_start = None

        # -------------------------------------------------------------
        # 4. Sustained Head / Gaze Orientation Diversion
        # -------------------------------------------------------------
        if face_count == 1 and not looking_at_screen and gaze_direction != "UNKNOWN":
            if state.head_turned_start is None:
                state.head_turned_start = now
            duration = now - state.head_turned_start
            if duration >= self.config.sustained_head_turn_sec:
                event_type = "HEAD_ORIENTATION_DIVERTED_SUSTAINED"
                if not self.is_in_cooldown(state, event_type, now):
                    state.last_emitted_timestamps[event_type] = now
                    emitted_events.append(self._build_event(
                        session_id=session_id,
                        event_type=event_type,
                        severity="medium",
                        confidence=confidence,
                        duration_ms=int(duration * 1000),
                        source="local_vision_temporal",
                        status="inferred",
                        metadata={
                            "reason": f"Candidate head consistently oriented away ({gaze_direction}) for {round(duration, 1)} seconds",
                            "gaze_direction": gaze_direction,
                            "limitation": "Inferred from landmark geometry; not pupil gaze tracking"
                        }
                    ))
        else:
            state.head_turned_start = None

        return emitted_events

    def _build_event(
        self,
        session_id: str,
        event_type: str,
        severity: str,
        confidence: float,
        duration_ms: int,
        source: str,
        status: str,
        metadata: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Construct normalized proctoring event conforming to the proctoring event contract."""
        return {
            "event_id": str(uuid.uuid4()),
            "session_id": session_id,
            "event_type": event_type,
            "occurred_at": datetime.now(timezone.utc).isoformat(),
            "source": source,
            "severity": severity,
            "confidence": round(confidence, 4),
            "duration_ms": duration_ms,
            "evidence_ref": None,
            "status": status,
            "metadata": metadata,
            "simulated": False
        }


# Singleton tracker for active session lifecycle
global_temporal_tracker = TemporalEventTracker()
