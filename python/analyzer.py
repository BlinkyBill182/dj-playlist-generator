"""
Audio analysis pipeline using Librosa (and optionally Essentia).
Called by the FastAPI server for each track.
"""

import os
import time
import numpy as np
from pathlib import Path
from typing import Optional

try:
    import librosa
    LIBROSA_AVAILABLE = True
except ImportError:
    LIBROSA_AVAILABLE = False
    print("WARNING: librosa not available. Run: pip install librosa")

try:
    import essentia.standard as es
    ESSENTIA_AVAILABLE = True
except ImportError:
    ESSENTIA_AVAILABLE = False
    # Essentia optional — Librosa covers most features

ANALYSIS_VERSION = "1.0.0"

# Load only the first 3 minutes for speed (adjust if needed)
ANALYSIS_DURATION_SEC = 180

HEBREW_UNICODE_RANGE = ('\u0590', '\u05FF')


def detect_is_hebrew(text: str) -> bool:
    """Detect if a string contains Hebrew characters."""
    if not text:
        return False
    for ch in text:
        if HEBREW_UNICODE_RANGE[0] <= ch <= HEBREW_UNICODE_RANGE[1]:
            return True
    return False


def normalize_peaks(y: np.ndarray, n_points: int = 200) -> list[float]:
    """Downsample audio to N amplitude peaks for waveform display."""
    if len(y) == 0:
        return [0.0] * n_points
    chunk_size = max(1, len(y) // n_points)
    peaks = []
    for i in range(n_points):
        start = i * chunk_size
        end = start + chunk_size
        chunk = y[start:end]
        if len(chunk) > 0:
            peaks.append(float(np.abs(chunk).max()))
        else:
            peaks.append(0.0)
    # Normalize to 0-1
    max_val = max(peaks) if peaks else 1.0
    if max_val > 0:
        peaks = [p / max_val for p in peaks]
    return peaks


def detect_key_librosa(y: np.ndarray, sr: int) -> Optional[str]:
    """Detect musical key using chroma features."""
    try:
        chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
        chroma_mean = chroma.mean(axis=1)

        # Use Krumhansl-Schmuckler key profiles
        major_profile = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
        minor_profile = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])

        key_names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
        best_score = -np.inf
        best_key = None

        for root in range(12):
            rotated = np.roll(chroma_mean, -root)
            major_corr = float(np.corrcoef(rotated, major_profile)[0, 1])
            minor_corr = float(np.corrcoef(rotated, minor_profile)[0, 1])
            if major_corr > best_score:
                best_score = major_corr
                best_key = f"{key_names[root]} major"
            if minor_corr > best_score:
                best_score = minor_corr
                best_key = f"{key_names[root]} minor"

        return best_key
    except Exception:
        return None


def detect_mood_librosa(energy: float, brightness: float, danceability: float, bpm: float) -> str:
    """Heuristic mood detection from audio features."""
    if energy >= 0.75 and bpm >= 126:
        return "Energetic"
    if energy >= 0.60 and danceability >= 0.60:
        return "Groovy"
    if brightness >= 0.65 and energy >= 0.40:
        return "Happy"
    if brightness <= 0.35 and energy <= 0.40:
        return "Melancholic"
    if energy <= 0.30:
        return "Chill"
    if bpm >= 130 and energy >= 0.65:
        return "Aggressive"
    return "Balanced"


def analyze_track(file_path: str, title: str = "", artist: str = "") -> dict:
    """
    Full audio analysis pipeline for a single track.
    Returns a dict compatible with the track_analysis DB schema.
    """
    if not LIBROSA_AVAILABLE:
        raise RuntimeError("librosa is not installed. Run: pip install librosa")

    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Audio file not found: {file_path}")

    start_time = time.time()

    # Load audio (mono, first ANALYSIS_DURATION_SEC seconds)
    y, sr = librosa.load(file_path, sr=None, mono=True, duration=ANALYSIS_DURATION_SEC)
    duration_ms = int(len(y) / sr * 1000)

    # ---- BPM ----
    tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
    bpm = float(np.round(tempo, 1))

    # ---- Energy (RMS normalized 0–1) ----
    rms = librosa.feature.rms(y=y, frame_length=2048, hop_length=512).mean()
    # Empirical normalization: typical RMS is 0.01–0.2 → map to 0–1
    energy = float(np.clip(rms / 0.2, 0.0, 1.0))

    # ---- Spectral features ----
    # Brightness: spectral centroid (normalized to 0–1 over 0–22kHz)
    spec_centroid = librosa.feature.spectral_centroid(y=y, sr=sr).mean()
    brightness = float(np.clip(spec_centroid / (sr / 2), 0.0, 1.0))

    # Percussiveness: zero-crossing rate (normalized)
    zcr = librosa.feature.zero_crossing_rate(y).mean()
    percussiveness = float(np.clip(zcr * 10, 0.0, 1.0))

    # Warmth: low-frequency energy ratio (below 300 Hz)
    stft = np.abs(librosa.stft(y))
    freqs = librosa.fft_frequencies(sr=sr)
    low_mask = freqs < 300
    warmth = float(np.clip(stft[low_mask].mean() / (stft.mean() + 1e-10), 0.0, 1.0))

    # ---- Key detection ----
    key_detected = detect_key_librosa(y, sr)

    # ---- Danceability (heuristic: beat strength + energy) ----
    beat_strength = librosa.beat.tempo(y=y, sr=sr, aggregate=None).std() if len(y) > sr else 0.0
    danceability = float(np.clip((energy * 0.5 + (1 - float(beat_strength) / 50) * 0.5), 0.0, 1.0))

    # ---- Waveform peaks for visualization ----
    waveform_peaks = normalize_peaks(y, n_points=200)

    # ---- Essentia (optional: Genre, Mood override) ----
    genre = None
    sub_genre = None
    mood_override = None

    if ESSENTIA_AVAILABLE:
        try:
            extractor = es.MusicExtractor(
                lowlevelStats=['mean', 'stdev'],
                rhythmStats=['mean', 'stdev'],
                tonalStats=['mean', 'stdev'],
            )
            features, features_frames = extractor(file_path)

            # Genre (use highlevel if available)
            try:
                genre_probs = {
                    "Electronic": features["highlevel.genre_electronic.all.Electronic"],
                    "Hip Hop":    features["highlevel.genre_rosamerica.all.hip"],
                    "Pop":        features["highlevel.genre_rosamerica.all.pop"],
                    "Rock":       features["highlevel.genre_rosamerica.all.roc"],
                    "Jazz":       features["highlevel.genre_rosamerica.all.jaz"],
                    "Classical":  features["highlevel.genre_rosamerica.all.cla"],
                }
                genre = max(genre_probs, key=genre_probs.get)
            except Exception:
                pass

            # Mood override from Essentia
            try:
                moods = {
                    "Happy":    features["highlevel.mood_happy.all.happy"],
                    "Sad":      features["highlevel.mood_sad.all.sad"],
                    "Relaxed":  features["highlevel.mood_relaxed.all.relaxed"],
                    "Aggressive": features["highlevel.mood_aggressive.all.aggressive"],
                }
                mood_override = max(moods, key=moods.get)
            except Exception:
                pass

            # Danceability from Essentia
            try:
                danceability = float(features["highlevel.danceability.all.danceable"])
            except Exception:
                pass

        except Exception as e:
            print(f"Essentia analysis failed: {e}")

    # ---- Mood (heuristic if Essentia unavailable) ----
    mood = mood_override or detect_mood_librosa(energy, brightness, danceability, bpm)

    # ---- Hebrew detection ----
    is_hebrew = detect_is_hebrew(title) or detect_is_hebrew(artist)

    elapsed = time.time() - start_time

    return {
        "file_path": file_path,
        "duration_ms": duration_ms,
        "bpm": bpm,
        "energy": round(energy, 4),
        "key_detected": key_detected,
        "brightness": round(brightness, 4),
        "percussiveness": round(percussiveness, 4),
        "warmth": round(warmth, 4),
        "waveform_peaks": waveform_peaks,
        "genre": genre,
        "sub_genre": sub_genre,
        "mood": mood,
        "danceability": round(danceability, 4),
        "is_hebrew": is_hebrew,
        "language": "he" if is_hebrew else "en",
        "analysis_version": ANALYSIS_VERSION,
        "elapsed_sec": round(elapsed, 2),
    }
