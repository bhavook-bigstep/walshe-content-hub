"""AC102 — vision critique seam: deterministic stub, key hygiene, Gemini request/response."""

from __future__ import annotations

import base64
import json
import logging

import httpx
import pytest

from app.ai import vision
from app.config import Settings

SCENE = {"scenes": [{"id": "s1", "nodes": [{"type": "text", "text": "Galway"}]}]}
PNG = b"\x89PNG\r\n\x1a\nFAKE"


def _settings(**over) -> Settings:
    base = dict(
        database_url="sqlite+pysqlite:///:memory:",
        jwt_secret="test-secret-fixed",
        ai_vision_provider="gemini",
        ai_vision_model="test-vision-model",
        gemini_api_key=None,
    )
    base.update(over)
    return Settings(**base)


def test_config_defaults():
    s = Settings(database_url="sqlite+pysqlite:///:memory:", jwt_secret="x")
    assert s.ai_vision_provider == "gemini"
    assert s.ai_vision_model


def test_stub_deterministic_for_same_scene_regardless_of_key_order_or_pixels():
    s = _settings()
    a = vision.critique_scene(s, [PNG], mode="image", scene=SCENE)
    b = vision.critique_scene(
        s, [b"other pixels"], mode="image", scene=json.loads(json.dumps(SCENE))
    )
    assert a == b
    assert a["provider"] == "stub"


def test_stub_differs_across_scenes():
    s = _settings()
    hashes = {
        vision.critique_scene(s, [], mode="image", scene={"n": i})["scene_hash"] for i in range(5)
    }
    assert len(hashes) == 5


def test_stub_issues_only_from_checklist():
    s = _settings()
    for i in range(30):
        out = vision.critique_scene(s, [], mode="image", scene={"n": i})
        assert {x["category"] for x in out["issues"]} <= set(vision.IMAGE_CHECKLIST)
        assert out["ok"] == (not out["issues"])


def test_video_mode_uses_motion_checklist_and_custom_checklist_overrides():
    s = _settings()
    assert vision.checklist_for("video") == ("motion-continuity",)
    out = vision.critique_scene(s, [], checklist=["foo"], scene=SCENE)
    assert all(x["category"] == "foo" for x in out["issues"])
    with pytest.raises(ValueError):
        vision.checklist_for("audio")


def test_gemini_builds_expected_request_and_parses(monkeypatch):
    reply = {
        "ok": False,
        "summary": "low contrast",
        "issues": [{"category": "contrast", "severity": "fail", "note": "grey on white"},
                   {"category": "layout", "severity": "bogus", "note": "n"}],
    }
    text = "```json\n" + json.dumps(reply) + "\n```"
    payload = {"candidates": [{"content": {"parts": [{"text": text}]}}]}
    captured: dict = {}

    def fake_post(url, **kwargs):
        captured["url"] = url
        captured.update(kwargs)
        return httpx.Response(200, json=payload, request=httpx.Request("POST", url))

    monkeypatch.setattr(vision.httpx, "post", fake_post)
    out = vision.critique_scene(
        _settings(gemini_api_key="test-key-xxxx"), [PNG], mode="image", scene=SCENE
    )

    assert captured["url"].endswith("/models/test-vision-model:generateContent")
    assert captured["params"] == {"key": "test-key-xxxx"}
    parts = captured["json"]["contents"][0]["parts"]
    assert "contrast" in parts[0]["text"]
    assert parts[1]["inlineData"] == {
        "mimeType": "image/png",
        "data": base64.b64encode(PNG).decode(),
    }
    assert out["provider"] == "gemini" and out["model"] == "test-vision-model"
    assert out["ok"] is False
    assert out["issues"][0]["severity"] == "fail"
    assert out["issues"][1]["severity"] == "warn"  # unknown severity normalised


def test_provider_failure_degrades_to_stub(monkeypatch):
    def boom(url, **kwargs):
        raise httpx.ConnectError("down")

    monkeypatch.setattr(vision.httpx, "post", boom)
    out = vision.critique_scene(_settings(gemini_api_key="test-key-xxxx"), [PNG], scene=SCENE)
    assert out["provider"] == "stub"


def test_key_never_in_logs_or_output(monkeypatch, caplog):
    key = "test-key-SECRET123"
    ok = {"candidates": [{"content": {"parts": [{"text": '{"ok": true, "issues": []}'}]}}]}
    calls = {"n": 0}

    def fake_post(url, **kwargs):
        calls["n"] += 1
        if calls["n"] == 1:
            return httpx.Response(200, json=ok, request=httpx.Request("POST", url))
        raise httpx.ConnectError("down")

    monkeypatch.setattr(vision.httpx, "post", fake_post)
    s = _settings(gemini_api_key=key)
    with caplog.at_level(logging.DEBUG, logger="app.ai"):
        out1 = vision.critique_scene(s, [PNG], scene=SCENE)  # real path
        out2 = vision.critique_scene(s, [PNG], scene=SCENE)  # failure path
    assert key not in caplog.text
    assert key not in json.dumps(out1) and key not in json.dumps(out2)
