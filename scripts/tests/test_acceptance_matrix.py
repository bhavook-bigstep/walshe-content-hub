"""Tests for the acceptance-matrix generator (part of AC18's proof set).

Synthetic manifest + synthetic result dicts only — hermetic and deterministic.
"""
from __future__ import annotations

import textwrap

import acceptance_matrix as am


# --------------------------------------------------------------------------- fixtures


def _write_manifest(tmp_path) -> str:
    content = textwrap.dedent(
        """
        version: 1
        spec: REQUIREMENTS.md
        acceptance:
          AC1:
            tier: P1
            api:
              - "apps/api/tests/test_a.py::test_one"
              - "apps/api/tests/test_a.py::test_two"
          AC2:
            tier: P2
            web:
              - "apps/web/tests/b.test.ts::test_three"
              - "apps/web/tests/b.test.ts::test_four"
          AC3:
            tier: P3
            e2e:
              - "apps/web/e2e/c.spec.ts::smoke"
        """
    ).strip()
    p = tmp_path / "requirements.manifest.yaml"
    p.write_text(content, encoding="utf-8")
    return str(p)


# --------------------------------------------------------------------------- load / order


def test_load_manifest_is_ac_ordered_and_flattens_suites(tmp_path):
    entries = am.load_manifest(_write_manifest(tmp_path))
    assert [e.ac_id for e in entries] == ["AC1", "AC2", "AC3"]
    assert entries[0].proofs == (
        "apps/api/tests/test_a.py::test_one",
        "apps/api/tests/test_a.py::test_two",
    )
    assert entries[2].tier == "P3"


def test_load_manifest_orders_numerically_not_lexically(tmp_path):
    content = "acceptance:\n  AC10: {tier: P1}\n  AC2: {tier: P1}\n  AC1: {tier: P1}\n"
    p = tmp_path / "m.yaml"
    p.write_text(content, encoding="utf-8")
    entries = am.load_manifest(str(p))
    assert [e.ac_id for e in entries] == ["AC1", "AC2", "AC10"]


# --------------------------------------------------------------------------- classification


def test_evaluate_classifies_met_partial_missing(tmp_path):
    """Headline proof wired into requirements.manifest.yaml (AC18)."""
    manifest = am.load_manifest(_write_manifest(tmp_path))
    results = {
        # AC1: both proofs pass -> met
        "apps/api/tests/test_a.py::test_one": True,
        "apps/api/tests/test_a.py::test_two": True,
        # AC2: one pass, one fail -> partial
        "apps/web/tests/b.test.ts::test_three": True,
        "apps/web/tests/b.test.ts::test_four": False,
        # AC3: proof absent from results -> missing
    }
    rows = {r.ac_id: r for r in am.evaluate(manifest, results)}
    assert rows["AC1"].status == "met" and rows["AC1"].passed == 2 and rows["AC1"].total == 2
    assert rows["AC2"].status == "partial" and rows["AC2"].passed == 1
    assert rows["AC3"].status == "missing" and rows["AC3"].passed == 0
    assert rows["AC2"].unproven == ("apps/web/tests/b.test.ts::test_four",)
    assert rows["AC3"].unproven == ("apps/web/e2e/c.spec.ts::smoke",)


def test_evaluate_failed_proof_is_not_met(tmp_path):
    manifest = am.load_manifest(_write_manifest(tmp_path))
    results = {
        "apps/api/tests/test_a.py::test_one": True,
        "apps/api/tests/test_a.py::test_two": False,
    }
    rows = {r.ac_id: r for r in am.evaluate(manifest, results)}
    assert rows["AC1"].status == "partial"


# --------------------------------------------------------------------------- report parsers


def test_parse_pytest_report_maps_outcome_to_bool():
    obj = {
        "tests": [
            {"nodeid": "apps/api/tests/test_a.py::test_one", "outcome": "passed"},
            {"nodeid": "apps/api/tests/test_a.py::test_two", "outcome": "failed"},
        ]
    }
    res = am.parse_pytest_report(obj)
    assert res["apps/api/tests/test_a.py::test_one"] is True
    assert res["apps/api/tests/test_a.py::test_two"] is False


def test_parse_vitest_report_relativizes_abs_path():
    obj = {
        "testResults": [
            {
                "name": "/home/runner/project/apps/web/tests/b.test.ts",
                "assertionResults": [
                    {"title": "test_three", "status": "passed"},
                    {"title": "test_four", "status": "failed"},
                ],
            }
        ]
    }
    res = am.parse_vitest_report(obj)
    assert res["apps/web/tests/b.test.ts::test_three"] is True
    assert res["apps/web/tests/b.test.ts::test_four"] is False


def test_parse_playwright_report_walks_nested_suites():
    obj = {
        "suites": [
            {
                "suites": [
                    {
                        "specs": [
                            {
                                "file": "apps/web/e2e/c.spec.ts",
                                "title": "smoke",
                                "ok": True,
                            }
                        ]
                    }
                ]
            }
        ]
    }
    res = am.parse_playwright_report(obj)
    assert res["apps/web/e2e/c.spec.ts::smoke"] is True


def test_parse_playwright_report_rejoins_rootdir_relative_file():
    # Real Playwright reports emit spec.file relative to config.rootDir (apps/web/e2e), which
    # drops the repo anchor the manifest uses. The parser must rejoin rootDir so the node-id
    # matches "apps/web/e2e/<file>::<title>".
    obj = {
        "config": {"rootDir": "/abs/checkout/apps/web/e2e"},
        "suites": [
            {"specs": [{"file": "studio-smoke.spec.ts", "title": "studio smoke", "ok": True}]}
        ],
    }
    res = am.parse_playwright_report(obj)
    assert res["apps/web/e2e/studio-smoke.spec.ts::studio smoke"] is True


def test_collect_results_merges_three_reports():
    merged = am.collect_results(
        api_json={"tests": [{"nodeid": "a::x", "outcome": "passed"}]},
        web_json={"testResults": [{"name": "apps/web/tests/b.test.ts", "assertionResults": [{"title": "y", "status": "failed"}]}]},
        e2e_json=None,
    )
    assert merged["a::x"] is True
    assert merged["apps/web/tests/b.test.ts::y"] is False


def test_parsers_tolerate_missing_reports():
    assert am.collect_results(None, None, None) == {}


# --------------------------------------------------------------------------- render + CLI


def test_render_markdown_is_deterministic_and_has_totals(tmp_path):
    manifest = am.load_manifest(_write_manifest(tmp_path))
    rows = am.evaluate(manifest, {})
    out = am.render_markdown(rows)
    assert "| AC1 | P1 | missing | 0/2 |" in out
    assert "3 missing" in out
    # deterministic: same input -> identical output
    assert out == am.render_markdown(am.evaluate(manifest, {}))


def test_main_check_exits_nonzero_when_not_all_met(tmp_path, capsys):
    manifest_path = _write_manifest(tmp_path)
    rc = am.main(["--manifest", manifest_path, "--check"])
    assert rc == 1
    assert "unproven acceptance items" in capsys.readouterr().err


def test_main_check_passes_when_all_met(tmp_path):
    # Minimal manifest with a single proof, and a report proving it.
    import json

    (tmp_path / "m.yaml").write_text(
        'acceptance:\n  AC1:\n    tier: P1\n    api: ["apps/api/tests/t.py::ok"]\n',
        encoding="utf-8",
    )
    (tmp_path / "api.json").write_text(
        json.dumps({"tests": [{"nodeid": "apps/api/tests/t.py::ok", "outcome": "passed"}]}),
        encoding="utf-8",
    )
    rc = am.main(
        ["--manifest", str(tmp_path / "m.yaml"), "--api-report", str(tmp_path / "api.json"), "--check"]
    )
    assert rc == 0


def test_write_ledger_block_is_idempotent(tmp_path):
    ledger = tmp_path / "ledger.md"
    ledger.write_text("# Ledger\n\nbody\n", encoding="utf-8")
    manifest = am.load_manifest(_write_manifest(tmp_path))
    rendered = am.render_markdown(am.evaluate(manifest, {}))
    assert am.write_ledger_block(str(ledger), rendered) is True
    # second write with identical content -> no change
    assert am.write_ledger_block(str(ledger), rendered) is False
    text = ledger.read_text(encoding="utf-8")
    assert text.count(am.GENERATED_BEGIN) == 1
    assert text.count(am.GENERATED_END) == 1
    assert "body" in text  # original content preserved
