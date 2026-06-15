---
summary: "Realtime ledger for the 2026-06-15 broad compatibility, legacy, old, and unused code deletion goal."
read_when:
  - When continuing or reviewing the 2026-06-15 codebase compatibility deletion goal.
  - When checking which cleanup slices were implemented, validated, committed, or intentionally deferred.
title: "Codebase Compatibility Deletion Report"
---

# Codebase Compatibility Deletion Report

Plan: [Codebase Compatibility Deletion Plan](2026-06-15-codebase-compatibility-deletion-plan.md)

Date: 2026-06-15

## Baseline

- Branch: `main`.
- Goal: remove compatibility, legacy, old, and unused code across the codebase.
- Existing active goal was already present for this thread.
- Prior cleanup context read:
  - `docs/development/agent_runtime_ownership_and_change_routing.md`
  - `pending/compaction_safe_plan_execution.md`
  - `docs/refactors/remaining_architecture_refactor_plan.md`
  - `docs/refactors/remaining_architecture_refactor_realtime_report.md`
  - `docs/plans/2026-06-14-25-commit-cleanup-campaign-plan.md`
  - `docs/plans/2026-06-14-25-commit-cleanup-campaign-report.md`
- `bin/windie docs list` passed during orientation.
- `git status --short` returned clean during orientation.

## Candidate Ledger

| ID | Owner | Suspected stale path | Evidence | Concept | Status |
| --- | --- | --- | --- | --- | --- |
| CD-001 | Frontend logging | Duplicate `frontend` branch in `resolveLayerLogFile(...)` | `envKeyForLayer('frontend')` already resolves `WINDIE_FRONTEND_LOG_FILE`, making the later `legacyConfigured` branch unreachable | Delete the duplicate branch; keep the current layer-owned env override | implemented |
| CD-002 | Backend API events | Live `trace_event` stream event spelling in VM run control and transcription gateway | Outgoing trace event schema and `StreamingEventType.TRACE_EVENT` use `trace-event`; production grep found only these underscore emitters | Emit canonical `trace-event`, update focused tests, remove the underscore trace alias, and fix the transcription route dependency needed to validate the websocket path | implemented |
| CD-003 | Backend container | Handler registry source compatibility breadcrumb | `api_container.py` only retained a commented manual registration example for tests migrating away from manual registration; active docs now describe declarative bindings | Delete the stale comment so the current registry path is the only in-code guidance | implemented |

## Commit Ledger

No commits yet for this plan.

## Validation Log

- `bin/windie docs list`: passed during orientation.

Pending validation for CD-001:

- `bin/windie test frontend -- LayerLogSink ElectronLauncher WindieCli`
- `bin/windie docs list`
- `git diff --check`

CD-001 validation:

- `bin/windie test frontend -- LayerLogSink ElectronLauncher WindieCli`: passed,
  4 suites and 44 tests.
- `bin/windie docs list`: passed.
- `git diff --check`: passed.

CD-003 validation:

- `./scripts/python-in-env backend pytest tests/backend/test_api_container_source.py -q`:
  passed, 12 tests.
- targeted `rg "Source compatibility breadcrumb|manual registration" backend/src/core/container/api_container.py`:
  no matches.
- `bin/windie docs list`: passed.
- `git diff --check`: passed.

CD-002 validation:

- `./scripts/python-in-env backend pytest tests/backend/test_run_control_routes.py::test_list_run_events_filters_by_after_seq tests/backend/test_transcription_gateway.py -q`:
  passed, 5 tests.
- `./scripts/python-in-env backend pytest tests/backend/test_query_event_extraction.py tests/backend/test_formatter_specs_contract.py -q`:
  passed, 12 tests.
- targeted `rg "trace_event"` in touched production surfaces: no underscore
  event-type literals remain, only helper/test variable names.
- `bin/windie docs list`: passed.
- `git diff --check`: passed.

## Inspection Notes

- The prior 25-commit campaign is complete and already removed many stale docs,
  SDK aliases, backend package exports, browser aliases, and rehydrate
  compatibility paths.
- The remaining architecture refactor plan shows one unchecked owner-split item:
  local backend bridge split into RPC mapping, host context, and status
  ownership. This is architecture debt, not automatically unused code.
- Current broad `fallback` hits are noisy. Each candidate must be classified
  before deletion because many are live resilience paths.
- CD-001 has no migration impact: the removed branch checked the same
  `WINDIE_FRONTEND_LOG_FILE` variable that the generic layer resolver already
  handles for the `frontend` layer.
- CD-002 migration note: VM run control events are in-memory service events and
  transcription gateway trace events are websocket stream messages, so no
  database migration is required for this slice. Clients relying on the
  underscore stream event spelling must use the canonical `trace-event` type.
- CD-002 validation exposed that the transcription websocket route's
  `SessionManagerDep` alias was being interpreted as a plain query parameter.
  The route now uses the explicit FastAPI dependency, and the lightweight route
  import shim returns a minimal session object for tests that import route
  packages under the shim.
- CD-003 has no runtime migration impact: it removes only a stale source
  comment after declarative handler bindings became the active registry path.
