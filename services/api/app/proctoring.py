import base64
import os
import cv2
import numpy as np
from typing import Dict, Any, List, Tuple
import mediapipe as mp

# MediaPipe deep-learning BlazeFace detector
mp_face_detection = mp.solutions.face_detection
mp_detector = mp_face_detection.FaceDetection(
    model_selection=0,
    min_detection_confidence=0.35
)

profile_cascade_path = os.path.join(cv2.data.haarcascades, "haarcascade_profileface.xml")
profile_cascade = cv2.CascadeClassifier(profile_cascade_path)


def estimate_gaze_direction(
    r_eye: Tuple[float, float],
    l_eye: Tuple[float, float],
    nose: Tuple[float, float],
    mouth: Tuple[float, float]
) -> Tuple[str, bool]:
    """
    Estimates candidate's head pose & eye gaze direction relative to the screen.
    Returns: (gaze_label, is_looking_at_screen)
    """
    dx_eye = abs(l_eye[0] - r_eye[0])
    if dx_eye < 1e-4:
        return "UNKNOWN", False

    eye_center_x = (r_eye[0] + l_eye[0]) / 2.0
    yaw_offset = (nose[0] - eye_center_x) / dx_eye

    if yaw_offset > 0.18:
        return "LOOKING_RIGHT", False
    elif yaw_offset < -0.18:
        return "LOOKING_LEFT", False

    eye_center_y = (r_eye[1] + l_eye[1]) / 2.0
    d_eye_nose = abs(nose[1] - eye_center_y)
    d_nose_mouth = abs(mouth[1] - nose[1])
    pitch_ratio = d_eye_nose / (d_nose_mouth + 1e-4)

    if pitch_ratio < 0.60:
        return "LOOKING_UP", False
    elif pitch_ratio > 1.45:
        return "LOOKING_DOWN", False

    return "CENTER", True


def check_dark_eyewear(frame: np.ndarray, eye_coords: List[Dict[str, int]]) -> bool:
    """Detects whether candidate is wearing dark sunglasses or tinted eyewear."""
    try:
        h, w, _ = frame.shape
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        dark_eyes = 0
        for eye in eye_coords:
            ex, ey = eye["x"], eye["y"]
            r_w = max(5, int(w * 0.035))
            r_h = max(5, int(h * 0.025))
            x1 = max(0, ex - r_w)
            x2 = min(w, ex + r_w)
            y1 = max(0, ey - r_h)
            y2 = min(h, ey + r_h)
            if x2 > x1 and y2 > y1:
                patch = gray[y1:y2, x1:x2]
                if np.mean(patch) < 45:
                    dark_eyes += 1
        return dark_eyes >= 2
    except Exception:
        return False


def analyze_camera_frame(image_base64: str) -> Dict[str, Any]:
    """
    Decodes a base64 camera frame and performs deep-learning computer vision face analysis.
    Extracts face count, bounding boxes, eye keypoints, gaze orientation, and eyewear checks.
    """
    try:
        if "," in image_base64:
            image_base64 = image_base64.split(",", 1)[1]

        image_bytes = base64.b64decode(image_base64)
        np_arr = np.frombuffer(image_bytes, np.uint8)
        frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

        if frame is None:
            return {
                "face_detected": False,
                "face_count": 0,
                "confidence": 0.0,
                "status": "invalid_frame",
                "bounding_boxes": [],
                "gaze_direction": "UNKNOWN",
                "looking_at_screen": False,
                "eyes": [],
                "eyewear_detected": False
            }

        h, w, _ = frame.shape
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

        # 1. Primary Deep-Learning Detection via MediaPipe BlazeFace
        results = mp_detector.process(rgb_frame)

        bounding_boxes: List[Dict[str, int]] = []
        gaze_direction = "CENTER"
        looking_at_screen = True
        eye_points: List[Dict[str, int]] = []

        if results.detections:
            for idx, detection in enumerate(results.detections):
                bbox_rel = detection.location_data.relative_bounding_box
                bx = max(0, int(bbox_rel.xmin * w))
                by = max(0, int(bbox_rel.ymin * h))
                bw = min(w - bx, int(bbox_rel.width * w))
                bh = min(h - by, int(bbox_rel.height * h))
                bounding_boxes.append({
                    "x": bx,
                    "y": by,
                    "width": bw,
                    "height": bh
                })

                # Extract keypoints from the primary candidate face
                if idx == 0 and len(detection.location_data.relative_keypoints) >= 4:
                    kps = detection.location_data.relative_keypoints
                    r_eye = (kps[0].x, kps[0].y)
                    l_eye = (kps[1].x, kps[1].y)
                    nose = (kps[2].x, kps[2].y)
                    mouth = (kps[3].x, kps[3].y)

                    gaze_direction, looking_at_screen = estimate_gaze_direction(r_eye, l_eye, nose, mouth)

                    eye_points = [
                        {"x": int(r_eye[0] * w), "y": int(r_eye[1] * h), "name": "right_eye"},
                        {"x": int(l_eye[0] * w), "y": int(l_eye[1] * h), "name": "left_eye"}
                    ]

        face_count = len(bounding_boxes)

        # 2. Check for side/profile face if only 1 face found by frontal detector
        if face_count == 1:
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            profiles = profile_cascade.detectMultiScale(
                gray,
                scaleFactor=1.15,
                minNeighbors=4,
                minSize=(35, 35)
            )
            primary = bounding_boxes[0]
            c1 = (primary["x"] + primary["width"] / 2, primary["y"] + primary["height"] / 2)

            for (px, py, pw, ph) in profiles:
                c2 = (px + pw / 2, py + ph / 2)
                dist = np.hypot(c1[0] - c2[0], c1[1] - c2[1])
                if dist > max(primary["width"], primary["height"]) * 0.7:
                    bounding_boxes.append({
                        "x": int(px),
                        "y": int(py),
                        "width": int(pw),
                        "height": int(ph)
                    })
                    face_count += 1

        # 3. Check for dark/tinted eyewear on candidate
        eyewear_detected = check_dark_eyewear(frame, eye_points) if eye_points else False

        if face_count == 1:
            status = "verified"
            confidence = 0.98
        elif face_count == 0:
            status = "no_face"
            confidence = 0.95
            looking_at_screen = False
            gaze_direction = "NO_FACE"
        else:
            status = "multiple_faces"
            confidence = 0.96

        return {
            "face_detected": face_count > 0,
            "face_count": face_count,
            "confidence": confidence,
            "status": status,
            "bounding_boxes": bounding_boxes,
            "gaze_direction": gaze_direction,
            "looking_at_screen": looking_at_screen,
            "eyes": eye_points,
            "eyewear_detected": eyewear_detected,
            "frame_width": w,
            "frame_height": h
        }
    except Exception as exc:
        return {
            "face_detected": False,
            "face_count": 0,
            "confidence": 0.0,
            "status": f"error: {str(exc)}",
            "bounding_boxes": [],
            "gaze_direction": "ERROR",
            "looking_at_screen": False,
            "eyes": [],
            "eyewear_detected": False
        }
