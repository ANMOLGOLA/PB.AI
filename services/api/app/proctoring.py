import base64
import os
import json
import uuid
import cv2
import numpy as np
from typing import Dict, Any, List, Tuple, Optional
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
    Tuned to avoid false positives during natural on-screen reading.
    Returns: (gaze_label, is_looking_at_screen)
    """
    dx_eye = abs(l_eye[0] - r_eye[0])
    if dx_eye < 1e-4:
        return "UNKNOWN", False

    eye_center_x = (r_eye[0] + l_eye[0]) / 2.0
    yaw_offset = (nose[0] - eye_center_x) / dx_eye

    # Relaxed horizontal yaw threshold: candidate can comfortably read across wide displays
    if yaw_offset > 0.38:
        return "LOOKING_RIGHT", False
    elif yaw_offset < -0.38:
        return "LOOKING_LEFT", False

    eye_center_y = (r_eye[1] + l_eye[1]) / 2.0
    d_eye_nose = abs(nose[1] - eye_center_y)
    d_nose_mouth = abs(mouth[1] - nose[1])
    pitch_ratio = d_eye_nose / (d_nose_mouth + 1e-4)

    # Relaxed pitch threshold: candidate can look down at answers without false alerts
    if pitch_ratio < 0.38:
        return "LOOKING_UP", False
    elif pitch_ratio > 1.85:
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


def scan_earpiece_and_audio_devices(
    frame: np.ndarray,
    ear_points: List[Dict[str, int]],
    face_box: Dict[str, int]
) -> Dict[str, Any]:
    """
    Scans the candidate's auricular/ear regions for concealed earpieces,
    Bluetooth earbuds (AirPods/black buds), or over-ear headset hardware.
    """
    h, w, _ = frame.shape
    earpiece_found = False
    detected_side = None
    ear_boxes: List[Dict[str, int]] = []

    try:
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)

        bw = max(15, int(face_box.get("width", 100) * 0.16))
        bh = max(18, int(face_box.get("height", 120) * 0.20))

        for ear in ear_points:
            ex, ey = ear["x"], ear["y"]
            x1 = max(0, ex - bw)
            x2 = min(w, ex + bw)
            y1 = max(0, ey - bh)
            y2 = min(h, ey + bh)

            if x2 > x1 and y2 > y1:
                ear_boxes.append({"x": x1, "y": y1, "width": x2 - x1, "height": y2 - y1, "name": ear.get("name", "ear")})
                ear_crop_gray = gray[y1:y2, x1:x2]
                ear_crop_hsv = hsv[y1:y2, x1:x2]

                # Check 1: Stark white plastic device (e.g. White AirPods)
                # Low saturation (<25) + High brightness (>225)
                white_plastic = cv2.inRange(ear_crop_hsv, np.array([0, 0, 220]), np.array([180, 30, 255]))
                white_ratio = np.sum(white_plastic > 0) / float(white_plastic.size)

                # Check 2: Dark in-ear plastic / rubber bud
                # Very low brightness (<25) with high contrast against ear cavity
                dark_device = cv2.inRange(ear_crop_gray, 0, 28)
                dark_ratio = np.sum(dark_device > 0) / float(dark_device.size)

                # Check 3: High-contrast circular or oval shape (earbud form-factor)
                edges = cv2.Canny(ear_crop_gray, 50, 150)
                edge_density = np.sum(edges > 0) / float(edges.size)

                if (white_ratio > 0.14 or dark_ratio > 0.20) and edge_density > 0.08:
                    earpiece_found = True
                    detected_side = ear.get("name", "ear")
                    break

        return {
            "scanned": len(ear_points) > 0,
            "earpiece_detected": earpiece_found,
            "side": detected_side,
            "ear_boxes": ear_boxes,
            "confidence": 0.94 if earpiece_found else 0.98,
            "details": "Concealed audio earpiece detected in ear canal region" if earpiece_found else "No audio devices or earpieces detected"
        }
    except Exception:
        return {
            "scanned": False,
            "earpiece_detected": False,
            "side": None,
            "ear_boxes": [],
            "confidence": 0.50,
            "details": "Ear scan could not be completed"
        }


def compute_biometric_face_signature(
    frame: np.ndarray,
    keypoints: List[Any],
    bbox: Dict[str, int]
) -> Dict[str, Any]:
    """
    Computes a normalized geometric and texture biometric face signature
    from MediaPipe landmark keypoints to enforce candidate identity verification.
    """
    try:
        h, w, _ = frame.shape
        # Keypoints: [0: r_eye, 1: l_eye, 2: nose, 3: mouth, 4: r_ear, 5: l_ear]
        pts = [(kp.x, kp.y) for kp in keypoints]
        r_eye = pts[0]
        l_eye = pts[1]
        nose = pts[2]
        mouth = pts[3]

        # Normalized inter-ocular baseline distance
        iod = np.hypot(l_eye[0] - r_eye[0], l_eye[1] - r_eye[1])
        if iod < 1e-4:
            iod = 1e-4

        # Invariant geometric proportions
        r_eye_nose = np.hypot(nose[0] - r_eye[0], nose[1] - r_eye[1]) / iod
        l_eye_nose = np.hypot(nose[0] - l_eye[0], nose[1] - l_eye[1]) / iod
        nose_mouth = np.hypot(mouth[0] - nose[0], mouth[1] - nose[1]) / iod
        face_ratio = float(bbox["height"]) / max(1.0, float(bbox["width"]))

        ear_r_dist = 0.0
        ear_l_dist = 0.0
        if len(pts) >= 6:
            ear_r_dist = np.hypot(pts[4][0] - r_eye[0], pts[4][1] - r_eye[1]) / iod
            ear_l_dist = np.hypot(pts[5][0] - l_eye[0], pts[5][1] - l_eye[1]) / iod

        geom_vector = [
            round(float(r_eye_nose), 4),
            round(float(l_eye_nose), 4),
            round(float(nose_mouth), 4),
            round(float(face_ratio), 4),
            round(float(ear_r_dist), 4),
            round(float(ear_l_dist), 4),
        ]

        # Normalized face crop grayscale intensity histogram (16 bins)
        bx = max(0, bbox["x"])
        by = max(0, bbox["y"])
        bw = min(w - bx, bbox["width"])
        bh = min(h - by, bbox["height"])
        hist_vector = []
        if bw > 10 and bh > 10:
            face_crop = frame[by:by+bh, bx:bx+bw]
            gray_crop = cv2.cvtColor(face_crop, cv2.COLOR_BGR2GRAY)
            norm_crop = cv2.resize(gray_crop, (32, 32))
            hist = cv2.calcHist([norm_crop], [0], None, [16], [0, 256])
            hist = cv2.normalize(hist, hist).flatten()
            hist_vector = [round(float(v), 4) for v in hist]

        # Generate a unique candidate Face ID token
        unique_token = f"FID-{uuid.uuid4().hex[:8].upper()}"

        return {
            "face_id": unique_token,
            "geom": geom_vector,
            "hist": hist_vector,
            "status": "valid"
        }
    except Exception as exc:
        return {
            "face_id": f"FID-{uuid.uuid4().hex[:8].upper()}",
            "geom": [],
            "hist": [],
            "status": f"error: {str(exc)}"
        }


def verify_face_signature(
    current_sig: Dict[str, Any],
    enrolled_sig_raw: str
) -> Tuple[bool, float]:
    """
    Compares the current face biometric signature against the enrolled Face ID.
    Returns: (is_match: bool, similarity: float)
    """
    try:
        if not enrolled_sig_raw:
            return True, 1.0

        enrolled = json.loads(enrolled_sig_raw) if isinstance(enrolled_sig_raw, str) else enrolled_sig_raw
        if not enrolled or "geom" not in enrolled or not enrolled["geom"]:
            return True, 1.0

        curr_geom = np.array(current_sig.get("geom", []), dtype=float)
        enr_geom = np.array(enrolled.get("geom", []), dtype=float)

        if len(curr_geom) < 4 or len(enr_geom) < 4:
            return True, 1.0

        # Geometric similarity (Manhattan distance on normalized proportions)
        min_len = min(len(curr_geom), len(enr_geom))
        geom_dist = np.mean(np.abs(curr_geom[:min_len] - enr_geom[:min_len]))
        geom_sim = max(0.0, 1.0 - (geom_dist / 0.55))

        # Histogram texture similarity (cosine similarity)
        curr_hist = np.array(current_sig.get("hist", []), dtype=float)
        enr_hist = np.array(enrolled.get("hist", []), dtype=float)
        hist_sim = 1.0
        if len(curr_hist) == len(enr_hist) and len(curr_hist) > 0:
            norm_c = np.linalg.norm(curr_hist)
            norm_e = np.linalg.norm(enr_hist)
            if norm_c > 1e-4 and norm_e > 1e-4:
                hist_sim = max(0.0, float(np.dot(curr_hist, enr_hist) / (norm_c * norm_e)))

        combined_similarity = round(float(0.65 * geom_sim + 0.35 * hist_sim), 3)
        # Threshold: > 0.62 is verified same person
        is_match = combined_similarity >= 0.62
        return is_match, combined_similarity
    except Exception:
        return True, 1.0


def analyze_camera_frame(
    image_base64: str,
    enrolled_signature: Optional[str] = None
) -> Dict[str, Any]:
    """
    Decodes a base64 camera frame and performs deep-learning computer vision face analysis.
    Extracts face count, bounding boxes, eye keypoints, ear keypoints, gaze orientation,
    eyewear checks, earpiece detection, and biometric Face ID anti-impersonation verification.
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
                "ears": [],
                "eyewear_detected": False,
                "earpiece_detected": False,
                "ear_scan": {"scanned": False, "earpiece_detected": False},
                "face_id_match": True,
                "face_id_similarity": 1.0,
                "face_signature": None
            }

        h, w, _ = frame.shape
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

        # 1. Primary Deep-Learning Detection via MediaPipe BlazeFace
        results = mp_detector.process(rgb_frame)

        bounding_boxes: List[Dict[str, int]] = []
        gaze_direction = "CENTER"
        looking_at_screen = True
        eye_points: List[Dict[str, int]] = []
        ear_points: List[Dict[str, int]] = []
        computed_sig: Optional[Dict[str, Any]] = None

        if results.detections:
            for idx, detection in enumerate(results.detections):
                bbox_rel = detection.location_data.relative_bounding_box
                bx = max(0, int(bbox_rel.xmin * w))
                by = max(0, int(bbox_rel.ymin * h))
                bw = min(w - bx, int(bbox_rel.width * w))
                bh = min(h - by, int(bbox_rel.height * h))
                curr_box = {
                    "x": bx,
                    "y": by,
                    "width": bw,
                    "height": bh
                }
                bounding_boxes.append(curr_box)

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

                    # Extract ear keypoints if available (MediaPipe BlazeFace kps 4 & 5)
                    if len(kps) >= 6:
                        ear_points = [
                            {"x": int(kps[4].x * w), "y": int(kps[4].y * h), "name": "right_ear"},
                            {"x": int(kps[5].x * w), "y": int(kps[5].y * h), "name": "left_ear"}
                        ]

                    computed_sig = compute_biometric_face_signature(frame, kps, curr_box)

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

        # 4. Scan ear regions for earpiece / audio hardware
        ear_scan_result = {"scanned": False, "earpiece_detected": False}
        if bounding_boxes and ear_points:
            ear_scan_result = scan_earpiece_and_audio_devices(frame, ear_points, bounding_boxes[0])

        # 5. Biometric Face ID verification (Anti-impersonation)
        face_id_match = True
        face_id_similarity = 1.0
        if enrolled_signature and computed_sig:
            face_id_match, face_id_similarity = verify_face_signature(computed_sig, enrolled_signature)

        if face_count == 1:
            if not face_id_match:
                status = "face_mismatch"
                confidence = 0.92
            else:
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
            "ears": ear_points,
            "eyewear_detected": eyewear_detected,
            "earpiece_detected": ear_scan_result.get("earpiece_detected", False),
            "ear_scan": ear_scan_result,
            "face_id_match": face_id_match,
            "face_id_similarity": face_id_similarity,
            "face_signature": computed_sig,
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
            "ears": [],
            "eyewear_detected": False,
            "earpiece_detected": False,
            "ear_scan": {"scanned": False, "earpiece_detected": False},
            "face_id_match": True,
            "face_id_similarity": 1.0,
            "face_signature": None
        }
