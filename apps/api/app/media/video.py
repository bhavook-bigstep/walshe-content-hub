"""Rudimentary video MP4 (AC13).

``build_scene_script`` turns catalog-ish items into a deterministic ``Scenes`` script;
``render_video`` encodes it with ffmpeg (zoompan Ken-Burns + drawtext title/caption overlays),
optionally narrated by ``say``/``espeak``. Subprocess and tool lookup are injectable so unit
tests never encode. Only argv lists are used (no shell), and overlay text is escaped for
drawtext.
"""
from __future__ import annotations

import shutil
import subprocess
import tempfile
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

WIDTH, HEIGHT, FPS = 1280, 720, 25
SCENE_SECONDS = 4.0
MAX_ITEMS = 20
MAX_TEXT = 200
BG_COLORS = ("0x1f3a5f", "0x3a5f1f", "0x5f1f3a", "0x5f4b1f")


@dataclass(frozen=True)
class Scene:
    index: int
    title: str
    caption: str
    duration: float
    narration: str


Scenes = list[Scene]


def build_scene_script(items: Sequence[dict[str, Any]]) -> Scenes:
    """Deterministic scene list: one scene per item (bounded), same input -> same output."""
    scenes: Scenes = []
    for i, item in enumerate(list(items)[:MAX_ITEMS]):
        title = str(item.get("title") or item.get("name") or f"Scene {i + 1}").strip()[:MAX_TEXT]
        caption = str(item.get("description") or item.get("text") or "").strip()[:MAX_TEXT]
        narration = f"{title}. {caption}".strip() if caption else title
        scenes.append(Scene(i, title, caption, SCENE_SECONDS, narration))
    return scenes


def escape_drawtext(text: str) -> str:
    """Escape text for a single-quoted drawtext ``text=`` value inside a -vf graph."""
    out = text.replace("\\", "\\\\").replace("'", "’")
    for ch in (":", "%", ",", ";", "[", "]"):
        out = out.replace(ch, "\\" + ch)
    return out.replace("\n", " ")


def _filter(scene: Scene) -> str:
    frames = int(scene.duration * FPS)
    parts = [
        f"zoompan=z='min(zoom+0.0015,1.3)':d={frames}:s={WIDTH}x{HEIGHT}:fps={FPS}",
        f"drawtext=text='{escape_drawtext(scene.title)}':fontcolor=white:fontsize=56:"
        "x=(w-text_w)/2:y=h*0.15:box=1:boxcolor=black@0.5:boxborderw=12",
    ]
    if scene.caption:
        parts.append(
            f"drawtext=text='{escape_drawtext(scene.caption)}':fontcolor=white:fontsize=30:"
            "x=(w-text_w)/2:y=h*0.82:box=1:boxcolor=black@0.5:boxborderw=8"
        )
    return ",".join(parts)


def build_scene_cmd(
    scene: Scene, image: str | None, out: str, audio: str | None = None
) -> list[str]:
    """ffmpeg argv for one scene clip (image or generated colour background)."""
    cmd = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error"]
    if image:
        cmd += ["-loop", "1", "-t", f"{scene.duration}", "-i", image]
    else:
        color = BG_COLORS[scene.index % len(BG_COLORS)]
        src = f"color=c={color}:s={WIDTH}x{HEIGHT}"
        cmd += ["-f", "lavfi", "-t", f"{scene.duration}", "-i", src]
    if audio:
        cmd += ["-i", audio]
    cmd += ["-vf", _filter(scene)]
    if audio:
        cmd += ["-af", "apad", "-shortest"]
    cmd += ["-r", str(FPS), "-pix_fmt", "yuv420p", "-c:v", "libx264"]
    if audio:
        cmd += ["-c:a", "aac"]
    return cmd + [out]


def build_concat_cmd(list_file: str, out: str) -> list[str]:
    return ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "0",
            "-i", list_file, "-c", "copy", out]


def _tts_cmd(which: Callable[[str], str | None], text: str, out: str) -> list[str] | None:
    if which("say"):
        return ["say", "-o", out, "--", text]
    if which("espeak"):
        return ["espeak", "-w", out, "--", text]
    return None


def render_video(
    scenes: Scenes,
    images: Sequence[str] | None = None,
    *,
    out_dir: str | Path | None = None,
    tts: bool = True,
    runner: Callable[..., Any] = subprocess.run,
    which: Callable[[str], str | None] = shutil.which,
) -> str:
    """Encode ``scenes`` to ``<out_dir>/video.mp4`` and return that path."""
    if not scenes:
        raise ValueError("no scenes to render")
    if which("ffmpeg") is None:
        raise RuntimeError("ffmpeg is not installed")
    work = Path(out_dir) if out_dir else Path(tempfile.mkdtemp(prefix="video-"))
    work.mkdir(parents=True, exist_ok=True)
    images = list(images or [])
    clips: list[str] = []
    srt: list[str] = []
    start = 0.0
    for scene in scenes:
        clip = str(work / f"scene{scene.index:02d}.mp4")
        audio = None
        if tts:
            audio_path = str(work / f"scene{scene.index:02d}.aiff")
            tcmd = _tts_cmd(which, scene.narration, audio_path)
            if tcmd:
                runner(tcmd, check=True, capture_output=True)
                audio = audio_path
        image = images[scene.index] if scene.index < len(images) else None
        runner(build_scene_cmd(scene, image, clip, audio), check=True, capture_output=True)
        clips.append(clip)
        srt.append(f"{scene.index + 1}\n{_ts(start)} --> {_ts(start + scene.duration)}\n"
                   f"{scene.caption or scene.title}\n")
        start += scene.duration
    (work / "captions.srt").write_text("\n".join(srt), encoding="utf-8")
    list_file = work / "clips.txt"
    list_file.write_text("".join(f"file '{c}'\n" for c in clips), encoding="utf-8")
    out = str(work / "video.mp4")
    runner(build_concat_cmd(str(list_file), out), check=True, capture_output=True)
    return out


def _ts(seconds: float) -> str:
    ms = int(round(seconds * 1000))
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"
