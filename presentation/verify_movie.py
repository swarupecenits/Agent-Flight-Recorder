import hashlib
import argparse
import json
import math
from pathlib import Path
import re
import subprocess

import imageio_ffmpeg
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "artifacts" / "hackathon-video"
MOVIE = OUT / "Agent-Flight-Recorder-Hackathon-2026.mp4"
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
STORY_PATH = ROOT / "presentation" / "story.json"


def run(arguments):
    return subprocess.run([FFMPEG, "-hide_banner", *arguments], capture_output=True, check=True)


def main():
    reader = imageio_ffmpeg.read_frames(str(MOVIE))
    try:
        metadata = next(reader)
    finally:
        reader.close()
    assert metadata["size"] == (1920, 1080), metadata
    assert metadata["fps"] == 30, metadata
    assert abs(metadata["duration"] - 120) < 0.04, metadata
    assert metadata["codec"] == "h264", metadata
    frames, seconds = imageio_ffmpeg.count_frames_and_secs(str(MOVIE))
    assert frames == 3600 and abs(seconds - 120) < 0.04, (frames, seconds)
    run(["-v", "error", "-xerror", "-i", str(MOVIE), "-f", "null", "-"])
    decoded = run(["-v", "error", "-i", str(MOVIE), "-map", "0:a:0", "-t", "120",
                   "-ar", "48000", "-ac", "2", "-f", "f32le", "pipe:1"])
    audio = np.frombuffer(decoded.stdout, dtype="<f4")
    assert abs(len(audio) / 48000 / 2 - 120) < 0.05
    assert 0.01 < np.sqrt(np.mean(audio ** 2)) < 0.35
    assert np.max(np.abs(audio)) < 0.99
    loudness = run(["-nostats", "-i", str(MOVIE), "-map", "0:a:0",
                    "-af", "ebur128=peak=true", "-f", "null", "-"]).stderr.decode(errors="replace")
    assert re.search(r"Audio: aac.*48000 Hz, stereo", loudness), "Expected stereo AAC audio at 48 kHz."
    integrated = float(re.findall(r"I:\s+(-?[\d.]+)\s+LUFS", loudness)[-1])
    true_peak = float(re.findall(r"Peak:\s+(-?[\d.]+)\s+dBFS", loudness)[-1])
    assert -17.5 <= integrated <= -14.5, integrated
    assert true_peak <= -1, true_peak
    cues = json.loads((OUT / "captions.json").read_text(encoding="utf-8"))
    story = json.loads(STORY_PATH.read_text(encoding="utf-8"))
    assert len(cues) == sum(len(scene["lines"]) for scene in story["scenes"])
    for index, cue in enumerate(cues):
        assert 0 <= cue["start"] < cue["end"] <= 120
        if index:
            assert cue["start"] > cues[index - 1]["end"]
    encoded_frames = OUT / "preview" / "encoded"
    encoded_frames.mkdir(parents=True, exist_ok=True)
    sheet = Image.new("RGB", (1920, math.ceil(len(story["scenes"]) / 4) * 328), (224, 226, 218))
    font = ImageFont.truetype(r"C:\Windows\Fonts\consola.ttf", 23)
    position = 0
    for index, scene in enumerate(story["scenes"]):
        moment = position + min(5.6, scene["duration"] - 1)
        target = encoded_frames / f"{index + 1:02}-{scene['id']}.png"
        run(["-y", "-v", "error", "-ss", str(moment), "-i", str(MOVIE), "-frames:v", "1", str(target)])
        image = Image.open(target).convert("RGB")
        assert image.size == (1920, 1080)
        assert np.asarray(image).std() > 15
        x, y = index % 4 * 480, index // 4 * 328
        sheet.paste(image.resize((480, 270), Image.Resampling.LANCZOS), (x, y))
        ImageDraw.Draw(sheet).text((x + 14, y + 284), f"{index + 1:02}  {position:03}s  /  {scene['id'].upper()}",
                                   font=font, fill=(34, 44, 46))
        position += scene["duration"]
    sheet.save(OUT / "Final-film-contact-sheet.jpg", quality=95)
    result = {
        "file": MOVIE.name, "sizeBytes": MOVIE.stat().st_size,
        "sha256": hashlib.sha256(MOVIE.read_bytes()).hexdigest(),
        "durationSeconds": seconds, "frames": frames, "fps": metadata["fps"],
        "resolution": list(metadata["size"]), "videoCodec": metadata["codec"],
        "audioCodec": "AAC", "audioChannels": 2, "audioSampleRate": 48000,
        "integratedLoudnessLufs": integrated, "truePeakDbfs": true_peak, "captionCues": len(cues),
        "decodeErrors": 0, "localOnly": True,
        "screenshots": [{"file": name, "sha256": hashlib.sha256(
            (OUT / "assets" / "screenshots" / name).read_bytes()).hexdigest()}
                        for name in story.get("screenshots", {}).values()],
    }
    (OUT / "video-specifications.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path)
    parser.add_argument("--movie")
    parser.add_argument("--story", type=Path)
    args = parser.parse_args()
    if args.out:
        OUT = args.out.resolve()
    MOVIE = OUT / (args.movie or MOVIE.name)
    if args.story:
        STORY_PATH = args.story.resolve()
    main()
