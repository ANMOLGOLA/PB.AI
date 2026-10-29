"""
Empirical Challenge Test Suite for Milestone 1 (Vision & Head Pose Engine).

Evaluates:
1. Latency benchmark across 100 consecutive executions on CPU (<20ms average on 640x480).
2. Orientation angle boundary transitions (24.9° vs 25.1° Yaw, 19.9° vs 20.1° / 21.9° vs 22.1° Pitch).
3. Multi-face vs absent face sequential transitions (0 residue / landmark contamination).
4. Concurrency stability & cross-thread packet contamination vulnerability audit.
"""

import time
import concurrent.futures
import numpy as np
import pytest

from app.vision.local_detector import (
    detect_faces_local,
    evaluate_head_orientation,
    check_camera_blocked
)
from tests.test_e2e_proctoring import (
    make_face_image,
    make_blank_image,
    make_dark_blocked_image
)
from tests.run_empirical_challenge import make_multi_face_image


class TestMilestone1EmpiricalChallenge:
    """Rigorous empirical validation tests for Milestone 1."""

    def test_challenge_latency_benchmark_under_20ms(self):
        """Verify on-device CPU inference latency across 100 consecutive executions is <20ms average on 640x480."""
        face_img = make_face_image(640, 480)
        # Warmup
        for _ in range(5):
            detect_faces_local(face_img)

        latencies = []
        for _ in range(100):
            t0 = time.perf_counter()
            res = detect_faces_local(face_img)
            latencies.append((time.perf_counter() - t0) * 1000.0)

        mean_lat = float(np.mean(latencies))
        p95_lat = float(np.percentile(latencies, 95))
        assert mean_lat < 20.0, f"Average latency {mean_lat:.2f}ms exceeded 20ms threshold"
        assert p95_lat < 30.0, f"P95 latency {p95_lat:.2f}ms exceeded 30ms ceiling"

    def test_challenge_orientation_boundary_yaw(self):
        """Verify exact transition at +/-25.0° Yaw threshold."""
        # Right yaw boundary: 24.9° vs 25.1°
        dir_sub, orient_sub, sust_sub, look_sub = evaluate_head_orientation(24.9, 0.0)
        assert dir_sub == "CENTER"
        assert orient_sub == "FORWARD"
        assert sust_sub is False
        assert look_sub is True

        dir_exact, orient_exact, sust_exact, look_exact = evaluate_head_orientation(25.0, 0.0)
        assert dir_exact == "CENTER"
        assert orient_exact == "FORWARD"
        assert sust_exact is False
        assert look_exact is True

        dir_sup, orient_sup, sust_sup, look_sup = evaluate_head_orientation(25.1, 0.0)
        assert dir_sup == "LOOKING_RIGHT"
        assert orient_sup == "RIGHT"
        assert sust_sup is True
        assert look_sup is False

        # Left yaw boundary: -24.9° vs -25.1°
        dir_l_sub, orient_l_sub, sust_l_sub, look_l_sub = evaluate_head_orientation(-24.9, 0.0)
        assert dir_l_sub == "CENTER"
        assert orient_l_sub == "FORWARD"
        assert sust_l_sub is False
        assert look_l_sub is True

        dir_l_sup, orient_l_sup, sust_l_sup, look_l_sup = evaluate_head_orientation(-25.1, 0.0)
        assert dir_l_sup == "LOOKING_LEFT"
        assert orient_l_sup == "LEFT"
        assert sust_l_sup is True
        assert look_l_sup is False

    def test_challenge_orientation_boundary_pitch(self):
        """Verify exact transition at -20.0° (Pitch Up) and +22.0° (Pitch Down)."""
        # Pitch Up boundary (-19.9° vs -20.1°)
        dir_up_sub, orient_up_sub, sust_up_sub, look_up_sub = evaluate_head_orientation(0.0, -19.9)
        assert dir_up_sub == "CENTER"
        assert orient_up_sub == "FORWARD"
        assert sust_up_sub is False
        assert look_up_sub is True

        dir_up_sup, orient_up_sup, sust_up_sup, look_up_sup = evaluate_head_orientation(0.0, -20.1)
        assert dir_up_sup == "LOOKING_UP"
        assert orient_up_sup == "UP"
        assert sust_up_sup is True
        assert look_up_sup is False

        # Pitch Down query: 19.9° vs 20.1° remain CENTER due to calibrated 22.0° threshold
        dir_dn_19, orient_dn_19, sust_dn_19, look_dn_19 = evaluate_head_orientation(0.0, 19.9)
        assert dir_dn_19 == "CENTER"
        assert orient_dn_19 == "FORWARD"
        dir_dn_20, orient_dn_20, sust_dn_20, look_dn_20 = evaluate_head_orientation(0.0, 20.1)
        assert dir_dn_20 == "CENTER"
        assert orient_dn_20 == "FORWARD"

        # Pitch Down actual transition boundary (+21.9° vs +22.1°)
        dir_dn_sub, orient_dn_sub, sust_dn_sub, look_dn_sub = evaluate_head_orientation(0.0, 21.9)
        assert dir_dn_sub == "CENTER"
        assert orient_dn_sub == "FORWARD"
        assert sust_dn_sub is False
        assert look_dn_sub is True

        dir_dn_sup, orient_dn_sup, sust_dn_sup, look_dn_sup = evaluate_head_orientation(0.0, 22.1)
        assert dir_dn_sup == "LOOKING_DOWN"
        assert orient_dn_sup == "DOWN"
        assert sust_dn_sup is True
        assert look_dn_sup is False

    def test_challenge_sequential_state_transitions_no_residue(self):
        """Verify sequential transitions between Absent, Single, Multi, Blocked leave zero residue."""
        single = make_face_image()
        multi = make_multi_face_image()
        blank = make_blank_image()
        blocked = make_dark_blocked_image()

        sequence = [
            ("MULTI", multi),
            ("ABSENT", blank),
            ("SINGLE", single),
            ("BLOCKED", blocked),
            ("ABSENT", blank),
            ("SINGLE", single),
            ("MULTI", multi),
            ("ABSENT", blank)
        ] * 5

        for idx, (expected_state, frame_b64) in enumerate(sequence):
            res = detect_faces_local(frame_b64)
            if expected_state == "ABSENT":
                assert res["face_count"] == 0
                assert res["face_detected"] is False
                assert res["multiple_faces"] is False
                assert res["status"] == "no_face"
                assert len(res["bounding_boxes"]) == 0
                assert len(res["landmarks"]) == 0
                assert res["landmarks_available"] is False
                assert res["head_direction"] == "UNKNOWN"
            elif expected_state == "MULTI":
                assert res["face_count"] >= 2
                assert res["multiple_faces"] is True
                assert res["status"] == "multiple_faces"
                assert len(res["bounding_boxes"]) >= 2
                assert res["landmarks_available"] is False
            elif expected_state == "SINGLE":
                assert res["face_count"] == 1
                assert res["multiple_faces"] is False
                assert res["status"] == "verified"
                assert len(res["bounding_boxes"]) == 1
            elif expected_state == "BLOCKED":
                assert res["camera_blocked"] is True
                assert res["status"] == "camera_blocked"
                assert len(res["bounding_boxes"]) == 0

    def test_challenge_concurrency_race_condition_audit(self):
        """
        Audit concurrency thread-safety across 8 worker threads.
        Verifies elimination of cross-thread packet contamination in MediaPipe singleton.
        """
        face_img = make_face_image()
        blank_img = make_blank_image()
        tasks = [("face", face_img) if i % 2 == 0 else ("blank", blank_img) for i in range(50)]

        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
            results = list(ex.map(lambda t: (t[0], detect_faces_local(t[1])), tasks))

        false_positives = sum(1 for tag, r in results if tag == "blank" and r["face_count"] > 0)
        # Note: If false_positives > 0, unsynchronized singleton race condition is active.
        # This assert formally documents the failure mode when unmitigated.
        assert false_positives == 0, (
            f"Concurrency Failure: {false_positives} of 25 blank frames falsely classified "
            f"as verified faces due to lack of thread synchronization on MediaPipe singleton"
        )
