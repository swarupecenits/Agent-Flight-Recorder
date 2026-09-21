import argparse
import functools
import json
import math
import os
from pathlib import Path
import subprocess
import time

import imageio_ffmpeg
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "artifacts" / "hackathon-video"
STORY = json.loads((ROOT / "presentation" / "story.json").read_text(encoding="utf-8"))
W, H, FPS = STORY["width"], STORY["height"], STORY["fps"]
FONT_DIR = Path(os.environ.get("WINDIR", r"C:\Windows")) / "Fonts"
PAPER = (243, 241, 234)
WHITE = (255, 254, 249)
INK = (34, 44, 46)
DARK = (20, 29, 32)
PANEL = (30, 41, 44)
MUTED = (99, 118, 120)
PALE = (170, 189, 186)
EMBER = (163, 59, 33)
TEAL = (131, 214, 188)
GREEN = (14, 109, 92)
AMBER = (244, 196, 107)
RED = (236, 139, 120)
BLUE = (150, 184, 220)
SCREENSHOTS = {key: Image.open(OUT / "assets" / "screenshots" / name).convert("RGB")
               for key, name in STORY["screenshots"].items()}
HIGHLIGHTS = {
    "recordings": (0.177, 0.785, 0.578, 0.848),
    "policies": (0.583, 0.394, 0.767, 0.738),
    "insights": (0.186, 0.535, 0.554, 0.645),
    "manifest": (0.337, 0.831, 0.964, 0.995),
    "connect": (0.584, 0.607, 0.975, 0.988),
}
CAPTIONS = []
if (OUT / "captions.json").exists():
    CAPTIONS = json.loads((OUT / "captions.json").read_text(encoding="utf-8"))
STARTS = []
clock = 0
for item in STORY["scenes"]:
    STARTS.append(clock)
    clock += item["duration"]
assert clock == 120 and W == 1920 and H == 1080 and FPS == 30


def clamp(value, lower=0, upper=1):
    return max(lower, min(upper, value))


def ease(value):
    value = clamp(value)
    return 1 - (1 - value) ** 3


def smooth(value):
    value = clamp(value)
    return value * value * (3 - 2 * value)


def arrival(t, delay=0, length=0.75):
    value = ease((t - delay) / length)
    return value, 30 * (1 - value)


@functools.lru_cache(maxsize=100)
def font(size, style="body"):
    names = {"body": "segoeui.ttf", "bold": "seguisb.ttf", "serif": "georgia.ttf",
             "italic": "georgiai.ttf", "mono": "consola.ttf"}
    return ImageFont.truetype(str(FONT_DIR / names[style]), round(size))


def text(image, value, x, y, size=32, color=INK, style="body", alpha=1, anchor="lt"):
    ImageDraw.Draw(image, "RGBA").text((round(x), round(y)), value, font=font(size, style),
                                      fill=(*color, round(255 * clamp(alpha))), anchor=anchor)


def measure(value, size=32, style="body"):
    return font(size, style).getlength(value)


def wrap(value, width, size=32, style="body"):
    lines = []
    for paragraph in value.split("\n"):
        words = paragraph.split()
        line = ""
        for word in words:
            proposed = f"{line} {word}".strip()
            if line and measure(proposed, size, style) > width:
                lines.append(line)
                line = word
            else:
                line = proposed
        lines.append(line)
    return lines


def paragraph(image, value, x, y, width, size=32, color=INK, style="body", alpha=1, leading=1.35):
    lines = wrap(value, width, size, style)
    for index, line in enumerate(lines):
        text(image, line, x, y + index * size * leading, size, color, style, alpha)
    return y + len(lines) * size * leading


def headline(image, lines, x, y, size=77, dark=False, t=5, delay=0, max_width=None):
    if max_width:
        widest = max(measure(value.lstrip("~"), size, "italic" if value.startswith("~") else "serif") for value in lines)
        size = min(size, math.floor(size * max_width / widest))
    for index, value in enumerate(lines):
        alpha, shift = arrival(t, delay + index * 0.12)
        accent = value.startswith("~")
        text(image, value.lstrip("~"), x, y + index * size * 1.11 + shift, size,
             TEAL if accent and dark else EMBER if accent else WHITE if dark else INK,
             "italic" if accent else "serif", alpha)


def rule(image, x1, y1, x2, y2, color, width=2, alpha=1):
    ImageDraw.Draw(image, "RGBA").line((round(x1), round(y1), round(x2), round(y2)),
                                      fill=(*color, round(255 * clamp(alpha))), width=width)


def pill(image, value, x, y, bg, fg, size=24, alpha=1, width=None):
    width = width or round(measure(value, size, "bold") + 34)
    height = size + 23
    draw = ImageDraw.Draw(image, "RGBA")
    draw.rounded_rectangle((x, y, x + width, y + height), radius=8,
                           fill=(*bg, round(255 * alpha)))
    text(image, value, x + 17, y + 8, size, fg, "bold", alpha)
    return width


def card(image, box, fill=WHITE, border=(207, 211, 204), radius=18, alpha=1):
    draw = ImageDraw.Draw(image, "RGBA")
    draw.rounded_rectangle(tuple(round(v) for v in box), radius=radius,
                           fill=(*fill, round(255 * alpha)), outline=(*border, round(255 * alpha)), width=2)


def dot(image, x, y, radius, color, alpha=1):
    ImageDraw.Draw(image, "RGBA").ellipse((x - radius, y - radius, x + radius, y + radius),
                                         fill=(*color, round(255 * alpha)))


def check(image, x, y, size=22, color=GREEN, alpha=1):
    draw = ImageDraw.Draw(image, "RGBA")
    draw.line([(x - size * 0.42, y), (x - size * 0.09, y + size * 0.3),
               (x + size * 0.48, y - size * 0.4)], fill=(*color, round(255 * alpha)),
              width=max(3, round(size / 8)), joint="curve")


def arrow(image, start, end, color=TEAL, alpha=1, width=3):
    rule(image, *start, *end, color, width, alpha)
    angle = math.atan2(end[1] - start[1], end[0] - start[0])
    for direction in (-0.5, 0.5):
        other = (end[0] - 14 * math.cos(angle + direction), end[1] - 14 * math.sin(angle + direction))
        rule(image, *other, *end, color, width, alpha)


def route(image, points, progress, color=TEAL, width=4, glow=False):
    progress = clamp(progress)
    count = max(1, int((len(points) - 1) * progress))
    current = points[:count + 1]
    if len(current) > 1:
        ImageDraw.Draw(image).line(current, fill=color, width=width, joint="curve")
    if glow and progress > 0:
        px, py = current[-1]
        dot(image, px, py, 14, color, 0.14)
        dot(image, px, py, 5, color)


def curve(a, b, c, d, steps=60):
    points = []
    for position in np.linspace(0, 1, steps):
        inv = 1 - position
        points.append((inv ** 3 * a[0] + 3 * inv ** 2 * position * b[0] + 3 * inv * position ** 2 * c[0] + position ** 3 * d[0],
                       inv ** 3 * a[1] + 3 * inv ** 2 * position * b[1] + 3 * inv * position ** 2 * c[1] + position ** 3 * d[1]))
    return points


def logo(image, x, y, size=46, color=TEAL):
    points = [(x + size * 0.13, y + size * 0.7), (x + size * 0.49, y + size * 0.45),
              (x + size * 0.82, y + size * 0.64), (x + size * 0.78, y + size * 0.14)]
    ImageDraw.Draw(image).line(points, fill=color, width=max(2, round(size / 16)), joint="curve")
    for px, py in points:
        ImageDraw.Draw(image).ellipse((px - size * 0.075, py - size * 0.075, px + size * 0.075, py + size * 0.075),
                                       fill=DARK if color == TEAL else PAPER, outline=color, width=max(2, round(size / 22)))


@functools.lru_cache(maxsize=2)
def backdrop(dark):
    image = Image.new("RGB", (W, H), DARK if dark else PAPER)
    draw = ImageDraw.Draw(image)
    grid = (27, 37, 40) if dark else (233, 232, 224)
    for x in range(92, W, 96):
        for y in range(142, H - 70, 96):
            draw.ellipse((x, y, x + 1, y + 1), fill=grid)
    return image


def foundation(index, dark):
    image = backdrop(dark).copy()
    logo(image, 88, 48, color=TEAL if dark else EMBER)
    text(image, "Flight Recorder.", 145, 51, 28, WHITE if dark else INK, "bold")
    text(image, "HACKATHON 2026  /  WORKING PROTOTYPE", 1830, 60, 19, PALE if dark else MUTED, "mono", anchor="rt")
    rule(image, 92, 108, 1828, 108, (63, 78, 78) if dark else (206, 210, 200), 1)
    text(image, STORY["scenes"][index]["chapter"], 98, 150, 22, TEAL if dark else EMBER, "mono")
    text(image, f"{index + 1:02} / 12", 1828, 150, 21, PALE if dark else MUTED, "mono", anchor="rt")
    return image


@functools.lru_cache(maxsize=20)
def screen_mask(width, height):
    mask = Image.new("L", (width, height), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, width - 1, height - 1), radius=13, fill=255)
    return mask


@functools.lru_cache(maxsize=20)
def screen_shadow(width, height):
    image = Image.new("RGBA", (width + 70, height + 80))
    ImageDraw.Draw(image).rounded_rectangle((30, 22, width + 32, height + 40), radius=18, fill=(0, 0, 0, 55))
    return image.filter(ImageFilter.GaussianBlur(17))


def screenshot(image, key, box, t, duration, center=(0.56, 0.52), zoom=1.16, label=None):
    x, y, width, height = [round(value) for value in box]
    alpha, shift = arrival(t, 0.2, 1)
    y += round(shift)
    image.paste(screen_shadow(width, height + 42), (x - 32, y - 20), screen_shadow(width, height + 42))
    source = SCREENSHOTS[key]
    camera = smooth((t - 0.5) / max(1, duration - 1))
    scale = 1 + (zoom - 1) * camera
    aspect = width / height
    crop_w = min(source.width / scale, source.height * aspect / scale)
    crop_h = crop_w / aspect
    cx = source.width * (0.55 + (center[0] - 0.55) * camera)
    cy = source.height * (0.53 + (center[1] - 0.53) * camera)
    left = clamp(cx - crop_w / 2, 0, source.width - crop_w)
    top = clamp(cy - crop_h / 2, 0, source.height - crop_h)
    region = (left, top, left + crop_w, top + crop_h)
    view = source.transform((width, height), Image.Transform.EXTENT, region, resample=Image.Resampling.BICUBIC)
    chrome = Image.new("RGB", (width, height + 42), (248, 248, 241))
    chrome.paste(view, (0, 42))
    draw = ImageDraw.Draw(chrome)
    for offset, color in enumerate([(170, 184, 177), (196, 186, 162), (184, 191, 180)]):
        draw.ellipse((18 + offset * 18, 15, 26 + offset * 18, 23), fill=color)
    text(chrome, label or key.upper(), 88, 10, 19, MUTED, "mono")
    text(chrome, "ACTUAL PRODUCT SCREENSHOT", width - 18, 12, 15, MUTED, "mono", anchor="rt")
    mask = screen_mask(width, height + 42)
    if alpha < 1:
        mask = mask.point(lambda value: round(value * alpha))
    image.paste(chrome, (x, y), mask)
    ImageDraw.Draw(image).rounded_rectangle((x, y, x + width, y + height + 42), radius=13, outline=(148, 162, 155), width=1)
    highlight = ease((t - 2.3) / 0.8)
    if highlight:
        rx1, ry1, rx2, ry2 = HIGHLIGHTS[key]
        bounds = (
            clamp(x + (rx1 * source.width - left) * width / crop_w, x + 5, x + width - 5),
            clamp(y + 42 + (ry1 * source.height - top) * height / crop_h, y + 47, y + height + 37),
            clamp(x + (rx2 * source.width - left) * width / crop_w, x + 5, x + width - 5),
            clamp(y + 42 + (ry2 * source.height - top) * height / crop_h, y + 47, y + height + 37),
        )
        if bounds[2] - bounds[0] > 35 and bounds[3] - bounds[1] > 30:
            ImageDraw.Draw(image, "RGBA").rounded_rectangle(tuple(round(value) for value in bounds), radius=7,
                                                            outline=(*EMBER, round(205 * highlight)), width=3)


def footnote(image, value, dark=False):
    text(image, value, 100, 909, 21, PALE if dark else MUTED)


def numbered(image, label, detail, x, y, number, t, delay=0, dark=False):
    alpha, shift = arrival(t, delay)
    y += shift
    dot(image, x + 21, y + 22, 21, TEAL if dark else EMBER, alpha)
    text(image, str(number), x + 21, y + 22, 22, DARK if dark else WHITE, "bold", alpha, "mm")
    text(image, label, x + 60, y - 2, 31, WHITE if dark else INK, "bold", alpha)
    paragraph(image, detail, x + 60, y + 45, 480, 25, PALE if dark else MUTED, alpha=alpha)


def scene_hook(t, duration):
    image = foundation(0, True)
    headline(image, ["The agent says", "~\"Done.\""], 105, 234, 114, True, t)
    alpha, shift = arrival(t, 1.2)
    paragraph(image, "The hard part is knowing\nwhat that answer is built on.", 112, 541 + shift, 820, 39, PALE, alpha=alpha)
    points = curve((1040, 650), (1160, 270), (1690, 840), (1740, 384))
    route(image, points, ease((t - 0.35) / 3), TEAL, 4, True)
    for index, (px, py, label) in enumerate([(1070, 529, "PROMPT"), (1255, 466, "TOOLS"), (1443, 552, "RETRY"), (1640, 565, "CLAIM")]):
        alpha, shift = arrival(t, 0.6 + index * 0.45)
        card(image, (px - 57, py - 45 + shift, px + 104, py + 29 + shift), PANEL, (68, 91, 88), 11, alpha)
        text(image, label, px + 23, py - 9 + shift, 24, TEAL, "mono", alpha, "mm")
    alpha, shift = arrival(t, 3.5)
    text(image, "Where is the proof?", 1400, 743 + shift, 47, WHITE, "serif", alpha, "mm")
    footnote(image, "An animated story using screenshots from the working prototype.", True)
    return image


def scene_maya(t, duration):
    image = foundation(1, False)
    headline(image, ["A passing test.", "~A later change."], 106, 220, 89, False, t)
    alpha, shift = arrival(t, 0.45)
    dot(image, 208, 610 + shift, 71, (223, 228, 213), alpha)
    dot(image, 207, 587 + shift, 27, EMBER, alpha)
    ImageDraw.Draw(image, "RGBA").rounded_rectangle((169, 619 + shift, 245, 660 + shift), radius=24, fill=(*EMBER, round(alpha * 255)))
    text(image, "Maya", 311, 564 + shift, 40, INK, "bold", alpha)
    text(image, "Developer, reviewing a handoff", 311, 621 + shift, 25, MUTED, alpha=alpha)
    text(image, "One small edit. One important gap.", 108, 797, 31, EMBER, "italic", ease((t - 5) / 1))
    positions = [(1060, 327), (1384, 505), (1640, 689)]
    labels = [("VERSION A", "Test passed", GREEN), ("VERSION B", "Code changed", EMBER), ("FINAL CLAIM", "\"Ready to ship\"", INK)]
    for index, ((x, y), (label, body, color)) in enumerate(zip(positions, labels)):
        alpha, shift = arrival(t, index * 1.4 + 0.4)
        if index:
            arrow(image, (positions[index - 1][0] + 118, positions[index - 1][1] + 73), (x - 108, y - 25), MUTED, alpha)
        card(image, (x - 148, y - 44 + shift, x + 148, y + 100 + shift), WHITE, (201, 207, 193), 14, alpha)
        text(image, label, x, y - 14 + shift, 21, color, "mono", alpha, "mm")
        text(image, body, x, y + 48 + shift, 32, color, "bold", alpha, "mm")
    pill(image, "No fresh test for B", 1110, 805, (248, 229, 188), (130, 80, 12), 27, ease((t - 5.3) / 0.8))
    footnote(image, "Illustrated scenario. An old passing test does not prove the final code passes or fails.")
    return image


def scene_recorder(t, duration):
    image = foundation(2, False)
    screenshot(image, "recordings", (710, 249, 1108, 594), t, duration, (0.6, 0.55), 1.19, "FLIGHT LOG / RECORDINGS")
    headline(image, ["Agent Flight", "~Recorder."], 102, 236, 79, False, t, max_width=570)
    paragraph(image, "A black box for\nobservable agent execution.", 109, 449, 567, 32, MUTED)
    for index, (label, detail) in enumerate([
        ("Capture the run", "Prompts, tools and explicit decisions"),
        ("Keep the sequence", "Results, errors, retries and policies"),
        ("Keep the context", "Recorded state and source events"),
    ]):
        numbered(image, label, detail, 107, 588 + index * 98, index + 1, t, 0.7 + index * 0.45)
    footnote(image, "Observable events, not hidden reasoning. Original demo data is fictional.")
    return image


def scene_replay(t, duration):
    image = foundation(3, True)
    headline(image, ["Rewind the story.", "~Not the side effects."], 102, 218, 82, True, t)
    steps = ["PROMPT", "TEST A", "EDIT B", "CLAIM", "REVIEW"]
    positions = [230 + index * 361 for index in range(5)]
    y = 563
    rule(image, positions[0], y, positions[-1], y, (66, 87, 85), 3)
    for index, (label, x) in enumerate(zip(steps, positions)):
        dot(image, x, y, 14, TEAL if index != 2 else AMBER)
        text(image, label, x, y - 62, 24, PALE, "mono", anchor="mm")
        text(image, f"0{index + 1}", x, y + 59, 23, PALE, "mono", anchor="mm")
    movement = clamp((t - 0.8) / 2.5)
    if t > 4:
        movement = 1 - 0.5 * smooth((t - 4) / 1.9)
    cursor_x = positions[0] + (positions[-1] - positions[0]) * movement
    dot(image, cursor_x, y, 37, TEAL, 0.12)
    dot(image, cursor_x, y, 23, DARK)
    dot(image, cursor_x, y, 12, TEAL)
    for offset in (0, 1):
        ImageDraw.Draw(image).polygon([(134 + offset * 31, 754), (157 + offset * 31, 739), (157 + offset * 31, 769)], fill=TEAL)
    text(image, "READ-ONLY REPLAY", 238, 737, 26, TEAL, "mono")
    card(image, (989, 702, 1804, 838), PANEL, (67, 91, 87), 13)
    text(image, "Recorded state", 1021, 723, 21, PALE, "mono")
    text(image, "version = B    latest_test = A", 1020, 766, 33, WHITE, "mono")
    pill(image, "0 tools re-executed", 109, 821, (35, 74, 66), TEAL, 25)
    footnote(image, "Illustrated timeline. Inspect real captured steps and state without repeating an action.", True)
    return image


def scene_policies(t, duration):
    image = foundation(4, False)
    headline(image, ["A boundary.", "~Not a blind leap."], 105, 223, 74, False, t, max_width=570)
    screenshot(image, "policies", (709, 240, 1109, 602), t, duration, (0.71, 0.59), 1.64, "POLICIES / LOCAL SANDBOX RULES")
    paragraph(image, "See why an action was\nallowed, blocked, or paused.", 110, 430, 548, 32, MUTED)
    labels = [("ALLOW", (224, 239, 228), GREEN), ("BLOCK", (249, 225, 219), EMBER), ("ASK A PERSON", (246, 232, 193), (131, 87, 9))]
    for index, (value, bg, fg) in enumerate(labels):
        alpha, shift = arrival(t, 0.6 + index * 0.65)
        pill(image, value, 109, 576 + index * 85 + shift, bg, fg, 29, alpha, 357)
    footnote(image, "Demo policy rules only. Approval writes a local outbox receipt; no real email is sent.")
    return image


def scene_insights(t, duration):
    image = foundation(5, False)
    headline(image, ["Find the why.", "~Not just the error."], 105, 224, 75, False, t, max_width=565)
    screenshot(image, "insights", (707, 245, 1111, 596), t, duration, (0.4, 0.66), 1.47, "INSIGHTS / LINKED FINDINGS")
    for index, (label, detail) in enumerate([
        ("What failed?", "Follow the failure to its source run."),
        ("What repeated?", "See retries and their actual outcomes."),
        ("What took time?", "Separate operations from approval waits."),
    ]):
        numbered(image, label, detail, 108, 515 + index * 121, index + 1, t, 0.55 + index * 0.5)
    footnote(image, "The displayed figures belong to this demo workspace; they are not benchmark claims.")
    return image


def scene_verdicts(t, duration):
    image = foundation(6, True)
    headline(image, ["Does the proof", "~still apply?"], 105, 215, 87, True, t)
    text(image, "CLAIM  +  RESULT  +  VERSION  +  TARGET", 111, 449, 25, PALE, "mono")
    card(image, (1012, 224, 1797, 514), PANEL, (67, 87, 85), 17)
    pill(image, "PASS / VERSION A", 1052, 262, (36, 75, 65), TEAL, 23)
    arrow(image, (1360, 289), (1405, 289), AMBER)
    pill(image, "DELIVERED / B", 1430, 262, (78, 66, 38), AMBER, 23)
    text(image, "Unverifiable", 1405, 397, 55, AMBER, "serif", anchor="mm")
    text(image, "Not proven. Not declared broken.", 1405, 461, 25, PALE, anchor="mm")
    categories = [
        ("Supported", "The linked proof applies.", TEAL),
        ("Contradicted", "The result disagrees.", RED),
        ("Unsupported", "A proof link is missing.", BLUE),
        ("Unverifiable", "Version or scope cannot verify.", AMBER),
    ]
    for index, (label, detail, color) in enumerate(categories):
        alpha, shift = arrival(t, 0.8 + index * 0.42)
        left = 106 + index * 434
        card(image, (left, 618 + shift, left + 404, 827 + shift), PANEL, (68, 87, 85), 15, alpha)
        active = min(3, max(0, int((t - 6.1) / 1.1)))
        if t > 6.1 and index == active:
            ImageDraw.Draw(image).rounded_rectangle((left, 618, left + 404, 827), radius=15, outline=color, width=3)
        dot(image, left + 29, 651 + shift, 6, color, alpha)
        text(image, label, left + 26, 690 + shift, 34, color, "bold", alpha)
        paragraph(image, detail, left + 26, 752 + shift, 352, 24, PALE, alpha=alpha, leading=1.15)
    footnote(image, "Explicit, scope-bound checks. Model prose cannot override the computed verdict.", True)
    return image


def scene_manifest(t, duration):
    image = foundation(7, False)
    headline(image, ["Available is not", "~the same as used."], 102, 220, 75, False, t, max_width=570)
    screenshot(image, "manifest", (705, 245, 1113, 600), t, duration, (0.67, 0.83), 1.54, "EVIDENCE LENS / MANIFEST")
    numbered(image, "Know what was there", "Agents, tools, instructions and versions.", 108, 478, 1, t, 0.7)
    numbered(image, "Follow actual usage", "Each use points back to captured steps.", 108, 603, 2, t, 1.25)
    numbered(image, "Leave a useful handoff", "Proof, gaps and the next required checks.", 108, 728, 3, t, 1.8)
    footnote(image, "Unknown versions and uncaptured activity stay visible; availability is not evidence of use.")
    return image


def scene_recovery(t, duration):
    image = foundation(8, True)
    headline(image, ["A new check.", "~A better handoff."], 103, 211, 81, True, t)
    a = ease((t - 0.45) / 0.8)
    card(image, (109, 486, 695, 808), PANEL, (75, 87, 80), 19, a)
    text(image, "ORIGINAL / KEPT UNCHANGED", 145, 520, 23, PALE, "mono", a)
    text(image, "Test A. Deliver B.", 145, 585, 43, WHITE, "serif", a)
    pill(image, "Unverifiable", 146, 683, (74, 62, 37), AMBER, 31, a)
    path = curve((721, 631), (943, 631), (968, 631), (1189, 631))
    route(image, path, ease((t - 1.5) / 2.1), TEAL, 4, True)
    text(image, "REVIEW PLAN", 947, 495, 23, PALE, "mono", anchor="mm")
    dot(image, 950, 573, 25, TEAL, ease((t - 1) / 0.8))
    check(image, 950, 573, 24, DARK, ease((t - 1) / 0.8))
    text(image, "APPROVE", 946, 705, 24, TEAL, "mono", anchor="mm")
    b = ease((t - 3.4) / 0.8)
    card(image, (1214, 486, 1800, 808), PANEL, (57, 110, 92), 19, b)
    text(image, "NEW / PARENT-LINKED RUN", 1251, 520, 23, PALE, "mono", b)
    text(image, "Test B. Deliver B.", 1251, 585, 43, WHITE, "serif", b)
    pill(image, "Supported", 1252, 683, (33, 76, 62), TEAL, 31, b)
    footnote(image, "Prototype recovery runs only the bounded local mock harness. No arbitrary runtime resume.", True)
    return image


def scene_connect(t, duration):
    image = foundation(9, False)
    headline(image, ["Your agent.", "~Your workflow."], 103, 216, 80, False, t, max_width=650)
    screenshot(image, "connect", (810, 245, 1008, 598), t, duration, (0.69, 0.7), 1.36, "CONNECT / PUBLIC INTEGRATIONS")
    rows = [("SDK / HTTP", "Capture observable events"), ("READ-ONLY MCP", "Ask questions of recorded traces"), ("JSON / MARKDOWN / OTLP", "Export evidence for review")]
    for index, (label, detail) in enumerate(rows):
        a, shift = arrival(t, 0.65 + index * 0.7)
        yy = 493 + index * 118 + shift
        card(image, (110, yy, 735, yy + 96), WHITE, (202, 209, 196), 12, a)
        text(image, label, 133, yy + 15, 24, EMBER, "mono", a)
        text(image, detail, 133, yy + 52, 25, MUTED, alpha=a)
        if index < 2:
            arrow(image, (422, yy + 99), (422, yy + 113), MUTED, a)
    footnote(image, "The collector stays local. A model connection does not deploy a hosted agent.")
    return image


def scene_privacy(t, duration):
    image = foundation(10, True)
    headline(image, ["Local by default.", "~Deliberate by design."], 104, 211, 77, True, t)
    card(image, (110, 475, 844, 841), PANEL, (58, 86, 80), 20)
    text(image, "ON YOUR DESKTOP", 146, 510, 24, TEAL, "mono")
    text(image, "VS Code companion", 146, 566, 40, WHITE, "serif")
    for index, label in enumerate(["Encrypted records + review notes", "Keys in VS Code SecretStorage", "Capture only the task you choose"]):
        check(image, 156, 662 + index * 56, 20, TEAL)
        text(image, label, 190, 645 + index * 56, 28, PALE)
    card(image, (1101, 475, 1799, 841), PANEL, (67, 87, 92), 20)
    text(image, "OPTIONAL / AZURE GPT-5.4", 1139, 510, 24, BLUE, "mono")
    text(image, "Advisory handoff drafts", 1139, 566, 38, WHITE, "serif")
    for index, label in enumerate(["Preview exactly what will leave", "Approve each external request", "Never override evidence verdicts"]):
        check(image, 1146, 662 + index * 56, 20, BLUE)
        text(image, label, 1180, 645 + index * 56, 27, PALE)
    arrow(image, (876, 628), (1068, 628), TEAL, ease((t - 2) / 1))
    pill(image, "APPROVE", 890, 680, (35, 76, 67), TEAL, 22, ease((t - 2) / 1))
    if t > 3:
        progress = ((t - 3) % 2.4) / 2.4
        dot(image, 881 + progress * 175, 628, 6, TEAL, math.sin(progress * math.pi))
    footnote(image, "Encryption: VS Code vault only. Browser Lens is session-only; original SQLite is plaintext.", True)
    return image


def scene_close(t, duration):
    image = foundation(11, True)
    logo(image, 116, 242, 125, TEAL)
    headline(image, ["Agent Flight Recorder", "~with Evidence Lens."], 290, 232, 79, True, t)
    text(image, "From an answer to evidence you can inspect.", 298, 438, 34, PALE)
    phrases = [("Follow", "the run."), ("Question", "the claim."), ("Leave", "better evidence.")]
    for index, (verb, rest) in enumerate(phrases):
        a, shift = arrival(t, 0.6 + index * 0.52)
        left = 117 + index * 582
        rule(image, left, 561 + shift, left + 522, 561 + shift, (64, 93, 85), 2, a)
        text(image, verb, left, 612 + shift, 48, TEAL, "serif", a)
        text(image, rest, left, 681 + shift, 44, WHITE, "serif", a)
    text(image, "FOR DEVELOPERS  /  REVIEWERS  /  ON-CALL TEAMS", 960, 827, 25, PALE, "mono", anchor="mm")
    footnote(image, "Working local prototype  |  Actual screenshots  |  Original animation and score  |  Synthesized narration", True)
    return image


SCENES = [scene_hook, scene_maya, scene_recorder, scene_replay, scene_policies, scene_insights,
          scene_verdicts, scene_manifest, scene_recovery, scene_connect, scene_privacy, scene_close]


def captions(image, seconds):
    cue = next((item for item in CAPTIONS if item["start"] <= seconds <= item["end"]), None)
    if cue is None:
        return
    lines = wrap(cue["text"], 1640, 35, "body")
    if len(lines) > 2:
        raise ValueError(f"Caption is too long for the safe area: {cue['text']}")
    top = 963 if len(lines) == 1 else 945
    bottom = top + 19 + len(lines) * 43
    ImageDraw.Draw(image, "RGBA").rounded_rectangle((100, top, 1820, bottom), radius=10, fill=(11, 20, 23, 241))
    for index, line in enumerate(lines):
        text(image, line, 960, top + 12 + index * 43, 35, WHITE, anchor="mt")


def frame(seconds, with_captions=True):
    index = max(index for index, start in enumerate(STARTS) if start <= min(seconds, 119.999))
    local = seconds - STARTS[index]
    duration = STORY["scenes"][index]["duration"]
    image = SCENES[index](local, duration)
    transition = 0.42
    if index and local < transition:
        previous = SCENES[index - 1](STORY["scenes"][index - 1]["duration"], STORY["scenes"][index - 1]["duration"])
        image = Image.blend(previous, image, smooth(local / transition))
    if with_captions:
        captions(image, seconds)
    rule(image, 100, 1060, 1820, 1060, (69, 82, 80), 2)
    rule(image, 100, 1060, 100 + 1720 * clamp(seconds / 120), 1060, TEAL, 3)
    for start in STARTS[1:]:
        rule(image, 100 + 1720 * start / 120, 1055, 100 + 1720 * start / 120, 1065, MUTED, 2)
    if seconds < 0.5:
        image = Image.blend(Image.new("RGB", (W, H), DARK), image, smooth(seconds / 0.5))
    if seconds > 119.2:
        image = Image.blend(image, Image.new("RGB", (W, H), DARK), smooth((seconds - 119.2) / 0.8))
    return image


def previews():
    directory = OUT / "preview"
    directory.mkdir(parents=True, exist_ok=True)
    sheet = Image.new("RGB", (1920, 984), (225, 226, 217))
    for index, (start, scene) in enumerate(zip(STARTS, STORY["scenes"])):
        moment = start + min(scene["duration"] - 1.0, 5.6)
        image = frame(moment)
        image.save(directory / f"{index + 1:02}-{scene['id']}.jpg", quality=94)
        thumb = image.resize((480, 270), Image.Resampling.LANCZOS)
        x, y = index % 4 * 480, index // 4 * 328
        sheet.paste(thumb, (x, y))
        text(sheet, f"{index + 1:02}  {start:03}s  /  {scene['id'].upper()}", x + 14, y + 284, 23, INK, "mono")
    sheet.save(OUT / "Storyboard-contact-sheet.jpg", quality=94)
    poster = frame(STARTS[-1] + 6, with_captions=False)
    poster.save(OUT / "Agent-Flight-Recorder-Poster.png")
    print("Twelve full-size preview frames, contact sheet and poster generated.", flush=True)


def render():
    audio = OUT / "audio" / "master.wav"
    if not audio.is_file() or not CAPTIONS:
        raise FileNotFoundError("Generate narration and captions before rendering.")
    target = OUT / "Agent-Flight-Recorder-Hackathon-2026.mp4"
    temporary = OUT / "Agent-Flight-Recorder-Hackathon-2026.rendering.mp4"
    command = [
        imageio_ffmpeg.get_ffmpeg_exe(), "-y", "-hide_banner", "-loglevel", "warning",
        "-f", "rawvideo", "-vcodec", "rawvideo", "-pix_fmt", "rgb24",
        "-s", f"{W}x{H}", "-r", str(FPS), "-i", "pipe:0", "-i", str(audio),
        "-map", "0:v:0", "-map", "1:a:0", "-c:v", "libx264", "-preset", "medium", "-crf", "18",
        "-threads", "4", "-vf", "scale=in_range=full:out_range=tv:out_color_matrix=bt709,format=yuv420p",
        "-pix_fmt", "yuv420p", "-profile:v", "high", "-level:v", "4.1",
        "-r", str(FPS), "-frames:v", str(120 * FPS), "-c:a", "aac", "-b:a", "192k",
        "-ar", "48000", "-ac", "2", "-t", "120", "-movflags", "+faststart",
        "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
        "-metadata", "title=Agent Flight Recorder - From answer to evidence",
        "-metadata", "comment=Original animated walkthrough using supplied product screenshots. Locally synthesized narration and original score.",
        str(temporary),
    ]
    started = time.monotonic()
    with (OUT / "render.log").open("wb") as log:
        process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=log)
        try:
            for number in range(120 * FPS):
                process.stdin.write(frame(number / FPS).tobytes())
                if number % (FPS * 10) == 0:
                    print(f"Rendered {number // FPS:3}/120 seconds | elapsed {time.monotonic() - started:.1f}s", flush=True)
            process.stdin.close()
            code = process.wait(timeout=180)
            if code:
                raise RuntimeError(f"FFmpeg failed ({code}); inspect {OUT / 'render.log'}")
        except BaseException:
            if process.poll() is None:
                process.kill()
                process.wait(timeout=30)
            raise
    temporary.replace(target)
    print(f"Completed {target.name}: {target.stat().st_size / 1024 / 1024:.1f} MiB in {time.monotonic() - started:.1f}s", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["preview", "render"])
    args = parser.parse_args()
    if args.action == "preview":
        previews()
    else:
        render()
