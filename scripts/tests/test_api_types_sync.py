"""Tests for the Pydantic<->TS drift guard (Finding F1). Synthetic, hermetic, deterministic."""
from __future__ import annotations

import json
from pathlib import Path

import check_api_types_sync as chk
import dump_openapi


def _snapshot(shared: Path, text: str) -> None:
    shared.mkdir(parents=True, exist_ok=True)
    (shared / "openapi.json").write_text(text, encoding="utf-8")


def test_dump_is_deterministic_and_sorted(tmp_path):
    a, b = tmp_path / "a.json", tmp_path / "b.json"
    assert dump_openapi.main([str(a)]) == 0
    assert dump_openapi.main([str(b)]) == 0
    assert a.read_bytes() == b.read_bytes()
    doc = json.loads(a.read_text())
    assert "paths" in doc and "/health" in doc["paths"]
    assert a.read_text() == dump_openapi.render(doc)  # canonical, sorted-key form


def test_detects_pydantic_drift(tmp_path):
    real = tmp_path / "real"
    _snapshot(real, dump_openapi.render(dump_openapi.build_schema()))
    assert chk.main(["--shared-dir", str(real), "--openapi-only"]) == 0

    doc = dump_openapi.build_schema()
    schemas = doc["components"]["schemas"]
    name, schema = next((n, s) for n, s in sorted(schemas.items()) if s.get("properties"))
    del schema["properties"][sorted(schema["properties"])[0]]  # remove one field
    doctored = tmp_path / "doctored"
    _snapshot(doctored, dump_openapi.render(doc))
    assert chk.main(["--shared-dir", str(doctored), "--openapi-only"]) != 0


def test_missing_committed_snapshot_fails(tmp_path):
    assert chk.main(["--shared-dir", str(tmp_path / "nope"), "--openapi-only"]) != 0


def test_compare_identical_and_different(tmp_path):
    f1, f2 = tmp_path / "x.ts", tmp_path / "y.ts"
    f1.write_text("a\n")
    f2.write_text("a\n")
    assert chk.compare(f1, f2) == ""
    f2.write_text("b\n")
    assert "-a" in chk.compare(f1, f2)
