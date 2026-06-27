---
summary: "Test failure triage workflow for WindieOS backend, local-runtime Python, frontend, docs, packaging, and cross-runtime contract failures."
read_when:
  - When a focused or broad WindieOS validation command fails.
  - When deciding whether a failure is caused by the current change, local environment, stale docs, missing dependency, or cross-runtime contract drift.
title: "Test Failure Triage"
---

# Test Failure Triage

Do not immediately change production code after a test fails. First identify whether the failure is from the changed behavior, a stale test expectation, environment setup, or a different dirty workspace change.

## First Split

| Failure | First check |
| --- | --- |
| import/module error | correct env launcher and dependency install |
| route/schema assertion | route model, payload contract, docs/reference examples |
| websocket event mismatch | backend formatter and renderer consumer contracts |
| local-runtime JSON parse failure | stdout contamination or malformed JSON-RPC response |
| frontend hook/component failure | changed state contract or stale mocked event payload |
| docs listing failure | missing front matter or bad `read_when` structure |
| package build failure | bundled runtime path, target OS, package script, signing/env |

## Environment Check

Use the repo launchers:

```bash
private backend test runner
./scripts/python-in-env local-runtime python --version
cd frontend && node --version
```

Do not assume plain `python` has backend or local-runtime test dependencies.

## Narrow Then Widen

1. Rerun the focused failing test.
2. Read the failure and the owner code.
3. Inspect nearby tests for expected contract style.
4. Fix the owner or update the test if behavior intentionally changed.
5. Rerun the focused test.
6. Widen to the subsystem gate only after the focused test passes.

## Contract Drift Signals

| Signal | Likely drift |
| --- | --- |
| backend test passes, frontend event test fails | emitted payload shape changed without consumer update |
| local-runtime Python test passes, backend schema test fails | local-runtime executable args/result changed without model-facing/parity update |
| renderer test passes, replay/rehydrate fails | transcript/session identifier drift |
| source test passes, package smoke fails | packaged runtime or installed path assumption |
| docs link check fails | hub/reference path not updated after add/move/rename |

## Report Shape

When a command fails and cannot be fixed in the current slice, report:

- command run
- exact failure summary
- suspected owner
- whether it is related to this change
- next focused command or file to inspect

## Related Docs

- [Validation Matrix](validation_matrix.md)
- Doctor Checklist (private backend docs)
- Process Health Checklist (private backend docs)
