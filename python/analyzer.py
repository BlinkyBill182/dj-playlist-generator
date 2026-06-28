"""
Audio analysis pipeline using Librosa.
Optimized for speed: 22050 Hz, 60s window, chroma_stft.
~5-8 seconds per track on Apple Silicon.
"""

import os
import time
import numpy as np
from pathlib import Path
from typing import Optional, List

try:
    import librosa
    LIBROSA_AVAILABLE = True
except ImportError:
    LIBROSA_AVAILABLE = False
    print("WARNING: librosa not available. Run: pip3 install librosa")

try:
    import essentia.standard as es
    ESSENTIA_AVAILABLE = True
except ImportError:
    ESSENTIA_AVAILABLE = False

ANALYSIS_VERSION = "1.1.0"

# Analyse the first 60 seconds at 22050 Hz (mono).
# At 22050 Hz, 60s = 1.3M samples — fast enough for real-time queuing.
ANALYSIS_SR = 22050
ANALYSIS_DURATION_SEC = 60

HEBREW_UNICODE_RANGE = ('\u0590', '\u05FF')


def detect_is_hebrew(text: str) -> bool:
    if not text:
        return False
    for ch in text:
        if HEBREW_UNICODE_RANGE[0] <= ch <= HEBREW_UNICODE_RANGE[1]:
            return True
    return False


def normalize_peaks(y: np.ndarray, n_points: int = 200) -> List[float]:
    """Downsample audio to N amplitude peaks for waveform display."""
    if len(y) == 0:
        return [0.0] * n_points
    chunk_size = max(1, len(y) // n_points)
    peaks = []
    for i in range(n_points):
        start = i * chunk_size
        chunk = y[start : start + chunk_size]
        peaks.append(float(np.abs(chunk).max()) if len(chunk) > 0 else 0.0)
    max_val = max(peaks) if peaks else 1.0
    return [p / max_val for p in peaks] if max_val > 0 else peaks


def detect_key_librosa(y: np.ndarray, sr: int) -> Optional[str]:
    """Key detection via chroma_stft + Krumhansl-Schmuckler profiles."""
    try:
        # chroma_stft is ~10× faster than chroma_cqt
        chroma = librosa.feature.chroma_stft(y=y, sr=sr, hop_length=1024)
        chroma_mean = chroma.mean(axis=1)

        major_profile = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09,
                                   2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
        minor_profile = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53,
                                   2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
        key_names = ['C', 'C#', 'D', 'D#', 'E', 'F',
                     'F#', 'G', 'G#', 'A', 'A#', 'B']

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


def detect_mood(energy: float, brightness: float, bpm: float) -> str:
    """Heuristic mood from audio features."""
    if energy >= 0.75 and bpm >= 126:
        return "Energetic"
    if energy >= 0.60 and bpm >= 110:
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
    Full audio analysis for a single track.
    Returns a dict compatible with the track_analysis DB schema.
    """
    if not LIBROSA_AVAILABLE:
        raise RuntimeError("librosa is not installed. Run: pip3 install librosa")
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Audio file not found: {file_path}")

    t0 = time.time()

    # Load: 22050 Hz mono, first 60 seconds
    y, sr = librosa.load(file_path, sr=ANALYSIS_SR, mono=True,
                         duration=ANALYSIS_DURATION_SEC)
    duration_ms = int(len(y) / sr * 1000)

    hop = 512

    # ── BPM ──────────────────────────────────────────────────────────────
    tempo, _ = librosa.beat.beat_track(y=y, sr=sr, hop_length=hop)
    bpm = float(np.round(float(tempo), 1))

    # ── Energy (RMS → 0-1) ───────────────────────────────────────────────
    rms = librosa.feature.rms(y=y, frame_length=2048, hop_length=hop).mean()
    energy = float(np.clip(rms / 0.20, 0.0, 1.0))

    # ── Spectral centroid (brightness) ───────────────────────────────────
    spec_centroid = librosa.feature.spectral_centroid(
        y=y, sr=sr, hop_length=hop).mean()
    brightness = float(np.clip(spec_centroid / (sr / 2), 0.0, 1.0))

    # ── Zero-crossing rate (percussiveness) ──────────────────────────────
    zcr = librosa.feature.zero_crossing_rate(y, hop_length=hop).mean()
    percussiveness = float(np.clip(zcr * 10, 0.0, 1.0))

    # ── Warmth (low-freq ratio) using mel spectrogram (faster than STFT) ─
    mel = librosa.feature.melspectrogram(y=y, sr=sr, hop_length=hop, n_mels=128)
    # mel bands 0-8 ≈ 0–300 Hz at 22050 Hz
    low_energy = mel[:8, :].mean()
    total_energy = mel.mean() + 1e-10
    warmth = float(np.clip(low_energy / total_energy, 0.0, 1.0))

    # ── Key ───────────────────────────────────────────────────────────────
    key_detected = detect_key_librosa(y, sr)

    # ── Danceability heuristic ────────────────────────────────────────────
    danceability = float(np.clip(energy * 0.6 + (1.0 - percussiveness) * 0.4,
                                 0.0, 1.0))

    # ── Waveform peaks ────────────────────────────────────────────────────
    waveform_peaks = normalize_peaks(y, n_points=200)

    # ── Essentia (optional) ───────────────────────────────────────────────
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
            features, _ = extractor(file_path)
            try:
                genre_probs = {
                    "Electronic": features["highlevel.genre_electronic.all.Electronic"],
                    "Hip Hop":    features["highlevel.genre_rosamerica.all.hip"],
                    "Pop":        features["highlevel.genre_rosamerica.all.pop"],
                    "Rock":       features["highlevel.genre_rosamerica.all.roc"],
                    "Jazz":       features["highlevel.genre_rosamerica.all.jaz"],
                    "Classical":  features["highlevel.genre_rosamerica.all.cla"],
                }
                genre = max(genre_probs, key=genre_probs.get)  # type: ignore
            except Exception:
                pass
            try:
                moods = {
                    "Happy":      features["highlevel.mood_happy.all.happy"],
                    "Sad":        features["highlevel.mood_sad.all.sad"],
                    "Relaxed":    features["highlevel.mood_relaxed.all.relaxed"],
                    "Aggressive": features["highlevel.mood_aggressive.all.aggressive"],
                }
                mood_override = max(moods, key=moods.get)  # type: ignore
            except Exception:
                pass
            try:
                danceability = float(
                    features["highlevel.danceability.all.danceable"])
            except Exception:
                pass
        except Exception as e:
            print(f"Essentia analysis failed: {e}")

    mood = mood_override or detect_mood(energy, brightness, bpm)
    is_hebrew = detect_is_hebrew(title) or detect_is_hebrew(artist)

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
        "elapsed_sec": round(time.time() - t0, 2),
    }
