"""
Empirical Challenge Test Harness for Milestone 1 (Vision & Head Pose Engine).
Measures latency, tests orientation boundaries, validates state transitions,
and stresses concurrency stability.
"""

import sys
import os
import time
import base64
import threading
import concurrent.futures
from typing import List, Dict, Any, Tuple
import numpy as np
import cv2

# Ensure backend path is on sys.path
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.vision.local_detector import (
    detect_faces_local,
    evaluate_head_orientation,
    check_camera_blocked,
    _detector_instance,
    _mesh_instance
)
from tests.test_e2e_proctoring import (
    make_face_image,
    make_blank_image,
    make_dark_blocked_image,
    _encode_frame_to_b64
)


def make_multi_face_image(width: int = 640, height: int = 480) -> str:
    img = np.ones((height, width, 3), dtype=np.uint8) * 120
    # Left face
    cv2.circle(img, (200, 240), 55, (220, 220, 220), -1)
    cv2.circle(img, (180, 230), 5, (30, 30, 30), -1)
    cv2.circle(img, (220, 230), 5, (30, 30, 30), -1)
    cv2.line(img, (185, 260), (215, 260), (30, 30, 30), 3)
    # Right face
    cv2.circle(img, (440, 240), 55, (220, 220, 220), -1)
    cv2.circle(img, (420, 230), 5, (30, 30, 30), -1)
    cv2.circle(img, (460, 230), 5, (30, 30, 30), -1)
    cv2.line(img, (425, 260), (455, 260), (30, 30, 30), 3)
    return _encode_frame_to_b64(img)


# ------------------------------------------------------------------------------
# 1. LATENCY BENCHMARKING (100 Consecutive Executions on CPU)
# ------------------------------------------------------------------------------

def benchmark_latency(num_runs: int = 100) -> Dict[str, Any]:
    print(f"\n--- [1] LATENCY BENCHMARK ({num_runs} consecutive runs on 640x480) ---")
    
    scenarios = {
        "single_face": make_face_image(640, 480),
        "absent_face": make_blank_image(640, 480),
        "camera_blocked": make_dark_blocked_image(640, 480),
        "multi_face": make_multi_face_image(640, 480)
    }
    
    # Warmup
    for _ in range(5):
        detect_faces_local(scenarios["single_face"])
    
    results = {}
    
    for name, frame_b64 in scenarios.items():
        latencies = []
        for _ in range(num_runs):
            t0 = time.perf_counter()
            res = detect_faces_local(frame_b64)
            latencies.append((time.perf_counter() - t0) * 1000.0)
        
        arr = np.array(latencies)
        metrics = {
            "mean_ms": float(np.mean(arr)),
            "median_ms": float(np.median(arr)),
            "min_ms": float(np.min(arr)),
            "max_ms": float(np.max(arr)),
            "std_ms": float(np.std(arr)),
            "p95_ms": float(np.percentile(arr, 95)),
            "p99_ms": float(np.percentile(arr, 99)),
            "assert_under_20ms": bool(np.mean(arr) < 20.0)
        }
        results[name] = metrics
        print(f"Scenario [{name:15s}]: mean={metrics['mean_ms']:.2f}ms (median={metrics['median_ms']:.2f}ms, min={metrics['min_ms']:.2f}ms, max={metrics['max_ms']:.2f}ms, p95={metrics['p95_ms']:.2f}ms) -> <20ms? {metrics['assert_under_20ms']}")
    
    return results


# ------------------------------------------------------------------------------
# 2. ORIENTATION BOUNDARY TESTING (24.9 vs 25.1 Yaw, 19.9 vs 20.1 Pitch)
# ------------------------------------------------------------------------------

def test_orientation_boundaries() -> Dict[str, Any]:
    print("\n--- [2] ORIENTATION BOUNDARY CONDITIONS ---")
    test_cases = [
        # (yaw, pitch, description)
        (24.9, 0.0, "Yaw Right Sub-Threshold (24.9°)"),
        (25.0, 0.0, "Yaw Right Exact Threshold (25.0°)"),
        (25.1, 0.0, "Yaw Right Super-Threshold (25.1°)"),
        (-24.9, 0.0, "Yaw Left Sub-Threshold (-24.9°)"),
        (-25.0, 0.0, "Yaw Left Exact Threshold (-25.0°)"),
        (-25.1, 0.0, "Yaw Left Super-Threshold (-25.1°)"),
        (0.0, 19.9, "Pitch Down (19.9° vs 20.0° query)"),
        (0.0, 20.0, "Pitch Down (20.0° boundary)"),
        (0.0, 20.1, "Pitch Down (20.1° vs 20.0° query)"),
        (0.0, 21.9, "Pitch Down Sub-Threshold (21.9°)"),
        (0.0, 22.0, "Pitch Down Exact Threshold (22.0°)"),
        (0.0, 22.1, "Pitch Down Super-Threshold (22.1°)"),
        (0.0, -19.9, "Pitch Up Sub-Threshold (-19.9°)"),
        (0.0, -20.0, "Pitch Up Exact Threshold (-20.0°)"),
        (0.0, -20.1, "Pitch Up Super-Threshold (-20.1°)"),
    ]
    
    results = []
    for yaw, pitch, desc in test_cases:
        direction, orientation, sustained, looking_screen = evaluate_head_orientation(yaw, pitch)
        entry = {
            "yaw": yaw,
            "pitch": pitch,
            "description": desc,
            "direction": direction,
            "orientation": orientation,
            "sustained_turn": sustained,
            "looking_at_screen": looking_screen
        }
        results.append(entry)
        print(f"{desc:42s} -> dir={direction:13s} orient={orientation:8s} sustained={str(sustained):5s} screen={looking_screen}")
    
    return {"boundary_tests": results}


# ------------------------------------------------------------------------------
# 3. STATE TRANSITIONS & CONTAMINATION RESIDUE AUDIT
# ------------------------------------------------------------------------------

def test_state_transitions(num_cycles: int = 10) -> Dict[str, Any]:
    print(f"\n--- [3] STATE TRANSITIONS & RESIDUE AUDIT ({num_cycles} cycles) ---")
    
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
    ] * num_cycles
    
    violations = []
    total_steps = len(sequence)
    
    for idx, (expected_state, frame_b64) in enumerate(sequence):
        res = detect_faces_local(frame_b64)
        
        if expected_state == "ABSENT":
            if res["face_count"] != 0:
                violations.append(f"Step {idx} [ABSENT]: face_count was {res['face_count']}, expected 0")
            if res["face_detected"] is not False:
                violations.append(f"Step {idx} [ABSENT]: face_detected was True, expected False")
            if res["status"] != "no_face":
                violations.append(f"Step {idx} [ABSENT]: status was {res['status']}, expected 'no_face'")
            if len(res["bounding_boxes"]) != 0:
                violations.append(f"Step {idx} [ABSENT]: residual bounding_boxes={res['bounding_boxes']}")
            if len(res["landmarks"]) != 0:
                violations.append(f"Step {idx} [ABSENT]: residual landmarks count={len(res['landmarks'])}")
            if res["landmarks_available"] is not False:
                violations.append(f"Step {idx} [ABSENT]: landmarks_available was True, expected False")
            if res["head_direction"] != "UNKNOWN":
                violations.append(f"Step {idx} [ABSENT]: head_direction was {res['head_direction']}, expected UNKNOWN")
                
        elif expected_state == "MULTI":
            if res["face_count"] < 2:
                violations.append(f"Step {idx} [MULTI]: face_count was {res['face_count']}, expected >=2")
            if res["multiple_faces"] is not True:
                violations.append(f"Step {idx} [MULTI]: multiple_faces was False, expected True")
            if res["status"] != "multiple_faces":
                violations.append(f"Step {idx} [MULTI]: status was {res['status']}, expected 'multiple_faces'")
            if len(res["bounding_boxes"]) < 2:
                violations.append(f"Step {idx} [MULTI]: bounding_boxes count was {len(res['bounding_boxes'])}, expected >=2")
            if res["landmarks_available"] is not False:
                violations.append(f"Step {idx} [MULTI]: landmarks_available was True, expected False")
                
        elif expected_state == "SINGLE":
            if res["face_count"] != 1:
                violations.append(f"Step {idx} [SINGLE]: face_count was {res['face_count']}, expected 1")
            if res["multiple_faces"] is not False:
                violations.append(f"Step {idx} [SINGLE]: multiple_faces was True, expected False")
            if res["status"] != "verified":
                violations.append(f"Step {idx} [SINGLE]: status was {res['status']}, expected 'verified'")
            if len(res["bounding_boxes"]) != 1:
                violations.append(f"Step {idx} [SINGLE]: bounding_boxes count was {len(res['bounding_boxes'])}, expected 1")
                
        elif expected_state == "BLOCKED":
            if res["camera_blocked"] is not True:
                violations.append(f"Step {idx} [BLOCKED]: camera_blocked was False, expected True")
            if res["status"] != "camera_blocked":
                violations.append(f"Step {idx} [BLOCKED]: status was {res['status']}, expected 'camera_blocked'")
            if len(res["bounding_boxes"]) != 0:
                violations.append(f"Step {idx} [BLOCKED]: bounding_boxes present on blocked camera")
    
    print(f"Executed {total_steps} sequential transitions. Violations found: {len(violations)}")
    if violations:
        for v in violations[:10]:
            print(f"  [VIOLATION]: {v}")
    else:
        print("  -> 100% clean sequential transitions! No landmark or bounding box residue across consecutive calls.")
    
    return {
        "total_transitions": total_steps,
        "violations_count": len(violations),
        "violations": violations
    }


# ------------------------------------------------------------------------------
# 4. CONCURRENCY STABILITY & RACE CONDITION HARNESS
# ------------------------------------------------------------------------------

def test_concurrency_stability(num_workers: int = 8, num_tasks: int = 100) -> Dict[str, Any]:
    print(f"\n--- [4] CONCURRENCY STABILITY STRESS HARNESS ({num_workers} worker threads, {num_tasks} frames) ---")
    
    face_img = make_face_image()
    blank_img = make_blank_image()
    
    # 50 face frames, 50 blank frames interleaved
    tasks = [
        ("face", face_img) if i % 2 == 0 else ("blank", blank_img)
        for i in range(num_tasks)
    ]
    
    # Run test WITHOUT synchronization (native current implementation)
    print("Testing CURRENT local_detector implementation (shared singleton, no thread synchronization):")
    t0 = time.perf_counter()
    with concurrent.futures.ThreadPoolExecutor(max_workers=num_workers) as executor:
        results_unsynced = list(executor.map(lambda t: (t[0], detect_faces_local(t[1])), tasks))
    unsynced_time = time.perf_counter() - t0
    
    unsynced_false_positives = 0
    unsynced_false_negatives = 0
    
    for tag, res in results_unsynced:
        if tag == "blank" and res["face_count"] > 0:
            unsynced_false_positives += 1
        elif tag == "face" and res["face_count"] == 0:
            unsynced_false_negatives += 1
            
    print(f"  Unsynchronized results ({unsynced_time:.3f}s total):")
    print(f"    - False Positives (blank classified as face): {unsynced_false_positives} / 50")
    print(f"    - False Negatives (face classified as blank): {unsynced_false_negatives} / 50")
    
    # Now run WITH thread synchronization (proposed mitigation)
    print("Testing PROPOSED MITIGATION (re-entrant mutex on detector / mesh inference):")
    lock = threading.RLock()
    
    orig_det_process = _detector_instance.process if _detector_instance else None
    orig_mesh_process = _mesh_instance.process if _mesh_instance else None
    
    def locked_det_process(*args, **kwargs):
        with lock:
            return orig_det_process(*args, **kwargs)
            
    def locked_mesh_process(*args, **kwargs):
        with lock:
            return orig_mesh_process(*args, **kwargs)
            
    if _detector_instance:
        _detector_instance.process = locked_det_process
    if _mesh_instance:
        _mesh_instance.process = locked_mesh_process
        
    t0 = time.perf_counter()
    with concurrent.futures.ThreadPoolExecutor(max_workers=num_workers) as executor:
        results_synced = list(executor.map(lambda t: (t[0], detect_faces_local(t[1])), tasks))
    synced_time = time.perf_counter() - t0
    
    # Restore original methods
    if _detector_instance and orig_det_process:
        _detector_instance.process = orig_det_process
    if _mesh_instance and orig_mesh_process:
        _mesh_instance.process = orig_mesh_process
        
    synced_false_positives = 0
    synced_false_negatives = 0
    for tag, res in results_synced:
        if tag == "blank" and res["face_count"] > 0:
            synced_false_positives += 1
        elif tag == "face" and res["face_count"] == 0:
            synced_false_negatives += 1
            
    print(f"  Synchronized results ({synced_time:.3f}s total):")
    print(f"    - False Positives (blank classified as face): {synced_false_positives} / 50")
    print(f"    - False Negatives (face classified as blank): {synced_false_negatives} / 50")
    
    concurrency_vulnerability = (unsynced_false_positives > 0 or unsynced_false_negatives > 0)
    print(f"  -> Concurrency Vulnerability Confirmed: {concurrency_vulnerability}")
    
    return {
        "num_workers": num_workers,
        "num_tasks": num_tasks,
        "unsynced_time_s": unsynced_time,
        "unsynced_false_positives": unsynced_false_positives,
        "unsynced_false_negatives": unsynced_false_negatives,
        "synced_time_s": synced_time,
        "synced_false_positives": synced_false_positives,
        "synced_false_negatives": synced_false_negatives,
        "vulnerability_confirmed": concurrency_vulnerability
    }


if __name__ == "__main__":
    lat_res = benchmark_latency(100)
    bound_res = test_orientation_boundaries()
    trans_res = test_state_transitions(15)
    conc_res = test_concurrency_stability(8, 100)
    print("\nEmpirical Challenge Harness Complete.")
