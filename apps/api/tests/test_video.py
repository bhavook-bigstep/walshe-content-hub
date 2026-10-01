"""AC13 — rudimentary video MP4. ffmpeg/TTS mocked; real encode is opt-in (RUN_REAL_FFMPEG=1)."""
from __future__ import annotations

import os
import shutil
from pathlib import Path

import pytest

import app.routers.render as render_mod
from app.media.video import build_scene_script, escape_drawtext, render_video

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
    render_video(scenes, None, out_dir=tmp_path, runner=lambda c, **k: calls.append(c),
                 which={"ffmpeg": "f"}.get)
    assert all(c[0] == "ffmpeg" for c in calls)
    with pytest.raises(RuntimeError):
        render_video(scenes, None, out_dir=tmp_path, runner=lambda *a, **k: None,
                     which=lambda _: None)


def test_escape_drawtext():
    out = escape_drawtext("a:b'c%d,e")
    assert "\\:" in out and "\\%" in out and "\\," in out and "'" not in out


def test_video_route_agent_only(client, agent_headers, provider_headers, monkeypatch):
    monkeypatch.setattr(render_mod, "encode_video", lambda scenes, imgs, tts=False: _fake(scenes))
    body = {"items": ITEMS}
    assert client.post("/render/video", json=body).status_code in (401, 403)
    assert client.post("/render/video", headers=provider_headers, json=body).status_code == 403
    resp = client.post("/render/video", headers=agent_headers, json=body)
    assert resp.status_code == 200 and resp.headers["content-type"] == "video/mp4"
    assert resp.content == b"MP4:2"


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
