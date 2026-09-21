import hashlib
import argparse
import io
import json
import math
import os
from pathlib import Path
import subprocess
import wave

os.environ.setdefault("OMP_NUM_THREADS", "2")

import imageio_ffmpeg
import numpy as np
from piper import PiperVoice, SynthesisConfig

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "artifacts" / "hackathon-video"
STORY = json.loads((ROOT / "presentation" / "story.json").read_text(encoding="utf-8"))
RATE = 48000
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
VOICE_DIRECTORY = OUT / "assets" / "voice"


def save_wav(path, samples, rate=RATE):
    samples = np.asarray(samples)
    channels = 1 if samples.ndim == 1 else samples.shape[1]
    with wave.open(str(path), "wb") as output:
        output.setnchannels(channels)
        output.setsampwidth(2)
        output.setframerate(rate)
        output.writeframes((np.clip(samples, -0.995, 0.995) * 32767).astype("<i2").tobytes())


def read_trimmed(path):
    with wave.open(str(path), "rb") as source:
        assert source.getnchannels() == 1 and source.getsampwidth() == 2
        rate = source.getframerate()
        audio = np.frombuffer(source.readframes(source.getnframes()), dtype="<i2").astype(np.float32) / 32768
    active = np.flatnonzero(np.abs(audio) > 0.004)
    if active.size == 0:
        raise ValueError(f"Narration is silent: {path.name}")
    margin = int(rate * 0.095)
    return audio[max(0, active[0] - margin):min(len(audio), active[-1] + margin)], rate


def retime(audio, rate, factor):
    command = [
        FFMPEG, "-hide_banner", "-loglevel", "error", "-f", "f32le", "-ar", str(rate),
        "-ac", "1", "-i", "pipe:0", "-af", f"atempo={factor:.8f}",
        "-ar", str(RATE), "-ac", "1", "-f", "f32le", "pipe:1",
    ]
    result = subprocess.run(command, input=audio.astype("<f4").tobytes(), capture_output=True, check=True)
    return np.frombuffer(result.stdout, dtype="<f4").copy()


def srt_time(seconds):
    milliseconds = round(seconds * 1000)
    hours, milliseconds = divmod(milliseconds, 3600000)
    minutes, milliseconds = divmod(milliseconds, 60000)
    seconds, milliseconds = divmod(milliseconds, 1000)
    return f"{hours:02}:{minutes:02}:{seconds:02},{milliseconds:03}"


def compose_score(duration, narration):
    count = int(duration * RATE)
    music = np.zeros((count, 2), np.float32)
    beat = 60 / STORY.get("musicBpm", 84)
    harmony = [(50, 53, 57, 60), (46, 50, 53, 57), (48, 52, 55, 59), (53, 57, 60, 64)]

    def note(start, length, midi, level, pan=0.0, soft=False):
        first = int(start * RATE)
        if first >= count:
            return
        size = min(int(length * RATE), count - first)
        clock = np.arange(size, dtype=np.float32) / RATE
        frequency = 440 * 2 ** ((midi - 69) / 12)
        attack = 0.5 if soft else 0.035
        envelope = (1 - np.exp(-clock / attack)) * np.exp(-clock / (3.5 if soft else 1.3))
        envelope *= np.minimum(1, np.maximum(0, length - clock) / 0.45)
        wavelet = np.sin(2 * np.pi * frequency * clock)
        wavelet += 0.22 * np.sin(2 * np.pi * frequency * 2 * clock + 0.2)
        wavelet += 0.06 * np.sin(2 * np.pi * frequency * 3 * clock)
        signal = level * envelope * wavelet
        music[first:first + size, 0] += signal * math.sqrt((1 - pan) / 2)
        music[first:first + size, 1] += signal * math.sqrt((1 + pan) / 2)

    for bar in range(math.ceil(duration / (beat * 8))):
        start = bar * beat * 8
        chord = harmony[bar % len(harmony)]
        if start >= 106:
            chord = (50, 54, 57, 61)
        for index, midi in enumerate(chord):
            note(start + index * 0.03, beat * 9, midi, 0.0018, (index - 1.5) / 3, True)
        for index in range(8):
            midi = chord[[0, 2, 1, 3, 2, 1, 3, 2][index]] + 12
            note(start + index * beat, 2.4, midi, 0.007, 0.35 * math.sin(index))
    position = 0
    for scene in STORY["scenes"]:
        if position > 0:
            note(position + 0.14, 1.6, 74, 0.007, -0.12)
            note(position + 0.29, 1.9, 81, 0.004, 0.18)
        position += scene["duration"]

    block = 1200
    padded = np.pad(narration, (0, (-len(narration)) % block))
    energy = np.sqrt(np.mean(padded.reshape(-1, block) ** 2, axis=1))
    smoothed = np.convolve(energy, np.ones(9) / 9, mode="same")
    envelope = np.interp(np.arange(count), np.arange(len(smoothed)) * block, smoothed)
    music *= (1 - 0.55 * np.clip(envelope / 0.055, 0, 1))[:, None]
    clock = np.arange(count, dtype=np.float32) / RATE
    fade = np.clip(clock / 2.2, 0, 1) * np.clip((duration - clock) / 2.4, 0, 1)
    music *= fade[:, None]
    return music


def main():
    duration = sum(scene["duration"] for scene in STORY["scenes"])
    assert duration == 120
    audio_dir = OUT / "audio"
    raw_dir = audio_dir / "voice-takes"
    raw_dir.mkdir(parents=True, exist_ok=True)
    model = VOICE_DIRECTORY / f"{STORY['voice']}.onnx"
    if not model.is_file():
        raise FileNotFoundError("Download the documented offline voice before generating narration.")
    voice = PiperVoice.load(model)
    config = SynthesisConfig(length_scale=0.98, noise_scale=0.5, noise_w_scale=0.65, normalize_audio=True, volume=0.9)
    narration = np.zeros(int(duration * RATE), np.float32)
    subtitles = []
    timings = []
    problems = []
    scene_start = 0.0
    for scene in STORY["scenes"]:
        clips = []
        for index, line in enumerate(scene["lines"]):
            identity = hashlib.sha256((STORY["voice"] + ":v1:" + line).encode()).hexdigest()[:12]
            path = raw_dir / f"{scene['id']}-{index + 1}-{identity}.wav"
            if not path.is_file():
                with wave.open(str(path), "wb") as output:
                    voice.synthesize_wav(line, output, syn_config=config)
            clips.append(read_trimmed(path))
        raw_duration = sum(len(samples) / rate for samples, rate in clips)
        gap = 0.24
        available = scene["duration"] - 1.25 - gap * (len(clips) - 1)
        tempo = max(0.95, raw_duration / available)
        if tempo > 1.2:
            problems.append(f"{scene['id']}: needs tempo {tempo:.3f} for {raw_duration:.2f}s of speech")
            scene_start += scene["duration"]
            continue
        cursor = scene_start + 0.55
        for line, (samples, rate) in zip(scene["lines"], clips):
            take = retime(samples, rate, tempo)
            edge = min(360, len(take) // 4)
            take[:edge] *= np.linspace(0, 1, edge)
            take[-edge:] *= np.linspace(1, 0, edge)
            first = round(cursor * RATE)
            finish = first + len(take)
            if finish > round((scene_start + scene["duration"] - 0.15) * RATE):
                raise ValueError(f"Speech overlaps the next scene: {scene['id']}")
            narration[first:finish] += take
            subtitles.append({
                "start": round(cursor, 4), "end": round(finish / RATE + 0.11, 4),
                "text": line.replace("V S Code", "VS Code"), "scene": scene["id"],
            })
            cursor = finish / RATE + gap
        timings.append({"scene": scene["id"], "start": scene_start, "duration": scene["duration"],
                        "rawSpeech": round(raw_duration, 3), "tempo": round(tempo, 4),
                        "speechEnd": round(cursor - gap, 3)})
        print(f"{scene['id']}: {raw_duration:.2f}s speech, tempo {tempo:.3f}, ends {cursor-gap:.2f}s", flush=True)
        scene_start += scene["duration"]
    if problems:
        raise ValueError("Shorten narration before rendering: " + "; ".join(problems))
    active = narration[np.abs(narration) > 0.008]
    rms = float(np.sqrt(np.mean(active ** 2)))
    narration *= min(0.145 / rms, 0.86 / float(np.max(np.abs(narration))))
    score = compose_score(duration, narration)
    mix = score + np.stack([narration, narration], axis=1)
    if np.max(np.abs(mix)) >= 0.98:
        raise ValueError("Audio mix clips before mastering.")
    save_wav(audio_dir / "narration.wav", narration)
    save_wav(audio_dir / "original-score.wav", score)
    save_wav(audio_dir / "premaster.wav", mix)
    subprocess.run([
        FFMPEG, "-y", "-hide_banner", "-loglevel", "error", "-i", str(audio_dir / "premaster.wav"),
        "-af", "loudnorm=I=-16:TP=-1.5:LRA=7", "-ar", str(RATE), "-ac", "2",
        "-t", "120", "-c:a", "pcm_s16le", str(audio_dir / "master.wav"),
    ], check=True)
    (OUT / "captions.json").write_text(json.dumps(subtitles, indent=2), encoding="utf-8")
    (OUT / "audio-timing.json").write_text(json.dumps(timings, indent=2), encoding="utf-8")
    (OUT / "Agent-Flight-Recorder-Hackathon-2026.srt").write_text(
        "\n\n".join(f"{index}\n{srt_time(cue['start'])} --> {srt_time(cue['end'])}\n{cue['text']}"
                    for index, cue in enumerate(subtitles, 1)) + "\n", encoding="utf-8")
    (OUT / "Narration-transcript.txt").write_text(
        "\n\n".join(f"{row['start']:05.1f}s | {scene['chapter']}\n" + " ".join(scene["lines"]).replace("V S Code", "VS Code")
                    for row, scene in zip(timings, STORY["scenes"])) + "\n", encoding="utf-8")
    print("Local neural narration, original music, mastered mix and timed captions are ready.", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--story", type=Path)
    parser.add_argument("--out", type=Path)
    parser.add_argument("--voice-dir", type=Path)
    args = parser.parse_args()
    if args.story:
        STORY = json.loads(args.story.read_text(encoding="utf-8"))
    if args.out:
        OUT = args.out.resolve()
    if args.voice_dir:
        VOICE_DIRECTORY = args.voice_dir.resolve()
    main()
