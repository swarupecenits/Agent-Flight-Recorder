# Agent Flight Recorder: the case of the missing proof

An original 120-second character-led motion-graphics film, built with Remotion
4.0.519. It has its own output folder, separate from the first film's production
assets and source files.

**Finished video:** `..\..\artifacts\hackathon-video-remotion\Agent-Flight-Recorder-Remotion-Story.mp4`

Nothing in this production uploads or submits the film. Narration is synthesized
locally; no screenshots, code, scripts, credentials or audio are sent to an
external video or speech service. Rendering does not start the recorder or call
Azure.

## What changed in this version

- Original animated Maya and agent characters connect the opening to the ending.
- A traveling versioned proof token makes the stale-evidence problem visible.
- Capture ingestion, a moving replay cursor, filtering, policy gates, review
  clicks, branching recovery, a local vault, and a cloud approval flow animate
  independently instead of moving a whole screenshot.
- Spring entrances, drawn paths, diagonal match-cut transitions, timed character
  motion, captions and original sound effects support the story.
- Five owner-supplied screenshots appear as explicitly labeled supporting proof.
- Each scene is its own React file and an independently editable composition.

## Open the editable project

From this directory:

```powershell
npm ci
node scripts\prepare-assets.mjs
npm run dev
```

Select **FlightRecorderStory** in Remotion Studio. The **Editable-scenes** folder
contains the individual scenes. Stop the preview with Ctrl+C.

On a managed npm 12 installation, if downloads fail with `EALLOWREMOTE`:

```powershell
npm ci --allow-remote=all --no-audit --no-fund
```

`prepare-assets.mjs` copies only the five named screenshots, locally generated
master audio, captions and required installed Windows fonts into the ignored
`public` folder. No `.env` is read. It expects the existing project artifact
layout. Font binaries are local assets, not redistributed in the source archive.

## Render

```powershell
npm run typecheck
npm run preview:frames
npm run render
node scripts\render.mjs poster
```

The render script uses the installed Edge executable on this Windows machine,
or `AFR_BROWSER` if provided. Elsewhere, Remotion can use its managed headless
browser. Rendering is limited to two concurrent pages and closes its own browser.
It does not leave a Studio server running.

The exported film is 1920 x 1080, 30 fps, 3,600 frames, H.264/yuv420p with AAC
stereo audio and burned-in English captions. SRT captions and audio stems are
also retained.

## Regenerate narration and sound

From the **repository root**, using the isolated Python environment from the
first film:

```powershell
.\presentation\.venv\Scripts\python.exe .\presentation\make_audio.py --story .\presentation\remotion\story.json --out .\artifacts\hackathon-video-remotion --voice-dir .\artifacts\hackathon-video\assets\voice
.\presentation\.venv\Scripts\python.exe .\presentation\remotion\scripts\sound-design.py
```

Then rerun `node scripts\prepare-assets.mjs` from this Remotion directory before
previewing or rendering. The voice model is `en_US-ljspeech-high`, downloaded by
the first production. Engine/model binaries are not redistributed. See
`artifacts\hackathon-video\Production-guide.txt` for tool and voice provenance.

Speech is generated separately for each sentence, paced to each scene, and
subtitled using its actual generated duration. Captions use the Remotion
`Caption` JSON shape. The music, transition swishes, UI clicks and resolution
chimes are original synthesized audio; no commercial music or sampled effects
were used. Narration is not attributed to a real spokesperson.

## Editable source archive

`artifacts\hackathon-video-remotion\Agent-Flight-Recorder-Remotion-Source.zip`
preserves the repository-relative directory structure. Extract it into an empty
folder, then follow **Open the editable project** from its
`presentation\remotion` directory. The archive includes the complete composition,
lockfile, narration/music/effect stems, master audio, captions and original
screenshots. The existing master lets you edit and render visuals without
installing Python or downloading a voice model.

To regenerate narration after extracting, first follow the Python environment and
voice-download setup in `presentation\README.txt`, then use the v2 audio commands
above. The archive excludes credentials, application data, `node_modules`,
Python environments, voice models, bundled dependencies and Windows fonts.

After rendering and running the encoded-deliverable check, regenerate the archive
from the repository root:

```powershell
.\presentation\.venv\Scripts\python.exe .\presentation\remotion\scripts\package-delivery.py
```

## Story and feature coverage

| Time | Story beat | Features shown |
| --- | --- | --- |
| 0:00-0:08 | Maya is one click from shipping | Clear problem: a confident agent answer needs evidence. |
| 0:08-0:17 | The proof did not follow the edit | Version A versus final version B, without claiming B is broken. |
| 0:17-0:26 | A black box for agents | Prompts, model/tool calls, decisions, output, errors, retries, persistence. |
| 0:26-0:35 | Rewind without rerunning | Playback, stepping/seeking, speed, filters, breakpoints, recorded state. |
| 0:35-0:43 | A human at the boundary | Allow/block/review outcomes, restricted reads, exact approval and local receipt. |
| 0:43-0:50 | Find the turning point | Source-linked failures, retries, operation timing and approval waits. |
| 0:50-1:02 | Four honest answers | Supported, Contradicted, Unsupported, Unverifiable; linked proof and positive assertion kinds. |
| 1:02-1:09 | The target matters | Environment/scope mismatch; denied access is not unhealthy infrastructure. |
| 1:09-1:17 | A useful handoff | Available versus used inventory, source/version gaps, linked checks and handoff. |
| 1:17-1:27 | Correct without erasing | Separate correction, reviewed checkpoint/fresh mock recovery, effects/limits, parent link and compare. |
| 1:27-1:35 | Connect your own agent | SDK, HTTP/Python examples, read-only MCP, verified import, JSON/Markdown/OTLP export and comparison. |
| 1:35-1:45 | Your workspace, your choices | Selected-task capture, fingerprints, encrypted VS Code vault, scoped rules, minimization, retention, export review and appearance. |
| 1:45-1:53 | A draft, not a verdict | Exact Azure preview, explicit consent, real optional GPT-5.4, advisory draft and measured metadata. |
| 1:53-2:00 | Evidence instead of promises | Resolution, intended audiences and project identity. |

## Accuracy boundaries

Maya, the bot, code panels and animated interactions are explanatory artwork, not
a recording of hidden agent internals. Screenshot thumbnails are the actual
owner-supplied images. The two versions of the addition function are illustrative
and do not assert a real production defect.

Policy enforcement applies to the included local sandbox. No actual email is
sent. Recovery executes only the known bounded mock harness; arbitrary runtimes
receive a handoff, not invented exact resume. Only the VS Code vault is encrypted;
the browser Lens is memory-only and the original SQLite recorder is plaintext.
The engine checks explicit assertion types and captured links, not general
natural-language truth. Azure is optional and advisory. No adoption, productivity
or benchmark numbers are claimed.

## Verify the encoded deliverable

From the repository root:

```powershell
.\presentation\.venv\Scripts\python.exe .\presentation\verify_movie.py --out .\artifacts\hackathon-video-remotion --movie Agent-Flight-Recorder-Remotion-Story.mp4 --story .\presentation\remotion\story.json
```

The check decodes the complete file, verifies its exact duration/frame count and
audio, validates caption boundaries, and extracts encoded frames for inspection.

## Licensing

The project and original artwork have no newly assigned open-source license.
Remotion and other dependencies retain their own license terms; company usage may
require a Remotion license. Review the terms applicable to your organization.
