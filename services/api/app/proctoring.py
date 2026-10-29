import base64
import os
import cv2
import numpy as np
from typing import Dict, Any, List
import mediapipe as mp

# MediaPipe deep-learning BlazeFace detector
mp_face_detection = mp.solutions.face_detection
# model_selection=0 (ideal for desktop/laptop webcams within 2-3 meters)
# min_detection_confidence=0.35 (sensitive to detect secondary/background faces)
mp_detector = mp_face_detection.FaceDetection(
    model_selection=0,
    min_detection_confidence=0.35
)

# Secondary profile cascade to detect people looking from the side
profile_cascade_path = os.path.join(cv2.data.haarcascades, "haarcascade_profileface.xml")
profile_cascade = cv2.CascadeClassifier(profile_cascade_path)


def analyze_camera_frame(image_base64: str) -> Dict[str, Any]:
    """
    Decodes a base64 camera frame and performs deep-learning computer vision face analysis.
    Uses MediaPipe BlazeFace with profile cascade augmentation for robust multiple face detection.
    """
    try:
        # Strip data URL prefix if present
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
                "bounding_boxes": []
            }

        h, w, _ = frame.shape
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

        # 1. Primary Deep-Learning Detection via MediaPipe BlazeFace
        results = mp_detector.process(rgb_frame)

        bounding_boxes: List[Dict[str, int]] = []
        if results.detections:
            for detection in results.detections:
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
                # If center distance is far from primary face, it's an additional person
                if dist > max(primary["width"], primary["height"]) * 0.7:
                    bounding_boxes.append({
                        "x": int(px),
                        "y": int(py),
                        "width": int(pw),
                        "height": int(ph)
                    })
                    face_count += 1

        if face_count == 1:
            status = "verified"
            confidence = 0.98
        elif face_count == 0:
            status = "no_face"
            confidence = 0.95
        else:
            status = "multiple_faces"
            confidence = 0.96

        return {
            "face_detected": face_count > 0,
            "face_count": face_count,
            "confidence": confidence,
            "status": status,
            "bounding_boxes": bounding_boxes,
            "frame_width": w,
            "frame_height": h
        }
    except Exception as exc:
        return {
            "face_detected": False,
            "face_count": 0,
            "confidence": 0.0,
            "status": f"error: {str(exc)}",
            "bounding_boxes": []
        }
