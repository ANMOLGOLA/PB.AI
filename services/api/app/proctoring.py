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


def detect_phone_and_foreign_objects(
    frame: np.ndarray,
    face_boxes: List[Dict[str, int]]
) -> Dict[str, Any]:
    """
    Scans the camera frame outside the candidate's face region for unauthorized
    mobile phones, tablets, second screens, or foreign electronic objects.
    """
    try:
        h, w, _ = frame.shape
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

        # Create mask excluding the candidate's face area
        mask = np.ones((h, w), dtype=np.uint8) * 255
        for fb in face_boxes:
            # Expand face box slightly
            fx1 = max(0, fb["x"] - 20)
            fy1 = max(0, fb["y"] - 20)
            fx2 = min(w, fb["x"] + fb["width"] + 20)
            fy2 = min(h, fb["y"] + fb["height"] + 40)
            mask[fy1:fy2, fx1:fx2] = 0

        masked_gray = cv2.bitwise_and(gray, gray, mask=mask)

        # Edge detection for rigid rectangular handheld devices
        blurred = cv2.GaussianBlur(masked_gray, (5, 5), 0)
        edges = cv2.Canny(blurred, 35, 120)
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
        dilated = cv2.dilate(edges, kernel, iterations=1)

        contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        detected_devices: List[Dict[str, int]] = []
        is_device_detected = False

        for cnt in contours:
            area = cv2.contourArea(cnt)
            # Typical phone area in 640x480 webcam frame: 1,500 to 50,000 pixels
            if 1500 <= area <= 55000:
                bx, by, bw, bh = cv2.boundingRect(cnt)
                aspect_ratio = max(bw, bh) / max(1.0, float(min(bw, bh)))

                # Smartphone standard aspect ratios range between 1.45 and 2.7
                if 1.40 <= aspect_ratio <= 2.75:
                    # Verify rectangularity (extent)
                    extent = area / float(bw * bh)
                    if extent >= 0.55:
                        # Inspect interior texture: phone screens have low internal variance or distinct glowing display
                        roi = masked_gray[by:by+bh, bx:bx+bw]
                        if roi.size > 0:
                            std_dev = np.std(roi)
                            mean_val = np.mean(roi)
                            # Phone screen characteristics (either dark glass surface std_dev < 38 or illuminated screen)
                            if std_dev < 40 or mean_val > 180:
                                detected_devices.append({
                                    "x": int(bx),
                                    "y": int(by),
                                    "width": int(bw),
                                    "height": int(bh)
                                })
                                is_device_detected = True
                                break

        return {
            "detected": is_device_detected,
            "count": len(detected_devices),
            "boxes": detected_devices,
            "confidence": 0.88 if is_device_detected else 0.98,
            "label": "PHONE_OR_DEVICE" if is_device_detected else "NONE"
        }
    except Exception:
        return {
            "detected": False,
            "count": 0,
            "boxes": [],
            "confidence": 0.50,
            "label": "NONE"
        }


def compute_biometric_face_signature(
    frame: np.ndarray,
    keypoints: List[Any],
    bbox: Dict[str, int]
) -> Dict[str, Any]:
    """
    Computes a robust biometric face signature combining invariant geometric landmark
    ratios and an aligned grayscale template for candidate identity verification.
    """
    try:
        h, w, _ = frame.shape
        # Keypoints: [0: r_eye, 1: l_eye, 2: nose, 3: mouth]
        pts = [(kp.x, kp.y) for kp in keypoints]
        r_eye = pts[0]
        l_eye = pts[1]
        nose = pts[2]
        mouth = pts[3]

        # Normalized inter-ocular baseline distance
        iod = np.hypot(l_eye[0] - r_eye[0], l_eye[1] - r_eye[1])
        if iod < 1e-4:
            iod = 1e-4

        # Invariant geometric proportions normalized by inter-ocular distance
        r_eye_nose = np.hypot(nose[0] - r_eye[0], nose[1] - r_eye[1]) / iod
        l_eye_nose = np.hypot(nose[0] - l_eye[0], nose[1] - l_eye[1]) / iod
        nose_mouth = np.hypot(mouth[0] - nose[0], mouth[1] - nose[1]) / iod
        eye_mouth = np.hypot(mouth[0] - (r_eye[0] + l_eye[0]) / 2, mouth[1] - (r_eye[1] + l_eye[1]) / 2) / iod
        face_ratio = float(bbox["height"]) / max(1.0, float(bbox["width"]))

        geom_vector = [
            round(float(r_eye_nose), 4),
            round(float(l_eye_nose), 4),
            round(float(nose_mouth), 4),
            round(float(eye_mouth), 4),
            round(float(face_ratio), 4)
        ]

        # Aligned 24x24 face crop appearance template
        bx = max(0, bbox["x"])
        by = max(0, bbox["y"])
        bw = min(w - bx, bbox["width"])
        bh = min(h - by, bbox["height"])
        template_vector = []

        if bw > 15 and bh > 15:
            face_crop = frame[by:by+bh, bx:bx+bw]
            gray_crop = cv2.cvtColor(face_crop, cv2.COLOR_BGR2GRAY)
            # Normalize illumination
            eq_crop = cv2.equalizeHist(gray_crop)
            resized = cv2.resize(eq_crop, (24, 24)).astype(np.float32)
            # Zero-mean unit variance normalization
            std_val = float(np.std(resized))
            if std_val > 1e-4:
                norm_template = (resized - float(np.mean(resized))) / std_val
            else:
                norm_template = resized - float(np.mean(resized))
            template_vector = [round(float(v), 3) for v in norm_template.flatten()]

        unique_token = f"FID-{uuid.uuid4().hex[:8].upper()}"

        return {
            "face_id": unique_token,
            "geom": geom_vector,
            "template": template_vector,
            "status": "valid"
        }
    except Exception as exc:
        return {
            "face_id": f"FID-{uuid.uuid4().hex[:8].upper()}",
            "geom": [],
            "template": [],
            "status": f"error: {str(exc)}"
        }


def verify_face_signature(
    current_sig: Dict[str, Any],
    enrolled_sig_raw: str
) -> Tuple[bool, float]:
    """
    Compares the active face biometric signature against the candidate's enrolled Face ID.
    Returns: (is_match: bool, similarity: float)
    Strict threshold (< 0.65) flags unauthorized substitute candidates / friends.
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

        # Geometric similarity (Euclidean distance on normalized facial landmark proportions)
        min_len = min(len(curr_geom), len(enr_geom))
        geom_dist = np.linalg.norm(curr_geom[:min_len] - enr_geom[:min_len])
        geom_sim = max(0.0, 1.0 - (geom_dist / 0.35))

        # Template correlation similarity
        curr_tmpl = np.array(current_sig.get("template", []), dtype=float)
        enr_tmpl = np.array(enrolled.get("template", []), dtype=float)
        tmpl_sim = 0.0

        if len(curr_tmpl) == len(enr_tmpl) and len(curr_tmpl) > 0:
            norm_c = np.linalg.norm(curr_tmpl)
            norm_e = np.linalg.norm(enr_tmpl)
            if norm_c > 1e-4 and norm_e > 1e-4:
                # Pearson correlation coefficient between face appearance templates
                dot_prod = float(np.dot(curr_tmpl, enr_tmpl) / (norm_c * norm_e))
                tmpl_sim = max(0.0, dot_prod)

        # Combined biometric score: 45% landmark geometry + 55% template appearance correlation
        combined_similarity = round(float(0.45 * geom_sim + 0.55 * tmpl_sim), 3)

        # Strict Threshold: score >= 0.65 is the same candidate. Lower is an unauthorized substitute person
        is_match = combined_similarity >= 0.65
        return is_match, combined_similarity
    except Exception:
        return True, 1.0


def analyze_camera_frame(
    image_base64: str,
    enrolled_signature: Optional[str] = None
) -> Dict[str, Any]:
    """
    Decodes a base64 camera frame and performs deep-learning computer vision face analysis.
    Extracts:
      - Face count & bounding boxes (BlazeFace + Profile cascade)
      - Eye keypoints & calibrated eye gaze direction
      - Prohibited dark sunglasses check
      - Phone & unidentified foreign device detection
      - Candidate Face ID biometric verification against enrolled signature
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
                "eyewear_detected": False,
                "phone_detected": False,
                "phone_boxes": [],
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

        # 4. Check for mobile phones or unidentified foreign devices in frame
        phone_scan = detect_phone_and_foreign_objects(frame, bounding_boxes)
        phone_detected = phone_scan["detected"]
        phone_boxes = phone_scan["boxes"]

        # 5. Biometric Face ID Anti-Impersonation Check
        face_id_match = True
        face_id_similarity = 1.0
        if enrolled_signature and computed_sig:
            face_id_match, face_id_similarity = verify_face_signature(computed_sig, enrolled_signature)

        if face_count == 1:
            if not face_id_match:
                status = "face_mismatch"
                confidence = 0.94
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
            "eyewear_detected": eyewear_detected,
            "phone_detected": phone_detected,
            "phone_boxes": phone_boxes,
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
            "eyewear_detected": False,
            "phone_detected": False,
            "phone_boxes": [],
            "face_id_match": True,
            "face_id_similarity": 1.0,
            "face_signature": None
        }
