"""Agentic sprite generation: a concept → N generated frame images → a persisted owner sprite.

Image models can't emit a clean gridded sheet, so we generate N separate frames (one per motion
phase) and assemble them. These assert the N-frame path is hermetic under the image stub
(Contract 4) and that frames are normalised to one uniform box.
"""

from __future__ import annotations

import base64
import io

from PIL import Image

from app.ai.sprite_gen import frame_prompt, generate_sprite, remove_white_bg
from app.config import Settings
from app.storage.minio_client import InMemoryStorage


def _settings() -> Settings:
    # No image key → the deterministic stub renders each frame (a solid PNG), hermetic.
    return Settings(jwt_secret="x" * 48, database_url="sqlite://")


def test_remove_white_bg_keys_white_to_transparent_and_keeps_the_subject():
    # A white canvas with an opaque red square in the middle → white becomes transparent, red stays.
    img = Image.new("RGBA", (10, 10), (255, 255, 255, 255))
    for x in range(3, 7):
        for y in range(3, 7):
            img.putpixel((x, y), (220, 30, 30, 255))
    out = remove_white_bg(img)
    assert out.getpixel((0, 0))[3] == 0  # white corner → transparent
    assert out.getpixel((4, 4))[3] == 255  # the red subject is preserved


def test_frame_prompt_requests_a_removable_white_bg():
    assert "white background" in frame_prompt("a fox", 0, 4)


def test_frame_prompt_pins_the_subject_and_varies_the_pose():
    a = frame_prompt("a walking fox", 0, 4)
    b = frame_prompt("a walking fox", 3, 4)
    assert "a walking fox" in a and "a walking fox" in b
    assert "SAME character" in a  # consistency instruction
    assert a != b  # the phase differs per frame
    assert "0%" in a and "100%" in b


def test_generate_sprite_makes_n_uniform_frames(app):
    # `app` provides a live DB session factory + schema (conftest). Storage is in-memory here.
    storage = InMemoryStorage()
    with app.state.sessionmaker() as db:
        gen = generate_sprite(
            _settings(), db, storage, owner_id=1, concept="a bouncing ball", frames=5
        )
    assert gen.provider == "stub"
    assert len(gen.sprite.frame_keys) == 5  # one image per requested motion frame
    assert len(gen.frames_data_urls) == 5
    assert gen.sprite.frame_width == gen.sprite.frame_height == 256  # uniform, letterboxed box
    # Each frame is a real, decodable PNG of the uniform size.
    first = gen.frames_data_urls[0].split(",", 1)[1]
    img = Image.open(io.BytesIO(base64.b64decode(first)))
    assert img.size == (256, 256)


def test_generate_sprite_clamps_frame_count(app):
    storage = InMemoryStorage()
    with app.state.sessionmaker() as db:
        gen = generate_sprite(_settings(), db, storage, owner_id=1, concept="x", frames=99)
    assert len(gen.sprite.frame_keys) == 8  # MAX_FRAMES
