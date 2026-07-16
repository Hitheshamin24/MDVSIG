"""
pose_comparison.py – Pose comparison engine using COCO-17 keypoints.

Extracted from notebook cell 13.
"""

import numpy as np


# ── COCO-17 body part groupings ───────────────────────────────────────────────

BODY_PARTS_17 = {
    'Left Arm':  [5, 7, 9],       # L-shoulder, L-elbow, L-wrist
    'Right Arm': [6, 8, 10],      # R-shoulder, R-elbow, R-wrist
    'Left Leg':  [11, 13, 15],    # L-hip, L-knee, L-ankle
    'Right Leg': [12, 14, 16],    # R-hip, R-knee, R-ankle
    'Torso':     [5, 6, 11, 12],  # shoulders + hips
}


def normalize_kp17(kp17):
    """
    Normalise 17-kpt array.  Origin = hip midpoint; scale = torso height.
    Returns (17,2) array or None.
    """
    if kp17 is None:
        return None
    pts = kp17[:, :2].copy()
    hip_mid = (pts[11] + pts[12]) / 2
    shoulder_mid = (pts[5] + pts[6]) / 2
    scale = np.linalg.norm(shoulder_mid - hip_mid) + 1e-8
    return (pts - hip_mid) / scale


def score_body_part(n1, n2, indices):
    """Score match between two normalised kp arrays for given joint indices."""
    if n1 is None or n2 is None:
        return 0.0
    dists = [np.linalg.norm(n1[i] - n2[i]) for i in indices]
    mean_dist = np.mean(dists)
    return max(0.0, 100.0 * (1 - mean_dist))


def compare_frames(kp1, kp2):
    """
    Compare two frames' keypoints and return per-body-part + overall scores.
    Returns dict with 'overall' and each body part name as keys.
    """
    n1 = normalize_kp17(kp1)
    n2 = normalize_kp17(kp2)
    part_scores = {part: score_body_part(n1, n2, idx)
                   for part, idx in BODY_PARTS_17.items()}
    overall = (np.mean(list(part_scores.values()))
               if n1 is not None and n2 is not None else 0.0)
    return {'overall': overall, **part_scores}


def get_joint_colors_17(kp1, kp2, threshold=0.3):
    """
    Get per-joint color coding based on match quality.
    Green = good match, Yellow = okay, Red = poor.
    """
    n1 = normalize_kp17(kp1)
    n2 = normalize_kp17(kp2)
    if n1 is None or n2 is None:
        return [(128, 128, 128)] * 17
    colors = []
    for i in range(17):
        d = np.linalg.norm(n1[i] - n2[i])
        if d < threshold * 0.5:
            colors.append((0, 255, 120))    # green
        elif d < threshold:
            colors.append((0, 200, 255))    # yellow
        else:
            colors.append((0, 0, 255))      # red
    return colors


def compute_average_scores(kp17_v1, kp17_v2, offset):
    """
    Compute average scores across all aligned frames.

    Returns:
        avg_overall: float
        part_averages: dict of part_name → float
    """
    FPS = 30
    offset_frames = int(abs(offset) * FPS)
    test_scores = []
    part_scores_acc = {part: [] for part in BODY_PARTS_17}

    for i in range(min(len(kp17_v1), len(kp17_v2))):
        idx1 = i if offset >= 0 else i - offset_frames
        idx2 = i - offset_frames if offset >= 0 else i
        k1 = kp17_v1[idx1] if 0 <= idx1 < len(kp17_v1) else None
        k2 = kp17_v2[idx2] if 0 <= idx2 < len(kp17_v2) else None
        s = compare_frames(k1, k2)
        if s['overall'] > 0:
            test_scores.append(s['overall'])
            for part in BODY_PARTS_17:
                part_scores_acc[part].append(s[part])

    avg_overall = float(np.mean(test_scores)) if test_scores else 0.0
    part_averages = {
        part: float(np.mean(scores)) if scores else 0.0
        for part, scores in part_scores_acc.items()
    }
    return avg_overall, part_averages
