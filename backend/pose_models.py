"""
pose_models.py – Model registry: MediaPipe BlazePose, MoveNet Lightning/Thunder, YOLOv8n-Pose.

Extracted from notebook cells 4, 9.
All models output COCO-17 keypoints as (17,3) numpy arrays [x_norm, y_norm, confidence].
"""

import cv2
import time
import numpy as np
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

# ── COCO-17 keypoint order ────────────────────────────────────────────────────
# 0: nose   1: L_eye  2: R_eye  3: L_ear   4: R_ear
# 5: L_shldr 6: R_shldr 7: L_elbow 8: R_elbow 9: L_wrist 10: R_wrist
# 11: L_hip  12: R_hip  13: L_knee  14: R_knee  15: L_ankle 16: R_ankle

# MediaPipe 33-kpt → COCO-17 mapping
MP_TO_COCO17 = [0, 2, 5, 7, 8, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]

# ── Lazy-loaded model singletons ──────────────────────────────────────────────
_movenet_lightning = None
_movenet_thunder = None
_yolo_model = None


# ── MediaPipe helpers ─────────────────────────────────────────────────────────

def mp_landmarks_to_coco17(mp_lm_list):
    """Convert MediaPipe NormalizedLandmark list → (17,3) numpy array (x,y,vis)."""
    if mp_lm_list is None:
        return None
    pts = []
    for coco_i, mp_i in enumerate(MP_TO_COCO17):
        lm = mp_lm_list[mp_i]
        pts.append([lm.x, lm.y, getattr(lm, 'visibility', 1.0)])
    return np.array(pts, dtype=np.float32)


# ── MoveNet helpers ───────────────────────────────────────────────────────────

def _load_movenet_lightning():
    global _movenet_lightning
    if _movenet_lightning is None:
        import tensorflow_hub as hub
        print("  Loading MoveNet Lightning from TF Hub...")
        _movenet_lightning = hub.load(
            "https://tfhub.dev/google/movenet/singlepose/lightning/4"
        )
    return _movenet_lightning


def _load_movenet_thunder():
    global _movenet_thunder
    if _movenet_thunder is None:
        import tensorflow_hub as hub
        print("  Loading MoveNet Thunder from TF Hub...")
        _movenet_thunder = hub.load(
            "https://tfhub.dev/google/movenet/singlepose/thunder/4"
        )
    return _movenet_thunder


def _movenet_infer(model, frame_bgr, input_size):
    """Run a MoveNet model on one BGR frame. Returns (17,3) array or None."""
    import tensorflow as tf
    rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
    img = tf.image.resize_with_pad(tf.expand_dims(rgb, axis=0), input_size, input_size)
    img = tf.cast(img, dtype=tf.int32)
    outputs = model.signatures['serving_default'](img)
    kpts = outputs['output_0'].numpy()[0, 0]  # (17, 3) → y,x,conf
    # Convert from (y,x,conf) → (x,y,conf)
    result = np.stack([kpts[:, 1], kpts[:, 0], kpts[:, 2]], axis=1)
    if result[:, 2].mean() < 0.1:
        return None
    return result.astype(np.float32)


# ── YOLOv8 Pose helpers ──────────────────────────────────────────────────────

def _load_yolo():
    global _yolo_model
    if _yolo_model is None:
        from ultralytics import YOLO
        print("  Loading YOLOv8n-Pose...")
        _yolo_model = YOLO('yolov8n-pose.pt')
    return _yolo_model


def _yolo_infer(frame_bgr, anchor_centroid=None):
    """
    Run YOLOv8-Pose on one BGR frame.
    When multiple people detected, pick the one closest to anchor_centroid
    (for temporal consistency) or highest mean confidence.
    Returns (17,3) [x_norm, y_norm, conf] or None.
    """
    model = _load_yolo()
    results = model(frame_bgr, verbose=False)
    if not results or results[0].keypoints is None:
        return None
    kps = results[0].keypoints
    n_persons = kps.data.shape[0]
    if n_persons == 0:
        return None

    h, w = frame_bgr.shape[:2]
    best_idx = 0
    best_score = -1.0

    for pi in range(n_persons):
        kp_raw = kps.data[pi].cpu().numpy().copy()
        kp_raw[:, 0] /= w
        kp_raw[:, 1] /= h
        mean_conf = float(kp_raw[:, 2].mean())
        if anchor_centroid is not None:
            centroid = kp_raw[:, :2].mean(axis=0)
            dist = float(np.linalg.norm(centroid - anchor_centroid))
            score = mean_conf - 0.5 * dist
        else:
            score = mean_conf
        if score > best_score:
            best_score = score
            best_idx = pi

    kp = kps.data[best_idx].cpu().numpy().copy()
    kp[:, 0] /= w
    kp[:, 1] /= h
    if kp[:, 2].mean() < 0.1:
        return None
    return kp.astype(np.float32)


# ── Unified inference interface ───────────────────────────────────────────────

def extract_frame_kp17(frame_bgr, model_name, mp_landmarker=None,
                       frame_idx=0, fps=30, anchor_centroid=None):
    """
    Extract COCO-17 keypoints from a single BGR frame using the specified model.
    Returns (17,3) numpy array [x_norm, y_norm, confidence] or None.
    """
    if model_name == 'MediaPipe BlazePose':
        if mp_landmarker is None:
            return None
        rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        ts_ms = int((frame_idx / fps) * 1000)
        res = mp_landmarker.detect_for_video(mp_img, ts_ms)
        if res.pose_landmarks:
            return mp_landmarks_to_coco17(res.pose_landmarks[0])
        return None

    elif model_name == 'MoveNet Lightning':
        model = _load_movenet_lightning()
        return _movenet_infer(model, frame_bgr, 192)

    elif model_name == 'MoveNet Thunder':
        model = _load_movenet_thunder()
        return _movenet_infer(model, frame_bgr, 256)

    elif model_name == 'YOLOv8n-Pose':
        return _yolo_infer(frame_bgr, anchor_centroid=anchor_centroid)

    return None


# ── Smoothness metric ────────────────────────────────────────────────────────

def _smoothness(traj):
    """Mean 1-normalised jitter across consecutive detected frames."""
    valid = [k for k in traj if k is not None]
    if len(valid) < 2:
        return 0.0
    diffs = [np.mean(np.linalg.norm(valid[i + 1] - valid[i], axis=1))
             for i in range(len(valid) - 1)]
    return float(np.mean([max(0, 1 - d / 0.5) for d in diffs]))


# ── Benchmark functions ───────────────────────────────────────────────────────

def benchmark_mediapipe(frames, mp_model_path):
    """Benchmark MediaPipe BlazePose on sample frames."""
    base_options = python.BaseOptions(model_asset_path=mp_model_path)
    options = vision.PoseLandmarkerOptions(
        base_options=base_options,
        running_mode=vision.RunningMode.IMAGE,
        num_poses=1,
        min_pose_detection_confidence=0.3,
    )
    det, confs = 0, []
    kpt_traj = []
    t0 = time.time()
    with vision.PoseLandmarker.create_from_options(options) as lm:
        for frame in frames:
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            res = lm.detect(mp_img)
            if res.pose_landmarks:
                kp17 = mp_landmarks_to_coco17(res.pose_landmarks[0])
                det += 1
                vis = [getattr(res.pose_landmarks[0][i], 'visibility', 1.0)
                       for i in range(33)]
                confs.append(np.mean(vis))
                kpt_traj.append(kp17[:, :2])
            else:
                kpt_traj.append(None)
    fps_speed = len(frames) / (time.time() - t0 + 1e-8)
    det_rate = det / len(frames)
    avg_conf = np.mean(confs) if confs else 0.0
    smooth = _smoothness(kpt_traj)
    return det_rate, avg_conf, smooth, fps_speed


def benchmark_movenet(frames, loader_fn, input_size):
    """Benchmark a MoveNet variant on sample frames."""
    model = loader_fn()
    det, confs = 0, []
    kpt_traj = []
    t0 = time.time()
    for frame in frames:
        kp = _movenet_infer(model, frame, input_size)
        if kp is not None:
            det += 1
            confs.append(float(kp[:, 2].mean()))
            kpt_traj.append(kp[:, :2])
        else:
            kpt_traj.append(None)
    fps_speed = len(frames) / (time.time() - t0 + 1e-8)
    return (det / len(frames),
            np.mean(confs) if confs else 0,
            _smoothness(kpt_traj),
            fps_speed)


def benchmark_yolo(frames):
    """Benchmark YOLOv8n-Pose on sample frames."""
    det, confs = 0, []
    kpt_traj = []
    t0 = time.time()
    for frame in frames:
        kp = _yolo_infer(frame)
        if kp is not None:
            det += 1
            confs.append(float(kp[:, 2].mean()))
            kpt_traj.append(kp[:, :2])
        else:
            kpt_traj.append(None)
    fps_speed = len(frames) / (time.time() - t0 + 1e-8)
    return (det / len(frames),
            np.mean(confs) if confs else 0,
            _smoothness(kpt_traj),
            fps_speed)


def run_all_benchmarks(sample_frames, mp_model_path):
    """
    Run all 4 model benchmarks and return results dict + best model name.

    Returns:
        benchmark_results: dict of model_name → (det_rate, avg_conf, smoothness, fps)
        best_model_name: str
        composite_scores: dict of model_name → composite score
    """
    benchmark_results = {}

    print("[1/4] Benchmarking MediaPipe BlazePose Heavy...")
    benchmark_results['MediaPipe BlazePose'] = benchmark_mediapipe(
        sample_frames, mp_model_path)

    print("[2/4] Benchmarking MoveNet Lightning (192px)...")
    benchmark_results['MoveNet Lightning'] = benchmark_movenet(
        sample_frames, _load_movenet_lightning, 192)

    print("[3/4] Benchmarking MoveNet Thunder (256px)...")
    benchmark_results['MoveNet Thunder'] = benchmark_movenet(
        sample_frames, _load_movenet_thunder, 256)

    print("[4/4] Benchmarking YOLOv8n-Pose...")
    benchmark_results['YOLOv8n-Pose'] = benchmark_yolo(sample_frames)

    # Compute composite scores
    model_names = list(benchmark_results.keys())
    det_rates = [benchmark_results[m][0] * 100 for m in model_names]
    avg_confs = [benchmark_results[m][1] * 100 for m in model_names]
    smoothness = [benchmark_results[m][2] * 100 for m in model_names]
    fps_vals = [benchmark_results[m][3] for m in model_names]

    fps_norm = [min(f / max(fps_vals + [1]), 1.0) * 100 for f in fps_vals]
    composite = [0.35 * d + 0.30 * c + 0.25 * s + 0.10 * f
                 for d, c, s, f in zip(det_rates, avg_confs, smoothness, fps_norm)]

    composite_scores = dict(zip(model_names, composite))
    best_model_name = model_names[composite.index(max(composite))]

    return benchmark_results, best_model_name, composite_scores
