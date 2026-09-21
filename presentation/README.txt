AGENT FLIGHT RECORDER - HACKATHON EXPLAINER

This is an original, locally produced, two-minute animated walkthrough.
Nothing is uploaded or submitted by these scripts.

DELIVERABLE
  ..\artifacts\hackathon-video\Agent-Flight-Recorder-Hackathon-2026.mp4

The MP4 is 1920 x 1080, 30 fps, 120 seconds, H.264 video with stereo AAC
audio and burned-in English captions. The output folder also contains a
separate SRT, narration transcript, poster, audio stems, and preview frames.

REBUILD FROM THE REPOSITORY ROOT
  python -m venv .\presentation\.venv
  .\presentation\.venv\Scripts\python.exe -m pip install -r .\presentation\requirements.txt
  .\presentation\.venv\Scripts\python.exe -m piper.download_voices --download-dir .\artifacts\hackathon-video\assets\voice en_US-ljspeech-high
  .\presentation\.venv\Scripts\python.exe .\presentation\make_audio.py
  .\presentation\.venv\Scripts\python.exe .\presentation\render_movie.py preview
  .\presentation\.venv\Scripts\python.exe .\presentation\render_movie.py render
  .\presentation\.venv\Scripts\python.exe .\presentation\verify_movie.py

The five user-supplied PNGs must be in:
  ..\artifacts\hackathon-video\assets\screenshots
Their exact names are in story.json. The original images are not modified.
Windows system fonts are used; font files are not redistributed.

EDITING
  story.json contains the spoken text, scene order and exact scene durations.
  make_audio.py synthesizes narration locally and creates an original score.
  render_movie.py contains the motion graphics, camera moves, highlights,
  scene transitions, typography and caption rendering.
  The total duration must remain exactly 120 seconds.
  Voice takes are content-keyed and reused only when the text is unchanged.
  Rendering uses four encoder threads and does not start the project server.

STORY AND CLAIM BOUNDARIES
  Maya is a fictional developer in an illustrated stale-validation scenario.
  Product scenes use the five actual screenshots supplied by the project owner.
  Diagrams are explanatory animations, not recordings of hidden agent activity.
  Policies and recovery are explicitly scoped to the local demo/mock harness.
  Azure drafts are advisory and require approval; they do not decide verdicts.
  Only the VS Code vault is described as encrypted. Browser Lens is memory-only;
  the original recorder's SQLite is plaintext.
  The film makes no measured adoption, productivity or benchmark claims.
  Source: docs\PROJECT-SCOPE.md, docs\EVIDENCE-LENS.md, the implemented project,
  and the supplied screenshots. The internal submission portal did not expose
  a publicly readable description during this production.

ASSET AND TOOL PROVENANCE
  Screenshots: supplied by the project owner.
  Script, diagrams, animation and musical score: created for this project.
  Narration: synthesized locally with Piper, not a recording of a spokesperson.
  Voice: rhasspy/piper-voices, en_US-ljspeech-high.
  The model card identifies the LJ Speech dataset as public domain.
  Model card:
    https://huggingface.co/rhasspy/piper-voices/blob/main/en/en_US/ljspeech/high/MODEL_CARD
  Dataset:
    https://keithito.com/LJ-Speech-Dataset/
  Piper engine:
    https://github.com/OHF-Voice/piper1-gpl
  Renderer uses Pillow, NumPy and the FFmpeg binary supplied by imageio-ffmpeg.
  Those tools, model binaries and system fonts are not part of the production
  source archive. Their respective licenses remain with their distributions.

NO EXTERNAL CONTENT PROCESSING
  No screenshot, script, source code, credential or narration was sent to a
  cloud speech/video service. Package/model downloads are inbound only.
  The application's Azure key is neither read nor needed to make this video.
