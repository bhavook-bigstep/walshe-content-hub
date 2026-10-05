#!/usr/bin/env python3
"""Drift guard — fails when the committed OpenAPI snapshot / TS types differ from the Pydantic models.

Regenerates ``openapi.json`` (and, unless ``--openapi-only``, ``src/api-types.ts`` via
``gen-api-types.mjs``) into a temp dir and compares byte-for-byte with the committed
``packages/shared`` files. Any difference (or a missing committed file) exits 1.

Usage::

    python scripts/check_api_types_sync.py [--shared-dir packages/shared] [--openapi-only]
"""
from __future__ import annotations

import argparse
import difflib
import os
import subprocess
import sys
import tempfile
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPTS_DIR.parent


def compare(committed: Path, fresh: Path) -> str:
    """Return a unified diff ('' when byte-identical; a message when committed is missing)."""
    if not committed.is_file():
        return f"missing committed file: {committed}\n"
    a = committed.read_bytes()
    b = fresh.read_bytes()
    if a == b:
        return ""
    return "".join(
        difflib.unified_diff(
            a.decode("utf-8", "replace").splitlines(keepends=True),
            b.decode("utf-8", "replace").splitlines(keepends=True),
            fromfile=f"committed/{committed.name}",
            tofile=f"regenerated/{committed.name}",
        )
    ) or f"{committed.name} differs in bytes\n"


def regenerate(tmp: Path, openapi_only: bool) -> None:
    if openapi_only:
        subprocess.run(
            [sys.executable, str(SCRIPTS_DIR / "dump_openapi.py"), str(tmp / "openapi.json")],
            check=True,
        )
    else:
        env = {**os.environ, "PYTHON": sys.executable}
        subprocess.run(
            ["node", str(SCRIPTS_DIR / "gen-api-types.mjs"), "--out-dir", str(tmp)],
            check=True,
            env=env,
        )


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--shared-dir", type=Path, default=REPO_ROOT / "packages" / "shared")
    p.add_argument("--openapi-only", action="store_true", help="skip the TS types comparison")
    ns = p.parse_args(sys.argv[1:] if argv is None else argv)

    with tempfile.TemporaryDirectory() as t:
        tmp = Path(t)
        try:
            regenerate(tmp, ns.openapi_only)
        except (subprocess.CalledProcessError, OSError) as exc:
            print(f"api-types sync: regeneration failed: {exc}", file=sys.stderr)
            return 2
        pairs = [(ns.shared_dir / "openapi.json", tmp / "openapi.json")]
        if not ns.openapi_only:
            pairs.append((ns.shared_dir / "src" / "api-types.ts", tmp / "src" / "api-types.ts"))
        failed = False
        for committed, fresh in pairs:
            d = compare(committed, fresh)
            if d:
                failed = True
                sys.stderr.write(d)
    if failed:
        print("api-types sync: DRIFT detected - run `node scripts/gen-api-types.mjs` and commit.",
              file=sys.stderr)
        return 1
    print("api-types sync: OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
