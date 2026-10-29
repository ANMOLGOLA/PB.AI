import base64
import os
import cv2
import numpy as np
from typing import Dict, Any, List

# Load Haar cascade classifier from OpenCV
cascade_path = os.path.join(cv2.data.haarcascades, "haarcascade_frontalface_default.xml")
face_cascade = cv2.CascadeClassifier(cascade_path)


def analyze_camera_frame(image_base64: str) -> Dict[str, Any]:
    """
    Decodes a base64 camera frame and performs OpenCV computer vision face analysis.
    Detects face presence, face counts, and bounding coordinates.
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

        # Convert to grayscale for detection efficiency
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        # Apply histogram equalization to normalize illumination
        gray = cv2.equalizeHist(gray)

        # Detect faces
        faces = face_cascade.detectMultiScale(
            gray,
            scaleFactor=1.1,
            minNeighbors=5,
            minSize=(40, 40)
        )

        face_count = len(faces)
        bounding_boxes: List[Dict[str, int]] = []
        for (x, y, w, h) in faces:
            bounding_boxes.append({
                "x": int(x),
                "y": int(y),
                "width": int(w),
                "height": int(h)
            })

        if face_count == 1:
            status = "verified"
            confidence = 0.98
        elif face_count == 0:
            status = "no_face"
            confidence = 0.95
        else:
            status = "multiple_faces"
            confidence = 0.92

        return {
            "face_detected": face_count > 0,
            "face_count": face_count,
            "confidence": confidence,
            "status": status,
            "bounding_boxes": bounding_boxes
        }
    except Exception as exc:
        return {
            "face_detected": False,
            "face_count": 0,
            "confidence": 0.0,
            "status": f"error: {str(exc)}",
            "bounding_boxes": []
        }
