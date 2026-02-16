---
summary: "Phase 0 baseline run log for WindieOS browser_control before Browser Use adapter migration."
read_when:
  - Validating pre-migration browser-control behavior.
  - Comparing Browser Use adapter results against current baseline.
---

# Browser Use Port Phase 0 Baseline Run Log

Run date (UTC): **2026-02-16T22:46:53Z**  
Baseline commit: `564391b`

## Environment Snapshot

- Backend test runtime: `Python 3.11.14` (`jarvis`)
- Sidecar test runtime: `Python 3.11.0` (`frontend_jarvis`/sidecar path)
- Node runtime on host: `v25.5.0`

## Baseline Commands

1. Sidecar browser flow baseline:
```bash
./scripts/python-in-env sidecar python -m pytest \
  tests/sidecar/tools/test_browser_tool.py \
  tests/sidecar/tools/test_browser_controller.py -q
```
Result: pass (`84` tests collected, all passed), wall time `2.68s`.

2. Backend schema/contract baseline:
```bash
./scripts/python-in-env backend python -m pytest \
  tests/backend/test_browser_remote_tool.py \
  tests/backend/test_remote_tool_contract.py \
  tests/backend/test_tool_policy.py -q
```
Result: pass (`21` tests collected, all passed), wall time `2.66s`.

3. Collection verification (counts):
```bash
./scripts/python-in-env sidecar python -m pytest \
  tests/sidecar/tools/test_browser_tool.py \
  tests/sidecar/tools/test_browser_controller.py --collect-only

./scripts/python-in-env backend python -m pytest \
  tests/backend/test_browser_remote_tool.py \
  tests/backend/test_remote_tool_contract.py \
  tests/backend/test_tool_policy.py --collect-only
```
Result: `84` sidecar tests collected, `21` backend tests collected.

## Covered Critical Flows

| Critical flow | Current evidence in baseline run |
| --- | --- |
| Connect (`connect`, modes, errors) | `tests/sidecar/tools/test_browser_tool.py::TestConnectAction::*`, `tests/sidecar/tools/test_browser_controller.py::TestBrowserControllerBasics::*` |
| Navigate/open/tab flow | `tests/sidecar/tools/test_browser_tool.py::TestNavigateAction::*`, `tests/sidecar/tools/test_browser_tool.py::TestCompatibilityActions::test_open_action`, `tests/sidecar/tools/test_browser_tool.py::TestSwitchTabAction::*`, `tests/sidecar/tools/test_browser_tool.py::TestGetTabsAction::*` |
| Snapshot/extract core behavior | `tests/sidecar/tools/test_browser_tool.py::TestSnapshotAction::*`, `tests/sidecar/tools/test_browser_tool.py::TestExtractAction::*`, `tests/sidecar/tools/test_browser_controller.py::TestBrowserControllerSnapshot::*` |
| Element interaction (`click`, `type`, `press`, `scroll`) | `tests/sidecar/tools/test_browser_tool.py::TestClickAction::*`, `tests/sidecar/tools/test_browser_tool.py::TestTypeAction::*`, `tests/sidecar/tools/test_browser_controller.py::TestBrowserControllerActions::*` |
| Screenshot/evaluate/wait | `tests/sidecar/tools/test_browser_tool.py::TestScreenshotAction::*`, `tests/sidecar/tools/test_browser_controller.py::TestBrowserControllerActions::test_evaluate`, `tests/sidecar/tools/test_browser_controller.py::TestBrowserControllerActions::test_wait_for_load` |
| Advanced compatibility probes (`console`, `errors`, `requests`, `dialog`, `trace_start`, `act`) | `tests/sidecar/tools/test_browser_tool.py::TestCompatibilityActions::*` |
| Backend schema and remote-contract integrity | `tests/backend/test_browser_remote_tool.py::*`, `tests/backend/test_remote_tool_contract.py::test_backend_remote_tools_match_frontend_exposed_tools` |

## Known Baseline Gaps (Not Covered by This Run)

These actions are currently not covered by the executed baseline suites and require explicit Phase 2+ adapter tests:

- `profiles`
- `trace_stop`
- `pdf`
- `upload`
- `cookies`, `cookies_set`, `cookies_clear`
- `storage_get`, `storage_set`, `storage_clear`
- `set_offline`, `set_headers`, `set_credentials`, `set_geolocation`, `set_media`, `set_timezone`, `set_locale`, `set_device`

## Warnings Observed

- Backend test run emitted a Pydantic warning about field name namespace conflict (`model_name` vs protected namespace `model_`).  
  No test failures were associated with this warning in the baseline run.

