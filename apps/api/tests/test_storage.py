"""FileSystemStorage (AC4): persistent on-disk object store for local dev."""

from __future__ import annotations

import pytest

from app.storage.minio_client import FileSystemStorage


def test_put_get_roundtrip(tmp_path):
    store = FileSystemStorage(str(tmp_path))
    store.put_object("catalog/seed/1/cover.png", b"\x89PNG\x00data", "image/png")
    data, ct = store.get_object("catalog/seed/1/cover.png")
    assert data == b"\x89PNG\x00data"
    assert ct == "image/png"


def test_persists_across_instances(tmp_path):
    # A second instance pointed at the same root sees what the first wrote (seed ↔ API parity).
    FileSystemStorage(str(tmp_path)).put_object("k/x.bin", b"abc", "application/octet-stream")
    data, _ = FileSystemStorage(str(tmp_path)).get_object("k/x.bin")
    assert data == b"abc"


def test_missing_key_raises(tmp_path):
    with pytest.raises(KeyError):
        FileSystemStorage(str(tmp_path)).get_object("nope.png")


@pytest.mark.parametrize("bad", ["../escape", "/abs/key", "a/../../etc/passwd"])
def test_traversal_rejected(tmp_path, bad):
    with pytest.raises(KeyError):
        FileSystemStorage(str(tmp_path)).put_object(bad, b"x", "text/plain")
