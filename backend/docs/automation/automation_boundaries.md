---
summary: "Boundary guide for automation tools, separating current WindieOS VM run orchestration from future cron, webhook, durable queue, and scheduler automation work."
read_when:
  - When planning automation tools or deciding whether a change belongs in `/api/runs/*`, the desktop query path, operations config, or planning docs.
  - When documenting future automation without implying that WindieOS already has cron, webhook, or durable scheduled jobs.
title: "Automation Boundaries"
---

# Automation Boundaries

WindieOS has a real run orchestration surface today, but it is not a complete automation platform. This page keeps current code, operational knobs, and future planning separate.

## Current Implementation

Current VM run orchestration is:

- HTTP controlled through `/api/runs/*`
- backed by one in-memory `VmRunControlService` stored on FastAPI app state
- scoped by `workspace_id`
- limited by `WINDIE_VM_MAX_ACTIVE_RUNS_PER_WORKSPACE`
- consumed by an Electron main-process worker loop
- dispatched through the normal backend websocket query path
- observable through a per-run event timeline

For the detailed owner map and validation matrix for current run-control edits, read [VM Run Control Change Workflow](vm_run_control_change_workflow.md) before changing code.

It is appropriate for:

- hosted dashboard demos
- one-worker-per-VM style execution
- remote operator stop controls
- run timeline inspection
- passing artifact refs into an automated query

It is not appropriate for:

- durable jobs
- scheduled recurring tasks
- webhook fan-in
- retry semantics
- distributed worker leasing across backend instances
- execution when no Electron worker is connected

## Boundary Decision Matrix

| Requested change | Put it here | Do not put it here |
| --- | --- | --- |
| Add a field to run creation or run view | `backend/src/api/routes/runs/models.py`, route/service docs | renderer chat state |
| Change assignment or active-run cap behavior | `VmRunControlService` and support helpers | Electron worker only |
| Add a worker runtime env var | `frontend/src/main/app/vm_worker_runtime.cjs`, operations docs | backend `AppConfig` unless backend enforces it |
| Add a dashboard-visible event in the run timeline | worker event relay or service event append path | backend history storage |
| Add cron scheduling | planning docs first, then a new scheduler/service if implemented | existing VM worker heartbeat loop |
| Add webhook ingestion | planning/API design first | `POST /api/runs/` without an auth/source model |
| Persist runs | new storage/repository layer plus migration/testing plan | current in-memory service maps |

## Current vs Future Vocabulary

Use precise language:

- Say "VM run" for a current `/api/runs/*` run.
- Say "worker heartbeat" for current assignment polling.
- Say "run timeline" for current event inspection.
- Say "control command" for current pause/resume/stop/control-mode records.
- Say "planned scheduler" or "future automation" for cron/webhook/durable task ideas.

Avoid saying WindieOS has "cron", "webhooks", "jobs", or "automations" unless the doc clearly marks them as future work.

## Where Future Automation Would Need New Code

Durable scheduler:

- backend storage/repository for jobs and run attempts
- scheduler loop or external queue consumer
- retry/backoff policy
- per-user/workspace authorization model
- API models separate from current `CreateRunRequest`
- migration tests and multi-process behavior tests

Webhook ingestion:

- route family separate from `/api/runs/*`
- signing/verification model
- event-to-run mapping policy
- replay/deduplication storage
- failure audit log

Worker leasing:

- durable worker registry or lease table
- heartbeat expiry semantics
- assignment ownership expiration/reclaim behavior
- multi-backend-instance coordination

None of those are present in the current code. Keep plans in `docs/planning/` until implementation starts.

## Operational Knobs

Current knobs are documented in [Runtime Configuration Matrix](../operations/runtime_configuration_matrix.md):

- `WINDIE_VM_MODE`
- `WINDIE_VM_WORKER_MODE`
- `WINDIE_VM_WORKSPACE_ID`
- `WINDIE_VM_WORKER_ID`
- `WINDIE_VM_ID`
- `WINDIE_VM_AGENT_ID`
- `WINDIE_VM_WORKER_HEARTBEAT_MS`
- `WINDIE_RUNS_API_KEY`
- `WINDIE_VM_RUNS_API_KEY`
- `WINDIE_VM_MAX_ACTIVE_RUNS_PER_WORKSPACE`

When adding or changing any of these, update:

- [VM Run Control Change Workflow](vm_run_control_change_workflow.md)
- [VM Runs and Workers](vm_runs_and_workers.md)
- [Runs API Runbook](runs_api_runbook.md)
- [Runtime Configuration Matrix](../operations/runtime_configuration_matrix.md)
- [Operational Troubleshooting](../operations/operational_troubleshooting.md)
- focused backend and renderer tests

## Validation Expectations

For current VM runs:

- backend route/service tests must cover model validation, cap behavior, status transitions, event sequencing, and command delivery.
- frontend worker tests must cover heartbeat auth headers, dispatch, event relay, and stop controls.
- docs must explicitly identify whether behavior is current or planned.

For future automation features:

- add design docs before broad implementation.
- define persistence and auth boundaries before adding public routes.
- keep scheduler/webhook docs separate from current VM worker docs unless they reuse `/api/runs/*` intentionally.
