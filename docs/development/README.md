---
summary: "Development hub for WindieOS contributor workflow, environment setup, validation, tool development, and backend/frontend/sidecar change routing."
read_when:
  - When starting implementation work in WindieOS.
  - When deciding which development workflow, tests, docs, and validation commands apply to a change.
title: "Development Hub"
---

# Development Hub

Use this hub when you are about to edit code. It routes a change to the right subsystem, docs, commands, and validation target.

## Start Here

- [Agent Development Workflow](agent_development_workflow.md)
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
- [Dev Tool Selection](dev_tool_selection.md)

## Runtime Boundaries

| Boundary | Owns | Start docs | Typical validation |
| --- | --- | --- | --- |
| Backend | FastAPI routes, websocket messages, agent loop, LLM providers, model-facing tools, inference routes, artifacts, memory APIs | [Backend Hub](../backend/README.md), [Agent Development Workflow](agent_development_workflow.md) | `./scripts/test-backend` or focused `./scripts/python-in-env backend python -m pytest tests/backend/...` |
| Electron main | windows, overlays, IPC handlers, SDK-runtime adapter, sidecar process lifecycle, permissions, packaged runtime env | [Frontend Main Hub](../frontend/main/README.md), [Frontend Runtime Hub](../frontend/runtime/README.md) | focused frontend Jest tests under `tests/frontend`, `cd frontend && npm run test:ci` |
| Renderer | React UI, chat/dashboard/settings/memory/model surfaces, transcript queue, tool runner, audio playback | [Frontend Renderer Hub](../frontend/renderer/README.md) | focused frontend Jest tests, `cd frontend && npm run lint` for touched UI code |
| Sidecar | local JSON-RPC, computer/filesystem/system/browser tools, local memory, wakeword services, backend HTTP clients | [Frontend Sidecar Hub](../frontend/sidecar/README.md) | `./scripts/test-sidecar` or focused `./scripts/python-in-env sidecar python -m pytest tests/sidecar/...` |
| Docs | agent routing maps, domain hubs, implementation references, runbooks | [Documentation Hub](../getting-started/docs_hub.md) | `./bin/docs-list` and link checks for touched docs |
| Packaging/operations | Electron Builder, bundled Python runtime, local reinstall helpers, release workflow, hosted backend ops | [Operations Hub](../operations/README.md) | target OS package/smoke helper plus docs-list |

## Current Script Surface

Repo-root scripts:

- `./bin/docs-list` or `node scripts/docs-list.js`
- `./scripts/python-in-env <backend|sidecar|frontend> <cmd...>`
- `./scripts/test`
- `./scripts/test-backend`
- `./scripts/test-sidecar`
- `./scripts/run-backend`
- `./scripts/run-frontend-dev`
- `./scripts/run-frontend-electron`
- `./scripts/build-sidecar-runtime`
- `./scripts/committer "<subject>" -- <files...>`

Frontend scripts:

- `cd frontend && npm run test`
- `cd frontend && npm run test:ci`
- `cd frontend && npm run typecheck`
- `cd frontend && npm run lint`
- `cd frontend && npm run lint:audit`
- `cd frontend && npm run audit:jscpd`
- `cd frontend && npm run audit:knip`
- `cd frontend && npm run package:mac|package:win|package:linux`

There is no current repo-root `scripts/check` or `scripts/check-loc.py` in this checkout. Use [Validation Matrix](validation_matrix.md) to compose the right gate.

## Development Rules of Thumb

1. Run `./bin/docs-list` before editing and read the relevant `read_when` docs.
2. Identify the owner boundary before changing consumers.
3. Keep backend model-facing schemas and sidecar runtime argument handling aligned.
4. Add tests at the boundary that failed or changed.
5. Update docs and changelog with behavior/API/contract changes.
6. Commit completed work with `./scripts/committer`.

## Execution Workflows

- Use [Docs Update Workflow](docs_update_workflow.md) for docs-only changes and behavior changes that need docs updates.
- Use [Review and Risk Checklist](review_and_risk_checklist.md) before committing cross-runtime or security-sensitive work.
- Use [Test Failure Triage](test_failure_triage.md) when a focused command fails.
- Use [Commit and Changelog Workflow](commit_and_changelog_workflow.md) for commit scope, changelog entries, and validation reporting.
