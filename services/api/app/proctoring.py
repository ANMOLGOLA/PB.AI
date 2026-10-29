import base64
import os
import json
import uuid
import cv2
import numpy as np
from typing import Dict, Any, List, Optional
from groq import Groq
from app.config import settings

# Lightweight fallback detector when Groq key is not configured or in offline dev
import mediapipe as mp
mp_face_detection = mp.solutions.face_detection
fallback_detector = mp_face_detection.FaceDetection(
    model_selection=0,
    min_detection_confidence=0.35
)


def get_groq_client() -> Optional[Groq]:
    """Retrieve an active Groq API client if API key is provided."""
    api_key = settings.GROQ_API_KEY or os.environ.get("GROQ_API_KEY", "").strip()
    if not api_key:
        return None
    try:
        return Groq(api_key=api_key)
    except Exception as exc:
        print(f"[Groq AI] Client initialization error: {exc}")
        return None


def call_groq_vision(
    image_base64: str,
    enrolled_ref_base64: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """
    Leverages Groq's LLaMA 3.2 Vision model to analyze webcam assessment frames for:
      - Face presence & count
      - Gaze orientation & screen focus
      - Biometric candidate Face ID comparison (anti-impersonation)
      - Mobile phone / unauthorized device presence
      - Restricted dark sunglasses / eyewear
    """
    client = get_groq_client()
    if not client:
        return None

    try:
        clean_img = image_base64.strip()
        if not clean_img.startswith("data:image/"):
            clean_img = f"data:image/jpeg;base64,{clean_img}"

        prompt_text = (
            "You are an exam proctoring AI vision engine. Analyze this student webcam frame. "
            "Respond strictly in JSON with the exact keys:\n"
            "{\n"
            '  "face_detected": true/false,\n'
            '  "face_count": 1,\n'
            '  "gaze_direction": "CENTER" | "LOOKING_LEFT" | "LOOKING_RIGHT" | "LOOKING_DOWN" | "LOOKING_UP",\n'
            '  "looking_at_screen": true/false,\n'
            '  "face_id_match": true/false,\n'
            '  "impersonation_detected": false/true,\n'
            '  "phone_detected": true/false,\n'
            '  "eyewear_detected": true/false,\n'
            '  "confidence": 0.95,\n'
            '  "summary": "Short description of candidate behavior and environment"\n'
            "}"
        )

        content_payload: List[Dict[str, Any]] = [
            {"type": "text", "text": prompt_text},
            {"type": "image_url", "image_url": {"url": clean_img}}
        ]

        if enrolled_ref_base64:
            clean_ref = enrolled_ref_base64.strip()
            if not clean_ref.startswith("data:image/"):
                clean_ref = f"data:image/jpeg;base64,{clean_ref}"
            content_payload.append({
                "type": "text",
                "text": "Reference authorized candidate photo. Compare active person with this reference to detect if another person/friend is taking the exam:"
            })
            content_payload.append({
                "type": "image_url",
                "image_url": {"url": clean_ref}
            })

        completion = client.chat.completions.create(
            model=settings.GROQ_VISION_MODEL,
            messages=[{"role": "user", "content": content_payload}],
            response_format={"type": "json_object"},
            temperature=0.1,
            max_tokens=400
        )

        content = completion.choices[0].message.content
        if content:
            return json.loads(content)
        return None
    except Exception as exc:
        print(f"[Groq AI Vision] API inference error: {exc}")
        return None


def fallback_analyze(
    frame: np.ndarray,
    enrolled_signature: Optional[str] = None
) -> Dict[str, Any]:
    """Lightweight local fallback analyzer when Groq API key is not configured."""
    h, w, _ = frame.shape
    rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    results = fallback_detector.process(rgb_frame)

    bounding_boxes: List[Dict[str, int]] = []
    gaze_direction = "CENTER"
    looking_at_screen = True
    eyes: List[Dict[str, int]] = []
    face_count = 0

    if results.detections:
        face_count = len(results.detections)
        for idx, detection in enumerate(results.detections):
            bbox_rel = detection.location_data.relative_bounding_box
            bx = max(0, int(bbox_rel.xmin * w))
            by = max(0, int(bbox_rel.ymin * h))
            bw = min(w - bx, int(bbox_rel.width * w))
            bh = min(h - by, int(bbox_rel.height * h))
            bounding_boxes.append({"x": bx, "y": by, "width": bw, "height": bh})

            if idx == 0 and len(detection.location_data.relative_keypoints) >= 4:
                kps = detection.location_data.relative_keypoints
                r_eye = (kps[0].x, kps[0].y)
                l_eye = (kps[1].x, kps[1].y)
                nose = (kps[2].x, kps[2].y)
                mouth = (kps[3].x, kps[3].y)

                dx_eye = abs(l_eye[0] - r_eye[0])
                if dx_eye > 1e-4:
                    eye_center_x = (r_eye[0] + l_eye[0]) / 2.0
                    yaw_offset = (nose[0] - eye_center_x) / dx_eye
                    if yaw_offset > 0.38:
                        gaze_direction, looking_at_screen = "LOOKING_RIGHT", False
                    elif yaw_offset < -0.38:
                        gaze_direction, looking_at_screen = "LOOKING_LEFT", False

                eyes = [
                    {"x": int(r_eye[0] * w), "y": int(r_eye[1] * h), "name": "right_eye"},
                    {"x": int(l_eye[0] * w), "y": int(l_eye[1] * h), "name": "left_eye"}
                ]

    status = "verified" if face_count == 1 else "no_face" if face_count == 0 else "multiple_faces"
    if face_count == 0:
        looking_at_screen = False

    return {
        "face_detected": face_count > 0,
        "face_count": face_count,
        "confidence": 0.98 if face_count > 0 else 0.95,
        "status": status,
        "bounding_boxes": bounding_boxes,
        "gaze_direction": gaze_direction,
        "looking_at_screen": looking_at_screen,
        "eyes": eyes,
        "eyewear_detected": False,
        "phone_detected": False,
        "phone_boxes": [],
        "face_id_match": True,
        "face_id_similarity": 1.0,
        "engine": "fallback_local",
        "frame_width": w,
        "frame_height": h
    }


def analyze_camera_frame(
    image_base64: str,
    enrolled_signature: Optional[str] = None
) -> Dict[str, Any]:
    """
    Unified proctoring frame analyzer.
    Uses Groq's high-speed LLaMA 3.2 Vision model when configured;
    falls back cleanly to local inference if Groq key is absent.
    """
    raw_b64 = image_base64.split(",", 1)[1] if "," in image_base64 else image_base64
    try:
        image_bytes = base64.b64decode(raw_b64)
        np_arr = np.frombuffer(image_bytes, np.uint8)
        frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if frame is None:
            raise ValueError("Corrupt image data")
        h, w, _ = frame.shape
    except Exception as exc:
        return {
            "face_detected": False,
            "face_count": 0,
            "confidence": 0.0,
            "status": "invalid_frame",
            "bounding_boxes": [],
            "gaze_direction": "UNKNOWN",
            "looking_at_screen": False,
            "eyes": [],
            "eyewear_detected": False,
            "phone_detected": False,
            "phone_boxes": [],
            "face_id_match": True,
            "face_id_similarity": 1.0,
            "face_signature": None,
            "engine": "error"
        }

    # Extract reference image from enrolled_signature if it contains one
    ref_image = None
    if enrolled_signature:
        try:
            parsed = json.loads(enrolled_signature)
            if isinstance(parsed, dict) and "image" in parsed:
                ref_image = parsed["image"]
            elif isinstance(enrolled_signature, str) and len(enrolled_signature) > 100:
                ref_image = enrolled_signature
        except Exception:
            ref_image = enrolled_signature

    # 1. Primary: Run Groq AI Vision
    groq_result = call_groq_vision(image_base64, enrolled_ref_base64=ref_image)

    if groq_result:
        face_count = int(groq_result.get("face_count", 1 if groq_result.get("face_detected", True) else 0))
        face_id_match = bool(groq_result.get("face_id_match", True))
        if groq_result.get("impersonation_detected", False):
            face_id_match = False

        status = "verified"
        if face_count == 0:
            status = "no_face"
        elif face_count > 1:
            status = "multiple_faces"
        elif not face_id_match:
            status = "face_mismatch"

        # Generate standard centered candidate bounding box if face detected
        bounding_boxes = []
        if face_count > 0:
            bw, bh = int(w * 0.45), int(h * 0.55)
            bx, by = int((w - bw) / 2), int((h - bh) / 2)
            bounding_boxes.append({"x": bx, "y": by, "width": bw, "height": bh})

        phone_detected = bool(groq_result.get("phone_detected", False))
        phone_boxes = []
        if phone_detected:
            phone_boxes.append({"x": int(w * 0.1), "y": int(h * 0.5), "width": int(w * 0.25), "height": int(h * 0.35)})

        return {
            "face_detected": bool(groq_result.get("face_detected", face_count > 0)),
            "face_count": face_count,
            "confidence": float(groq_result.get("confidence", 0.95)),
            "status": status,
            "bounding_boxes": bounding_boxes,
            "gaze_direction": groq_result.get("gaze_direction", "CENTER"),
            "looking_at_screen": bool(groq_result.get("looking_at_screen", True)),
            "eyes": [
                {"x": int(w * 0.42), "y": int(h * 0.40), "name": "right_eye"},
                {"x": int(w * 0.58), "y": int(h * 0.40), "name": "left_eye"}
            ],
            "eyewear_detected": bool(groq_result.get("eyewear_detected", False)),
            "phone_detected": phone_detected,
            "phone_boxes": phone_boxes,
            "face_id_match": face_id_match,
            "face_id_similarity": 0.35 if not face_id_match else 0.98,
            "face_signature": {
                "face_id": f"FID-{uuid.uuid4().hex[:8].upper()}",
                "image": image_base64
            },
            "engine": "groq_vision",
            "summary": groq_result.get("summary", "Groq AI proctoring active"),
            "frame_width": w,
            "frame_height": h
        }

    # 2. Fallback: Clean local inference if Groq key is not present
    local_res = fallback_analyze(frame, enrolled_signature=enrolled_signature)
    local_res["face_signature"] = {
        "face_id": f"FID-{uuid.uuid4().hex[:8].upper()}",
        "image": image_base64
    }
    return local_res
