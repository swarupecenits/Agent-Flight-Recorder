import hashlib
import json
from pathlib import Path
import shutil
import zipfile


ROOT = Path(__file__).resolve().parents[3]
PROJECT = ROOT / "presentation" / "remotion"
OUT = ROOT / "artifacts" / "hackathon-video-remotion"
STEM = "Agent-Flight-Recorder-Remotion-Story"


def main():
    specifications = json.loads((OUT / "video-specifications.json").read_text(encoding="utf-8"))
    movie = OUT / f"{STEM}.mp4"
    assert specifications["sha256"] == hashlib.sha256(movie.read_bytes()).hexdigest()
    assert specifications["durationSeconds"] == 120 and specifications["frames"] == 3600
    assert specifications["captionCues"] == 28 and specifications["decodeErrors"] == 0

    shutil.copyfile(OUT / "Agent-Flight-Recorder-Hackathon-2026.srt", OUT / f"{STEM}.srt")
    shutil.copyfile(PROJECT / "README.md", OUT / "Production-guide.txt")

    sources = [
        PROJECT / name for name in (
            ".gitignore", ".npmrc", ".prettierrc", "README.md", "eslint.config.mjs",
            "package.json", "package-lock.json", "remotion.config.ts", "tsconfig.json", "story.json",
        )
    ]
    for folder in ("src", "scripts"):
        sources.extend(path for path in (PROJECT / folder).rglob("*")
                       if path.is_file() and path.suffix in {".tsx", ".ts", ".json", ".css", ".mjs", ".py"})
    sources.extend(ROOT / "presentation" / name for name in (
        "README.txt", "make_audio.py", "render_movie.py", "verify_movie.py", "story.json",
        "requirements.txt", "requirements.lock.txt",
    ))
    sources.append(ROOT / ".gitignore")
    sources.extend(OUT / name for name in (
        "captions.json", "audio-timing.json", "Narration-transcript.txt", f"{STEM}.srt",
        "Agent-Flight-Recorder-Hackathon-2026.srt", "Production-guide.txt", "video-specifications.json",
    ))
    sources.extend(OUT / "audio" / name for name in (
        "master.wav", "narration.wav", "original-score.wav", "original-sound-effects.wav", "premaster.wav",
    ))
    sources.append(ROOT / "artifacts" / "hackathon-video" / "Production-guide.txt")
    story = json.loads((PROJECT / "story.json").read_text(encoding="utf-8"))
    sources.extend(ROOT / "artifacts" / "hackathon-video" / "assets" / "screenshots" / name
                   for name in story["screenshots"].values())
    sources = sorted(set(sources))
    manifest = []
    for path in sources:
        assert path.is_file(), f"Missing delivery input: {path}"
        relative = path.relative_to(ROOT)
        assert not {".git", ".venv", "node_modules", "__pycache__", "fonts"}.intersection(relative.parts)
        assert not path.name.startswith(".env") and path.suffix not in {".onnx", ".ttf", ".key", ".pem"}
        manifest.append({"path": relative.as_posix(), "bytes": path.stat().st_size,
                         "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})

    archive = OUT / "Agent-Flight-Recorder-Remotion-Source.zip"
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as output:
        for path, item in zip(sources, manifest, strict=True):
            output.write(path, item["path"])
        output.writestr("SOURCE-MANIFEST.json", json.dumps(manifest, indent=2))
    with zipfile.ZipFile(archive) as packaged:
        assert packaged.testzip() is None
        assert len(packaged.namelist()) == len(manifest) + 1
    (OUT / "source-archive-manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(json.dumps({"movie": movie.name, "movieBytes": movie.stat().st_size,
                      "sourceArchive": archive.name, "archiveBytes": archive.stat().st_size,
                      "archiveEntries": len(manifest) + 1, "fontsModelsCredentialsIncluded": False}, indent=2))


if __name__ == "__main__":
    main()
