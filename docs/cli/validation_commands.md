---
summary: "Validation command guide for choosing WindieOS docs, backend, sidecar, frontend, lint, typecheck, packaging, and focused test commands."
read_when:
  - When deciding which validation command to run for a docs, backend, sidecar, frontend, IPC, tool, provider, packaging, or config change.
  - When reporting validation in a final summary or PR description.
title: "Validation Commands"
---

# Validation Commands

Pick validation based on the owner boundary you changed. WindieOS does not currently have one mandatory all-in-one check that replaces focused tests.

## Baseline

| Scope | Command |
| --- | --- |
| docs front matter and read hints | `./bin/docs-list` or `node scripts/docs-list.js` |
| whitespace in changed files | `git diff --check` |
| backend tests | `./scripts/test-backend` |
| sidecar tests | `./scripts/test-sidecar` |
| backend + sidecar + frontend CI when dependencies exist | `./scripts/test` |
| frontend Jest CI | `cd frontend && npm run test:ci` |
| frontend lint | `cd frontend && npm run lint` |
| frontend typecheck | `cd frontend && npm run typecheck` |

## Focused Commands

| Change | Start with |
| --- | --- |
| backend route/schema/handler | `./scripts/python-in-env backend python -m pytest tests/backend/<focused_test>.py -q` |
| backend agent/session/history/tool loop | focused backend pytest for the touched module, then `./scripts/test-backend` when shared state changes |
| provider/model catalog | focused backend provider/model tests plus docs-list |
| sidecar JSON-RPC/tool | `./scripts/python-in-env sidecar python -m pytest tests/sidecar/<focused_test>.py -q` |
| frontend renderer/hook/store | `cd frontend && npm run test:ci -- <test_file>` |
| Electron main/IPC | focused Jest/CJS test under `tests/frontend`, then `cd frontend && npm run test:ci` if shared |
| tool schema parity | backend schema tests plus sidecar parity tests |
| docs-only | `./bin/docs-list`, focused markdown link check, `git diff --check` |
| packaging | target OS package command plus smoke helper where available |

## Environment Launcher

Use `./scripts/python-in-env` instead of manually activating conda:

```sh
./scripts/python-in-env backend python -m pytest tests/backend/test_session_manager.py -q
./scripts/python-in-env sidecar python -m pytest tests/sidecar/test_tool_registry.py -q
./scripts/python-in-env frontend npm --prefix frontend run test:ci -- ToolRunnerHook.events.test.ts
```

Default env names:

- backend: `jarvis` or `WINDIE_BACKEND_ENV`
- frontend/sidecar: `frontend_jarvis` or `WINDIE_FRONTEND_ENV`

If conda or the named env is unavailable, the launcher prints a warning and runs in the current shell environment.

## Reporting

When handing work back, report:

- commands run,
- pass/fail result,
- skipped validation and why,
- residual risk if only docs checks were appropriate.

## Related Docs

- [Development Validation Matrix](../development/validation_matrix.md)
- [Debug Test Selection](../debug/test_selection.md)
- [Command Matrix](command_matrix.md)
