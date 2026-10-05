#!/usr/bin/env python3
"""Sync guard — keeps /REQUIREMENTS.md and requirements.manifest.yaml from drifting.

The governed spec (/REQUIREMENTS.md) *defines* the acceptance items as ``**AC1**`` .. ``**AC18**``.
The proof manifest (requirements.manifest.yaml) *maps* each AC to the tests that prove it. If those
two lists ever disagree, the acceptance matrix would verify the wrong contract. This guard asserts
the manifest covers EXACTLY the AC set defined by the spec: no orphan manifest rows, no uncovered
spec items. It fails CI on any mismatch.

Usage::

    python scripts/check_requirements_sync.py \
        --spec REQUIREMENTS.md --manifest requirements.manifest.yaml

Exit 0 when in sync; exit 1 (with a diff) otherwise.

Governance decision: docs/brainstorms/2026-10-01-governing-requirements-file.md (Approach D).
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

try:
    import yaml
except ModuleNotFoundError as exc:  # pragma: no cover - environment guard
    raise SystemExit("check_requirements_sync.py requires PyYAML (pip install pyyaml)") from exc


# An acceptance item is DEFINED in the spec as a bold token: **AC1**, **AC18**, ...
# (plain-prose references like "(AC6)" are intentionally not treated as definitions).
_AC_DEF = re.compile(r"\*\*AC(\d+)\*\*")


def parse_spec_ids(spec_text: str) -> set[str]:
    """Return the set of AC ids DEFINED (bold) in the spec text."""
    return {f"AC{m.group(1)}" for m in _AC_DEF.finditer(spec_text)}


def parse_manifest_ids(manifest_obj: dict) -> set[str]:
    """Return the set of AC ids present as keys under the manifest's ``acceptance`` map."""
    acceptance = (manifest_obj or {}).get("acceptance") or {}
    return {str(k) for k in acceptance.keys()}


def diff(spec_ids: set[str], manifest_ids: set[str]) -> tuple[set[str], set[str]]:
    """Return (missing_from_manifest, extra_in_manifest)."""
    missing = spec_ids - manifest_ids
    extra = manifest_ids - spec_ids
    return missing, extra


def _sorted(ids: set[str]) -> list[str]:
    return sorted(ids, key=lambda s: (int("".join(c for c in s if c.isdigit()) or 0), s))


def check(spec_text: str, manifest_obj: dict) -> tuple[set[str], set[str]]:
    return diff(parse_spec_ids(spec_text), parse_manifest_ids(manifest_obj))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Assert spec AC set == manifest AC set.")
    parser.add_argument("--spec", default="REQUIREMENTS.md")
    parser.add_argument("--manifest", default="requirements.manifest.yaml")
    args = parser.parse_args(argv)

    spec_text = Path(args.spec).read_text(encoding="utf-8")
    manifest_obj = yaml.safe_load(Path(args.manifest).read_text(encoding="utf-8")) or {}

    spec_ids = parse_spec_ids(spec_text)
    manifest_ids = parse_manifest_ids(manifest_obj)
    missing, extra = diff(spec_ids, manifest_ids)

    if not spec_ids:
        print(f"[sync] FAIL — no AC ids found in {args.spec}", file=sys.stderr)
        return 1

    if missing or extra:
        print("[sync] FAIL — spec and manifest disagree:", file=sys.stderr)
        if missing:
            print(f"  defined in spec but missing from manifest: {_sorted(missing)}", file=sys.stderr)
        if extra:
            print(f"  present in manifest but not defined in spec: {_sorted(extra)}", file=sys.stderr)
        return 1

    print(f"[sync] PASS — {len(spec_ids)} acceptance items in sync ({_sorted(spec_ids)}).")
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
