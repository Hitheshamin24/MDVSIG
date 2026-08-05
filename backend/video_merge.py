"""
video_merge.py – Merge two videos side-by-side with feedback overlay.

Extracted from notebook cell 14.
"""

import os
import cv2
import subprocess
import imageio_ffmpeg
import numpy as np

from pose_comparison import (
    BODY_PARTS_17, compare_frames, get_joint_colors_17,
)
from stable_tracker import draw_kp17, COCO17_CONNECTIONS


def get_grade(score):
    """Convert numeric score to letter grade + color."""
    if score >= 85:
        return 'A', (0, 200, 80)
    if score >= 70:
        return 'B', (0, 200, 255)
    if score >= 55:
        return 'C', (0, 165, 255)
    if score >= 40:
        return 'D', (0, 100, 255)
    return 'F', (0, 0, 220)


def draw_feedback_overlay(merged_frame, scores,
                          w1, w2, h_target, model_name='Best Model'):
    """Draw the scoring overlay on a merged side-by-side frame."""
    frame = merged_frame.copy()
    overall = scores['overall']
    grade, grade_color = get_grade(overall)

    # Dark header bar
    bar_h = 60
    overlay = frame.copy()
    cv2.rectangle(overlay, (0, 0), (frame.shape[1], bar_h), (20, 20, 20), -1)
    cv2.addWeighted(overlay, 0.75, frame, 0.25, 0, frame)

    # Labels
    cv2.putText(frame, 'TEACHER (Reference)', (10, 22),
                cv2.FONT_HERSHEY_SIMPLEX, 0.55, (200, 255, 200), 1, cv2.LINE_AA)
    cv2.putText(frame, f'STUDENT  [{model_name}]', (w1 + 10, 22),
                cv2.FONT_HERSHEY_SIMPLEX, 0.45, (200, 200, 255), 1, cv2.LINE_AA)

    # Score text centered
    score_txt = f'Match: {overall:.0f}%'
    txt_x = (frame.shape[1] - cv2.getTextSize(
        score_txt, cv2.FONT_HERSHEY_SIMPLEX, 0.8, 2)[0][0]) // 2
    cv2.putText(frame, score_txt, (txt_x, 42),
                cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2, cv2.LINE_AA)

    # Grade badge
    badge_x = frame.shape[1] - 55
    cv2.circle(frame, (badge_x, 30), 22, grade_color, -1)
    cv2.putText(frame, grade, (badge_x - 10, 40),
                cv2.FONT_HERSHEY_SIMPLEX, 0.9, (255, 255, 255), 2, cv2.LINE_AA)

    # Body part scores panel (bottom-left)
    panel_y = h_target - 10
    for i, (part, pscore) in enumerate([(k, scores[k]) for k in BODY_PARTS_17]):
        y = panel_y - i * 18
        col = ((0, 200, 80) if pscore >= 85
               else (0, 200, 255) if pscore >= 70
               else (0, 100, 255))
        cv2.putText(frame, f'{part[:9]}: {pscore:.0f}%', (5, y),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.36, col, 1, cv2.LINE_AA)

    return frame


def merge_with_feedback(vid1_path, vid2_path, kp_v1, kp_v2,
                        audio_offset, output_path, audio1_path,
                        model_name='Best Model', progress_callback=None):
    """
    Merge two skeleton videos side-by-side with scoring overlay and audio.

    progress_callback: optional callable(percent: float)
    """
    FPS = 30
    cap1 = cv2.VideoCapture(vid1_path)
    cap2 = cv2.VideoCapture(vid2_path)
    w1 = int(cap1.get(cv2.CAP_PROP_FRAME_WIDTH))
    h1 = int(cap1.get(cv2.CAP_PROP_FRAME_HEIGHT))
    w2 = int(cap2.get(cv2.CAP_PROP_FRAME_WIDTH))
    h2 = int(cap2.get(cv2.CAP_PROP_FRAME_HEIGHT))
    n1 = int(cap1.get(cv2.CAP_PROP_FRAME_COUNT))
    n2 = int(cap2.get(cv2.CAP_PROP_FRAME_COUNT))

    h_target = min(h1, h2)
    w1_r = int(w1 * h_target / h1)
    w2_r = int(w2 * h_target / h2)
    out_w = w1_r + w2_r

    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    tmp_out = output_path + '.tmp.mp4'
    writer = cv2.VideoWriter(tmp_out, fourcc, FPS, (out_w, h_target))

    offset_frames = int(audio_offset * FPS)
    total_out = max(n1, n2 + max(0, offset_frames))
    blank1 = np.zeros((h_target, w1_r, 3), dtype=np.uint8)
    blank2 = np.zeros((h_target, w2_r, 3), dtype=np.uint8)

    all_f1 = []
    all_f2 = []

    def get_f1(idx):
        while len(all_f1) <= idx and cap1.isOpened():
            ret, f = cap1.read()
            if not ret:
                break
            all_f1.append(cv2.resize(f, (w1_r, h_target)))
        return all_f1[idx] if 0 <= idx < len(all_f1) else blank1.copy()

    def get_f2(idx):
        while len(all_f2) <= idx and cap2.isOpened():
            ret, f = cap2.read()
            if not ret:
                break
            all_f2.append(cv2.resize(f, (w2_r, h_target)))
        return all_f2[idx] if 0 <= idx < len(all_f2) else blank2.copy()

    # Render merged frames
    for out_i in range(total_out):
        i1 = out_i
        i2 = out_i - offset_frames
        f1 = get_f1(i1)
        f2 = get_f2(i2)
        k1 = kp_v1[i1] if 0 <= i1 < len(kp_v1) else None
        k2 = kp_v2[i2] if 0 <= i2 < len(kp_v2) else None
        scores = compare_frames(k1, k2)
        jcols = get_joint_colors_17(k1, k2)
        
        # Draw skeletons on individual frames before merging
        f1_drawn = draw_kp17(f1.copy(), k1, COCO17_CONNECTIONS, joint_colors=None)
        f2_drawn = draw_kp17(f2.copy(), k2, COCO17_CONNECTIONS, joint_colors=jcols)
        
        merged = np.hstack([f1_drawn, f2_drawn])
        merged = draw_feedback_overlay(merged, scores,
                                       w1_r, w2_r, h_target, model_name)
        writer.write(merged)

        if progress_callback and out_i % FPS == 0:
            pct = 100 * out_i / max(total_out, 1)
            progress_callback(pct)

    cap1.release()
    cap2.release()
    writer.release()

    # Add audio from teacher video using direct FFmpeg subprocess (ultra-fast)
    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    if os.path.exists(audio1_path) and os.path.getsize(audio1_path) > 0:
        cmd = [
            ffmpeg_exe, '-y',
            '-i', tmp_out,
            '-i', audio1_path,
            '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23',
            '-c:a', 'aac', '-shortest',
            output_path
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode == 0 and os.path.exists(output_path) and os.path.getsize(output_path) > 0:
            if os.path.exists(tmp_out):
                os.remove(tmp_out)
        else:
            if os.path.exists(tmp_out):
                if os.path.exists(output_path):
                    os.remove(output_path)
                os.rename(tmp_out, output_path)
    else:
        if os.path.exists(output_path):
            os.remove(output_path)
        os.rename(tmp_out, output_path)

    if progress_callback:
        progress_callback(100.0)

