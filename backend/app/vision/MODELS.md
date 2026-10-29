# Vision & Head Pose Models Documentation

This document records the pre-trained machine learning models, algorithms, licensing, and cryptographic verification hashes used by the deterministic on-device vision pipeline in `backend/app/vision/local_detector.py`.

---

## 1. Architecture Overview

The local computer vision engine executes real-time on-device inference without external network calls or cloud dependencies. The pipeline is structured into three deterministic stages:

1. **Pre-Inference Camera Blocked Detection (OpenCV)**: Statistical tri-metric check executed before neural inference.
2. **Face Detection (Google MediaPipe BlazeFace TFLite)**: Single-Shot Multibox Detector identifying candidate presence and bounding boxes.
3. **Facial Landmarks & 3D Head Pose Estimation (Google MediaPipe FaceMesh TFLite + OpenCV solvePnP)**: 3D Perspective-n-Point pose estimation computing real Yaw, Pitch, Roll angles in degrees.

---

## 2. Model Inventory & Licensing

### Model 1: Google MediaPipe BlazeFace (Short-Range)

* **Architecture**: Single-Shot Multibox Detector (SSD) with double BlazeBlocks and 5x5 depthwise separable convolutions.
* **TFLite Model File**: `face_detection_short_range.tflite`
* **Local Package Path**: `mediapipe/modules/face_detection/face_detection_short_range.tflite`
* **File Size**: 229,714 bytes (~224 KB)
* **SHA-256 Checksum**:
  `bbff11cebd1eb27a1e004cae0b0e63ec8c551cbf34a4451148b4908b8db3eca8`
* **License**: **Apache License 2.0** (Google LLC)
* **Upstream Source Repository**: [Google MediaPipe GitHub](https://github.com/google/mediapipe)
* **Official Model Weights URL**:
  `https://storage.googleapis.com/mediapipe-models/face_detector/blazeface_short_range/float16/1/blazeface_short_range.tflite`
* **Input Tensor**: $128 \times 128 \times 3$ RGB normalized float.
* **Outputs**: Face candidate anchor classifications and 6 keypoint regressors.
* **Inference Engine**: TensorFlow Lite CPU with XNNPACK delegate (~1.7ms latency).

### Model 2: Google MediaPipe FaceMesh

* **Architecture**: Deep convolutional landmark regression network predicting 468 3D facial coordinates.
* **TFLite Model File**: `face_landmark.tflite`
* **Local Package Path**: `mediapipe/modules/face_landmark/face_landmark.tflite`
* **File Size**: 1,242,398 bytes (~1.2 MB)
* **SHA-256 Checksum**:
  `1055cb9d4a9ca8b8c688902a3a5194311138ba256bcc94e336d8373a5f30c814`
* **License**: **Apache License 2.0** (Google LLC)
* **Upstream Source Repository**: [Google MediaPipe GitHub](https://github.com/google/mediapipe)
* **Official Model Weights URL**:
  `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`
* **Input Tensor**: $192 \times 192 \times 3$ RGB.
* **Outputs**: 468 normalized $(x, y, z)$ 3D facial landmark coordinates.
* **Inference Engine**: TensorFlow Lite CPU with XNNPACK delegate (~4.8ms latency).

---

## 3. 3D Head Pose Perspective-n-Point (solvePnP) Model

To derive mathematically rigorous head orientation without heuristic approximations, 6 canonical anatomical points are mapped from FaceMesh landmarks to a standard rigid 3D anthropometric face model in OpenCV camera coordinate space (+X right, +Y down, +Z forward):

| Landmark Name | FaceMesh Index | Canonical 3D Coordinates $(X, Y, Z)$ [mm] | Coordinate Orientation |
|:---|:---:|:---|:---|
| **Nose Tip** | **1** | $(0.0, 0.0, 0.0)$ | Local Origin |
| **Chin** | **152** | $(0.0, 330.0, -65.0)$ | $+Y$ is Downward in image space |
| **Left Eye Outer Corner** (viewer left) | **33** | $(-225.0, -170.0, -135.0)$ | $-X$ is Viewer Left, $-Y$ is Upward |
| **Right Eye Outer Corner** (viewer right) | **263** | $(225.0, -170.0, -135.0)$ | $+X$ is Viewer Right, $-Y$ is Upward |
| **Left Mouth Corner** (viewer left) | **61** | $(-150.0, 150.0, -125.0)$ | $-X$ is Viewer Left, $+Y$ is Downward |
| **Right Mouth Corner** (viewer right) | **291** | $(150.0, 150.0, -125.0)$ | $+X$ is Viewer Right, $+Y$ is Downward |

### PnP Algorithm Formulation:
1. **Camera Intrinsic Matrix**: Pinhole model with $f_x = f_y = \text{width}$, $c_x = \text{width}/2$, $c_y = \text{height}/2$.
2. **Pose Solver**: `cv2.solvePnP(MODEL_POINTS_3D, landmarks_2d, camera_matrix, dist_coeffs, flags=cv2.SOLVEPNP_ITERATIVE)`.
3. **Euler Decomposition**: Rodrigues rotation vector converted to $3\times 3$ rotation matrix, decomposed via `cv2.RQDecomp3x3` yielding:
   - **Yaw ($\theta_y$)**: Horizontal head rotation (left / right).
   - **Pitch ($\theta_x$)**: Vertical head inclination (nodding up / down).
   - **Roll ($\theta_z$)**: Lateral head tilt (cocking head sideways).

### Sustained Head Turn Thresholds:
- **Normal Range**: $|\text{Yaw}| \le 25^\circ$ and $-20^\circ \le \text{Pitch} \le 22^\circ$ (`looking_at_screen = True`).
- **Looking Left**: $\text{Yaw} < -25^\circ$ (`LOOKING_LEFT`).
- **Looking Right**: $\text{Yaw} > 25^\circ$ (`LOOKING_RIGHT`).
- **Looking Down**: $\text{Pitch} > 22^\circ$ (`LOOKING_DOWN`).
- **Looking Up**: $\text{Pitch} < -20^\circ$ (`LOOKING_UP`).

---

## 4. Camera Blocked Preprocessing (OpenCV)

Executed prior to neural inference to detect physical obstruction and blinding glare:

| Metric | Condition | Classification | Physical Mode |
|:---|:---|:---|:---|
| Mean pixel intensity ($I_\mu$) | $I_\mu < 15.0$ | `CAMERA_COVERED_DARK` | Covered lens (hand, dark tape, shutter closed) |
| Mean pixel intensity ($I_\mu$) | $I_\mu > 245.0$ | `CAMERA_COVERED_BRIGHT` | Severe glare (direct flashlight or laser) |
| Standard deviation & Laplacian | $\sigma_I < 8.0$ and $\sigma^2_{Lap} < 15.0$ | `CAMERA_OBSTRUCTED_UNIFORM` | Frosted tape, paper cover, cardboard, flat smudge at any illumination |

---

## 5. Strict "No Eye Tracking" Policy

* **Scope of Measurement**: The Sentinel Vision Engine measures **Head Pose Orientation** (3D cranial orientation and facial plane direction).
* **Prohibition**: The engine **DOES NOT** track eye pupils, gaze vectors, or corneal reflections.
* **Compatibility Aliases**: Fields named `gaze_direction` are maintained strictly as backward-compatible mirrors of `head_direction`. No code, comments, or UI screens claim gaze or eye tracking capability.
