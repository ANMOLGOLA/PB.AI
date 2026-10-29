from typing import List, Dict, Any
from app.models import IntegrityEvent


def calculate_explainable_risk(events: List[IntegrityEvent]) -> Dict[str, Any]:
    """
    Computes a transparent, explainable 0-100 risk score decomposed into 3 categories:
    1. External Assistance & AI Search (weight: 45%)
    2. Visual & Biometric Integrity (weight: 35%)
    3. Focus & Environment (weight: 20%)
    """
    cat_ai_score = 0
    cat_ai_events = 0
    cat_ai_details = []

    cat_vision_score = 0
    cat_vision_events = 0
    cat_vision_details = []

    cat_focus_score = 0
    cat_focus_events = 0
    cat_focus_details = []

    ai_domains = {"chatgpt.com", "chat.openai.com", "claude.ai", "gemini.google.com", "perplexity.ai"}

    for ev in events:
        etype = (ev.event_type or "").upper()
        meta = ev.metadata_dict if hasattr(ev, "metadata_dict") else {}
        conf = getattr(ev, "confidence", 1.0) or 1.0

        # Category 1: External Assistance & AI Search
        if etype in ("AI_QUERY", "QUERY_SUBMITTED", "EXTERNAL_QUERY_SUBMITTED"):
            cat_ai_events += 1
            query = meta.get("query", "")
            domain = meta.get("domain", "")
            overlap = meta.get("overlap_score", 0.0) or meta.get("similarity_score", 0.0)
            is_seeking = meta.get("likely_answer_seeking", False)
            pts = 20
            if is_seeking:
                pts += 25
            elif overlap and overlap > 0.4:
                pts += int(overlap * 20)
            cat_ai_score += int(pts * conf)
            if is_seeking:
                cat_ai_details.append(f"Likely answer-seeking query on {domain or 'external site'}: '{query[:30]}...' ({int(overlap * 100)}% match)")
            else:
                cat_ai_details.append(f"Query on {domain or 'external site'}: '{query[:30]}...'")

        elif etype in ("DOMAIN_VISIT", "DOMAIN_OPENED", "EXTERNAL_DOMAIN_OPENED"):
            domain = (meta.get("domain") or "").lower()
            cat_ai_events += 1
            if any(aid in domain for aid in ai_domains):
                cat_ai_score += int(15 * conf)
                cat_ai_details.append(f"AI platform visited: {domain}")
            else:
                cat_ai_score += int(5 * conf)
                cat_ai_details.append(f"Search engine visited: {domain}")

        # Category 2: Visual & Biometric Integrity
        elif etype in ("NO_FACE_DETECTED", "FACE_ABSENT_SUSTAINED"):
            cat_vision_events += 1
            cat_vision_score += int(15 * conf)
            dur = meta.get("duration_ms") or meta.get("duration_sec", 0)
            cat_vision_details.append(f"Face absent from frame ({dur}ms)")

        elif etype in ("MULTIPLE_FACES_DETECTED",):
            cat_vision_events += 1
            cat_vision_score += int(25 * conf)
            cat_vision_details.append("Multiple faces detected in camera feed")

        elif etype in ("PHONE_DETECTED", "DEVICE_DETECTED"):
            cat_vision_events += 1
            cat_vision_score += int(35 * conf)
            cat_vision_details.append("Foreign device / mobile phone detected")

        elif etype in ("SUSTAINED_HEAD_TURN", "HEAD_TURNED", "GAZE_AWAY_FROM_SCREEN"):
            cat_vision_events += 1
            cat_vision_score += int(10 * conf)
            cat_vision_details.append("Sustained head turn")

        elif etype in ("CAMERA_BLOCKED",):
            cat_vision_events += 1
            cat_vision_score += int(25 * conf)
            cat_vision_details.append("Webcam feed obstructed or blacked out")

        # Category 3: Focus & Environment
        elif etype in ("WINDOW_BLUR", "TAB_BLUR", "FOCUS_LOST"):
            cat_focus_events += 1
            dur = meta.get("duration_ms") or meta.get("duration_sec", 0)
            pts = 5
            if dur and dur > 10000:
                pts += 5
            cat_focus_score += int(pts * conf)
            cat_focus_details.append("Assessment workspace lost focus")

        elif etype in ("FULLSCREEN_EXIT", "FULLSCREEN_EXIT_ATTEMPT"):
            cat_focus_events += 1
            cat_focus_score += int(15 * conf)
            cat_focus_details.append("Fullscreen exit or window blur attempt")

        elif etype in ("MULTI_DISPLAY_DETECTED",):
            cat_focus_events += 1
            cat_focus_score += int(30 * conf)
            cat_focus_details.append("External auxiliary monitor detected")

        elif etype in ("DUPLICATE_LOGIN_DETECTED", "CONCURRENT_SESSION_DETECTED"):
            cat_focus_events += 1
            cat_focus_score += int(20 * conf)
            cat_focus_details.append("Duplicate or concurrent candidate session detected")

    # Bound individual category contributions
    capped_ai = min(45, cat_ai_score)
    capped_vision = min(35, cat_vision_score)
    capped_focus = min(20, cat_focus_score)

    overall_score = min(100, capped_ai + capped_vision + capped_focus)

    if overall_score >= 85:
        risk_level = "critical"
    elif overall_score >= 60:
        risk_level = "high"
    elif overall_score >= 30:
        risk_level = "moderate"
    else:
        risk_level = "low"

    factors = [
        {
            "category": "External Assistance & AI Search",
            "contribution": capped_ai,
            "max_possible": 45,
            "event_count": cat_ai_events,
            "details": "; ".join(cat_ai_details[:3]) if cat_ai_details else "No unauthorized search activity."
        },
        {
            "category": "Visual & Biometric Integrity",
            "contribution": capped_vision,
            "max_possible": 35,
            "event_count": cat_vision_events,
            "details": "; ".join(cat_vision_details[:3]) if cat_vision_details else "No visual presence anomalies."
        },
        {
            "category": "Focus & Environment",
            "contribution": capped_focus,
            "max_possible": 20,
            "event_count": cat_focus_events,
            "details": "; ".join(cat_focus_details[:3]) if cat_focus_details else "Stable focus on assessment window."
        }
    ]

    # Generate explainable summary
    active_factors = [f for f in factors if f["contribution"] > 0]
    if not active_factors:
        summary = "Assessment integrity normal. Zero suspicious activity detected."
    else:
        top_factor = max(active_factors, key=lambda f: f["contribution"])
        summary = f"Risk level {risk_level.upper()} ({overall_score}/100). Primary driver: {top_factor['category']} ({top_factor['details']})."

    return {
        "overall_score": overall_score,
        "risk_level": risk_level,
        "factors": factors,
        "summary": summary
    }
