---
summary: "Automation hub for WindieOS automation tools and current VM run orchestration: worker polling, run-control APIs, hosted run timelines, and future scheduling boundaries."
read_when:
  - When changing `/api/runs/*`, VM worker mode, hosted dashboard run orchestration, or run-control behavior.
  - When deciding whether automation tools belong in current VM runs, a future scheduler, the desktop query path, or operations docs.
title: "Automation Hub"
---

# Automation Hub

WindieOS does not currently ship a durable cron/webhook automation engine. The automation-like surface that exists today is the hosted VM run control plane: a dashboard or external caller creates a run, a VM worker polls for assignments, Electron dispatches the run through the normal websocket query path, and the worker relays stream events back into `/api/runs/*`.

Use this hub when an agent needs to work on hosted run orchestration without confusing it with the ordinary desktop chat path.

## Current Surfaces

| Surface | What it owns | Code roots | Start docs |
| --- | --- | --- | --- |
| Runs HTTP API | Create/get/control/stop runs, poll events, receive worker stream events | `backend/src/api/routes/runs/*` | [VM Run Control Change Workflow](vm_run_control_change_workflow.md), [Runs API Runbook](runs_api_runbook.md), [Runs Route and VM Control Service Reference](../backend/api/runs_route_and_vm_control_service_reference.md) |
| Run registry service | In-memory run map, worker map, workspace queue, active-run cap, status transitions, pending controls | `backend/src/services/vm_run_control.py`, `backend/src/services/vm_run_control_support/*` | [VM Run Control Change Workflow](vm_run_control_change_workflow.md), [VM Runs and Workers](vm_runs_and_workers.md), [VM Control Service Runtime Reference](../backend/services/vm_run_control_service_runtime_reference.md) |
| Electron VM worker loop | Heartbeat polling, assignment dispatch, event relay, stop-control application | `frontend/src/main/app/vm_worker_runtime.cjs`, `frontend/src/main/app/runtime_mode.cjs`, `frontend/src/main/index.cjs` | [VM Run Control Change Workflow](vm_run_control_change_workflow.md), [VM Runs and Workers](vm_runs_and_workers.md), [Frontend Runtime Surface](../frontend/runtime/frontend_runtime_surface_main_renderer_sidecar_and_vm_worker_reference.md) |
| Operations config | VM worker env vars, runs API key, active-run cap, endpoint selection | `frontend/src/main/app/backend_endpoints.cjs`, backend env, release/runtime env | [Automation Boundaries](automation_boundaries.md), [Runtime Configuration Matrix](../operations/runtime_configuration_matrix.md) |

## What Counts as Automation Today

WindieOS currently supports:

- creating a run for a workspace and optional agent identity
- attaching artifact references to that run
- assigning one queued run at a time to a polling worker
- dispatching the run through the existing backend websocket query path
- streaming query/tool/progress/error/completion events back into a run timeline
- sending operator controls such as `stop`, `pause`, `resume`, and `set-control-mode`
- stopping all active runs globally or inside one workspace

WindieOS currently does not support:

- cron schedules
- webhooks
- persisted run storage
- durable retry queues
- multi-instance scheduler coordination
- a separate automation DSL
- background execution without an Electron worker connected to the backend

Those future surfaces should be planned under `docs/planning/` until implemented.

## Agent Change Paths

### Add or Change a Runs Endpoint

Read:

- [VM Run Control Change Workflow](vm_run_control_change_workflow.md)
- [Runs API Runbook](runs_api_runbook.md)
- [Runs Route and VM Control Service Reference](../backend/api/runs_route_and_vm_control_service_reference.md)
- [HTTP and WebSocket API Surface](../reference/http_api_surface.md)

Likely code:

- `backend/src/api/routes/runs/router.py`
- `backend/src/api/routes/runs/models.py`
- `backend/src/api/routes/runs/route_helpers.py`
- `backend/src/api/routes/runs/response_builders.py`
- `backend/src/api/routes/runs/support.py`

Validate:

- backend runs route tests
- API reference examples
- `<windie> docs list`

### Change Run Assignment, Status, or Controls

Read:

- [VM Run Control Change Workflow](vm_run_control_change_workflow.md)
- [VM Runs and Workers](vm_runs_and_workers.md)
- [VM Control Service Runtime Reference](../backend/services/vm_run_control_service_runtime_reference.md)
- focused helper docs under `docs/backend/services/`

Likely code:

- `backend/src/services/vm_run_control.py`
- `backend/src/services/vm_run_control_support/vm_run_control_assignment.py`
- `backend/src/services/vm_run_control_support/vm_run_control_transitions.py`
- `backend/src/services/vm_run_control_support/vm_run_control_pending_controls.py`
- `backend/src/services/vm_run_control_support/vm_run_control_bulk_stop.py`

Validate:

- `tests/backend/test_run_control_routes.py`
- `tests/backend/test_vm_run_control_assignment.py`
- `tests/backend/test_vm_run_control_pending_controls.py`
- any helper-specific backend tests for the touched module

### Change the Electron Worker Loop

Read:

- [VM Run Control Change Workflow](vm_run_control_change_workflow.md)
- [VM Runs and Workers](vm_runs_and_workers.md)
- [Frontend Runtime Surface](../frontend/runtime/frontend_runtime_surface_main_renderer_sidecar_and_vm_worker_reference.md)
- [Runtime Configuration Matrix](../operations/runtime_configuration_matrix.md)

Likely code:

- `frontend/src/main/app/vm_worker_runtime.cjs`
- `frontend/src/main/app/runtime_mode.cjs`
- `frontend/src/main/index.cjs`
- websocket send/observer helpers in `frontend/src/main/ipc.cjs`

Validate:

- `tests/frontend/VmWorkerRuntime.test.cjs`
- `tests/frontend/RuntimeMode.test.cjs`
- targeted websocket bridge tests if dispatch or stop controls change

## Runtime Boundaries

The runs API is a control plane. It should not become the normal desktop chat transport.

- Normal desktop queries use `/ws` and renderer/main IPC.
- VM runs use `/api/runs/*` only for assignment, control, and run timeline inspection.
- The VM worker dispatches assigned runs through the same `sendAutomatedQuery(...)` path used by the desktop main-process websocket bridge.
- Run events are copies of backend stream events for dashboard/automation visibility, not a replacement for backend history or transcript storage.

## Related Docs

- [VM Runs and Workers](vm_runs_and_workers.md)
- [VM Run Control Change Workflow](vm_run_control_change_workflow.md)
- [Runs API Runbook](runs_api_runbook.md)
- [Automation Boundaries](automation_boundaries.md)
- [Operations Hub](../operations/README.md)
- [HTTP and WebSocket API Surface](../reference/http_api_surface.md)
- [VM Multi-Agent Plan](../planning/windieos_vm_multi_agent_plan.md)
