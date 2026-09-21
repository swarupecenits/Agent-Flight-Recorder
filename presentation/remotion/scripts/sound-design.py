from pathlib import Path
import json
import math
import subprocess
import wave

import imageio_ffmpeg
import numpy as np

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "artifacts" / "hackathon-video-remotion"
RATE = 48000
SECONDS = 120


def write(path, audio):
    with wave.open(str(path), "wb") as output:
        output.setnchannels(2)
        output.setsampwidth(2)
        output.setframerate(RATE)
        output.writeframes((np.clip(audio, -.995, .995) * 32767).astype("<i2").tobytes())


def main():
    with wave.open(str(OUT / "audio" / "premaster.wav"), "rb") as audio:
        assert audio.getframerate() == RATE and audio.getnchannels() == 2
        mix = np.frombuffer(audio.readframes(audio.getnframes()), "<i2").astype(np.float32).reshape(-1, 2) / 32768
    effects = np.zeros_like(mix)
    generator = np.random.default_rng(80391)

    def sound(start, kind="click", pan=0.0):
        duration = .46 if kind == "swish" else .7 if kind == "resolve" else .12
        count = int(duration * RATE)
        clock = np.arange(count, dtype=np.float32) / RATE
        if kind == "swish":
            noise = generator.standard_normal(count).astype(np.float32)
            noise = np.convolve(noise, np.ones(15, np.float32) / 15, mode="same")
            signal = noise * np.sin(np.pi * clock / duration) ** 2 * .012
        elif kind == "resolve":
            signal = sum(np.sin(2 * np.pi * frequency * clock) for frequency in (659.25, 830.61, 987.77))
            signal *= (1 - np.exp(-clock / .012)) * np.exp(-clock / .16) * .004
        else:
            signal = np.sin(2 * np.pi * 860 * clock) * np.exp(-clock / .018) * .01
        signal[-480:] *= np.linspace(1, 0, 480)
        first = int(start * RATE)
        effects[first:first + count, 0] += signal * math.sqrt((1 - pan) / 2)
        effects[first:first + count, 1] += signal * math.sqrt((1 + pan) / 2)

    for cut in [8, 17, 26, 35, 43, 50, 62, 69, 77, 87, 95, 105, 113]:
        sound(cut - .2, "swish", -.15)
    for click in [2.8, 30.2, 39.2, 81.5, 102.3, 108.4]:
        sound(click)
    for success in [39.7, 83.0, 110.6, 115.4]:
        sound(success, "resolve", .15)
    assert np.max(np.abs(mix + effects)) < .98
    write(OUT / "audio" / "original-sound-effects.wav", effects)
    write(OUT / "audio" / "designed-premaster.wav", mix + effects)
    subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), "-y", "-hide_banner", "-loglevel", "error",
                    "-i", str(OUT / "audio" / "designed-premaster.wav"),
                    "-af", "loudnorm=I=-16:TP=-1.5:LRA=7", "-ar", str(RATE), "-ac", "2",
                    "-t", str(SECONDS), "-c:a", "pcm_s16le", str(OUT / "audio" / "master.wav")], check=True)
    print("Added original transition swishes, UI clicks and resolution chimes; mastered for clear narration.")


if __name__ == "__main__":
    main()
