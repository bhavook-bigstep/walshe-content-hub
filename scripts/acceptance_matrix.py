#!/usr/bin/env python3
"""Acceptance matrix generator — makes /REQUIREMENTS.md *govern* the build.

Reads the proof manifest (``requirements.manifest.yaml``, which maps each ``AC#`` to the test
node-ids that prove it) and the three machine test reports (pytest / vitest / Playwright), then
classifies every acceptance item as **met / partial / missing**:

    met     every declared proof for the AC is present in a report AND passed
    partial some (but not all) declared proofs passed
    missing no declared proof passed (all absent or failed), or none declared

Usage::

    python scripts/acceptance_matrix.py \
        --manifest requirements.manifest.yaml \
        --api-report apps/api/.report.json \
        --web-report apps/web/.vitest.json \
        --e2e-report apps/web/.e2e.json \
        [--check] [--write-ledger docs/plans/2026-10-01-run-ledger.md]

``--check`` exits non-zero if any AC is not ``met`` (an unproven spec sentence reds the build).
``--write-ledger`` rewrites the generated matrix block (between the GENERATED markers) in the
run ledger — the matrix is generated, never hand-edited, so the spec and its status cannot drift.

This module has no third-party dependency beyond PyYAML; report parsing is tolerant of missing
files (an absent report just means those proofs are "missing", which is a real, honest state).

Governance decision: docs/brainstorms/2026-10-01-governing-requirements-file.md (Approach D).
"""
from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable

try:  # PyYAML is the one dependency; fail loudly with a clear message if missing.
    import yaml
except ModuleNotFoundError as exc:  # pragma: no cover - environment guard
    raise SystemExit("acceptance_matrix.py requires PyYAML (pip install pyyaml)") from exc


GENERATED_BEGIN = "<!-- BEGIN GENERATED ACCEPTANCE MATRIX (scripts/acceptance_matrix.py --write-ledger) -->"
GENERATED_END = "<!-- END GENERATED ACCEPTANCE MATRIX -->"

_STATUS_LABEL = {"met": "met", "partial": "partial", "missing": "missing"}


@dataclass(frozen=True)
class ACEntry:
    """One acceptance item and the node-ids declared to prove it."""

    ac_id: str
    tier: str
    proofs: tuple[str, ...]

    @property
    def sort_key(self) -> tuple[int, str]:
        digits = "".join(c for c in self.ac_id if c.isdigit())
        return (int(digits) if digits else 1 << 30, self.ac_id)


@dataclass(frozen=True)
class ACStatus:
    ac_id: str
    tier: str
    status: str  # met | partial | missing
    passed: int
    total: int
    unproven: tuple[str, ...] = field(default=())


# --------------------------------------------------------------------------- manifest


def load_manifest(path: str | Path) -> list[ACEntry]:
    """Parse the proof manifest into an ordered list of ACEntry (AC1..AC18)."""
    data = yaml.safe_load(Path(path).read_text(encoding="utf-8")) or {}
    acceptance = data.get("acceptance") or {}
    entries: list[ACEntry] = []
    for ac_id, spec in acceptance.items():
        spec = spec or {}
        proofs: list[str] = []
        for suite in ("api", "web", "e2e"):
            proofs.extend(spec.get(suite) or [])
        entries.append(
            ACEntry(ac_id=str(ac_id), tier=str(spec.get("tier", "")), proofs=tuple(proofs))
        )
    entries.sort(key=lambda e: e.sort_key)
    return entries


# --------------------------------------------------------------------------- report parsing


def _load_json(path: str | Path | None) -> dict | None:
    if not path:
        return None
    p = Path(path)
    if not p.exists():
        return None
    return json.loads(p.read_text(encoding="utf-8"))


def _rel_node(file_path: str, title: str, anchor: str) -> str:
    """Build ``<repo-relative file>::<title>`` from a possibly-absolute test file path."""
    norm = file_path.replace("\\", "/")
    idx = norm.find(anchor)
    rel = norm[idx:] if idx != -1 else norm
    return f"{rel}::{title}"


def parse_pytest_report(obj: dict | None) -> dict[str, bool]:
    """pytest-json-report: {'tests': [{'nodeid': ..., 'outcome': 'passed'|...}]}"""
    results: dict[str, bool] = {}
    if not obj:
        return results
    for test in obj.get("tests", []):
        node = test.get("nodeid")
        if node:
            results[node] = test.get("outcome") == "passed"
    return results


def parse_vitest_report(obj: dict | None) -> dict[str, bool]:
    """vitest --reporter=json: {'testResults': [{'name': file, 'assertionResults':[...]}]}"""
    results: dict[str, bool] = {}
    if not obj:
        return results
    for suite in obj.get("testResults", []):
        file_path = suite.get("name", "")
        for a in suite.get("assertionResults", []):
            title = a.get("title") or a.get("fullName") or ""
            node = _rel_node(file_path, title, "apps/web/")
            results[node] = a.get("status") == "passed"
    return results


def parse_playwright_report(obj: dict | None) -> dict[str, bool]:
    """Playwright --reporter=json: nested suites -> specs -> tests -> results[].status."""
    results: dict[str, bool] = {}
    if not obj:
        return results

    def walk(suite: dict) -> None:
        for spec in suite.get("specs", []):
            file_path = spec.get("file", suite.get("file", ""))
            title = spec.get("title", "")
            ok = bool(spec.get("ok", False))
            # Fall back to the per-result status if 'ok' is absent.
            if "ok" not in spec:
                statuses = [
                    r.get("status")
                    for t in spec.get("tests", [])
                    for r in t.get("results", [])
                ]
                ok = bool(statuses) and all(s == "passed" for s in statuses)
            results[_rel_node(file_path, title, "apps/web/")] = ok
        for child in suite.get("suites", []):
            walk(child)

    for suite in obj.get("suites", []):
        walk(suite)
    return results


def collect_results(
    api_json: dict | None = None,
    web_json: dict | None = None,
    e2e_json: dict | None = None,
) -> dict[str, bool]:
    """Merge the three parsed reports into one ``node_id -> passed`` map."""
    merged: dict[str, bool] = {}
    merged.update(parse_pytest_report(api_json))
    merged.update(parse_vitest_report(web_json))
    merged.update(parse_playwright_report(e2e_json))
    return merged


# --------------------------------------------------------------------------- evaluation


def evaluate(manifest: Iterable[ACEntry], results: dict[str, bool]) -> list[ACStatus]:
    """Classify each AC as met / partial / missing against the collected results."""
    rows: list[ACStatus] = []
    for entry in manifest:
        total = len(entry.proofs)
        passed = sum(1 for node in entry.proofs if results.get(node) is True)
        unproven = tuple(node for node in entry.proofs if results.get(node) is not True)
        if total > 0 and passed == total:
            status = "met"
        elif passed > 0:
            status = "partial"
        else:
            status = "missing"
        rows.append(
            ACStatus(
                ac_id=entry.ac_id,
                tier=entry.tier,
                status=status,
                passed=passed,
                total=total,
                unproven=unproven,
            )
        )
    return rows


def render_markdown(rows: list[ACStatus]) -> str:
    """Render the status rows as a Markdown table (deterministic, AC-ordered)."""
    lines = [
        "| # | Tier | Status | Proofs passing |",
        "|---|------|--------|----------------|",
    ]
    for r in rows:
        lines.append(f"| {r.ac_id} | {r.tier} | {_STATUS_LABEL[r.status]} | {r.passed}/{r.total} |")
    counts = {"met": 0, "partial": 0, "missing": 0}
    for r in rows:
        counts[r.status] += 1
    lines.append("")
    lines.append(
        f"**Totals:** {counts['met']} met · {counts['partial']} partial · "
        f"{counts['missing']} missing · {len(rows)} total."
    )
    return "\n".join(lines)


def write_ledger_block(ledger_path: str | Path, rendered: str) -> bool:
    """Replace (or append) the GENERATED matrix block in the ledger. Returns True if changed."""
    path = Path(ledger_path)
    text = path.read_text(encoding="utf-8")
    block = f"{GENERATED_BEGIN}\n\n{rendered}\n\n{GENERATED_END}"
    if GENERATED_BEGIN in text and GENERATED_END in text:
        pre = text[: text.index(GENERATED_BEGIN)]
        post = text[text.index(GENERATED_END) + len(GENERATED_END) :]
        new_text = f"{pre}{block}{post}"
    else:
        sep = "" if text.endswith("\n") else "\n"
        new_text = f"{text}{sep}\n## Generated acceptance matrix\n\n{block}\n"
    if new_text != text:
        path.write_text(new_text, encoding="utf-8")
        return True
    return False


# --------------------------------------------------------------------------- CLI


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Generate the AC met/partial/missing matrix.")
    parser.add_argument("--manifest", default="requirements.manifest.yaml")
    parser.add_argument("--api-report", default=None, help="pytest-json-report path")
    parser.add_argument("--web-report", default=None, help="vitest json report path")
    parser.add_argument("--e2e-report", default=None, help="Playwright json report path")
    parser.add_argument("--check", action="store_true", help="exit 1 if any AC is not 'met'")
    parser.add_argument("--write-ledger", default=None, help="ledger path to refresh in place")
    args = parser.parse_args(argv)

    manifest = load_manifest(args.manifest)
    results = collect_results(
        _load_json(args.api_report),
        _load_json(args.web_report),
        _load_json(args.e2e_report),
    )
    rows = evaluate(manifest, results)
    rendered = render_markdown(rows)
    print(rendered)

    if args.write_ledger:
        changed = write_ledger_block(args.write_ledger, rendered)
        print(f"\n[ledger] {'updated' if changed else 'unchanged'}: {args.write_ledger}")

    if args.check:
        not_met = [r for r in rows if r.status != "met"]
        if not_met:
            ids = ", ".join(f"{r.ac_id}({r.status})" for r in not_met)
            print(f"\n[check] FAIL — unproven acceptance items: {ids}", file=sys.stderr)
            return 1
        print("\n[check] PASS — every acceptance item is met.")
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
