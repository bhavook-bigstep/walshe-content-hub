"""Rudimentary video MP4 (AC13 + AC47 storyboard).

``build_scene_script`` turns catalog-ish items into a deterministic ``Scenes`` script, carrying a
per-scene **duration** (lifespan) and **transition** into the next scene; ``render_video`` encodes
it with ffmpeg (zoompan Ken-Burns + drawtext title/caption overlays), optionally narrated by
``say``/``espeak``, and stitches the clips together — crossfading consecutive scenes with
``xfade`` when a transition is set, or hard-cutting (concat) for ``none`` or when xfade is
unavailable. Subprocess and tool lookup are injectable so unit tests never encode. Only argv lists
are used (no shell), and overlay text is escaped for drawtext.
"""

from __future__ import annotations

import functools
import logging
import math
import os
import shutil
import subprocess
import tempfile
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

WIDTH, HEIGHT, FPS = 1280, 720, 25
SCENE_SECONDS = 4.0
MIN_SCENE_SECONDS = 0.5
MAX_SCENE_SECONDS = 15.0
XFADE_SECONDS = 0.6  # nominal crossfade length (clamped below each adjoining scene's half-length)
MAX_ITEMS = 20
MAX_TEXT = 200
BG_COLORS = ("0x1f3a5f", "0x3a5f1f", "0x5f1f3a", "0x5f4b1f")

# Design transition kind -> ffmpeg xfade mode. "none" (and anything unknown) means a hard cut.
XFADE_MODES = {"fade": "fade", "slide-left": "slideleft", "zoom": "zoomin"}


@dataclass(frozen=True)
class Scene:
    index: int
    title: str
    caption: str
    duration: float
    narration: str
    transition: str = "none"


Scenes = list[Scene]


def clamp_duration(seconds: float) -> float:
    """Clamp a scene lifespan into the allowed window; non-finite falls back to the default."""
    if not math.isfinite(seconds):
        return SCENE_SECONDS
    return min(MAX_SCENE_SECONDS, max(MIN_SCENE_SECONDS, seconds))


def build_scene_script(items: Sequence[dict[str, Any]]) -> Scenes:
    """Deterministic scene list: one scene per item (bounded), same input -> same output.

    Each item may carry ``duration_ms`` (clamped) and ``transition`` (into the next scene);
    absent values fall back to the 4s default and a hard cut (``none``).
    """
    scenes: Scenes = []
    for i, item in enumerate(list(items)[:MAX_ITEMS]):
        title = str(item.get("title") or item.get("name") or f"Scene {i + 1}").strip()[:MAX_TEXT]
        caption = str(item.get("description") or item.get("text") or "").strip()[:MAX_TEXT]
        # An explicit per-scene narration script wins; otherwise fall back to title + caption.
        explicit = str(item.get("narration") or "").strip()[:600]
        narration = explicit or (f"{title}. {caption}".strip() if caption else title)
        ms = item.get("duration_ms")
        duration = (
            clamp_duration(float(ms) / 1000.0) if isinstance(ms, (int, float)) else SCENE_SECONDS
        )
        transition = str(item.get("transition") or "none")
        transition = transition if transition in XFADE_MODES or transition == "none" else "none"
        scenes.append(Scene(i, title, caption, duration, narration, transition))
    return scenes


def escape_drawtext(text: str) -> str:
    """Escape text for a single-quoted drawtext ``text=`` value inside a -vf graph."""
    out = text.replace("\\", "\\\\").replace("'", "’")
    for ch in (":", "%", ",", ";", "[", "]"):
        out = out.replace(ch, "\\" + ch)
    return out.replace("\n", " ")


@functools.lru_cache(maxsize=8)
def _supports_drawtext(ffmpeg: str) -> bool:
    """Whether this ffmpeg build has the ``drawtext`` filter (needs libfreetype).

    Some builds (e.g. a minimal Homebrew ffmpeg) omit it; `drawtext` then errors out the whole
    render. We probe ``ffmpeg -filters`` once per binary and, if drawtext is missing, drop the text
    overlays so the video still renders (just without burned-in captions). An inconclusive probe
    (binary not found / error) keeps the overlays — the default, tested behaviour."""
    try:
        res = subprocess.run([ffmpeg, "-hide_banner", "-filters"], capture_output=True, timeout=10)
        out = (res.stdout or b"") + (res.stderr or b"")
        return b"drawtext" in out
    except Exception:
        return True


def _filter(scene: Scene, with_text: bool = True, has_image: bool = True) -> str:
    parts: list[str] = []
    # The Ken-Burns zoom only matters over a real photo; skip it for colour backgrounds (it just
    # burns CPU generating frames on a flat colour), which keeps imageless renders near-instant.
    if has_image:
        frames = int(scene.duration * FPS)
        parts.append(f"zoompan=z='min(zoom+0.0015,1.3)':d={frames}:s={WIDTH}x{HEIGHT}:fps={FPS}")
    if with_text:
        parts.append(
            f"drawtext=text='{escape_drawtext(scene.title)}':fontcolor=white:fontsize=56:"
            "x=(w-text_w)/2:y=h*0.15:box=1:boxcolor=black@0.5:boxborderw=12"
        )
        if scene.caption:
            parts.append(
                f"drawtext=text='{escape_drawtext(scene.caption)}':fontcolor=white:fontsize=30:"
                "x=(w-text_w)/2:y=h*0.82:box=1:boxcolor=black@0.5:boxborderw=8"
            )
    return ",".join(parts)


def build_scene_cmd(
    scene: Scene, image: str | None, out: str, audio: str | None = None, with_text: bool = True
) -> list[str]:
    """ffmpeg argv for one scene clip (image or generated colour background).

    Every clip is given an audio track — the narration when present, otherwise generated silence —
    so clips always have uniform streams for a clean concat/xfade join. ``with_text`` burns in the
    title/caption via drawtext; pass False when the ffmpeg build lacks that filter.
    """
    cmd = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error"]
    if image:
        cmd += ["-loop", "1", "-t", f"{scene.duration}", "-i", image]
    else:
        color = BG_COLORS[scene.index % len(BG_COLORS)]
        src = f"color=c={color}:s={WIDTH}x{HEIGHT}"
        cmd += ["-f", "lavfi", "-t", f"{scene.duration}", "-i", src]
    if audio:
        cmd += ["-i", audio]
    else:
        cmd += ["-f", "lavfi", "-t", f"{scene.duration}", "-i", "anullsrc=r=44100:cl=stereo"]
    vf = _filter(scene, with_text, has_image=bool(image))
    if vf:
        cmd += ["-vf", vf]
    if audio:
        cmd += ["-af", "apad", "-shortest"]
    # ultrafast keeps the PoC render quick (a few seconds, not minutes) at a small size cost.
    cmd += [
        "-r",
        str(FPS),
        "-pix_fmt",
        "yuv420p",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-c:a",
        "aac",
    ]
    return cmd + [out]


def build_concat_cmd(list_file: str, out: str) -> list[str]:
    return [
        "ffmpeg",
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        list_file,
        "-c",
        "copy",
        out,
    ]


def xfade_duration(left: Scene, right: Scene) -> float:
    """Crossfade length for a join, clamped so it never exceeds half of either adjoining scene."""
    return max(0.1, min(XFADE_SECONDS, left.duration / 2, right.duration / 2))


def _join_cmd(left: str, right: str, filter_complex: str, out: str) -> list[str]:
    """ffmpeg argv joining two clips via a filter_complex that maps to [v] + [a]."""
    return [
        "ffmpeg",
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        left,
        "-i",
        right,
        "-filter_complex",
        filter_complex,
        "-map",
        "[v]",
        "-map",
        "[a]",
        "-r",
        str(FPS),
        "-pix_fmt",
        "yuv420p",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-c:a",
        "aac",
        out,
    ]


def build_xfade_cmd(
    left: str, right: str, mode: str, duration: float, offset: float, out: str
) -> list[str]:
    """ffmpeg argv crossfading two clips (video xfade + audio acrossfade) into one."""
    fc = (
        f"[0:v][1:v]xfade=transition={mode}:duration={duration:.3f}:offset={offset:.3f}[v];"
        f"[0:a][1:a]acrossfade=d={duration:.3f}[a]"
    )
    return _join_cmd(left, right, fc, out)


def build_join_concat_cmd(left: str, right: str, out: str) -> list[str]:
    """ffmpeg argv hard-cutting two clips together (a ``none`` transition inside an xfade chain)."""
    fc = "[0:v][1:v]concat=n=2:v=1:a=0[v];[0:a][1:a]concat=n=2:v=0:a=1[a]"
    return _join_cmd(left, right, fc, out)


def uses_xfade(scenes: Scenes, *, xfade: bool) -> bool:
    """Whether the sequence is stitched with crossfades (any scene requests a mapped transition)."""
    return xfade and len(scenes) > 1 and any(XFADE_MODES.get(s.transition) for s in scenes[:-1])


def scene_start_times(scenes: Scenes, *, use_xfade: bool) -> list[float]:
    """Start offset (s) of each scene on the final timeline, accounting for crossfade overlaps.

    Mirrors the overlap arithmetic in ``_stitch_xfade`` so captions stay in sync with the video.
    """
    starts = [0.0]
    for i in range(1, len(scenes)):
        prev = scenes[i - 1]
        crossfaded = use_xfade and XFADE_MODES.get(prev.transition)
        overlap = xfade_duration(prev, scenes[i]) if crossfaded else 0.0
        starts.append(starts[-1] + prev.duration - overlap)
    return starts


def _tts_cmd(which: Callable[[str], str | None], text: str, out: str) -> list[str] | None:
    if which("say"):
        return ["say", "-o", out, "--", text]
    if which("espeak"):
        return ["espeak", "-w", out, "--", text]
    return None


def _stitch_xfade(scenes: Scenes, clips: list[str], work: Path, runner: Callable[..., Any]) -> str:
    """Join clips honouring each scene's transition (xfade crossfade or hard-cut concat)."""
    acc = clips[0]
    acc_dur = scenes[0].duration
    for i in range(1, len(scenes)):
        prev = scenes[i - 1]  # its transition applies to the join prev -> i
        mode = XFADE_MODES.get(prev.transition)
        out = str(work / ("video.mp4" if i == len(scenes) - 1 else f"join{i:02d}.mp4"))
        if mode:
            xd = xfade_duration(prev, scenes[i])
            offset = max(0.0, acc_dur - xd)
            cmd = build_xfade_cmd(acc, clips[i], mode, xd, offset, out)
            runner(cmd, check=True, capture_output=True)
            acc_dur = acc_dur + scenes[i].duration - xd
        else:
            runner(build_join_concat_cmd(acc, clips[i], out), check=True, capture_output=True)
            acc_dur = acc_dur + scenes[i].duration
        acc = out
    return acc


def render_video(
    scenes: Scenes,
    images: Sequence[str] | None = None,
    *,
    out_dir: str | Path | None = None,
    tts: bool = True,
    xfade: bool = True,
    runner: Callable[..., Any] = subprocess.run,
    which: Callable[[str], str | None] = shutil.which,
) -> str:
    """Encode ``scenes`` to ``<out_dir>/video.mp4`` and return that path."""
    if not scenes:
        raise ValueError("no scenes to render")
    ffmpeg = which("ffmpeg")
    if ffmpeg is None:
        raise RuntimeError("ffmpeg is not installed")
    # Drop burned-in captions when this ffmpeg build lacks drawtext, so the render still succeeds.
    with_text = _supports_drawtext(ffmpeg)
    work = Path(out_dir) if out_dir else Path(tempfile.mkdtemp(prefix="video-"))
    work.mkdir(parents=True, exist_ok=True)
    images = list(images or [])
    clips: list[str] = []

    # Crossfade when any scene requests a mapped transition and xfade is enabled; else hard-cut.
    use_xfade = uses_xfade(scenes, xfade=xfade)
    starts = scene_start_times(scenes, use_xfade=use_xfade)

    srt: list[str] = []
    for scene, start in zip(scenes, starts, strict=True):
        clip = str(work / f"scene{scene.index:02d}.mp4")
        audio = None
        if tts:
            audio_path = str(work / f"scene{scene.index:02d}.aiff")
            tcmd = _tts_cmd(which, scene.narration, audio_path)
            if tcmd:
                runner(tcmd, check=True, capture_output=True)
                audio = audio_path
        image = images[scene.index] if scene.index < len(images) else None
        runner(
            build_scene_cmd(scene, image, clip, audio, with_text=with_text),
            check=True,
            capture_output=True,
        )
        clips.append(clip)
        srt.append(
            f"{scene.index + 1}\n{_ts(start)} --> {_ts(start + scene.duration)}\n"
            f"{scene.caption or scene.title}\n"
        )
    (work / "captions.srt").write_text("\n".join(srt), encoding="utf-8")
    return _stitch(scenes, clips, work, runner, use_xfade=use_xfade)


def _stitch(
    scenes: Scenes, clips: list[str], work: Path, runner: Callable[..., Any], *, use_xfade: bool
) -> str:
    """Join per-scene clips into ``<work>/video.mp4`` — crossfade when requested, else a hard cut.
    A crossfade that fails (an ffmpeg build without xfade) degrades to the hard-cut concat."""
    if use_xfade:
        try:
            return _stitch_xfade(scenes, clips, work, runner)
        except subprocess.CalledProcessError:
            logger.warning("xfade stitch failed (%d scenes); hard-cut fallback", len(scenes))
    out = str(work / "video.mp4")
    list_file = work / "clips.txt"
    list_file.write_text("".join(f"file '{c}'\n" for c in clips), encoding="utf-8")
    runner(build_concat_cmd(str(list_file), out), check=True, capture_output=True)
    return out


def build_frames_clip_cmd(pattern: str, fps: int, out: str, audio: str | None = None) -> list[str]:
    """ffmpeg argv to encode one scene clip from an image SEQUENCE (frame%05d.jpg). The frames
    already carry the animation + timing (frame count = duration × fps), so no -vf is needed."""
    cmd = [
        "ffmpeg",
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-framerate",
        str(fps),
        "-i",
        pattern,
    ]
    if audio:
        cmd += ["-i", audio]
    else:
        cmd += ["-f", "lavfi", "-t", "3600", "-i", "anullsrc=r=44100:cl=stereo"]
    # Force even dimensions (yuv420p requires them); frame sizes from the client may be odd.
    cmd += ["-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2"]
    cmd += [
        "-r",
        str(FPS),
        "-pix_fmt",
        "yuv420p",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-c:a",
        "aac",
    ]
    cmd += ["-shortest", out]
    return cmd


def render_video_frames(
    scenes: Scenes,
    frame_dirs: Sequence[str],
    *,
    fps: int,
    out_dir: str | Path | None = None,
    tts: bool = False,
    xfade: bool = True,
    runner: Callable[..., Any] = subprocess.run,
    which: Callable[[str], str | None] = shutil.which,
) -> str:
    """Encode pre-rendered WYSIWYG frame sequences (one dir per scene, ``frame%05d.jpg``) into an
    MP4 — the animation is already baked into the frames, so this just sequences + stitches them
    (with each scene's transition) and optionally lays TTS narration under each scene."""
    if not scenes:
        raise ValueError("no scenes to render")
    if which("ffmpeg") is None:
        raise RuntimeError("ffmpeg is not installed")
    work = Path(out_dir) if out_dir else Path(tempfile.mkdtemp(prefix="video-"))
    work.mkdir(parents=True, exist_ok=True)

    use_xfade = uses_xfade(scenes, xfade=xfade)
    starts = scene_start_times(scenes, use_xfade=use_xfade)
    clips: list[str] = []
    srt: list[str] = []
    for scene, start in zip(scenes, starts, strict=True):
        clip = str(work / f"scene{scene.index:02d}.mp4")
        pattern = os.path.join(frame_dirs[scene.index], "frame%05d.jpg")
        audio = None
        if tts:
            audio_path = str(work / f"scene{scene.index:02d}.aiff")
            tcmd = _tts_cmd(which, scene.narration, audio_path)
            if tcmd:
                runner(tcmd, check=True, capture_output=True)
                audio = audio_path
        runner(build_frames_clip_cmd(pattern, fps, clip, audio), check=True, capture_output=True)
        clips.append(clip)
        srt.append(
            f"{scene.index + 1}\n{_ts(start)} --> {_ts(start + scene.duration)}\n"
            f"{scene.caption or scene.title}\n"
        )
    (work / "captions.srt").write_text("\n".join(srt), encoding="utf-8")
    return _stitch(scenes, clips, work, runner, use_xfade=use_xfade)


def _ts(seconds: float) -> str:
    ms = int(round(seconds * 1000))
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"
