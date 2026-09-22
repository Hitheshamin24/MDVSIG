"""
pipeline.py – Main processing orchestrator that chains all steps.

Steps:
1. Normalise videos to 30fps (FFmpeg)
2. Extract audio + find sync offset
3. Benchmark all 4 pose models, pick best
4. Extract keypoints with StablePoseTracker
5. Compute pose comparison scores
6. Merge videos with feedback overlay
7. Generate model comparison chart
"""

import os
import cv2
import json
import subprocess
import warnings
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches

from audio_sync import extract_audio, find_audio_offset
from pose_models import run_all_benchmarks
from stable_tracker import extract_and_draw_video
from pose_comparison import compute_average_scores, BODY_PARTS_17
from video_merge import merge_with_feedback

warnings.filterwarnings('ignore')

SAMPLE_FRAMES = 60  # frames to benchmark per model


def _normalize_video(input_path, output_path):
    """Normalise video to 30fps using FFmpeg."""
    import imageio_ffmpeg
    cmd = [
        imageio_ffmpeg.get_ffmpeg_exe(), '-y', '-i', input_path,
        '-vf', 'fps=30', '-vsync', 'cfr',
        '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23',
        output_path
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"FFmpeg failed: {result.stderr}")
    return output_path


def _collect_sample_frames(video_path, num_frames=60):
    """Extract evenly-spaced sample frames for benchmarking."""
    cap = cv2.VideoCapture(video_path)
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    step = max(1, total // num_frames)
    sample_bgr = []
    fi = 0
    while cap.isOpened() and len(sample_bgr) < num_frames:
        ret, frame = cap.read()
        if not ret:
            break
        if fi % step == 0:
            sample_bgr.append(frame)
        fi += 1
    cap.release()
    return sample_bgr


def _download_mediapipe_model(job_dir):
    """Download MediaPipe pose landmarker model if not already present."""
    model_path = os.path.join(job_dir, 'pose_landmarker.task')
    if not os.path.exists(model_path):
        import urllib.request
        url = ("https://storage.googleapis.com/mediapipe-models/"
               "pose_landmarker/pose_landmarker_heavy/float16/1/"
               "pose_landmarker_heavy.task")
        urllib.request.urlretrieve(url, model_path)
    return model_path


def _generate_chart(benchmark_results, job_dir):
    """Generate model comparison chart image."""
    model_names = list(benchmark_results.keys())
    det_rates = [benchmark_results[m][0] * 100 for m in model_names]
    avg_confs = [benchmark_results[m][1] * 100 for m in model_names]
    smoothness = [benchmark_results[m][2] * 100 for m in model_names]
    fps_vals = [benchmark_results[m][3] for m in model_names]

    fps_norm = [min(f / max(fps_vals + [1]), 1.0) * 100 for f in fps_vals]
    composite = [0.35 * d + 0.30 * c + 0.25 * s + 0.10 * f
                 for d, c, s, f in zip(det_rates, avg_confs, smoothness, fps_norm)]

    PALETTE = ['#4f86c6', '#f4a261', '#2a9d8f', '#e76f51']
    short = ['MediaPipe', 'MoveNet-L', 'MoveNet-T', 'YOLOv8n']

    fig, axes = plt.subplots(2, 3, figsize=(16, 9))
    fig.patch.set_facecolor('#0f0f1a')
    for ax in axes.flat:
        ax.set_facecolor('#1a1a2e')
        ax.tick_params(colors='#cccccc', labelsize=9)
        for spine in ax.spines.values():
            spine.set_edgecolor('#444466')

    def bar_chart(ax, values, title, unit='%', ylim=None):
        bars = ax.bar(short, values, color=PALETTE,
                      edgecolor='#ffffff22', linewidth=0.5)
        ax.set_title(title, color='white', fontsize=11,
                     fontweight='bold', pad=8)
        ax.set_ylim(ylim or (0, 105))
        ax.set_ylabel(unit, color='#aaaacc', fontsize=8)
        for bar, v in zip(bars, values):
            label = f'{v:.1f}%' if unit == '%' else f'{v:.1f} fps'
            ax.text(bar.get_x() + bar.get_width() / 2,
                    bar.get_height() + 1.5, label,
                    ha='center', va='bottom', color='white',
                    fontsize=8, fontweight='bold')
        ax.set_xticks(range(len(short)))
        ax.set_xticklabels(short, color='#cccccc', fontsize=8)
        best = values.index(max(values))
        bars[best].set_edgecolor('#ffd700')
        bars[best].set_linewidth(2.5)

    bar_chart(axes[0, 0], det_rates, 'Detection Rate', '%')
    bar_chart(axes[0, 1], avg_confs, 'Avg Keypoint Confidence', '%')
    bar_chart(axes[0, 2], smoothness, 'Temporal Smoothness', '%')
    bar_chart(axes[1, 0], fps_vals, 'Inference Speed', 'fps',
              ylim=(0, max(fps_vals) * 1.2))

    # Radar chart
    ax_radar = axes[1, 1]
    ax_radar.remove()
    ax_radar = fig.add_subplot(2, 3, 5, polar=True)
    ax_radar.set_facecolor('#1a1a2e')
    categories = ['Detection', 'Confidence', 'Smoothness', 'Speed', 'Composite']
    N = len(categories)
    angles = [n / float(N) * 2 * np.pi for n in range(N)]
    angles += angles[:1]

    ax_radar.set_theta_offset(np.pi / 2)
    ax_radar.set_theta_direction(-1)
    ax_radar.set_xticks(angles[:-1])
    ax_radar.set_xticklabels(categories, color='#cccccc', size=8)
    ax_radar.set_ylim(0, 100)
    ax_radar.set_yticks([25, 50, 75, 100])
    ax_radar.set_yticklabels(['25', '50', '75', '100'], color='#888888', size=6)
    ax_radar.spines['polar'].set_color('#444466')
    ax_radar.grid(color='#333355', linewidth=0.5)
    ax_radar.set_title('Radar Comparison', color='white',
                       fontsize=11, fontweight='bold', pad=15)

    for i, (name, col) in enumerate(zip(model_names, PALETTE)):
        vals = [det_rates[i], avg_confs[i], smoothness[i],
                fps_norm[i], composite[i]]
        vals += vals[:1]
        ax_radar.plot(angles, vals, color=col, linewidth=2, linestyle='solid')
        ax_radar.fill(angles, vals, color=col, alpha=0.15)

    bar_chart(axes[1, 2], composite, 'Composite Score (Best → Used)', '%')

    patches = [mpatches.Patch(color=c, label=n)
               for c, n in zip(PALETTE, model_names)]
    fig.legend(handles=patches, loc='upper center', ncol=4,
               framealpha=0.2, edgecolor='#666688',
               labelcolor='white', fontsize=9, bbox_to_anchor=(0.5, 0.98))

    fig.suptitle('Pose Estimation Model Comparison — Dance Sync Feedback',
                 color='white', fontsize=14, fontweight='bold', y=1.01)
    plt.tight_layout()

    chart_path = os.path.join(job_dir, 'model_comparison_chart.png')
    plt.savefig(chart_path, dpi=150, bbox_inches='tight', facecolor='#0f0f1a')
    plt.close()
    return chart_path


def run_pipeline(video1_path, video2_path, job_dir, progress_callback=None):
    """
    Run the full dance video sync pipeline.

    Args:
        video1_path: path to teacher video
        video2_path: path to student video
        job_dir: directory for all intermediate/output files
        progress_callback: callable(step_name: str, percent: float, message: str)

    Returns:
        dict with results (scores, paths, etc.)
    """
    def report(step, pct, msg=''):
        if progress_callback:
            progress_callback(step, pct, msg)
        print(f"[{step}] {pct:.0f}% {msg}")

    # ── Step 1: Normalise videos to 30fps ─────────────────────────────────────
    report('normalize', 0, 'Normalising Video 1 to 30fps...')
    v1_fixed = os.path.join(job_dir, 'video1_fixed.mp4')
    _normalize_video(video1_path, v1_fixed)
    report('normalize', 50, 'Normalising Video 2 to 30fps...')
    v2_fixed = os.path.join(job_dir, 'video2_fixed.mp4')
    _normalize_video(video2_path, v2_fixed)
    report('normalize', 100, 'Videos normalised.')

    # ── Step 2: Extract audio + find offset ───────────────────────────────────
    report('audio_sync', 0, 'Extracting audio from videos...')
    audio1 = os.path.join(job_dir, 'audio1.wav')
    audio2 = os.path.join(job_dir, 'audio2.wav')
    try:
        extract_audio(v1_fixed, audio1)
        extract_audio(v2_fixed, audio2)
        report('audio_sync', 50, 'Finding audio sync offset...')
        offset = find_audio_offset(audio1, audio2)
    except ValueError:
        # No audio track — assume zero offset
        offset = 0.0
    report('audio_sync', 100, f'Offset: {offset:.3f}s')

    # ── Step 3: Skip benchmark and use YOLOv8n-Pose ───────────────────────────
    report('benchmark', 0, 'Skipping multi-model benchmark (using YOLOv8n-Pose only)...')
    best_model_name = 'YOLOv8n-Pose'
    mp_model_path = None
    chart_path = None
    report('benchmark', 100, f'Model selected: {best_model_name}')

    # ── Step 4: Extract keypoints ─────────────────────────────────────────────
    report('extract_v1', 0, 'Extracting keypoints from Video 1 (Teacher)...')
    kp17_v1 = extract_and_draw_video(
        v1_fixed, None, best_model_name, mp_model_path,
        progress_callback=lambda pct: report('extract_v1', pct, '')
    )
    report('extract_v1', 100, f'{len(kp17_v1)} frames processed.')

    report('extract_v2', 0, 'Extracting keypoints from Video 2 (Student)...')
    kp17_v2 = extract_and_draw_video(
        v2_fixed, None, best_model_name, mp_model_path,
        progress_callback=lambda pct: report('extract_v2', pct, '')
    )
    report('extract_v2', 100, f'{len(kp17_v2)} frames processed.')

    # ── Step 5: Compute scores ────────────────────────────────────────────────
    report('scoring', 0, 'Computing pose comparison scores...')
    avg_overall, part_averages = compute_average_scores(kp17_v1, kp17_v2, offset)
    report('scoring', 100, f'Overall match: {avg_overall:.1f}%')

    # ── Step 6: Merge videos ──────────────────────────────────────────────────
    output_video = os.path.join(job_dir, 'merged_dance_with_feedback.mp4')
    report('merge', 0, 'Merging videos with feedback overlay...')
    merge_with_feedback(
        v1_fixed, v2_fixed, kp17_v1, kp17_v2,
        offset, output_video, audio1,
        model_name=best_model_name,
        progress_callback=lambda pct: report('merge', pct, '')
    )
    report('merge', 100, 'Merge complete!')


    # ── Step 7: Build results ─────────────────────────────────────────────────
    report('done', 100, 'Processing complete!')

    results = {
        'status': 'complete',
        'best_model': best_model_name,
        'audio_offset': offset,
        'overall_score': round(avg_overall, 1),
        'part_scores': {k: round(v, 1) for k, v in part_averages.items()},
        'benchmark': {},
        # Absolute local path — used by app.py to upload to Cloudinary, then deleted
        'output_video_path': output_video,
        # Friendly filename (kept for display purposes)
        'output_video': 'merged_dance_with_feedback.mp4',
        'chart_image': None,
        'video1_frames': len(kp17_v1),
        'video2_frames': len(kp17_v2),
    }

    return results
