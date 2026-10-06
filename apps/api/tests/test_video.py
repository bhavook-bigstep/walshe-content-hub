"""AC13 — rudimentary video MP4. ffmpeg/TTS mocked; real encode is opt-in (RUN_REAL_FFMPEG=1)."""

from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path

import pytest

import app.media.video as video_mod
import app.routers.render as render_mod
from app.media.video import (
    MAX_SCENE_SECONDS,
    SCENE_SECONDS,
    _filter,
    _supports_drawtext,
    build_frames_clip_cmd,
    build_scene_cmd,
    build_scene_script,
    clamp_duration,
    escape_drawtext,
    render_video,
    render_video_frames,
)
from app.models.catalog import Asset, CatalogEntry, CatalogType, EntryStatus

ITEMS = [
    {"title": "Galway: Arts", "description": "It's 100% fun, really"},
    {"title": "Cliffs", "description": ""},
]


def test_scene_script_deterministic_and_cmd_shape(tmp_path):
    assert build_scene_script(ITEMS) == build_scene_script(ITEMS)
    scenes = build_scene_script(ITEMS)
    assert [s.title for s in scenes] == ["Galway: Arts", "Cliffs"]

    calls: list[list[str]] = []

    def runner(cmd, **_kw):
        calls.append(list(cmd))

    tools = {"ffmpeg": "/x/ffmpeg", "say": "/x/say"}
    out = render_video(scenes, ["/img/a.jpg"], out_dir=tmp_path, runner=runner, which=tools.get)

    assert out == str(tmp_path / "video.mp4")
    assert calls[0][0] == "say"  # TTS mocked
    scene_cmds = [c for c in calls if c[0] == "ffmpeg" and "-vf" in c]
    assert len(scene_cmds) == 2
    vf0 = scene_cmds[0][scene_cmds[0].index("-vf") + 1]
    assert "zoompan=" in vf0 and vf0.count("drawtext=") == 2  # title + caption
    assert "-i" in scene_cmds[0] and "/img/a.jpg" in scene_cmds[0]
    assert "lavfi" in scene_cmds[1]  # no image -> generated background
    vf1 = scene_cmds[1][scene_cmds[1].index("-vf") + 1]
    assert vf1.count("drawtext=") == 1  # empty caption -> title only
    assert calls[-1][-1] == out and "concat" in calls[-1]
    srt = (Path(tmp_path) / "captions.srt").read_text()
    assert srt.startswith("1\n00:00:00,000 --> 00:00:04,000")


def test_no_tts_tool_and_missing_ffmpeg(tmp_path):
    scenes = build_scene_script(ITEMS)
    calls: list[list[str]] = []
    render_video(
        scenes,
        None,
        out_dir=tmp_path,
        runner=lambda c, **k: calls.append(c),
        which={"ffmpeg": "f"}.get,
    )
    assert all(c[0] == "ffmpeg" for c in calls)
    with pytest.raises(RuntimeError):
        render_video(
            scenes, None, out_dir=tmp_path, runner=lambda *a, **k: None, which=lambda _: None
        )


# AC47 — storyboard: per-scene duration + transition drive the deterministic scene script.
def test_scene_script_duration_and_transition():
    items = [
        {"title": "A", "description": "a", "duration_ms": 2000, "transition": "fade"},
        {"title": "B", "description": "b", "duration_ms": 99_999_999, "transition": "zoom"},
        {"title": "C", "description": "", "transition": "bogus"},
    ]
    scenes = build_scene_script(items)
    assert [s.duration for s in scenes] == [2.0, MAX_SCENE_SECONDS, SCENE_SECONDS]
    assert [s.transition for s in scenes] == ["fade", "zoom", "none"]  # unknown -> hard cut
    assert build_scene_script(items) == scenes  # deterministic

    # clamp_duration guards non-finite input and the window bounds.
    assert clamp_duration(float("nan")) == SCENE_SECONDS
    assert clamp_duration(float("inf")) == SCENE_SECONDS
    assert clamp_duration(0.1) == 0.5 and clamp_duration(99.0) == MAX_SCENE_SECONDS


# AC47 — a requested transition stitches consecutive scenes with ffmpeg xfade (deterministic argv).
def test_render_video_xfade_chain(tmp_path):
    scenes = build_scene_script(
        [
            {"title": "A", "duration_ms": 2000, "transition": "fade"},
            {"title": "B", "duration_ms": 3000, "transition": "slide-left"},
            {"title": "C", "duration_ms": 2000, "transition": "none"},
        ]
    )
    calls: list[list[str]] = []
    out = render_video(
        scenes,
        None,
        out_dir=tmp_path,
        tts=False,
        which={"ffmpeg": "f"}.get,
        runner=lambda cmd, **_: calls.append(list(cmd)),
    )

    scene_clips = [c for c in calls if "-vf" in c]
    joins = [" ".join(c) for c in calls if "-filter_complex" in c]
    assert len(scene_clips) == 3 and len(joins) == 2
    # Per-scene durations reach the clip encode (the "durations" part of the claim).
    assert ["2.0", "3.0", "2.0"] == [c[c.index("-t") + 1] for c in scene_clips]
    # Joins are ordered: A->B uses A's fade (offset 2.0-0.6); B->C uses B's slide-left.
    assert "xfade=transition=fade:duration=0.600:offset=1.400" in joins[0]
    assert "acrossfade=d=0.600" in joins[0]
    assert "xfade=transition=slideleft:duration=0.600:offset=3.800" in joins[1]
    assert calls[-1][-1] == out == str(tmp_path / "video.mp4")

    # Captions stay in sync with the crossfaded timeline: scene 2 starts at 1.4s, scene 3 at 3.8s.
    srt = (tmp_path / "captions.srt").read_text()
    assert "00:00:00,000 --> 00:00:02,000" in srt  # scene 1
    assert "00:00:01,400 --> 00:00:04,400" in srt  # scene 2 (overlaps into scene 1's tail)
    assert "00:00:03,800 --> 00:00:05,800" in srt  # scene 3

    # Deterministic: same inputs -> same argv.
    again: list[list[str]] = []
    render_video(
        scenes,
        None,
        out_dir=tmp_path,
        tts=False,
        which={"ffmpeg": "f"}.get,
        runner=lambda cmd, **_: again.append(list(cmd)),
    )
    assert again == calls


# AC47 — xfade crossfade is clamped below the shorter scene; xfade=False forces hard cuts.
def test_render_video_xfade_edge_cases(tmp_path):
    short = build_scene_script(
        [
            {"title": "A", "duration_ms": 500, "transition": "fade"},
            {"title": "B", "duration_ms": 500},
        ]
    )
    calls: list[list[str]] = []
    render_video(
        short,
        None,
        out_dir=tmp_path,
        tts=False,
        which={"ffmpeg": "f"}.get,
        runner=lambda cmd, **_: calls.append(list(cmd)),
    )
    join = " ".join(next(c for c in calls if "-filter_complex" in c))
    # xd = min(0.6, 0.5/2, 0.5/2) = 0.25; offset = 0.5 - 0.25.
    assert "duration=0.250:offset=0.250" in join

    # xfade=False renders hard cuts even when transitions are set.
    off: list[list[str]] = []
    render_video(
        short,
        None,
        out_dir=tmp_path,
        tts=False,
        xfade=False,
        which={"ffmpeg": "f"}.get,
        runner=lambda cmd, **_: off.append(list(cmd)),
    )
    assert not any("-filter_complex" in c for c in off)
    assert any("-f" in c and "concat" in c for c in off)


# AC47 — a mid-chain "none" join hard-cuts while its neighbours crossfade (acc_dur stays correct).
def test_render_video_mixed_transitions(tmp_path):
    scenes = build_scene_script(
        [
            {"title": "A", "duration_ms": 2000, "transition": "fade"},
            {"title": "B", "duration_ms": 2000, "transition": "none"},
            {"title": "C", "duration_ms": 2000, "transition": "fade"},
        ]
    )
    calls: list[list[str]] = []
    render_video(
        scenes,
        None,
        out_dir=tmp_path,
        tts=False,
        which={"ffmpeg": "f"}.get,
        runner=lambda cmd, **_: calls.append(list(cmd)),
    )
    joins = [" ".join(c) for c in calls if "-filter_complex" in c]
    assert "xfade=transition=fade:duration=0.600:offset=1.400" in joins[0]  # A->B crossfade
    assert "concat=n=2" in joins[1]  # B->C hard cut (B's transition is none)
    # SRT: B starts at 1.4 (after A's crossfade); C at 1.4 + 2.0 (hard cut, no overlap) = 3.4.
    srt = (tmp_path / "captions.srt").read_text()
    assert "00:00:01,400 -->" in srt
    assert "00:00:03,400 -->" in srt


# AC47 — all-"none" scenes hard-cut (concat), never xfade.
def test_render_video_all_none_hard_cut(tmp_path):
    scenes = build_scene_script([{"title": "A"}, {"title": "B"}])  # default transition "none"
    calls: list[list[str]] = []
    render_video(
        scenes,
        None,
        out_dir=tmp_path,
        tts=False,
        which={"ffmpeg": "f"}.get,
        runner=lambda cmd, **_: calls.append(list(cmd)),
    )
    assert not any("-filter_complex" in c for c in calls)
    assert "concat" in calls[-1]


# AC47 — a failing xfade (e.g. an ffmpeg build without it) degrades to the hard-cut concat.
def test_render_video_xfade_fallback_to_concat(tmp_path):
    scenes = build_scene_script(
        [
            {"title": "A", "transition": "fade", "duration_ms": 2000},
            {"title": "B", "transition": "fade", "duration_ms": 2000},
        ]
    )
    calls: list[list[str]] = []

    def runner(cmd, **_):
        calls.append(list(cmd))
        if "-filter_complex" in cmd and "xfade" in " ".join(cmd):
            raise subprocess.CalledProcessError(1, cmd)

    out = render_video(
        scenes, None, out_dir=tmp_path, tts=False, which={"ffmpeg": "f"}.get, runner=runner
    )
    assert any("-filter_complex" in c for c in calls)  # xfade attempted
    assert "concat" in calls[-1] and calls[-1][-1] == out  # then fell back to a hard cut


def test_escape_drawtext():
    out = escape_drawtext("a:b'c%d,e")
    assert "\\:" in out and "\\%" in out and "\\," in out and "'" not in out


def test_video_route_agent_only(client, agent_headers, provider_headers, monkeypatch):
    monkeypatch.setattr(render_mod, "encode_video", lambda scenes, imgs, tts=False: _fake(scenes))
    body = {
        "scenes": [
            {"item_id": None, "title": t["title"], "caption": t["description"]} for t in ITEMS
        ]
    }
    assert client.post("/render/video", json=body).status_code in (401, 403)
    assert client.post("/render/video", headers=provider_headers, json=body).status_code == 403
    resp = client.post("/render/video", headers=agent_headers, json=body)
    assert resp.status_code == 200 and resp.headers["content-type"] == "video/mp4"
    assert resp.content == b"MP4:2"
    empty = client.post("/render/video", headers=agent_headers, json={"scenes": []})
    assert empty.status_code == 422


def test_video_route_renders_catalog_image(app, client, agent_headers, monkeypatch):
    png = b"\x89PNG\r\n\x1a\nsynthetic-bytes"
    with app.state.sessionmaker() as db:

        def mk(title, status):
            e = CatalogEntry(
                type=CatalogType.event,
                title=title,
                description="",
                destination="Galway",
                status=status,
                brand_safe=True,
                allowed_tenant_ids=[],
                allowed_agent_ids=[],
                provider_id=1,
            )
            db.add(e)
            db.commit()
            return e.id

        ok_id = mk("Visible", EntryStatus.approved)
        hidden_id = mk("Hidden", EntryStatus.draft)
        db.add(Asset(entry_id=ok_id, object_key="entries/1/a.png", content_type="image/png"))
        db.add(Asset(entry_id=hidden_id, object_key="entries/2/b.png", content_type="image/png"))
        db.commit()
    app.state.storage.put_object("entries/1/a.png", png, "image/png")
    app.state.storage.put_object("entries/2/b.png", b"secret", "image/png")

    captured: dict = {}

    def fake_encode(scenes, images, tts=False):
        captured["scenes"] = scenes
        captured["images"] = [Path(i).read_bytes() if i else None for i in images]
        captured["tts"] = tts
        return _fake(scenes)

    monkeypatch.setattr(render_mod, "encode_video", fake_encode)
    body = {
        "scenes": [
            {"item_id": ok_id, "title": "Visible", "caption": "c"},
            {"item_id": hidden_id, "title": "Hidden", "caption": ""},
            {"item_id": None, "title": "Manual", "caption": ""},
        ],
        "narrate": True,
    }
    resp = client.post("/render/video", headers=agent_headers, json=body)
    assert resp.status_code == 200 and resp.content == b"MP4:3"
    assert captured["images"][0] == png
    assert captured["images"][1] is None and captured["images"][2] is None
    assert [s.title for s in captured["scenes"]] == ["Visible", "Hidden", "Manual"]
    assert captured["tts"] is True


# AC47 — the route carries per-scene duration + transition into the scene script.
def test_video_route_passes_duration_and_transition(client, agent_headers, monkeypatch):
    captured: dict = {}

    def fake_encode(scenes, images, tts=False):
        captured["scenes"] = scenes
        return _fake(scenes)

    monkeypatch.setattr(render_mod, "encode_video", fake_encode)
    body = {
        "scenes": [
            {
                "item_id": None,
                "title": "A",
                "caption": "a",
                "duration_ms": 2000,
                "transition": "zoom",
            },  # noqa: E501
            {"item_id": None, "title": "B", "caption": "b"},  # defaults: 4s, hard cut
        ]
    }
    resp = client.post("/render/video", headers=agent_headers, json=body)
    assert resp.status_code == 200
    assert [s.duration for s in captured["scenes"]] == [2.0, 4.0]
    assert [s.transition for s in captured["scenes"]] == ["zoom", "none"]


# AC47 — the route validates the new fields at the boundary.
def test_video_route_validates_duration_and_transition(client, agent_headers):
    base = {"item_id": None, "title": "A", "caption": ""}
    assert (
        client.post(
            "/render/video",
            headers=agent_headers,
            json={"scenes": [{**base, "transition": "warp"}]},
        ).status_code
        == 422
    )
    assert (
        client.post(
            "/render/video", headers=agent_headers, json={"scenes": [{**base, "duration_ms": -1}]}
        ).status_code
        == 422
    )
    assert (
        client.post(
            "/render/video",
            headers=agent_headers,
            json={"scenes": [{**base, "duration_ms": 60001}]},
        ).status_code
        == 422
    )


def _fake(scenes):
    import tempfile

    p = Path(tempfile.mkdtemp()) / "v.mp4"
    p.write_bytes(f"MP4:{len(scenes)}".encode())
    return str(p)


@pytest.mark.skipif(
    os.environ.get("RUN_REAL_FFMPEG") != "1" or shutil.which("ffmpeg") is None,
    reason="opt-in real encode (set RUN_REAL_FFMPEG=1)",
)
def test_real_encode(tmp_path):
    out = render_video(build_scene_script(ITEMS[:1]), None, out_dir=tmp_path, tts=False)
    assert Path(out).stat().st_size > 0


def test_filter_omits_drawtext_when_unsupported():
    scene = build_scene_script([{"title": "T", "description": "C"}])[0]
    with_text = _filter(scene, with_text=True, has_image=True)
    without = _filter(scene, with_text=False, has_image=True)
    assert "drawtext=" in with_text and "zoompan=" in with_text
    assert "drawtext=" not in without and "zoompan=" in without  # still a valid clip, no captions


def test_filter_skips_zoompan_for_colour_backgrounds():
    # An imageless scene with no text has an empty filter (no -vf) — a fast flat-colour clip.
    scene = build_scene_script([{"title": "T", "description": ""}])[0]
    assert _filter(scene, with_text=False, has_image=False) == ""
    # With text but no image: drawtext only, no (pointless) zoompan on a flat colour.
    text_only = _filter(scene, with_text=True, has_image=False)
    assert "drawtext=" in text_only and "zoompan=" not in text_only


def test_build_scene_cmd_respects_with_text():
    scene = build_scene_script([{"title": "T", "description": "C"}])[0]
    # Over an image: the -vf keeps the zoom but drops the caption overlay when with_text=False.
    vf = build_scene_cmd(scene, "/img/a.jpg", "/out.mp4", with_text=False)
    vf_text = vf[vf.index("-vf") + 1]
    assert "drawtext=" not in vf_text and "zoompan=" in vf_text
    # Imageless + no text: no -vf at all.
    bare = build_scene_cmd(scene, None, "/out.mp4", with_text=False)
    assert "-vf" not in bare


def test_supports_drawtext_probe(monkeypatch):
    class R:
        def __init__(self, out: bytes) -> None:
            self.stdout, self.stderr = out, b""

    # Output lists drawtext -> supported.
    monkeypatch.setattr(video_mod.subprocess, "run", lambda *a, **k: R(b"... drawtext ..."))
    assert _supports_drawtext("/ffmpeg-has-drawtext") is True
    # Output without drawtext -> unsupported (the real-world failing build).
    monkeypatch.setattr(video_mod.subprocess, "run", lambda *a, **k: R(b"scale pad zoompan"))
    assert _supports_drawtext("/ffmpeg-no-drawtext") is False

    # Probe error (binary missing) -> inconclusive, keep captions.
    def boom(*a, **k):
        raise FileNotFoundError

    monkeypatch.setattr(video_mod.subprocess, "run", boom)
    assert _supports_drawtext("/ffmpeg-missing") is True


def test_render_degrades_without_drawtext(tmp_path, monkeypatch):
    # When the ffmpeg build lacks drawtext, the render still runs — scene clips drop the overlay.
    monkeypatch.setattr(video_mod, "_supports_drawtext", lambda _ffmpeg: False)
    calls: list[list[str]] = []
    render_video(
        build_scene_script(ITEMS),
        None,
        out_dir=tmp_path,
        tts=False,
        runner=lambda c, **k: calls.append(list(c)),
        which={"ffmpeg": "/x/ffmpeg"}.get,
    )
    ffmpeg_calls = [c for c in calls if c[0] == "ffmpeg"]
    assert ffmpeg_calls, "expected ffmpeg scene clips to be built"
    # No drawtext anywhere (overlay dropped); captions still live in the sidecar SRT.
    assert not any("drawtext=" in part for c in calls for part in c)
    assert (tmp_path / "captions.srt").exists()


def _jpeg_data_url() -> str:
    import base64
    import io

    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGB", (8, 8), (30, 60, 120)).save(buf, "JPEG")
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


def test_build_frames_clip_cmd_structure():
    cmd = build_frames_clip_cmd("/frames/frame%05d.jpg", 20, "/out.mp4")
    assert "-framerate" in cmd and "20" in cmd
    assert "/frames/frame%05d.jpg" in cmd
    vf = cmd[cmd.index("-vf") + 1]
    assert "trunc(iw/2)*2" in vf  # even dims for yuv420p
    assert "libx264" in cmd and "-shortest" in cmd and cmd[-1] == "/out.mp4"


def test_render_video_frames_sequences_and_stitches(tmp_path):
    scenes = build_scene_script(ITEMS)  # two scenes
    dirs = []
    for i in range(2):
        d = tmp_path / f"s{i}"
        d.mkdir()
        dirs.append(str(d))
    calls: list[list[str]] = []
    out = render_video_frames(
        scenes,
        dirs,
        fps=20,
        tts=False,
        runner=lambda c, **k: calls.append(list(c)),
        which={"ffmpeg": "/x/ffmpeg"}.get,
    )
    clip_cmds = [c for c in calls if c[0] == "ffmpeg" and "-framerate" in c]
    assert len(clip_cmds) == 2  # one image-sequence clip per scene
    assert any("frame%05d.jpg" in " ".join(c) for c in clip_cmds)
    assert calls[-1][-1] == out  # final stitch writes the video


def test_video_frames_route(client, agent_headers, provider_headers, monkeypatch):
    def _fake_frames(scenes, dirs, fps=20, tts=False, cues=None):
        return _fake(scenes)

    monkeypatch.setattr(render_mod, "encode_frames", _fake_frames)
    body = {
        "fps": 20,
        "scenes": [
            {
                "title": "A",
                "caption": "a",
                "duration_ms": 2000,
                "transition": "fade",
                "frames": [_jpeg_data_url(), _jpeg_data_url()],
            }
        ],
    }
    assert client.post("/render/video-frames", json=body).status_code in (401, 403)
    assert (
        client.post("/render/video-frames", headers=provider_headers, json=body).status_code == 403
    )
    resp = client.post("/render/video-frames", headers=agent_headers, json=body)
    assert resp.status_code == 200 and resp.headers["content-type"] == "video/mp4"

    # A non-data: frame (never a network URL) is rejected rather than fetched.
    bad = {
        "fps": 20,
        "scenes": [{"duration_ms": 1000, "transition": "none", "frames": ["http://x/a.jpg"]}],
    }
    assert client.post("/render/video-frames", headers=agent_headers, json=bad).status_code == 503


def test_scene_script_uses_explicit_narration():
    scenes = build_scene_script(
        [
            {"title": "T", "description": "C", "narration": "A custom voiceover line."},
            {"title": "U", "description": ""},
        ]
    )
    assert scenes[0].narration == "A custom voiceover line."  # explicit script wins
    assert scenes[1].narration == "U"  # falls back to title when no script/caption


def test_render_frames_lays_cued_narration(tmp_path):
    # Each narration cue is spoken (TTS) and placed at its offset via adelay + amix.
    scenes = build_scene_script(
        [{"title": "A", "description": "a", "duration_ms": 4000, "transition": "none"}]
    )
    d = tmp_path / "s0"
    d.mkdir()
    calls: list[list[str]] = []
    render_video_frames(
        scenes,
        [str(d)],
        fps=20,
        tts=True,
        cues=[[{"at_ms": 0, "text": "Hello"}, {"at_ms": 2000, "text": "the harbour"}]],
        runner=lambda c, **k: calls.append(list(c)),
        which={"ffmpeg": "/x/ffmpeg", "say": "/x/say"}.get,
    )
    assert sum(1 for c in calls if c[0] == "say") == 2  # one TTS clip per cue
    mix = [c for c in calls if "-filter_complex" in c]
    assert any("adelay=" in " ".join(c) and "amix=" in " ".join(c) for c in mix)
