"""
audio_sync.py – Audio extraction and cross-correlation sync offset detection.

Extracted from notebook cells 7-8.
"""

import os
import subprocess
import imageio_ffmpeg
import numpy as np
import librosa
from scipy import signal


def extract_audio(video_path: str, output_audio_path: str) -> str:
    """Extract audio track from a video file and save as WAV using FFmpeg."""
    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    cmd = [
        ffmpeg_exe, '-y', '-i', video_path,
        '-vn', '-acodec', 'pcm_s16le', '-ar', '22050', '-ac', '1',
        output_audio_path
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0 or not os.path.exists(output_audio_path) or os.path.getsize(output_audio_path) == 0:
        raise ValueError(f"No audio track found or FFmpeg failed on {video_path}")
    return output_audio_path


def find_audio_offset(audio1_path: str, audio2_path: str, sr: int = 22050) -> float:
    """
    Find the time offset between two audio files using cross-correlation.

    Returns offset in seconds (positive means audio2 starts after audio1).
    """
    # Load audio files (use first 60 seconds for faster processing)
    y1, _ = librosa.load(audio1_path, sr=sr, duration=60)
    y2, _ = librosa.load(audio2_path, sr=sr, duration=60)

    # Normalize
    y1 = y1 / (np.max(np.abs(y1)) + 1e-8)
    y2 = y2 / (np.max(np.abs(y2)) + 1e-8)

    # Cross-correlation
    correlation = signal.correlate(y1, y2, mode='full', method='fft')
    lags = signal.correlation_lags(len(y1), len(y2), mode='full')

    # Find the lag with maximum correlation
    lag = lags[np.argmax(correlation)]
    offset_seconds = lag / sr

    return offset_seconds

