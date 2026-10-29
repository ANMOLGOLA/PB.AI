"""
Adversarial Stress Test Suite: Vision Detector & 3D Head Pose Engine
Evaluates pathological inputs, illumination extremes, extreme orientations,
PnP numerical stability (NaN/Inf checks), and graceful exception handling.
Target: backend/app/vision/local_detector.py
"""

import math
import base64
import pytest
import numpy as np
import cv2

from app.vision.local_detector import (
    detect_faces_local,
    estimate_head_pose_pnp,
    decode_image_frame,
    check_camera_blocked,
    evaluate_head_orientation,
    MODEL_POINTS_3D
)


# ==============================================================================
# Helpers
# ==============================================================================

def make_test_b64(img: np.ndarray) -> str:
    _, buf = cv2.imencode('.jpg', img)
    return base64.b64encode(buf.tobytes()).decode('ascii')


def make_synthetic_face(w=640, h=480, offset_x=0, offset_y=0) -> np.ndarray:
    img = np.ones((h, w, 3), dtype=np.uint8) * 120
    cx, cy = (w // 2) + offset_x, (h // 2) + offset_y
    cv2.circle(img, (cx, cy), 60, (220, 220, 220), -1)
    cv2.circle(img, (cx - 25, cy - 15), 6, (30, 30, 30), -1)
    cv2.circle(img, (cx + 25, cy - 15), 6, (30, 30, 30), -1)
    cv2.line(img, (cx - 20, cy + 25), (cx + 20, cy + 25), (30, 30, 30), 3)
    return img


def make_blank_image(w: int = 640, h: int = 480, intensity: int = 120) -> np.ndarray:
    """Generates a natural empty room frame containing zero faces (textured background)."""
    img = np.ones((h, w, 3), dtype=np.uint8) * intensity
    for y in range(h):
        img[y, :, :] = np.clip(img[y, :, :] + int((y / h) * 40 - 20), 0, 255)
    img[::40, :, :] = np.clip(img[::40, :, :] + 15, 0, 255)
    img[:, ::40, :] = np.clip(img[:, ::40, :] - 15, 0, 255)
    return img


# ==============================================================================
# 1. DEGENERATE FRAMES & PATHOLOGICAL INPUTS
# ==============================================================================

class TestAdversarialDegenerateFrames:
    """Stress tests on degenerate, malformed, truncated, or invalid inputs."""

    @pytest.mark.parametrize("payload, desc", [
        (None, "None type"),
        (12345, "Integer input"),
        ([1, 2, 3], "List input"),
        (b"raw_bytes", "Raw bytes input"),
        ("", "Empty string"),
        ("   \n\t  ", "Whitespace string"),
        ("data:image/jpeg;base64,", "Header-only empty base64"),
        ("data:image/jpeg;base64,invalid_padding", "Invalid base64 padding"),
        ("data:image/jpeg;base64,??***&&&", "Invalid base64 characters"),
        (base64.b64encode(b"NOT_AN_IMAGE_RANDOM_BYTES").decode("ascii"), "Random byte string"),
        (base64.b64encode(b"\xff\xd8\xff\xe0\x00\x10JFIF\x00").decode("ascii"), "Truncated JPEG header"),
        (base64.b64encode(b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR").decode("ascii"), "Truncated PNG header"),
    ])
    def test_pathological_payloads_do_not_crash(self, payload, desc):
        """Pathological payloads must return unusable_frame gracefully without crashing."""
        result = detect_faces_local(payload)
        assert isinstance(result, dict), f"Failed on {desc}"
        assert result["face_detected"] is False
        assert result["status"] == "unusable_frame"
        assert result["latency_ms"] >= 0.0
        assert "error_detail" in result

    @pytest.mark.parametrize("w, h", [
        (0, 0),
        (1, 1),
        (10, 10),
        (49, 49),
        (1000, 1),
        (1, 1000),
    ])
    def test_subminimal_dimensions_rejected(self, w, h):
        """Images smaller than 50x50 in either dimension must be rejected safely."""
        if w == 0 or h == 0:
            img = np.empty((h, w, 3), dtype=np.uint8)
        else:
            img = np.ones((h, w, 3), dtype=np.uint8) * 128
        result = detect_faces_local(img)
        assert isinstance(result, dict)
        assert result["face_detected"] is False
        assert result["status"] in ("no_face", "unusable_frame")

    def test_large_dimension_frame(self):
        """Very large frame (2000x2000) executes without memory or dimension failure."""
        img = make_blank_image(2000, 2000, 120)
        result = detect_faces_local(img)
        assert result["status"] == "no_face"
        assert result["frame_width"] == 2000
        assert result["frame_height"] == 2000


# ==============================================================================
# 2. ILLUMINATION EXTREMES & NOISE
# ==============================================================================

class TestAdversarialIlluminationExtremes:
    """Stress tests on extreme luminance, overexposure, and high-contrast noise."""

    @pytest.mark.parametrize("luminance", [0, 5, 10, 14])
    def test_extreme_dark_camera_covered(self, luminance):
        """Mean luminance < 15.0 must trigger CAMERA_COVERED_DARK."""
        img = np.ones((480, 640, 3), dtype=np.uint8) * luminance
        result = detect_faces_local(img)
        assert result["camera_blocked"] is True
        assert result["block_reason"] == "CAMERA_COVERED_DARK"
        assert result["status"] == "camera_blocked"
        assert result["face_detected"] is False

    @pytest.mark.parametrize("luminance", [246, 250, 255])
    def test_extreme_bright_camera_covered(self, luminance):
        """Mean luminance > 245.0 must trigger CAMERA_COVERED_BRIGHT."""
        img = np.ones((480, 640, 3), dtype=np.uint8) * luminance
        result = detect_faces_local(img)
        assert result["camera_blocked"] is True
        assert result["block_reason"] == "CAMERA_COVERED_BRIGHT"
        assert result["status"] == "camera_blocked"
        assert result["face_detected"] is False

    @pytest.mark.parametrize("luminance", [20, 35, 45, 49, 50, 75, 120, 160, 200, 210, 215, 230, 240])
    def test_uniform_obstruction_at_all_luminances(self, luminance):
        """Uniform low-variance frames across all luminance ranges must trigger CAMERA_OBSTRUCTED_UNIFORM."""
        img = np.ones((480, 640, 3), dtype=np.uint8) * luminance
        result = detect_faces_local(img)
        assert result["camera_blocked"] is True
        assert result["block_reason"] == "CAMERA_OBSTRUCTED_UNIFORM"
        assert result["status"] == "camera_blocked"

    def test_salt_and_pepper_noise_not_blocked(self):
        """High-contrast binary noise must not trigger camera blocked and not crash."""
        noise = np.random.choice([0, 255], size=(480, 640, 3)).astype(np.uint8)
        result = detect_faces_local(noise)
        assert result["camera_blocked"] is False
        assert result["status"] == "no_face"

    def test_high_contrast_checkerboard_not_blocked(self):
        """Alternating pixel checkerboard must not trigger camera blocked and not crash."""
        checker = np.zeros((480, 640, 3), dtype=np.uint8)
        checker[::2, ::2] = 255
        checker[1::2, 1::2] = 255
        result = detect_faces_local(checker)
        assert result["camera_blocked"] is False
        assert result["status"] == "no_face"


# ==============================================================================
# 3. EXTREME ORIENTATIONS & SOLVEPNP STABILITY
# ==============================================================================

class TestAdversarialExtremeOrientationsAndPnP:
    """Stress tests on extreme head poses, rotation decomposition, and solvePnP stability."""

    @pytest.mark.parametrize("angle", [0, 30, 45, 60, 90, 135, 180, 270])
    def test_rotated_faces_pose_angles_valid(self, angle):
        """Rotated face images must compute finite Euler angles without NaN or Inf."""
        face = make_synthetic_face()
        h, w = face.shape[:2]
        M = cv2.getRotationMatrix2D((w // 2, h // 2), angle, 1.0)
        rotated = cv2.warpAffine(face, M, (w, h), borderValue=(120, 120, 120))

        result = detect_faces_local(rotated)
        assert result["status"] == "verified"
        assert result["face_detected"] is True
        hp = result["head_pose"]

        for key in ("yaw", "pitch", "roll"):
            val = hp[key]
            assert isinstance(val, (int, float)), f"{key} is not numeric"
            assert not math.isnan(val), f"{key} is NaN at angle {angle}"
            assert not math.isinf(val), f"{key} is Inf at angle {angle}"

    def test_solvepnp_euler_angles_360_degree_sweep(self):
        """
        Synthetically project 3D model points across full 3D rotation sphere:
        yaw in [-180, 180], pitch in [-90, 90], roll in [-180, 180].
        Verify solvePnP + RQDecomp3x3 never produces NaN or Inf.
        """
        w, h = 640, 480
        focal_length = float(w)
        center = (w / 2.0, h / 2.0)
        cam_mat = np.array([
            [focal_length, 0.0, center[0]],
            [0.0, focal_length, center[1]],
            [0.0, 0.0, 1.0]
        ], dtype=np.float64)
        dist_coeffs = np.zeros((4, 1), dtype=np.float64)

        for pitch_deg in (-90, -60, -45, -20, 0, 20, 45, 60, 90):
            for yaw_deg in (-180, -120, -75, -45, 0, 45, 75, 120, 180):
                for roll_deg in (-180, -90, -45, 0, 45, 90, 180):
                    rx = np.radians(pitch_deg)
                    ry = np.radians(yaw_deg)
                    rz = np.radians(roll_deg)

                    Rx = np.array([[1, 0, 0], [0, np.cos(rx), -np.sin(rx)], [0, np.sin(rx), np.cos(rx)]])
                    Ry = np.array([[np.cos(ry), 0, np.sin(ry)], [0, 1, 0], [-np.sin(ry), 0, np.cos(ry)]])
                    Rz = np.array([[np.cos(rz), -np.sin(rz), 0], [np.sin(rz), np.cos(rz), 0], [0, 0, 1]])
                    R = Rz @ Ry @ Rx
                    rvec, _ = cv2.Rodrigues(R)
                    tvec = np.array([[0.0], [0.0], [1000.0]])

                    img_pts, _ = cv2.projectPoints(MODEL_POINTS_3D, rvec, tvec, cam_mat, dist_coeffs)
                    img_pts = img_pts.reshape(-1, 2)

                    yaw, pitch, roll = estimate_head_pose_pnp(img_pts, w, h)
                    assert not math.isnan(yaw), f"Yaw is NaN for ({pitch_deg}, {yaw_deg}, {roll_deg})"
                    assert not math.isnan(pitch), f"Pitch is NaN for ({pitch_deg}, {yaw_deg}, {roll_deg})"
                    assert not math.isnan(roll), f"Roll is NaN for ({pitch_deg}, {yaw_deg}, {roll_deg})"
                    assert not math.isinf(yaw), f"Yaw is Inf for ({pitch_deg}, {yaw_deg}, {roll_deg})"
                    assert not math.isinf(pitch), f"Pitch is Inf for ({pitch_deg}, {yaw_deg}, {roll_deg})"
                    assert not math.isinf(roll), f"Roll is Inf for ({pitch_deg}, {yaw_deg}, {roll_deg})"

    def test_solvepnp_noisy_landmarks_stability(self):
        """solvePnP survives heavy landmark noise (up to 50px jitter) without NaN/Inf."""
        w, h = 640, 480
        focal_length = float(w)
        center = (w / 2.0, h / 2.0)
        cam_mat = np.array([
            [focal_length, 0.0, center[0]],
            [0.0, focal_length, center[1]],
            [0.0, 0.0, 1.0]
        ], dtype=np.float64)
        dist_coeffs = np.zeros((4, 1), dtype=np.float64)

        np.random.seed(1337)
        rvec = np.array([[0.1], [0.2], [-0.05]], dtype=np.float64)
        tvec = np.array([[0.0], [0.0], [1000.0]], dtype=np.float64)
        img_pts, _ = cv2.projectPoints(MODEL_POINTS_3D, rvec, tvec, cam_mat, dist_coeffs)
        img_pts = img_pts.reshape(-1, 2)

        for jitter in [5.0, 15.0, 30.0, 50.0]:
            noisy_pts = img_pts + np.random.normal(0, jitter, img_pts.shape)
            yaw, pitch, roll = estimate_head_pose_pnp(noisy_pts, w, h)
            assert not math.isnan(yaw) and not math.isinf(yaw)
            assert not math.isnan(pitch) and not math.isinf(pitch)
            assert not math.isnan(roll) and not math.isinf(roll)

    def test_solvepnp_degenerate_collinear_and_zero_points(self):
        """Degenerate points (all zero or collinear) produce valid numeric angles without crash."""
        w, h = 640, 480
        # All zeros
        zeros_pts = np.zeros((6, 2), dtype=np.float64)
        y, p, r = estimate_head_pose_pnp(zeros_pts, w, h)
        assert not math.isnan(y) and not math.isnan(p) and not math.isnan(r)

        # Collinear points
        collinear_pts = np.array([[i * 20.0, i * 20.0] for i in range(6)], dtype=np.float64)
        y, p, r = estimate_head_pose_pnp(collinear_pts, w, h)
        assert not math.isnan(y) and not math.isnan(p) and not math.isnan(r)


# ==============================================================================
# 4. CONTRACT & COMPATIBILITY VERIFICATION
# ==============================================================================

class TestAdversarialContractCompliance:
    """Verifies that contract output invariants are strictly satisfied across all states."""

    def test_contract_keys_and_types_present(self):
        """Every required contract key must be present with the correct type."""
        face = make_synthetic_face()
        res = detect_faces_local(face)

        expected_keys = [
            "faces_detected", "face_detected", "face_count", "multiple_faces",
            "confidence", "status", "camera_blocked", "block_reason",
            "camera_block_reason", "bounding_boxes", "head_pose",
            "head_direction", "gaze_direction", "looking_at_screen",
            "eyes", "landmarks", "landmarks_available", "model_info",
            "latency_ms", "frame_width", "frame_height"
        ]
        for key in expected_keys:
            assert key in res, f"Missing required key: {key}"

        hp = res["head_pose"]
        assert isinstance(hp["yaw"], (int, float))
        assert isinstance(hp["pitch"], (int, float))
        assert isinstance(hp["roll"], (int, float))
        assert isinstance(hp["sustained_turn"], bool)
        assert hp["orientation"] in ("FORWARD", "LEFT", "RIGHT", "UP", "DOWN", "UNKNOWN")

        # No eye tracking claim in model_info
        assert "eye" not in res["model_info"]["pose_estimator"].lower() or "solvepnp" in res["model_info"]["pose_estimator"].lower()
        assert res["model_info"]["license"] == "Apache-2.0"


# ==============================================================================
# 5. VULNERABILITY AUDIT: UNHANDLED EXCEPTIONS ON NON-STANDARD ARRAYS
# ==============================================================================

class TestAdversarialVulnerabilitiesAudit:
    """
    Formal audit of unhandled exception failure modes in local_detector.
    Remediated to confirm that all pathological arrays execute safely.
    """

    def test_vulnerability_2d_grayscale_array_crash(self):
        """2D grayscale numpy array should return unusable_frame or camera_blocked without unhandled crash."""
        img_2d = np.zeros((480, 640), dtype=np.uint8)
        res = detect_faces_local(img_2d)
        assert res["status"] in ("camera_blocked", "unusable_frame", "no_face")

    def test_vulnerability_float32_array_crash(self):
        """Normalized float32 numpy array [0.0, 1.0] should be handled without unhandled cv2.error."""
        img_float = (make_blank_image(640, 480, 120) / 255.0).astype(np.float32)
        res = detect_faces_local(img_float)
        assert res["status"] in ("no_face", "verified", "unusable_frame")
        img_float_uniform = np.ones((480, 640, 3), dtype=np.float32) * 0.5
        res_uniform = detect_faces_local(img_float_uniform)
        assert res_uniform["status"] in ("camera_blocked", "no_face", "unusable_frame")

    def test_vulnerability_1channel_3d_array_crash(self):
        """1-channel 3D numpy array should return unusable_frame or camera_blocked without unhandled cv2.error."""
        img_1ch = np.zeros((480, 640, 1), dtype=np.uint8)
        res = detect_faces_local(img_1ch)
        assert res["status"] in ("camera_blocked", "unusable_frame")

    def test_vulnerability_4d_batched_array_crash(self):
        """4D batched numpy array should return unusable_frame without unhandled ValueError."""
        img_4d = np.zeros((1, 480, 640, 3), dtype=np.uint8)
        res = detect_faces_local(img_4d)
        assert res["status"] in ("unusable_frame", "camera_blocked")

    def test_vulnerability_solvepnp_nan_landmarks_crash(self):
        """solvePnP with NaN landmarks should return (0.0, 0.0, 0.0) without unhandled cv2.error."""
        nan_pts = np.full((6, 2), np.nan, dtype=np.float64)
        yaw, pitch, roll = estimate_head_pose_pnp(nan_pts, 640, 480)
        assert yaw == 0.0 and pitch == 0.0 and roll == 0.0

    def test_vulnerability_solvepnp_mismatched_points_crash(self):
        """solvePnP with fewer than 6 landmarks should return (0.0, 0.0, 0.0) without unhandled cv2.error."""
        pts_4 = np.zeros((4, 2), dtype=np.float64)
        yaw, pitch, roll = estimate_head_pose_pnp(pts_4, 640, 480)
        assert yaw == 0.0 and pitch == 0.0 and roll == 0.0

