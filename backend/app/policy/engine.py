from typing import Dict, Any, Optional
from sqlalchemy.orm import Session
from app.config import settings
from app.models import ExamSession, IntegrityEvent
from app.policy.risk_scorer import calculate_explainable_risk
from app.policy.event_model import UnifiedEvent


class PolicyEngine:
    """
    Three-tier policy enforcement engine:
    1. LOG: Telemetry recorded in audit trail and streamed to examiner dashboard.
    2. WARN: Warning dispatched to candidate client upon reaching warning threshold.
    3. AUTO_SUBMIT: Session automatically finalized and graded when violation limit is reached.
    """

    def __init__(self):
        self.warn_threshold = getattr(settings, "POLICY_WARN_THRESHOLD", 3)
        self.auto_submit_threshold = getattr(settings, "POLICY_AUTO_SUBMIT_THRESHOLD", 5)
        self.critical_score_threshold = getattr(settings, "POLICY_CRITICAL_SCORE_THRESHOLD", 85)

    def evaluate(self, db: Session, session_id: str, new_event: Optional[UnifiedEvent] = None) -> Dict[str, Any]:
        """
        Evaluates active session telemetry against configured policies.
        Returns policy verdict: action ('log', 'warn', 'auto_submit'), risk score, and warning state.
        """
        exam_session = db.query(ExamSession).filter(ExamSession.id == session_id).first()
        if not exam_session:
            return {"action": "log", "reason": "Session not found", "risk_score": {}}

        events = (
            db.query(IntegrityEvent)
            .filter(IntegrityEvent.session_id == session_id)
            .order_by(IntegrityEvent.occurred_at.asc())
            .all()
        )

        risk_report = calculate_explainable_risk(events)
        overall_score = risk_report["overall_score"]

        # Count warning-eligible events (medium, high, critical)
        warning_events = [e for e in events if e.severity in ("medium", "high", "critical")]
        warning_count = len(warning_events)

        action = "log"
        warning_message = None

        if exam_session.status == "submitted":
            action = "log"
        elif warning_count >= self.auto_submit_threshold or overall_score >= self.critical_score_threshold:
            action = "auto_submit"
            warning_message = (
                f"Assessment auto-submitted: Exceeded maximum integrity violations threshold "
                f"({warning_count}/{self.auto_submit_threshold} violations, risk score: {overall_score}/100)."
            )
        elif warning_count >= self.warn_threshold or (new_event and new_event.severity in ("high", "critical")):
            action = "warn"
            warning_message = (
                f"Integrity Warning ({warning_count}/{self.auto_submit_threshold}): "
                f"Suspicious activity observed. Continued violations will trigger automated submission."
            )

        return {
            "action": action,
            "session_id": session_id,
            "warning_count": warning_count,
            "warn_threshold": self.warn_threshold,
            "auto_submit_threshold": self.auto_submit_threshold,
            "warning_message": warning_message,
            "risk_score": risk_report
        }


global_policy_engine = PolicyEngine()
