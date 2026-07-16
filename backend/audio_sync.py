"""
audio_sync.py – Audio extraction and cross-correlation sync offset detection.

Extracted from notebook cells 7-8.
"""

import numpy as np
import librosa
from scipy import signal
from moviepy.editor import VideoFileClip


def extract_audio(video_path: str, output_audio_path: str) -> str:
    """Extract audio track from a video file and save as WAV."""
    video = VideoFileClip(video_path)
    if video.audio is not None:
        video.audio.write_audiofile(output_audio_path, verbose=False, logger=None)
    else:
        raise ValueError(f"No audio track found in {video_path}")
    video.close()
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
