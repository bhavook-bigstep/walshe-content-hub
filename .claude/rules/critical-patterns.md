# Critical Patterns

Patterns that have caused (or nearly caused) an incident in this project. Starts empty and
grows. Add an entry when: a real incident's root cause is a code/process pattern, a near-miss
is caught in review, a debug session runs longer than ~2 hours, or the same mistake is made
by 2+ people.

**Format:** Name — the failure mode — the specific prevention.

## Patterns

**Concurrent tool calls clobbering shared agent state** — LangGraph's `create_react_agent` /
`ToolNode` runs a turn's multiple tool calls *concurrently* (sync tools in a thread pool). A tool
that does a non-atomic read-modify-write on shared state (e.g. `_BuilderSession.run_op`:
`res = apply(self.design, …); self.design = res["design"]`) loses updates — every parallel call
reads the same base and the last write wins. Symptom in the Studio Builder: 10 `write-copy` calls
produced 1 text node, the agent re-set the same background 4× and never converged, and `observe`
looked "broken" because it read a near-empty scene. **Prevention:** serialise every mutation of
shared agent/session state behind a lock (`threading.Lock` around the whole read-modify-write), keep
slow network calls *outside* the lock, and cover it with a ThreadPoolExecutor regression test that
fires N parallel ops and asserts all N persist (`tests/test_studio_graph.py`).
