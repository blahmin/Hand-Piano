"""Build local chord samples from the user-selected recording and cue points.

Usage: python scripts/extract-chords.py path/to/recording.mp4
Requires FFmpeg on PATH. No Python packages or runtime server are required.
"""
import argparse
import array
import hashlib
import json
import math
from pathlib import Path
import shutil
import subprocess
import sys
import wave

CUES = [("C", 15), ("Dm", 30), ("Em", 45), ("F", 60), ("G", 75),
        ("Am", 90), ("D", 105), ("A", 120), ("E", 135), ("Bm", 0)]
RATE = 44100
SOURCE_URL = "https://www.youtube.com/watch?v=qWX31yz68Ns"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[1] / "public/audio/chords")
    args = parser.parse_args()
    media = args.input.resolve(strict=True)
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        parser.error("FFmpeg is required to prepare samples.")
    args.output.mkdir(parents=True, exist_ok=True)
    samples = []
    for label, cue in CUES:
        command = [ffmpeg, "-v", "error", "-ss", str(cue), "-i", str(media), "-t", "4", "-vn", "-ac", "1", "-ar", str(RATE), "-f", "f32le", "pipe:1"]
        data = array.array("f", subprocess.run(command, check=True, capture_output=True).stdout)
        if sys.byteorder != "little":
            data.byteswap()
        frame = RATE // 100
        energy = [math.sqrt(sum(value * value for value in data[offset:offset + frame]) / frame) for offset in range(0, len(data) - frame, frame)]
        threshold = max(max(energy) * .025, .0005)
        first = next((index for index, value in enumerate(energy) if value > threshold), 0)
        trim = max(0, first * frame - int(.015 * RATE))
        clip = data[trim:trim + int(3.2 * RATE)]
        peak = max(abs(value) for value in clip)
        if peak < .001:
            raise ValueError(f"No audible {label} chord at {cue} seconds")
        gain = .85 / peak
        pcm = array.array("h")
        for index, value in enumerate(clip):
            fade = min(1, index / (.003 * RATE), (len(clip) - 1 - index) / (.15 * RATE))
            pcm.append(round(max(-1, min(1, value * gain * fade)) * 32767))
        if sys.byteorder != "little":
            pcm.byteswap()
        filename = f"{label.lower()}.wav"
        destination = args.output / filename
        with wave.open(str(destination), "wb") as output:
            output.setnchannels(1)
            output.setsampwidth(2)
            output.setframerate(RATE)
            output.writeframes(pcm.tobytes())
        samples.append({"id": label, "file": filename, "cueSeconds": cue, "trimSeconds": round(trim / RATE, 4), "durationSeconds": round(len(clip) / RATE, 4), "sha256": hashlib.sha256(destination.read_bytes()).hexdigest()})
        print(f"Prepared {label}: {len(clip) / RATE:.2f}s")
    manifest = {"source": SOURCE_URL, "title": "YouTube Piano (Chords) - Play Piano (Chords) with Computer Keyboard", "creator": "Play With Keyboard", "sampleRate": RATE, "channels": 1, "preparation": "Leading silence trimmed; peak normalized to 0.85; 3ms attack and 150ms ending fade", "samples": samples}
    (args.output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
