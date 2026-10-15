"""Critic loop (AC103): bounded, P1-only fixes, round-2 re-verification, deterministic.

Hermetic: build/render/critique are injected fakes; synthetic fixtures only.
"""

from __future__ import annotations

from typing import Any

from app.ai.studio_agent import StudioAgentResult
from app.ai.studio_critic import CHECKLIST, run_critic_loop


def _f(id_: str, sev: str, scene: int = 0) -> dict[str, Any]:
    return {"id": id_, "severity": sev, "scene": scene, "region": [0, 0, 10, 10],
            "issue": f"issue {id_}", "fix": {"op": "move-node", "node": "n1", "x": 5}}


class Harness:
    def __init__(self, script: list[dict[str, Any]]) -> None:
        self.script = script
        self.builds: list[str] = []
        self.critique_calls: list[tuple] = []

    def build(self, *, design, prompt, **_: Any) -> StudioAgentResult:
        self.builds.append(prompt)
        return StudioAgentResult(design={**design, "v": len(self.builds)})

    def render(self, design, scene, times):
        return {"pngs": [b"png"], "broken_images": []}

    def critique(self, pngs, mode, extra, scene=None):
        i = len(self.critique_calls)
        self.critique_calls.append((pngs, mode, extra, scene))
        return self.script[min(i, len(self.script) - 1)]

    def run(self):
        return run_critic_loop(
            settings=None, design={"scenes": [{}]}, prompt="SECRET BRIEF", items=[], spec=[],
            apply_fn=None, observe_fn=None, generate_image_fn=None,
            render_fn=self.render, critique_fn=self.critique, build_fn=self.build,
        )


def test_no_p1_stops_after_one_round_without_fix():
    h = Harness([{"findings": [_f("a", "P2"), _f("b", "P3")]}])
    out = h.run()
    assert len(out.rounds) == 1 and out.fix_rounds == 0 and len(h.builds) == 1
    assert out.unresolved_p1 == []


def test_only_p1_drive_fixes_and_loop_bounded_to_two_rounds():
    always = {"findings": [_f("a", "P1"), _f("b", "P2"), _f("c", "P3")]}
    h = Harness([always])
    out = h.run()
    assert len(out.rounds) == 2 and out.fix_rounds == 1
    assert len(h.builds) == 2 and len(h.critique_calls) == 2
    assert "[a]" in h.builds[1] and "[b]" not in h.builds[1] and "[c]" not in h.builds[1]
    assert [f["id"] for f in out.unresolved_p1] == ["a"]


def test_round_two_verifies_each_prior_finding():
    r1 = {"findings": [_f("a", "P1"), _f("b", "P1")]}
    r2 = {"findings": [], "verifications": [
        {"id": "a", "status": "fixed"}, {"id": "b", "status": "partly"}]}
    out = Harness([r1, r2]).run()
    assert {v["id"]: v["status"] for v in out.rounds[1].verifications} == {
        "a": "fixed", "b": "partly"}
    assert out.unresolved_p1 == []


def test_missing_or_invalid_verification_defaults_to_not():
    r1 = {"findings": [_f("a", "P1"), _f("b", "P1")]}
    r2 = {"findings": [_f("a", "P1")], "verifications": [{"id": "a", "status": "bogus"}]}
    out = Harness([r1, r2]).run()
    assert {v["id"]: v["status"] for v in out.rounds[1].verifications} == {"a": "not", "b": "not"}


def test_critic_is_independent_of_build_history():
    h = Harness([{"findings": [_f("a", "P1")]}])
    h.run()
    pngs, mode, extra, scene = h.critique_calls[0]
    assert mode == "image" and pngs == [b"png"]
    assert extra[0] == {"kind": "checklist", "items": list(CHECKLIST)}
    assert scene == {}  # the scene JSON keys the stub; it carries no brief/build history
    assert "SECRET BRIEF" not in repr(h.critique_calls)
    assert any(e.get("kind") == "verify" for e in h.critique_calls[1][2])


def test_malformed_findings_dropped_and_fix_op_constrained():
    bad = {"findings": ["x", {"severity": "P9"}, {"id": "k", "severity": "p2",
           "fix": {"op": "delete-everything"}}]}
    out = Harness([bad]).run()
    (f,) = out.rounds[0].findings
    assert f["severity"] == "P2" and f["fix"]["op"] is None


def test_deterministic_same_inputs_same_decisions():
    script = [{"findings": [_f("b", "P1"), _f("a", "P1")]},
              {"findings": [], "verifications": [{"id": "a", "status": "fixed"}]}]
    a, b = Harness(script).run(), Harness(script).run()
    assert a.rounds == b.rounds and a.fix_rounds == b.fix_rounds
