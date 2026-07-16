"""
stable_tracker.py – StablePoseTracker with EMA smoothing, jump rejection,
and person anchoring. Also contains the video extraction + skeleton drawing pipeline.

Extracted from notebook cells 11-12.
"""

import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

from pose_models import (
    mp_landmarks_to_coco17,
    _load_movenet_lightning, _load_movenet_thunder,
    _movenet_infer, _yolo_infer,
)


# ── COCO-17 skeleton connections ──────────────────────────────────────────────

COCO17_CONNECTIONS = [
    (0, 1), (0, 2), (1, 3), (2, 4),            # face
    (5, 6), (5, 7), (7, 9), (6, 8), (8, 10),   # arms
    (5, 11), (6, 12), (11, 12),                 # torso
    (11, 13), (13, 15), (12, 14), (14, 16),     # legs
]


class StablePoseTracker:
    """
    Wraps raw kp17 output with:
      1. Person anchoring – pick closest person to last centroid (for YOLO)
      2. EMA smoothing – exponential moving average on x,y
      3. Jump rejection – discard if centroid shifts too much
      4. Freeze cap – reset after MAX_FREEZE frames without detection
    """
    MAX_FREEZE = 10

    def __init__(self, ema_alpha=0.60, jump_threshold=0.25):
        self.ema_alpha = ema_alpha
        self.jump_threshold = jump_threshold
        self._prev_kp = None
        self._prev_centroid = None
        self._freeze_count = 0

    def update(self, raw_kp17):
        """Feed raw kp17 (17,3) or None. Returns stabilised kp17 or None."""
        if raw_kp17 is None:
            self._freeze_count += 1
            if self._freeze_count > self.MAX_FREEZE:
                self.reset()
                return None
            return self._prev_kp

        conf_mask = raw_kp17[:, 2] > 0.15
        if conf_mask.sum() < 5:
            self._freeze_count += 1
            return self._prev_kp

        centroid = raw_kp17[conf_mask, :2].mean(axis=0)

        if self._prev_centroid is not None:
            shift = float(np.linalg.norm(centroid - self._prev_centroid))
            if shift > self.jump_threshold:
                self._freeze_count += 1
                return self._prev_kp

        smoothed = raw_kp17.copy()
        if self._prev_kp is not None:
            a = self.ema_alpha
            smoothed[:, :2] = a * raw_kp17[:, :2] + (1.0 - a) * self._prev_kp[:, :2]
            smoothed[:, 2] = raw_kp17[:, 2]

        self._prev_kp = smoothed
        self._prev_centroid = smoothed[:, :2].mean(axis=0)
        self._freeze_count = 0
        return smoothed

    def get_anchor(self):
        """Return current centroid for YOLO person selection."""
        return self._prev_centroid

    def reset(self):
        self._prev_kp = None
        self._prev_centroid = None
        self._freeze_count = 0


# ── Skeleton drawing ──────────────────────────────────────────────────────────

def draw_kp17(image, kp17, connections, joint_colors=None):
    """Draw COCO-17 skeleton on image."""
    if kp17 is None:
        return image
    h, w = image.shape[:2]
    pts = [(int(kp17[i, 0] * w), int(kp17[i, 1] * h)) for i in range(17)]
    for s, e in connections:
        if (0 <= pts[s][0] < w and 0 <= pts[s][1] < h and
                0 <= pts[e][0] < w and 0 <= pts[e][1] < h):
            cv2.line(image, pts[s], pts[e], (0, 255, 0), 2)
    for i, pt in enumerate(pts):
        if 0 <= pt[0] < w and 0 <= pt[1] < h:
            col = (joint_colors[i] if joint_colors and i < len(joint_colors)
                   else (0, 0, 255))
            cv2.circle(image, pt, 5, col, -1)
    return image


# ── Raw extraction per model ─────────────────────────────────────────────────

def _raw_extract(frame_bgr, model_name, mp_landmarker, frame_idx, fps, tracker):
    """Get raw kp17 from chosen model for one frame."""
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
        return _movenet_infer(_load_movenet_lightning(), frame_bgr, 192)

    elif model_name == 'MoveNet Thunder':
        return _movenet_infer(_load_movenet_thunder(), frame_bgr, 256)

    elif model_name == 'YOLOv8n-Pose':
        anchor = tracker.get_anchor() if tracker else None
        return _yolo_infer(frame_bgr, anchor_centroid=anchor)

    return None


# ── Full video extraction + skeleton drawing ──────────────────────────────────

def extract_and_draw_video(input_video_path, output_video_path,
                           chosen_model_name, mp_model_path,
                           progress_callback=None):
    """
    Run chosen model on every frame, stabilise with StablePoseTracker,
    draw skeleton, return per-frame kp17 list.

    progress_callback: optional callable(percent: float) for progress updates.
    """
    # Setup MediaPipe VIDEO-mode landmarker if needed
    mp_landmarker = None
    mp_ctx = None
    if chosen_model_name == 'MediaPipe BlazePose':
        base_options = python.BaseOptions(model_asset_path=mp_model_path)
        options = vision.PoseLandmarkerOptions(
            base_options=base_options,
            running_mode=vision.RunningMode.VIDEO,
            num_poses=1,
            min_pose_detection_confidence=0.5,
            min_pose_presence_confidence=0.5,
            min_tracking_confidence=0.5,
        )
        mp_ctx = vision.PoseLandmarker.create_from_options(options)
        mp_landmarker = mp_ctx.__enter__()

    cap = cv2.VideoCapture(input_video_path)
    orig_fps = int(cap.get(cv2.CAP_PROP_FPS)) or 30
    target_fps = 30
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(output_video_path, fourcc, target_fps, (width, height))

    tracker = StablePoseTracker(ema_alpha=0.60, jump_threshold=0.25)

    all_kp17 = []
    frame_idx = 0
    out_cnt = 0

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break

        raw_kp17 = _raw_extract(frame, chosen_model_name,
                                mp_landmarker, frame_idx, orig_fps, tracker)
        stable_kp17 = tracker.update(raw_kp17)

        annotated = frame.copy()
        if stable_kp17 is not None:
            annotated = draw_kp17(annotated, stable_kp17, COCO17_CONNECTIONS)
        all_kp17.append(stable_kp17)

        while (out_cnt / target_fps) < ((frame_idx + 1) / orig_fps):
            out.write(annotated)
            out_cnt += 1

        if progress_callback and frame_idx % orig_fps == 0:
            pct = frame_idx / max(total_frames, 1) * 100
            progress_callback(pct)

        frame_idx += 1

    cap.release()
    out.release()
    if mp_ctx is not None:
        mp_ctx.__exit__(None, None, None)

    if progress_callback:
        progress_callback(100.0)

    return all_kp17
