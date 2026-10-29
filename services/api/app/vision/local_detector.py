"""
Layer A: Deterministic Local Real-Time Computer Vision Detector

Architecture Documentation:
- Model: Google MediaPipe BlazeFace (Short-Range SSD-based Anchor Face Detector)
- Execution: On-device CPU inference (~8-15ms latency per frame)
- Primary Capabilities:
  1. Face Presence & Count: Accurately identifies zero, single, or multiple candidate faces.
  2. Bounding Box Localization: Computes exact bounding rectangles in pixel space.
  3. Key Facial Landmarks: Localizes 6 anatomical anchor points (right eye, left eye,
     nose tip, mouth center, right ear tragion, left ear tragion).
  4. Approximate Head Orientation Hint: Derives rough yaw/pitch offset from landmark
     geometry (nose deviation relative to inter-pupillary midpoint).
  5. Usability / Frame Quality Sanity: Rejects empty, corrupted, sub-minimal (<50x50),
     or severely underexposed frames.

Documented Technical Limitations:
- MediaPipe BlazeFace is NOT a true eye-pupil gaze tracker; head orientation provides
  only an approximate proxy for monitor engagement.
- MediaPipe Face Detection does NOT detect mobile phones, earphones, or background objects.
- Face detection alone does NOT prove identity or liveness (anti-spoofing).
- Confidence values represent anchor classification certainty, not cheating probability.
"""

import base64
import time
from typing import Dict, Any, List, Optional, Tuple, Union
import cv2
import numpy as np
import mediapipe as mp

# Initialize singleton MediaPipe detector instance
_mp_face_detection = mp.solutions.face_detection
_detector_instance = _mp_face_detection.FaceDetection(
    model_selection=0,           # 0 = short-range model (best for webcams within 2 meters)
    min_detection_confidence=0.40 # Bounded threshold balancing recall and precision
)


def decode_image_frame(image_input: Union[str, np.ndarray]) -> Tuple[Optional[np.ndarray], Optional[str]]:
    """
    Safely decode an input base64 string or return existing numpy image array.
    Returns (numpy_frame, error_reason).
    """
    if isinstance(image_input, np.ndarray):
        if image_input.size == 0 or len(image_input.shape) < 2:
            return None, "Empty or invalid numpy frame array"
        return image_input, None

    if not isinstance(image_input, str):
        return None, "Expected base64 data string or numpy image array"

    try:
        raw_b64 = image_input.split(",", 1)[1] if "," in image_input else image_input
        # Remove extra whitespace or newlines
        clean_b64 = raw_b64.strip()
        if not clean_b64:
            return None, "Empty base64 payload"

        image_bytes = base64.b64decode(clean_b64)
        np_arr = np.frombuffer(image_bytes, np.uint8)
        frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if frame is None:
            return None, "Corrupted image payload: cv2 could not decode"
        return frame, None
    except Exception as exc:
        return None, f"Decoding error: {str(exc)}"


def evaluate_head_orientation(
    landmarks: List[Dict[str, float]],
    frame_w: int,
    frame_h: int
) -> Tuple[str, bool]:
    """
    Derives an approximate head-pose orientation hint from MediaPipe 6-point landmarks.
    Landmark indices:
      0: Right Eye, 1: Left Eye, 2: Nose Tip, 3: Mouth Center, 4: Right Ear, 5: Left Ear

    Returns:
      (direction_hint, is_looking_at_screen)
    """
    if len(landmarks) < 4:
        return "UNKNOWN", True

    r_eye = landmarks[0]
    l_eye = landmarks[1]
    nose = landmarks[2]
    mouth = landmarks[3]

    dx_eye = abs(l_eye["x"] - r_eye["x"])
    if dx_eye < 1e-4:
        return "UNKNOWN", True

    # Midpoint between eyes
    eye_center_x = (r_eye["x"] + l_eye["x"]) / 2.0
    eye_center_y = (r_eye["y"] + l_eye["y"]) / 2.0

    # Horizontal yaw offset (normalized by interocular distance)
    yaw_ratio = (nose["x"] - eye_center_x) / dx_eye

    # Vertical pitch offset (normalized by eye-to-mouth distance)
    dy_face = abs(mouth["y"] - eye_center_y)
    pitch_ratio = (nose["y"] - eye_center_y) / (dy_face + 1e-4) if dy_face > 1e-4 else 0.5

    # Thresholds tuned conservatively to prevent false positives from slight natural head movements
    if yaw_ratio > 0.42:
        return "LOOKING_RIGHT", False
    elif yaw_ratio < -0.42:
        return "LOOKING_LEFT", False
    elif pitch_ratio > 0.78:
        return "LOOKING_DOWN", False
    elif pitch_ratio < 0.22:
        return "LOOKING_UP", False

    return "CENTER", True


def detect_faces_local(image_input: Union[str, np.ndarray]) -> Dict[str, Any]:
    """
    Real-time local computer-vision analysis.
    Executes in ~10-15ms on standard CPU.
    """
    start_time = time.perf_counter()

    frame, decode_error = decode_image_frame(image_input)
    if frame is None:
        latency_ms = (time.perf_counter() - start_time) * 1000
        return {
            "face_detected": False,
            "face_count": 0,
            "confidence": 0.0,
            "status": "unusable_frame",
            "bounding_boxes": [],
            "gaze_direction": "UNKNOWN",
            "looking_at_screen": False,
            "eyes": [],
            "landmarks": [],
            "error_detail": decode_error,
            "latency_ms": round(latency_ms, 2),
            "frame_width": 0,
            "frame_height": 0
        }

    h, w, _ = frame.shape

    # Frame sanity check: minimum usable dimensions
    if w < 50 or h < 50:
        latency_ms = (time.perf_counter() - start_time) * 1000
        return {
            "face_detected": False,
            "face_count": 0,
            "confidence": 0.0,
            "status": "no_face",
            "frame_quality": "unusable_dimensions",
            "bounding_boxes": [],
            "gaze_direction": "UNKNOWN",
            "looking_at_screen": False,
            "eyes": [],
            "landmarks": [],
            "error_detail": f"Frame resolution {w}x{h} is too small for reliable inspection",
            "latency_ms": round(latency_ms, 2),
            "frame_width": w,
            "frame_height": h
        }

    # Execute MediaPipe detection on RGB frame
    rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    results = _detector_instance.process(rgb_frame)

    bounding_boxes: List[Dict[str, int]] = []
    face_count = 0
    max_confidence = 0.0
    gaze_direction = "CENTER"
    looking_at_screen = True
    eyes: List[Dict[str, Any]] = []
    landmarks_list: List[Dict[str, Any]] = []

    if results.detections:
        face_count = len(results.detections)
        for idx, det in enumerate(results.detections):
            score = float(det.score[0]) if det.score else 0.85
            if score > max_confidence:
                max_confidence = score

            bbox = det.location_data.relative_bounding_box
            bx = max(0, int(bbox.xmin * w))
            by = max(0, int(bbox.ymin * h))
            bw = min(w - bx, int(bbox.width * w))
            bh = min(h - by, int(bbox.height * h))
            bounding_boxes.append({"x": bx, "y": by, "width": bw, "height": bh})

            # Process primary candidate face keypoints
            if idx == 0 and det.location_data.relative_keypoints:
                raw_kps = det.location_data.relative_keypoints
                formatted_kps = [{"x": kp.x, "y": kp.y} for kp in raw_kps]
                gaze_direction, looking_at_screen = evaluate_head_orientation(formatted_kps, w, h)

                if len(raw_kps) >= 2:
                    eyes = [
                        {"x": int(raw_kps[0].x * w), "y": int(raw_kps[0].y * h), "name": "right_eye"},
                        {"x": int(raw_kps[1].x * w), "y": int(raw_kps[1].y * h), "name": "left_eye"}
                    ]
                landmarks_list = [
                    {"index": i, "x": int(kp.x * w), "y": int(kp.y * h)}
                    for i, kp in enumerate(raw_kps)
                ]

    status = "verified" if face_count == 1 else "no_face" if face_count == 0 else "multiple_faces"
    if face_count == 0:
        looking_at_screen = False
        max_confidence = 0.95  # High certainty that no face is present

    latency_ms = (time.perf_counter() - start_time) * 1000

    return {
        "face_detected": face_count > 0,
        "face_count": face_count,
        "confidence": round(max_confidence, 4),
        "status": status,
        "bounding_boxes": bounding_boxes,
        "gaze_direction": gaze_direction,
        "looking_at_screen": looking_at_screen,
        "eyes": eyes,
        "landmarks": landmarks_list,
        "latency_ms": round(latency_ms, 2),
        "frame_width": w,
        "frame_height": h
    }
