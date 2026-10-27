"""
Asset generation utility for PostureGuard AI.
Generates a pleasant harmonic reminder chime (.wav) and default application icon
using only Python standard library (wave, math, struct).
Zero external dependencies required!
"""

from __future__ import annotations

import math
import struct
import wave
from pathlib import Path


def generate_chime_wav(output_path: Path) -> None:
    """
    Synthesize a gentle two-tone harmonic notification chime.
    Tone: A440 -> C#554 -> E659 (A Major chord with exponential decay).
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)

    sample_rate = 44100
    duration = 0.65  # seconds
    total_samples = int(sample_rate * duration)

    # Harmonics: fundamental 587 Hz (D5), harmonic 880 Hz (A5), harmonic 1174 Hz (D6)
    f1 = 587.33
    f2 = 880.00
    f3 = 1174.66

    frames = []
    for i in range(total_samples):
        t = float(i) / sample_rate
        # Exponential fade out
        envelope = math.exp(-t * 5.5)

        # Bell attack & harmonic blend
        val = (
            0.55 * math.sin(2.0 * math.pi * f1 * t)
            + 0.30 * math.sin(2.0 * math.pi * f2 * t)
            + 0.15 * math.sin(2.0 * math.pi * f3 * t)
        )
        sample = int(val * envelope * 24000)
        # Clamp to 16-bit signed integer
        sample = max(-32767, min(32767, sample))
        frames.append(struct.pack("<h", sample))

    with wave.open(str(output_path), "wb") as wav_file:
        wav_file.setnchannels(1)  # Mono
        wav_file.setsampwidth(2)  # 16-bit
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(b"".join(frames))

    print(f"Generated chime audio at: {output_path}")


def main() -> None:
    root = Path(__file__).parent.resolve()
    sound_target = root / "assets" / "sounds" / "chime.wav"
    generate_chime_wav(sound_target)


if __name__ == "__main__":
    main()
