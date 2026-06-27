---
summary: "Validation command matrix for WindieOS backend, frontend, local-runtime Python, tools, docs, packaging, runtime config, and operations changes."
read_when:
  - When deciding which tests, lint, docs checks, or packaging smoke commands to run for a change.
  - When replacing stale all-in-one check assumptions with current WindieOS script entrypoints.
title: "Validation Matrix"
---

# Validation Matrix

WindieOS does not currently have a single repo-root `scripts/check` gate in this checkout. Compose validation from the changed boundary.

## Baseline Commands

| Scope | Command |
| --- | --- |
| docs listing/front matter | `<windie> docs list` |
| all Python backend tests | `<windie> test backend` |
| all local-runtime Python tests | `<windie> test local-runtime` |
| backend + local-runtime Python + frontend CI tests when `frontend/node_modules` exists | `<windie> test all` |
| frontend Jest CI | `<windie> test frontend` |
| frontend typecheck | `cd frontend && npm run typecheck` |
| frontend lint | `cd frontend && npm run lint` |
| frontend React/deprecation audit | `cd frontend && npm run lint:audit` |
| frontend and backend duplication audit | `cd frontend && npm run audit:jscpd` |
| frontend dead-code/dependency audit | `cd frontend && npm run audit:knip` |
| whitespace check | `git diff --check` |

## Focused Commands

| Change | First command | Widen when |
| --- | --- | --- |
| backend route/handler/schema | `./scripts/python-in-env backend python -m pytest tests/backend/<focused_test>.py` | run `<windie> test backend` for shared API or session behavior |
| backend agent loop/history/tool processing | focused backend test under `tests/backend` | run `<windie> test backend` for loop or history contract changes |
| LLM provider/model catalog | focused provider/model tests under `tests/backend` | run backend provider/model suite and `<windie> docs list` |
| local-runtime tool implementation | `./scripts/python-in-env local-runtime python -m pytest tests/sidecar/<focused_test>.py` | run `<windie> test local-runtime` for registry or shared result changes |
| frontend renderer state/UI | `<windie> test frontend -- <test_file>` | run `cd frontend && npm run lint && <windie> test frontend` for broader UI changes |
| Electron main/IPC | focused `tests/frontend/*.test.cjs` or related Jest test | run `<windie> test frontend` for shared bridge changes |
| transcript/replay | focused transcript tests | include backend rehydrate/history tests when backend replay shape changes |
| tool schema/result contract | backend schema/policy tests plus SDK runtime/router and local-runtime executable parity tests | add renderer projection tests when visible UI rows change |
| browser runtime | backend browser schema tests plus local-runtime Python browser tests | include browser UI/session tests when renderer controls change |
| docs-only | `<windie> docs list`, focused link check, `git diff --check` | no code tests needed unless docs generator changed |
| packaging/reinstall | `<windie> docs list` plus target OS package/reinstall command | run matching `scripts/ci/smoke-*` helper before release |
| runtime config/env vars | focused backend, renderer, and local-runtime config tests | include docs updates for Runtime Configuration Matrix (private backend docs) |

## Common Focused Test Paths

Backend:

- `tests/backend/test_tool_policy.py`
- `tests/backend/test_tool_registry_schema.py`
- `tests/backend/test_tool_result_receiver.py`
- `tests/backend/test_tool_result_storage.py`
- `tests/backend/test_web_search_tool.py`
- `tests/backend/test_browser_remote_tool.py`
- `tests/backend/test_rehydrate_execution_service.py`

Local runtime / local-runtime Python implementation:

- `tests/sidecar/test_tool_registry.py`
- `tests/sidecar/test_shared_tool_schema_parity.py`
- `tests/sidecar/test_shell_process_tool.py`
- `tests/sidecar/test_read_file_tool.py`
- `tests/sidecar/test_replace_tool.py`
- `tests/sidecar/test_system_tools.py`
- `tests/sidecar/tools/test_browser_tool.py`
- `tests/sidecar/tools/test_browser_schemas.py`

Frontend:

- `tests/frontend/AgentSdkClient.test.ts`
- `tests/frontend/AgentSdkConversationRuntime.test.ts`
- `tests/frontend/AgentSdkConversationRuntime.test.ts`
- `tests/frontend/TranscriptSessionState.test.ts`
- `tests/frontend/LocalRuntimeBridge.lifecycle.test.cjs`
- `tests/frontend/WakewordBridge.test.cjs`
- `tests/frontend/ModelsSection.test.jsx`
- `tests/frontend/DesktopModelCardPresentationRuntime.test.js`
- `tests/frontend/ModelSelectionUtils.test.js`

## Release and Packaging Validation

Use the target OS:

- macOS package: `<windie> package mac`
- Windows package: `<windie> package win`
- Linux package: `<windie> package linux`

Local reinstall helpers:

- macOS: `<windie> reinstall mac`
- Windows: `<windie> reinstall win`
- Linux: `<windie> reinstall linux`

CI smoke helpers:

- `scripts/ci/smoke-macos-packages.sh`
- `scripts/ci/smoke-windows-packages.ps1`
- `scripts/ci/smoke-linux-packages.sh`

Do not run cross-OS packaging commands expecting release-grade results. Bundled Python runtimes must be built on their target OS.

## Reporting Validation

In final summaries or PR descriptions, report:

- command run
- pass/fail
- skipped commands and why
- any residual risk, especially if only docs checks were run for docs-only changes
