"""Tests for the spec<->manifest sync guard (part of AC18's proof set).

Synthetic spec text + manifest dicts only — hermetic and deterministic.
"""
from __future__ import annotations

import textwrap
from pathlib import Path

import check_requirements_sync as sync


SPEC_FIXTURE = textwrap.dedent(
    """
    # Spec
    - **AC1** `[explicit]` — first.
    - **AC2** `[inferred]` — second (also mentions AC1 in prose, which is not a definition).
    - **AC3** `[explicit]` — third.
    """
).strip()


def _manifest(*ids: str) -> dict:
    return {"acceptance": {ac: {"tier": "P1"} for ac in ids}}


def test_parse_spec_ids_counts_only_bold_definitions():
    ids = sync.parse_spec_ids(SPEC_FIXTURE)
    assert ids == {"AC1", "AC2", "AC3"}  # the prose "AC1" reference is not double-counted


def test_parse_manifest_ids_reads_acceptance_keys():
    assert sync.parse_manifest_ids(_manifest("AC1", "AC2")) == {"AC1", "AC2"}


def test_sync_detects_missing_and_extra():
    """Headline proof wired into requirements.manifest.yaml (AC18)."""
    # manifest is missing AC3 (uncovered spec item) and has an orphan AC9.
    missing, extra = sync.check(SPEC_FIXTURE, _manifest("AC1", "AC2", "AC9"))
    assert missing == {"AC3"}
    assert extra == {"AC9"}


def test_sync_passes_when_identical():
    missing, extra = sync.check(SPEC_FIXTURE, _manifest("AC1", "AC2", "AC3"))
    assert missing == set()
    assert extra == set()


def test_main_exits_nonzero_on_drift(tmp_path, capsys):
    spec = tmp_path / "SPEC.md"
    spec.write_text(SPEC_FIXTURE, encoding="utf-8")
    manifest = tmp_path / "m.yaml"
    manifest.write_text('acceptance:\n  AC1: {tier: P1}\n', encoding="utf-8")  # missing AC2, AC3
    rc = sync.main(["--spec", str(spec), "--manifest", str(manifest)])
    assert rc == 1
    assert "FAIL" in capsys.readouterr().err


def test_main_exits_zero_when_in_sync(tmp_path):
    spec = tmp_path / "SPEC.md"
    spec.write_text(SPEC_FIXTURE, encoding="utf-8")
    manifest = tmp_path / "m.yaml"
    manifest.write_text(
        'acceptance:\n  AC1: {tier: P1}\n  AC2: {tier: P1}\n  AC3: {tier: P1}\n',
        encoding="utf-8",
    )
    rc = sync.main(["--spec", str(spec), "--manifest", str(manifest)])
    assert rc == 0


def test_real_spec_and_manifest_are_in_sync():
    """Guard the ACTUAL repo files: /REQUIREMENTS.md must match requirements.manifest.yaml."""
    root = Path(__file__).resolve().parents[2]
    import yaml

    spec_text = (root / "REQUIREMENTS.md").read_text(encoding="utf-8")
    manifest_obj = yaml.safe_load((root / "requirements.manifest.yaml").read_text(encoding="utf-8"))
    missing, extra = sync.check(spec_text, manifest_obj)
    assert missing == set(), f"spec items with no manifest row: {missing}"
    assert extra == set(), f"manifest rows with no spec item: {extra}"
