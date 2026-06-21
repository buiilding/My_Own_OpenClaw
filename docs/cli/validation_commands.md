---
summary: "Validation command guide for choosing WindieOS docs, backend, local-runtime Python, frontend, lint, typecheck, packaging, and focused test commands."
read_when:
  - When deciding which validation command to run for a docs, backend, local-runtime Python, frontend, IPC, tool, provider, packaging, or config change.
  - When reporting validation in a final summary or PR description.
title: "Validation Commands"
---

# Validation Commands

Pick validation based on the owner boundary you changed. WindieOS does not currently have one mandatory all-in-one check that replaces focused tests.

Commands below use `<windie>` for the active platform shim: `bin\windie.cmd` on
Windows PowerShell and `bin/windie.sh` on Unix-like shells. Focused Python
commands use `<python-in-env>` for `scripts\python-in-env.cmd` on Windows
PowerShell and `./scripts/python-in-env.sh` on Unix-like shells.

## Baseline

| Scope | Command |
| --- | --- |
| docs front matter and read hints | `<windie> docs list` |
| whitespace in changed files | `git diff --check` |
| backend tests | `<windie> test backend` |
| local-runtime Python tests | `<windie> test local-runtime` (`<windie> test sidecar` remains a compatibility alias) |
| backend + local-runtime Python + frontend CI when dependencies exist | `<windie> test all` |
| frontend Jest CI | `<windie> test frontend` |
| frontend lint | `cd frontend && npm run lint` |
| frontend typecheck | `cd frontend && npm run typecheck` |

## Focused Commands

| Change | Start with |
| --- | --- |
| backend route/schema/handler | `<python-in-env> backend python -m pytest tests/backend/<focused_test>.py -q` |
| backend agent/session/history/tool loop | focused backend pytest for the touched module, then `<windie> test backend` when shared state changes |
| provider/model catalog | focused backend provider/model tests plus `<windie> docs list` |
| local-runtime JSON-RPC/tool | `<python-in-env> local-runtime python -m pytest tests/sidecar/<focused_test>.py -q` |
| frontend renderer/hook/store | `<windie> test frontend -- <test_file>` |
| Electron main/IPC | focused Jest/CJS test under `tests/frontend`, then `<windie> test frontend` if shared |
| tool schema parity | backend schema tests plus local-runtime executable parity tests |
| docs-only | `<windie> docs list`, focused markdown link check, `git diff --check` |
| packaging | target OS package command plus smoke helper where available |

## Environment Launcher

Use `<python-in-env>` instead of manually activating conda:

```sh
./scripts/python-in-env.sh backend python -m pytest tests/backend/test_session_manager.py -q
./scripts/python-in-env.sh local-runtime python -m pytest tests/sidecar/test_tool_registry.py -q
<windie> test frontend -- AgentSdkConversationRuntime LocalRuntimeExecuteToolRuntime ToolOutputMessageState
```

```powershell
scripts\python-in-env.cmd backend python -m pytest tests/backend/test_session_manager.py -q
scripts\python-in-env.cmd local-runtime python -m pytest tests/sidecar/test_tool_registry.py -q
<windie> test frontend -- AgentSdkConversationRuntime LocalRuntimeExecuteToolRuntime ToolOutputMessageState
```

Default env names:

- backend: `jarvis` or `WINDIE_BACKEND_ENV`
- frontend/local-runtime implementation: `frontend_jarvis` or `WINDIE_FRONTEND_ENV`

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
