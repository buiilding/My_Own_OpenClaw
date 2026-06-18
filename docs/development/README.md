---
summary: "Development hub for WindieOS contributor workflow, environment setup, validation, tool development, and backend/renderer/sidecar change routing."
read_when:
  - When starting implementation work in WindieOS.
  - When deciding which development workflow, tests, docs, and validation commands apply to a change.
title: "Development Hub"
---

# Development Hub

Use this hub when you are about to edit code. It routes a change to the right subsystem, docs, commands, and validation target.

## Start Here

- [Agent Development Workflow](agent_development_workflow.md)
- [Agent Runtime Ownership and Change Routing](agent_runtime_ownership_and_change_routing.md)
- [Agent Architecture Reference](agent_architecture_reference.md)
- [Validation Matrix](validation_matrix.md)
- [Docs Update Workflow](docs_update_workflow.md)
- [Review and Risk Checklist](review_and_risk_checklist.md)
- [Test Failure Triage](test_failure_triage.md)
- [Commit and Changelog Workflow](commit_and_changelog_workflow.md)
- [Developer Guide](developer_guide.md)
- [Environment Setup](environment_setup.md)
- [Testing Guide](testing.md)
- [Contributing](contributing.md)
- [Tool Development](tool_development.md)

## Runtime Boundaries

| Boundary | Owns | Start docs | Typical validation |
| --- | --- | --- | --- |
| Backend | FastAPI routes, websocket messages, agent loop, LLM providers, model-facing tools, inference routes, artifacts, memory APIs | [Backend Hub](../backend/README.md), [Agent Development Workflow](agent_development_workflow.md) | `bin/windie test backend` or focused `./scripts/python-in-env backend python -m pytest tests/backend/...` |
| Electron main | windows, overlays, IPC handlers, SDK-runtime adapter, local-runtime host/status context, permissions, packaged runtime env | [Frontend Main Hub](../frontend/main/README.md), [Frontend Runtime Hub](../frontend/runtime/README.md) | focused frontend Jest tests under `tests/frontend`, `bin/windie test frontend` |
| Renderer | React UI, chat/dashboard/settings/memory/model surfaces, transcript queue, projected tool state, audio playback | [Frontend Renderer Hub](../frontend/renderer/README.md) | focused frontend Jest tests, `cd frontend && npm run lint` for touched UI code |
| Sidecar | local JSON-RPC, computer/filesystem/system/browser tools, local memory, wakeword services, backend HTTP clients | [Frontend Sidecar Hub](../frontend/sidecar/README.md) | `bin/windie test sidecar` or focused `./scripts/python-in-env sidecar python -m pytest tests/sidecar/...` |
| Docs | agent routing maps, domain hubs, implementation references, runbooks | [Documentation Hub](../getting-started/docs_hub.md) | `bin/windie docs list` and link checks for touched docs |
| Packaging/operations | Electron Builder, bundled Python runtime, local reinstall helpers, release workflow, hosted backend ops | [Operations Hub](../operations/README.md) | target OS package/smoke helper plus `bin/windie docs list` |

## Current Script Surface

Repo-root scripts:

- `bin/windie docs list` or `bin/windie docs list`
- Windows PowerShell: `scripts\python-in-env.cmd <backend|sidecar|frontend> <cmd...>`
- Unix-like shells: `./scripts/python-in-env.sh <backend|sidecar|frontend> <cmd...>`
- `bin/windie test all`
- `bin/windie test backend`
- `bin/windie test sidecar`
- `bin/windie start backend`
- `bin/windie start frontend`
- `bin/windie start desktop`
- `./scripts/build-sidecar-runtime.sh`
- `./scripts/committer "<subject>" --body "<body>" -- <files...>`

Frontend scripts:

- `cd frontend && npm run test`
- `bin/windie test frontend`
- `cd frontend && npm run typecheck`
- `cd frontend && npm run lint`
- `cd frontend && npm run lint:audit`
- `cd frontend && npm run audit:jscpd`
- `cd frontend && npm run audit:knip`
- `cd frontend && bin/windie package mac|package:win|package:linux`

There is no current repo-root `scripts/check` or `scripts/check-loc.py` in this checkout. Use [Validation Matrix](validation_matrix.md) to compose the right gate.

## Development Rules of Thumb

1. Run `bin/windie docs list` before editing and read the relevant `read_when` docs.
2. Identify the owner boundary before changing consumers.
3. Keep backend model-facing schemas and sidecar runtime argument handling aligned.
4. Add tests at the boundary that failed or changed.
5. Update docs and changelog with behavior/API/contract changes.
6. Commit completed work with `./scripts/committer`, including the required body sections for what changed, owning layer, previous behavior, new path, validation, and migration/security notes.

## Execution Workflows

- Use [Docs Update Workflow](docs_update_workflow.md) for docs-only changes and behavior changes that need docs updates.
- Use [Review and Risk Checklist](review_and_risk_checklist.md) before committing cross-runtime or security-sensitive work.
- Use [Test Failure Triage](test_failure_triage.md) when a focused command fails.
- Use [Commit and Changelog Workflow](commit_and_changelog_workflow.md) for commit scope, changelog entries, and validation reporting.
